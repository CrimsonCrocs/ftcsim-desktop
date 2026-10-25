import type { MotorElectricalProfile, PhysicalParameter, Vector3, WorldMotorConfiguration, WorldRobotConfiguration, WorldServoConfiguration } from "./world-types.js";
import { robotFixedGeometry, robotLiftPosition } from "./robot-geometry.js";
import { QUAT_IDENTITY, rotate3 } from "./world-math.js";

const MOTOR_SOURCE = "https://www.gobilda.com/content/spec_sheets/5203-2402-0019_spec_sheet.pdf";
const SERVO_SOURCE = "https://www.gobilda.com/2000-series-dual-mode-servo-25-2-torque/";
export const YELLOW_JACKET_312: MotorElectricalProfile = {
  id: "gobilda-5203-2402-0019", nominalVoltage: 12, freeSpeedRpm: 312,
  stallTorqueNm: 24.3 * 0.0980665, stallCurrentAmps: 9.2, freeCurrentAmps: 0.25,
  ticksPerRevolution: 537.7, rotorInertiaKgM2: 0.0012, source: MOTOR_SOURCE,
};

/** Published values are separated from experimental defaults; no hardware calibration is claimed. */
export const WORLD_PHYSICAL_PARAMETERS: Record<string, PhysicalParameter> = {
  gravity: { value: 9.80665, unit: "m/s²", source: "standard gravity", status: "published" },
  pollenRadius: { value: 0.03556, unit: "m", source: "BIOBUZZ V1 §9.8 (nominal 2.8 in)", status: "published" },
  nectarRadius: { value: 0.04572, unit: "m", source: "BIOBUZZ V1 §9.8 (nominal 3.6 in)", status: "published" },
  pollenMass: { value: 0.02494758035, unit: "kg", source: "https://andymark.com/products/biobuzz-scoring-elements — published nominal 0.055 lb; individual elements unmeasured", status: "published" },
  nectarMass: { value: 0.04127690567, unit: "kg", source: "https://andymark.com/products/biobuzz-scoring-elements — published nominal 0.091 lb; individual elements unmeasured", status: "published" },
  ballRestitution: { value: 0.42, unit: "ratio", source: "experimental hollow polyethylene ball collision estimate; no drop-test calibration", status: "experimental", experimentalRange: [0.3, 0.55] },
  ballFriction: { value: 0.65, unit: "ratio", source: "experimental polyethylene/tile contact estimate", status: "experimental", experimentalRange: [0.5, 0.8] },
  rollingResistance: { value: 0.035, unit: "ratio", source: "experimental hollow ball deformation loss", status: "experimental", experimentalRange: [0.02, 0.06] },
  wheelGrip: { value: 0.85, unit: "ratio", source: "experimental mecanum rubber/tile contact estimate", status: "experimental", experimentalRange: [0.65, 1.05] },
  intakeGrip: { value: 0.9, unit: "ratio", source: "experimental compliant intake roller/ball contact estimate; unmeasured", status: "experimental", experimentalRange: [0.6, 1.5] },
  airDensity: { value: 1.204, unit: "kg/m³", source: "dry air, 20 °C, sea level", status: "derived" },
  sphereDrag: { value: 0.47, unit: "ratio", source: "ideal sphere approximation; perforated ball surface uncalibrated", status: "experimental", experimentalRange: [0.4, 0.6] },
  spinLift: { value: 0.08, unit: "ratio", source: "experimental Magnus-force coefficient", status: "experimental", experimentalRange: [0.03, 0.12] },
  motorOutputInertia: { value: 0.0012, unit: "kg·m²", source: "experimental rotor/gear inertia reflected to 19.2:1 output", status: "experimental", experimentalRange: [0.0008, 0.0016] },
  servoPassiveDamping: { value: 0.02, unit: "N·m·s/rad", source: "experimental geared-servo output loss after power removal; no measured spin-down calibration", status: "experimental", experimentalRange: [0.01, 0.05] },
  hiveMass: { value: 2, unit: "kg", source: "experimental aggregate moving HIVE mass; official CAD has no verified material mass properties", status: "experimental", experimentalRange: [1.5, 3] },
  hiveComRadius: { value: 0.045, unit: "m", source: "experimental COM offset along CELL symmetry axis; ballast washer configuration requires measurement", status: "experimental", experimentalRange: [0.025, 0.065] },
  hiveBearingDamping: { value: 0.15, unit: "1/s", source: "experimental revolute-bearing angular damping; separate from hydraulic endpoint dampers", status: "experimental", experimentalRange: [0.05, 0.3] },
  hiveDamperStroke: { value: 0.01, unit: "m", source: "experimental effective Blumotion contact stroke; endpoint anchors derived from official STEP; compression unmeasured", status: "experimental", experimentalRange: [0.006, 0.014] },
  hiveDamperResistance: { value: 180, unit: "N·s/m", source: "experimental hydraulic contact resistance; no measured damper force curve", status: "experimental", experimentalRange: [80, 300] },
};

