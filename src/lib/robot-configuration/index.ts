import type { DriveMotorNames } from "@/lib/runtime-types";
import type { RobotVariant } from "@/lib/studio-types";
import type { WorldRobotConfiguration } from "../../../packages/ftc-sim-core/src/world-types";
import type {
  WorldMotorConfiguration,
  WorldSensorConfiguration,
  WorldServoConfiguration,
} from "../../../packages/ftc-sim-core/src/world-types";
import {
  createBiobuzzRobotConfigurationManifest as makeBiobuzzRobotConfigurationManifest,
  createLegacyPhysicalHardware,
  isWorldRobotConfiguration,
  ROBOT_CONFIGURATION_LIMITS,
  validatePhysicalHardware,
  withDefaultLiftAxis,
  type PhysicalHardwareConfiguration,
  type SensorPortConfiguration,
  type ServoPortConfiguration,
} from "./physical";
import {
  DEFAULT_MOTOR_MODEL_ID,
  getMotorModelProfile,
  type MotorModelProfile,
} from "./motor-catalog";
import {
  normalizeRobotConfigurationEditor,
  type RobotConfigurationEditorState,
  type RobotConfigurationGraphPoint,
} from "./graph";

export { BIOBUZZ_MOTOR_FAMILY_ID, DEFAULT_MOTOR_MODEL_ID, FTC_11_1_MOTOR_MODELS, getMotorModelProfile } from "./motor-catalog";
export type { MotorModelProfile } from "./motor-catalog";
export {
  ROBOT_CONFIGURATION_LIMITS,
  createLegacyPhysicalHardware,
  validatePhysicalHardware,
} from "./physical";
export type {
  PhysicalHardwareConfiguration,
  SensorPortConfiguration,
  ServoPortConfiguration,
} from "./physical";
export {
  controllerGraphNodeId,
  defaultRobotConfigurationNodePositions,
  deriveRobotConfigurationGraph,
  driveRoleHandleId,
  DRIVETRAIN_GRAPH_NODE_ID,
  hubPortHandleId,
  MOTOR_CONTROLLER_HANDLE_ID,
  MOTOR_SHAFT_HANDLE_ID,
  motorGraphNodeId,
  normalizeRobotConfigurationEditor,
  planRobotConfigurationGraphConnection,
  ROBOT_CONFIGURATION_GRAPH_COORDINATE_LIMIT,
  ROBOT_CONFIGURATION_GRAPH_SCHEMA_VERSION,
} from "./graph";
export type {
  RobotConfigurationEditorState,
  RobotConfigurationGraph,
  RobotConfigurationGraphConnection,
  RobotConfigurationGraphConnectionPlan,
  RobotConfigurationGraphEdge,
  RobotConfigurationGraphNode,
  RobotConfigurationGraphPoint,
} from "./graph";

export type HubKind = "rev-control-hub" | "rev-expansion-hub";
export type DriveRole = "frontLeft" | "frontRight" | "backLeft" | "backRight" | "center";

export interface RobotControllerConfiguration {
  id: string;
  kind: HubKind;
  name: string;
  address: number;
}

export interface MotorDeviceConfiguration {
  id: string;
  kind: "dc-motor";
  hardwareMapName: string;
  motorModelId: string;
  controllerId: string;
  port: number;
}

export interface RobotConfigurationV2 {
  drivetrain: {
    kind: RobotVariant;
    bindings: Partial<Record<DriveRole, string>>;
  };
  motorNamingPreset?: "official" | "descriptive";
  controllers: RobotControllerConfiguration[];
  devices: MotorDeviceConfiguration[];
  editor?: RobotConfigurationEditorState;
}

/** Schema 3 keeps the stable FTC/REV mapping and adds the editable physical robot. */
export interface RobotConfigurationV3 extends RobotConfigurationV2 {
  physical: WorldRobotConfiguration;
  servoPorts: ServoPortConfiguration[];
  sensorPorts: SensorPortConfiguration[];
}

export interface RobotConfigurationDiagnostic {
  code: string;
  message: string;
  controllerId?: string;
  deviceId?: string;
  role?: DriveRole;
}

export interface ResolvedDriveMotor {
  role: DriveRole;
  deviceId: string;
  hardwareMapName: string;
  controllerId: string;
  port: number;
  model: MotorModelProfile;
}

export interface ResolvedRobotConfiguration {
  variant: RobotVariant;
  motors: MotorDeviceConfiguration[];
  driveMotors: Partial<Record<DriveRole, ResolvedDriveMotor>>;
  driveMotorNames: DriveMotorNames;
  physical: WorldRobotConfiguration;
  servos: ServoPortConfiguration[];
  sensors: SensorPortConfiguration[];
  cameras: WorldRobotConfiguration["cameras"];
  hardwareDescriptors: ResolvedRobotHardwareDescriptor[];
  configurationHash: string;
}

/** Runtime motor descriptor whose identity comes from FTC SDK metadata and whose output comes from the installed physical motor. */
export interface ResolvedRuntimeMotorDescriptor {
  name: string;
  modelId: string;
  ticksPerRevolution: number;
  maxRpm: number;
  achievableMaxRpmFraction: number;
}

export type ResolvedRobotHardwareDescriptor =
  | { kind: "motor"; id: string; hardwareMapName: string; controllerId: string; port: number; motorModelId: string; physical: WorldMotorConfiguration }
  | { kind: "servo"; id: string; hardwareMapName: string; controllerId: string; port: number; physical: WorldServoConfiguration }
  | { kind: "sensor"; id: string; hardwareMapName: string; controllerId: string; port: number; physical: WorldSensorConfiguration }
  | { kind: "camera"; id: string; hardwareMapName: string; physical: WorldRobotConfiguration["cameras"][number] };

