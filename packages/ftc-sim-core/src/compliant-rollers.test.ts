import { describe, expect, it } from "vitest";
import { createBiobuzzAllRounder } from "./robot-presets.js";
import { SimulationWorld } from "./simulation-world.js";

async function rollerWorld(intakeStiffness = 600) {
  const configuration = createBiobuzzAllRounder();
  configuration.cameras = []; configuration.sensors = [];
  configuration.mechanisms!.intake.complianceNPerM = intakeStiffness;
  return SimulationWorld.create({
    seed: 2,
    robots: [{ id: "red-1", alliance: "red", configuration, position: { x: 0, y: 0.105, z: 0 }, heading: 0 }],
    field: { preset: "empty", halfSize: 5, floorHeight: 0, colliders: [], hives: [], tags: [], flowers: [], gardens: [], loadingZones: [], spawns: [{ id: "ball", kind: "pollen", alliance: null, position: { x: 0.29, y: 0.03556, z: 0 }, location: "field" }] },
  });
}

function power(world: SimulationWorld, intake: number, drive = 0) {
  world.enqueue({ robotId: "red-1", tick: world.tick, sequence: world.tick, motors: {
    intake: { power: intake }, flywheel: { power: 0 },
    front_left_drive: { power: drive }, back_left_drive: { power: drive },
    front_right_drive: { power: drive, direction: "REVERSE" }, back_right_drive: { power: drive, direction: "REVERSE" },
  }, servos: {}, source: "opmode" });
}

describe("compliant roller physics", () => {
  it("requires tread stiffness for physical pickup instead of adding grip outside contact", async () => {
    const held: string[][] = [];
    for (const stiffness of [0, 600]) {
      const world = await rollerWorld(stiffness);
      try {
        world.step(100); power(world, 1, 0.15); world.step(100);
        power(world, 1); world.step(300);
        held.push(world.observe().robots[0]!.payload);
      } finally { world.dispose(); }
    }
    expect(held[0]).toEqual([]);
    expect(held[1]).toContain("ball");
  });

  it("replays loaded intake contact and shaft motion deterministically", async () => {
    const world = await rollerWorld();
    try {
      world.step(100); power(world, 0.6, 0.15); world.step(80);
      const snapshot = world.snapshot();
      world.step(180); const expected = world.observe();
      world.restore(snapshot); world.step(180);
      expect(world.observe()).toEqual(expected);
    } finally { world.dispose(); }
  });
});
