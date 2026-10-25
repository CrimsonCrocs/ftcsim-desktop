import type { RealtimePhysicsClock } from "./realtime-physics-clock";
import { OPMODE_MAX_PIPELINED_TICKS } from "@ftc-studio/opmode-protocol";

export const CONTROL_TICK_MILLIS = 20;
export const PHYSICS_SUBSTEPS_PER_CONTROL_TICK = 4;
export const MAX_RUNTIME_TICKS_IN_FLIGHT = OPMODE_MAX_PIPELINED_TICKS;

export function shouldIssueRuntimeTick(
  inFlight: number,
  maximum = MAX_RUNTIME_TICKS_IN_FLIGHT,
): boolean {
  return Number.isSafeInteger(inFlight)
    && inFlight >= 0
    && Number.isSafeInteger(maximum)
    && maximum > 0
    && inFlight < maximum;
}

export function physicsSubstepsForElapsed(
  clock: RealtimePhysicsClock,
  elapsedSeconds: number,
): number {
  return clock.consume(elapsedSeconds) * PHYSICS_SUBSTEPS_PER_CONTROL_TICK;
}

/** Dispatch on the local clock. A remote reply must never schedule the next tick. */
export function startRuntimeTickLoop(options: {
  isCurrent: () => boolean;
  dispatch: () => void;
  schedule: (callback: () => void, delayMs: number) => void;
  now?: () => number;
}): void {
  const now = options.now ?? (() => performance.now());
  let nextTickAt = now();
  const tick = () => {
    if (!options.isCurrent()) return;
    options.dispatch();
    if (options.isCurrent()) {
      const current = now();
      nextTickAt += CONTROL_TICK_MILLIS;
      // Recover ordinary timer jitter, but never replay a backlog of old inputs.
      if (current - nextTickAt >= CONTROL_TICK_MILLIS) nextTickAt = current + CONTROL_TICK_MILLIS;
      options.schedule(tick, Math.max(0, nextTickAt - current));
    }
  };
  tick();
}