export interface RobotConfigurationDocument {
  manifest: Record<string, unknown>;
  configuration: RobotConfigurationV3;
  resolved: ResolvedRobotConfiguration;
  diagnostics: RobotConfigurationDiagnostic[];
  migratedFromV1: boolean;
}

/**
 * Build the motor descriptors sent to the FTC runtime. Keep modelId as a real
 * SDK family identifier, while resolving encoder and RPM values from the V3
 * physical configuration so variant gearboxes do not inherit family defaults.
 */
export function resolveRuntimeMotorDescriptors(configuration: RobotConfigurationV3): ResolvedRuntimeMotorDescriptor[] {
  return configuration.devices.flatMap((device) => {
    const family = getMotorModelProfile(device.motorModelId);
    const physical = configuration.physical.motors.find((motor) => motor.name === device.hardwareMapName);
    if (!family || !physical) return [];
    return [{
      name: device.hardwareMapName,
      modelId: family.id,
      ticksPerRevolution: physical.profile.ticksPerRevolution,
      maxRpm: physical.profile.freeSpeedRpm,
      achievableMaxRpmFraction: family.achievableMaxRpmFraction,
    }];
  });
}

export type RobotConfigurationCommand =
  | { type: "set-drivetrain"; variant: RobotVariant }
  | { type: "set-motor-name"; deviceId: string; name: string }
  | { type: "set-servo-name"; servoId: string; name: string }
  | { type: "set-sensor-name"; sensorId: string; name: string }
  | { type: "set-camera-name"; currentName: string; name: string }
  | { type: "set-motor-model"; deviceId: string; motorModelId: string }
  | { type: "bind-drive-role"; role: DriveRole; deviceId: string }
  | { type: "add-expansion-hub" }
  | { type: "set-expansion-hub-name"; controllerId: string; name: string }
  | { type: "set-expansion-hub-address"; controllerId: string; address: number }
  | { type: "remove-expansion-hub"; controllerId: string }
  | { type: "add-motor"; controllerId: string; port: number }
  | { type: "remove-motor"; deviceId: string }
  | { type: "connect-motor-port"; deviceId: string; controllerId: string; port: number }
  | { type: "set-physical-hardware"; hardware: PhysicalHardwareConfiguration }
  | { type: "apply-biobuzz-all-rounder" }
  | { type: "import-cad-robot"; configuration: RobotConfigurationV3 }
  | { type: "remove-cad-model" }
  | { type: "set-graph-node-positions"; positions: Record<string, RobotConfigurationGraphPoint> };

export type RobotConfigurationCommandEffect = "hardware" | "layout";

const FOUR_ROLES: readonly DriveRole[] = ["frontLeft", "frontRight", "backLeft", "backRight"];
const ALL_DRIVE_ROLES: readonly DriveRole[] = [...FOUR_ROLES, "center"];
const DRIVE_ROLE_SET = new Set<string>(ALL_DRIVE_ROLES);
export const REV_HUB_ADDRESS_MIN = 1;
export const REV_HUB_ADDRESS_MAX = 10;
export const MAX_EXPANSION_HUBS = 1;
export const MAX_MOTORS = ROBOT_CONFIGURATION_LIMITS.maximumMotors;
export const MAX_SERVOS = ROBOT_CONFIGURATION_LIMITS.maximumServos;

export function requiredDriveRoles(variant: RobotVariant): readonly DriveRole[] {
  return variant === "h-drive" ? [...FOUR_ROLES, "center"] : FOUR_ROLES;
}

