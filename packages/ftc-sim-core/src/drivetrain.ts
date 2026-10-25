import { DeterministicClock } from "./clock.js";
import { DcMotor } from "./motor.js";

export interface Pose2D {
  /** World X in metres. Local X is robot-forward. */
  xMeters: number;
  /** World Y in metres. Local Y is robot-left. */
  yMeters: number;
  /** Counter-clockwise world heading in radians. */
  headingRadians: number;
}

export interface ChassisVelocity {
  /** Robot-forward velocity in metres per second. */
  xMetersPerSecond: number;
  /** Robot-left velocity in metres per second. */
  yMetersPerSecond: number;
  /** Counter-clockwise angular velocity in radians per second. */
  angularRadiansPerSecond: number;
}

export interface FourWheelAngularVelocities {
  frontLeft: number;
  frontRight: number;
  backLeft: number;
  backRight: number;
}

export interface HDriveWheelAngularVelocities extends FourWheelAngularVelocities {
  center: number;
}

export type MotorGroup = DcMotor | readonly DcMotor[];

export interface DriveBaseConfig {
  wheelRadiusMeters: number;
  /** @deprecated Each configured motor now supplies its own encoder scale. */
  ticksPerRevolution?: number;
  initialPose?: Partial<Pose2D>;
}

export interface TankDriveConfig extends DriveBaseConfig {
  left: MotorGroup;
  right: MotorGroup;
  trackWidthMeters: number;
}

export interface MecanumDriveConfig extends DriveBaseConfig {
  frontLeft: DcMotor;
  frontRight: DcMotor;
  backLeft: DcMotor;
  backRight: DcMotor;
  wheelBaseMeters: number;
  trackWidthMeters: number;
}

