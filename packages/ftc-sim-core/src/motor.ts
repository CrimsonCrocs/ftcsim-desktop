import { DeterministicClock } from "./clock.js";
import { SimHardwareDevice } from "./device.js";

export enum Direction {
  FORWARD = "FORWARD",
  REVERSE = "REVERSE",
}

export enum RunMode {
  RUN_WITHOUT_ENCODER = "RUN_WITHOUT_ENCODER",
  RUN_USING_ENCODER = "RUN_USING_ENCODER",
  RUN_TO_POSITION = "RUN_TO_POSITION",
  STOP_AND_RESET_ENCODER = "STOP_AND_RESET_ENCODER",
}

export enum ZeroPowerBehavior {
  BRAKE = "BRAKE",
  FLOAT = "FLOAT",
}

export enum CurrentUnit {
  AMPS = "AMPS",
  MILLIAMPS = "MILLIAMPS",
}

export enum AngleUnit {
  RADIANS = "RADIANS",
  DEGREES = "DEGREES",
}

export interface PIDCoefficients {
  p: number;
  i: number;
  d: number;
}

export interface PIDFCoefficients extends PIDCoefficients {
  f: number;
}

export interface MotorConfig {
  /** Maximum no-load encoder velocity used by the idealized simulation. */
  maxTicksPerSecond?: number;
  /** Encoder ticks in one output-shaft revolution. */
  ticksPerRevolution?: number;
  positionToleranceTicks?: number;
  stallCurrentAmps?: number;
  idleCurrentAmps?: number;
  /** Exponential velocity decay constant used while a floating motor is unpowered. */
  floatDampingPerSecond?: number;
  /** Maximum powered change in output-shaft velocity. Defaults to 100× max speed per second. */
  poweredAccelerationTicksPerSecondSquared?: number;
  /** Maximum BRAKE deceleration. Defaults to 8× max speed per second. */
  brakeDecelerationTicksPerSecondSquared?: number;
}

interface ResolvedMotorConfig {
  maxTicksPerSecond: number;
  ticksPerRevolution: number;
  positionToleranceTicks: number;
  stallCurrentAmps: number;
  idleCurrentAmps: number;
  floatDampingPerSecond: number;
  poweredAccelerationTicksPerSecondSquared: number;
  brakeDecelerationTicksPerSecondSquared: number;
}

const defaults = {
  maxTicksPerSecond: 2_800,
  ticksPerRevolution: 537.7,
  positionToleranceTicks: 5,
  stallCurrentAmps: 9,
  idleCurrentAmps: 0.35,
  floatDampingPerSecond: 3,
} as const;

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function moveToward(current: number, target: number, maximumDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maximumDelta) return target;
  return current + Math.sign(delta) * maximumDelta;
}

function resolveConfig(config: MotorConfig): ResolvedMotorConfig {
  const maxTicksPerSecond = positive(config.maxTicksPerSecond ?? defaults.maxTicksPerSecond, "maxTicksPerSecond");
  return {
    maxTicksPerSecond,
    ticksPerRevolution: positive(config.ticksPerRevolution ?? defaults.ticksPerRevolution, "ticksPerRevolution"),
    positionToleranceTicks: positive(
      config.positionToleranceTicks ?? defaults.positionToleranceTicks,
      "positionToleranceTicks",
    ),
    stallCurrentAmps: positive(config.stallCurrentAmps ?? defaults.stallCurrentAmps, "stallCurrentAmps"),
    idleCurrentAmps: positive(config.idleCurrentAmps ?? defaults.idleCurrentAmps, "idleCurrentAmps"),
    floatDampingPerSecond: positive(
      config.floatDampingPerSecond ?? defaults.floatDampingPerSecond,
      "floatDampingPerSecond",
    ),
    poweredAccelerationTicksPerSecondSquared: positive(
      config.poweredAccelerationTicksPerSecondSquared ?? maxTicksPerSecond * 100,
      "poweredAccelerationTicksPerSecondSquared",
    ),
    brakeDecelerationTicksPerSecondSquared: positive(
      config.brakeDecelerationTicksPerSecondSquared ?? maxTicksPerSecond * 8,
      "brakeDecelerationTicksPerSecondSquared",
    ),
  };
}

/**
 * An idealized FTC-style DC motor. Encoder values are in the caller's command frame; direction
 * is applied when exposing physical wheel velocity to a drivetrain.
 */
export class DcMotor extends SimHardwareDevice {
  protected readonly config: ResolvedMotorConfig;
  private readonly unsubscribeClock: () => void;
  private direction = Direction.FORWARD;
  private zeroPowerBehavior = ZeroPowerBehavior.BRAKE;
  private mode = RunMode.RUN_WITHOUT_ENCODER;
  private power = 0;
  private targetPositionTicks = 0;
  private positionTicks = 0;
  protected velocityTicksPerSecond = 0;
  private enabled = true;
  private positionToleranceTicks: number;