function cloneConfiguration(configuration: RobotConfigurationV3): RobotConfigurationV3 {
  return JSON.parse(JSON.stringify(configuration)) as RobotConfigurationV3;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function motorDevice(id: string, name: string, controllerId: string, port: number): MotorDeviceConfiguration {
  return {
    id,
    kind: "dc-motor",
    hardwareMapName: name,
    motorModelId: DEFAULT_MOTOR_MODEL_ID,
    controllerId,
    port,
  };
}

function applySdkMotorOutputProfile(physical: WorldRobotConfiguration["motors"][number], modelId: string): void {
  const model = getMotorModelProfile(modelId);
  if (!model) return;
  physical.profile.ticksPerRevolution = model.ticksPerRevolution;
  physical.profile.freeSpeedRpm = model.maxRpm;
}

function makeDefaultConfiguration(
  variant: RobotVariant,
  names: readonly string[] = ["front_left_drive", "front_right_drive", "back_left_drive", "back_right_drive", "center_drive"],
): RobotConfigurationV2 {
  const controllers: RobotControllerConfiguration[] = [
    { id: "control-hub", kind: "rev-control-hub", name: "Control Hub", address: 1 },
  ];
  const devices = FOUR_ROLES.map((role, index) => motorDevice(`motor-${role}`, names[index] ?? role, "control-hub", index));
  const bindings: Partial<Record<DriveRole, string>> = Object.fromEntries(
    FOUR_ROLES.map((role) => [role, `motor-${role}`]),
  );
  if (variant === "h-drive") {
    controllers.push({ id: "expansion-hub-2", kind: "rev-expansion-hub", name: "Expansion Hub 2", address: 2 });
    devices.push(motorDevice("motor-center", names[4] ?? "center_drive", "expansion-hub-2", 0));
    bindings.center = "motor-center";
  }
  const configuration: RobotConfigurationV2 = {
    drivetrain: { kind: variant, bindings },
    motorNamingPreset: "official",
    controllers,
    devices,
  };
  configuration.editor = normalizeRobotConfigurationEditor(configuration);
  return configuration;
}

function parseV2(robot: Record<string, unknown>): RobotConfigurationV2 | null {
  if (!Array.isArray(robot.controllers) || !Array.isArray(robot.devices) || !isRecord(robot.drivetrain)) return null;
  const drivetrain = robot.drivetrain;
  const variant = drivetrain.kind;
  if (variant !== "mecanum" && variant !== "tank" && variant !== "x-drive" && variant !== "h-drive") return null;
  const bindings = isRecord(drivetrain.bindings) ? drivetrain.bindings : {};
  if (!Object.keys(bindings).every((role) => DRIVE_ROLE_SET.has(role))
      || !Object.values(bindings).every((deviceId) => typeof deviceId === "string")
      || (robot.motorNamingPreset !== undefined
        && robot.motorNamingPreset !== "official"
        && robot.motorNamingPreset !== "descriptive")
      || !robot.controllers.every((controller) => (
        isRecord(controller)
        && typeof controller.id === "string"
        && (controller.kind === "rev-control-hub" || controller.kind === "rev-expansion-hub")
        && typeof controller.name === "string"
        && Number.isSafeInteger(controller.address)
      ))
      || !robot.devices.every((device) => (
        isRecord(device)
        && typeof device.id === "string"
        && device.kind === "dc-motor"
        && typeof device.hardwareMapName === "string"
        && typeof device.motorModelId === "string"
        && typeof device.controllerId === "string"
        && Number.isSafeInteger(device.port)
      ))) {
    throw new Error("Robot configuration schema 2 contains an invalid controller, motor, port, or drivetrain binding.");
  }
  const configuration: RobotConfigurationV2 = {
    drivetrain: { kind: variant, bindings: { ...bindings } as Partial<Record<DriveRole, string>> },
    motorNamingPreset: robot.motorNamingPreset === "descriptive" ? "descriptive" : "official",
    controllers: robot.controllers.filter(isRecord).map((controller) => ({
      id: String(controller.id ?? ""),
      kind: controller.kind === "rev-expansion-hub" ? "rev-expansion-hub" : "rev-control-hub",
      name: String(controller.name ?? "Hub"),
      address: Number(controller.address ?? 1),
    })),
    devices: robot.devices.filter(isRecord).map((device) => ({
      id: String(device.id ?? ""),
      kind: "dc-motor",
      hardwareMapName: String(device.hardwareMapName ?? ""),
      motorModelId: String(device.motorModelId ?? DEFAULT_MOTOR_MODEL_ID),
      controllerId: String(device.controllerId ?? ""),
      port: Number(device.port ?? -1),
    })),
  };
  configuration.editor = normalizeRobotConfigurationEditor(configuration, robot.editor);
  return configuration;
}

function resolve(configuration: RobotConfigurationV3): Pick<RobotConfigurationDocument, "resolved" | "diagnostics"> {
  const diagnostics: RobotConfigurationDiagnostic[] = [];
  const controllerIds = new Set<string>();
  const controllerAddresses = new Set<number>();
  const controllerNames = new Set<string>();
  const controlHubCount = configuration.controllers.filter((controller) => controller.kind === "rev-control-hub").length;
  const expansionHubCount = configuration.controllers.filter((controller) => controller.kind === "rev-expansion-hub").length;
  if (controlHubCount !== 1) diagnostics.push({ code: "CONTROL_HUB_COUNT", message: "A robot configuration must contain exactly one REV Control Hub." });
  if (expansionHubCount > MAX_EXPANSION_HUBS) {
    diagnostics.push({ code: "EXPANSION_HUB_COUNT", message: "FTC Simulator supports at most one REV Expansion Hub." });
  }
  for (const controller of configuration.controllers) {
    if (!controller.id || controllerIds.has(controller.id)) {
      diagnostics.push({ code: "DUPLICATE_CONTROLLER", controllerId: controller.id, message: `Controller id “${controller.id || "(empty)"}” is not unique.` });
    }
    controllerIds.add(controller.id);
    const trimmedHubName = controller.name.trim();
    if (!trimmedHubName) {
      diagnostics.push({ code: "EMPTY_HUB_NAME", controllerId: controller.id, message: "REV hub names cannot be empty." });
    } else if (trimmedHubName !== controller.name) {
      diagnostics.push({ code: "HUB_NAME_WHITESPACE", controllerId: controller.id, message: `Hub name “${trimmedHubName}” cannot begin or end with whitespace.` });
    } else if (controllerNames.has(trimmedHubName)) {
      diagnostics.push({ code: "DUPLICATE_HUB_NAME", controllerId: controller.id, message: `REV hub name “${trimmedHubName}” is already used.` });
    }
    controllerNames.add(trimmedHubName);
    if (!Number.isInteger(controller.address)
        || controller.address < REV_HUB_ADDRESS_MIN
        || controller.address > REV_HUB_ADDRESS_MAX) {
      diagnostics.push({
        code: "INVALID_HUB_ADDRESS",
        controllerId: controller.id,
        message: `${controller.name || "REV hub"} must use a module address from ${REV_HUB_ADDRESS_MIN} to ${REV_HUB_ADDRESS_MAX}.`,
      });
    }
    if (controllerAddresses.has(controller.address)) {
      diagnostics.push({ code: "DUPLICATE_HUB_ADDRESS", controllerId: controller.id, message: `REV hub address ${controller.address} is already used.` });
    }
    controllerAddresses.add(controller.address);
  }
  const names = new Map<string, string>();
  const occupiedPorts = new Map<string, string>();
  const devicesById = new Map<string, MotorDeviceConfiguration>();
  for (const device of configuration.devices) {
    if (!device.id || devicesById.has(device.id)) {
      diagnostics.push({ code: "DUPLICATE_DEVICE", deviceId: device.id, message: `Motor id “${device.id || "(empty)"}” is not unique.` });
    }
    devicesById.set(device.id, device);
    if (!controllerIds.has(device.controllerId)) {
      diagnostics.push({ code: "UNKNOWN_CONTROLLER", deviceId: device.id, message: `${device.hardwareMapName || "Motor"} is connected to a missing hub.` });
    }
    if (!Number.isInteger(device.port) || device.port < 0 || device.port > 3) {
      diagnostics.push({ code: "INVALID_MOTOR_PORT", deviceId: device.id, message: `${device.hardwareMapName || "Motor"} must use motor port 0–3.` });
    }
    const portKey = `${device.controllerId}:${device.port}`;
    if (occupiedPorts.has(portKey)) {
      diagnostics.push({ code: "MOTOR_PORT_COLLISION", deviceId: device.id, message: `Motor port ${device.port} on this hub is already occupied.` });
    }
    occupiedPorts.set(portKey, device.id);
    const trimmedName = device.hardwareMapName.trim();
    if (!trimmedName) diagnostics.push({ code: "EMPTY_HARDWARE_NAME", deviceId: device.id, message: "HardwareMap names cannot be empty." });
    else if (trimmedName !== device.hardwareMapName) diagnostics.push({ code: "HARDWARE_NAME_WHITESPACE", deviceId: device.id, message: `HardwareMap name “${trimmedName}” cannot begin or end with whitespace.` });
    else if (names.has(trimmedName)) diagnostics.push({ code: "DUPLICATE_HARDWARE_NAME", deviceId: device.id, message: `HardwareMap name “${trimmedName}” is already used.` });
    names.set(trimmedName, device.id);
    if (!getMotorModelProfile(device.motorModelId)) {
      diagnostics.push({ code: "UNKNOWN_MOTOR_MODEL", deviceId: device.id, message: `Motor model “${device.motorModelId}” is not in FTC SDK 11.1.` });
    }
  }

  if (configuration.devices.length > MAX_MOTORS) {
    diagnostics.push({ code: "MOTOR_COUNT", message: `A robot may use at most ${MAX_MOTORS} motors.` });
  }
  for (const message of validatePhysicalHardware({
    robot: configuration.physical,
    servoPorts: configuration.servoPorts,
    sensorPorts: configuration.sensorPorts,
  }, configuration)) {
    diagnostics.push({ code: "INVALID_PHYSICAL_CONFIGURATION", message });
  }

  const driveMotors: Partial<Record<DriveRole, ResolvedDriveMotor>> = {};
  const boundDevices = new Map<string, DriveRole>();
  for (const role of requiredDriveRoles(configuration.drivetrain.kind)) {
    const deviceId = configuration.drivetrain.bindings[role];
    const device = deviceId ? devicesById.get(deviceId) : undefined;
    if (!device) {
      diagnostics.push({ code: "MISSING_DRIVE_BINDING", role, message: `${role} needs a configured motor.` });
      continue;
    }
    if (boundDevices.has(device.id)) {
      diagnostics.push({ code: "REPEATED_DRIVE_BINDING", deviceId: device.id, role, message: `${device.hardwareMapName} is already assigned to ${boundDevices.get(device.id)}.` });
    }
    boundDevices.set(device.id, role);
    const model = getMotorModelProfile(device.motorModelId);
    if (model) driveMotors[role] = { role, deviceId: device.id, hardwareMapName: device.hardwareMapName, controllerId: device.controllerId, port: device.port, model };
  }
  const fallback = (role: DriveRole) => driveMotors[role]?.hardwareMapName ?? `unconfigured_${role}`;
  const canonical = {
    drivetrain: configuration.drivetrain,
    controllers: [...configuration.controllers].sort((left, right) => left.id.localeCompare(right.id)),
    devices: [...configuration.devices].sort((left, right) => left.id.localeCompare(right.id)),
    physical: configuration.physical,
    servoPorts: configuration.servoPorts,
    sensorPorts: configuration.sensorPorts,
  };
  return {
    diagnostics,
    resolved: {
      variant: configuration.drivetrain.kind,
      motors: configuration.devices,
      driveMotors,
      driveMotorNames: {
        frontLeft: fallback("frontLeft"),
        frontRight: fallback("frontRight"),
        backLeft: fallback("backLeft"),
        backRight: fallback("backRight"),
        ...(configuration.drivetrain.kind === "h-drive" ? { center: fallback("center") } : {}),
      },
      physical: configuration.physical,
      servos: configuration.servoPorts,
      sensors: configuration.sensorPorts,
      cameras: configuration.physical.cameras,
      hardwareDescriptors: [
        ...configuration.devices.flatMap((device) => {
          const physical = configuration.physical.motors.find((motor) => motor.name === device.hardwareMapName);
          return physical ? [{ kind: "motor" as const, id: device.id, hardwareMapName: device.hardwareMapName, controllerId: device.controllerId, port: device.port, motorModelId: device.motorModelId, physical }] : [];
        }),
        ...configuration.servoPorts.flatMap((port) => {
          const physical = configuration.physical.servos.find((servo) => servo.name === port.hardwareMapName);
          return physical ? [{ kind: "servo" as const, id: port.id, hardwareMapName: port.hardwareMapName, controllerId: port.controllerId, port: port.port, physical }] : [];
        }),
        ...configuration.sensorPorts.flatMap((port) => {
          const physical = configuration.physical.sensors.find((sensor) => sensor.name === port.hardwareMapName);
          return physical ? [{ kind: "sensor" as const, id: port.id, hardwareMapName: port.hardwareMapName, controllerId: port.controllerId, port: port.port, physical }] : [];
        }),
        ...configuration.physical.cameras.map((physical, index) => ({ kind: "camera" as const, id: `camera-${index}`, hardwareMapName: physical.name, physical })),
      ],
      configurationHash: stableHash(canonical),
    },
  };
}

function makeDocument(manifest: Record<string, unknown>, configuration: RobotConfigurationV3, migratedFromV1: boolean): RobotConfigurationDocument {
  const normalizedConfiguration = {
    ...configuration,
    editor: normalizeRobotConfigurationEditor(configuration),
  };
  return { manifest, configuration: normalizedConfiguration, migratedFromV1, ...resolve(normalizedConfiguration) };
}

export function openRobotConfiguration(manifestText: string): RobotConfigurationDocument {
  const parsed = JSON.parse(manifestText) as unknown;
  if (!isRecord(parsed)) throw new Error("ftcsim.project.json must contain a JSON object.");
  const schemaVersion = parsed.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3) {
    throw new Error(`Unsupported ftcsim.project.json schema version “${String(schemaVersion)}”.`);
  }
  const robot = isRecord(parsed.robot) ? parsed.robot : {};
  const hasV2Shape = Array.isArray(robot.controllers) || Array.isArray(robot.devices) || isRecord(robot.drivetrain);
  if (schemaVersion === 3) {
    const base = parseV2(robot);
    if (!base || !isWorldRobotConfiguration(robot.physical)
        || !Array.isArray(robot.servoPorts) || !robot.servoPorts.every(isServoPort)
        || !Array.isArray(robot.sensorPorts) || !robot.sensorPorts.every(isSensorPort)) {
      throw new Error("Robot configuration schema 3 is incomplete or has an invalid physical profile or hub port descriptor.");
    }
    return makeDocument(parsed, {
      ...base,
      physical: withDefaultLiftAxis(robot.physical),
      servoPorts: robot.servoPorts,
      sensorPorts: robot.sensorPorts,
    }, false);
  }
  if (schemaVersion === 2 || (schemaVersion === undefined && hasV2Shape)) {
    const parsedV2 = parseV2(robot);
    if (parsedV2) return makeDocument(parsed, upgradeRobotConfiguration(parsedV2), false);
    throw new Error("Robot configuration schema 2 is incomplete or has an unknown drivetrain kind.");
  }
  if (hasV2Shape) throw new Error("Robot configuration schema 1 cannot contain schema 2 controller or device nodes.");

  const variant = robot.drivetrain === "tank" || robot.drivetrain === "x-drive" || robot.drivetrain === "h-drive"
    ? robot.drivetrain
    : "mecanum";
  const legacyMotors = isRecord(robot.motors) ? robot.motors : {};
  const names = [
    String(legacyMotors.frontLeft ?? "front_left_drive"),
    String(legacyMotors.frontRight ?? "front_right_drive"),
    String(legacyMotors.backLeft ?? "back_left_drive"),
    String(legacyMotors.backRight ?? "back_right_drive"),
    String(legacyMotors.centerStrafe ?? legacyMotors.center ?? "center_drive"),
  ];
  const configuration = makeDefaultConfiguration(variant, names);
  configuration.motorNamingPreset = robot.motorNamingPreset === "descriptive" ? "descriptive" : "official";
  return makeDocument(parsed, upgradeRobotConfiguration(configuration), true);
}

