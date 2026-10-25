import { yieldToBrowserTask } from "./browser-loop-scheduler";

interface BrowserStepScheduling {
  now?: () => number;
  yield?: () => Promise<void>;
  isCurrent?: () => boolean;
}

/** Keep every fixed tick, but let input and paint run between expensive ticks. */
export async function advanceBrowserPhysics(
  ticks: number,
  step: () => void | Promise<void>,
  scheduling: BrowserStepScheduling = {},
): Promise<number> {
  const now = scheduling.now ?? (() => performance.now());
  const yieldToBrowser = scheduling.yield ?? yieldToBrowserTask;
  let beganAt = now();
  let completed = 0;
  while (completed < ticks && (scheduling.isCurrent?.() ?? true)) {
    await step();
    completed += 1;
    if (completed < ticks && now() - beganAt >= 5) {
      await yieldToBrowser();
      beganAt = now();
    }
  }
  return completed;
}
