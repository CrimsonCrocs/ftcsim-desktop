import {
  createBiobuzzAllRounder,
  validateWorldRobotConfiguration,
} from "@ftc-studio/sim-core";
import type {
  WorldRobotConfiguration,
  WorldSensorConfiguration,
} from "../../../packages/ftc-sim-core/src/world-types";
import type { RobotVariant } from "@/lib/studio-types";
import { BIOBUZZ_MOTOR_FAMILY_ID, DEFAULT_MOTOR_MODEL_ID } from "./motor-catalog";
import { base64ToBytes, validateCadGlb } from "../cad/glb";
import { validCadAsset } from "../cad/assets";

export interface ServoPortConfiguration {
  id: string;
  hardwareMapName: string;
  controllerId: string;
  port: number;
}

export interface SensorPortConfiguration {
  id: string;
  hardwareMapName: string;
  kind: WorldSensorConfiguration["kind"];
  controllerId: string;
  port: number;
}

export interface PhysicalHardwareConfiguration {
  robot: WorldRobotConfiguration;
  servoPorts: ServoPortConfiguration[];
  sensorPorts: SensorPortConfiguration[];
}

export interface RobotConfigurationHardwareSource {
  drivetrain: { kind: RobotVariant; bindings: Partial<Record<string, string>> };
  controllers: { id: string; kind: string }[];
  devices: { id: string; hardwareMapName: string; motorModelId: string; controllerId: string; port: number }[];
  physical?: WorldRobotConfiguration;
  servoPorts?: ServoPortConfiguration[];
  sensorPorts?: SensorPortConfiguration[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown) => typeof value === "number";
const isString = (value: unknown) => typeof value === "string";
const isVector = (value: unknown): value is { x: number; y: number; z: number } => isRecord(value) && isNumber(value.x) && isNumber(value.y) && isNumber(value.z);
const isQuaternion = (value: unknown) => isRecord(value) && isNumber(value.x) && isNumber(value.y) && isNumber(value.z) && isNumber(value.w);
const isTransform = (value: unknown) => isRecord(value) && isVector(value.position) && isQuaternion(value.rotation);

/** A strict shape check before semantic bounds validation, so malformed JSON cannot crash diagnostics. */
export function isWorldRobotConfiguration(value: unknown): value is WorldRobotConfiguration {
  if (!isRecord(value) || !isString(value.id) || !isString(value.label) || value.physicalAccuracy !== "unvalidated") return false;
  if (!isRecord(value.chassis) || !isVector(value.chassis.size) || !isNumber(value.chassis.massKg) || !isVector(value.chassis.centerOfMass)) return false;
  if (!Array.isArray(value.motors) || !value.motors.every((item) => isRecord(item)
    && isString(item.name) && isRecord(item.profile) && isString(item.profile.id) && isNumber(item.profile.nominalVoltage)
    && isNumber(item.profile.freeSpeedRpm) && isNumber(item.profile.stallTorqueNm) && isNumber(item.profile.stallCurrentAmps)
    && isNumber(item.profile.freeCurrentAmps) && isNumber(item.profile.ticksPerRevolution) && isNumber(item.profile.rotorInertiaKgM2)
    && isString(item.profile.source) && isNumber(item.reduction) && isNumber(item.efficiency) && typeof item.inverted === "boolean")) return false;
  if (!Array.isArray(value.wheels) || !value.wheels.every((item) => isRecord(item) && isString(item.motor) && isVector(item.mount)
    && (item.width === undefined || isNumber(item.width)) && (item.axle === undefined || isVector(item.axle))
    && [item.radius, item.tractionAngle, item.grip, item.rollerGrip, item.inertiaKgM2, item.suspensionTravel, item.springNPerM, item.damperNsPerM].every(isNumber))) return false;
  if (!Array.isArray(value.servos) || !value.servos.every((item) => isRecord(item) && isString(item.name) && isVector(item.mount)
    && [item.minRadians, item.maxRadians, item.speedRadiansPerSecond, item.torqueNm, item.inertiaKgM2].every(isNumber) && isString(item.source))) return false;
  if (!Array.isArray(value.sensors) || !value.sensors.every((item) => isRecord(item) && isString(item.name)
    && ["digital", "distance", "color", "analog", "odometry", "pinpoint"].includes(String(item.kind)) && isTransform(item.mount)
    && [item.maximumRange, item.noise, item.latencyMs].every(isNumber))) return false;
  if (!Array.isArray(value.cameras) || !value.cameras.every((item) => isRecord(item) && isString(item.name) && isTransform(item.mount)
    && [item.horizontalFovRadians, item.verticalFovRadians, item.maximumRange, item.latencyMs, item.framesPerSecond, item.positionNoiseMeters, item.angleNoiseRadians].every(isNumber))) return false;
  if (!isRecord(value.battery) || ![value.battery.openCircuitVoltage, value.battery.internalResistanceOhms, value.battery.maximumCurrentAmps].every(isNumber)) return false;
  if (value.visualModel !== undefined) {
    const model = value.visualModel;
    if (!isRecord(model) || model.version !== 1 || !isString(model.sourceFileName) || !isString(model.sourceSha256)
      || !Array.isArray(model.wheelBindings) || !model.wheelBindings.every((binding) => isRecord(binding)
        && isString(binding.motor) && isVector(binding.pivot) && isVector(binding.axis)
        && Array.isArray(binding.path) && binding.path.length <= 64 && binding.path.every((n) => Number.isInteger(n) && n >= 0))
      || !Array.isArray(model.hardware) || !model.hardware.every((entry) => isRecord(entry)
        && [entry.partName, entry.productId, entry.hardwareName, entry.method].every(isString))) return false;
    if (model.motionBindings !== undefined && (!Array.isArray(model.motionBindings) || !model.motionBindings.every((binding) => isRecord(binding)
      && isString(binding.motor) && isVector(binding.pivot) && isVector(binding.axis) && isNumber(binding.ratio)
      && Math.abs(binding.ratio) >= .001 && Math.abs(binding.ratio) <= 1000 && ["motor", "wheel"].includes(String(binding.phase))
      && Array.isArray(binding.path) && binding.path.length <= 64 && binding.path.every((n) => Number.isInteger(n) && n >= 0)))) return false;
    if (model.asset !== undefined) { if (!validCadAsset(model.asset) || model.glbBase64 !== undefined) return false; }
    else { if (!isString(model.glbBase64) || model.glbBase64.length > 44 * 1024 * 1024) return false; try { validateCadGlb(base64ToBytes(model.glbBase64)); } catch { return false; } }
  }
  if (value.mechanisms !== undefined && value.mechanisms !== null) {
    if (!isRecord(value.mechanisms)) return false;
    const m = value.mechanisms;
    if (!isRecord(m.intake) || !isString(m.intake.motor) || !isVector(m.intake.mount) || ![m.intake.width, m.intake.radius, m.intake.complianceNPerM].every(isNumber)) return false;
    if (!isRecord(m.feeder) || !isString(m.feeder.motor) || (m.feeder.reduction !== undefined && !isNumber(m.feeder.reduction)) || ![m.feeder.speedMetersPerSecond, m.feeder.grip].every(isNumber)) return false;
    if (!isRecord(m.storage) || !isVector(m.storage.mount) || ![m.storage.width, m.storage.length, m.storage.capacity].every(isNumber)) return false;
    if (!isRecord(m.shooter) || !isString(m.shooter.motor) || !isVector(m.shooter.mount) || ![m.shooter.wheelRadius, m.shooter.inertiaKgM2, m.shooter.compression].every(isNumber)
      || (m.shooter.turretServo !== undefined && !isString(m.shooter.turretServo))
      || (m.shooter.turretMotor !== undefined && !isString(m.shooter.turretMotor))
      || (m.shooter.turretInertiaKgM2 !== undefined && !isNumber(m.shooter.turretInertiaKgM2))
      || !isString(m.shooter.hoodServo)) return false;
    if (!isRecord(m.lift) || !isString(m.lift.motor) || !isVector(m.lift.mount)
      || (m.lift.axis !== undefined && !isVector(m.lift.axis))
      || ![m.lift.spoolRadius, m.lift.maximumTravel, m.lift.carriageMassKg].every(isNumber)
      || !isString(m.lift.releaseServo)) return false;
    if (!isRecord(m.gate) || !isString(m.gate.servo) || !isNumber(m.gate.rejectionThreshold)) return false;
  }
  return true;
}

/** Pre-axis V3 manifests treated lift travel as vertical; make that default explicit on load. */
export function withDefaultLiftAxis(configuration: WorldRobotConfiguration): WorldRobotConfiguration {
  const mechanisms = configuration.mechanisms;
  if (!mechanisms || mechanisms.lift.axis !== undefined) return configuration;
  return {
    ...configuration,
    mechanisms: {
      ...mechanisms,
      lift: { ...mechanisms.lift, axis: { x: 0, y: 1, z: 0 } },
    },
  };
}

const MOTOR_MAX = 8;
const SERVO_MAX = 8;
const SERVO_PORT_MAX = 5;

export function createLegacyPhysicalHardware(configuration: RobotConfigurationHardwareSource): PhysicalHardwareConfiguration {
  const preset = createBiobuzzAllRounder();
  const legacyPreset = { ...preset };
  delete legacyPreset.mechanisms;
  const driveRoles = ["frontLeft", "frontRight", "backLeft", "backRight", "center"] as const;
  const motors = configuration.devices.map((device) => {
    const roleIndex = driveRoles.findIndex((role) => configuration.drivetrain.bindings[role] === device.id);
    const profile = preset.motors[roleIndex >= 0 && roleIndex < 4 ? roleIndex : 0];
    return { ...(profile ? structuredClone(profile) : { name: device.hardwareMapName, profile: structuredClone(preset.motors[0]!.profile), reduction: 1, efficiency: 0.9, inverted: false }), name: device.hardwareMapName };
  });
  const wheels = driveRoles.flatMap((role) => {
    const deviceId = configuration.drivetrain.bindings[role];
    const device = configuration.devices.find((candidate) => candidate.id === deviceId);
    const presetWheel = preset.wheels.find((wheel) => wheel.motor === preset.motors[driveRoles.indexOf(role)]?.name);
    if (!device || !presetWheel) return [];
    const wheel = { ...structuredClone(presetWheel), motor: device.hardwareMapName, driveProjection: configuration.drivetrain.kind === "mecanum" ? Math.SQRT1_2 : 1 };
    if (configuration.drivetrain.kind === "tank" || configuration.drivetrain.kind === "h-drive") {
      wheel.tractionAngle = 0;
      wheel.rollerGrip = configuration.drivetrain.kind === "tank" ? wheel.grip : 0.035;
    }
    return [wheel];
  });
  const centerDeviceId = configuration.drivetrain.bindings.center;
  const centerDevice = configuration.devices.find((device) => device.id === centerDeviceId);
  if (centerDevice && !wheels.some((wheel) => wheel.motor === centerDevice.hardwareMapName)) {
    wheels.push({
      motor: centerDevice.hardwareMapName,
      mount: { x: 0, y: -0.03, z: 0 },
      radius: 0.048,
      tractionAngle: -Math.PI / 2,
      driveProjection: 1,
      grip: 0.85,
      rollerGrip: 0.035,
      inertiaKgM2: 0.00035,
      suspensionTravel: 0.028,
      springNPerM: 12_000,
      damperNsPerM: 130,
    });
  }
  const robot: WorldRobotConfiguration = {
    ...legacyPreset,
    id: "legacy-physical-profile",
    label: "Existing robot physical profile",
    motors,
    wheels,
    servos: [],
    sensors: [],
    cameras: [],
  };
  return { robot, servoPorts: [], sensorPorts: [] };
}

function makeMotorDevice(id: string, hardwareMapName: string, controllerId: string, port: number, motorModelId = DEFAULT_MOTOR_MODEL_ID) {
  return { id, kind: "dc-motor" as const, hardwareMapName, motorModelId, controllerId, port };
}

/** Complete, uniquely wired 8-motor/4-servo starter robot for a two-hub BIOBUZZ robot. */
export function createBiobuzzRobotConfigurationManifest(): {
  drivetrain: { kind: RobotVariant; bindings: Record<string, string> };
  motorNamingPreset: "official";
  controllers: { id: string; kind: "rev-control-hub" | "rev-expansion-hub"; name: string; address: number }[];
  devices: ReturnType<typeof makeMotorDevice>[];
  physical: WorldRobotConfiguration;
  servoPorts: ServoPortConfiguration[];
  sensorPorts: SensorPortConfiguration[];
} {
  const physical = createBiobuzzAllRounder();
  const controllers = [
    { id: "control-hub", kind: "rev-control-hub" as const, name: "Control Hub", address: 1 },
    { id: "expansion-hub-2", kind: "rev-expansion-hub" as const, name: "Expansion Hub 2", address: 2 },
  ];
  const devices = physical.motors.map((motor, index) => makeMotorDevice(
    `motor-${motor.name}`,
    motor.name,
    index < 4 ? "control-hub" : "expansion-hub-2",
    index % 4,
    BIOBUZZ_MOTOR_FAMILY_ID,
  ));
  const bindings = Object.fromEntries([
    ["frontLeft", "front_left_drive"],
    ["frontRight", "front_right_drive"],
    ["backLeft", "back_left_drive"],
    ["backRight", "back_right_drive"],
  ].map(([role, name]) => [role, `motor-${name}`]));
  const servoPorts = physical.servos.map((servo, port) => ({
    id: `servo-${servo.name}`,
    hardwareMapName: servo.name,
    controllerId: "control-hub",
    port,
  }));
  const sensorPorts = physical.sensors.map((sensor, index) => ({
    id: `sensor-${sensor.name}`,
    hardwareMapName: sensor.name,
    kind: sensor.kind,
    controllerId: "control-hub",
    port: sensor.kind === "digital" ? 0 : sensor.kind === "analog" ? 0 : index,
  }));
  // Keep the I2C peripherals on distinct hub ports; the digital and analog buses have their own ranges.
  const i2cPort = new Map<string, number>();
  let nextI2cPort = 0;
  for (const sensor of sensorPorts) {
    if (sensor.kind === "digital" || sensor.kind === "analog") continue;
    i2cPort.set(sensor.id, nextI2cPort++);
  }
  for (const sensor of sensorPorts) {
    if (i2cPort.has(sensor.id)) sensor.port = i2cPort.get(sensor.id)!;
  }
  return {
    drivetrain: { kind: "mecanum", bindings },
    motorNamingPreset: "official",
    controllers,
    devices,
    physical,
    servoPorts,
    sensorPorts,
  };
}

export function validatePhysicalHardware(
  hardware: PhysicalHardwareConfiguration,
  source: RobotConfigurationHardwareSource,
): string[] {
  const errors = validateWorldRobotConfiguration(hardware.robot);
  const robot = hardware.robot;
  const descriptorIds = [...hardware.servoPorts, ...hardware.sensorPorts].map((descriptor) => descriptor.id);
  if (descriptorIds.some((id) => typeof id !== "string" || !id.trim() || id.trim() !== id)
    || new Set(descriptorIds).size !== descriptorIds.length) {
    errors.push("Servo and sensor descriptor IDs must be non-empty and unique.");
  }

  const checkPort = (port: number, maximum: number, label: string) => {
    if (!Number.isSafeInteger(port) || port < 0 || port > maximum) {
      errors.push(`${label} port must be an integer from 0 to ${maximum}.`);
    }
  };
  const controllerIds = new Set(source.controllers.map((controller) => controller.id));
  const motorNames = new Set<string>();
  const physicalMotorNames = new Set(robot.motors.map((motor) => motor.name));
  const occupiedMotorPorts = new Set<string>();
  for (const motor of source.devices) {
    if (motorNames.has(motor.hardwareMapName)) errors.push(`Motor HardwareMap name “${motor.hardwareMapName}” is assigned more than once.`);
    motorNames.add(motor.hardwareMapName);
    if (!physicalMotorNames.has(motor.hardwareMapName)) errors.push(`Motor “${motor.hardwareMapName}” has no physical motor profile.`);
    if (!controllerIds.has(motor.controllerId)) errors.push(`Motor “${motor.hardwareMapName}” references a missing hub.`);
    checkPort(motor.port, 3, `${motor.hardwareMapName} motor`);
    const key = `${motor.controllerId}:${motor.port}`;
    if (occupiedMotorPorts.has(key)) errors.push(`Motor port ${motor.port} on hub ${motor.controllerId} is already occupied.`);
    occupiedMotorPorts.add(key);
  }
  for (const name of physicalMotorNames) if (!motorNames.has(name)) errors.push(`Physical motor “${name}” is missing a hub port assignment.`);

  const occupiedServoPorts = new Set<string>();
  const servoNames = new Set(robot.servos.map((servo) => servo.name));
  const assignedServoNames = new Set<string>();
  if (hardware.servoPorts.length !== robot.servos.length) errors.push("Every configured servo must have exactly one hub port assignment.");
  for (const port of hardware.servoPorts) {
    if (!servoNames.has(port.hardwareMapName)) errors.push(`Servo port “${port.hardwareMapName}” has no physical travel profile.`);
    if (assignedServoNames.has(port.hardwareMapName)) errors.push(`Servo “${port.hardwareMapName}” has more than one hub port assignment.`);
    assignedServoNames.add(port.hardwareMapName);
    if (!controllerIds.has(port.controllerId)) errors.push(`Servo “${port.hardwareMapName}” references a missing hub.`);
    checkPort(port.port, SERVO_PORT_MAX, `${port.hardwareMapName} servo`);
    const key = `${port.controllerId}:${port.port}`;
    if (occupiedServoPorts.has(key)) errors.push(`Servo port ${port.port} on hub ${port.controllerId} is already occupied.`);
    occupiedServoPorts.add(key);
  }
  for (const servo of servoNames) if (!assignedServoNames.has(servo)) errors.push(`Servo “${servo}” is missing a hub port assignment.`);

  const sensorNames = new Set(robot.sensors.map((sensor) => sensor.name));
  const assignedSensorNames = new Set<string>();
  if (hardware.sensorPorts.length !== robot.sensors.length) errors.push("Every configured sensor must have exactly one hub port assignment.");
  const occupiedSensorPorts = new Set<string>();
  for (const port of hardware.sensorPorts) {
    if (!sensorNames.has(port.hardwareMapName)) errors.push(`Sensor port “${port.hardwareMapName}” has no sensor profile.`);
    if (assignedSensorNames.has(port.hardwareMapName)) errors.push(`Sensor “${port.hardwareMapName}” has more than one hub port assignment.`);
    assignedSensorNames.add(port.hardwareMapName);
    if (!controllerIds.has(port.controllerId)) errors.push(`Sensor “${port.hardwareMapName}” references a missing hub.`);
    const requiredKind = robot.sensors.find((sensor) => sensor.name === port.hardwareMapName)?.kind;
    if (requiredKind !== port.kind) errors.push(`Sensor “${port.hardwareMapName}” port type does not match its sensor profile.`);
    const maxPort = port.kind === "digital" ? 7 : 3;
    checkPort(port.port, maxPort, `${port.hardwareMapName} ${port.kind}`);
    const bus = port.kind === "digital" ? "digital" : port.kind === "analog" ? "analog" : "i2c";
    const key = `${port.controllerId}:${bus}:${port.port}`;
    if (occupiedSensorPorts.has(key)) errors.push(`${bus.toUpperCase()} port ${port.port} on hub ${port.controllerId} is already occupied.`);
    occupiedSensorPorts.add(key);
  }
  for (const sensor of sensorNames) if (!assignedSensorNames.has(sensor)) errors.push(`Sensor “${sensor}” is missing a hub port assignment.`);

  return [...new Set(errors)];
}

export const ROBOT_CONFIGURATION_LIMITS = {
  maximumMotors: MOTOR_MAX,
  maximumServos: SERVO_MAX,
  maximumServoPort: SERVO_PORT_MAX,
  maximumStartingDimensionMeters: 0.4572,
  maximumRobotHeightMeters: 0.7366,
} as const;