function isServoPort(value: unknown): value is ServoPortConfiguration {
  return isRecord(value) && typeof value.id === "string" && typeof value.hardwareMapName === "string"
    && typeof value.controllerId === "string" && Number.isSafeInteger(value.port);
}

function isSensorPort(value: unknown): value is SensorPortConfiguration {
  return isRecord(value) && typeof value.id === "string" && typeof value.hardwareMapName === "string"
    && (value.kind === "digital" || value.kind === "distance" || value.kind === "color" || value.kind === "analog" || value.kind === "odometry" || value.kind === "pinpoint")
    && typeof value.controllerId === "string" && Number.isSafeInteger(value.port);
}

function upgradeRobotConfiguration(configuration: RobotConfigurationV2): RobotConfigurationV3 {
  const physical = createLegacyPhysicalHardware(configuration);
  const upgraded: RobotConfigurationV3 = {
    ...configuration,
    physical: physical.robot,
    servoPorts: physical.servoPorts,
    sensorPorts: physical.sensorPorts,
  };
  upgraded.editor = normalizeRobotConfigurationEditor(upgraded, configuration.editor);
  return upgraded;
}

function nextExpansionHub(configuration: RobotConfigurationV2): RobotControllerConfiguration | null {
  if (configuration.controllers.some((controller) => controller.kind === "rev-expansion-hub")) return null;
  const occupiedAddresses = new Set(configuration.controllers.map((controller) => controller.address));
  let address: number | null = null;
  for (let candidate = REV_HUB_ADDRESS_MIN; candidate <= REV_HUB_ADDRESS_MAX; candidate++) {
    if (!occupiedAddresses.has(candidate)) {
      address = candidate;
      break;
    }
  }
  if (address === null) return null;
  const baseId = `expansion-hub-${address}`;
  let id = baseId;
  let suffix = 2;
  while (configuration.controllers.some((controller) => controller.id === id)) id = `${baseId}-${suffix++}`;
  return { id, kind: "rev-expansion-hub", name: `Expansion Hub ${address}`, address };
}

