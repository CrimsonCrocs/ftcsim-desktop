import type { ChassisVelocity } from "./drivetrain.js";

export interface DriveIdleBrakeProfile {
  /** Fraction of driven longitudinal wheels in BRAKE, from 0 (coast) through 1 (full brake). */
  forward: number;
  /** Fraction of wheels producing lateral braking; H-drive uses its center wheel here. */
  lateral: number;
  /** Fraction of the yaw-producing wheel set in BRAKE. */
  angular: number;
}

export type DriveIdleBehavior = "brake" | "coast" | DriveIdleBrakeProfile;

export interface ChassisAcceleration {
  xMetersPerSecondSquared: number;
  yMetersPerSecondSquared: number;
  angularRadiansPerSecondSquared: number;
}

export interface PlanarDriveDynamicsConfig {
  massKg?: number;
  yawMomentOfInertiaKgMetersSquared?: number;
  maxLinearAccelerationMetersPerSecondSquared?: number;
  maxLinearBrakeDecelerationMetersPerSecondSquared?: number;
  /** Legacy isotropic coast setting. New forward/lateral settings take precedence. */
  coastDecelerationMetersPerSecondSquared?: number;
  coastForwardDecelerationMetersPerSecondSquared?: number;
  coastLateralDecelerationMetersPerSecondSquared?: number;
  maxLinearJerkMetersPerSecondCubed?: number;
  /** Faster response used when drive power is released, independently of powered jerk. */
  maxLinearBrakeJerkMetersPerSecondCubed?: number;
  maxAngularAccelerationRadiansPerSecondSquared?: number;
  maxAngularBrakeDecelerationRadiansPerSecondSquared?: number;
  coastAngularDecelerationRadiansPerSecondSquared?: number;
  maxAngularJerkRadiansPerSecondCubed?: number;
  maxAngularBrakeJerkRadiansPerSecondCubed?: number;
  velocityGainPerSecond?: number;
  angularVelocityGainPerSecond?: number;
  /** Coulomb traction cap: |F| <= coefficient * mass * gravity. */
  tractionCoefficient?: number;
  gravityMetersPerSecondSquared?: number;
  /** Effective contact-patch radius used to convert the tire-force budget into yaw torque. */
  tractionYawRadiusMeters?: number;
  /** Total planar drive force available before the tire-traction cap. */
  maxDriveForceNewtons?: number;
  /** Total planar braking force available before the tire-traction cap. */
  maxBrakeForceNewtons?: number;
}

export interface ResolvedPlanarDriveDynamicsConfig {
  massKg: number;
  yawMomentOfInertiaKgMetersSquared: number;
  maxLinearAccelerationMetersPerSecondSquared: number;
  maxLinearBrakeDecelerationMetersPerSecondSquared: number;
  coastDecelerationMetersPerSecondSquared: number;
  coastForwardDecelerationMetersPerSecondSquared: number;
  coastLateralDecelerationMetersPerSecondSquared: number;
  maxLinearJerkMetersPerSecondCubed: number;
  maxLinearBrakeJerkMetersPerSecondCubed: number;
  maxAngularAccelerationRadiansPerSecondSquared: number;
  maxAngularBrakeDecelerationRadiansPerSecondSquared: number;
  coastAngularDecelerationRadiansPerSecondSquared: number;
  maxAngularJerkRadiansPerSecondCubed: number;
  maxAngularBrakeJerkRadiansPerSecondCubed: number;
  velocityGainPerSecond: number;
  angularVelocityGainPerSecond: number;
  tractionCoefficient: number;
  gravityMetersPerSecondSquared: number;
  tractionYawRadiusMeters: number;
  maxDriveForceNewtons: number;
  maxBrakeForceNewtons: number;
}

export interface PlanarDriveDynamicsInput {
  /** Desired velocity in the robot-local forward/left/yaw frame. */
  targetVelocity: ChassisVelocity;
  /** Measured rigid-body velocity in the same robot-local frame. */
  currentVelocity: ChassisVelocity;
  deltaSeconds: number;
  idleBehavior?: DriveIdleBehavior;
}