type LiftConfiguration = NonNullable<NonNullable<WorldRobotConfiguration["mechanisms"]>["lift"]>;

const motor = (name: string, reduction = 1): WorldMotorConfiguration => ({ name, profile: { ...YELLOW_JACKET_312 }, reduction, efficiency: 0.9, inverted: false });
const servo = (name: string, mount: Vector3, minRadians: number, maxRadians: number): WorldServoConfiguration => ({
  name, mount, minRadians, maxRadians, speedRadiansPerSecond: Math.PI / 3 / 0.2,
  torqueNm: 21.6 * 0.0980665, inertiaKgM2: 0.004, source: SERVO_SOURCE,
});

export function createBiobuzzAllRounder(): WorldRobotConfiguration {
  const identity = { x: 0, y: 0, z: 0, w: 1 };
  return {
    id: "biobuzz-all-rounder-v4", label: "BIOBUZZ all-rounder", physicalAccuracy: "unvalidated",
    chassis: { size: { x: 0.438, y: 0.15, z: 0.438 }, massKg: 14, centerOfMass: { x: -0.02, y: 0.035, z: 0 } },
    motors: [motor("front_left_drive"), { ...motor("front_right_drive"), inverted: true }, motor("back_left_drive"), { ...motor("back_right_drive"), inverted: true }, motor("intake", 0.5), motor("turret", 5), motor("flywheel", 1 / 12), motor("lift", 2)],
    wheels: [
      { motor: "front_left_drive", mount: { x: 0.155, y: -0.03, z: -0.17 }, tractionAngle: -Math.PI / 4 },
      { motor: "front_right_drive", mount: { x: 0.155, y: -0.03, z: 0.17 }, tractionAngle: Math.PI / 4 },
      { motor: "back_left_drive", mount: { x: -0.155, y: -0.03, z: -0.17 }, tractionAngle: Math.PI / 4 },
      { motor: "back_right_drive", mount: { x: -0.155, y: -0.03, z: 0.17 }, tractionAngle: -Math.PI / 4 },
    ].map((wheel) => ({ ...wheel, radius: 0.048, grip: 0.85, rollerGrip: 0.035, inertiaKgM2: 0.00035, suspensionTravel: 0.028, springNPerM: 12000, damperNsPerM: 130 })),
    servos: [
      servo("hood", { x: -0.06, y: 0.26, z: 0 }, Math.PI / 12, Math.PI * 5 / 12),
      servo("release", { x: 0.17, y: 0.2, z: 0 }, 0, Math.PI / 2),
      servo("gate", { x: 0, y: 0.01, z: 0 }, 0, Math.PI / 2),
    ],
    sensors: [
      { name: "beam_break", kind: "digital", mount: { position: { x: 0.06, y: 0.015, z: -0.045 }, rotation: { x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } }, maximumRange: 0.09, noise: 0, latencyMs: 0 },
      { name: "distance", kind: "distance", mount: { position: { x: 0.225, y: 0.04, z: 0 }, rotation: identity }, maximumRange: 2, noise: 0.002, latencyMs: 20 },
      { name: "color", kind: "color", mount: { position: { x: 0.06, y: 0.015, z: -0.045 }, rotation: { x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } }, maximumRange: 0.1, noise: 0.01, latencyMs: 20 },
      { name: "lift_encoder", kind: "analog", mount: { position: { x: 0.17, y: 0.1, z: 0 }, rotation: identity }, maximumRange: 3.3, noise: 0, latencyMs: 0 },
      { name: "odo", kind: "pinpoint", mount: { position: { x: 0, y: -0.08, z: 0 }, rotation: identity }, maximumRange: 0, noise: 0.0002, latencyMs: 0 },
    ],
    cameras: [
      { name: "Webcam 1", mount: { position: { x: 0.12, y: 0.25, z: 0 }, rotation: { x: 0, y: 0, z: Math.sin(Math.PI / 12), w: Math.cos(Math.PI / 12) } }, horizontalFovRadians: Math.PI / 2, verticalFovRadians: Math.PI / 3, maximumRange: 4, latencyMs: 80, framesPerSecond: 30, positionNoiseMeters: 0.005, angleNoiseRadians: 0.01 },
      { name: "Intake camera", mount: { position: { x: 0.16, y: 0.1, z: 0 }, rotation: { x: 0, y: 0, z: -Math.sin(Math.PI / 12), w: Math.cos(Math.PI / 12) } }, horizontalFovRadians: Math.PI / 2, verticalFovRadians: Math.PI / 2, maximumRange: 2, latencyMs: 80, framesPerSecond: 30, positionNoiseMeters: 0.005, angleNoiseRadians: 0.01 },
    ],
    mechanisms: {
      intake: { motor: "intake", mount: { x: 0.2, y: -0.045, z: 0.012 }, width: 0.31, radius: 0.035, complianceNPerM: 600 },
      feeder: { motor: "intake", reduction: 2, speedMetersPerSecond: 0.6, grip: 0.8 },
      storage: { mount: { x: 0, y: -0.01, z: 0 }, width: 0.105, length: 0.36, capacity: 4 },
      shooter: { motor: "flywheel", mount: { x: -0.09, y: 0.24, z: 0 }, wheelRadius: 0.05, inertiaKgM2: 0.0012, compression: 0.006, turretMotor: "turret", turretInertiaKgM2: 0.012, hoodServo: "hood" },
      lift: { motor: "lift", mount: { x: 0.17, y: -0.063, z: 0 }, axis: { x: 0.25, y: Math.sqrt(0.9375), z: 0 }, spoolRadius: 0.018, maximumTravel: 0.61, carriageMassKg: 0.6, releaseServo: "release" },
      gate: { servo: "gate", rejectionThreshold: 0.65 },
    },
    battery: { openCircuitVoltage: 12.8, internalResistanceOhms: 0.045, maximumCurrentAmps: 40 },
  };
}