export interface HDriveConfig extends DriveBaseConfig {
  left: MotorGroup;
  right: MotorGroup;
  center: MotorGroup;
  trackWidthMeters: number;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero`);
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asGroup(group: MotorGroup, label: string): readonly DcMotor[] {
  const motors = Array.isArray(group) ? group : [group];
  if (motors.length === 0) throw new Error(`${label} must contain at least one motor`);
  return motors;
}

/** Converts encoder tick velocity to wheel-ground speed in metres per second. */
export function ticksPerSecondToMetersPerSecond(
  ticksPerSecond: number,
  wheelRadiusMeters: number,
  ticksPerRevolution: number,
): number {
  return (ticksPerSecond / ticksPerRevolution) * 2 * Math.PI * wheelRadiusMeters;
}

/** Converts a wheel-ground speed to encoder tick velocity. */
export function metersPerSecondToTicksPerSecond(
  metersPerSecond: number,
  wheelRadiusMeters: number,
  ticksPerRevolution: number,
): number {
  return (metersPerSecond / (2 * Math.PI * wheelRadiusMeters)) * ticksPerRevolution;
}

abstract class DriveBase {
  readonly pose: Pose2D;
  protected readonly wheelRadiusMeters: number;
  private readonly legacyTicksPerRevolution: number | undefined;
  private readonly unsubscribeClock: () => void;

  protected constructor(clock: DeterministicClock, config: DriveBaseConfig) {
    this.wheelRadiusMeters = positive(config.wheelRadiusMeters, "wheelRadiusMeters");
    this.legacyTicksPerRevolution = config.ticksPerRevolution === undefined
      ? undefined
      : positive(config.ticksPerRevolution, "ticksPerRevolution");
    this.pose = {
      xMeters: config.initialPose?.xMeters ?? 0,
      yMeters: config.initialPose?.yMeters ?? 0,
      headingRadians: config.initialPose?.headingRadians ?? 0,
    };
    this.unsubscribeClock = clock.onTick((deltaSeconds) => this.integrate(deltaSeconds));
  }

  getChassisVelocity(): ChassisVelocity {
    return this.forwardKinematics();
  }

  setPose(pose: Partial<Pose2D>): void {
    if (pose.xMeters !== undefined) this.pose.xMeters = pose.xMeters;
    if (pose.yMeters !== undefined) this.pose.yMeters = pose.yMeters;
    if (pose.headingRadians !== undefined) this.pose.headingRadians = pose.headingRadians;
  }

  close(): void {
    this.unsubscribeClock();
  }

  protected abstract forwardKinematics(): ChassisVelocity;

  protected wheelMetersPerSecond(motor: DcMotor): number {
    return ticksPerSecondToMetersPerSecond(
      motor.getPhysicalVelocityTicksPerSecond(),
      this.wheelRadiusMeters,
      this.legacyTicksPerRevolution ?? motor.getTicksPerRevolution(),
    );
  }

  protected groupMetersPerSecond(motors: readonly DcMotor[]): number {
    return motors.reduce((sum, motor) => sum + this.wheelMetersPerSecond(motor), 0) / motors.length;
  }

  protected wheelRadiansPerSecond(motor: DcMotor): number {
    return this.wheelMetersPerSecond(motor) / this.wheelRadiusMeters;
  }

  protected groupRadiansPerSecond(motors: readonly DcMotor[]): number {
    return this.groupMetersPerSecond(motors) / this.wheelRadiusMeters;
  }

  protected setGroupMetersPerSecond(motors: readonly DcMotor[], metersPerSecond: number): void {
    for (const motor of motors) {
      const targetTicks = metersPerSecondToTicksPerSecond(
        metersPerSecond,
        this.wheelRadiusMeters,
        this.legacyTicksPerRevolution ?? motor.getTicksPerRevolution(),
      );
      motor.setPower(clamp(targetTicks / motor.getMaxTicksPerSecond(), -1, 1));
    }
  }

  private integrate(deltaSeconds: number): void {
    const velocity = this.forwardKinematics();
    const midpointHeading = this.pose.headingRadians + (velocity.angularRadiansPerSecond * deltaSeconds) / 2;
    const cosine = Math.cos(midpointHeading);
    const sine = Math.sin(midpointHeading);
    this.pose.xMeters += (velocity.xMetersPerSecond * cosine - velocity.yMetersPerSecond * sine) * deltaSeconds;
    this.pose.yMeters += (velocity.xMetersPerSecond * sine + velocity.yMetersPerSecond * cosine) * deltaSeconds;
    this.pose.headingRadians += velocity.angularRadiansPerSecond * deltaSeconds;
  }
}

/** Differential/tank-drive forward and inverse kinematics. */
export class TankDrive extends DriveBase {
  readonly left: readonly DcMotor[];
  readonly right: readonly DcMotor[];
  readonly trackWidthMeters: number;

  constructor(clock: DeterministicClock, config: TankDriveConfig) {
    super(clock, config);
    this.left = asGroup(config.left, "left");
    this.right = asGroup(config.right, "right");
    this.trackWidthMeters = positive(config.trackWidthMeters, "trackWidthMeters");
  }

  setChassisVelocity(xMetersPerSecond: number, angularRadiansPerSecond: number): void {
    const halfTrack = this.trackWidthMeters / 2;
    this.setGroupMetersPerSecond(this.left, xMetersPerSecond - angularRadiansPerSecond * halfTrack);
    this.setGroupMetersPerSecond(this.right, xMetersPerSecond + angularRadiansPerSecond * halfTrack);
  }

  getWheelAngularVelocities(): FourWheelAngularVelocities {
    const left = this.groupRadiansPerSecond(this.left);
    const right = this.groupRadiansPerSecond(this.right);
    return { frontLeft: left, frontRight: right, backLeft: left, backRight: right };
  }

  protected override forwardKinematics(): ChassisVelocity {
    const left = this.groupMetersPerSecond(this.left);
    const right = this.groupMetersPerSecond(this.right);
    return {
      xMetersPerSecond: (left + right) / 2,
      yMetersPerSecond: 0,
      angularRadiansPerSecond: (right - left) / this.trackWidthMeters,
    };
  }
}

/** Ideal mecanum-drive kinematics using the common FL/FR/BL/BR motor layout. */
export class MecanumDrive extends DriveBase {
  readonly frontLeft: DcMotor;
  readonly frontRight: DcMotor;
  readonly backLeft: DcMotor;
  readonly backRight: DcMotor;
  readonly wheelBaseMeters: number;
  readonly trackWidthMeters: number;

  constructor(clock: DeterministicClock, config: MecanumDriveConfig) {
    super(clock, config);
    this.frontLeft = config.frontLeft;
    this.frontRight = config.frontRight;
    this.backLeft = config.backLeft;
    this.backRight = config.backRight;
    this.wheelBaseMeters = positive(config.wheelBaseMeters, "wheelBaseMeters");
    this.trackWidthMeters = positive(config.trackWidthMeters, "trackWidthMeters");
  }

  setChassisVelocity(
    xMetersPerSecond: number,
    yMetersPerSecond: number,
    angularRadiansPerSecond: number,
  ): void {
    const radius = (this.wheelBaseMeters + this.trackWidthMeters) / 2;
    this.setWheelMetersPerSecond(this.frontLeft, xMetersPerSecond - yMetersPerSecond - radius * angularRadiansPerSecond);
    this.setWheelMetersPerSecond(this.frontRight, xMetersPerSecond + yMetersPerSecond + radius * angularRadiansPerSecond);
    this.setWheelMetersPerSecond(this.backLeft, xMetersPerSecond + yMetersPerSecond - radius * angularRadiansPerSecond);
    this.setWheelMetersPerSecond(this.backRight, xMetersPerSecond - yMetersPerSecond + radius * angularRadiansPerSecond);
  }

  getWheelAngularVelocities(): FourWheelAngularVelocities {
    return {
      frontLeft: this.wheelRadiansPerSecond(this.frontLeft),
      frontRight: this.wheelRadiansPerSecond(this.frontRight),
      backLeft: this.wheelRadiansPerSecond(this.backLeft),
      backRight: this.wheelRadiansPerSecond(this.backRight),
    };
  }

  protected override forwardKinematics(): ChassisVelocity {
    const frontLeft = this.wheelMetersPerSecond(this.frontLeft);
    const frontRight = this.wheelMetersPerSecond(this.frontRight);
    const backLeft = this.wheelMetersPerSecond(this.backLeft);
    const backRight = this.wheelMetersPerSecond(this.backRight);
    const radius = (this.wheelBaseMeters + this.trackWidthMeters) / 2;

    return {
      xMetersPerSecond: (frontLeft + frontRight + backLeft + backRight) / 4,
      yMetersPerSecond: (-frontLeft + frontRight + backLeft - backRight) / 4,
      angularRadiansPerSecond: (-frontLeft + frontRight - backLeft + backRight) / (4 * radius),
    };
  }

  protected setWheelMetersPerSecond(motor: DcMotor, metersPerSecond: number): void {
    this.setGroupMetersPerSecond([motor], metersPerSecond);
  }
}

/**
 * Ideal X-drive kinematics. With 45-degree omni-wheel mounting the FL/FR/BL/BR transform is the
 * same as ideal mecanum; the distinction belongs to the physical wheel model and visualization.
 */
export class XDrive extends MecanumDrive {}

/** H-drive: left/right tank wheels plus a perpendicular centre strafe wheel/group. */
export class HDrive extends DriveBase {
  readonly left: readonly DcMotor[];
  readonly right: readonly DcMotor[];
  readonly center: readonly DcMotor[];
  readonly trackWidthMeters: number;

  constructor(clock: DeterministicClock, config: HDriveConfig) {
    super(clock, config);
    this.left = asGroup(config.left, "left");
    this.right = asGroup(config.right, "right");
    this.center = asGroup(config.center, "center");
    this.trackWidthMeters = positive(config.trackWidthMeters, "trackWidthMeters");
  }

  setChassisVelocity(
    xMetersPerSecond: number,
    yMetersPerSecond: number,
    angularRadiansPerSecond: number,
  ): void {
    const halfTrack = this.trackWidthMeters / 2;
    this.setGroupMetersPerSecond(this.left, xMetersPerSecond - angularRadiansPerSecond * halfTrack);
    this.setGroupMetersPerSecond(this.right, xMetersPerSecond + angularRadiansPerSecond * halfTrack);
    this.setGroupMetersPerSecond(this.center, yMetersPerSecond);
  }

  getWheelAngularVelocities(): HDriveWheelAngularVelocities {
    const left = this.groupRadiansPerSecond(this.left);
    const right = this.groupRadiansPerSecond(this.right);
    return {
      frontLeft: left,
      frontRight: right,
      backLeft: left,
      backRight: right,
      center: this.groupRadiansPerSecond(this.center),
    };
  }

  protected override forwardKinematics(): ChassisVelocity {
    const left = this.groupMetersPerSecond(this.left);
    const right = this.groupMetersPerSecond(this.right);
    return {
      xMetersPerSecond: (left + right) / 2,
      yMetersPerSecond: this.groupMetersPerSecond(this.center),
      angularRadiansPerSecond: (right - left) / this.trackWidthMeters,
    };
  }
}
