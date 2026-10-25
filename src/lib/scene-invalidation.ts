/** Observe ref updates without rendering the CAD scene on every display refresh. */
export function watchSceneFrames(options: {
  observation: () => unknown;
  invalidate: () => void;
  continuous?: boolean;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
}): () => void {
  const request = options.requestFrame ?? requestAnimationFrame;
  const cancel = options.cancelFrame ?? cancelAnimationFrame;
  let previous: unknown;
  let active = true;
  let pending: number;
  const check = () => {
    if (!active) return;
    const current = options.observation();
    if (current !== previous || options.continuous) {
      previous = current;
      options.invalidate();
    }
    pending = request(check);
  };
  pending = request(check);
  return () => { active = false; cancel(pending); };
}
