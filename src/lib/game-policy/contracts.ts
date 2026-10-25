import { normalizeRotationRadians, PHYSICS_VERSION, robotTurretAngle, type MotorCommand, type RobotId, type WorldCommand, type WorldRobotConfiguration, type WorldRobotState, type WorldAlliance } from "@ftc-studio/sim-core";

export const POLICY_CONTRACT_VERSION = "biobuzz-policy-v3" as const;
export const POLICY_OBSERVATION_VERSION = "biobuzz-observation-v3" as const;
export const POLICY_ACTION_VERSION = "biobuzz-direct-actuation-v2" as const;
export const POLICY_PHYSICS_VERSION = PHYSICS_VERSION;

/** These names and this order are the default all-rounder hardware-map contract. */
/** Stable ONNX telemetry slots. `feeder` is retained as an ABI slot for older models. */
export const POLICY_MOTOR_NAMES = [
  "front_left_drive", "front_right_drive", "back_left_drive", "back_right_drive",
  "intake", "feeder", "flywheel", "lift",
] as const;
/** Stable ONNX telemetry slots, including the legacy servo-turret slot. */
export const POLICY_SERVO_NAMES = ["turret", "hood", "release", "gate"] as const;
export const POLICY_ROBOT_IDS: readonly RobotId[] = ["red-1", "red-2", "blue-1", "blue-2"];
export const POLICY_ELEMENT_SLOTS = 12;
export const POLICY_OTHER_ROBOT_SLOTS = 3;
export const POLICY_HIVE_SLOTS = 2;
export const POLICY_FLOWER_SLOTS = 4;
export const POLICY_GARDEN_SLOTS = 2;
/** Normalization factors only; these are not game-piece capacities. */
export const POLICY_MAX_POLLEN_COUNT_SCALE = 40;
export const POLICY_MAX_SCORING_ELEMENT_COUNT_SCALE = 56;
/** Actions are normalized to [-1, 1], then conventionally mapped to these chassis limits. */
export const POLICY_ACTION_LIMITS = Object.freeze({ forwardMetersPerSecond: 2, strafeMetersPerSecond: 2, yawRadiansPerSecond: 3 });
export const POLICY_ACTION_CHANNELS = Object.freeze([
  "chassis.forward_speed_normalized",
  "chassis.strafe_speed_normalized",
  "chassis.yaw_rate_normalized",
  "mechanism.intake_power",
  "mechanism.feeder_power",
  "mechanism.flywheel_speed_normalized",
  "mechanism.lift_speed_normalized",
  "servo.turret_target_normalized",
  "servo.hood_target_normalized",
  "servo.release_target_normalized",
  "servo.gate_target_normalized",
] as const);

