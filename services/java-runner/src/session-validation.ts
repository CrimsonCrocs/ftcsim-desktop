import { validateCameraFrames } from "./camera-frame";
import {
  OPMODE_CONTROL_TICK_MILLIS,
  OPMODE_LEGACY_PROTOCOL_VERSION,
  OPMODE_PROTOCOL_VERSION,
  type GamepadSnapshot,
  type MotorSensorFrame,
  type OpModeClientMessage,
  type BuildProgramMessage,
  type BuildDiagnostic,
  type BuildArtifactBundle,
  type LoadArtifact,
  type LoadArtifactProgramMessage,
  type RepositorySnapshot,
  type RobotSensorFrame,
  type SimulatedMotorDescriptor,
  type SimulatedCameraDescriptor,
  type SimulatedSensorDescriptor,
  type WorldRobotSensorFrame,
} from "@ftc-studio/opmode-protocol";

import {
  LIMITS,
  PayloadValidationError,
  validateCompilePayload,
  validateMotorDescriptors,
} from "./validation";
import { isStandardBase64 } from "./base64";
import { validateDebugConfiguration, validateDebugMessage } from "./debug-validation";
import { decodeRepositorySnapshot, hasGradleProject } from "../../../tools/gradle/gradle-adapter";

const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;
const COMMANDS = new Set(["build", "load-artifact", "reload-sources", "load", "init", "handoff", "heartbeat", "start", "tick", "stop", "reset", "close", "debug"]);
const GAMEPAD_FIELDS = new Set([
  "left_stick_x", "left_stick_y", "right_stick_x", "right_stick_y",
  "left_trigger", "right_trigger", "a", "b", "x", "y", "cross", "circle",
  "square", "triangle", "dpad_up", "dpad_down", "dpad_left", "dpad_right",
  "left_bumper", "right_bumper", "left_stick_button", "right_stick_button",
  "start", "options", "back", "share", "guide", "ps", "touchpad",
]);

export function validateSessionMessage(value: unknown): OpModeClientMessage {
  const issues: string[] = [];
  if (!isRecord(value)) throw new PayloadValidationError(["message must be a JSON object"]);
  const incomingVersion = value.protocolVersion;
  if (incomingVersion !== OPMODE_PROTOCOL_VERSION
      && incomingVersion !== OPMODE_LEGACY_PROTOCOL_VERSION) {
    issues.push(`protocolVersion must be ${OPMODE_PROTOCOL_VERSION} or ${OPMODE_LEGACY_PROTOCOL_VERSION}`);
  }
  if (typeof value.requestId !== "string" || !REQUEST_ID.test(value.requestId)) {
    issues.push("requestId must contain 1 through 64 safe characters");
  }
  if (typeof value.command !== "string" || !COMMANDS.has(value.command)) {
    issues.push("command is not supported");
  }
  if (issues.length > 0) throw new PayloadValidationError(issues);

  const command = value.command as OpModeClientMessage["command"];
  if (command === "debug") return validateDebugMessage(value);
  if (command === "build") {
    if (incomingVersion !== OPMODE_PROTOCOL_VERSION) {
      throw new PayloadValidationError(["asynchronous build jobs require protocolVersion 3"]);
    }
    return validateBuild(value);
  }
  if (command === "load-artifact") {
    if (incomingVersion !== OPMODE_PROTOCOL_VERSION) {
      throw new PayloadValidationError(["artifact loading requires protocolVersion 3"]);
    }
    return validateLoadArtifact(value);
  }
  if (command === "reload-sources") {
    if (incomingVersion !== OPMODE_PROTOCOL_VERSION) throw new PayloadValidationError(["Hot Reload requires protocolVersion 3"]);
    const issues = unknownKeys(value, new Set(["protocolVersion", "requestId", "command", "sources"]));
    const sources: Array<{path: string; content: string}> = [];
    const paths = new Set<string>();
    let bytes = 0;
    if (!Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > 512) {
      issues.push("Hot Reload requires 1 through 512 source files");
    } else for (const source of value.sources) {
      if (!isRecord(source) || typeof source.path !== "string" || typeof source.content !== "string"
          || !/\.(java|kt)$/u.test(source.path) || source.path.length > 1024
          || source.path.startsWith("/") || source.path.includes("\\") || source.path.includes("\0")
          || /^[A-Za-z]:/u.test(source.path) || source.path.split("/").some((part) => !part || part === "." || part === "..")
          || paths.has(source.path)) {
        issues.push("Hot Reload sources require unique normalized Java/Kotlin paths and text content");
        continue;
      }
      paths.add(source.path);
      bytes += Buffer.byteLength(source.content, "utf8");
      sources.push({ path: source.path, content: source.content });
    }
    if (bytes > 8 * 1024 * 1024) issues.push("Hot Reload sources exceed 8 MiB");
    if (issues.length) throw new PayloadValidationError(issues);
    return { protocolVersion: OPMODE_PROTOCOL_VERSION, requestId: value.requestId as string, command, sources };
  }
  if (command === "load") return validateLoad(value);
  if (command === "tick") return validateTick(value);
  if (command === "handoff") {
    if (incomingVersion !== OPMODE_PROTOCOL_VERSION) {
      throw new PayloadValidationError(["OpMode handoff requires protocolVersion 3"]);
    }
    return validateHandoff(value);
  }
  return validateTransition(value, command);
}

const ARTIFACT_BASE64_MAX_CHARS = 89_478_486;

