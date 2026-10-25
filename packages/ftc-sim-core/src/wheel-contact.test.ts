import { describe, expect, it } from "vitest";
import { createBiobuzzAllRounder } from "./robot-presets.js";
import { SimulationWorld } from "./simulation-world.js";

// A ball can reach the wheel ray through the open intake funnel while strafing.
// Tire reaction must use the ball's mass, not the robot's suspension load alone.
describe("wheel contact with loose scoring elements", () => {
  for (const kind of ["pollen", "nectar"] as const) it(`does not explosively launch ${kind} during a sideways brush`, async () => {
    const configuration = createBiobuzzAllRounder();
    configuration.cameras = []; configuration.sensors = [];
    const radius = kind === "pollen" ? 0.03556 : 0.04572;
    const world = await SimulationWorld.create({
      seed: 42,
      robots: [{ id: "red-1", alliance: "red", configuration, position: { x: 0, y: 0.105, z: 0 }, heading: 0 }],
      field: { preset: "empty", halfSize: 5, floorHeight: 0, colliders: [], hives: [], tags: [], flowers: [], gardens: [], loadingZones: [],
        spawns: [{ id: "ball", kind, alliance: kind === "nectar" ? "red" : null, position: { x: 0.17, y: radius, z: -0.3 }, location: "field" }],
      },
    });
    try {
      world.step(100);
      world.enqueue({ robotId: "red-1", tick: world.tick, sequence: 1, source: "opmode", servos: {},
        motors: Object.fromEntries(configuration.wheels.map((wheel, index) => [wheel.motor, {
          power: [-0.7, 0.7, 0.7, -0.7][index]!, direction: wheel.motor.includes("right") ? "REVERSE" : "FORWARD",
        }])),
      });
      let peakSpeed = 0; let peakHeight = 0;
      for (let tick = 0; tick < 200; tick++) {
        world.step();
        const ball = world.observe().elements[0]!;
        peakSpeed = Math.max(peakSpeed, Math.hypot(ball.linearVelocity.x, ball.linearVelocity.y, ball.linearVelocity.z));
        peakHeight = Math.max(peakHeight, ball.position.y);
      }
      // A ~0.7 m/s brush must transfer momentum, not launch a 45 m/s projectile.
      expect(peakSpeed).toBeGreaterThan(0.1);
      expect(peakSpeed).toBeLessThan(6);
      expect(peakHeight).toBeLessThan(0.3);
      expect(world.observe().elements[0]!.location).toBe("field");
      expect(Number.isFinite(world.observe().robots[0]!.position.z)).toBe(true);
    } finally { world.dispose(); }
  });
});
