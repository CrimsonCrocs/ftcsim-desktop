import type { GameSimulation, WorldAlliance } from "@ftc-studio/sim-core";

export const AUTOMATED_HUMAN_PLAYER_VERSION = "biobuzz-legal-human-player-v1";
export const HUMAN_LOADING_DELAY_MS = 1000;

/** Disclosed field-side assistance, separate from the learned robot policy. */
export class AutomatedHumanPlayer {
  private readonly nextAttempt = new Map<WorldAlliance, number>();
  private previousTick = -1;
  private previousMatchTime = -1;

  constructor(private readonly alliances: readonly WorldAlliance[]) {
    if (new Set(alliances).size !== alliances.length) throw new Error("Human-player alliances must be distinct.");
  }

  step(game: GameSimulation): { alliance: WorldAlliance; elementId: string }[] {
    if (game.world.tick < this.previousTick || game.matchTimeMs < this.previousMatchTime) this.nextAttempt.clear();
    this.previousTick = game.world.tick;
    this.previousMatchTime = game.matchTimeMs;
    // Like a human waiting through the break, this controller loads only while
    // AUTO or TELEOP is active. The game engine still supports legal manual entry
    // during Transition and penalized early entry.
    if (game.phase !== "auto" && game.phase !== "teleop") return [];
    const entries: { alliance: WorldAlliance; elementId: string }[] = [];
    for (const alliance of this.alliances) {
      if (game.availableNectar(alliance).legalNow === 0) {
        this.nextAttempt.delete(alliance);
        continue;
      }
      const due = this.nextAttempt.get(alliance);
      if (due === undefined) {
        this.nextAttempt.set(alliance, game.matchTimeMs + HUMAN_LOADING_DELAY_MS);
        continue;
      }
      if (game.matchTimeMs < due) continue;
      this.nextAttempt.set(alliance, game.matchTimeMs + HUMAN_LOADING_DELAY_MS);
      const elementId = game.tryLoadNectar(alliance);
      if (elementId) entries.push({ alliance, elementId });
    }
    return entries;
  }
}

/** The player's alliance retains its manual human-loading control. */
export function fullyAutomatedAlliances(game: GameSimulation): WorldAlliance[] {
  return (["red", "blue"] as const).filter(alliance => {
    const robots = game.world.robotSetups.filter(robot => robot.alliance === alliance);
    return robots.length === 2 && robots.every(robot => robot.controller === "policy");
  });
}