function firstFreePort(configuration: RobotConfigurationV2, controllerId: string): number | null {
  const occupied = new Set(configuration.devices.filter((device) => device.controllerId === controllerId).map((device) => device.port));
  for (let port = 0; port < 4; port++) if (!occupied.has(port)) return port;
  return null;
}

function addPhysicalMotor(configuration: RobotConfigurationV3, device: MotorDeviceConfiguration): void {
  const existing = configuration.physical.motors.find((motor) => motor.name === device.hardwareMapName);
  if (existing) return;
  const profile = configuration.physical.motors[0];
  if (!profile) return;
  const created = { ...structuredClone(profile), name: device.hardwareMapName };
  applySdkMotorOutputProfile(created, device.motorModelId);
  configuration.physical.motors.push(created);
}

function addPhysicalDriveWheel(configuration: RobotConfigurationV3, role: DriveRole, motorName: string): void {
  if (configuration.physical.wheels.some((wheel) => wheel.motor === motorName)) return;
  if (role === "center") {
    configuration.physical.wheels.push({
      motor: motorName,
      mount: { x: 0, y: -0.03, z: 0 },
      radius: 0.048,
      tractionAngle: Math.PI / 2,
      grip: 0.85,
      rollerGrip: 0.035,
      inertiaKgM2: 0.00035,
      suspensionTravel: 0.028,
      springNPerM: 12_000,
      damperNsPerM: 130,
    });
    return;
  }
  const allRounder = createBiobuzzRobotConfiguration();
  const template = allRounder.physical.wheels[FOUR_ROLES.indexOf(role)];
  if (template) configuration.physical.wheels.push({ ...structuredClone(template), motor: motorName });
}

