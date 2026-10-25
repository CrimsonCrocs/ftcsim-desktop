import { expect, it } from "vitest";
import { SimulationWorld } from "./simulation-world.js";
import { createBiobuzzAllRounder } from "./robot-presets.js";
import type { SimulationWorldOptions } from "./world-types.js";

function options(parameters: Record<string, number>): SimulationWorldOptions {
  const configuration = createBiobuzzAllRounder(); delete configuration.mechanisms; configuration.cameras = []; configuration.sensors = [];
  return { seed: 1, parameters, field: { preset: "empty", halfSize: 5, floorHeight: 0, colliders: [], hives: [], flowers: [], tags: [], gardens: [], loadingZones: [], spawns: [] }, robots: [{ id: "red-1", alliance: "red", configuration, position: { x: 0, y: 0.105, z: 0 }, heading: 0 }] };
}
it("applies the experimental wheel-contact setting to acceleration", async () => {
  const worlds = await Promise.all([0.65, 1.05].map((wheelGrip) => SimulationWorld.create(options({ wheelGrip }))));
  try {
    for (const world of worlds) {
      world.step(100);
      world.enqueue({ robotId: "red-1", tick: world.tick, sequence: world.tick, source: "opmode", servos: {}, motors: Object.fromEntries(["front_left_drive", "front_right_drive", "back_left_drive", "back_right_drive"].map((name) => [name, { power: 1, direction: name.includes("right") ? "REVERSE" : "FORWARD" }])) });
      world.step(40);
    }
    expect(worlds[1]!.observe().robots[0]!.position.x).toBeGreaterThan(worlds[0]!.observe().robots[0]!.position.x);
  } finally { worlds.forEach((world) => world.dispose()); }
});
it("applies the rotor-inertia setting to free-shaft spin-up", async () => {
  const worlds = await Promise.all([0.0008, 0.0016].map((motorOutputInertia) => SimulationWorld.create(options({ motorOutputInertia }))));
  try {
    for (const world of worlds) {
      world.enqueue({ robotId: "red-1", tick: 0, sequence: 0, source: "opmode", servos: {}, motors: { intake: { power: 1 } } });
      world.step(4);
    }
    expect(worlds[0]!.observe().robots[0]!.motors.intake!.velocityRadiansPerSecond).toBeGreaterThan(worlds[1]!.observe().robots[0]!.motors.intake!.velocityRadiansPerSecond);
  } finally { worlds.forEach((world) => world.dispose()); }
});
