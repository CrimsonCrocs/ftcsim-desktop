import { createRepositorySnapshot } from "../../src/lib/java-runner-client";
import { OpModeSessionError, describeOpModeFailure, type OpModeSession, type OpModeBuildOptions } from "../../src/lib/opmode-session";
import { OPMODE_CONTROL_TICK_MILLIS, type RobotSensorFrame, type WorldRobotSensorFrame, type BuildDiagnostic, type LoadArtifact, type OpModeClientMessage, type OpModeServerMessage, type ProgramSource, type SimulatedHardwareManifest, type SimulationFrame, type HotReloadResult, type DebugState, type DebugMessage } from "@ftc-studio/opmode-protocol";
import { publishLocalProjectArtifactCompletions, type ProjectArtifactCompletionDocument, type publishProjectArtifactCompletions } from "../../src/lib/completions/project-artifact-completions";
export { OpModeSessionError, describeOpModeFailure };
export type { OpModeSession, OpModeBuildOptions };
const completionIndexes = new Map<string, ProjectArtifactCompletionDocument>();
export async function publishDesktopCompletions(projectId: string, artifact: LoadArtifact): ReturnType<typeof publishProjectArtifactCompletions> {
  const document = completionIndexes.get(artifact.artifactHash);
  return document ? publishLocalProjectArtifactCompletions(projectId, artifact, document) : { status: "empty" };
}

export async function desktopRequest<T>(path: string, body?: unknown): Promise<T> {
  if (!window.ftcDesktop) throw new Error("Open this project in FTC Simulator Desktop");
  let result: unknown;
  try { result = await window.ftcDesktop.request(path, body); }
  catch (error) {
    const reason = error instanceof Error ? error.message || error.name : String(error || "Desktop connection failed");
    throw new OpModeSessionError(reason, "DESKTOP_BRIDGE_ERROR");
  }
  if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
    const details = result as { error: string; code?: string; diagnostics?: BuildDiagnostic[] };
    throw new OpModeSessionError(details.error, details.code ?? "DESKTOP_OPERATION_FAILED", details.diagnostics);
  }
  return result as T;
}