const STARTING_DIMENSION_METERS = 0.4572;
const EXPANDED_LONG_DIMENSION_METERS = 0.6096;
const EXPANDED_SHORT_DIMENSION_METERS = 0.4572;
const MAX_ROBOT_HEIGHT_METERS = 0.7366;

type NumericRange = readonly [minimum: number, maximum: number];

function addFiniteNumberErrors(value: unknown, path: string, errors: string[], seen = new Set<object>()): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) errors.push(`${path} must be a finite number.`);
    return;
  }
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) addFiniteNumberErrors(child, `${path}.${key}`, errors, seen);
}

function checkRange(value: number, range: NumericRange, label: string, errors: string[]): void {
  if (!Number.isFinite(value)) return; // The recursive finite-value check reports the precise property path.
  const [minimum, maximum] = range;
  if (value < minimum || value > maximum) errors.push(`${label} must be between ${minimum} and ${maximum}.`);
}

function checkPositive(value: number, label: string, errors: string[]): void {
  if (Number.isFinite(value) && value <= 0) errors.push(`${label} must be greater than zero.`);
}

function checkNonNegative(value: number, label: string, errors: string[]): void {
  if (Number.isFinite(value) && value < 0) errors.push(`${label} must not be negative.`);
}

function checkTransform(transform: { position: Vector3; rotation: { x: number; y: number; z: number; w: number } }, label: string, errors: string[]): void {
  const magnitude = Math.hypot(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w);
  if (Number.isFinite(magnitude) && (magnitude < 0.9 || magnitude > 1.1)) {
    errors.push(`${label} rotation must be a normalized quaternion.`);
  }
}

