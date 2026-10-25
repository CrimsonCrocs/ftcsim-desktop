import type { OpModeSession } from "./opmode-session";
import type { SimulationFrame } from "@ftc-studio/opmode-protocol";

/** Keep a healthy stopped runtime's verified artifact for the next Play. */
export async function stopRuntimeSessionForReuse(
  session: OpModeSession | null,
  pendingTicks: Iterable<Promise<void>>,
  deadlineMilliseconds = 300,
): Promise<SimulationFrame | null> {
  if (!session) return null;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    // The runner orders STOP after already-sent ticks. Acknowledgement proves
    // those ticks drained and the runner neutralized its actuator frame.
    const frame = await Promise.race([
      session.transition("stop"),
      new Promise<null>((resolve) => { deadline = setTimeout(() => resolve(null), deadlineMilliseconds); }),
    ]);
    if (frame?.phase === "stopped") return frame;
  } catch { /* A failed session cannot be reused. Socket closure remains the safety boundary. */ }
  finally { if (deadline) clearTimeout(deadline); }
  await stopRuntimeSession(session, pendingTicks);
  return null;
}

export async function stopRuntimeSession(
  session: OpModeSession | null,
  pendingTicks: Iterable<Promise<void>>,
  deadlineMilliseconds = 150,
): Promise<SimulationFrame | null> {
  const settling = Promise.allSettled([
    ...(session ? [session.close()] : []),
    ...pendingTicks,
  ]);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    settling,
    new Promise<void>((resolve) => {
      deadline = setTimeout(resolve, deadlineMilliseconds);
    }),
  ]);
  if (deadline) clearTimeout(deadline);
  return null;
}
