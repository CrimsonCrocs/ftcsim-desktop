import { describe, expect, it } from "vitest";
import * as Rules from "./biobuzz-rules.js";
import { GameSimulation } from "./game-simulation.js";
import { createBiobuzzAllRounder } from "./robot-presets.js";
import type { WorldContact } from "./simulation-world.js";
import type { SimulationWorldOptions, Vector3, WorldObservation } from "./world-types.js";

type GameSimulationInternals = {
  previous: WorldObservation;
  startTick: number;
  applyObservation: (observation: WorldObservation, contacts: WorldContact[]) => void;
  processViolations: (observation: WorldObservation, contacts: WorldContact[]) => void;
};

function internals(game: GameSimulation): GameSimulationInternals {
  return game as unknown as GameSimulationInternals;
}

/** Deliberately minimal geometry for lifecycle tests, not official field acceptance evidence. */
function lifecycleFixture(): SimulationWorldOptions {
  const configuration = createBiobuzzAllRounder();
  delete configuration.mechanisms; configuration.sensors = []; configuration.cameras = [];
  return {
    seed: 42, recordCommands: false,
    robots: Rules.BIOBUZZ_ROBOT_IDS.map((id, index) => ({ id, alliance: id.startsWith("red") ? "red" : "blue", configuration: structuredClone(configuration), position: { x: index < 2 ? -1.5 : 1.5, y: 0.105, z: index % 2 ? 1.2 : -1.2 }, heading: 0 })),
    field: {
      preset: "biobuzz-2026-2027", halfSize: 1.8288, floorHeight: 0, colliders: [], tags: [], flowers: [], gardens: [],
      loadingZones: [{ alliance: "red", center: { x: -1.3, y: 0, z: 0 }, halfExtents: { x: 0.4, y: 1, z: 0.3 } }, { alliance: "blue", center: { x: 1.3, y: 0, z: 0 }, halfExtents: { x: 0.4, y: 1, z: 0.3 } }],
      hives: (["red", "blue"] as const).map((alliance, index) => ({ id: `hive-${alliance}`, alliance, pivot: { x: index ? 0.4 : -0.4, y: 1, z: 0 }, axis: { x: 1, y: 0, z: 0 }, initialAngle: 0, lowerLimit: 0, upperLimit: Math.PI, massKg: 1, centerOfMass: { x: 0, y: -0.1, z: 0 }, angularDamping: 0.2, colliders: [], cells: [], dampers: [{ local: { x: 0, y: -0.1, z: 0 }, frame: { x: index ? 0.4 : -0.4, y: 0.9, z: 0 }, contactDistance: 0.01 }, { local: { x: 0, y: -0.1, z: 0 }, frame: { x: index ? 0.4 : -0.4, y: 1.1, z: 0 }, contactDistance: 0.01 }] })),
      spawns: Rules.BIOBUZZ_ELEMENT_IDS.map((id, index) => ({ id, kind: id.startsWith("pollen") ? "pollen" : "nectar", alliance: id.includes("red") ? "red" : id.includes("blue") ? "blue" : null, location: index >= 40 ? "supply" : "field", position: { x: (index % 8 - 3.5) * 0.15, y: 0.03556, z: (Math.floor(index / 8) - 2) * 0.15 } })),
    },
  };
}

function flowerCrossingFixture(): { options: SimulationWorldOptions; elementId: string; flower: SimulationWorldOptions["field"]["flowers"][number] } {
  const options = lifecycleFixture();
  const elementId = "pollen-01";
  for (const spawn of options.field.spawns) spawn.location = "supply";
  const spawn = options.field.spawns.find((candidate) => candidate.id === elementId)!;
  spawn.location = "field";
  spawn.position = { x: 0, y: 2.1, z: 0 };
  const flower = { id: "flower-1", position: { x: 0, y: 0, z: 0 }, scoringRadius: 0.15, bottom: 1, top: 2 };
  options.field.flowers = [flower];
  return { options, elementId, flower };
}