function checkMechanismReferences(
  mechanisms: NonNullable<WorldRobotConfiguration["mechanisms"]>,
  motorNames: Set<string>,
  servoNames: Set<string>,
  errors: string[],
): void {
  const motorReferences = [
    ["intake", mechanisms.intake.motor],
    ["feeder", mechanisms.feeder.motor],
    ["shooter", mechanisms.shooter.motor],
    ["lift", mechanisms.lift.motor],
    ...(mechanisms.shooter.turretMotor ? [["turret", mechanisms.shooter.turretMotor] as const] : []),
  ] as const;
  for (const [mechanism, name] of motorReferences) {
    if (!motorNames.has(name)) errors.push(`${mechanism} mechanism references missing motor “${name}”.`);
  }

  const servoReferences = [
    ...(mechanisms.shooter.turretServo ? [["turret", mechanisms.shooter.turretServo] as const] : []),
    ["hood", mechanisms.shooter.hoodServo],
    ["lift release", mechanisms.lift.releaseServo],
    ["sorting gate", mechanisms.gate.servo],
  ] as const;
  for (const [mechanism, name] of servoReferences) {
    if (!servoNames.has(name)) errors.push(`${mechanism} mechanism references missing servo “${name}”.`);
  }
  if (Boolean(mechanisms.shooter.turretMotor) === Boolean(mechanisms.shooter.turretServo)) {
    errors.push("The turret must reference exactly one motor or servo.");
  }
}

interface FootprintBounds {
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
  minimumY: number;
  maximumY: number;
}

function includeFootprint(bounds: FootprintBounds, x: number, z: number, halfX = 0, halfZ = 0): void {
  bounds.minimumX = Math.min(bounds.minimumX, x - halfX);
  bounds.maximumX = Math.max(bounds.maximumX, x + halfX);
  bounds.minimumZ = Math.min(bounds.minimumZ, z - halfZ);
  bounds.maximumZ = Math.max(bounds.maximumZ, z + halfZ);
}

function includeComponentBounds(bounds: FootprintBounds, x: number, y: number, z: number, halfX = 0, halfY = 0, halfZ = 0): void {
  includeFootprint(bounds, x, z, halfX, halfZ);
  if (![x, y, z, halfX, halfY, halfZ].every(Number.isFinite)) return;
  bounds.minimumY = Math.min(bounds.minimumY, y - halfY);
  bounds.maximumY = Math.max(bounds.maximumY, y + halfY);
}

function includeFixedBoxCorners(bounds: FootprintBounds, collider: ReturnType<typeof robotFixedGeometry>[number]): void {
  if (collider.shape.kind !== "box") return;
  const { halfExtents } = collider.shape;
  const rotation = collider.rotation ?? QUAT_IDENTITY;
  if (![collider.position.x, collider.position.y, collider.position.z, halfExtents.x, halfExtents.y, halfExtents.z, rotation.x, rotation.y, rotation.z, rotation.w].every(Number.isFinite)) return;
  for (const xSign of [-1, 1]) for (const ySign of [-1, 1]) for (const zSign of [-1, 1]) {
    const offset = rotate3({ x: xSign * halfExtents.x, y: ySign * halfExtents.y, z: zSign * halfExtents.z }, rotation);
    includeComponentBounds(bounds, collider.position.x + offset.x, collider.position.y + offset.y, collider.position.z + offset.z);
  }
}

interface LiftBox {
  position: Vector3;
  halfExtents: Vector3;
}

function getLiftAxis(lift: LiftConfiguration): Vector3 {
  return lift.axis ?? { x: 0, y: 1, z: 0 };
}

function liftCarriageBoxes(storageWidth: number): LiftBox[] {
  return [
    { position: { x: 0, y: 0, z: 0 }, halfExtents: { x: 0.06, y: 0.003, z: storageWidth / 2 } },
    { position: { x: 0.058, y: 0.012, z: 0 }, halfExtents: { x: 0.003, y: 0.012, z: storageWidth / 2 } },
    { position: { x: 0, y: 0.012, z: storageWidth / 2 }, halfExtents: { x: 0.06, y: 0.012, z: 0.003 } },
    { position: { x: 0, y: 0.012, z: -storageWidth / 2 }, halfExtents: { x: 0.06, y: 0.012, z: 0.003 } },
    { position: { x: -0.058, y: 0.004, z: 0 }, halfExtents: { x: 0.003, y: 0.004, z: storageWidth / 2 } },
  ];
}