function validateLoadArtifact(value: Record<string, unknown>): LoadArtifactProgramMessage {
  const allowed = new Set([
    "protocolVersion", "requestId", "command", "artifact", "artifactBundle", "hardware",
  ]);
  const issues = unknownKeys(value, allowed);
  const hardware = validateHardware(value.hardware, issues);
  const artifact = validateArtifact(value.artifact, issues);
  const bundle = validateArtifactBundle(value.artifactBundle, artifact?.artifactHash, issues);
  if (issues.length > 0 || !artifact || !bundle) throw new PayloadValidationError(issues);
  return {
    protocolVersion: OPMODE_PROTOCOL_VERSION,
    requestId: value.requestId as string,
    command: "load-artifact",
    artifact,
    artifactBundle: bundle,
    hardware,
  };
}

function validateArtifact(value: unknown, issues: string[]): LoadArtifact | undefined {
  if (!isRecord(value)) {
    issues.push("artifact must be an object");
    return undefined;
  }
  const allowed = new Set([
    "artifactId", "artifactHash", "repositorySnapshotHash", "resolvedDependencies", "sourceHash",
    "sdkVersion", "javaTarget", "kotlinVersion", "opModes", "diagnostics", "artifactBundle", "hotReload",
  ]);
  issues.push(...unknownKeys(value, allowed, "artifact"));
  for (const name of ["artifactHash", "repositorySnapshotHash", "sourceHash"] as const) {
    if (typeof value[name] !== "string" || !/^[a-f0-9]{64}$/u.test(value[name] as string)) {
      issues.push(`artifact.${name} must be a lowercase SHA-256 digest`);
    }
  }
  if (typeof value.artifactId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/u.test(value.artifactId)) {
    issues.push("artifact.artifactId must contain 1 through 128 safe characters");
  }
  if (value.sdkVersion !== "11.1.0" || value.javaTarget !== "8" || value.kotlinVersion !== "2.2.10") {
    issues.push("artifact toolchain versions do not match the runner contract");
  }
  const hotReload = value.hotReload === undefined ? undefined : isRecord(value.hotReload)
    ? { sourcePaths: validateStringArray(value.hotReload.sourcePaths, "artifact.hotReload.sourcePaths", 512, 1024, issues) }
    : undefined;
  if (value.hotReload !== undefined && !hotReload) issues.push("artifact.hotReload is invalid");
  const resolvedDependencies = validateStringArray(value.resolvedDependencies, "artifact.resolvedDependencies", 1_024, 512, issues);
  const diagnostics = validateDiagnostics(value.diagnostics, "artifact.diagnostics", issues);
  const opModes: LoadArtifact["opModes"] = [];
  if (!Array.isArray(value.opModes) || value.opModes.length > 512) {
    issues.push("artifact.opModes must be an array of at most 512 entries");
  } else {
    const classes = new Set<string>();
    value.opModes.forEach((raw, index) => {
      if (!isRecord(raw)) {
        issues.push(`artifact.opModes[${index}] must be an object`);
        return;
      }
      const itemAllowed = new Set([
        "className", "displayName", "group", "kind", "runtimeSupported", "runtimeDiagnostics",
      ]);
      issues.push(...unknownKeys(raw, itemAllowed, `artifact.opModes[${index}]`));
      const className = raw.className;
      const displayName = raw.displayName;
      const group = raw.group;
      const kind = raw.kind;
      if (typeof className !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/u.test(className)) {
        issues.push(`artifact.opModes[${index}].className is invalid`);
      }
      if (typeof displayName !== "string" || displayName.length > 256) {
        issues.push(`artifact.opModes[${index}].displayName is invalid`);
      }
      if (typeof group !== "string" || group.length > 256) {
        issues.push(`artifact.opModes[${index}].group is invalid`);
      }
      if (kind !== "teleop" && kind !== "autonomous") {
        issues.push(`artifact.opModes[${index}].kind is invalid`);
      }
      if (raw.runtimeSupported !== undefined && typeof raw.runtimeSupported !== "boolean") {
        issues.push(`artifact.opModes[${index}].runtimeSupported must be boolean`);
      }
      const runtimeDiagnostics = raw.runtimeDiagnostics === undefined
        ? undefined
        : validateDiagnostics(raw.runtimeDiagnostics, `artifact.opModes[${index}].runtimeDiagnostics`, issues);
      if (typeof className === "string" && typeof displayName === "string"
          && typeof group === "string" && (kind === "teleop" || kind === "autonomous")) {
        if (classes.has(className)) issues.push(`artifact.opModes[${index}].className is duplicated`);
        classes.add(className);
        opModes.push({
          className,
          displayName,
          group,
          kind,
          ...(typeof raw.runtimeSupported === "boolean" ? { runtimeSupported: raw.runtimeSupported } : {}),
          ...(runtimeDiagnostics ? { runtimeDiagnostics } : {}),
        });
      }
    });
  }
  if (typeof value.artifactId !== "string"
      || typeof value.artifactHash !== "string"
      || typeof value.repositorySnapshotHash !== "string"
      || typeof value.sourceHash !== "string"
      || !Array.isArray(value.resolvedDependencies)
      || !Array.isArray(value.diagnostics)) return undefined;
  return {
    artifactId: value.artifactId,
    artifactHash: value.artifactHash,
    repositorySnapshotHash: value.repositorySnapshotHash,
    resolvedDependencies,
    sourceHash: value.sourceHash,
    sdkVersion: "11.1.0",
    javaTarget: "8",
    kotlinVersion: "2.2.10",
    opModes,
    diagnostics,
    ...(hotReload ? { hotReload } : {}),
  };
}

