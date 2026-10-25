export { OPMODE_CHUNKED_TRANSPORT, OPMODE_TRANSPORT_CHUNK_CHARACTERS, OPMODE_TRANSPORT_MAX_BYTES, encodeOpModeTransportFrames, OpModeTransportDecoder } from "./transport";

/** Current asynchronous build/session contract. */
export const OPMODE_PROTOCOL_VERSION = 3 as const;
/** Kept for installed clients until they move to the asynchronous build contract. */
export const OPMODE_LEGACY_PROTOCOL_VERSION = 2 as const;
export const OPMODE_CONTROL_TICK_MILLIS = 20 as const;
export const OPMODE_MAX_PIPELINED_TICKS = 8 as const;
export const OPMODE_MAX_TICK_EXECUTION_MILLIS = 400 as const;
export const OPMODE_TICK_PIPELINE_TIMEOUT_MILLIS =
  OPMODE_MAX_PIPELINED_TICKS * OPMODE_MAX_TICK_EXECUTION_MILLIS + 1_000;
/** Shared browser/runner identity for the pinned SDK, Java API, and Kotlin compiler surface. */
export const JVM_TOOLCHAIN_CONTRACT_ID = "ftc-sdk-11.1.0-java-8-kotlin-2.2.10-v1" as const;

export type OpModePhase = "loaded" | "initialized" | "running" | "stopped" | "closed";
export type OpModeKind = "teleop" | "autonomous";

export interface ProgramSource {
  path: string;
  content: string;
}

export interface RepositorySnapshotFile {
  path: string;
  /** UTF-8 text or base64 encoded file bytes. */
  content: string;
  encoding: "utf8" | "base64";
}

export interface RepositorySnapshot {
  format: "ftc-repository-snapshot-v1";
  files: RepositorySnapshotFile[];
  sha256: string;
}

/** Physical motor metadata shared by browser physics and the JVM SDK shim. */
export interface SimulatedMotorDescriptor {
  name: string;
  /** Stable FTC configuration/model identifier, such as RevRobotics20HDHexMotor. */
  modelId: string;
  ticksPerRevolution: number;
  maxRpm: number;
  /** Realistic fraction of theoretical free speed, greater than 0 and at most 1. */
  achievableMaxRpmFraction: number;
}

/** Physical device type exposed through FTC HardwareMap. */
export interface SimulatedSensorDescriptor {
  name: string;
  kind: "digital" | "analog" | "distance" | "color" | "odometry" | "pinpoint";
}

/** Name of a simulator-owned camera device exposed as an FTC WebcamName. */
export interface SimulatedCameraDescriptor {
  name: string;
}

export const LEGACY_SIMULATED_MOTOR_PROFILE = {
  modelId: "legacy-generic-537.7",
  ticksPerRevolution: 537.7,
  maxRpm: 2800 * 60 / 537.7,
  achievableMaxRpmFraction: 1,
} as const;

export interface SimulatedHardwareManifest {
  /** String names remain accepted for protocol compatibility and normalize to the legacy profile. */
  motors: Array<string | SimulatedMotorDescriptor>;
  servos?: string[];
  /** Configured sensor devices. Only these named readings are exposed to TeamCode. */
  sensors?: SimulatedSensorDescriptor[];
  /** Cameras remain world-owned; the JVM shim exposes only these configured device names. */
  cameras?: SimulatedCameraDescriptor[];
  /** Canonical semantic robot-configuration hash; graph layout is intentionally excluded. */
  configurationHash?: string;
}

export interface DiscoveredOpMode {
  className: string;
  displayName: string;
  group: string;
  kind: OpModeKind;
  /** Build success is independent of whether this class can run in the simulator. */
  runtimeSupported?: boolean;
  runtimeDiagnostics?: BuildDiagnostic[];
}

export interface BuildDiagnostic {
  kind: "error" | "warning" | "note";
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
}

