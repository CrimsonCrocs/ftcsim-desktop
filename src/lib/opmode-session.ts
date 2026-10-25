import {
  OPMODE_CHUNKED_TRANSPORT,
  OPMODE_TICK_PIPELINE_TIMEOUT_MILLIS,
  OPMODE_PROTOCOL_VERSION,
  OpModeTransportDecoder,
  encodeOpModeTransportFrames,
  type BuildJobProgress,
  type HotReloadResult,
  type DebugConfiguration,
  type DebugMessage,
  type DebugState,
  type ProgramSource,
  type BuildProgramMessage,
  type HandoffMessage,
  type LoadArtifactProgramMessage,
  type LoadProgramMessage,
  type GamepadSnapshot,
  type LoadArtifact,
  type MotorSensorFrame,
  type OpModeClientMessage,
  type OpModeServerMessage,
  type RobotSensorFrame,
  type SessionTicketResponse,
  type RepositorySnapshot,
  type SimulatedHardwareManifest,
  type SimulationFrame,
  type WorldRobotSensorFrame,
} from "@ftc-studio/opmode-protocol";
import { createRepositorySnapshot } from "./java-runner-client";
import { formatBuildDiagnostic } from "./build-diagnostics";

const LOAD_REQUEST_TIMEOUT_MILLIS = 15_000;
// Artifact loading includes uploading a dependency bundle (up to 64 MiB),
// unpacking it, and verifying its bytecode in a fresh isolated runtime.
// This pre-INIT transfer needs a separate budget from live motor-control ticks.
const LOAD_ARTIFACT_REQUEST_TIMEOUT_MILLIS = 120_000;
// Ten minutes for bounded Gradle resolution/compilation, plus shim compilation
// and artifact/completion packaging. This remains inside the 15-minute VM lease.
const BUILD_REQUEST_TIMEOUT_MILLIS = 12 * 60_000;
const LIFECYCLE_REQUEST_TIMEOUT_MILLIS = 3_500;
// Initial camera transfer and cold JVM startup need a pre-START budget.
// Live tick and STOP deadlines remain bounded independently.
const INITIALIZATION_REQUEST_TIMEOUT_MILLIS = 8_000;
const HANDOFF_REQUEST_TIMEOUT_MILLIS = 8_000;

export function opModeRequestTimeoutMilliseconds(
  command: OpModeClientMessage["command"],
): number {
  if (command === "reload-sources") return 60_000;
  if (command === "build") return BUILD_REQUEST_TIMEOUT_MILLIS;
  if (command === "load") return LOAD_REQUEST_TIMEOUT_MILLIS;
  if (command === "load-artifact") return LOAD_ARTIFACT_REQUEST_TIMEOUT_MILLIS;
  if (command === "init") return INITIALIZATION_REQUEST_TIMEOUT_MILLIS;
  if (command === "handoff") return HANDOFF_REQUEST_TIMEOUT_MILLIS;
  if (command === "tick") return OPMODE_TICK_PIPELINE_TIMEOUT_MILLIS;
  if (command === "debug") return 7_000;
  return LIFECYCLE_REQUEST_TIMEOUT_MILLIS;
}

export class OpModeSessionError extends Error {
  constructor(message: string, readonly code: string, readonly diagnostics: LoadArtifact["diagnostics"] = []) {
    super(message);
    this.name = "OpModeSessionError";
  }
}

/** Keep runtime capability details visible without changing the build result. */
export function describeOpModeFailure(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (!(error instanceof OpModeSessionError)) return error.message;
  return [
    `[${error.code}] ${error.message}`,
    ...error.diagnostics.map(formatBuildDiagnostic),
  ].join("\n");
}

