/** Shared browser, replay and training contracts. All distances use metres, angles radians. */
export type Vector3 = { x: number; y: number; z: number };
export type Quaternion = { x: number; y: number; z: number; w: number };
export type WorldAlliance = "red" | "blue";
export type RobotId = "red-1" | "red-2" | "blue-1" | "blue-2";
export type WorldFieldPreset = "biobuzz-2026-2027" | "decode-2025-2026" | "empty";
export type Transform3 = { position: Vector3; rotation: Quaternion };
/** Closed convex rule volume: dot(normal, point) <= offset, with unit normals. */
export interface ConvexRuleVolume { planes: { normal: Vector3; offset: number }[] }

export interface PhysicalParameter {
  value: number;
  unit: string;
  source: string;
  status: "published" | "derived" | "experimental";
  /** Permitted training randomization, never a claim of measured uncertainty. */
  experimentalRange?: readonly [number, number];
}

export interface MotorElectricalProfile {
  id: string;
  nominalVoltage: number;
  freeSpeedRpm: number;
  stallTorqueNm: number;
  stallCurrentAmps: number;
  freeCurrentAmps: number;
  ticksPerRevolution: number;
  rotorInertiaKgM2: number;
  source: string;
}

export interface WorldMotorConfiguration {
  name: string;
  profile: MotorElectricalProfile;
  /** Additional reduction after the published gearmotor output. */
  reduction: number;
  efficiency: number;
  inverted: boolean;
}

export interface WheelConfiguration {
  motor: string;
  mount: Vector3;
  radius: number;
  /** Imported CAD can supply axial thickness and unit axle direction for start-fit bounds. */
  width?: number;
  axle?: Vector3;
  /** Direction of constrained ground travel, measured from robot forward (+X). */
  tractionAngle: number;
  /** Wheel rim speed projected onto the constrained direction; mecanum rollers use cos(45°). */
  driveProjection?: number;
  grip: number;
  rollerGrip: number;
  inertiaKgM2: number;
  suspensionTravel: number;
  springNPerM: number;
  damperNsPerM: number;
}

export interface WorldServoConfiguration {
  name: string;
  mount: Vector3;
  minRadians: number;
  maxRadians: number;
  speedRadiansPerSecond: number;
  torqueNm: number;
  inertiaKgM2: number;
  source: string;
}

export interface CameraConfiguration {
  name: string;
  mount: Transform3;
  horizontalFovRadians: number;
  verticalFovRadians: number;
  maximumRange: number;
  latencyMs: number;
  framesPerSecond: number;
  positionNoiseMeters: number;
  angleNoiseRadians: number;
}

export interface WorldSensorConfiguration {
  name: string;
  kind: "digital" | "distance" | "color" | "analog" | "odometry" | "pinpoint";
  mount: Transform3;
  maximumRange: number;
  noise: number;
  latencyMs: number;
}

export interface MechanismConfiguration {
  intake: { motor: string; mount: Vector3; width: number; radius: number; complianceNPerM: number };
  feeder: { motor: string; /** Additional reduction from the motor's mechanism output to the feeder rollers. */ reduction?: number; speedMetersPerSecond: number; grip: number };
  storage: { mount: Vector3; width: number; length: number; capacity: number };
  shooter: { motor: string; mount: Vector3; wheelRadius: number; inertiaKgM2: number; compression: number; /** Exactly one turret actuator; servos remain supported for existing manifests. */ turretMotor?: string; turretServo?: string; turretInertiaKgM2?: number; hoodServo: string };
  lift: { motor: string; mount: Vector3; /** Unit travel direction in robot coordinates; omitted means vertical. */ axis?: Vector3; spoolRadius: number; /** Distance along the telescoping rail. */ maximumTravel: number; carriageMassKg: number; releaseServo: string };
  gate: { servo: string; rejectionThreshold: number };
}

export interface WorldRobotConfiguration {
  id: string;
  label: string;
  chassis: { size: Vector3; massKg: number; centerOfMass: Vector3 };
  motors: WorldMotorConfiguration[];
  wheels: WheelConfiguration[];
  servos: WorldServoConfiguration[];
  sensors: WorldSensorConfiguration[];
  cameras: CameraConfiguration[];
  mechanisms?: MechanismConfiguration;
  battery: { openCircuitVoltage: number; internalResistanceOhms: number; maximumCurrentAmps: number };
  physicalAccuracy: "unvalidated";
  /** Self-contained imported CAD. Geometry uses the robot's metre/Y-up frame. */
  visualModel?: ImportedRobotVisual;
}

export interface ImportedRobotVisual {
  version: 1;
  sourceFileName: string;
  sourceSha256: string;
  /** Legacy inline models remain readable; new imports use a compressed repository asset. */
  glbBase64?: string;
  asset?: { path: string; sha256: string; byteLength: number; encoding: "gzip" };
  wheelBindings: { path: number[]; motor: string; pivot: Vector3; axis: Vector3 }[];
  motionBindings?: { path: number[]; motor: string; pivot: Vector3; axis: Vector3; ratio: number; phase: "motor" | "wheel" }[];
  hardware: { partName: string; productId: string; hardwareName: string; method: string }[];
}

export interface WorldRobotSetup {
  id: RobotId;
  alliance: WorldAlliance;
  controller?: "opmode" | "policy";
  configuration: WorldRobotConfiguration;
  position: Vector3;
  heading: number;
}