export class WebSocketOpModeSession implements OpModeSession {
  private sequence = 0;
  private closed = false;
  private commandTail: Promise<unknown> = Promise.resolve();
  private cameraRequests: Set<string> | null = null;
  private cameraCaptures = new Map<string, number>();
  private listeners = new Set<(state: DebugState) => void>();
  private constructor(private readonly id: string, private readonly cached?: LoadArtifact) {}
  static async connect(options: { stage?: "build" | "runtime"; artifactHash?: string; projectId?: string } = {}): Promise<WebSocketOpModeSession> {
    const result = await desktopRequest<{ sessionId: string; artifact?: LoadArtifact }>("/sessions/open", options);
    return new WebSocketOpModeSession(result.sessionId, result.artifact);
  }
  async load(files: Record<string, string>, hardware: SimulatedHardwareManifest, options: OpModeBuildOptions = {}): Promise<LoadArtifact> {
    const repositorySnapshot = options.repositorySnapshot ?? await createRepositorySnapshot(options.repositoryFiles ?? files);
    options.onBuildProgress?.({ jobId: this.id, requestId: this.next(), stage: "compiling", message: "Compiling locally…" });
    const result = await desktopRequest<{ artifact: LoadArtifact; completionIndex?: ProjectArtifactCompletionDocument }>("/sessions/build", { sessionId: this.id, message: { protocolVersion: 3,
      requestId: this.next(), command: "build", repositorySnapshot, hardware } });
    if (result.completionIndex) {
      completionIndexes.set(result.artifact.artifactHash, result.completionIndex);
      if (completionIndexes.size > 4) completionIndexes.delete(completionIndexes.keys().next().value!);
    }
    return result.artifact;
  }
  async loadArtifact(artifact: LoadArtifact): Promise<LoadArtifact> {
    if (this.cached?.artifactHash !== artifact.artifactHash) throw new Error("Desktop artifact changed; rebuild once");
    return this.cached;
  }
  async reloadSources(sources: ProgramSource[]): Promise<HotReloadResult> {
    const reply = await this.send({ command: "reload-sources", sources });
    if (!reply.reload) throw new Error("Reload did not return compiled source metadata");
    return reply.reload;
  }
  async init(entryClass: string, sensors?: WorldRobotSensorFrame, debug?: Parameters<NonNullable<OpModeSession["init"]>>[2]): Promise<SimulationFrame | null> {
    this.cameraRequests=null;this.cameraCaptures.clear();
    return (await this.send({ command: "init", entryClass, ...(sensors ? { sensors:this.prepareCameraFrames(sensors) } : {}), ...(debug ? { debug } : {}) })).frame ?? null;
  }
  async transition(action: "init" | "start" | "stop" | "reset", entryClass?: string, sensors?: WorldRobotSensorFrame): Promise<SimulationFrame | null> {
    if (action === "init") return this.init(entryClass!, sensors);
    return (await this.send({ command: action })).frame ?? null;
  }
  async handoff(input: { entryClass: string; sensors: WorldRobotSensorFrame }): Promise<SimulationFrame> {
    this.cameraRequests=null;this.cameraCaptures.clear();
    const frame = (await this.send({ command: "handoff", ...input, sensors:this.prepareCameraFrames(input.sensors) })).frame;
    if (!frame) throw new Error("Handoff returned no frame");
    return frame;
  }
  async tick(input: Parameters<OpModeSession["tick"]>[0]): Promise<SimulationFrame> {
    const frame = (await this.send({ command: "tick", ...input, deltaMillis:OPMODE_CONTROL_TICK_MILLIS,
      ...(input.sensors?{sensors:this.prepareCameraFrames(input.sensors)}:{}) })).frame;
    if (!frame) throw new Error("Tick returned no actuator frame");
    return frame;
  }
  async keepAlive(): Promise<void> { await this.send({ command: "heartbeat" }); }
  async debug(input: Pick<DebugMessage, "action" | "configuration" | "frameId">): Promise<DebugState> {
    const state = (await this.send({ command: "debug", ...input })).debug;
    if (!state) throw new Error("Debugger returned no state");
    this.listeners.forEach(listener => listener(state)); return state;
  }
  onDebugState(listener: (state: DebugState) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true; await desktopRequest("/sessions/close", { sessionId: this.id });
  }
  private next(): string { return `desktop-${++this.sequence}`; }
  private prepareCameraFrames<T extends RobotSensorFrame | WorldRobotSensorFrame>(sensors:T):T {
    if(!("cameraFrames" in sensors)||!sensors.cameraFrames)return sensors;
    const frames=sensors.cameraFrames.filter(frame=>{
      if(this.cameraRequests&&!this.cameraRequests.has(frame.camera))return false;
      if(this.cameraCaptures.get(frame.camera)===frame.captureTimeMs)return false;
      this.cameraCaptures.set(frame.camera,frame.captureTimeMs);return true;
    });
    const result={...sensors};if(frames.length)result.cameraFrames=frames;else delete result.cameraFrames;return result;
  }
  private async send(body: Record<string, unknown>): Promise<Extract<OpModeServerMessage, { type: "response"; status: "ok" }>> {
    if (this.closed) throw new OpModeSessionError("Desktop session closed", "SESSION_CLOSED");
    // Independent native HTTP tasks can arrive out of order. Preserve the
    // session command order before they cross that transport boundary.
    const message = { protocolVersion: 3, requestId: this.next(), ...body } as OpModeClientMessage;
    const request = this.commandTail.then(() => {
      if (this.closed) throw new OpModeSessionError("Desktop session closed", "SESSION_CLOSED");
      return desktopRequest<Extract<OpModeServerMessage, { type: "response" }>>("/sessions/command", { sessionId: this.id, message });
    });
    this.commandTail = request.catch(() => undefined);
    const reply = await request;
    if (reply.status === "error") throw new OpModeSessionError(reply.error.message, reply.error.code, reply.error.diagnostics);
    if (reply.status !== "ok") throw new Error("Unexpected asynchronous build response");
    if(reply.frame?.cameraFrameRequests!==undefined)this.cameraRequests=new Set(reply.frame.cameraFrameRequests);
    return reply;
  }
}

declare global {
  interface Window { ftcDesktop?: { request(path: string, body?: unknown): Promise<unknown> }; }
}
