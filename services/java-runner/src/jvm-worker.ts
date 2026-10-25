import { validateCameraFrames } from "./camera-frame";
import type {
  GamepadSnapshot,
  MotorSensorFrame,
  RobotSensorFrame,
  SimulatedCameraDescriptor,
  SimulatedMotorDescriptor,
  SimulationFrame,
  DebugConfiguration,
  DebugMessage,
  DebugState,
} from "@ftc-studio/opmode-protocol";
import { OPMODE_MAX_TICK_EXECUTION_MILLIS } from "@ftc-studio/opmode-protocol";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeDebugConfiguration } from "./debug-validation";

import { isolatedProcessEnvironment } from "./java-compiler";
import { encodeMotorProfileArgument } from "./motor-profile";

export const PERSISTENT_RUNNER_MAIN_CLASS = "org.firstinspires.ftc.sim.PersistentOpModeRunnerCli";

export interface JvmWorkerRequest {
  requestId: string;
  command: "init" | "start" | "tick" | "stop" | "close" | "handoff";
  sequence?: number;
  deltaMillis?: number;
  entryClass?: string;
  robotId?: string;
  tick?: number;
  simulationTimeMillis?: number;
  gamepad1?: GamepadSnapshot;
  gamepad2?: GamepadSnapshot;
  motors?: Record<string, MotorSensorFrame>;
  sensors?: RobotSensorFrame | WorldRobotSensorFrame;
}

export interface SimulatedSensorDescriptor {
  name: string;
  kind: "digital" | "analog" | "distance" | "color" | "odometry" | "pinpoint";
}

/** Structural copy of SimulationWorld.sensorFrame, kept free of a runtime sim-core import. */
export interface WorldRobotSensorFrame {
  robotId: string;
  tick: number;
  simulationTimeMs: number;
  orientation: { yawRadians: number; pitchRadians: number; rollRadians: number };
  angularVelocity: { x: number; y: number; z: number };
  voltage: number;
  currentAmps: number;
  cameraFrames?: import("@ftc-studio/opmode-protocol").SimulatedCameraFrame[];
  motors: Record<string, MotorSensorFrame>;
  digital: Record<string, boolean>;
  analog: Record<string, number>;
  distance: Record<string, number>;
  color: Record<string, { red: number; green: number; blue: number; alpha: number }>;
  odometry: Record<string, {
    xMeters: number;
    yMeters: number;
    headingRadians: number;
    xVelocity: number;
    yVelocity: number;
    angularVelocity: number;
  }>;
  aprilTags: Array<{
    id: number;
    camera: string;
    captureTimeMs: number;
    availableTimeMs: number;
    translation: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    rangeMeters: number;
    bearingRadians: number;
    elevationRadians: number;
  }>;
}

export interface JvmWorkerFactoryInput {
  debug?: DebugConfiguration;
  onDebugState?: (state: DebugState) => void;
  classesRoot: string;
  runtimeClasspath?: string[];
  workspace: string;
  entryClass: string;
  robotId?: string;
  motors: SimulatedMotorDescriptor[];
  servos: string[];
  sensors?: SimulatedSensorDescriptor[];
  cameras?: SimulatedCameraDescriptor[];
}

export interface TimestampedWorldFrame extends SimulationFrame {
  robotId?: string;
  tick?: number;
  digitalOutputs?: Record<string, boolean>;
  /** LinearOpMode returned normally; match/session phase can remain running until its clock ends. */
  programStatus?: "running" | "completed";
}

export interface JvmWorkerReply extends TimestampedWorldFrame {
  ok: true;
  requestId: string;
}

export interface OpModeJvmWorker {
  request(message: JvmWorkerRequest): Promise<JvmWorkerReply>;
  terminate(): Promise<void>;
  debug?(message: DebugMessage): Promise<DebugState>;
}

export type JvmWorkerFactory = (input: JvmWorkerFactoryInput) => OpModeJvmWorker;

