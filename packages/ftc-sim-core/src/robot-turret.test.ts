import { describe, expect, it } from "vitest";
import { createBiobuzzAllRounder } from "./robot-presets.js";
import { SimulationWorld } from "./simulation-world.js";
import { normalizeRotationRadians, robotTurretAngle } from "./robot-turret.js";
import type { MotorCommand } from "./world-types.js";

describe("continuous motor turret", () => {
  it("turns past a full revolution, brakes on release, reverses, and preserves orientation when the encoder resets", async () => {
    const configuration = createBiobuzzAllRounder();
    configuration.cameras = [];
    const motor = configuration.motors.find((item) => item.name === "turret")!;
    const world = await SimulationWorld.create({ seed: 12,
      field: { preset: "empty", halfSize: 5, floorHeight: 0, colliders: [], hives: [], tags: [], flowers: [], gardens: [], loadingZones: [], spawns: [] },
      robots: [{ id: "red-1", alliance: "red", configuration, position: { x: 0, y: 0.105, z: 0 }, heading: 0 }],
    });
    const command = (turret: MotorCommand) => world.enqueue({ robotId: "red-1", tick: world.tick, sequence: world.tick, motors: { turret }, servos: {}, source: "opmode" });
    try {
      command({ power: 0.35, mode: "RUN_WITHOUT_ENCODER", zeroPowerBehavior: "BRAKE" });
      world.step(800);
      const turning = world.observe().robots[0]!;
      expect(turning.motors.turret!.positionRadians / motor.reduction).toBeGreaterThan(2 * Math.PI);
      const encoderDegrees = ((turning.sensors.motors.turret!.positionTicks / (motor.profile.ticksPerRevolution * motor.reduction) * 360) % 360 + 360) % 360;
      expect(robotTurretAngle(configuration, turning) * 180 / Math.PI).toBeCloseTo(encoderDegrees, 0);
      expect(turning.servos.turret).toBeUndefined();

      command({ power: 0, zeroPowerBehavior: "BRAKE" });
      world.step(100);
      const stopped = world.observe().robots[0]!;
      expect(Math.abs(stopped.motors.turret!.velocityRadiansPerSecond)).toBeLessThan(0.01);
      expect(stopped.motors.turret!.positionRadians).toBeGreaterThan(2 * Math.PI * motor.reduction);
      const beforeReset = robotTurretAngle(configuration, stopped);
      command({ power: 0, mode: "STOP_AND_RESET_ENCODER" });
      world.step(4);
      const reset = world.observe().robots[0]!;
      expect(reset.sensors.motors.turret!.positionTicks).toBe(0);
      expect(robotTurretAngle(configuration, reset)).toBeCloseTo(beforeReset, 5);

      command({ power: -0.35, mode: "RUN_WITHOUT_ENCODER", zeroPowerBehavior: "BRAKE" });
      world.step(1600);
      const reversed = world.observe().robots[0]!;
      expect(reversed.motors.turret!.positionRadians).toBeLessThan(0);
      expect(robotTurretAngle(configuration, reversed)).toBeGreaterThanOrEqual(0);
      expect(robotTurretAngle(configuration, reversed)).toBeLessThan(2 * Math.PI);
      const checkpoint = world.snapshot();
      world.step(20);
      const expected = world.observe();
      world.restore(checkpoint);
      world.step(20);
      expect(world.observe()).toEqual(expected);
    } finally { world.dispose(); }
  });

  it("normalizes negative angles and exact revolutions", () => {
    expect(normalizeRotationRadians(-Math.PI / 2)).toBeCloseTo(3 * Math.PI / 2);
    expect(normalizeRotationRadians(4 * Math.PI)).toBe(0);
  });
});