function validateArtifactBundle(
  value: unknown,
  artifactHash: string | undefined,
  issues: string[],
): BuildArtifactBundle | undefined {
  if (!isRecord(value)) {
    issues.push("artifactBundle must be an object");
    return undefined;
  }
  issues.push(...unknownKeys(value, new Set(["format", "sha256", "encoding", "content", "runtimeClasspath"]), "artifactBundle"));
  if (value.format !== "ftc-teamcode-artifact-v1" || value.encoding !== "base64") {
    issues.push("artifactBundle format or encoding is unsupported");
  }
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.sha256)
      || (artifactHash !== undefined && value.sha256 !== artifactHash)) {
    issues.push("artifactBundle.sha256 must match artifact.artifactHash");
  }
  if (typeof value.content !== "string" || value.content.length > ARTIFACT_BASE64_MAX_CHARS
      || !isStandardBase64(value.content)) {
    issues.push("artifactBundle.content must be valid base64 within the 64 MiB compressed-artifact limit");
  }
  const runtimeClasspath = validateStringArray(value.runtimeClasspath, "artifactBundle.runtimeClasspath", 256, 1_024, issues);
  if (runtimeClasspath[0] !== "teamcode/classes") {
    issues.push("artifactBundle.runtimeClasspath must begin with teamcode/classes");
  }
  for (const path of runtimeClasspath) {
    if (path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
      issues.push(`artifactBundle.runtimeClasspath contains an invalid path: ${path}`);
    }
  }
  if (value.format !== "ftc-teamcode-artifact-v1" || value.encoding !== "base64"
      || typeof value.sha256 !== "string" || typeof value.content !== "string") return undefined;
  return {
    format: "ftc-teamcode-artifact-v1",
    sha256: value.sha256,
    encoding: "base64",
    content: value.content,
    runtimeClasspath,
  };
}

function validateStringArray(
  value: unknown,
  field: string,
  maxLength: number,
  itemLength: number,
  issues: string[],
): string[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    issues.push(`${field} must be an array of at most ${maxLength} entries`);
    return [];
  }
  return value.flatMap((entry, index) => {
    if (typeof entry !== "string" || entry.length > itemLength) {
      issues.push(`${field}[${index}] must be a string of at most ${itemLength} characters`);
      return [];
    }
    return [entry];
  });
}

function validateDiagnostics(value: unknown, field: string, issues: string[]): BuildDiagnostic[] {
  if (!Array.isArray(value) || value.length > 4_096) {
    issues.push(`${field} must be an array of at most 4096 entries`);
    return [];
  }
  return value.flatMap((raw, index) => {
    if (!isRecord(raw)
        || (raw.kind !== "error" && raw.kind !== "warning" && raw.kind !== "note")
        || typeof raw.message !== "string" || raw.message.length > 8_000) {
      issues.push(`${field}[${index}] is invalid`);
      return [];
    }
    if (raw.file !== undefined && (typeof raw.file !== "string" || raw.file.length > 1_024)) {
      issues.push(`${field}[${index}].file is invalid`);
    }
    if (raw.line !== undefined && (!Number.isSafeInteger(raw.line) || (raw.line as number) < 1)) {
      issues.push(`${field}[${index}].line is invalid`);
    }
    if (raw.column !== undefined && (!Number.isSafeInteger(raw.column) || (raw.column as number) < 1)) {
      issues.push(`${field}[${index}].column is invalid`);
    }
    if (raw.code !== undefined && (typeof raw.code !== "string" || raw.code.length > 128)) {
      issues.push(`${field}[${index}].code is invalid`);
    }
    return [{
      kind: raw.kind,
      message: raw.message,
      ...(typeof raw.file === "string" ? { file: raw.file } : {}),
      ...(typeof raw.line === "number" ? { line: raw.line } : {}),
      ...(typeof raw.column === "number" ? { column: raw.column } : {}),
      ...(typeof raw.code === "string" ? { code: raw.code } : {}),
    }];
  });
}

function validateBuild(value: Record<string, unknown>): BuildProgramMessage {
  const allowed = new Set(["protocolVersion", "requestId", "command", "repositorySnapshot", "hardware"]);
  const issues = unknownKeys(value, allowed);
  const hardware = validateHardware(value.hardware, issues);
  const snapshot = value.repositorySnapshot;
  if (!isRecord(snapshot)
      || snapshot.format !== "ftc-repository-snapshot-v1"
      || typeof snapshot.sha256 !== "string"
      || !Array.isArray(snapshot.files)) {
    issues.push("repositorySnapshot must use the ftc-repository-snapshot-v1 format");
  } else {
    try {
      const decoded = decodeRepositorySnapshot(snapshot as unknown as RepositorySnapshot);
      if (!hasGradleProject(snapshot.files as RepositorySnapshot["files"])) {
        issues.push("v3 build requires a root settings.gradle or build.gradle project");
      }
      if (!decoded.some(({ path }) => /\.(?:java|kt)$/u.test(path))) {
        issues.push("repositorySnapshot must contain at least one Java or Kotlin source file");
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : "repositorySnapshot is invalid");
    }
  }
  if (issues.length > 0) throw new PayloadValidationError(issues);
  return {
    protocolVersion: OPMODE_PROTOCOL_VERSION,
    requestId: value.requestId as string,
    command: "build",
    repositorySnapshot: snapshot as unknown as RepositorySnapshot,
    hardware,
  };
}