type WorkerEnvelope = JvmWorkerReply | {
  ok: false;
  requestId: string;
  error: { kind: string; message: string };
  neutralized: true;
};

interface PendingReply {
  resolve(value: JvmWorkerReply): void;
  reject(reason: Error): void;
  timer: ReturnType<typeof setTimeout>;
  timeoutMillis: number;
}

export class BunJvmWorker implements OpModeJvmWorker {
  private readonly process: BunSubprocess;
  private readonly requiresWorldSensorFrame: boolean;
  private readonly configuredMotorNames: string[];
  private readonly configuredCameraNames: string[];
  private readonly pending = new Map<string, PendingReply>();
  private closed = false;
  private exitError?: Error;
  private paused = false;
  private pauseTimer?: ReturnType<typeof setTimeout>;
  private readonly debugPending = new Map<string, { resolve(state: DebugState): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();

  constructor(private readonly input: JvmWorkerFactoryInput) {
    validateConfiguredSensors(input);
    this.requiresWorldSensorFrame = Boolean(input.robotId || input.sensors?.length || input.cameras?.length);
    this.configuredMotorNames = input.motors.map(({ name }) => name);
    this.configuredCameraNames = (input.cameras ?? []).map(({ name }) => name);
    const vmOptions = [
      "-Xms16m",
      input.cameras?.length ? "-Xmx192m" : "-Xmx64m",
      "-XX:MaxMetaspaceSize=64m",
      "-Xss512k",
      "-Djava.awt.headless=true",
      "-cp", (input.runtimeClasspath ?? [input.classesRoot]).join(delimiter),
    ];
    const targetArguments = [
      PERSISTENT_RUNNER_MAIN_CLASS,
      "--class", input.entryClass,
      ...input.motors.flatMap((motor) => [
        "--motor-profile",
        encodeMotorProfileArgument(motor),
      ]),
      ...input.servos.flatMap((name) => ["--servo", name]),
      ...(input.robotId ? ["--robot-id", input.robotId] : []),
      ...(input.sensors ?? []).flatMap((sensor) => [
        "--sensor",
        encodeSensorDescriptorArgument(sensor),
      ]),
      ...(input.cameras ?? []).flatMap((camera) => [
        "--camera",
        encodeCameraDescriptorArgument(camera),
      ]),
    ];
    const encode = (value: string) => Buffer.from(value).toString("base64");
    const quote = (value: string) => `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`;
    this.process = Bun.spawn(input.debug ? [
      "java", "-Xmx96m", "--add-modules", "jdk.jdi",
      fileURLToPath(new URL("../../../runtime/java-debugger/DebugRunner.java", import.meta.url)),
      encode([...vmOptions, "-Dftcsim.debug=true"].map(quote).join(" ")),
      encode(targetArguments.map(quote).join(" ")),
      encode(encodeDebugConfiguration(input.debug)),
    ] : ["java", ...vmOptions, ...targetArguments], {
      cwd: input.workspace,
      detached: process.platform !== "win32",
      env: isolatedProcessEnvironment(input.workspace, input.classesRoot),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    void this.readReplies();
    void this.drainStderr();
    void this.process.exited.then((exitCode) => {
      if (this.closed) return;
      this.exitError = new Error(`JVM worker exited unexpectedly with code ${exitCode}`);
      this.rejectPending(this.exitError);
      if (this.input.debug) this.input.onDebugState?.({ status: "disabled", reason: this.exitError.message, frames: [], watches: [], breakpoints: [] });
    });
  }

  async request(message: JvmWorkerRequest): Promise<JvmWorkerReply> {
    if (this.closed) throw new Error("JVM worker is closed");
    if (this.exitError) throw this.exitError;
    if (this.pending.has(message.requestId)) throw new Error("Duplicate JVM request id");
    const line = encodeWorkerCommand(
      message,
      this.requiresWorldSensorFrame,
      this.configuredMotorNames,
      this.configuredCameraNames,
    );
    const timeoutMillis = message.command === "init" || message.command === "handoff"
      ? this.input.debug ? 20_000 : 2_500
      : OPMODE_MAX_TICK_EXECUTION_MILLIS;
    const reply = new Promise<JvmWorkerReply>((resolve, reject) => {
      const timer = this.armRequestTimeout(message.requestId, timeoutMillis);
      this.pending.set(message.requestId, { resolve, reject, timer, timeoutMillis });
      if (this.paused) clearTimeout(timer);
    });
    try {
      this.process.stdin.write(`${line}\n`);
      await this.process.stdin.flush();
    } catch (error) {
      const pending = this.pending.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.requestId);
        pending.reject(error instanceof Error ? error : new Error("JVM input failed"));
      }
      void this.terminate();
      try { await reply; } catch {}
      throw error;
    }
    return reply;
  }

  async terminate(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.pauseTimer);
    for (const pending of this.debugPending.values()) { clearTimeout(pending.timer); pending.reject(new Error("JVM worker was terminated")); }
    this.debugPending.clear();
    this.rejectPending(new Error("JVM worker was terminated"));
    try {
      this.process.stdin.end();
    } catch {}
    if (this.process.exitCode === null) {
      if (process.platform === "win32") this.process.kill("SIGKILL");
      else {
        try { process.kill(-this.process.pid, "SIGKILL"); } catch {}
      }
    }
    await this.process.exited;
  }