function anglesAtCoordinateExtrema(minimum: number, maximum: number, a: number, b: number): number[] {
  const low = Math.min(minimum, maximum);
  const high = Math.max(minimum, maximum);
  if (![low, high, a, b].every(Number.isFinite)) return [];
  const angles = [low, high];
  const base = Math.atan2(b, a);
  const firstK = Math.ceil((low - base) / Math.PI);
  let lastK = Math.floor((high - base) / Math.PI);
  // For enormous but finite servo ranges, one period contains both extrema.
  if (lastK - firstK > 4) lastK = firstK + 1;
  for (let k = firstK; k <= lastK; k++) angles.push(base + k * Math.PI);
  return angles;
}

/** Include the actual plate, three tray rims, and rear retaining lip over rail travel and tray rotation. */
function includeLiftCarriageBounds(
  bounds: FootprintBounds,
  configuration: WorldRobotConfiguration,
  storageWidth: number,
  releaseAngles: readonly [number, number],
  travel: readonly [number, number],
): void {
  const lift = configuration.mechanisms?.lift;
  if (!lift) return;
  const axis = getLiftAxis(lift);
  if (![lift.mount.x, lift.mount.y, lift.mount.z, lift.maximumTravel, axis.x, axis.y, axis.z, ...releaseAngles, ...travel].every(Number.isFinite)) return;
  for (const part of liftCarriageBoxes(storageWidth)) {
    for (const xSign of [-1, 1]) for (const ySign of [-1, 1]) for (const zSign of [-1, 1]) {
      const localX = part.position.x + xSign * part.halfExtents.x;
      const localY = part.position.y + ySign * part.halfExtents.y;
      const localZ = part.position.z + zSign * part.halfExtents.z;
      const xAngles = anglesAtCoordinateExtrema(releaseAngles[0], releaseAngles[1], localX, localY);
      const yAngles = anglesAtCoordinateExtrema(releaseAngles[0], releaseAngles[1], localY, -localX);
      const angles = [...new Set([...xAngles, ...yAngles])];
      for (const angle of angles) {
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const rotated = { x: localX * cosine + localY * sine, y: localY * cosine - localX * sine };
        for (const distance of travel) {
          const carriagePosition = robotLiftPosition(configuration, distance * axis.y);
          includeComponentBounds(
            bounds,
            carriagePosition.x + rotated.x,
            carriagePosition.y + rotated.y,
            carriagePosition.z + localZ,
          );
        }
      }
    }
  }
}

function checkLiftAxis(lift: LiftConfiguration, errors: string[]): void {
  const candidate = lift.axis;
  if (candidate === undefined) return; // Saved configurations without an axis keep their historical vertical rail.
  if (!candidate || typeof candidate !== "object"
      || ![candidate.x, candidate.y, candidate.z].every(Number.isFinite)) {
    errors.push("Lift axis must be a finite upward unit vector.");
    return;
  }
  const magnitude = Math.hypot(candidate.x, candidate.y, candidate.z);
  if (Math.abs(magnitude - 1) > 1e-6) errors.push("Lift axis must be a unit vector (length 1).");
  if (candidate.y <= 0) errors.push("Lift axis must point upward (positive Y).");
}