function renamePhysicalMotor(configuration: RobotConfigurationV3, previous: string, next: string): void {
  const motor = configuration.physical.motors.find((candidate) => candidate.name === previous);
  if (motor) motor.name = next;
  for (const wheel of configuration.physical.wheels) if (wheel.motor === previous) wheel.motor = next;
  for (const binding of configuration.physical.visualModel?.wheelBindings ?? []) if (binding.motor === previous) binding.motor = next;
  for (const binding of configuration.physical.visualModel?.motionBindings ?? []) if (binding.motor === previous) binding.motor = next;
  for (const hardware of configuration.physical.visualModel?.hardware ?? []) if (hardware.hardwareName === previous) hardware.hardwareName = next;
  if (!configuration.physical.mechanisms) return;
  const mechanisms = configuration.physical.mechanisms;
  if (mechanisms.intake.motor === previous) mechanisms.intake.motor = next;
  if (mechanisms.feeder.motor === previous) mechanisms.feeder.motor = next;
  if (mechanisms.shooter.motor === previous) mechanisms.shooter.motor = next;
  if (mechanisms.shooter.turretMotor === previous) mechanisms.shooter.turretMotor = next;
  if (mechanisms.lift.motor === previous) mechanisms.lift.motor = next;
}

function ensureRole(configuration: RobotConfigurationV3, role: DriveRole): void {
  if (configuration.drivetrain.bindings[role] && configuration.devices.some((device) => device.id === configuration.drivetrain.bindings[role])) {
    const device = configuration.devices.find((candidate) => candidate.id === configuration.drivetrain.bindings[role]);
    if (device) addPhysicalDriveWheel(configuration, role, device.hardwareMapName);
    return;
  }
  let controller = configuration.controllers.find((candidate) => firstFreePort(configuration, candidate.id) !== null);
  if (!controller) {
    const expansionHub = nextExpansionHub(configuration);
    if (!expansionHub) return;
    configuration.controllers.push(expansionHub);
    controller = expansionHub;
  }
  const port = firstFreePort(configuration, controller.id);
  if (port === null) return;
  const baseId = `motor-${role}`;
  let id = baseId;
  let suffix = 2;
  while (configuration.devices.some((device) => device.id === id)) id = `${baseId}-${suffix++}`;
  const name = role === "center" ? "center_drive" : `${role.replace(/([A-Z])/g, "_$1").toLowerCase()}_drive`;
  const device = motorDevice(id, name, controller.id, port);
  configuration.devices.push(device);
  addPhysicalMotor(configuration, device);
  addPhysicalDriveWheel(configuration, role, device.hardwareMapName);
  configuration.drivetrain.bindings[role] = id;
}