function validateLoad(value: Record<string, unknown>): OpModeClientMessage {
  const allowed = new Set(["protocolVersion", "requestId", "command", "sources", "hardware"]);
  const issues = unknownKeys(value, allowed);
  const hardware = validateHardware(value.hardware, issues);
  const rawSources = value.sources;
  const kotlinSources = Array.isArray(rawSources)
    ? rawSources.filter((source) => isRecord(source)
      && typeof source.path === "string" && source.path.endsWith(".kt"))
    : [];
  let sources: Array<{ path: string; content: string }> = [];
  if (kotlinSources.length > 0) {
    sources = validateMixedSources(rawSources, issues);
  } else {
    try {
      sources = validateCompilePayload({
        protocolVersion: 1,
        entryClass: "org.firstinspires.ftc.teamcode.SessionDiscovery",
        sources: rawSources,
      }).sources;
    } catch (error) {
      if (error instanceof PayloadValidationError) issues.push(...error.issues);
      else throw error;
    }
  }
  if (issues.length > 0) throw new PayloadValidationError(issues);
  return {
    protocolVersion: OPMODE_PROTOCOL_VERSION,
    requestId: value.requestId as string,
    command: "load",
    sources,
    hardware,
  };
}

function validateTransition(
  value: Record<string, unknown>,
  command: "init" | "start" | "stop" | "reset" | "close" | "heartbeat",
): OpModeClientMessage {
  const allowed = new Set(["protocolVersion", "requestId", "command", "entryClass", ...(command === "init" ? ["sensors", "debug"] : [])]);
  const issues = unknownKeys(value, allowed);
  let sensors: WorldRobotSensorFrame | undefined;
  if (command === "init") {
    if (value.debug !== undefined && value.protocolVersion !== OPMODE_PROTOCOL_VERSION) issues.push("Debugging requires protocolVersion 3");
    if (typeof value.entryClass !== "string"
        || !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(value.entryClass)) {
      issues.push("entryClass must be a fully qualified Java or Kotlin class name");
    }
    if (value.sensors !== undefined) sensors = validateWorldRobotSensorFrame(value.sensors, "sensors", issues);
  } else if (value.entryClass !== undefined) {
    issues.push(`entryClass is not valid for ${command}`);
  }
  if (issues.length > 0) throw new PayloadValidationError(issues);
  if (command === "init") {
    return {
      protocolVersion: OPMODE_PROTOCOL_VERSION,
      requestId: value.requestId as string,
      command: "init",
      entryClass: value.entryClass as string,
      ...(sensors ? { sensors } : {}),
      ...(value.debug === undefined ? {} : { debug: validateDebugConfiguration(value.debug) }),
    };
  }
  return {
    protocolVersion: OPMODE_PROTOCOL_VERSION,
    requestId: value.requestId as string,
    command,
  };
}

function validateHandoff(value: Record<string, unknown>): OpModeClientMessage {
  const issues = unknownKeys(value, new Set(["protocolVersion", "requestId", "command", "entryClass", "sensors"]));
  if (typeof value.entryClass !== "string"
      || !/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/.test(value.entryClass)) {
    issues.push("entryClass must be a fully qualified Java or Kotlin class name");
  }
  const sensors = validateWorldRobotSensorFrame(value.sensors, "sensors", issues);
  if (issues.length > 0 || !sensors) throw new PayloadValidationError(issues);
  return {
    protocolVersion: OPMODE_PROTOCOL_VERSION,
    requestId: value.requestId as string,
    command: "handoff",
    entryClass: value.entryClass as string,
    sensors,
  };
}

function validateTick(value: Record<string, unknown>): OpModeClientMessage {
  const allowed = new Set([
    "protocolVersion", "requestId", "command", "sequence", "deltaMillis",
    "gamepad1", "gamepad2", "motors", "sensors",
  ]);
  const issues = unknownKeys(value, allowed);
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 0) {
    issues.push("sequence must be a non-negative safe integer");
  }
  if (value.deltaMillis !== OPMODE_CONTROL_TICK_MILLIS) {
    issues.push(`deltaMillis must be ${OPMODE_CONTROL_TICK_MILLIS}`);
  }
  const gamepad1 = validateGamepad(value.gamepad1, "gamepad1", issues);
  const gamepad2 = validateGamepad(value.gamepad2, "gamepad2", issues);
  const motors = validateMotorFrames(value.motors, issues);
  const sensors = value.sensors === undefined
    ? undefined
    : isRecord(value.sensors) && "robotId" in value.sensors
      ? validateWorldRobotSensorFrame(value.sensors, "sensors", issues)
      : validateRobotSensorFrame(value.sensors, issues);
  if (issues.length > 0) throw new PayloadValidationError(issues);
  return {
    protocolVersion: OPMODE_PROTOCOL_VERSION,
    requestId: value.requestId as string,
    command: "tick",
    sequence: value.sequence as number,
    deltaMillis: OPMODE_CONTROL_TICK_MILLIS,
    gamepad1,
    gamepad2,
    motors,
    ...(sensors ? { sensors } : {}),
  };
}