const featureNames: string[] = [
  "phase.setup", "phase.init", "phase.auto", "phase.transition", "phase.teleop-handoff", "phase.teleop", "phase.settling", "phase.results", "phase.stopped",
  "alliance.red", "alliance.blue", "score.own", "score.opponent", "match.time_remaining",
  "ego.position_x", "ego.position_z", "ego.heading_sin", "ego.heading_cos",
  "ego.velocity_forward", "ego.velocity_left", "ego.angular_velocity_y",
  "ego.pitch", "ego.roll", "ego.battery_voltage", "ego.total_current",
  "ego.payload_count", "ego.lift_height", "ego.lift_velocity", "ego.flywheel_speed", "ego.mechanism_jammed",
];
for (const name of POLICY_MOTOR_NAMES) featureNames.push(`ego.motor.${name}.velocity`, `ego.motor.${name}.current`);
for (const name of POLICY_SERVO_NAMES) featureNames.push(`ego.servo.${name}.position`);
featureNames.push("ego.sensor.beam_break", "ego.sensor.distance", "ego.sensor.color_red", "ego.sensor.color_green", "ego.sensor.color_blue");
for (let slot = 0; slot < POLICY_ELEMENT_SLOTS; slot++) {
  for (const feature of ["present", "pollen", "nectar", "alliance_own", "alliance_opponent", "alliance_neutral", "relative_x", "relative_z", "relative_velocity_x", "relative_velocity_z", "height"]) {
    featureNames.push(`element.${slot}.${feature}`);
  }
}
for (let slot = 0; slot < POLICY_OTHER_ROBOT_SLOTS; slot++) {
  for (const feature of ["present", "teammate", "relative_x", "relative_z", "relative_heading_sin", "relative_heading_cos", "relative_velocity_x", "relative_velocity_z"]) {
    featureNames.push(`robot.${slot}.${feature}`);
  }
}
for (let slot = 0; slot < POLICY_HIVE_SLOTS; slot++) {
  for (const feature of ["present", "relative_x", "relative_z", "angle", "angular_velocity"]) featureNames.push(`hive.${slot}.${feature}`);
}
for (let slot = 0; slot < POLICY_FLOWER_SLOTS; slot++) {
  for (const feature of ["present", "relative_x", "relative_z", "qualifying_nectar_count_normalized", "top_own", "top_opponent", "bottom_bonus_own", "bottom_bonus_opponent"]) featureNames.push(`flower.${slot}.${feature}`);
}
for (let slot = 0; slot < POLICY_GARDEN_SLOTS; slot++) {
  for (const feature of ["present", "relative_x", "relative_z", "owning_alliance", "pollen_count_normalized"]) featureNames.push(`garden.${slot}.${feature}`);
}

/** Feature order is part of the ONNX ABI. Any change requires a new schema version. */
export const POLICY_OBSERVATION_FEATURES: readonly string[] = Object.freeze(featureNames);
export const POLICY_OBSERVATION_SIZE = POLICY_OBSERVATION_FEATURES.length;
export const POLICY_ACTION_SIZE = POLICY_ACTION_CHANNELS.length;

export type MatchPhase = "setup" | "init" | "auto" | "transition" | "teleop-handoff" | "teleop" | "settling" | "results" | "stopped";
export interface PublicElementView {
  id: string;
  kind: "pollen" | "nectar";
  alliance: WorldAlliance | null;
  /** Camera-derived robot-relative measurement; never a hidden world-state lookup. */
  relativePosition: { x: number; y: number; z: number };
  relativeVelocity: { x: number; y: number; z: number };
}
/** Deliberately omits all opponent mechanism, payload, sensor, and motor state. */
export interface PublicRobotView {
  id: RobotId;
  alliance: WorldAlliance;
  /** Camera-derived measurement. Type intentionally has no motor/mechanism/sensor fields. */
  relativePosition: { x: number; y: number; z: number };
  relativeHeadingRadians: number;
  relativeVelocity: { x: number; y: number; z: number };
}
export interface PublicHiveView {
  id: string;
  alliance: WorldAlliance;
  relativePosition: { x: number; y: number; z: number };
  angleRadians: number;
  angularVelocityRadiansPerSecond: number;
}
export interface PublicFlowerView {
  id: string;
  /** Relative location from map plus the robot's noisy odometry estimate. */
  relativePosition: { x: number; y: number; z: number };
  /** Count of qualifying NECTAR only. No mechanical capacity is implied by this feature. */
  qualifyingNectarCount: number;
  topAlliance: WorldAlliance | null;
  bottomBonusAlliance: WorldAlliance | null;
}
export interface PublicGardenView {
  id: string;
  relativePosition: { x: number; y: number; z: number };
  owningAlliance: WorldAlliance;
  pollenCount: number;
}

export interface EstimatedRobotPose {
  /** Field-relative odometry/Pinpoint pose, optionally fused with currently visible AprilTags. */
  xMeters: number;
  zMeters: number;
  headingRadians: number;
  forwardVelocityMetersPerSecond: number;
  leftVelocityMetersPerSecond: number;
  yawRateRadiansPerSecond: number;
  source: "odometry" | "april-tag-fusion" | "field-view";
}
export type OwnRobotTelemetry = Pick<WorldRobotState, "sensors" | "motors" | "servos" | "payload" | "mechanism">;