export function applyRobotConfigurationCommand(
  document: RobotConfigurationDocument,
  command: RobotConfigurationCommand,
): RobotConfigurationDocument {
  const configuration = cloneConfiguration(document.configuration);
  switch (command.type) {
    case "set-drivetrain":
      configuration.drivetrain.kind = command.variant;
      for (const role of requiredDriveRoles(command.variant)) ensureRole(configuration, role);
      break;
    case "set-motor-name": {
      const device = configuration.devices.find((candidate) => candidate.id === command.deviceId);
      if (device) {
        renamePhysicalMotor(configuration, device.hardwareMapName, command.name);
        device.hardwareMapName = command.name;
      }
      break;
    }
    case "set-servo-name": {
      const port = configuration.servoPorts.find((candidate) => candidate.id === command.servoId);
      if (port) {
        const previousName = port.hardwareMapName;
        port.hardwareMapName = command.name;
        const servo = configuration.physical.servos.find((candidate) => candidate.name === previousName);
        if (servo) servo.name = command.name;
        const mechanisms = configuration.physical.mechanisms;
        if (mechanisms) {
          if (mechanisms.shooter.turretServo === previousName) mechanisms.shooter.turretServo = command.name;
          if (mechanisms.shooter.hoodServo === previousName) mechanisms.shooter.hoodServo = command.name;
          if (mechanisms.lift.releaseServo === previousName) mechanisms.lift.releaseServo = command.name;
          if (mechanisms.gate.servo === previousName) mechanisms.gate.servo = command.name;
        }
      }
      break;
    }
    case "set-sensor-name": {
      const port = configuration.sensorPorts.find((candidate) => candidate.id === command.sensorId);
      if (port) {
        const previousName = port.hardwareMapName;
        port.hardwareMapName = command.name;
        const sensor = configuration.physical.sensors.find((candidate) => candidate.name === previousName);
        if (sensor) sensor.name = command.name;
      }
      break;
    }
    case "set-camera-name": {
      const camera = configuration.physical.cameras.find((candidate) => candidate.name === command.currentName);
      if (camera) camera.name = command.name;
      break;
    }
    case "set-motor-model": {
      const device = configuration.devices.find((candidate) => candidate.id === command.deviceId);
      if (device) {
        device.motorModelId = command.motorModelId;
        const selectedModel = getMotorModelProfile(command.motorModelId);
        const physicalMotor = configuration.physical.motors.find((motor) => motor.name === device.hardwareMapName);
        if (selectedModel && physicalMotor) {
          // SDK model metadata supplies the encoder and gearbox output free speed used by the physical motor model.
          applySdkMotorOutputProfile(physicalMotor, command.motorModelId);
        }
      }
      break;
    }
    case "bind-drive-role":
      if (!command.deviceId) {
        delete configuration.drivetrain.bindings[command.role];
        break;
      }
      if (!configuration.devices.some((device) => device.id === command.deviceId)) break;
      {
        const previousDeviceId = configuration.drivetrain.bindings[command.role];
        const occupiedRole = ALL_DRIVE_ROLES.find((role) => (
          role !== command.role && configuration.drivetrain.bindings[role] === command.deviceId
        ));
        configuration.drivetrain.bindings[command.role] = command.deviceId;
        if (occupiedRole) {
          if (previousDeviceId) configuration.drivetrain.bindings[occupiedRole] = previousDeviceId;
          else delete configuration.drivetrain.bindings[occupiedRole];
          const targetName = configuration.devices.find((device) => device.id === command.deviceId)?.hardwareMapName;
          const previousName = configuration.devices.find((device) => device.id === previousDeviceId)?.hardwareMapName;
          if (targetName && previousName) {
            for (const wheel of configuration.physical.wheels) {
              if (wheel.motor === targetName) wheel.motor = previousName;
              else if (wheel.motor === previousName) wheel.motor = targetName;
            }
          }
        } else if (previousDeviceId) {
          const previousName = configuration.devices.find((device) => device.id === previousDeviceId)?.hardwareMapName;
          const targetName = configuration.devices.find((device) => device.id === command.deviceId)?.hardwareMapName;
          if (previousName && targetName) {
            const wheel = configuration.physical.wheels.find((candidate) => candidate.motor === previousName);
            if (wheel) wheel.motor = targetName;
          }
        } else {
          const targetName = configuration.devices.find((device) => device.id === command.deviceId)?.hardwareMapName;
          if (targetName) addPhysicalDriveWheel(configuration, command.role, targetName);
        }
      }
      break;
    case "add-expansion-hub": {
      const expansionHub = nextExpansionHub(configuration);
      if (expansionHub) configuration.controllers.push(expansionHub);
      break;
    }
    case "set-expansion-hub-name": {
      const controller = configuration.controllers.find((candidate) => (
        candidate.id === command.controllerId && candidate.kind === "rev-expansion-hub"
      ));
      if (controller) controller.name = command.name;
      break;
    }
    case "set-expansion-hub-address": {
      const controller = configuration.controllers.find((candidate) => (
        candidate.id === command.controllerId && candidate.kind === "rev-expansion-hub"
      ));
      if (controller) controller.address = command.address;
      break;
    }
    case "remove-expansion-hub": {
      const controller = configuration.controllers.find((candidate) => (
        candidate.id === command.controllerId && candidate.kind === "rev-expansion-hub"
      ));
      const occupied = configuration.devices.some((device) => device.controllerId === command.controllerId);
      if (controller && !occupied) {
        configuration.controllers = configuration.controllers.filter((candidate) => candidate.id !== command.controllerId);
      }
      break;
    }
    case "add-motor": {
      if (configuration.devices.length >= MAX_MOTORS) break;
      if (!configuration.controllers.some((controller) => controller.id === command.controllerId)) break;
      if (!Number.isInteger(command.port) || command.port < 0 || command.port > 3) break;
      if (configuration.devices.some((device) => device.controllerId === command.controllerId && device.port === command.port)) break;
      const idBase = `${command.controllerId}-motor-${command.port}`;
      let id = idBase;
      let suffix = 2;
      while (configuration.devices.some((device) => device.id === id)) id = `${idBase}-${suffix++}`;
      const existingNames = new Set(configuration.devices.map((device) => device.hardwareMapName));
      let nameIndex = configuration.devices.length;
      let name = `motor_${nameIndex}`;
      while (existingNames.has(name)) name = `motor_${++nameIndex}`;
      const device = motorDevice(id, name, command.controllerId, command.port);
      configuration.devices.push(device);
      addPhysicalMotor(configuration, device);
      break;
    }
    case "connect-motor-port": {
      if (!Number.isInteger(command.port) || command.port < 0 || command.port > 3) break;
      if (!configuration.controllers.some((controller) => controller.id === command.controllerId)) break;
      const device = configuration.devices.find((candidate) => candidate.id === command.deviceId);
      if (!device) break;
      if (device.controllerId === command.controllerId && device.port === command.port) break;
      const previousControllerId = device.controllerId;
      const previousPort = device.port;
      const occupant = configuration.devices.find((candidate) => (
        candidate.id !== device.id
        && candidate.controllerId === command.controllerId
        && candidate.port === command.port
      ));
      device.controllerId = command.controllerId;
      device.port = command.port;
      if (occupant) {
        occupant.controllerId = previousControllerId;
        occupant.port = previousPort;
      }
      break;
    }
    case "set-graph-node-positions":
      configuration.editor = normalizeRobotConfigurationEditor(configuration, {
        schemaVersion: 1,
        nodePositions: {
          ...configuration.editor?.nodePositions,
          ...command.positions,
        },
      });
      break;
    case "remove-motor":
      configuration.devices = configuration.devices.filter((device) => device.id !== command.deviceId);
      {
        const removedName = document.configuration.devices.find((device) => device.id === command.deviceId)?.hardwareMapName;
        if (removedName) {
          configuration.physical.motors = configuration.physical.motors.filter((motor) => motor.name !== removedName);
          configuration.physical.wheels = configuration.physical.wheels.filter((wheel) => wheel.motor !== removedName);
          const model = configuration.physical.visualModel;
          if (model) { model.wheelBindings = model.wheelBindings.filter((binding) => binding.motor !== removedName); model.motionBindings = model.motionBindings?.filter((binding) => binding.motor !== removedName); model.hardware = model.hardware.filter((entry) => entry.hardwareName !== removedName); }
        }
      }
      for (const role of Object.keys(configuration.drivetrain.bindings) as DriveRole[]) {
        if (configuration.drivetrain.bindings[role] === command.deviceId) delete configuration.drivetrain.bindings[role];
      }
      break;
    case "set-physical-hardware":
      configuration.physical = structuredClone(command.hardware.robot);
      configuration.servoPorts = structuredClone(command.hardware.servoPorts);
      configuration.sensorPorts = structuredClone(command.hardware.sensorPorts);
      break;
    case "apply-biobuzz-all-rounder": {
      const preset = createBiobuzzRobotConfiguration();
      configuration.drivetrain = structuredClone(preset.drivetrain);
      configuration.motorNamingPreset = "official";
      configuration.controllers = structuredClone(preset.controllers);
      configuration.devices = structuredClone(preset.devices);
      configuration.physical = structuredClone(preset.physical);
      configuration.servoPorts = structuredClone(preset.servoPorts);
      configuration.sensorPorts = structuredClone(preset.sensorPorts);
      break;
    }
    case "import-cad-robot":
      return makeDocument(document.manifest, structuredClone(command.configuration), false);
    case "remove-cad-model":
      delete configuration.physical.visualModel;
      break;
  }
  return makeDocument(document.manifest, configuration, false);
}