function validateRobotSensorFrame(
  value: unknown,
  issues: string[],
): RobotSensorFrame | undefined {
  if (!isRecord(value)) {
    issues.push("sensors must be an object");
    return undefined;
  }
  issues.push(...unknownKeys(
    value,
    new Set(["orientationRadians", "angularVelocityRadiansPerSecond", "voltage"]),
    "sensors",
  ));
  const orientation = validateVector3(
    value.orientationRadians,
    "sensors.orientationRadians",
    ["yaw", "pitch", "roll"],
    issues,
  );
  const angularVelocity = validateVector3(
    value.angularVelocityRadiansPerSecond,
    "sensors.angularVelocityRadiansPerSecond",
    ["x", "y", "z"],
    issues,
  );
  if (!isFiniteNumber(value.voltage) || value.voltage < 0 || value.voltage > 60) {
    issues.push("sensors.voltage must be finite and from 0 through 60 volts");
  }
  if (!orientation || !angularVelocity || !isFiniteNumber(value.voltage)
      || value.voltage < 0 || value.voltage > 60) return undefined;
  return {
    orientationRadians: {
      yaw: orientation.yaw,
      pitch: orientation.pitch,
      roll: orientation.roll,
    },
    angularVelocityRadiansPerSecond: {
      x: angularVelocity.x,
      y: angularVelocity.y,
      z: angularVelocity.z,
    },
    voltage: value.voltage,
  };
}

function validateWorldRobotSensorFrame(
  value: unknown,
  field: string,
  issues: string[],
): WorldRobotSensorFrame | undefined {
  if (!isRecord(value)) {
    issues.push(`${field} must be a timestamped world sensor frame`);
    return undefined;
  }
  issues.push(...unknownKeys(value, new Set([
    "robotId", "tick", "simulationTimeMs", "orientation", "angularVelocity", "voltage",
    "currentAmps", "motors", "digital", "analog", "distance", "color", "odometry", "aprilTags", "cameraFrames",
  ]), field));
  const robotId = value.robotId;
  const tick = value.tick;
  const simulationTimeMs = value.simulationTimeMs;
  if (typeof robotId !== "string" || robotId.length < 1 || robotId.length > 128
      || robotId !== robotId.trim() || [...robotId].some((character) => character.charCodeAt(0) < 0x20)) {
    issues.push(`${field}.robotId must be a trimmed non-empty identifier of at most 128 characters`);
  }
  if (!Number.isSafeInteger(tick) || (tick as number) < 0) issues.push(`${field}.tick must be a non-negative safe integer`);
  if (!Number.isSafeInteger(simulationTimeMs) || (simulationTimeMs as number) < 0) {
    issues.push(`${field}.simulationTimeMs must be a non-negative safe integer`);
  }
  const orientation = validateNamedVector(
    value.orientation, `${field}.orientation`, ["yawRadians", "pitchRadians", "rollRadians"], issues,
  );
  const angularVelocity = validateNamedVector(
    value.angularVelocity, `${field}.angularVelocity`, ["x", "y", "z"], issues,
  );
  if (!isFiniteNumber(value.voltage) || value.voltage < 0 || value.voltage > 60) {
    issues.push(`${field}.voltage must be finite and from 0 through 60 volts`);
  }
  if (!isFiniteNumber(value.currentAmps) || value.currentAmps < 0 || value.currentAmps > 10_000) {
    issues.push(`${field}.currentAmps must be finite and non-negative`);
  }
  const motors = validateMotorFrames(value.motors, issues);
  const digital = validateBooleanRecord(value.digital, `${field}.digital`, issues);
  const analog = validateNumericRecord(value.analog, `${field}.analog`, issues, 0, 60);
  const distance = validateNumericRecord(value.distance, `${field}.distance`, issues, 0, 1_000_000);
  const color = validateColorRecord(value.color, `${field}.color`, issues);
  const odometry = validateOdometryRecord(value.odometry, `${field}.odometry`, issues);
  const aprilTags = validateAprilTags(value.aprilTags, `${field}.aprilTags`, issues);
  let cameraFrames: ReturnType<typeof validateCameraFrames> = [];
  try { cameraFrames = validateCameraFrames(value.cameraFrames, Number(simulationTimeMs)); }
  catch (error) { issues.push(`${field}.${error instanceof Error ? error.message : "Invalid cameraFrames"}`); }
  if (typeof robotId !== "string" || typeof tick !== "number" || typeof simulationTimeMs !== "number"
      || !orientation || !angularVelocity || !isFiniteNumber(value.voltage)
      || !isFiniteNumber(value.currentAmps) || !Array.isArray(value.aprilTags)) return undefined;
  return {
    robotId,
    tick,
    simulationTimeMs,
    orientation: {
      yawRadians: orientation.yawRadians,
      pitchRadians: orientation.pitchRadians,
      rollRadians: orientation.rollRadians,
    },
    angularVelocity: { x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z },
    voltage: value.voltage,
    currentAmps: value.currentAmps,
    motors,
    digital,
    analog,
    distance,
    color,
    odometry,
    aprilTags,
    ...(cameraFrames?.length ? { cameraFrames } : {}),
  };
}

function validateNamedVector<K extends string>(
  value: unknown,
  field: string,
  keys: readonly [K, K, K],
  issues: string[],
): Record<K, number> | undefined {
  if (!isRecord(value)) {
    issues.push(`${field} must be an object`);
    return undefined;
  }
  issues.push(...unknownKeys(value, new Set(keys), field));
  const vector = {} as Record<K, number>;
  let valid = true;
  for (const key of keys) {
    if (!isFiniteNumber(value[key])) {
      issues.push(`${field}.${key} must be finite`);
      valid = false;
    } else vector[key] = value[key];
  }
  return valid ? vector : undefined;
}

function validateBooleanRecord(value: unknown, field: string, issues: string[]): Record<string, boolean> {
  if (!isRecord(value) || Object.keys(value).length > 256) {
    issues.push(`${field} must be an object with at most 256 readings`);
    return {};
  }
  const result: Record<string, boolean> = {};
  for (const [name, reading] of Object.entries(value)) {
    if (!isDeviceName(name)) issues.push(`${field} contains an invalid sensor name`);
    if (typeof reading !== "boolean") issues.push(`${field}.${name} must be boolean`);
    else result[name] = reading;
  }
  return result;
}