export interface OpModeSession {
  load(
    files: Record<string, string>,
    hardware: SimulatedHardwareManifest,
    options?: OpModeBuildOptions,
  ): Promise<LoadArtifact>;
  loadArtifact(artifact: LoadArtifact, hardware: SimulatedHardwareManifest): Promise<LoadArtifact>;
  reloadSources?(sources: ProgramSource[]): Promise<HotReloadResult>;
  init(entryClass: string, sensors?: WorldRobotSensorFrame, debug?: DebugConfiguration): Promise<SimulationFrame | null>;
  debug?(input: Pick<DebugMessage, "action" | "configuration" | "frameId">): Promise<DebugState>;
  onDebugState?(listener: (state: DebugState) => void): () => void;
  transition(
    action: "init" | "start" | "stop" | "reset",
    entryClass?: string,
    sensors?: WorldRobotSensorFrame,
  ): Promise<SimulationFrame | null>;
  handoff(input: { entryClass: string; sensors: WorldRobotSensorFrame }): Promise<SimulationFrame>;
  keepAlive(): Promise<void>;
  tick(input: {
    sequence: number;
    gamepad1: GamepadSnapshot;
    gamepad2: GamepadSnapshot;
    motors: Record<string, MotorSensorFrame>;
    sensors?: RobotSensorFrame | WorldRobotSensorFrame;
  }): Promise<SimulationFrame>;
  close(): Promise<void>;
}

export interface OpModeBuildOptions {
  /** Full worktree files, including binary local JAR/AAR dependencies. */
  repositoryFiles?: Readonly<Record<string, string | Uint8Array>>;
  repositorySnapshot?: RepositorySnapshot;
  onBuildProgress?: (progress: BuildJobProgress) => void;
}

