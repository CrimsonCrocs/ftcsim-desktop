export interface BrowserLoopSchedulerOptions {
  now?: () => number;
  wait?: (delayMs: number) => Promise<void>;
  yield?: () => Promise<void>;
}

/** Waits on an absolute cadence while bounding catch-up after a long stall. */
export function createBrowserLoopPacer(periodMs: number, options: BrowserLoopSchedulerOptions = {}) {
  const now = options.now ?? (() => performance.now());
  const wait = options.wait ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const yieldTask = options.yield ?? yieldToBrowserTask;
  let deadline = now() + periodMs;

  return async function pace(): Promise<void> {
    const current = now();
    // Bound recovery to one period; a suspended tab must not trigger a burst.
    if (current - deadline > periodMs) deadline = current;
    const remaining = deadline - current;
    deadline += periodMs;
    if (remaining > 0) await wait(remaining);
    else await yieldTask();
  };
}

export function yieldToBrowserTask(): Promise<void> {
  // A continuously busy physics loop must share the regular task queue with
  // WebSocket replies. Boosted scheduler.yield continuations can starve those
  // replies during field settling; timers also incur a nested 4 ms clamp.
  if (typeof MessageChannel !== "undefined") {
    return new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
      channel.port2.postMessage(undefined);
    });
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