  constructor(clock: DeterministicClock, config: MotorConfig = {}) {
    super();
    this.config = resolveConfig(config);
    this.positionToleranceTicks = this.config.positionToleranceTicks;
    this.unsubscribeClock = clock.onTick((deltaSeconds) => this.advance(deltaSeconds));
  }

  setPower(power: number): void {
    this.assertOpen();
    this.power = clamp(finite(power, "power"), -1, 1);
  }

  getPower(): number {
    return this.power;
  }

  setDirection(direction: Direction): void {
    this.assertOpen();
    this.direction = direction;
  }

  getDirection(): Direction {
    return this.direction;
  }

  setZeroPowerBehavior(behavior: ZeroPowerBehavior): void {
    this.assertOpen();
    this.zeroPowerBehavior = behavior;
  }

  getZeroPowerBehavior(): ZeroPowerBehavior {
    return this.zeroPowerBehavior;
  }

  setPowerFloat(): void {
    this.setZeroPowerBehavior(ZeroPowerBehavior.FLOAT);
    this.setPower(0);
  }

  getPowerFloat(): boolean {
    return this.power === 0 && this.zeroPowerBehavior === ZeroPowerBehavior.FLOAT;
  }

  setTargetPosition(positionTicks: number): void {
    this.assertOpen();
    this.targetPositionTicks = Math.round(finite(positionTicks, "positionTicks"));
  }

  getTargetPosition(): number {
    return this.targetPositionTicks;
  }

  setMode(mode: RunMode): void {
    this.assertOpen();
    this.mode = mode;
    if (mode === RunMode.STOP_AND_RESET_ENCODER) {
      this.positionTicks = 0;
      this.velocityTicksPerSecond = 0;
      this.power = 0;
    }
  }

  getMode(): RunMode {
    return this.mode;
  }

  isBusy(): boolean {
    return (
      this.mode === RunMode.RUN_TO_POSITION &&
      Math.abs(this.targetPositionTicks - this.positionTicks) > this.positionToleranceTicks
    );
  }

  getCurrentPosition(): number {
    return Math.round(this.positionTicks);
  }

  getMaxTicksPerSecond(): number {
    return this.config.maxTicksPerSecond;
  }

  getTicksPerRevolution(): number {
    return this.config.ticksPerRevolution;
  }

  /** Velocity in the physical wheel frame, suitable for drivetrain integration. */
  getPhysicalVelocityTicksPerSecond(): number {
    return this.velocityTicksPerSecond * (this.direction === Direction.FORWARD ? 1 : -1);
  }

  protected getRequestedVelocityTicksPerSecond(): number | undefined {
    return undefined;
  }

  protected setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.velocityTicksPerSecond = 0;
  }

  protected getEnabled(): boolean {
    return this.enabled;
  }

  protected setPositionTolerance(toleranceTicks: number): void {
    this.positionToleranceTicks = positive(toleranceTicks, "toleranceTicks");
  }

  protected getPositionTolerance(): number {
    return this.positionToleranceTicks;
  }

  protected advance(deltaSeconds: number): void {
    if (!this.enabled || this.mode === RunMode.STOP_AND_RESET_ENCODER) {
      this.velocityTicksPerSecond = 0;
      return;
    }

    const targetVelocity = this.computeTargetVelocity();
    if (targetVelocity === 0) {
      this.velocityTicksPerSecond =
        this.zeroPowerBehavior === ZeroPowerBehavior.BRAKE
          ? moveToward(
              this.velocityTicksPerSecond,
              0,
              this.config.brakeDecelerationTicksPerSecondSquared * deltaSeconds,
            )
          : this.velocityTicksPerSecond * Math.exp(-this.config.floatDampingPerSecond * deltaSeconds);
    } else {
      this.velocityTicksPerSecond = moveToward(
        this.velocityTicksPerSecond,
        targetVelocity,
        this.config.poweredAccelerationTicksPerSecondSquared * deltaSeconds,
      );
    }

    const nextPosition = this.positionTicks + this.velocityTicksPerSecond * deltaSeconds;
    if (this.mode === RunMode.RUN_TO_POSITION) {
      const towardPositiveTarget = this.targetPositionTicks >= this.positionTicks;
      const passedTarget = towardPositiveTarget
        ? nextPosition >= this.targetPositionTicks
        : nextPosition <= this.targetPositionTicks;
      if (passedTarget) {
        this.positionTicks = this.targetPositionTicks;
        this.velocityTicksPerSecond = 0;
        return;
      }
    }
    this.positionTicks = nextPosition;
  }

  private computeTargetVelocity(): number {
    if (this.mode === RunMode.RUN_TO_POSITION) {
      const error = this.targetPositionTicks - this.positionTicks;
      // The tolerance controls `isBusy()` reporting. Keep advancing until the target is reached
      // so a deterministic simulation does not strand an ideal motor short of its command.
      if (Math.abs(error) < Number.EPSILON || this.power === 0) return 0;
      return Math.sign(error) * Math.abs(this.power) * this.config.maxTicksPerSecond;
    }

    const requestedVelocity = this.getRequestedVelocityTicksPerSecond();
    if (requestedVelocity !== undefined && this.mode === RunMode.RUN_USING_ENCODER) {
      return clamp(requestedVelocity, -this.config.maxTicksPerSecond, this.config.maxTicksPerSecond);
    }

    return this.power * this.config.maxTicksPerSecond;
  }

  override resetDeviceConfigurationForOpMode(): void {
    this.direction = Direction.FORWARD;
    this.zeroPowerBehavior = ZeroPowerBehavior.BRAKE;
    this.mode = RunMode.RUN_WITHOUT_ENCODER;
    this.power = 0;
    this.velocityTicksPerSecond = 0;
    this.enabled = true;
  }

  override onOpModeStop(): void {
    this.setPower(0);
  }

  override close(): void {
    this.unsubscribeClock();
    super.close();
  }
}

