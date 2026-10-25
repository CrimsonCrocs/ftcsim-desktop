import { CONTROL_STEP_TICKS, type GameSimulation, type SimulationWorld, type WorldObservation } from "@ftc-studio/sim-core";
import { advanceBrowserPhysics } from "@/lib/browser-physics-stepper";

export const INIT_PHYSICS_TICKS_PER_FRAME = 4;

/** Advance one 50 Hz INIT frame while the robot remains unpowered. */
export async function advanceInitializationFrame(world: SimulationWorld): Promise<WorldObservation> {
  if (world.isPowered) world.setPowered(false);
  await advanceBrowserPhysics(INIT_PHYSICS_TICKS_PER_FRAME, () => { world.step(1); });
  return world.observe();
}

/** START consumes the current sensor timestamp; the next tick needs new feedback. */
export function advanceFirstPoweredFrame(game: GameSimulation): void {
  if (game.phase !== "auto" && game.phase !== "teleop") throw new Error("A powered program must be started before its first frame.");
  if (game.step(CONTROL_STEP_TICKS) !== CONTROL_STEP_TICKS) throw new Error("The first powered control frame did not advance completely.");
}