function motionlessObservation(game: GameSimulation, movingHiveId?: string): WorldObservation {
  const observation = structuredClone(game.world.observe());
  for (const body of [...observation.robots, ...observation.hives, ...observation.elements]) {
    body.linearVelocity = { x: 0, y: 0, z: 0 };
    body.angularVelocity = { x: 0, y: 0, z: 0 };
  }
  if (movingHiveId) observation.hives.find((hive) => hive.id === movingHiveId)!.angularVelocity = { x: 1, y: 0, z: 0 };
  return observation;
}

async function reportFlowerCrossing(elementId: string, previousPosition: Vector3, currentPosition: Vector3): Promise<GameSimulation> {
  const { options } = flowerCrossingFixture();
  options.field.spawns.find((spawn) => spawn.id === elementId)!.position = previousPosition;
  const game = await GameSimulation.create(options);
  game.start();
  const state = internals(game);
  const previous = state.previous.elements.find((element) => element.id === elementId)!;
  previous.controlledBy = "red-1";
  game.world.placeElement(elementId, currentPosition);
  const observation = game.world.observe();
  observation.elements.find((element) => element.id === elementId)!.controlledBy = "red-1";
  // Invoke the same crossing detector used by the match loop without advancing physics.
  state.processViolations(observation, []);
  return game;
}