export interface GamepadSnapshot {
  left_stick_x?: number;
  left_stick_y?: number;
  right_stick_x?: number;
  right_stick_y?: number;
  left_trigger?: number;
  right_trigger?: number;
  a?: boolean;
  b?: boolean;
  x?: boolean;
  y?: boolean;
  cross?: boolean;
  circle?: boolean;
  square?: boolean;
  triangle?: boolean;
  dpad_up?: boolean;
  dpad_down?: boolean;
  dpad_left?: boolean;
  dpad_right?: boolean;
  left_bumper?: boolean;
  right_bumper?: boolean;
  left_stick_button?: boolean;
  right_stick_button?: boolean;
  start?: boolean;
  options?: boolean;
  back?: boolean;
  share?: boolean;
  guide?: boolean;
  ps?: boolean;
  touchpad?: boolean;
}

export interface MotorSensorFrame {
  positionTicks: number;
  velocityTicksPerSecond: number;
  currentAmps?: number;
  enabled?: boolean;
}

/** Browser-physics feedback for the default Control Hub IMU and voltage sensor. */
export interface RobotSensorFrame {
  orientationRadians: {
    yaw: number;
    pitch: number;
    roll: number;
  };
  angularVelocityRadiansPerSecond: {
    x: number;
    y: number;
    z: number;
  };
  voltage: number;
}

/** A rendered robot-mounted camera exposure, encoded independently of geometric detections. */
export interface SimulatedCameraFrame {
  camera: string;
  captureTimeMs: number;
  width: number;
  height: number;
  /** Exact pinhole projection used for this raster; absent for legacy producers. */
  intrinsics?: { fx: number; fy: number; cx: number; cy: number };
  /** Top-left origin JPEG image. Bounded to 512 KiB decoded per camera. */
  imageBase64: string;
}