export interface PlanarDriveDynamicsOutput {
  /** Robot-local traction force. The outer physics engine rotates it into world space. */
  force: {
    xNewtons: number;
    yNewtons: number;
  };
  /** Yaw torque about the robot's vertical axis. */
  torqueNewtonMeters: number;
  acceleration: ChassisAcceleration;
}

export const DEFAULT_PLANAR_DRIVE_DYNAMICS_CONFIG: Readonly<ResolvedPlanarDriveDynamicsConfig> = {
  massKg: 15,
  yawMomentOfInertiaKgMetersSquared: 0.5,
  maxLinearAccelerationMetersPerSecondSquared: 4.5,
  maxLinearBrakeDecelerationMetersPerSecondSquared: 6,
  coastDecelerationMetersPerSecondSquared: 0.4,
  coastForwardDecelerationMetersPerSecondSquared: 0.4,
  coastLateralDecelerationMetersPerSecondSquared: 0.4,
  maxLinearJerkMetersPerSecondCubed: 18,
  maxLinearBrakeJerkMetersPerSecondCubed: 180,
  maxAngularAccelerationRadiansPerSecondSquared: 12,
  maxAngularBrakeDecelerationRadiansPerSecondSquared: 16,
  coastAngularDecelerationRadiansPerSecondSquared: 1.2,
  maxAngularJerkRadiansPerSecondCubed: 48,
  maxAngularBrakeJerkRadiansPerSecondCubed: 240,
  velocityGainPerSecond: 8,
  angularVelocityGainPerSecond: 9,
  tractionCoefficient: 1,
  gravityMetersPerSecondSquared: 9.81,
  tractionYawRadiusMeters: 0.3,
  maxDriveForceNewtons: 67.5,
  maxBrakeForceNewtons: 90,
};

const IDLE_EPSILON = 1e-6;

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero`);
  }
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function unitFraction(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be from zero through one`);
  }
  return value;
}

function resolveIdleBrakeProfile(behavior: DriveIdleBehavior): DriveIdleBrakeProfile {
  if (behavior === "brake") return { forward: 1, lateral: 1, angular: 1 };
  if (behavior === "coast") return { forward: 0, lateral: 0, angular: 0 };
  return {
    forward: unitFraction(behavior.forward, "idleBehavior.forward"),
    lateral: unitFraction(behavior.lateral, "idleBehavior.lateral"),
    angular: unitFraction(behavior.angular, "idleBehavior.angular"),
  };
}