describe("full match lifecycle", () => {
  it("holds the match clock while passive INIT physics and sensors advance", async () => {
    const game = await GameSimulation.create(lifecycleFixture());
    try {
      game.initialize();
      game.world.step(200);
      expect(game.world.simulationTimeMs).toBe(1000);
      expect(game.matchTimeMs).toBe(0);
      expect(game.remainingMs).toBe(150000);
      game.stop();
      expect(game.matchTimeMs).toBe(0);
      game.initialize();
      game.world.step(200);
      game.start();
      expect(game.matchTimeMs).toBe(0);
      expect(game.remainingMs).toBe(150_000);
      game.step(4);
      expect(game.matchTimeMs).toBe(20);
      expect(game.remainingMs).toBe(149_980);
    } finally { game.dispose(); }
  });

  it("holds time for TELEOP initialization, preserves encoders, then finishes after settling", async () => {
    const game = await GameSimulation.create(lifecycleFixture());
    game.start();
    expect(game.phase).toBe("auto");
    expect(game.step(6000)).toBe(6000);
    expect(game.phase).toBe("transition");
    expect(game.remainingMs).toBe(8_000);
    expect(game.world.isPowered).toBe(false);
    expect(game.matchTimeMs).toBe(30000);
    game.step(1600);
    expect(game.phase).toBe("teleop-handoff");
    expect(game.remainingMs).toBe(120_000);
    const position = game.world.observe().robots[0]!.position;
    const encoders = game.world.sensorFrame("red-1").motors;
    expect(game.step(100)).toBe(0);
    expect(game.matchTimeMs).toBe(38000);
    game.resumeTeleop();
    expect(game.world.observe().robots[0]!.position).toEqual(position);
    expect(game.world.sensorFrame("red-1").motors).toEqual(encoders);
    game.step(20000); game.step(4000);
    expect(game.phase).toBe("settling");
    expect(game.matchTimeMs).toBe(158000);
    expect(game.world.isPowered).toBe(false);
    game.step(1000);
    expect(game.phase).toBe("results");
    expect(game.rules.completed).toBe(true);
    game.dispose();
  }, 30000);

  it("loads an early ball physically and awards its penalty without creating or deleting elements", async () => {
    const game = await GameSimulation.create(lifecycleFixture()); game.start();
    const id = game.loadNectar("red");
    expect(game.rules.fouls.some((foul) => foul.ruleId === "G426" && foul.elementId === id)).toBe(true);
    expect(game.world.observe().elements.find((element) => element.id === id)?.location).toBe("field");
    expect(game.world.observe().elements).toHaveLength(56);
    const saved = game.snapshot(); game.step(40); const expected = game.world.observe();
    game.restore(saved); game.step(40);
    expect(game.world.observe()).toEqual(expected);
    game.reset();
    expect(game.rules.humanEntries.red).toBe(0);
    expect(game.world.observe().elements).toHaveLength(56);
    game.dispose();
  });

  it("lets a human player wait for an occupied loading zone without changing the match", async () => {
    const options = lifecycleFixture();
    options.robots[0]!.position = { x: -1.3, y: 0.105, z: 0 };
    const game = await GameSimulation.create(options);
    try {
      game.start();
      const before = game.snapshot();
      expect(game.tryLoadNectar("red")).toBeNull();
      expect(game.snapshot()).toEqual(before);
      expect(() => game.loadNectar("red")).toThrow("occupied");
      expect(game.world.observe().elements).toHaveLength(56);
    } finally { game.dispose(); }
  });

  it("keeps observable violations separate from strategic referee rulings", () => {
    let state = Rules.createBiobuzzMatch({ robots: Rules.BIOBUZZ_ROBOT_IDS.map((id) => ({ id, alliance: id.startsWith("red") ? "red" : "blue" })), hives: { red: { stableState: "a", contactingDamperId: "red-a" }, blue: { stableState: "a", contactingDamperId: "blue-a" } } });
    state = Rules.applyBiobuzzInput(state, { type: "observed-violation", timestampMs: 1000, robotId: "red-1", ruleId: "G409", elementId: "pollen-01", detail: "Discharge contacted robot." });
    expect(state.scores.blue).toBe(0);
    expect(state.refereeReviews[0]?.ruleId).toBe("G409");
    for (let i = 0; i < 2; i++) state = Rules.applyBiobuzzInput(state, { type: "observed-violation", timestampMs: 2000, robotId: "red-1", ruleId: "G402", detail: "AUTO interference." });
    expect(state.scores.blue).toBe(20);
  });

  it("does not wait for an empty moving HIVE before final settling", async () => {
    const game = await GameSimulation.create(lifecycleFixture());
    try {
      game.start();
      const state = internals(game);
      game.phase = "settling";
      state.startTick = game.world.tick - Rules.BIOBUZZ_MATCH_END_MS / 5;
      game.world.setPowered(false);
      state.applyObservation(motionlessObservation(game, "hive-red"), []);
      expect(game.rules.completed).toBe(false);
      game.world.step(400); // 2 s settling window at the fixed 200 Hz world rate.
      state.applyObservation(motionlessObservation(game, "hive-red"), []);
      expect(game.rules.completed).toBe(true);
    } finally { game.dispose(); }
  });

  it("reviews a side entry whose lower sphere edge is 10 mm below the FLOWER top", async () => {
    const { flower } = flowerCrossingFixture();
    const radius = 0.03556;
    const game = await reportFlowerCrossing("pollen-01", { x: flower.scoringRadius + radius + 0.01, y: flower.top + radius - 0.01, z: 0 }, { x: 0, y: flower.top + radius - 0.01, z: 0 });
    try {
      expect(game.rules.refereeReviews.some((review) => review.ruleId === "G418")).toBe(true);
    } finally { game.dispose(); }
  });

  it("allows a top entry and a bottom POLLEN exit without a G418 review", async () => {
    const radius = 0.03556;
    const topEntry = await reportFlowerCrossing("pollen-01", { x: 0, y: 2 + radius + 0.001, z: 0 }, { x: 0, y: 2 - radius + 0.001, z: 0 });
    try {
      expect(topEntry.rules.refereeReviews.some((review) => review.ruleId === "G418")).toBe(false);
    } finally { topEntry.dispose(); }

    const bottomExit = await reportFlowerCrossing("pollen-01", { x: 0, y: 1 + radius - 0.001, z: 0 }, { x: 0, y: 1 - radius - 0.001, z: 0 });
    try {
      expect(bottomExit.rules.refereeReviews.some((review) => review.ruleId === "G418")).toBe(false);
    } finally { bottomExit.dispose(); }
  });
});