export function robotConfigurationCommandEffect(
  command: RobotConfigurationCommand,
): RobotConfigurationCommandEffect {
  return command.type === "set-graph-node-positions" ? "layout" : "hardware";
}

export function serializeRobotConfiguration(document: RobotConfigurationDocument): string {
  const manifest = {
    ...document.manifest,
    schemaVersion: 3,
    robot: document.configuration,
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function createRobotConfigurationManifest(
  variant: RobotVariant,
  motorNamingPreset: "official" | "descriptive",
  names: readonly string[],
): RobotConfigurationV2 {
  const configuration = makeDefaultConfiguration(variant, names);
  configuration.motorNamingPreset = motorNamingPreset;
  return configuration;
}

/** New-project preset: BIOBUZZ mecanum all-rounder with two hubs and unique, addressable devices. */
export function createBiobuzzRobotConfiguration(
  motorNamingPreset: "official" | "descriptive" = "official",
  names?: readonly string[],
): RobotConfigurationV3 {
  const seeded = makeBiobuzzRobotConfigurationManifest();
  const configuration: RobotConfigurationV3 = {
    ...seeded,
    motorNamingPreset,
  };
  FOUR_ROLES.forEach((role, index) => {
    const device = configuration.devices.find((candidate) => candidate.id === configuration.drivetrain.bindings[role]);
    const nextName = names?.[index];
    if (device && nextName && device.hardwareMapName !== nextName) {
      renamePhysicalMotor(configuration, device.hardwareMapName, nextName);
      device.hardwareMapName = nextName;
    }
  });
  // Seeded physical profiles are authoritative. User-driven model changes
  // still apply their selected SDK output profile in set-motor-model.
  configuration.editor = normalizeRobotConfigurationEditor(configuration);
  return configuration;
}