/** Timestamped sensor snapshot shared with the simulation world and persistent JVM worker. */
export interface WorldRobotSensorFrame {
  robotId: string;
  tick: number;
  simulationTimeMs: number;
  orientation: { yawRadians: number; pitchRadians: number; rollRadians: number };
  angularVelocity: { x: number; y: number; z: number };
  voltage: number;
  currentAmps: number;
  cameraFrames?: SimulatedCameraFrame[];
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

export interface MotorActuatorFrame {
  power: number;
  direction: "FORWARD" | "REVERSE";
  mode: "RUN_WITHOUT_ENCODER" | "RUN_USING_ENCODER" | "RUN_TO_POSITION" | "STOP_AND_RESET_ENCODER";
  zeroPowerBehavior: "BRAKE" | "FLOAT";
  enabled: boolean;
  targetPosition: number;
  targetPositionTolerance: number;
  velocitySetpointTicksPerSecond: number | null;
}

/** One item within an FTC telemetry row, in TeamCode insertion order. */
export interface TelemetryItemFrame {
  caption: string;
  value: string;
  retained: boolean;
}

/**
 * An FTC telemetry display row. Top-level addData calls produce `item` rows; addLine calls
 * produce `line` rows whose items remain grouped in the order TeamCode appended them.
 */
export interface TelemetryRowFrame {
  kind: "item" | "line";
  caption: string;
  composed: string;
  items: TelemetryItemFrame[];
}

/** A complete telemetry publication, emitted only when its revision changes. */
export interface TelemetryUpdateFrame {
  revision: number;
  simulationTimeMillis: number;
  rows: TelemetryRowFrame[];
  log: string[];
  displayFormat: "CLASSIC" | "MONOSPACE" | "HTML";
  captionValueSeparator: string;
  itemSeparator: string;
  autoClear: boolean;
  transmissionIntervalMillis: number;
}

export interface SimulationFrame {
  sequence: number;
  phase: OpModePhase;
  /** LinearOpMode runOpMode() returned normally; match/session phase can remain running. */
  programStatus?: "running" | "completed";
  simulationTimeMillis: number;
  /** Cameras with active pixel consumers. Missing on legacy runners; [] needs no JPEGs. */
  cameraFrameRequests?: string[];
  motors: Record<string, MotorActuatorFrame>;
  servos: Record<string, { position: number; direction: "FORWARD" | "REVERSE" }>;
  /** @deprecated Use telemetryUpdate for ordered rows. Kept during the UI migration. */
  telemetry: Record<string, string>;
  telemetryRevision: number;
  /** Present only when a new telemetry revision was published, avoiding 50Hz duplicate payloads. */
  telemetryUpdate?: TelemetryUpdateFrame;
  capturedStdout: string;
  capturedStdoutTruncated: boolean;
  /** Bounded, read-only TeamCode fields captured at the control barrier in debug mode. */
  variables?: DebugVariable[];
  haptics?: {
    gamepad1?: { weakMagnitude: number; strongMagnitude: number; durationMillis: number };
    gamepad2?: { weakMagnitude: number; strongMagnitude: number; durationMillis: number };
  };
}

interface ClientMessageBase {
  protocolVersion: typeof OPMODE_PROTOCOL_VERSION;
  requestId: string;
}

export interface LoadProgramMessage extends ClientMessageBase {
  command: "load";
  sources: ProgramSource[];
  hardware: SimulatedHardwareManifest;
}

export interface BuildProgramMessage extends ClientMessageBase {
  command: "build";
  repositorySnapshot: RepositorySnapshot;
  hardware: SimulatedHardwareManifest;
}

/** Source-only compilation against dependencies already loaded in this session. */
export interface ReloadSourcesMessage extends ClientMessageBase {
  command: "reload-sources";
  sources: ProgramSource[];
}

export interface HotReloadResult {
  sourceHash: string;
  opModes: DiscoveredOpMode[];
  diagnostics: BuildDiagnostic[];
  durationMs: number;
}

export interface InitMessage extends ClientMessageBase {
  command: "init";
  entryClass: string;
  /** Optional only for legacy/sensor-free v3 sessions. */
  sensors?: WorldRobotSensorFrame;
  debug?: DebugConfiguration;
}

export interface DebugBreakpoint {
  id: string;
  path: string;
  line: number;
  enabled: boolean;
}

export interface DebugVariable {
  name: string;
  type: string;
  value: string;
  children?: DebugVariable[];
  truncated?: boolean;
  error?: string;
}

export interface DebugStackFrame {
  id: number;
  path?: string;
  line: number;
  method: string;
  variables: DebugVariable[];
  error?: string;
}

export interface DebugConfiguration {
  breakpoints: DebugBreakpoint[];
  sourcePaths: string[];
  watches: string[];
}

export interface DebugState {
  status: "disabled" | "running" | "paused";
  reason?: string;
  threadId?: string;
  frames: DebugStackFrame[];
  watches: DebugVariable[];
  breakpoints: Array<DebugBreakpoint & { verified: boolean; message?: string }>;
}

export interface DebugMessage extends ClientMessageBase {
  command: "debug";
  action: "configure" | "pause" | "continue" | "step-over" | "step-in" | "step-out" | "inspect";
  configuration?: DebugConfiguration;
  frameId?: number;
}

export interface HandoffMessage extends ClientMessageBase {
  command: "handoff";
  entryClass: string;
  sensors: WorldRobotSensorFrame;
}

export interface TransitionMessage extends ClientMessageBase {
  command: "start" | "stop" | "reset" | "close";
}

/** Retain the JVM through passive match phases without advancing user code. */
export interface HeartbeatMessage extends ClientMessageBase {
  command: "heartbeat";
}

export interface TickMessage extends ClientMessageBase {
  command: "tick";
  sequence: number;
  deltaMillis: typeof OPMODE_CONTROL_TICK_MILLIS;
  gamepad1: GamepadSnapshot;
  gamepad2: GamepadSnapshot;
  motors: Record<string, MotorSensorFrame>;
  /** Omitted clients receive a deterministic level pose, zero angular rate, and 12.5 V. */
  sensors?: RobotSensorFrame | WorldRobotSensorFrame;
}

export type BuildJobStage = "queued" | "resolving" | "compiling" | "discovering" | "ready" | "failed";

export interface BuildJobProgress {
  jobId: string;
  requestId: string;
  stage: BuildJobStage;
  message: string;
}

export interface BuildArtifactBundle {
  format: "ftc-teamcode-artifact-v1";
  sha256: string;
  encoding: "base64";
  content: string;
  /** Ordered classpath roots inside the ZIP; teamcode/classes must be first. */
  runtimeClasspath: string[];
}

export interface LoadArtifact {
  artifactId: string;
  artifactHash: string;
  repositorySnapshotHash: string;
  resolvedDependencies: string[];
  sourceHash: string;
  sdkVersion: "11.1.0";
  javaTarget: "8";
  kotlinVersion: "2.2.10";
  opModes: DiscoveredOpMode[];
  diagnostics: BuildDiagnostic[];
  /** Present on the browser build result; the runner stores only bundle metadata. */
  artifactBundle?: BuildArtifactBundle;
  /** Exact editable source set reported by the build, when fast compilation is safe. */
  hotReload?: { sourcePaths: string[] };
}

export interface LoadArtifactProgramMessage extends ClientMessageBase {
  command: "load-artifact";
  artifact: LoadArtifact;
  artifactBundle: BuildArtifactBundle;
  hardware: SimulatedHardwareManifest;
}

export type OpModeClientMessage =
  | BuildProgramMessage
  | ReloadSourcesMessage
  | LoadArtifactProgramMessage
  | LoadProgramMessage
  | InitMessage
  | HandoffMessage
  | DebugMessage
  | HeartbeatMessage
  | TransitionMessage
  | TickMessage;

export type OpModeServerMessage =
  | {
      protocolVersion: typeof OPMODE_PROTOCOL_VERSION;
      type: "debug";
      state: DebugState;
    }
  | {
      protocolVersion: typeof OPMODE_PROTOCOL_VERSION;
      type: "response";
      requestId: string;
      command: "build";
      status: "accepted";
      buildJobId: string;
    }
  | {
      protocolVersion: typeof OPMODE_PROTOCOL_VERSION | typeof OPMODE_LEGACY_PROTOCOL_VERSION;
      type: "build-job";
      jobId: string;
      requestId: string;
      stage: BuildJobStage;
      message: string;
      artifact?: LoadArtifact;
      artifactBundle?: BuildArtifactBundle;
      error?: { code: string; message: string; diagnostics?: BuildDiagnostic[] };
    }
  | {
      protocolVersion: typeof OPMODE_PROTOCOL_VERSION | typeof OPMODE_LEGACY_PROTOCOL_VERSION;
      type: "response";
      requestId: string;
      command: OpModeClientMessage["command"];
      status: "ok";
      artifact?: LoadArtifact;
      reload?: HotReloadResult;
      debug?: DebugState;
      frame?: SimulationFrame;
    }
  | {
      protocolVersion: typeof OPMODE_PROTOCOL_VERSION | typeof OPMODE_LEGACY_PROTOCOL_VERSION;
      type: "response";
      requestId: string;
      command?: OpModeClientMessage["command"];
      status: "error";
      error: {
        code: string;
        message: string;
        diagnostics?: BuildDiagnostic[];
      };
      frame?: SimulationFrame;
    }
  | {
      protocolVersion: typeof OPMODE_PROTOCOL_VERSION | typeof OPMODE_LEGACY_PROTOCOL_VERSION;
      type: "event";
      event: "runtime-error" | "heartbeat-expired";
      error: { code: string; message: string };
      frame: SimulationFrame;
    };

export interface SessionTicketResponse {
  protocolVersion: typeof OPMODE_PROTOCOL_VERSION | typeof OPMODE_LEGACY_PROTOCOL_VERSION;
  ticket: string;
  expiresAt: string;
  websocketPath: "/v2/session" | "/v3/session";
  /** Supplied by the authenticated web gateway; never derived from browser input. */
  websocketUrl?: string;
}

export interface LegacySessionTicketResponse {
  protocolVersion: typeof OPMODE_LEGACY_PROTOCOL_VERSION;
  ticket: string;
  expiresAt: string;
  websocketPath: "/v2/session";
  websocketUrl?: string;
}