/** Per-robot view. `ownRobot` may contain its own hardware feedback; other robots may not. */
export interface PolicyObservationView {
  robotId: RobotId;
  alliance: WorldAlliance;
  physicsVersion: string;
  phase: MatchPhase;
  elapsedMatchMs: number;
  redScore: number;
  blueScore: number;
  fieldHalfSizeMeters: number;
  estimatedPose: EstimatedRobotPose;
  ownRobot: OwnRobotTelemetry;
  visibleElements: readonly PublicElementView[];
  visibleRobots: readonly PublicRobotView[];
  visibleHives: readonly PublicHiveView[];
  flowers: readonly PublicFlowerView[];
  gardens: readonly PublicGardenView[];
}

export interface PolicyObservation {
  schema: typeof POLICY_OBSERVATION_VERSION;
  physicsVersion: string;
  robotId: RobotId;
  tick: number;
  /** Dense float32 feature vector with POLICY_OBSERVATION_FEATURES ordering. */
  values: Float32Array;
}

export interface PolicyAction {
  schema: typeof POLICY_ACTION_VERSION;
  robotId: RobotId;
  /** Eleven bounded controls in POLICY_ACTION_CHANNELS order. Drive motors are controlled conventionally. */
  values: Float32Array;
}

export function encodePolicyObservation(view: PolicyObservationView): PolicyObservation {
  const values: number[] = [];
  const put = (value: number, scale = 1): void => { values.push(clampFinite(value / scale)); };
  const own = view.alliance;
  const opponent = own === "red" ? "blue" : "red";
  const phase = view.phase;
  values.push(+(phase === "setup"), +(phase === "init"), +(phase === "auto"), +(phase === "transition"), +(phase === "teleop-handoff"), +(phase === "teleop"), +(phase === "settling"), +(phase === "results"), +(phase === "stopped"));
  values.push(+(own === "red"), +(own === "blue"));
  put(own === "red" ? view.redScore : view.blueScore, 100);
  put(own === "red" ? view.blueScore : view.redScore, 100);
  put(Math.max(0, 158_000 - view.elapsedMatchMs), 158_000);

  const telemetry = view.ownRobot;
  const pose = view.estimatedPose;
  const half = Math.max(0.1, view.fieldHalfSizeMeters);
  const yaw = pose.headingRadians;
  put(pose.xMeters, half);
  put(pose.zMeters, half);
  values.push(Math.sin(yaw), Math.cos(yaw));
  put(pose.forwardVelocityMetersPerSecond, 3);
  put(pose.leftVelocityMetersPerSecond, 3);
  put(pose.yawRateRadiansPerSecond, 4);
  put(telemetry.sensors.orientation.pitchRadians, Math.PI / 2);
  put(telemetry.sensors.orientation.rollRadians, Math.PI / 2);
  put(telemetry.sensors.voltage, 14);
  put(telemetry.sensors.currentAmps, 60);
  put(telemetry.payload.length, 4);
  put(telemetry.mechanism.liftHeight, 0.5);
  put(telemetry.mechanism.liftVelocity, 1);
  put(telemetry.mechanism.flywheelRadiansPerSecond, 500);
  values.push(+telemetry.mechanism.jammed);

  for (const name of POLICY_MOTOR_NAMES) {
    const motor = telemetry.motors[name];
    put(motor?.velocityRadiansPerSecond ?? 0, 100);
    put(motor?.currentAmps ?? 0, 15);
  }
  for (const name of POLICY_SERVO_NAMES) {
    const servo = telemetry.servos[name];
    put(servo?.angle ?? 0, Math.PI * 2);
  }
  values.push(+Boolean(telemetry.sensors.digital.beam_break));
  const distance = telemetry.sensors.distance.distance ?? firstFinite(telemetry.sensors.distance);
  put(Number.isFinite(distance) ? distance : 4, 4);
  const color = telemetry.sensors.color.color ?? firstColor(telemetry.sensors.color);
  put(color?.red ?? 0, 1); put(color?.green ?? 0, 1); put(color?.blue ?? 0, 1);

  const elements = nearest(view.visibleElements);
  for (let slot = 0; slot < POLICY_ELEMENT_SLOTS; slot++) {
    const element = elements[slot];
    if (!element) { values.push(...Array(11).fill(0)); continue; }
    const relative = element.relativePosition;
    const velocity = element.relativeVelocity;
    values.push(1, +(element.kind === "pollen"), +(element.kind === "nectar"), +(element.alliance === own), +(element.alliance === opponent), +(element.alliance === null));
    put(relative.x, 4); put(relative.z, 4); put(velocity.x, 3); put(velocity.z, 3); put(relative.y, 1);
  }

  const visibleRobots = nearest(view.visibleRobots.filter((robot) => robot.id !== view.robotId));
  for (let slot = 0; slot < POLICY_OTHER_ROBOT_SLOTS; slot++) {
    const robot = visibleRobots[slot];
    if (!robot) { values.push(...Array(8).fill(0)); continue; }
    const relative = robot.relativePosition;
    const velocity = robot.relativeVelocity;
    values.push(1, +(robot.alliance === own));
    put(relative.x, 4); put(relative.z, 4);
    values.push(Math.sin(robot.relativeHeadingRadians), Math.cos(robot.relativeHeadingRadians));
    put(velocity.x, 3); put(velocity.z, 3);
  }

  for (const alliance of ["red", "blue"] as const) {
    const hive = view.visibleHives.find((item) => item.alliance === alliance);
    if (!hive) { values.push(...Array(5).fill(0)); continue; }
    values.push(1); put(hive.relativePosition.x, 4); put(hive.relativePosition.z, 4); put(hive.angleRadians, Math.PI / 2); put(hive.angularVelocityRadiansPerSecond, 4);
  }

  if (view.flowers.length !== POLICY_FLOWER_SLOTS || view.gardens.length !== POLICY_GARDEN_SLOTS) throw new Error("BIOBUZZ V1 requires four FLOWER and two GARDEN observations.");
  for (const flower of view.flowers) {
    values.push(1); put(flower.relativePosition.x, 4); put(flower.relativePosition.z, 4); put(flower.qualifyingNectarCount, POLICY_MAX_SCORING_ELEMENT_COUNT_SCALE);
    values.push(+(flower.topAlliance === own), +(flower.topAlliance === opponent), +(flower.bottomBonusAlliance === own), +(flower.bottomBonusAlliance === opponent));
  }

  for (const garden of view.gardens) {
    values.push(1); put(garden.relativePosition.x, 4); put(garden.relativePosition.z, 4); values.push(+(garden.owningAlliance === own)); put(garden.pollenCount, POLICY_MAX_POLLEN_COUNT_SCALE);
  }

  if (values.length !== POLICY_OBSERVATION_SIZE) throw new Error(`BIOBUZZ policy observation ABI mismatch: expected ${POLICY_OBSERVATION_SIZE}, got ${values.length}.`);
  if (values.some((value) => !Number.isFinite(value))) throw new Error("BIOBUZZ policy observation contains a non-finite value.");
  return { schema: POLICY_OBSERVATION_VERSION, physicsVersion: view.physicsVersion, robotId: view.robotId, tick: telemetry.sensors.tick, values: Float32Array.from(values) };
}