function validateNumericRecord(
  value: unknown,
  field: string,
  issues: string[],
  minimum: number,
  maximum: number,
): Record<string, number> {
  if (!isRecord(value) || Object.keys(value).length > 256) {
    issues.push(`${field} must be an object with at most 256 readings`);
    return {};
  }
  const result: Record<string, number> = {};
  for (const [name, reading] of Object.entries(value)) {
    if (!isDeviceName(name)) issues.push(`${field} contains an invalid sensor name`);
    if (!isFiniteNumber(reading) || reading < minimum || reading > maximum) {
      issues.push(`${field}.${name} must be finite and from ${minimum} through ${maximum}`);
    } else result[name] = reading;
  }
  return result;
}

function validateColorRecord(
  value: unknown,
  field: string,
  issues: string[],
): WorldRobotSensorFrame["color"] {
  if (!isRecord(value) || Object.keys(value).length > 256) {
    issues.push(`${field} must be an object with at most 256 readings`);
    return {};
  }
  const result: WorldRobotSensorFrame["color"] = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!isDeviceName(name)) issues.push(`${field} contains an invalid sensor name`);
    if (!isRecord(raw)) {
      issues.push(`${field}.${name} must be an RGBA object`);
      continue;
    }
    issues.push(...unknownKeys(raw, new Set(["red", "green", "blue", "alpha"]), `${field}.${name}`));
    const { red, green, blue, alpha } = raw;
    if (![red, green, blue, alpha].every(isFiniteNumber)) {
      issues.push(`${field}.${name} RGBA components must be finite`);
      continue;
    }
    result[name] = {
      red: red as number,
      green: green as number,
      blue: blue as number,
      alpha: alpha as number,
    };
  }
  return result;
}

function validateOdometryRecord(
  value: unknown,
  field: string,
  issues: string[],
): WorldRobotSensorFrame["odometry"] {
  if (!isRecord(value) || Object.keys(value).length > 256) {
    issues.push(`${field} must be an object with at most 256 readings`);
    return {};
  }
  const result: WorldRobotSensorFrame["odometry"] = {};
  const fields = ["xMeters", "yMeters", "headingRadians", "xVelocity", "yVelocity", "angularVelocity"] as const;
  for (const [name, raw] of Object.entries(value)) {
    if (!isDeviceName(name)) issues.push(`${field} contains an invalid sensor name`);
    if (!isRecord(raw)) {
      issues.push(`${field}.${name} must be an odometry object`);
      continue;
    }
    issues.push(...unknownKeys(raw, new Set(fields), `${field}.${name}`));
    const entries = fields.map((key) => raw[key]);
    if (!entries.every(isFiniteNumber)) {
      issues.push(`${field}.${name} values must be finite`);
      continue;
    }
    result[name] = {
      xMeters: raw.xMeters as number,
      yMeters: raw.yMeters as number,
      headingRadians: raw.headingRadians as number,
      xVelocity: raw.xVelocity as number,
      yVelocity: raw.yVelocity as number,
      angularVelocity: raw.angularVelocity as number,
    };
  }
  return result;
}

function validateAprilTags(
  value: unknown,
  field: string,
  issues: string[],
): WorldRobotSensorFrame["aprilTags"] {
  if (!Array.isArray(value) || value.length > 128) {
    issues.push(`${field} must be an array of at most 128 observations`);
    return [];
  }
  const result: WorldRobotSensorFrame["aprilTags"] = [];
  value.forEach((raw, index) => {
    const itemField = `${field}[${index}]`;
    if (!isRecord(raw)) {
      issues.push(`${itemField} must be an object`);
      return;
    }
    const fields = new Set([
      "id", "camera", "captureTimeMs", "availableTimeMs", "translation", "rotation",
      "rangeMeters", "bearingRadians", "elevationRadians",
    ]);
    issues.push(...unknownKeys(raw, fields, itemField));
    const translation = validateNamedVector(raw.translation, `${itemField}.translation`, ["x", "y", "z"], issues);
    const rotation = validateNamedQuaternion(raw.rotation, `${itemField}.rotation`, issues);
    if (!Number.isSafeInteger(raw.id) || (raw.id as number) < 0) issues.push(`${itemField}.id must be a non-negative integer`);
    if (typeof raw.camera !== "string" || !isDeviceName(raw.camera)) issues.push(`${itemField}.camera is invalid`);
    if (!Number.isSafeInteger(raw.captureTimeMs) || (raw.captureTimeMs as number) < 0
        || !Number.isSafeInteger(raw.availableTimeMs) || (raw.availableTimeMs as number) < (raw.captureTimeMs as number)) {
      issues.push(`${itemField} timestamps are invalid`);
    }
    const rangeMeters = raw.rangeMeters;
    const bearingRadians = raw.bearingRadians;
    const elevationRadians = raw.elevationRadians;
    if (!isFiniteNumber(rangeMeters) || rangeMeters < 0
        || !isFiniteNumber(bearingRadians) || !isFiniteNumber(elevationRadians)) {
      issues.push(`${itemField} range and angles must be finite`);
    }
    if (translation && rotation && Number.isSafeInteger(raw.id) && typeof raw.camera === "string"
        && Number.isSafeInteger(raw.captureTimeMs) && Number.isSafeInteger(raw.availableTimeMs)
        && isFiniteNumber(rangeMeters) && isFiniteNumber(bearingRadians) && isFiniteNumber(elevationRadians)) {
      result.push({
        id: raw.id as number,
        camera: raw.camera,
        captureTimeMs: raw.captureTimeMs as number,
        availableTimeMs: raw.availableTimeMs as number,
        translation,
        rotation,
        rangeMeters,
        bearingRadians,
        elevationRadians,
      });
    }
  });
  return result;
}