type PendingRequest = {
  resolve: (message: Extract<OpModeServerMessage, { type: "response" }>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  command?: OpModeClientMessage["command"];
  armTimeout?: () => ReturnType<typeof setTimeout>;
};

type BuildWaiter = {
  resolve: (artifact: LoadArtifact) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  onProgress?: (progress: BuildJobProgress) => void;
  jobId?: string;
};

const LOCAL_RUNNER_CONNECTION_TIMEOUT_MILLIS = 3_000;
const CLOUD_RUNNER_CONNECTION_TIMEOUT_MILLIS = 15_000;
const RUNNER_CONNECTION_RETRY_DELAY_MILLIS = 300;

type OpModeConnectionOptions = {
  ticketEndpoint?: string;
  websocketOrigin?: string;
  stage?: "build" | "runtime";
  artifactHash?: string;
  projectId?: string;
};

class RunnerSocketConnectionError extends OpModeSessionError {}

export function opModeConnectionTimeoutMilliseconds(websocketUrl: string): number {
  const hostname = new URL(websocketUrl).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    ? LOCAL_RUNNER_CONNECTION_TIMEOUT_MILLIS
    : CLOUD_RUNNER_CONNECTION_TIMEOUT_MILLIS;
}

export class WebSocketOpModeSession implements OpModeSession {
  private debugPaused = false;
  private readonly debugListeners = new Set<(state: DebugState) => void>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly builds = new Map<string, BuildWaiter>();
  private readonly transportDecoder = new OpModeTransportDecoder();
  private requestSequence = 0;
  private closed = false;
  private terminalError: OpModeSessionError | null = null;
  private cameraFrameRequests: Set<string> | null = null;
  private readonly sentCameraCaptures = new Map<string, number>();

  constructor(
    private readonly socket: WebSocket,
    private readonly stage: "build" | "runtime" = "build",
    private readonly supportsChunkedTransport = false,
  ) {
    socket.addEventListener("message", this.handleMessage);
    socket.addEventListener("close", (event) => this.handleClose(event));
    socket.addEventListener("error", (event) => this.handleClose(event));
  }

  static async connect(options: OpModeConnectionOptions = {}): Promise<WebSocketOpModeSession> {
    try {
      return await this.connectAttempt(options);
    } catch (error) {
      if (!(error instanceof RunnerSocketConnectionError)) throw error;
      // Only retry an upgrade that never opened. No build or motor command has
      // been sent, and a fresh one-use ticket cannot replay the rejected ticket.
      await new Promise<void>(resolve => setTimeout(resolve, RUNNER_CONNECTION_RETRY_DELAY_MILLIS));
      return this.connectAttempt(options);
    }
  }

  private static async connectAttempt(options: OpModeConnectionOptions): Promise<WebSocketOpModeSession> {
    const stage = options.stage ?? "build";
    if (stage === "runtime" && !options.artifactHash) {
      throw new OpModeSessionError("A runtime session requires the built artifact hash.", "ARTIFACT_HASH_REQUIRED");
    }
    const response = await fetch(options.ticketEndpoint ?? "/api/java-runner/v3/session-ticket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage, ...(options.artifactHash ? { artifactHash: options.artifactHash } : {}),
        ...(options.projectId ? { projectId: options.projectId } : {}) }),
    });
    const body = await response.json() as SessionTicketResponse | { error?: { code?: string; message?: string } };
    if (!response.ok || !("ticket" in body)) {
      const error = "error" in body ? body.error : undefined;
      throw new OpModeSessionError(error?.message ?? "The JVM runner could not create a session.", error?.code ?? "RUNNER_OFFLINE");
    }
    const origin = options.websocketOrigin
      ?? body.websocketUrl
      ?? "ws://127.0.0.1:8787";
    const url = new URL(body.websocketPath, origin);
    url.searchParams.set("ticket", body.ticket);
    const supportsChunkedTransport = body.protocolVersion === OPMODE_PROTOCOL_VERSION
      && body.websocketPath === "/v3/session";
    if (supportsChunkedTransport) {
      url.searchParams.set("transport", OPMODE_CHUNKED_TRANSPORT);
    }
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timer);
        socket.removeEventListener("open", opened);
        socket.removeEventListener("error", failed);
        socket.removeEventListener("close", failed);
      };
      const opened = () => { cleanup(); resolve(); };
      const failed = () => {
        cleanup();
        socket.close();
        reject(new RunnerSocketConnectionError("Could not connect to the JVM runner. Check your connection and try again.", "RUNNER_OFFLINE"));
      };
      const timer = window.setTimeout(() => {
        cleanup(); socket.close();
        reject(new OpModeSessionError("The JVM runner did not accept the session in time.", "RUNNER_TIMEOUT"));
      }, opModeConnectionTimeoutMilliseconds(url.toString()));
      socket.addEventListener("open", opened);
      socket.addEventListener("error", failed);
      socket.addEventListener("close", failed);
    });
    return new WebSocketOpModeSession(socket, stage, supportsChunkedTransport);
  }

  async load(
    files: Record<string, string>,
    hardware: SimulatedHardwareManifest,
    options: OpModeBuildOptions = {},
  ): Promise<LoadArtifact> {
    if (this.stage !== "build") {
      throw new OpModeSessionError("Runtime sessions load a previously built artifact with loadArtifact().", "SESSION_STAGE_UNAVAILABLE");
    }
    const repositorySnapshot = options.repositorySnapshot ?? await createRepositorySnapshot(
      options.repositoryFiles ?? files,
    );
    const gradleProject = repositorySnapshot.files.some(({ path }) => (
      /^(?:settings|build)\.gradle(?:\.kts)?$/u.test(path)
    ));
    if (!gradleProject) {
      const message: LoadProgramMessage = {
        protocolVersion: OPMODE_PROTOCOL_VERSION,
        requestId: this.nextRequestId(),
        command: "load",
        sources: Object.entries(files)
          .filter(([path]) => /\.(?:java|kt)$/u.test(path))
          .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
          .map(([path, content]) => ({ path, content })),
        hardware,
      };
      const response = await this.request(message);
      if (!response.artifact) throw new OpModeSessionError("The runner omitted the built artifact.", "INVALID_RESPONSE");
      return response.artifact;
    }
    const message: BuildProgramMessage = {
      protocolVersion: OPMODE_PROTOCOL_VERSION,
      requestId: this.nextRequestId(),
      command: "build",
      repositorySnapshot,
      hardware,
    };
    return this.startBuild(message, options.onBuildProgress);
  }

  async reloadSources(sources: ProgramSource[]): Promise<HotReloadResult> {
    if (this.stage !== "runtime") throw new OpModeSessionError("Hot Reload requires a loaded runtime.", "SESSION_STAGE_UNAVAILABLE");
    const response = await this.request({
      protocolVersion: OPMODE_PROTOCOL_VERSION,
      requestId: this.nextRequestId(),
      command: "reload-sources",
      sources,
    });
    if (!response.reload) throw new OpModeSessionError("The runner omitted the reload result.", "INVALID_RESPONSE");
    return response.reload;
  }

  async loadArtifact(
    artifact: LoadArtifact,
    hardware: SimulatedHardwareManifest,
  ): Promise<LoadArtifact> {
    if (this.stage !== "runtime") {
      throw new OpModeSessionError("Built artifacts must be loaded in a runtime session.", "SESSION_STAGE_UNAVAILABLE");
    }
    const artifactBundle = artifact.artifactBundle;
    if (!artifactBundle) throw new OpModeSessionError("The build result has no transferable artifact bundle.", "ARTIFACT_BUNDLE_MISSING");
    const artifactMetadata = { ...artifact };
    delete artifactMetadata.artifactBundle;
    const message: LoadArtifactProgramMessage = {
      protocolVersion: OPMODE_PROTOCOL_VERSION,
      requestId: this.nextRequestId(),
      command: "load-artifact",
      artifact: artifactMetadata,
      artifactBundle,
      hardware,
    };
    const response = await this.request(message);
    if (!response.artifact) throw new OpModeSessionError("The runtime omitted the loaded artifact.", "INVALID_RESPONSE");
    return response.artifact;
  }

  async transition(
    action: "init" | "start" | "stop" | "reset",
    entryClass?: string,
    sensors?: WorldRobotSensorFrame,
    debug?: DebugConfiguration,
  ): Promise<SimulationFrame | null> {
    let message: OpModeClientMessage;
    if (action === "init") {
      if (!entryClass) throw new OpModeSessionError("INIT requires an OpMode entry class.", "ENTRY_CLASS_REQUIRED");
      this.resetCameraDelivery();
      message = {
        protocolVersion: OPMODE_PROTOCOL_VERSION,
        requestId: this.nextRequestId(),
        command: "init",
        entryClass,
        ...(sensors ? { sensors: this.prepareCameraFrames(sensors) } : {}),
        ...(debug ? { debug } : {}),
      };
    } else {
      if (action === "reset") this.resetCameraDelivery();
      message = {
        protocolVersion: OPMODE_PROTOCOL_VERSION,
        requestId: this.nextRequestId(),
        command: action,
      };
    }
    const response = await this.request(message);
    return response.frame ?? null;
  }

  async init(entryClass: string, sensors?: WorldRobotSensorFrame, debug?: DebugConfiguration): Promise<SimulationFrame | null> {
    return this.transition("init", entryClass, sensors, debug);
  }

  onDebugState(listener: (state: DebugState) => void) {
    this.debugListeners.add(listener);
    return () => { this.debugListeners.delete(listener); };
  }

  async debug(input: Pick<DebugMessage, "action" | "configuration" | "frameId">): Promise<DebugState> {
    const response = await this.request({ protocolVersion: 3, requestId: this.nextRequestId(), command: "debug", ...input });
    if (!response.debug) throw new OpModeSessionError("The runner omitted debugger state.", "INVALID_RESPONSE");
    return response.debug;
  }

  private publishDebugState(state: DebugState) {
    if (!state || !["disabled", "running", "paused"].includes(state.status) || !Array.isArray(state.frames) || state.frames.length > 64
        || !Array.isArray(state.watches) || state.watches.length > 32 || !Array.isArray(state.breakpoints) || state.breakpoints.length > 128) {
      this.failInvalidResponse("Invalid debugger state"); return;
    }
    const paused = state.status === "paused";
    if (paused !== this.debugPaused) {
      this.debugPaused = paused;
      for (const pending of this.pending.values()) {
        if (pending.command === "debug" || pending.command === "heartbeat") continue;
        clearTimeout(pending.timeout);
        if (!paused && pending.armTimeout) pending.timeout = pending.armTimeout();
      }
    }
    for (const listener of this.debugListeners) { try { listener(state); } catch { /* Observers cannot interrupt transport. */ } }
  }

  async keepAlive(): Promise<void> {
    await this.request({
      protocolVersion: OPMODE_PROTOCOL_VERSION,
      requestId: this.nextRequestId(),
      command: "heartbeat",
    });
  }

  async handoff(input: { entryClass: string; sensors: WorldRobotSensorFrame }): Promise<SimulationFrame> {
    this.resetCameraDelivery();
    const message: HandoffMessage = {
      protocolVersion: OPMODE_PROTOCOL_VERSION,
      requestId: this.nextRequestId(),
      command: "handoff",
      entryClass: input.entryClass,
      sensors: this.prepareCameraFrames(input.sensors),
    };
    const response = await this.request(message);
    if (!response.frame) throw new OpModeSessionError("The runner omitted the handoff frame.", "INVALID_RESPONSE");
    return response.frame;
  }

  async tick(input: {
    sequence: number;
    gamepad1: GamepadSnapshot;
    gamepad2: GamepadSnapshot;
    motors: Record<string, MotorSensorFrame>;
    sensors?: RobotSensorFrame | WorldRobotSensorFrame;
  }): Promise<SimulationFrame> {
    const response = await this.request({
      protocolVersion: OPMODE_PROTOCOL_VERSION,
      requestId: this.nextRequestId(),
      command: "tick",
      sequence: input.sequence,
      deltaMillis: 20,
      gamepad1: input.gamepad1,
      gamepad2: input.gamepad2,
      motors: input.motors,
      ...(input.sensors ? { sensors: this.prepareCameraFrames(input.sensors) } : {}),
    });
    if (!response.frame) throw new OpModeSessionError("The runner omitted the simulation frame.", "INVALID_RESPONSE");
    return response.frame;
  }

  private resetCameraDelivery(): void {
    this.cameraFrameRequests = null;
    this.sentCameraCaptures.clear();
  }

  private prepareCameraFrames<T extends RobotSensorFrame | WorldRobotSensorFrame>(sensors: T): T {
    if (!("cameraFrames" in sensors) || !sensors.cameraFrames) return sensors;
    const frames = sensors.cameraFrames.filter(frame => {
      if (this.cameraFrameRequests && !this.cameraFrameRequests.has(frame.camera)) return false;
      if (this.sentCameraCaptures.get(frame.camera) === frame.captureTimeMs) return false;
      this.sentCameraCaptures.set(frame.camera, frame.captureTimeMs);
      return true;
    });
    // The renderer retains its latest exposure for previews. Never consume or
    // mutate that shared frame, and always keep geometric tags/world feedback.
    const result = { ...sensors };
    if (frames.length) result.cameraFrames = frames;
    else delete result.cameraFrames;
    return result;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.publishDebugState({ status: "disabled", frames: [], watches: [], breakpoints: [] });
    this.transportDecoder.reset();
    const error = new OpModeSessionError(
      "The JVM session was stopped. Motor output was neutralized.",
      "SESSION_CLOSED",
    );
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    for (const build of this.builds.values()) {
      clearTimeout(build.timeout);
      build.reject(error);
    }
    this.builds.clear();
    // Socket closure is the safety boundary: the runner's close handler kills
    // the JVM and neutralizes output without waiting behind queued control ticks.
    this.socket.close(1000, "session stopped");
  }

  private nextRequestId(): string {
    return `web-${Date.now().toString(36)}-${++this.requestSequence}`;
  }

  private request(message: Exclude<OpModeClientMessage, BuildProgramMessage>): Promise<Extract<OpModeServerMessage, { type: "response"; status: "ok" }>> {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(this.terminalError ?? new OpModeSessionError("The JVM session is closed.", "SESSION_CLOSED"));
    }
    return new Promise((resolve, reject) => {
      const armTimeout = () => setTimeout(() => {
        const pending = this.pending.get(message.requestId);
        if (!pending) return;
        const expire = () => {
          if (!this.pending.delete(message.requestId)) return;
          reject(new OpModeSessionError(`${message.command.toUpperCase()} timed out. Motor output was neutralized.`, "RUNNER_TIMEOUT"));
          this.socket.close();
        };
        // Rendering can block the main thread while replies wait in the browser's
        // network queue. Let that queue deliver once before declaring a TICK lost.
        // Keep this timer on the request so a reply or Stop cancels it normally.
        if (message.command === "tick") pending.timeout = setTimeout(expire, 0);
        else expire();
      }, message.command === "init" && message.debug ? 25_000 : opModeRequestTimeoutMilliseconds(message.command));
      const timeout = armTimeout();
      if (this.debugPaused && message.command !== "debug" && message.command !== "heartbeat") clearTimeout(timeout);
      this.pending.set(message.requestId, { resolve: (response) => {
        if (response.status === "error") {
          reject(new OpModeSessionError(response.error.message, response.error.code, response.error.diagnostics ?? []));
        } else if (response.status === "ok") resolve(response);
        else reject(new OpModeSessionError("The runner returned an unexpected build-job acknowledgement.", "INVALID_RESPONSE"));
      }, reject, timeout, command: message.command, armTimeout });
      try {
        this.sendMessage(message);
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(message.requestId);
        reject(error instanceof Error ? error : new OpModeSessionError("Could not send the runner request.", "INVALID_MESSAGE"));
        this.socket.close();
      }
    });
  }

  private startBuild(
    message: BuildProgramMessage,
    onProgress?: (progress: BuildJobProgress) => void,
  ): Promise<LoadArtifact> {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(this.terminalError ?? new OpModeSessionError("The JVM session is closed.", "SESSION_CLOSED"));
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.builds.delete(message.requestId);
        reject(new OpModeSessionError("The Gradle build took too long and the session was stopped.", "RUNNER_TIMEOUT"));
        this.socket.close();
      }, BUILD_REQUEST_TIMEOUT_MILLIS);
      this.builds.set(message.requestId, { resolve, reject, timeout, onProgress });
      try {
        this.sendMessage(message);
      } catch (error) {
        clearTimeout(timeout);
        this.builds.delete(message.requestId);
        reject(error instanceof Error ? error : new Error("Could not send the Gradle build request"));
        this.socket.close();
      }
    });
  }

  private readonly handleMessage = (event: MessageEvent<string>) => {
    if (typeof event.data !== "string") {
      this.failInvalidResponse("The runner sent a non-text protocol frame");
      return;
    }

    let completeJson: string | null;
    try {
      completeJson = this.supportsChunkedTransport
        ? this.transportDecoder.accept(event.data)
        : event.data;
    } catch (error) {
      this.failInvalidResponse(error instanceof Error ? error.message : "Invalid runner transport frame");
      return;
    }
    if (completeJson === null) return;

    let message: OpModeServerMessage;
    try {
      message = JSON.parse(completeJson) as OpModeServerMessage;
    } catch (error) {
      this.failInvalidResponse(error instanceof Error ? error.message : "Invalid runner protocol message");
      return;
    }
    if (message.type === "debug") { this.publishDebugState(message.state); return; }
    if (message.type === "event") {
      const validated = this.validateTerminalEvent(message);
      if (!validated) return;
      this.terminalError = validated;
      this.handleClose(validated);
      if (this.socket.readyState === WebSocket.OPEN) this.socket.close(1000, "terminal runner event");
      return;
    }
    if (message.type === "build-job") {
      const build = this.builds.get(message.requestId);
      if (!build) return;
      // An observer must not prevent terminal ready/failed frames from settling the build.
      try {
        build.onProgress?.({
          jobId: message.jobId,
          requestId: message.requestId,
          stage: message.stage,
          message: message.message,
        });
      } catch {
        // Progress callbacks are advisory; transport completion remains authoritative.
      }
      if (message.stage === "ready") {
        if (!message.artifact) {
          this.finishBuildFailure(message.requestId, new OpModeSessionError(
            "The runner completed a build without returning its artifact.",
            "INVALID_RESPONSE",
          ));
        } else {
          if (!message.artifactBundle) {
            this.finishBuildFailure(message.requestId, new OpModeSessionError(
              "The runner completed a build without a transferable artifact bundle.",
              "INVALID_RESPONSE",
            ));
          } else {
            clearTimeout(build.timeout);
            this.builds.delete(message.requestId);
            build.resolve({ ...message.artifact, artifactBundle: message.artifactBundle });
          }
        }
      } else if (message.stage === "failed") {
        this.finishBuildFailure(message.requestId, new OpModeSessionError(
          message.error?.message ?? message.message,
          message.error?.code ?? "BUILD_FAILED",
          message.error?.diagnostics ?? [],
        ));
      }
      return;
    }
    if (message.type !== "response") return;
    if (message.command === "build" && message.status === "accepted") {
      const build = this.builds.get(message.requestId);
      if (build) build.jobId = message.buildJobId;
      return;
    }
    const build = this.builds.get(message.requestId);
    if (build && message.status === "error") {
      this.finishBuildFailure(message.requestId, new OpModeSessionError(
        message.error.message,
        message.error.code,
        message.error.diagnostics ?? [],
      ));
      return;
    }
    if (message.status !== "ok" && message.status !== "error") return;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    if (message.status === "ok" && message.frame?.cameraFrameRequests !== undefined) {
      const requests = message.frame.cameraFrameRequests;
      if (!Array.isArray(requests) || requests.length > 16
          || requests.some(name => typeof name !== "string" || !name.length || name.length > 128)) {
        this.failInvalidResponse("Invalid camera frame requests");
        return;
      }
      for (const camera of requests) {
        if (this.cameraFrameRequests && !this.cameraFrameRequests.has(camera)) this.sentCameraCaptures.delete(camera);
      }
      this.cameraFrameRequests = new Set(requests);
    }
    this.pending.delete(message.requestId);
    clearTimeout(pending.timeout);
    pending.resolve(message);
  };

  private validateTerminalEvent(
    message: Extract<OpModeServerMessage, { type: "event" }>,
  ): OpModeSessionError | null {
    if (message.protocolVersion !== OPMODE_PROTOCOL_VERSION
      || (message.event !== "runtime-error" && message.event !== "heartbeat-expired")
      || !message.error || typeof message.error.code !== "string"
      || !/^[A-Z][A-Z0-9_]{0,63}$/u.test(message.error.code)
      || typeof message.error.message !== "string"
      || message.error.message.length === 0 || message.error.message.length > 240
      || /[\u0000-\u001f\u007f]/u.test(message.error.message)) return null;
    if (message.event === "heartbeat-expired" && message.error.code !== "HEARTBEAT_EXPIRED") return null;
    return new OpModeSessionError(message.error.message, message.error.code);
  }

  private readonly handleClose = (event?: Event | CloseEvent | OpModeSessionError) => {
    this.publishDebugState({ status: "disabled", frames: [], watches: [], breakpoints: [] });
    if (this.closed && this.pending.size === 0 && this.builds.size === 0) return;
    this.closed = true;
    this.transportDecoder.reset();
    const terminalError = event instanceof OpModeSessionError ? event : undefined;
    const closeCode = event && "code" in event && typeof event.code === "number"
      ? event.code
      : undefined;
    const closeDiagnosis = terminalError ?? (closeCode === 1013
      ? new OpModeSessionError("The JVM runner is temporarily overloaded.", "RUNNER_OVERLOADED")
      : closeCode === 1012
        ? new OpModeSessionError("The JVM runner is restarting.", "RUNNER_RESTARTING")
        : null);
    const failure = closeDiagnosis ?? new OpModeSessionError(
      "The JVM runner disconnected. Motor output was neutralized.",
      "RUNNER_DISCONNECTED",
    );
    if (closeDiagnosis) this.terminalError = closeDiagnosis;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(failure);
    }
    this.pending.clear();
    for (const build of this.builds.values()) {
      clearTimeout(build.timeout);
      build.reject(closeDiagnosis ?? new OpModeSessionError(
        "The JVM runner disconnected during the build.",
        "RUNNER_DISCONNECTED",
      ));
    }
    this.builds.clear();
  };

  private finishBuildFailure(requestId: string, error: Error): void {
    const build = this.builds.get(requestId);
    if (!build) return;
    clearTimeout(build.timeout);
    this.builds.delete(requestId);
    build.reject(error);
  }

  private sendMessage(message: OpModeClientMessage): void {
    try {
      const json = JSON.stringify(message);
      const frames = this.supportsChunkedTransport
        ? encodeOpModeTransportFrames(json, message.requestId)
        : [json];
      for (const frame of frames) this.socket.send(frame);
    } catch (error) {
      const failure = error instanceof Error
        ? error
        : new OpModeSessionError("Could not send the runner request.", "INVALID_MESSAGE");
      throw failure;
    }
  }

  private failInvalidResponse(message: string): void {
    if (this.closed && this.pending.size === 0 && this.builds.size === 0) return;
    this.closed = true;
    this.transportDecoder.reset();
    const error = new OpModeSessionError(
      `The runner sent an invalid protocol frame: ${message}`,
      "INVALID_RESPONSE",
    );
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    for (const build of this.builds.values()) {
      clearTimeout(build.timeout);
      build.reject(error);
    }
    this.builds.clear();
    this.socket.close();
  }
}
