import { describe, expect, it } from "vitest";
import { SimulationWorld } from "./simulation-world.js";
import { createBiobuzzAllRounder } from "./robot-presets.js";

describe("pin separation geometry", () => {
  it("measures robot surfaces at their actual orientation instead of subtracting a fixed width", async () => {
    const configuration = createBiobuzzAllRounder();
    delete configuration.mechanisms; configuration.sensors = []; configuration.cameras = [];
    const world = await SimulationWorld.create({ seed: 1,
      field: { preset: "empty", halfSize: 5, floorHeight: 0, colliders: [], hives: [], tags: [], flowers: [], gardens: [], loadingZones: [], spawns: [] },
      robots: [
        { id: "red-1", alliance: "red", configuration, position: { x: 0, y: 0.1, z: 0 }, heading: 0 },
        { id: "blue-1", alliance: "blue", configuration, position: { x: 1, y: 0.1, z: 0 }, heading: Math.PI / 4 },
      ],
    });
    try {
      const expectedGap = 1 - 0.438 / 2 - 0.438 / Math.sqrt(2);
      expect(world.robotSeparationMeters("red-1", "blue-1")).toBeCloseTo(expectedGap, 5);
      expect(world.robotSeparationMeters("blue-1", "red-1")).toBeCloseTo(expectedGap, 5);
      expect(world.robotOverlapsBox("blue-1", { x: 1 - 0.438 / Math.sqrt(2) + 0.002, y: 0, z: 0 }, { x: 0.001, y: 1000, z: 0.001 })).toBe(true);
      expect(world.robotOverlapsBox("blue-1", { x: 1 - 0.438 / Math.sqrt(2) - 0.002, y: 0, z: 0 }, { x: 0.001, y: 1000, z: 0.001 })).toBe(false);
    } finally { world.dispose(); }
  });
});
