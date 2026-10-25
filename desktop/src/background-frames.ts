interface FramePlatform {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
  schedule(callback: () => void, delayMs: number): number;
  clear(id: number): void;
  now(): number;
  hidden(): boolean;
  onVisibilityChange(callback: () => void): () => void;
}

/** WebKit can suspend rAF under an occluded native window. Keep requested UI
 * frames moving there; physics and Java retain their own independent clocks. */
export function createBackgroundFrameClock(platform: FramePlatform) {
  const pending = new Map<number, {callback: FrameRequestCallback; native: number; timer?: number}>();
  let sequence = 0;
  const finish = (id: number, time: number) => {
    const frame = pending.get(id);
    if (!frame) return;
    pending.delete(id);platform.cancel(frame.native);
    if (frame.timer !== undefined) platform.clear(frame.timer);
    frame.callback(time);
  };
  const arm = (id: number) => {
    const frame = pending.get(id);
    if (frame && frame.timer === undefined && platform.hidden())
      frame.timer = platform.schedule(() => finish(id, platform.now()), 1000 / 30);
  };
  const unsubscribe = platform.onVisibilityChange(() => {
    for (const [id, frame] of pending) {
      if (platform.hidden()) arm(id);
      else if (frame.timer !== undefined) {platform.clear(frame.timer);frame.timer = undefined;}
    }
  });
  const cancel = (id: number) => {
    const frame = pending.get(id);
    if (!frame) return;
    pending.delete(id);platform.cancel(frame.native);
    if (frame.timer !== undefined) platform.clear(frame.timer);
  };
  return {
    request(callback: FrameRequestCallback) {
      const id = ++sequence;
      const native = platform.request(time => finish(id, time));
      pending.set(id, {callback, native});arm(id);return id;
    },
    cancel,
    dispose() {unsubscribe();for (const id of pending.keys()) cancel(id);},
  };
}

export function installDesktopBackgroundFrames() {
  const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
  const clock = createBackgroundFrameClock({request, cancel,
    schedule: (callback, delay) => window.setTimeout(callback, delay), clear: id => window.clearTimeout(id),
    now: () => performance.now(), hidden: () => document.hidden,
    onVisibilityChange(callback) {document.addEventListener("visibilitychange", callback);return () => document.removeEventListener("visibilitychange", callback);},
  });
  window.requestAnimationFrame = clock.request;window.cancelAnimationFrame = clock.cancel;
}