function validateNamedQuaternion(
  value: unknown,
  field: string,
  issues: string[],
): { x: number; y: number; z: number; w: number } | undefined {
  if (!isRecord(value)) {
    issues.push(`${field} must be a quaternion object`);
    return undefined;
  }
  issues.push(...unknownKeys(value, new Set(["x", "y", "z", "w"]), field));
  const { x, y, z, w } = value;
  if (![x, y, z, w].every(isFiniteNumber)) {
    issues.push(`${field} components must be finite`);
    return undefined;
  }
  return { x: x as number, y: y as number, z: z as number, w: w as number };
}

function isDeviceName(value: string): boolean {
  return value.length > 0 && value.length <= 128 && value === value.trim()
    && ![...value].some((character) => character.charCodeAt(0) < 0x20);
}

function validateVector3<K extends string>(
  value: unknown,
  field: string,
  keys: readonly [K, K, K],
  issues: string[],
): Record<K, number> | undefined {
  if (!isRecord(value)) {
    issues.push(`${field} must be an object`);
    return undefined;
  }
  issues.push(...unknownKeys(value, new Set(keys), field));
  const result = {} as Record<K, number>;
  let valid = true;
  for (const key of keys) {
    const component = value[key];
    if (!isFiniteNumber(component)) {
      issues.push(`${field}.${key} must be finite`);
      valid = false;
    } else result[key] = component;
  }
  return valid ? result : undefined;
}

function validateHardware(
  value: unknown,
  issues: string[],
): { motors: SimulatedMotorDescriptor[]; servos?: string[]; sensors?: SimulatedSensorDescriptor[]; cameras?: SimulatedCameraDescriptor[]; configurationHash?: string } {
  if (!isRecord(value)) {
    issues.push("hardware must be an object");
    return { motors: [] };
  }
  issues.push(...unknownKeys(value, new Set(["motors", "servos", "sensors", "cameras", "configurationHash"]), "hardware"));
  const motors = validateMotorDescriptors(value.motors, "hardware.motors", issues);
  const servos = deviceNames(value.servos ?? [], "hardware.servos", issues);
  const sensors = validateSensorDescriptors(value.sensors ?? [], issues);
  const cameras = validateCameraDescriptors(value.cameras ?? [], issues);
  const motorNames = motors.map((motor) => motor.name);
  const allNames = [...motorNames, ...servos, ...sensors.map(({ name }) => name), ...cameras.map(({ name }) => name)];
  if (new Set(allNames).size !== allNames.length) {
    issues.push("hardware names must be unique across device types");
  }
  const configurationHash = value.configurationHash;
  if (configurationHash !== undefined
      && (typeof configurationHash !== "string" || !/^[a-f0-9]{8,64}$/u.test(configurationHash))) {
    issues.push("hardware.configurationHash must be 8 through 64 lowercase hexadecimal characters");
  }
  return {
    motors,
    ...(servos.length ? { servos } : {}),
    ...(sensors.length ? { sensors } : {}),
    ...(cameras.length ? { cameras } : {}),
    ...(typeof configurationHash === "string" && /^[a-f0-9]{8,64}$/u.test(configurationHash)
      ? { configurationHash }
      : {}),
  };
}

function validateCameraDescriptors(value: unknown, issues: string[]): SimulatedCameraDescriptor[] {
  if (!Array.isArray(value) || value.length > 32) {
    issues.push("hardware.cameras must be an array of at most 32 entries");
    return [];
  }
  const result: SimulatedCameraDescriptor[] = [];
  value.forEach((raw, index) => {
    const field = `hardware.cameras[${index}]`;
    if (!isRecord(raw)) {
      issues.push(`${field} must be an object`);
      return;
    }
    issues.push(...unknownKeys(raw, new Set(["name"]), field));
    if (typeof raw.name !== "string" || !isDeviceName(raw.name)) {
      issues.push(`${field}.name must be a trimmed device name`);
      return;
    }
    result.push({ name: raw.name });
  });
  return result;
}

function validateSensorDescriptors(value: unknown, issues: string[]): SimulatedSensorDescriptor[] {
  if (!Array.isArray(value) || value.length > 128) {
    issues.push("hardware.sensors must be an array of at most 128 entries");
    return [];
  }
  const result: SimulatedSensorDescriptor[] = [];
  value.forEach((raw, index) => {
    const field = `hardware.sensors[${index}]`;
    if (!isRecord(raw)) {
      issues.push(`${field} must be an object`);
      return;
    }
    issues.push(...unknownKeys(raw, new Set(["name", "kind"]), field));
    if (typeof raw.name !== "string" || !isDeviceName(raw.name)) {
      issues.push(`${field}.name must be a trimmed device name`);
    }
    const kinds = ["digital", "analog", "distance", "color", "odometry", "pinpoint"] as const;
    if (typeof raw.kind !== "string" || !kinds.includes(raw.kind as typeof kinds[number])) {
      issues.push(`${field}.kind is not supported`);
    }
    if (typeof raw.name === "string" && isDeviceName(raw.name)
        && typeof raw.kind === "string" && kinds.includes(raw.kind as typeof kinds[number])) {
      result.push({ name: raw.name, kind: raw.kind as SimulatedSensorDescriptor["kind"] });
    }
  });
  return result;
}

