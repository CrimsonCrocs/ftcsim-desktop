import { DeterministicClock } from "./clock.js";
import { SimHardwareDevice } from "./device.js";
import { Direction } from "./motor.js";

export interface ServoConfig {
  /** Physical travel in normalized units per second. */
  maxSpeedPerSecond?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

/** An ideal position servo with commanded and physical positions tracked separately. */
export class Servo extends SimHardwareDevice {
  private readonly unsubscribeClock: () => void;
  private readonly maxSpeedPerSecond: number;
  private commandPosition = 0;
  private physicalPosition = 0;
  private direction = Direction.FORWARD;
  private scaleMin = 0;
  private scaleMax = 1;

  constructor(clock: DeterministicClock, config: ServoConfig = {}) {
    super();
    const speed = config.maxSpeedPerSecond ?? 4;
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new RangeError("maxSpeedPerSecond must be a finite number greater than zero");
    }
    this.maxSpeedPerSecond = speed;
    this.unsubscribeClock = clock.onTick((deltaSeconds) => this.advance(deltaSeconds));
  }

  setPosition(position: number): void {
    this.assertOpen();
    this.commandPosition = clamp(finite(position, "position"), 0, 1);
  }

  /** The normalized command supplied by team code, matching FTC's `getPosition` intent. */
  getPosition(): number {
    return this.commandPosition;
  }

  /** The current normalized physical joint position used by the visual/physics layer. */
  getPhysicalPosition(): number {
    return this.physicalPosition;
  }

  setDirection(direction: Direction): void {
    this.assertOpen();
    this.direction = direction;
  }

  getDirection(): Direction {
    return this.direction;
  }

  scaleRange(min: number, max: number): void {
    this.assertOpen();
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 1 || min >= max) {
      throw new RangeError("Servo scale range must satisfy 0 <= min < max <= 1");
    }
    this.scaleMin = min;
    this.scaleMax = max;
  }

  override resetDeviceConfigurationForOpMode(): void {
    this.commandPosition = 0;
    this.physicalPosition = 0;
    this.direction = Direction.FORWARD;
    this.scaleMin = 0;
    this.scaleMax = 1;
  }

  override close(): void {
    this.unsubscribeClock();
    super.close();
  }

  private advance(deltaSeconds: number): void {
    const directionalPosition =
      this.direction === Direction.FORWARD ? this.commandPosition : 1 - this.commandPosition;
    const target = this.scaleMin + directionalPosition * (this.scaleMax - this.scaleMin);
    const maxDelta = this.maxSpeedPerSecond * deltaSeconds;
    this.physicalPosition += clamp(target - this.physicalPosition, -maxDelta, maxDelta);
  }
}
