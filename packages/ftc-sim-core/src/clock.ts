/** A deterministic, fixed-step clock used by all simulated devices. */
export type ClockListener = (deltaSeconds: number, nowSeconds: number) => void;

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than zero`);
  }
}

/**
 * Advances only in whole fixed-size ticks. Keeping time under explicit caller control makes a
 * simulation repeatable for a recorded sequence of inputs.
 */
export class DeterministicClock {
  readonly stepMs: number;
  private currentMs = 0;
  private listenerId = 0;
  private readonly listeners = new Map<number, ClockListener>();

  constructor(stepMs = 20) {
    assertFinitePositive(stepMs, "stepMs");
    this.stepMs = stepMs;
  }

  get nowMs(): number {
    return this.currentMs;
  }

  get nowSeconds(): number {
    return this.currentMs / 1_000;
  }

  /** Registers a callback that fires after each simulated clock tick. */
  onTick(listener: ClockListener): () => void {
    const id = this.listenerId++;
    this.listeners.set(id, listener);
    return () => this.listeners.delete(id);
  }

  /** Advances the simulation by `steps * stepMs`. */
  step(steps = 1): void {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new RangeError("steps must be a non-negative integer");
    }

    const deltaSeconds = this.stepMs / 1_000;
    for (let index = 0; index < steps; index += 1) {
      this.currentMs += this.stepMs;
      // A listener may unsubscribe itself while handling the tick, so iterate a snapshot.
      for (const listener of [...this.listeners.values()]) {
        listener(deltaSeconds, this.nowSeconds);
      }
    }
  }

  reset(nowMs = 0): void {
    if (!Number.isFinite(nowMs) || nowMs < 0) {
      throw new RangeError("nowMs must be a finite non-negative number");
    }
    this.currentMs = nowMs;
  }
}