export interface MotorCommand {
  power: number;
  direction?: "FORWARD" | "REVERSE";
  mode?: "RUN_WITHOUT_ENCODER" | "RUN_USING_ENCODER" | "RUN_TO_POSITION" | "STOP_AND_RESET_ENCODER";
  zeroPowerBehavior?: "BRAKE" | "FLOAT";
  targetPosition?: number;
  targetPositionTolerance?: number;
  velocitySetpoint?: number;
  enabled?: boolean;
}

export interface WorldCommand {
  robotId: RobotId;
  /** Command takes effect at this simulation tick, never wall time. */
  tick: number;
  sequence: number;
  motors: Record<string, MotorCommand>;
  servos: Record<string, number>;
  source: "opmode" | "policy" | "replay";
}

export interface MotorPhysicalState {
  positionRadians: number;
  velocityRadiansPerSecond: number;
  encoderOffsetRadians: number;
  currentAmps: number;
  torqueNm: number;
  temperatureC: number;
}

export interface ServoPhysicalState {
  target: number;
  angle: number;
  velocity: number;
  torque: number;
}

export interface AprilTagObservation {
  id: number;
  camera: string;
  captureTimeMs: number;
  availableTimeMs: number;
  translation: Vector3;
  rotation: Quaternion;
  rangeMeters: number;
  bearingRadians: number;
  elevationRadians: number;
}

export interface WorldSensorFrame {
  robotId: RobotId;
  tick: number;
  simulationTimeMs: number;
  orientation: { yawRadians: number; pitchRadians: number; rollRadians: number };
  /** Body-local simulation axes: +X forward, +Y up, +Z right. SDK adapters map to FTC X right/Y forward/Z up. */
  angularVelocity: Vector3;
  voltage: number;
  currentAmps: number;
  motors: Record<string, { positionTicks: number; velocityTicksPerSecond: number; currentAmps: number; enabled: boolean }>;
  digital: Record<string, boolean>;
  analog: Record<string, number>;
  distance: Record<string, number>;
  color: Record<string, { red: number; green: number; blue: number; alpha: number }>;
  odometry: Record<string, { xMeters: number; yMeters: number; headingRadians: number; xVelocity: number; yVelocity: number; angularVelocity: number }>;
  aprilTags: AprilTagObservation[];
}

export interface WorldBodyState extends Transform3 {
  id: string;
  linearVelocity: Vector3;
  angularVelocity: Vector3;
}

export interface ElementState extends WorldBodyState {
  kind: "pollen" | "nectar" | "artifact";
  appearance?: "green" | "purple";
  alliance: WorldAlliance | null;
  radius: number;
  location: "field" | "supply" | "out-of-bounds";
  controlledBy: RobotId | null;
  dischargedUntilFloorContact: boolean;
}

export interface WorldRobotState extends WorldBodyState {
  id: RobotId;
  alliance: WorldAlliance;
  motors: Record<string, MotorPhysicalState>;
  servos: Record<string, ServoPhysicalState>;
  payload: string[];
  mechanism: { liftHeight: number; liftVelocity: number; jammed: boolean; flywheelRadiansPerSecond: number };
  sensors: WorldSensorFrame;
}

export interface WorldObservation {
  physicsVersion: string;
  seed: number;
  tick: number;
  simulationTimeMs: number;
  robots: WorldRobotState[];
  elements: ElementState[];
  hives: WorldBodyState[];
  physicalAccuracy: "unvalidated";
}

export type WorldCollider = {
  id: string;
  position: Vector3;
  rotation?: Quaternion;
  shape: { kind: "box"; halfExtents: Vector3 } | { kind: "mesh"; vertices: number[]; indices: number[] } | { kind: "cylinder"; halfHeight: number; radius: number };
  friction?: number;
  restitution?: number;
};

export interface HiveConfiguration {
  id: string;
  alliance: WorldAlliance;
  pivot: Vector3;
  axis: Vector3;
  initialAngle: number;
  lowerLimit: number;
  upperLimit: number;
  massKg: number;
  centerOfMass: Vector3;
  angularDamping: number;
  physicalParameters?: { massKg: string; centerOfMassRadius: string; angularDamping: string };
  colliders: WorldCollider[];
  cells: { id: string; center: Vector3; halfExtents: Vector3; rotation?: Quaternion; openingNormal?: Vector3; volume?: ConvexRuleVolume }[];
  dampers: { local: Vector3; frame: Vector3; contactDistance: number }[];
}

export interface WorldFieldConfiguration {
  preset: WorldFieldPreset;
  halfSize: number;
  floorHeight: number;
  colliders: WorldCollider[];
  hives: HiveConfiguration[];
  tags: { id: number; parentHive?: string; transform: Transform3; sizeMeters: number }[];
  flowers: { id: string; position: Vector3; scoringRadius: number; bottom: number; top: number }[];
  gardens: { id: string; alliance: WorldAlliance; center: Vector3; halfExtents: Vector3 }[];
  loadingZones: { alliance: WorldAlliance; center: Vector3; halfExtents: Vector3 }[];
  spawns: { id: string; kind: "pollen" | "nectar" | "artifact"; alliance: WorldAlliance | null; position: Vector3; location: "field" | "supply"; robotId?: RobotId; radius?: number; massKg?: number; appearance?: "green" | "purple" }[];
}

export interface SimulationWorldOptions {
  seed: number;
  field: WorldFieldConfiguration;
  robots: WorldRobotSetup[];
  recordCommands?: boolean;
  parameters?: Partial<Record<string, number>>;
}

export const PHYSICS_STEP_SECONDS = 1 / 200;
export const CONTROL_STEP_TICKS = 4;
export const PHYSICS_VERSION = "biobuzz-rapier-0.21.0-v9";