function deviceNames(value: unknown, field: string, issues: string[]): string[] {
  if (!Array.isArray(value)) {
    issues.push(`${field} must be an array`);
    return [];
  }
  const names: string[] = [];
  value.forEach((name, index) => {
    if (typeof name !== "string" || name.length < 1 || name.length > 128 || name !== name.trim()) {
      issues.push(`${field}[${index}] must be a trimmed device name`);
    } else names.push(name);
  });
  return names;
}

function validateGamepad(value: unknown, field: string, issues: string[]): GamepadSnapshot {
  if (!isRecord(value)) {
    issues.push(`${field} must be an object`);
    return {};
  }
  const result: Record<string, number | boolean> = {};
  for (const [name, control] of Object.entries(value)) {
    if (!GAMEPAD_FIELDS.has(name)) {
      issues.push(`${field}.${name} is not supported`);
    } else if (name.includes("stick_") && !name.endsWith("button")) {
      if (typeof control !== "number" || !Number.isFinite(control) || control < -1 || control > 1) {
        issues.push(`${field}.${name} must be from -1 through 1`);
      } else result[name] = control;
    } else if (name.endsWith("trigger")) {
      if (typeof control !== "number" || !Number.isFinite(control) || control < 0 || control > 1) {
        issues.push(`${field}.${name} must be from 0 through 1`);
      } else result[name] = control;
    } else if (typeof control !== "boolean") {
      issues.push(`${field}.${name} must be boolean`);
    } else result[name] = control;
  }
  return result as GamepadSnapshot;
}

function validateMotorFrames(
  value: unknown,
  issues: string[],
): Record<string, MotorSensorFrame> {
  if (!isRecord(value)) {
    issues.push("motors must be an object");
    return {};
  }
  const result: Record<string, MotorSensorFrame> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!isRecord(raw)) {
      issues.push(`motors.${name} must be an object`);
      continue;
    }
    issues.push(...unknownKeys(
      raw,
      new Set(["positionTicks", "velocityTicksPerSecond", "currentAmps", "enabled"]),
      `motors.${name}`,
    ));
    const positionTicks = raw.positionTicks;
    const velocityTicksPerSecond = raw.velocityTicksPerSecond;
    const currentAmps = raw.currentAmps;
    const enabled = raw.enabled;
    if (!isFiniteNumber(positionTicks)) issues.push(`motors.${name}.positionTicks must be finite`);
    if (!isFiniteNumber(velocityTicksPerSecond)) {
      issues.push(`motors.${name}.velocityTicksPerSecond must be finite`);
    }
    if (currentAmps !== undefined
        && (!isFiniteNumber(currentAmps) || currentAmps < 0)) {
      issues.push(`motors.${name}.currentAmps must be finite and non-negative`);
    }
    if (enabled !== undefined && typeof enabled !== "boolean") {
      issues.push(`motors.${name}.enabled must be boolean`);
    }
    if (isFiniteNumber(positionTicks) && isFiniteNumber(velocityTicksPerSecond)) {
      result[name] = {
        positionTicks,
        velocityTicksPerSecond,
        ...(isFiniteNumber(currentAmps) ? { currentAmps } : {}),
        ...(typeof enabled === "boolean" ? { enabled } : {}),
      };
    }
  }
  return result;
}

function validateMixedSources(value: unknown, issues: string[]) {
  if (!Array.isArray(value) || value.length < 1 || value.length > LIMITS.sourceFiles) {
    issues.push(`sources must contain 1 through ${LIMITS.sourceFiles} files`);
    return [];
  }
  let total = 0;
  const paths = new Set<string>();
  return value.flatMap((source, index) => {
    if (!isRecord(source)
        || typeof source.path !== "string"
        || typeof source.content !== "string"
        || !/^(?:[A-Za-z_$][A-Za-z0-9_$-]*\/)*[A-Za-z_$][A-Za-z0-9_$-]*\.(?:java|kt)$/.test(source.path)) {
      issues.push(`sources[${index}] must have a normalized .java or .kt path and content`);
      return [];
    }
    if (paths.has(source.path)) issues.push(`sources[${index}].path is duplicated`);
    paths.add(source.path);
    const bytes = new TextEncoder().encode(source.content).byteLength;
    total += bytes;
    if (bytes > LIMITS.sourceFileBytes) issues.push(`sources[${index}] is too large`);
    if (total > LIMITS.sourceTotalBytes) issues.push("combined source content is too large");
    if (source.content.includes("\0")) issues.push(`sources[${index}] cannot contain NUL`);
    if (/\\u+[0-9a-fA-F]{4}/.test(source.content)) {
      issues.push(`sources[${index}] cannot contain Unicode escapes`);
    }
    const packageName = source.content
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\r\n]*/g, "")
      .match(/(?:^|\n)\s*package\s+([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)/)?.[1];
    if (packageName && [
      "java", "javax", "jdk", "sun", "com.qualcomm",
      "org.firstinspires.ftc.robotcore", "org.firstinspires.ftc.sim",
      "org.firstinspires.ftc.vision", "org.opencv", "org.openftc.easyopencv", "android",
    ].some((reserved) => packageName === reserved || packageName.startsWith(`${reserved}.`))) {
      issues.push(`sources[${index}] cannot declare reserved package ${packageName}`);
    }
    return [{ path: source.path, content: source.content }];
  });
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  prefix = "message",
): string[] {
  return Object.keys(value).filter((key) => !allowed.has(key))
    .map((key) => `${prefix}.${key} is not supported`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