export function decodePolicyAction(
  robotId: RobotId,
  tick: number,
  sequence: number,
  values: ArrayLike<number>,
  configuration: WorldRobotConfiguration,
  ownRobot?: OwnRobotTelemetry,
): WorldCommand {
  if (values.length !== POLICY_ACTION_SIZE) throw new Error(`BIOBUZZ policy action ABI mismatch: expected ${POLICY_ACTION_SIZE}, got ${values.length}.`);
  const chassisForward = finiteBounded(Number(values[0]), "chassis forward") * POLICY_ACTION_LIMITS.forwardMetersPerSecond;
  const chassisStrafe = finiteBounded(Number(values[1]), "chassis strafe") * POLICY_ACTION_LIMITS.strafeMetersPerSecond;
  const chassisYaw = finiteBounded(Number(values[2]), "chassis yaw") * POLICY_ACTION_LIMITS.yawRadiansPerSecond;
  const motors: Record<string, MotorCommand> = {};
  const servos: Record<string, number> = {};
  const driveMotorNames = new Set(POLICY_MOTOR_NAMES.slice(0, 4));
  if (configuration.wheels.length !== driveMotorNames.size) throw new Error("Policy chassis controller requires the four-motor BIOBUZZ mecanum drivetrain.");
  const driveTargets: { name: string; ticksPerSecond: number; maximumTicksPerSecond: number }[] = [];
  for (const wheel of configuration.wheels) {
    if (!driveMotorNames.has(wheel.motor as typeof POLICY_MOTOR_NAMES[number])) throw new Error(`Unexpected drive motor in policy configuration: ${wheel.motor}`);
    const motor = configuration.motors.find((item) => item.name === wheel.motor);
    if (!motor || wheel.radius <= 0) throw new Error(`Incomplete wheel configuration for ${wheel.motor}.`);
    const wheelForward = chassisForward + chassisYaw * wheel.mount.z;
    const wheelLeft = chassisStrafe + chassisYaw * wheel.mount.x;
    const wheelLinear = Math.cos(wheel.tractionAngle) * wheelForward + Math.sin(wheel.tractionAngle) * wheelLeft;
    const driveProjection = Math.abs(wheel.driveProjection ?? Math.cos(wheel.tractionAngle));
    if (!Number.isFinite(driveProjection) || driveProjection <= 1e-6) throw new Error(`Invalid drive projection for ${wheel.motor}.`);
    const motorRadiansPerSecond = wheelLinear / (wheel.radius * driveProjection) * motor.reduction;
    // velocitySetpoint is expressed in the configured FTC encoder direction. Emit
    // REVERSE for mirrored motors below, so a positive chassis setpoint remains
    // positive motor rotation and positive wheel traction on both sides.
    const ticksPerSecond = motorRadiansPerSecond * motor.profile.ticksPerRevolution / (2 * Math.PI);
    const maximumTicksPerSecond = motor.profile.freeSpeedRpm / 60 * motor.profile.ticksPerRevolution;
    driveTargets.push({ name: motor.name, ticksPerSecond, maximumTicksPerSecond });
  }
  const normalization = Math.max(1, ...driveTargets.map((target) => Math.abs(target.ticksPerSecond) / target.maximumTicksPerSecond));
  for (const target of driveTargets) {
    const motor = configuration.motors.find((item) => item.name === target.name)!;
    motors[target.name] = { power: 0, direction: motorDirection(motor), mode: "RUN_USING_ENCODER", velocitySetpoint: target.ticksPerSecond / normalization, zeroPowerBehavior: "BRAKE" };
  }
  const mechanisms = configuration.mechanisms;
  const intakeMotorName = mechanisms?.intake.motor;
  const feederMotorName = mechanisms?.feeder.motor;
  const intakePower = finiteBounded(Number(values[3]), "intake");
  const feederPower = finiteBounded(Number(values[4]), "feeder");
  if (intakeMotorName && intakeMotorName === feederMotorName) {
    const motor = configuration.motors.find((item) => item.name === intakeMotorName);
    if (motor) motors[intakeMotorName] = { power: arbitrateSharedMotorPower(intakePower, feederPower), direction: motorDirection(motor), zeroPowerBehavior: "BRAKE" };
  } else {
    for (const [name, power] of [[intakeMotorName, intakePower], [feederMotorName, feederPower]] as const) {
      if (!name) continue;
      const motor = configuration.motors.find((item) => item.name === name);
      if (motor) motors[name] = { power, direction: motorDirection(motor), zeroPowerBehavior: "BRAKE" };
    }
  }
  for (const [name, index] of [[mechanisms?.shooter.motor, 5], [mechanisms?.lift.motor, 6]] as const) {
    if (!name) continue;
    const motor = configuration.motors.find((item) => item.name === name);
    if (!motor) continue;
    const normalizedVelocity = finiteBounded(Number(values[index]), `${name} velocity`);
    const motorRadiansPerSecond = normalizedVelocity * motor.profile.freeSpeedRpm * Math.PI / 30;
    const ticksPerSecond = motorRadiansPerSecond * motor.profile.ticksPerRevolution / (2 * Math.PI);
    motors[name] = { power: 0, direction: motorDirection(motor), mode: "RUN_USING_ENCODER", velocitySetpoint: ticksPerSecond, zeroPowerBehavior: "BRAKE" };
  }
  const turretTarget = finiteBounded(Number(values[7]), "turret target");
  const turretMotorName = mechanisms?.shooter.turretMotor;
  if (turretMotorName) {
    const motor = configuration.motors.find((item) => item.name === turretMotorName);
    if (motor) {
      const desiredAngle = normalizeRotationRadians(turretTarget * Math.PI);
      const state = ownRobot?.motors[turretMotorName];
      const currentAngle = ownRobot ? robotTurretAngle(configuration, ownRobot) : 0;
      const currentTicks = state
        ? (state.positionRadians - state.encoderOffsetRadians) * motor.profile.ticksPerRevolution / (2 * Math.PI)
        : 0;
      const normalizedError = normalizeRotationRadians(desiredAngle - currentAngle);
      const angleError = normalizedError > Math.PI ? normalizedError - 2 * Math.PI : normalizedError;
      const targetPosition = Math.round(currentTicks + angleError * motor.reduction * motor.profile.ticksPerRevolution / (2 * Math.PI));
      const targetTolerance = Math.max(2, Math.round(motor.profile.ticksPerRevolution * motor.reduction / 360));
      motors[turretMotorName] = {
        power: Math.abs(targetPosition - currentTicks) <= targetTolerance ? 0 : 1,
        direction: motorDirection(motor),
        mode: "RUN_TO_POSITION",
        targetPosition,
        targetPositionTolerance: targetTolerance,
        zeroPowerBehavior: "BRAKE",
      };
    }
  } else if (mechanisms?.shooter.turretServo) {
    servos[mechanisms.shooter.turretServo] = (turretTarget + 1) / 2;
  }
  for (const [index, name] of [[8, mechanisms?.shooter.hoodServo], [9, mechanisms?.lift.releaseServo], [10, mechanisms?.gate.servo]] as const) {
    if (!name || !configuration.servos.some((item) => item.name === name)) continue;
    const value = finiteBounded(Number(values[index]), `servo ${name}`);
    servos[name] = (value + 1) / 2;
  }
  return { robotId, tick, sequence, motors, servos, source: "policy" };
}