/** FTC-style extended motor controls for velocity, PID metadata, and current alerts. */
export class DcMotorEx extends DcMotor {
  private requestedVelocityTicksPerSecond: number | undefined;
  private currentAlertAmps = Number.POSITIVE_INFINITY;
  private readonly pidfByMode = new Map<RunMode, PIDFCoefficients>();

  override setPower(power: number): void {
    this.requestedVelocityTicksPerSecond = undefined;
    super.setPower(power);
  }

  setMotorEnable(): void {
    this.assertOpen();
    this.setEnabled(true);
  }

  setMotorDisable(): void {
    this.assertOpen();
    this.setEnabled(false);
  }

  isMotorEnabled(): boolean {
    return this.getEnabled();
  }

  setVelocity(velocity: number, unit?: AngleUnit): void {
    this.assertOpen();
    const ticksPerSecond =
      unit === undefined
        ? velocity
        : unit === AngleUnit.RADIANS
          ? (velocity / (2 * Math.PI)) * this.getTicksPerRevolution()
          : (velocity / 360) * this.getTicksPerRevolution();
    this.requestedVelocityTicksPerSecond = finite(ticksPerSecond, "velocity");
  }

  getVelocity(unit?: AngleUnit): number {
    const velocity = this.velocityTicksPerSecond;
    if (unit === undefined) return velocity;
    if (unit === AngleUnit.RADIANS) return (velocity / this.getTicksPerRevolution()) * 2 * Math.PI;
    return (velocity / this.getTicksPerRevolution()) * 360;
  }

  setPIDCoefficients(mode: RunMode, coefficients: PIDCoefficients): void {
    this.setPIDFCoefficients(mode, { ...coefficients, f: 0 });
  }

  getPIDCoefficients(mode: RunMode): PIDCoefficients {
    const coefficients = this.getPIDFCoefficients(mode);
    return { p: coefficients.p, i: coefficients.i, d: coefficients.d };
  }

  setPIDFCoefficients(mode: RunMode, coefficients: PIDFCoefficients): void {
    for (const [key, value] of Object.entries(coefficients)) finite(value, `PIDF ${key}`);
    this.pidfByMode.set(mode, { ...coefficients });
  }

  getPIDFCoefficients(mode: RunMode): PIDFCoefficients {
    return this.pidfByMode.get(mode) ?? { p: 0, i: 0, d: 0, f: 0 };
  }

  setVelocityPIDFCoefficients(p: number, i: number, d: number, f: number): void {
    this.setPIDFCoefficients(RunMode.RUN_USING_ENCODER, { p, i, d, f });
  }

  setPositionPIDFCoefficients(p: number): void {
    const existing = this.getPIDFCoefficients(RunMode.RUN_TO_POSITION);
    this.setPIDFCoefficients(RunMode.RUN_TO_POSITION, { ...existing, p });
  }

  setTargetPositionTolerance(toleranceTicks: number): void {
    this.setPositionTolerance(toleranceTicks);
  }

  getTargetPositionTolerance(): number {
    return this.getPositionTolerance();
  }

  getCurrent(unit = CurrentUnit.AMPS): number {
    const utilization = Math.min(1, Math.abs(this.velocityTicksPerSecond) / this.getMaxTicksPerSecond());
    const amps =
      this.config.idleCurrentAmps +
      utilization * (this.config.stallCurrentAmps - this.config.idleCurrentAmps);
    return unit === CurrentUnit.AMPS ? amps : amps * 1_000;
  }

  setCurrentAlert(value: number, unit = CurrentUnit.AMPS): void {
    const amps = unit === CurrentUnit.AMPS ? value : value / 1_000;
    this.currentAlertAmps = positive(amps, "current alert");
  }

  getCurrentAlert(unit = CurrentUnit.AMPS): number {
    return unit === CurrentUnit.AMPS ? this.currentAlertAmps : this.currentAlertAmps * 1_000;
  }

  isOverCurrent(): boolean {
    return this.getCurrent(CurrentUnit.AMPS) > this.currentAlertAmps;
  }

  protected override getRequestedVelocityTicksPerSecond(): number | undefined {
    return this.requestedVelocityTicksPerSecond;
  }

}