function checkExpandedGeometry(configuration: WorldRobotConfiguration, errors: string[]): void {
  const chassis = configuration.chassis;
  const groundY = configuration.wheels.length
    ? Math.min(...configuration.wheels.map((wheel) => wheel.mount.y - wheel.radius))
    : -chassis.size.y / 2;
  const bounds: FootprintBounds = {
    minimumX: -chassis.size.x / 2,
    maximumX: chassis.size.x / 2,
    minimumZ: -chassis.size.z / 2,
    maximumZ: chassis.size.z / 2,
    minimumY: Math.min(-chassis.size.y / 2, groundY),
    maximumY: chassis.size.y / 2,
  };

  for (const wheel of configuration.wheels) {
    if (wheel.width !== undefined && wheel.axle) {
      const extent = (axis: number) => wheel.radius * Math.sqrt(Math.max(0, 1 - axis * axis)) + wheel.width! / 2 * Math.abs(axis);
      includeComponentBounds(bounds, wheel.mount.x, wheel.mount.y, wheel.mount.z, extent(wheel.axle.x), extent(wheel.axle.y), extent(wheel.axle.z));
    } else includeComponentBounds(bounds, wheel.mount.x, wheel.mount.y, wheel.mount.z, wheel.radius, wheel.radius, wheel.radius);
  }
  for (const servo of configuration.servos) {
    includeComponentBounds(bounds, servo.mount.x, servo.mount.y, servo.mount.z);
  }
  for (const sensor of configuration.sensors) {
    includeComponentBounds(bounds, sensor.mount.position.x, sensor.mount.position.y, sensor.mount.position.z);
  }
  for (const camera of configuration.cameras) {
    includeComponentBounds(bounds, camera.mount.position.x, camera.mount.position.y, camera.mount.position.z);
  }

  const mechanisms = configuration.mechanisms;
  let canBuildFixedGeometry = true;
  let liftTravelBounds: { lift: LiftConfiguration; storageWidth: number; releaseAngles: readonly [number, number] } | null = null;
  if (mechanisms) {
    const { intake, storage, shooter, lift } = mechanisms;
    const releaseServo = configuration.servos.find((servo) => servo.name === lift.releaseServo);
    const stowedAngle = releaseServo?.minRadians ?? 0;
    const releaseAngles: readonly [number, number] = [stowedAngle, releaseServo?.maxRadians ?? stowedAngle];
    const channelExtent = Math.abs(storage.mount.z) + storage.width / 2;
    if (Number.isFinite(channelExtent) && Number.isFinite(chassis.size.z) && !(channelExtent < chassis.size.z / 2)) {
      errors.push("The storage channel must leave positive width for both manufactured side rails inside the chassis.");
      canBuildFixedGeometry = false;
    }
    includeComponentBounds(bounds, intake.mount.x, intake.mount.y, intake.mount.z, intake.radius, intake.radius, intake.width / 2);

    includeComponentBounds(bounds, storage.mount.x, storage.mount.y, storage.mount.z, storage.length / 2, 0, storage.width / 2);
    includeComponentBounds(bounds, shooter.mount.x, shooter.mount.y, shooter.mount.z, shooter.wheelRadius, shooter.wheelRadius, shooter.wheelRadius);

    // Start fit uses the stowed pose; expanded fit includes the complete rail stroke
    // and every tray angle the release servo can reach. Payload is not robot geometry.
    includeLiftCarriageBounds(bounds, configuration, storage.width, [stowedAngle, stowedAngle], [0, 0]);
    liftTravelBounds = { lift, storageWidth: storage.width, releaseAngles };
    canBuildFixedGeometry = canBuildFixedGeometry && configuration.servos.some((servo) => servo.name === mechanisms.gate.servo);
  }
  if (canBuildFixedGeometry) {
    for (const part of robotFixedGeometry(configuration)) includeFixedBoxCorners(bounds, part);
  }
  const expandedBounds = { ...bounds };
  if (liftTravelBounds) {
    includeLiftCarriageBounds(expandedBounds, configuration, liftTravelBounds.storageWidth,
      liftTravelBounds.releaseAngles, [0, liftTravelBounds.lift.maximumTravel]);
  }

  const startingDimensions = [
    bounds.maximumX - bounds.minimumX,
    bounds.maximumY - bounds.minimumY,
    bounds.maximumZ - bounds.minimumZ,
  ];
  if (startingDimensions.some((dimension) => dimension > STARTING_DIMENSION_METERS)) {
    errors.push("The chassis, fixed hardware, and stowed mechanisms must fit the 18-inch starting envelope.");
  }

  const dimensions = [expandedBounds.maximumX - expandedBounds.minimumX, expandedBounds.maximumZ - expandedBounds.minimumZ]
    .sort((left, right) => right - left);
  if (dimensions[0]! > EXPANDED_LONG_DIMENSION_METERS || dimensions[1]! > EXPANDED_SHORT_DIMENSION_METERS) {
    errors.push("The configured chassis and mechanism footprint exceeds the 18 × 24 inch expanded envelope.");
  }
  if (expandedBounds.maximumY - groundY > MAX_ROBOT_HEIGHT_METERS) {
    errors.push("Configured robot and mechanism geometry exceeds 29 inches above the wheel-ground reference.");
  }
}