  async debug(message: DebugMessage): Promise<DebugState> {
    if (!this.input.debug || this.closed || this.exitError) throw new Error("Start the OpMode with debugging enabled");
    const argument = message.configuration
      ? Buffer.from(encodeDebugConfiguration(message.configuration)).toString("base64")
      : String(message.frameId ?? 0);
    const result = new Promise<DebugState>((resolve, reject) => {
      const timer = setTimeout(() => { this.debugPending.delete(message.requestId); reject(new Error("Debugger command timed out")); }, 5_000);
      this.debugPending.set(message.requestId, { resolve, reject, timer });
    });
    try {
      this.process.stdin.write(`DEBUG\t${message.requestId}\t${message.action}\t${argument}\n`);
      await this.process.stdin.flush();
    } catch (error) {
      const pending = this.debugPending.get(message.requestId);
      if (pending) { clearTimeout(pending.timer); this.debugPending.delete(message.requestId); pending.reject(error instanceof Error ? error : new Error("Debugger input failed")); }
    }
    return result;
  }

  private armRequestTimeout(id: string, duration: number) {
    return setTimeout(() => {
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      pending.reject(new Error("JVM response timed out"));
      void this.terminate();
    }, duration);
  }

  private acceptDebugState(state: DebugState) {
    const paused = state.status === "paused";
    if (paused !== this.paused) {
      this.paused = paused;
      clearTimeout(this.pauseTimer);
      if (paused) {
        for (const pending of this.pending.values()) clearTimeout(pending.timer);
        this.pauseTimer = setTimeout(() => {
          const reason = "Debugger pause exceeded five minutes. Run again to start a new session.";
          this.rejectPending(new Error(reason));
          this.input.onDebugState?.({ status: "disabled", reason, frames: [], watches: [], breakpoints: [] });
          void this.terminate();
        }, 300_000);
      } else {
        for (const [id, pending] of this.pending) pending.timer = this.armRequestTimeout(id, pending.timeoutMillis);
      }
    }
    this.input.onDebugState?.(state);
  }

