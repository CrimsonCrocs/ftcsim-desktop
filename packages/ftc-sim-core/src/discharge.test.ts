import { expect, it } from "vitest";
import * as Rules from "./biobuzz-rules.js";
import { GameSimulation } from "./game-simulation.js";
import { createBiobuzzAllRounder } from "./robot-presets.js";
import { SimulationWorld } from "./simulation-world.js";
import type { HiveConfiguration, SimulationWorldOptions } from "./world-types.js";

function hive(id: string, alliance: "red" | "blue", x: number, opening: "up" | "down" | null): HiveConfiguration {
  const initialAngle = opening === "down" ? Math.PI : 0;
  return {
    id, alliance, pivot: { x, y: 1.2, z: 0 }, axis: { x: 1, y: 0, z: 0 }, initialAngle,
    lowerLimit: 0, upperLimit: Math.PI, massKg: 10, centerOfMass: { x: 0, y: 0, z: 0 }, angularDamping: 0.5,
    colliders: opening ? [{ id: `${id}-wall`, position: { x: 0.035, y: -0.1, z: 0 }, shape: { kind: "box", halfExtents: { x: 0.005, y: 0.3, z: 0.15 } }, friction: 0.4 }] : [],
    cells: opening ? [{ id: `${id}-cell`, center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 0.12, y: 0.12, z: 0.12 }, openingNormal: { x: 0, y: 1, z: 0 } }] : [],
    dampers: [
      { local: { x: 0, y: 0, z: 0 }, frame: { x, y: 1.2, z: 0 }, contactDistance: 0.01 },
      { local: { x: 0, y: 0, z: 0 }, frame: { x, y: 1.2, z: 0 }, contactDistance: 0.01 },
    ],
  };
}

function robotConfiguration() {
  const configuration = createBiobuzzAllRounder();
  delete configuration.mechanisms;
  configuration.sensors = [];
  configuration.cameras = [];
  return configuration;
}

function dischargeOptions(opening: "up" | "down", landingSurface: boolean): SimulationWorldOptions {
  return {
    seed: 19,
    field: {
      preset: "empty", halfSize: 5, floorHeight: 0,
      colliders: landingSurface ? [{ id: "landing-surface", position: { x: 0, y: 0.45, z: 0 }, shape: { kind: "box", halfExtents: { x: 0.3, y: 0.02, z: 0.3 } }, friction: 0.7 }] : [],
      hives: [hive("hive-red", "red", 0, opening)],
      tags: [], flowers: [], gardens: [], loadingZones: [],
      spawns: [{ id: "pollen-01", kind: "pollen", alliance: null, position: { x: 0, y: 1.28, z: 0 }, location: "field" }],
    },
    robots: [],
  };
}

function gameOptions(): SimulationWorldOptions {
  const configuration = robotConfiguration();
  const robots = Rules.BIOBUZZ_ROBOT_IDS.map((id, index) => ({
    id,
    alliance: id.startsWith("red") ? "red" as const : "blue" as const,
    configuration: structuredClone(configuration),
    position: { x: id === "red-1" ? 0 : index < 2 ? -2 : 2, y: 0.105, z: id === "red-1" ? 0 : index % 2 ? 1.2 : -1.2 },
    heading: 0,
  }));
  const spawns = Rules.BIOBUZZ_ELEMENT_IDS.map((id, index) => ({
    id,
    kind: id.startsWith("pollen-") ? "pollen" as const : "nectar" as const,
    alliance: id.startsWith("nectar-red") ? "red" as const : id.startsWith("nectar-blue") ? "blue" as const : null,
    location: id === "pollen-01" ? "field" as const : "supply" as const,
    position: id === "pollen-01" ? { x: 0, y: 1.28, z: 0 } : { x: -3 + (index % 8) * 0.1, y: 0.1, z: -3 + Math.floor(index / 8) * 0.1 },
  }));
  return {
    seed: 19,
    robots,
    field: {
      preset: "biobuzz-2026-2027", halfSize: 5, floorHeight: 0, colliders: [], tags: [], flowers: [], gardens: [],
      loadingZones: [],
      hives: [hive("hive-red", "red", 0, "down"), hive("hive-blue", "blue", 3, null)],
      spawns,
    },
  };
}

it("does not classify a downward fall out of an upward CELL as a HIVE discharge", async () => {
  const world = await SimulationWorld.create(dischargeOptions("up", false));
  try {
    for (let step = 0; step < 400; step++) {
      world.step(1);
      expect(world.observe().elements[0]!.dischargedUntilFloorContact).toBe(false);
    }
  } finally {
    world.dispose();
  }
});

it("marks a downward CELL discharge only after the last HIVE contact, then clears at another surface", async () => {
  const world = await SimulationWorld.create(dischargeOptions("down", true));
  try {
    world.step(1);
    expect(world.contacts()).toContainEqual({ first: "hive-red", second: "pollen-01" });

    let sawDischargeAfterHiveRelease = false;
    let reachedOtherSurface = false;
    for (let step = 0; step < 400; step++) {
      world.step(1);
      const element = world.observe().elements[0]!;
      const contacts = world.contacts();
      const touchingHive = contacts.some((contact) => contact.first === "hive-red" && contact.second === element.id || contact.second === "hive-red" && contact.first === element.id);
      const touchingLandingSurface = contacts.some((contact) => contact.first === "landing-surface" && contact.second === element.id || contact.second === "landing-surface" && contact.first === element.id);
      if (element.dischargedUntilFloorContact) {
        expect(touchingHive).toBe(false);
        sawDischargeAfterHiveRelease = true;
      }
      if (touchingLandingSurface) {
        expect(element.dischargedUntilFloorContact).toBe(false);
        reachedOtherSurface = true;
        break;
      }
    }

    expect(sawDischargeAfterHiveRelease).toBe(true);
    expect(reachedOtherSurface).toBe(true);
  } finally {
    world.dispose();
  }
});

it("keeps a tipped-HIVE element catchable only as a G409 review when a ROBOT intercepts it first", async () => {
  const game = await GameSimulation.create(gameOptions());
  try {
    game.start();
    for (let step = 0; step < 800 && !game.rules.refereeReviews.some((review) => review.ruleId === "G409"); step += 4) game.step(4);

    const pollen = game.world.observe().elements.find((element) => element.id === "pollen-01")!;
    expect(pollen.dischargedUntilFloorContact).toBe(true);
    const contacts = game.world.contacts();
    expect(contacts.some((contact) => (contact.first === "pollen-01" && contact.second === "red-1") || (contact.second === "pollen-01" && contact.first === "red-1"))).toBe(true);
    expect(contacts.some((contact) => (contact.first === "pollen-01" && contact.second === "hive-red") || (contact.second === "pollen-01" && contact.first === "hive-red"))).toBe(false);
    expect(game.rules.refereeReviews.some((review) => review.ruleId === "G409" && review.robotId === "red-1")).toBe(true);
  } finally {
    game.dispose();
  }
});