function resolveConfig(config: PlanarDriveDynamicsConfig): ResolvedPlanarDriveDynamicsConfig {
  const defaults = DEFAULT_PLANAR_DRIVE_DYNAMICS_CONFIG;
  const legacyCoastDeceleration = config.coastDecelerationMetersPerSecondSquared;
  return {
    massKg: positive(config.massKg ?? defaults.massKg, "massKg"),
    yawMomentOfInertiaKgMetersSquared: positive(
      config.yawMomentOfInertiaKgMetersSquared ?? defaults.yawMomentOfInertiaKgMetersSquared,
      "yawMomentOfInertiaKgMetersSquared",
    ),
    maxLinearAccelerationMetersPerSecondSquared: positive(
      config.maxLinearAccelerationMetersPerSecondSquared ?? defaults.maxLinearAccelerationMetersPerSecondSquared,
      "maxLinearAccelerationMetersPerSecondSquared",
    ),
    maxLinearBrakeDecelerationMetersPerSecondSquared: positive(
      config.maxLinearBrakeDecelerationMetersPerSecondSquared ?? defaults.maxLinearBrakeDecelerationMetersPerSecondSquared,
      "maxLinearBrakeDecelerationMetersPerSecondSquared",
    ),
    coastDecelerationMetersPerSecondSquared: positive(
      legacyCoastDeceleration ?? defaults.coastDecelerationMetersPerSecondSquared,
      "coastDecelerationMetersPerSecondSquared",
    ),
    coastForwardDecelerationMetersPerSecondSquared: positive(
      config.coastForwardDecelerationMetersPerSecondSquared ??
        legacyCoastDeceleration ??
        defaults.coastForwardDecelerationMetersPerSecondSquared,
      "coastForwardDecelerationMetersPerSecondSquared",
    ),
    coastLateralDecelerationMetersPerSecondSquared: positive(
      config.coastLateralDecelerationMetersPerSecondSquared ??
        legacyCoastDeceleration ??
        defaults.coastLateralDecelerationMetersPerSecondSquared,
      "coastLateralDecelerationMetersPerSecondSquared",
    ),
    maxLinearJerkMetersPerSecondCubed: positive(
      config.maxLinearJerkMetersPerSecondCubed ?? defaults.maxLinearJerkMetersPerSecondCubed,
      "maxLinearJerkMetersPerSecondCubed",
    ),
    maxLinearBrakeJerkMetersPerSecondCubed: positive(
      config.maxLinearBrakeJerkMetersPerSecondCubed ?? defaults.maxLinearBrakeJerkMetersPerSecondCubed,
      "maxLinearBrakeJerkMetersPerSecondCubed",
    ),
    maxAngularAccelerationRadiansPerSecondSquared: positive(
      config.maxAngularAccelerationRadiansPerSecondSquared ?? defaults.maxAngularAccelerationRadiansPerSecondSquared,
      "maxAngularAccelerationRadiansPerSecondSquared",
    ),
    maxAngularBrakeDecelerationRadiansPerSecondSquared: positive(
      config.maxAngularBrakeDecelerationRadiansPerSecondSquared ?? defaults.maxAngularBrakeDecelerationRadiansPerSecondSquared,
      "maxAngularBrakeDecelerationRadiansPerSecondSquared",
    ),
    coastAngularDecelerationRadiansPerSecondSquared: positive(
      config.coastAngularDecelerationRadiansPerSecondSquared ?? defaults.coastAngularDecelerationRadiansPerSecondSquared,
      "coastAngularDecelerationRadiansPerSecondSquared",
    ),
    maxAngularJerkRadiansPerSecondCubed: positive(
      config.maxAngularJerkRadiansPerSecondCubed ?? defaults.maxAngularJerkRadiansPerSecondCubed,
      "maxAngularJerkRadiansPerSecondCubed",
    ),
    maxAngularBrakeJerkRadiansPerSecondCubed: positive(
      config.maxAngularBrakeJerkRadiansPerSecondCubed ?? defaults.maxAngularBrakeJerkRadiansPerSecondCubed,
      "maxAngularBrakeJerkRadiansPerSecondCubed",
    ),
    velocityGainPerSecond: positive(config.velocityGainPerSecond ?? defaults.velocityGainPerSecond, "velocityGainPerSecond"),
    angularVelocityGainPerSecond: positive(
      config.angularVelocityGainPerSecond ?? defaults.angularVelocityGainPerSecond,
      "angularVelocityGainPerSecond",
    ),
    tractionCoefficient: positive(
      config.tractionCoefficient ?? defaults.tractionCoefficient,
      "tractionCoefficient",
    ),
    gravityMetersPerSecondSquared: positive(
      config.gravityMetersPerSecondSquared ?? defaults.gravityMetersPerSecondSquared,
      "gravityMetersPerSecondSquared",
    ),
    tractionYawRadiusMeters: positive(
      config.tractionYawRadiusMeters ?? defaults.tractionYawRadiusMeters,
      "tractionYawRadiusMeters",
    ),
    maxDriveForceNewtons: positive(
      config.maxDriveForceNewtons ?? defaults.maxDriveForceNewtons,
      "maxDriveForceNewtons",
    ),
    maxBrakeForceNewtons: positive(
      config.maxBrakeForceNewtons ?? defaults.maxBrakeForceNewtons,
      "maxBrakeForceNewtons",
    ),
  };
}

function clampMagnitude(x: number, y: number, maximum: number): [number, number] {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= maximum || magnitude <= Number.EPSILON) return [x, y];
  const scale = maximum / magnitude;
  return [x * scale, y * scale];
}

function moveTowardVector(
  currentX: number,
  currentY: number,
  targetX: number,
  targetY: number,
  maximumDelta: number,
): [number, number] {
  const [deltaX, deltaY] = clampMagnitude(targetX - currentX, targetY - currentY, maximumDelta);
  return [currentX + deltaX, currentY + deltaY];
}

function moveToward(current: number, target: number, maximumDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maximumDelta) return target;
  return current + Math.sign(delta) * maximumDelta;
}