  private async readReplies(): Promise<void> {
    const reader = this.process.stdout.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        let newline = buffered.indexOf("\n");
        while (newline >= 0) {
          const line = buffered.slice(0, newline).trim();
          buffered = buffered.slice(newline + 1);
          if (line) this.handleReplyLine(line);
          newline = buffered.indexOf("\n");
        }
      }
    } catch (error) {
      this.rejectPending(error instanceof Error ? error : new Error("JVM output failed"));
    }
  }

  private handleReplyLine(line: string): void {
    let envelope: WorkerEnvelope | { debugEvent: true; state: DebugState } | { debugReply: true; requestId: string; ok: boolean; state?: DebugState; error?: string };
    try {
      envelope = JSON.parse(line) as typeof envelope;
    } catch {
      this.rejectPending(new Error("JVM worker produced invalid JSON"));
      void this.terminate();
      return;
    }
    if ("debugEvent" in envelope) { this.acceptDebugState(envelope.state); return; }
    if ("debugReply" in envelope) {
      const pending = this.debugPending.get(envelope.requestId);
      if (pending) {
        clearTimeout(pending.timer); this.debugPending.delete(envelope.requestId);
        if (envelope.ok && envelope.state) { this.acceptDebugState(envelope.state); pending.resolve(envelope.state); }
        else pending.reject(new Error(envelope.error ?? "Debugger command failed"));
      }
      return;
    }
    const pending = this.pending.get(envelope.requestId);
    if (!pending) return;
    this.pending.delete(envelope.requestId);
    clearTimeout(pending.timer);
    if (envelope.ok === true) pending.resolve(envelope);
    else pending.reject(new Error(`${envelope.error.kind}: ${envelope.error.message}`));
  }

  private async drainStderr(): Promise<void> {
    const reader = this.process.stderr.getReader();
    let consumed = 0;
    while (consumed < 64 * 1024) {
      const { done, value } = await reader.read();
      if (done) return;
      consumed += value?.byteLength ?? 0;
    }
    await reader.cancel();
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export const createBunJvmWorker: JvmWorkerFactory = (input) => new BunJvmWorker(input);

export function encodeWorkerCommand(
  message: JvmWorkerRequest,
  requiresWorldSensorFrame = false,
  configuredMotorNames?: readonly string[],
  configuredCameraNames?: readonly string[],
): string {
  const command = message.command.toUpperCase();
  if (message.command === "start" || message.command === "stop"
      || message.command === "close") return `${command}\t${message.requestId}`;
  if (message.command === "init" || message.command === "handoff") {
    const frame = getWorldFrame(message.sensors, requiresWorldSensorFrame, message.command);
    if (!frame) {
      if (message.command === "handoff") {
        throw new Error("Handoff requires a complete WorldSensorFrame");
      }
      return `${command}\t${message.requestId}`;
    }
    if (message.command === "handoff" && !message.entryClass?.trim()) {
      throw new Error("Handoff requires the next OpMode entryClass");
    }
    validateWorldFrameIdentity(message, frame);
    const motors = encodeWorldMotorFeedback(frame, configuredMotorNames);
    const robotSensors = encodeWorldRobotSensorFeedback(frame);
    const physicalSensors = encodePhysicalSensorFeedback(frame, configuredCameraNames);
    if (message.command === "init") {
      return [
        command,
        message.requestId,
        frame.robotId,
        String(frame.tick),
        String(frame.simulationTimeMs),
        motors,
        robotSensors,
        physicalSensors,
      ].join("\t");
    }
    return [
      command,
      message.requestId,
      message.entryClass!,
      frame.robotId,
      String(frame.tick),
      String(frame.simulationTimeMs),
      motors,
      robotSensors,
      physicalSensors,
    ].join("\t");
  }
  if (message.sequence === undefined || message.deltaMillis === undefined) {
    throw new Error("Tick sequence and delta are required");
  }
  const frame = getWorldFrame(message.sensors, requiresWorldSensorFrame, "tick");
  if (frame) {
    validateWorldFrameIdentity(message, frame);
    return [
      command,
      message.requestId,
      String(message.sequence),
      String(message.deltaMillis),
      encodeFlatRecord(message.gamepad1 ?? {}),
      encodeFlatRecord(message.gamepad2 ?? {}),
      encodeWorldMotorFeedback(frame, configuredMotorNames),
      encodeWorldRobotSensorFeedback(frame),
      frame.robotId,
      String(frame.tick),
      String(frame.simulationTimeMs),
      encodePhysicalSensorFeedback(frame, configuredCameraNames),
    ].join("\t");
  }
  return [
    command,
    message.requestId,
    String(message.sequence),
    String(message.deltaMillis),
    encodeFlatRecord(message.gamepad1 ?? {}),
    encodeFlatRecord(message.gamepad2 ?? {}),
    encodeMotorFeedback(message.motors ?? {}),
    encodeRobotSensorFeedback(getLegacyRobotSensorFrame(message.sensors)),
  ].join("\t");
}

function getLegacyRobotSensorFrame(value: JvmWorkerRequest["sensors"]): RobotSensorFrame | undefined {
  return value && !("robotId" in value) ? value : undefined;
}

function getWorldFrame(
  value: JvmWorkerRequest["sensors"],
  required: boolean,
  command: "init" | "tick" | "handoff",
): WorldRobotSensorFrame | undefined {
  if (value && "robotId" in value) return value;
  if (required) {
    throw new Error(`${command.toUpperCase()} requires a complete WorldSensorFrame for configured sensors`);
  }
  return undefined;
}

function validateWorldFrameIdentity(
  message: JvmWorkerRequest,
  frame: WorldRobotSensorFrame,
): void {
  if (!frame.robotId || frame.robotId.trim() !== frame.robotId) {
    throw new Error("WorldSensorFrame robotId must be non-empty and trimmed");
  }
  if (frame.robotId.length > 128 || [...frame.robotId].some((character) => character.charCodeAt(0) < 0x20)) {
    throw new Error("WorldSensorFrame robotId must be at most 128 characters and contain no controls");
  }
  if (!Number.isSafeInteger(frame.tick) || frame.tick < 0
      || !Number.isSafeInteger(frame.simulationTimeMs) || frame.simulationTimeMs < 0) {
    throw new Error("WorldSensorFrame tick and simulationTimeMs must be non-negative safe integers");
  }
  if (message.robotId !== undefined && message.robotId !== frame.robotId) {
    throw new Error("Request robotId does not match WorldSensorFrame robotId");
  }
  if (message.tick !== undefined && message.tick !== frame.tick) {
    throw new Error("Request tick does not match WorldSensorFrame tick");
  }
  if (message.simulationTimeMillis !== undefined
      && message.simulationTimeMillis !== frame.simulationTimeMs) {
    throw new Error("Request simulationTimeMillis does not match WorldSensorFrame time");
  }
}

function validateConfiguredSensors(input: JvmWorkerFactoryInput): void {
  const usedNames = new Set<string>(["imu", "Control Hub"]);
  for (const name of [
    ...input.motors.map(({ name }) => name),
    ...input.servos,
    ...(input.sensors ?? []).map(({ name }) => name),
    ...(input.cameras ?? []).map(({ name }) => name),
  ]) {
    if (!name || name.length > 128 || name.trim() !== name
        || [...name].some((character) => character.charCodeAt(0) < 0x20)) {
      throw new Error("Hardware device names must be trimmed, non-empty, at most 128 characters, and contain no controls");
    }
    if (usedNames.has(name)) throw new Error(`Hardware device name was configured more than once: ${name}`);
    usedNames.add(name);
  }
  const supportedKinds = new Set<SimulatedSensorDescriptor["kind"]>([
    "digital", "analog", "distance", "color", "odometry", "pinpoint",
  ]);
  for (const sensor of input.sensors ?? []) {
    if (!supportedKinds.has(sensor.kind)) throw new Error(`Unsupported configured sensor kind: ${sensor.kind}`);
  }
  for (const camera of input.cameras ?? []) {
    if (!camera.name || camera.name.length > 128 || camera.name.trim() !== camera.name
        || [...camera.name].some((character) => character.charCodeAt(0) < 0x20)) {
      throw new Error("Camera names must be trimmed, non-empty, at most 128 characters, and contain no controls");
    }
  }
}

export function encodeSensorDescriptorArgument(sensor: SimulatedSensorDescriptor): string {
  return `v1,${encodeComponent(sensor.name)},${sensor.kind}`;
}

export function encodeCameraDescriptorArgument(camera: SimulatedCameraDescriptor): string {
  return `v1,${encodeComponent(camera.name)}`;
}

function encodeWorldMotorFeedback(
  frame: WorldRobotSensorFrame,
  configuredMotorNames?: readonly string[],
): string {
  const motorNames = configuredMotorNames ?? Object.keys(frame.motors);
  for (const name of motorNames) {
    if (!Object.hasOwn(frame.motors, name)) {
      throw new Error(`WorldSensorFrame is missing configured motor '${name}'`);
    }
  }
  if (configuredMotorNames !== undefined) {
    const configured = new Set(configuredMotorNames);
    const unexpected = Object.keys(frame.motors).filter((name) => !configured.has(name));
    if (unexpected.length > 0) {
      throw new Error(`WorldSensorFrame contains unconfigured motor(s): ${unexpected.join(", ")}`);
    }
  }
  const selected: Record<string, MotorSensorFrame> = {};
  for (const name of motorNames) {
    const motor = frame.motors[name]!;
    assertFinite(motor.positionTicks, `motor '${name}' positionTicks`);
    assertFinite(motor.velocityTicksPerSecond, `motor '${name}' velocityTicksPerSecond`);
    assertFinite(motor.currentAmps, `motor '${name}' currentAmps`);
    if (typeof motor.enabled !== "boolean") throw new Error(`Motor '${name}' enabled state is missing`);
    selected[name] = motor;
  }
  return encodeMotorFeedback(selected);
}

function encodeWorldRobotSensorFeedback(frame: WorldRobotSensorFrame): string {
  // WorldSensorFrame uses simulator body axes (+X forward, +Y up, +Z right).
  // FTC RobotCoordinateSystem uses (+X right, +Y forward, +Z up).
  const values = [
    frame.orientation.yawRadians,
    frame.orientation.pitchRadians,
    frame.orientation.rollRadians,
    frame.angularVelocity.z,
    frame.angularVelocity.x,
    frame.angularVelocity.y,
    frame.voltage,
    frame.currentAmps,
  ];
  values.forEach((value, index) => assertFinite(value, `robot sensor value ${index}`));
  return values.join(",");
}

function encodePhysicalSensorFeedback(
  frame: WorldRobotSensorFrame,
  configuredCameraNames?: readonly string[],
): string {
  const entries: Array<[string, string]> = [];
  appendSensorMap(entries, "digital", frame.digital, (value, name) => {
    if (typeof value !== "boolean") throw new Error(`Digital sensor '${name}' must have a boolean sample`);
    return String(value);
  });
  appendSensorMap(entries, "analog", frame.analog, (value, name) => {
    assertFinite(value, `analog sensor '${name}'`);
    return String(value);
  });
  appendSensorMap(entries, "distance", frame.distance, (value, name) => {
    assertFinite(value, `distance sensor '${name}'`);
    if (value < 0) throw new Error(`Distance sensor '${name}' cannot report a negative range`);
    return String(value);
  });
  appendSensorMap(entries, "color", frame.color, (value, name) => {
    const channels = [value.red, value.green, value.blue, value.alpha];
    channels.forEach((channel, index) => {
      if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
        throw new Error(`Color sensor '${name}' channel ${index} must be an integer from 0 to 255`);
      }
    });
    return channels.join(",");
  });
  appendSensorMap(entries, "odometry", frame.odometry, (value, name) => {
    const axes = [value.xMeters, value.yMeters, value.headingRadians,
      value.xVelocity, value.yVelocity, value.angularVelocity];
    axes.forEach((axis, index) => assertFinite(axis, `odometry sensor '${name}' axis ${index}`));
    return axes.join(",");
  });
  const configuredCameras = configuredCameraNames === undefined
    ? undefined
    : new Set(configuredCameraNames);
  const seenTags = new Set<string>();
  for (const image of validateCameraFrames(frame.cameraFrames, frame.simulationTimeMs, configuredCameraNames)) {
    entries.push([`image:${image.camera}`, [image.captureTimeMs, image.width, image.height, image.imageBase64,
      ...(image.intrinsics ? [image.intrinsics.fx, image.intrinsics.fy, image.intrinsics.cx, image.intrinsics.cy] : [])].join(",")]);
  }
  frame.aprilTags.forEach((tag) => {
    if (!Number.isSafeInteger(tag.id) || tag.id < 0) throw new Error("AprilTag id must be a non-negative integer");
    if (!tag.camera) throw new Error("AprilTag observation camera name cannot be empty");
    if (configuredCameras && !configuredCameras.has(tag.camera)) {
      throw new Error(`AprilTag observation references unconfigured camera '${tag.camera}'`);
    }
    if (!Number.isSafeInteger(tag.captureTimeMs) || !Number.isSafeInteger(tag.availableTimeMs)
        || tag.captureTimeMs < 0 || tag.captureTimeMs > frame.simulationTimeMs
        || tag.availableTimeMs < tag.captureTimeMs) {
      throw new Error(`AprilTag ${tag.id} has invalid capture/availability time`);
    }
    const numericFields = [tag.translation.x, tag.translation.y, tag.translation.z,
      tag.rotation.x, tag.rotation.y, tag.rotation.z, tag.rotation.w,
      tag.rangeMeters, tag.bearingRadians, tag.elevationRadians];
    numericFields.forEach((value, index) => assertFinite(value, `AprilTag ${tag.id} value ${index}`));
    const name = `${tag.id}:${tag.camera}`;
    if (seenTags.has(name)) throw new Error(`AprilTag ${tag.id} has duplicate observations for camera '${tag.camera}'`);
    seenTags.add(name);
    const serialized = [
      String(tag.id), encodeComponent(tag.camera), String(tag.captureTimeMs), String(tag.availableTimeMs),
      ...numericFields.map(String),
    ].join(",");
    entries.push([`tag:${name}`, serialized]);
  });
  return entries.map(([key, value]) => `${encodeComponent(key)}=${encodeComponent(value)}`).join("&");
}

