import { describe, expect, it } from "vitest";
import { SimulationWorld } from "./simulation-world.js";
import { createBiobuzzAllRounder } from "./robot-presets.js";
import { robotTurretAngle } from "./robot-turret.js";
import { inversePoint3, rotate3 } from "./world-math.js";
import type { SimulationWorldOptions } from "./world-types.js";

function options(kind: "pollen" | "nectar" = "pollen"): SimulationWorldOptions {
  const configuration = createBiobuzzAllRounder(); configuration.cameras = []; configuration.sensors = [];
  return { seed: 2, robots: [{ id: "red-1", alliance: "red", configuration, position: { x: 0, y: 0.105, z: 0 }, heading: 0 }], field: { preset: "empty", halfSize: 5, floorHeight: 0, colliders: [], hives: [], tags: [], flowers: [], gardens: [], loadingZones: [], spawns: [{ id: "test-ball", kind, alliance: kind === "nectar" ? "red" : null, position: { x: 0.29, y: kind === "pollen" ? 0.03556 : 0.04572, z: 0 }, location: "field" }] } };
}
function command(world: SimulationWorld, motors: Record<string, number>, servos: Record<string, number> = {}) {
  world.enqueue({ robotId: "red-1", tick: world.tick, sequence: world.tick, motors: Object.fromEntries(Object.entries(motors).map(([name, power]) => [name, { power, direction: name.includes("right") ? "REVERSE" : "FORWARD" }])), servos, source: "opmode" });
}

