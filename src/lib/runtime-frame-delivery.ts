import type { SimulationFrame } from "@ftc-studio/opmode-protocol";

/** Deliver a reply without tying the next input to a rendered physics frame. */
export async function deliverRuntimeFrame(frame: SimulationFrame, options: {
  isCurrent: () => boolean;
  apply: (frame: SimulationFrame) => void;
  waitForPhysics: () => Promise<unknown>;
  advanceEachFrame?: boolean;
  finish: () => Promise<void>;
}): Promise<void> {
  if (!options.isCurrent()) return;
  options.apply(frame);
  const completed = frame.programStatus === "completed";
  if (completed || options.advanceEachFrame) await options.waitForPhysics();
  if (completed && options.isCurrent()) await options.finish();
}