/**
 * Converts velocity error into a jerk-limited force/torque request. Rapier (or another rigid-body
 * engine) remains authoritative for gravity, contact, collision response, and the resulting pose.
 */
export class PlanarDriveDynamics {
  private readonly config: ResolvedPlanarDriveDynamicsConfig;
  private acceleration: ChassisAcceleration = {
    xMetersPerSecondSquared: 0,
    yMetersPerSecondSquared: 0,
    angularRadiansPerSecondSquared: 0,
  };

  constructor(config: PlanarDriveDynamicsConfig = {}) {
    this.config = resolveConfig(config);
  }

  getAcceleration(): Readonly<ChassisAcceleration> {
    return { ...this.acceleration };
  }

  reset(): void {
    this.acceleration = {
      xMetersPerSecondSquared: 0,
      yMetersPerSecondSquared: 0,
      angularRadiansPerSecondSquared: 0,
    };
  }

  step(input: PlanarDriveDynamicsInput): PlanarDriveDynamicsOutput {
    const deltaSeconds = positive(input.deltaSeconds, "deltaSeconds");
    const idleBrake = resolveIdleBrakeProfile(input.idleBehavior ?? "brake");
    const targetX = finite(input.targetVelocity.xMetersPerSecond, "targetVelocity.xMetersPerSecond");
    const targetY = finite(input.targetVelocity.yMetersPerSecond, "targetVelocity.yMetersPerSecond");
    const targetAngular = finite(
      input.targetVelocity.angularRadiansPerSecond,
      "targetVelocity.angularRadiansPerSecond",
    );
    const currentX = finite(input.currentVelocity.xMetersPerSecond, "currentVelocity.xMetersPerSecond");
    const currentY = finite(input.currentVelocity.yMetersPerSecond, "currentVelocity.yMetersPerSecond");
    const currentAngular = finite(
      input.currentVelocity.angularRadiansPerSecond,
      "currentVelocity.angularRadiansPerSecond",
    );

    const targetLinearMagnitude = Math.hypot(targetX, targetY);
    const targetIsIdle = targetLinearMagnitude <= IDLE_EPSILON;
    let desiredX: number;
    let desiredY: number;

    if (targetIsIdle) {
      const coastX =
        -Math.sign(currentX) *
        Math.min(this.config.coastForwardDecelerationMetersPerSecondSquared, Math.abs(currentX) / deltaSeconds);
      const coastY =
        -Math.sign(currentY) *
        Math.min(this.config.coastLateralDecelerationMetersPerSecondSquared, Math.abs(currentY) / deltaSeconds);
      const speed = Math.hypot(currentX, currentY);
      let brakeX: number;
      let brakeY: number;
      if (speed <= IDLE_EPSILON) {
        brakeX = 0;
        brakeY = 0;
      } else {
        const directionX = currentX / speed;
        const directionY = currentY / speed;
        const accelerationAlongMotion =
          this.acceleration.xMetersPerSecondSquared * directionX +
          this.acceleration.yMetersPerSecondSquared * directionY;
        const velocityConsumedWhileUnwinding =
          accelerationAlongMotion < 0
            ? (accelerationAlongMotion * accelerationAlongMotion) /
              (2 * this.config.maxLinearBrakeJerkMetersPerSecondCubed)
            : 0;
        const shouldUnwindAcceleration = speed <= velocityConsumedWhileUnwinding + IDLE_EPSILON;
        const brakingAcceleration = shouldUnwindAcceleration
          ? 0
          : Math.min(
              this.config.maxLinearBrakeDecelerationMetersPerSecondSquared,
              speed * this.config.velocityGainPerSecond,
            );
        brakeX = -directionX * brakingAcceleration;
        brakeY = -directionY * brakingAcceleration;
      }
      desiredX = coastX + (brakeX - coastX) * idleBrake.forward;
      desiredY = coastY + (brakeY - coastY) * idleBrake.lateral;
    } else {
      [desiredX, desiredY] = clampMagnitude(
        (targetX - currentX) * this.config.velocityGainPerSecond,
        (targetY - currentY) * this.config.velocityGainPerSecond,
        this.config.maxLinearAccelerationMetersPerSecondSquared,
      );
    }

    [this.acceleration.xMetersPerSecondSquared, this.acceleration.yMetersPerSecondSquared] = moveTowardVector(
      this.acceleration.xMetersPerSecondSquared,
      this.acceleration.yMetersPerSecondSquared,
      desiredX,
      desiredY,
      (targetIsIdle
        ? this.config.maxLinearBrakeJerkMetersPerSecondCubed
        : this.config.maxLinearJerkMetersPerSecondCubed) * deltaSeconds,
    );

    const forceLimitNewtons = targetIsIdle
      ? this.config.maxBrakeForceNewtons
      : this.config.maxDriveForceNewtons;
    const tractionLimitNewtons =
      this.config.tractionCoefficient * this.config.massKg * this.config.gravityMetersPerSecondSquared;
    const accelerationLimitFromForce =
      Math.min(forceLimitNewtons, tractionLimitNewtons) / this.config.massKg;
    [this.acceleration.xMetersPerSecondSquared, this.acceleration.yMetersPerSecondSquared] = clampMagnitude(
      this.acceleration.xMetersPerSecondSquared,
      this.acceleration.yMetersPerSecondSquared,
      accelerationLimitFromForce,
    );

    const angularIsIdle = Math.abs(targetAngular) <= IDLE_EPSILON;
    let desiredAngular: number;
    if (angularIsIdle) {
      const coastDeceleration = Math.min(
        this.config.coastAngularDecelerationRadiansPerSecondSquared,
        Math.abs(currentAngular) / deltaSeconds,
      );
      const coastAngular = -Math.sign(currentAngular) * coastDeceleration;
      const brakeAngular = Math.max(
        -this.config.maxAngularBrakeDecelerationRadiansPerSecondSquared,
        Math.min(
          this.config.maxAngularBrakeDecelerationRadiansPerSecondSquared,
          -currentAngular * this.config.angularVelocityGainPerSecond,
        ),
      );
      desiredAngular = coastAngular + (brakeAngular - coastAngular) * idleBrake.angular;
    } else {
      const limit = this.config.maxAngularAccelerationRadiansPerSecondSquared;
      desiredAngular = Math.max(
        -limit,
        Math.min(limit, (targetAngular - currentAngular) * this.config.angularVelocityGainPerSecond),
      );
    }
    this.acceleration.angularRadiansPerSecondSquared = moveToward(
      this.acceleration.angularRadiansPerSecondSquared,
      desiredAngular,
      (angularIsIdle
        ? this.config.maxAngularBrakeJerkRadiansPerSecondCubed
        : this.config.maxAngularJerkRadiansPerSecondCubed) * deltaSeconds,
    );

    let forceXNewtons = this.acceleration.xMetersPerSecondSquared * this.config.massKg;
    let forceYNewtons = this.acceleration.yMetersPerSecondSquared * this.config.massKg;
    let torqueNewtonMeters =
      this.acceleration.angularRadiansPerSecondSquared * this.config.yawMomentOfInertiaKgMetersSquared;

    // Translation and yaw draw from the same finite tire-force envelope. Normalizing torque by
    // an effective contact radius produces a dimensionless friction-circle budget and prevents a
    // robot from commanding full straight-line traction and full turning traction simultaneously.
    const yawTractionLimitNewtonMeters = tractionLimitNewtons * this.config.tractionYawRadiusMeters;
    const combinedTractionUsage = Math.hypot(
      Math.hypot(forceXNewtons, forceYNewtons) / tractionLimitNewtons,
      Math.abs(torqueNewtonMeters) / yawTractionLimitNewtonMeters,
    );
    if (combinedTractionUsage > 1) {
      const scale = 1 / combinedTractionUsage;
      forceXNewtons *= scale;
      forceYNewtons *= scale;
      torqueNewtonMeters *= scale;
      this.acceleration.xMetersPerSecondSquared = forceXNewtons / this.config.massKg;
      this.acceleration.yMetersPerSecondSquared = forceYNewtons / this.config.massKg;
      this.acceleration.angularRadiansPerSecondSquared =
        torqueNewtonMeters / this.config.yawMomentOfInertiaKgMetersSquared;
    }

    return {
      force: {
        xNewtons: forceXNewtons,
        yNewtons: forceYNewtons,
      },
      torqueNewtonMeters,
      acceleration: { ...this.acceleration },
    };
  }
}