function appendSensorMap<T>(
  entries: Array<[string, string]>,
  category: string,
  values: Record<string, T>,
  encode: (value: T, name: string) => string,
): void {
  for (const [name, value] of Object.entries(values)) {
    if (!name) throw new Error(`Configured ${category} sensor name cannot be empty`);
    entries.push([`${category}:${name}`, encode(value, name)]);
  }
}

function assertFinite(value: number | undefined, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be finite numeric data`);
  }
}

function encodeComponent(value: string): string {
  return encodeURIComponent(value).replaceAll(",", "%2C");
}

function encodeFlatRecord(values: object): string {
  return Object.entries(values as Record<string, number | boolean | undefined>)
    .filter((entry): entry is [string, number | boolean] => entry[1] !== undefined)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

function encodeMotorFeedback(values: Record<string, MotorSensorFrame>): string {
  return Object.entries(values).map(([name, value]) => [
    encodeURIComponent(name),
    value.positionTicks,
    value.velocityTicksPerSecond,
    value.currentAmps ?? 0,
    value.enabled ?? true,
  ].join(",")).join(";");
}

function encodeRobotSensorFeedback(value?: RobotSensorFrame): string {
  const sensors = value ?? {
    orientationRadians: { yaw: 0, pitch: 0, roll: 0 },
    angularVelocityRadiansPerSecond: { x: 0, y: 0, z: 0 },
    voltage: 12.5,
  };
  return [
    sensors.orientationRadians.yaw,
    sensors.orientationRadians.pitch,
    sensors.orientationRadians.roll,
    sensors.angularVelocityRadiansPerSecond.x,
    sensors.angularVelocityRadiansPerSecond.y,
    sensors.angularVelocityRadiansPerSecond.z,
    sensors.voltage,
  ].join(",");
}