describe("physical all-rounder mechanisms", () => {
  for (const kind of ["pollen", "nectar"] as const) for (const lateral of [0, 0.09, -0.17]) it(`picks up ${kind} ${lateral} m off-center without throwing it above the chassis`, async () => {
    const setup = options(kind); setup.field.spawns[0]!.position.z = lateral;
    const world = await SimulationWorld.create(setup);
    try {
      world.step(100);
      command(world, { intake: 1, front_left_drive: 0.15, front_right_drive: 0.15, back_left_drive: 0.15, back_right_drive: 0.15 });
      let maximumHeight = 0;
      for (let index = 0; index < 100; index++) { world.step(); maximumHeight = Math.max(maximumHeight, world.observe().elements[0]!.position.y); }
      command(world, { intake: 1 }); world.step(300);
      expect(maximumHeight).toBeLessThan(0.2);
      expect(world.observe().robots[0]!.payload).toContain("test-ball");
    } finally { world.dispose(); }
  });

  for (const kind of ["pollen", "nectar"] as const) it(`runs a spawned ${kind} through intake, feeder, lift, and release without teleport binding`, async () => {
    const setup = options(kind);
    const world = await SimulationWorld.create(setup);
    try {
      // The element starts in the field spawn and must make physical intake contact.
      world.step(100);
      command(world, { intake: 1, front_left_drive: 0.15, front_right_drive: 0.15, back_left_drive: 0.15, back_right_drive: 0.15 });
      world.step(100);
      command(world, { intake: 1 });
      // Stop before the shared feeder carries the ball up into the shooter.
      world.step(100);
      const picked = world.observe();
      expect(picked.robots[0]!.payload).toContain("test-ball");
      const pickupX = picked.elements[0]!.position.x;

      command(world, { intake: -0.15 });
      world.step(500);
      const fed = world.observe();
      expect(fed.robots[0]!.payload).toContain("test-ball");
      expect(fed.elements[0]!.position.x).toBeGreaterThan(pickupX);

      const lift = setup.robots[0]!.configuration.mechanisms!.lift;
      const liftMotor = setup.robots[0]!.configuration.motors.find((motor) => motor.name === lift.motor)!;
      command(world, { lift: 0.8 });
      world.step(700);
      const lifted = world.observe().robots[0]!;
      const expectedTravel = lift.maximumTravel;
      const expectedEncoder = expectedTravel * liftMotor.reduction / lift.spoolRadius * liftMotor.profile.ticksPerRevolution / (2 * Math.PI);
      expect(lifted.payload).toContain("test-ball");
      expect(lifted.mechanism.liftHeight).toBeCloseTo(expectedTravel * (lift.axis?.y ?? 1), 3);
      expect(lifted.sensors.motors[lift.motor]!.positionTicks).toBeCloseTo(expectedEncoder, 0);

      command(world, {}, { release: 1 });
      world.step(200);
      const released = world.observe().robots[0]!;
      const releaseServo = setup.robots[0]!.configuration.servos.find((servo) => servo.name === lift.releaseServo)!;
      expect(released.servos[releaseServo.name]!.angle).toBeCloseTo(releaseServo.maxRadians, 2);
      expect(world.observe().elements[0]!.location).toBe("field");
    } finally { world.dispose(); }
  });

  for (const axis of [undefined, { x: 0.25, y: Math.sqrt(0.9375), z: 0 }]) it(`carries a ball along a ${axis ? "forward-inclined" : "legacy vertical"} lift, reports the travel stop, and releases through gravity`, async () => {
    const setup = options();
    const configuration = setup.robots[0]!.configuration;
    const lift = configuration.mechanisms!.lift;
    if (axis) lift.axis = axis;
    else delete lift.axis;
    const world = await SimulationWorld.create(setup);
    try {
      world.step(100); world.placeElement("test-ball", { x: 0, y: 0.075, z: 0 });
      command(world, { intake: -0.15 }); world.step(500);
      expect(world.observe().elements[0]!.position.x).toBeGreaterThan(0.16);
      command(world, { lift: 0.8 }); world.step(700);
      const top = world.observe().robots[0]!;
      const rise = lift.maximumTravel * (axis?.y ?? 1);
      expect(top.mechanism.liftHeight).toBeCloseTo(rise, 3);
      const carried = inversePoint3(world.observe().elements[0]!.position, top.position, top.rotation);
      const centerX = lift.mount.x + (axis?.x ?? 0) * lift.maximumTravel;
      expect(Math.abs(carried.x - centerX)).toBeLessThan(0.06);
      expect(carried.y).toBeGreaterThan(lift.mount.y + rise + 0.02);
      const encoder = top.sensors.motors.lift!.positionTicks;
      const motor = configuration.motors.find(motor => motor.name === lift.motor)!;
      const expectedEncoder = lift.maximumTravel * motor.reduction / lift.spoolRadius * motor.profile.ticksPerRevolution / (2 * Math.PI);
      expect(Math.abs(encoder - expectedEncoder)).toBeLessThan(3);
      world.step(100);
      expect(world.observe().robots[0]!.sensors.motors.lift!.positionTicks).toBeCloseTo(encoder, 0);
      expect(world.observe().robots[0]!.sensors.motors.lift!.currentAmps).toBeGreaterThan(5);
      command(world, {}, { release: 1 }); world.step(200);
      expect(world.observe().robots[0]!.payload).toEqual([]);
      expect(world.observe().elements[0]!.position.y).toBeLessThan(0.1);
    } finally { world.dispose(); }
  });

  it("uses feeder power to reject through the open side port and preserves the element", async () => {
    const world = await SimulationWorld.create(options());
    try {
      world.step(100); world.placeElement("test-ball", { x: 0, y: 0.075, z: 0 });
      command(world, {}, { gate: 1 }); world.step(200);
      expect(Math.abs(world.observe().elements[0]!.position.z)).toBeLessThan(0.06);
      command(world, { intake: 0.3 }, { gate: 1 }); world.step(600);
      expect(world.observe().elements[0]!.position.z).toBeGreaterThan(0.28);
      expect(world.observe().elements[0]!.location).toBe("field");
      expect(world.observe().robots[0]!.payload).toEqual([]);
    } finally { world.dispose(); }
  });

  it("cannot convey stored POLLEN when feeder contact grip is zero", async () => {
    const outcomes = [];
    for (const [grip, power] of [[0, 0], [0, -0.15], [0.8, -0.15]] as const) {
      const setup = options();
      setup.robots[0]!.configuration.mechanisms!.feeder.grip = grip;
      const world = await SimulationWorld.create(setup);
      try {
        world.step(100); world.placeElement("test-ball", { x: 0, y: 0.075, z: 0 });
        command(world, { intake: power }); world.step(500);
        outcomes.push(world.observe().elements[0]!.position.x);
      } finally { world.dispose(); }
    }
    // Gravity can roll a ball in the channel. A spinning frictionless belt must
    // add no displacement beyond that same unpowered physical baseline.
    expect(outcomes[1]!).toBeCloseTo(outcomes[0]!, 5);
    expect(outcomes[2]!).toBeGreaterThan(0.16);
  });

  it("loads the release servo from an off-center ball's physical tray contacts", async () => {
    const angles = [];
    for (const torqueNm of [0.00001, 2.1]) {
      const setup = options();
      setup.robots[0]!.configuration.servos.find((servo) => servo.name === "release")!.torqueNm = torqueNm;
      const world = await SimulationWorld.create(setup);
      try {
        world.step(100); world.placeElement("test-ball", { x: 0.20, y: 0.082, z: 0 });
        command(world, {}, { release: 0 });
        // The ball rolls across the pivot; measure deflection under load rather
        // than one arbitrary sample after the unloaded tray can swing back.
        let peakAngle = 0;
        for (let tick = 0; tick < 200; tick++) {
          world.step();
          peakAngle = Math.max(peakAngle, world.observe().robots[0]!.servos.release!.angle);
        }
        angles.push(peakAngle);
      } finally { world.dispose(); }
    }
    expect(angles[0]!).toBeGreaterThan(angles[1]! + 0.05);
    expect(angles[1]!).toBeLessThan(0.02);
  });

  it("slows the flywheel when a ball leaves and reproduces a mechanism snapshot", async () => {
    const world = await SimulationWorld.create(options());
    try {
      world.step(100); world.placeElement("test-ball", { x: -0.16, y: 0.11, z: 0 });
      command(world, { flywheel: 1 }); world.step(400); command(world, { flywheel: 1, intake: 1 });
      const snapshot = world.snapshot(); let previous = world.observe(), launched = false;
      for (let tick = 0; tick < 200; tick++) {
        world.step(); const current = world.observe();
        if (current.elements[0]!.linearVelocity.x - previous.elements[0]!.linearVelocity.x > 2) {
          expect(current.robots[0]!.mechanism.flywheelRadiansPerSecond).toBeLessThan(previous.robots[0]!.mechanism.flywheelRadiansPerSecond);
          launched = true;
        }
        previous = current;
      }
      expect(launched).toBe(true);
      const expected = world.observe(); world.restore(snapshot); world.step(200);
      expect(world.observe()).toEqual(expected);
    } finally { world.dispose(); }
  });

  it("turns the projectile spin axis with the shooter turret", async () => {
    const world = await SimulationWorld.create(options());
    try {
      world.step(100);
      world.placeElement("test-ball", { x: -0.16, y: 0.11, z: 0 });
      const configuration = options().robots[0]!.configuration;
      const turretMotor = configuration.motors.find((motor) => motor.name === "turret")!;
      const aim = { power: 0.5, mode: "RUN_TO_POSITION" as const, targetPosition: Math.round(turretMotor.profile.ticksPerRevolution * turretMotor.reduction / 4), zeroPowerBehavior: "BRAKE" as const };
      world.enqueue({ robotId: "red-1", tick: world.tick, sequence: world.tick, motors: { flywheel: { power: 1 }, turret: aim }, servos: {}, source: "opmode" });
      world.step(400);
      world.enqueue({ robotId: "red-1", tick: world.tick, sequence: world.tick, motors: { flywheel: { power: 1 }, intake: { power: 1 }, turret: aim }, servos: {}, source: "opmode" });
      let previous = world.observe();
      let observedLaunch = false;
      for (let tick = 0; tick < 200; tick++) {
        world.step();
        const current = world.observe();
        const before = previous.elements[0]!, after = current.elements[0]!;
        if (before.linearVelocity.z - after.linearVelocity.z > 2) {
          const robot = current.robots[0]!;
          const turret = robotTurretAngle(configuration, robot);
          const axis = rotate3({ x: -Math.sin(turret), y: 0, z: -Math.cos(turret) }, robot.rotation);
          const spin = { x: after.angularVelocity.x - before.angularVelocity.x, y: after.angularVelocity.y - before.angularVelocity.y, z: after.angularVelocity.z - before.angularVelocity.z };
          const alignment = (spin.x * axis.x + spin.y * axis.y + spin.z * axis.z) / Math.hypot(spin.x, spin.y, spin.z);
          expect(alignment).toBeGreaterThan(0.95);
          observedLaunch = true;
          break;
        }
        previous = current;
      }
      expect(observedLaunch).toBe(true);
    } finally { world.dispose(); }
  });
});