/** Resolve two ABI controls that address one physical shaft. Stronger intent wins; reverse wins exact ties. */
function arbitrateSharedMotorPower(intake: number, feeder: number): number {
  if (Math.abs(intake) === Math.abs(feeder)) return Math.min(intake, feeder);
  return Math.abs(intake) > Math.abs(feeder) ? intake : feeder;
}

export interface PolicyManifest {
  protocolVersion: 1;
  contractVersion: typeof POLICY_CONTRACT_VERSION;
  observationSchema: typeof POLICY_OBSERVATION_VERSION;
  actionSchema: typeof POLICY_ACTION_VERSION;
  physicsVersion: string;
  observationSize: number;
  actionSize: number;
  observationFeatures: readonly string[];
  actionChannels: readonly string[];
  motorNames: readonly string[];
  servoNames: readonly string[];
  robotIds: readonly RobotId[];
  model: { path: string; sha256: string; sizeBytes: number; format: "onnx" };
  trained: true;
  training: { algorithm: "PPO"; seed: number; timesteps: number; curriculum: readonly string[]; evaluationReport: string };
}

export function assertPolicyManifest(value: unknown): asserts value is PolicyManifest {
  if (!value || typeof value !== "object") throw new Error("Policy manifest must be an object.");
  const manifest = value as Partial<PolicyManifest>;
  if (manifest.trained !== true) throw new Error("This policy has no verified trained weights.");
  if (manifest.protocolVersion !== 1 || !manifest.robotIds || manifest.robotIds.length !== POLICY_ROBOT_IDS.length || manifest.robotIds.some((id, index) => id !== POLICY_ROBOT_IDS[index])) throw new Error("Policy protocol or robot-seat contract is incompatible.");
  if (manifest.contractVersion !== POLICY_CONTRACT_VERSION || manifest.observationSchema !== POLICY_OBSERVATION_VERSION || manifest.actionSchema !== POLICY_ACTION_VERSION) throw new Error("Policy contract version is incompatible with this simulator.");
  if (manifest.observationSize !== POLICY_OBSERVATION_SIZE || manifest.actionSize !== POLICY_ACTION_SIZE) throw new Error("Policy model dimensions do not match the simulator ABI.");
  if (!manifest.observationFeatures || manifest.observationFeatures.length !== POLICY_OBSERVATION_FEATURES.length || manifest.observationFeatures.some((name, i) => name !== POLICY_OBSERVATION_FEATURES[i])) throw new Error("Policy observation feature order is incompatible.");
  if (!manifest.motorNames || manifest.motorNames.length !== POLICY_MOTOR_NAMES.length || manifest.motorNames.some((name, i) => name !== POLICY_MOTOR_NAMES[i]) || !manifest.servoNames || manifest.servoNames.length !== POLICY_SERVO_NAMES.length || manifest.servoNames.some((name, i) => name !== POLICY_SERVO_NAMES[i]) || !manifest.actionChannels || manifest.actionChannels.length !== POLICY_ACTION_CHANNELS.length || manifest.actionChannels.some((name, i) => name !== POLICY_ACTION_CHANNELS[i])) throw new Error("Policy hardware map or action contract is incompatible.");
  if (!manifest.physicsVersion || manifest.physicsVersion !== POLICY_PHYSICS_VERSION) throw new Error("Policy was trained against a different physics version.");
  if (!manifest.model || manifest.model.format !== "onnx" || typeof manifest.model.path !== "string" || manifest.model.path.length === 0 || manifest.model.path.startsWith("/") || manifest.model.path.startsWith("\\") || /^[a-z][a-z\d+.-]*:/i.test(manifest.model.path) || manifest.model.path.split(/[\\/]/).includes("..") || !/^[0-9a-f]{64}$/i.test(manifest.model.sha256) || !Number.isSafeInteger(manifest.model.sizeBytes) || manifest.model.sizeBytes <= 0) throw new Error("Policy model provenance, same-origin relative path, positive size, or checksum is missing.");
  if (!manifest.training || manifest.training.algorithm !== "PPO" || !Number.isSafeInteger(manifest.training.seed) || !Number.isSafeInteger(manifest.training.timesteps) || manifest.training.timesteps <= 0 || !Array.isArray(manifest.training.curriculum) || !manifest.training.evaluationReport) throw new Error("Policy training provenance or evaluation report is missing.");
}

function finiteBounded(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`Policy returned a non-finite ${label} command.`);
  return Math.max(-1, Math.min(1, value));
}
function motorDirection(motor: WorldRobotConfiguration["motors"][number]): "FORWARD" | "REVERSE" {
  return motor.inverted ? "REVERSE" : "FORWARD";
}
function clampFinite(value: number): number { return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0; }
function nearest<T extends { relativePosition: { x: number; z: number } }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Math.hypot(a.relativePosition.x, a.relativePosition.z) - Math.hypot(b.relativePosition.x, b.relativePosition.z));
}
function firstFinite(values: Record<string, number>): number {
  return Object.values(values).find(Number.isFinite) ?? 0;
}
function firstColor(values: WorldRobotState["sensors"]["color"]): { red: number; green: number; blue: number; alpha: number } | undefined {
  return Object.values(values)[0];
}