export function validateWorldRobotConfiguration(configuration: WorldRobotConfiguration): string[] {
  const errors: string[] = [];
  addFiniteNumberErrors(configuration, "robot", errors);

  if (configuration.motors.length > 8) errors.push("A robot may use at most eight DC motors.");
  if (configuration.servos.length > 8) errors.push("A robot may use at most eight servos.");

  const { chassis, battery } = configuration;
  checkPositive(chassis.size.x, "Chassis width", errors);
  checkPositive(chassis.size.z, "Chassis length", errors);
  checkPositive(chassis.size.y, "Chassis height", errors);
  if ([chassis.size.x, chassis.size.y, chassis.size.z].some((dimension) => Number.isFinite(dimension) && dimension > STARTING_DIMENSION_METERS)) {
    errors.push("The chassis must fit the 18-inch starting envelope in all three dimensions.");
  }
  checkPositive(chassis.massKg, "Robot mass", errors);
  checkPositive(battery.openCircuitVoltage, "Battery open-circuit voltage", errors);
  checkNonNegative(battery.internalResistanceOhms, "Battery internal resistance", errors);
  checkPositive(battery.maximumCurrentAmps, "Battery current limit", errors);

  const hardwareNames = new Set<string>();
  const addHardwareName = (name: string, kind: string): void => {
    if (typeof name !== "string" || !name.trim() || name.trim() !== name) {
      errors.push(`${kind} HardwareMap name must be non-empty and have no surrounding whitespace.`);
    }
    if (hardwareNames.has(name)) errors.push(`HardwareMap name “${name}” is duplicated.`);
    hardwareNames.add(name);
  };
  for (const motor of configuration.motors) addHardwareName(motor.name, "Motor");
  for (const servo of configuration.servos) addHardwareName(servo.name, "Servo");
  for (const sensor of configuration.sensors) addHardwareName(sensor.name, "Sensor");
  for (const camera of configuration.cameras) addHardwareName(camera.name, "Camera");

  const motorNames = new Set(configuration.motors.map((motor) => motor.name));
  const servoNames = new Set(configuration.servos.map((servo) => servo.name));
  for (const motor of configuration.motors) {
    checkPositive(motor.profile.nominalVoltage, `${motor.name} nominal voltage`, errors);
    checkPositive(motor.profile.freeSpeedRpm, `${motor.name} free speed`, errors);
    checkPositive(motor.profile.stallTorqueNm, `${motor.name} stall torque`, errors);
    checkPositive(motor.profile.stallCurrentAmps, `${motor.name} stall current`, errors);
    checkNonNegative(motor.profile.freeCurrentAmps, `${motor.name} free current`, errors);
    checkPositive(motor.profile.ticksPerRevolution, `${motor.name} encoder resolution`, errors);
    checkPositive(motor.profile.rotorInertiaKgM2, `${motor.name} rotor inertia`, errors);
    checkPositive(motor.reduction, `${motor.name} external gearing`, errors);
    checkRange(motor.efficiency, [0, 1], `${motor.name} gearing efficiency`, errors);
  }

  for (const wheel of configuration.wheels) {
    if (!motorNames.has(wheel.motor)) errors.push(`Wheel is connected to missing motor “${wheel.motor}”.`);
    checkPositive(wheel.radius, `${wheel.motor} wheel radius`, errors);
    if (wheel.driveProjection !== undefined) checkRange(wheel.driveProjection, [0, 1], `${wheel.motor} drive projection`, errors);
    checkNonNegative(wheel.grip, `${wheel.motor} wheel grip`, errors);
    checkNonNegative(wheel.rollerGrip, `${wheel.motor} roller grip`, errors);
    checkNonNegative(wheel.inertiaKgM2, `${wheel.motor} wheel inertia`, errors);
    checkNonNegative(wheel.suspensionTravel, `${wheel.motor} suspension travel`, errors);
    checkNonNegative(wheel.springNPerM, `${wheel.motor} suspension stiffness`, errors);
    checkNonNegative(wheel.damperNsPerM, `${wheel.motor} suspension damping`, errors);
    if (wheel.width !== undefined) checkPositive(wheel.width, `${wheel.motor} wheel width`, errors);
    if (wheel.axle && Math.abs(Math.hypot(wheel.axle.x, wheel.axle.y, wheel.axle.z) - 1) > 1e-6) errors.push(`${wheel.motor} wheel axle must be a unit vector.`);
  }

  for (const servo of configuration.servos) {
    if (Number.isFinite(servo.minRadians) && Number.isFinite(servo.maxRadians) && servo.minRadians >= servo.maxRadians) {
      errors.push(`${servo.name} minimum travel must be less than maximum travel.`);
    }
    checkPositive(servo.speedRadiansPerSecond, `${servo.name} travel speed`, errors);
    checkPositive(servo.torqueNm, `${servo.name} torque`, errors);
    checkNonNegative(servo.inertiaKgM2, `${servo.name} inertia`, errors);
  }

  for (const sensor of configuration.sensors) {
    checkTransform(sensor.mount, `Sensor ${sensor.name}`, errors);
    checkNonNegative(sensor.maximumRange, `${sensor.name} range`, errors);
    checkNonNegative(sensor.noise, `${sensor.name} noise`, errors);
    checkNonNegative(sensor.latencyMs, `${sensor.name} latency`, errors);
  }

  for (const camera of configuration.cameras) {
    checkTransform(camera.mount, `Camera ${camera.name}`, errors);
    checkPositive(camera.horizontalFovRadians, `${camera.name} horizontal field of view`, errors);
    checkRange(camera.horizontalFovRadians, [0, Math.PI * 2], `${camera.name} horizontal field of view`, errors);
    checkPositive(camera.verticalFovRadians, `${camera.name} vertical field of view`, errors);
    checkRange(camera.verticalFovRadians, [0, Math.PI], `${camera.name} vertical field of view`, errors);
    checkNonNegative(camera.maximumRange, `${camera.name} range`, errors);
    checkNonNegative(camera.latencyMs, `${camera.name} latency`, errors);
    checkPositive(camera.framesPerSecond, `${camera.name} frame rate`, errors);
    checkNonNegative(camera.positionNoiseMeters, `${camera.name} position noise`, errors);
    checkNonNegative(camera.angleNoiseRadians, `${camera.name} angle noise`, errors);
  }

  const mechanisms = configuration.mechanisms;
  if (mechanisms) {
    checkMechanismReferences(mechanisms, motorNames, servoNames, errors);
    checkPositive(mechanisms.intake.width, "Intake width", errors);
    checkPositive(mechanisms.intake.radius, "Intake roller radius", errors);
    checkNonNegative(mechanisms.intake.complianceNPerM, "Intake compliance", errors);
    checkNonNegative(mechanisms.feeder.speedMetersPerSecond, "Feeder speed", errors);
    checkNonNegative(mechanisms.feeder.grip, "Feeder grip", errors);
    if (mechanisms.feeder.reduction !== undefined) checkPositive(mechanisms.feeder.reduction, "Feeder reduction", errors);
    checkPositive(mechanisms.storage.width, "Storage width", errors);
    checkPositive(mechanisms.storage.length, "Storage length", errors);
    checkPositive(mechanisms.storage.capacity, "Storage capacity", errors);
    if (Number.isFinite(mechanisms.storage.capacity) && !Number.isInteger(mechanisms.storage.capacity)) {
      errors.push("Storage capacity must be a whole number of game elements.");
    }
    checkPositive(mechanisms.shooter.wheelRadius, "Shooter wheel radius", errors);
    checkPositive(mechanisms.shooter.inertiaKgM2, "Shooter inertia", errors);
    if (mechanisms.shooter.turretInertiaKgM2 !== undefined) checkPositive(mechanisms.shooter.turretInertiaKgM2, "Turret inertia", errors);
    checkNonNegative(mechanisms.shooter.compression, "Shooter compression", errors);
    if (Number.isFinite(mechanisms.shooter.wheelRadius) && Number.isFinite(mechanisms.shooter.compression) && mechanisms.shooter.compression >= mechanisms.shooter.wheelRadius) {
      errors.push("Shooter compression must be less than its wheel radius to keep the effective radius positive.");
    }
    checkPositive(mechanisms.lift.spoolRadius, "Lift spool radius", errors);
    checkNonNegative(mechanisms.lift.maximumTravel, "Lift maximum travel", errors);
    checkPositive(mechanisms.lift.carriageMassKg, "Lift carriage mass", errors);
    checkLiftAxis(mechanisms.lift, errors);
    checkRange(mechanisms.gate.rejectionThreshold, [0, 1], "Sorting gate threshold", errors);
  }

  checkExpandedGeometry(configuration, errors);
  return [...new Set(errors)];
}
