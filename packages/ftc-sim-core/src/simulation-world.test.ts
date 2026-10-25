import { describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { advanceMotor, advanceServo, createMotorState, motorElectricalOutput } from "./electromechanics.js";
import { createBiobuzzAllRounder, validateWorldRobotConfiguration, YELLOW_JACKET_312 } from "./robot-presets.js";
import { SimulationWorld } from "./simulation-world.js";
import { axisAngle, multiplyQ } from "./world-math.js";
import type { SimulationWorldOptions, WorldCommand } from "./world-types.js";

function options(): SimulationWorldOptions {
  const robot = createBiobuzzAllRounder();
  delete robot.mechanisms;
  robot.sensors = []; robot.cameras = [];
  return { seed: 42, field: { preset: "empty", halfSize: 5, floorHeight: 0, colliders: [], hives: [], tags: [], flowers: [], gardens: [], loadingZones: [], spawns: [] }, robots: [{ id: "red-1", alliance: "red", configuration: robot, position: { x: 0, y: 0.105, z: 0 }, heading: 0 }] };
}
const drive = (tick: number, power: number, zeroPowerBehavior: "BRAKE" | "FLOAT" = "BRAKE"): WorldCommand => ({ robotId: "red-1", tick, sequence: tick, motors: Object.fromEntries(["front_left_drive", "front_right_drive", "back_left_drive", "back_right_drive"].map((name) => [name, { power, zeroPowerBehavior, direction: name.includes("right") ? "REVERSE" : "FORWARD" }])), servos: {}, source: "opmode" });

describe("electromechanical measurements", () => {
  it("reproduces the published stall current and torque, and no-load speed/current", () => {
    const stalled = motorElectricalOutput(YELLOW_JACKET_312, 1, 0, 12, true);
    expect(stalled.currentAmps).toBeCloseTo(9.2, 8);
    expect(stalled.torqueNm).toBeCloseTo(24.3 * 0.0980665, 8);
    const free = motorElectricalOutput(YELLOW_JACKET_312, 1, 312 * Math.PI / 30, 12, true);
    expect(free.currentAmps).toBeCloseTo(0.25, 8);
    expect(free.torqueNm).toBeCloseTo(0, 8);
  });
  it("load reduces shaft speed and raises current, while float retains more energy than brake", () => {
    const motor = createBiobuzzAllRounder().motors[0]!;
    const free = createMotorState(); const loaded = createMotorState();
    for (let step = 0; step < 1000; step++) {
      advanceMotor(motor, free, { power: 1 }, 12, 0, 0.0003, 0.005);
      advanceMotor(motor, loaded, { power: 1 }, 12, 0.8, 0.0003, 0.005);
    }
    expect(loaded.velocityRadiansPerSecond).toBeLessThan(free.velocityRadiansPerSecond * 0.8);
    expect(loaded.currentAmps).toBeGreaterThan(free.currentAmps * 3);
    const brake = structuredClone(free); const coast = structuredClone(free);
    for (let step = 0; step < 20; step++) {
      advanceMotor(motor, brake, { power: 0, zeroPowerBehavior: "BRAKE" }, 12, 0, 0.0003, 0.005);
      advanceMotor(motor, coast, { power: 0, zeroPowerBehavior: "FLOAT" }, 12, 0, 0.0003, 0.005);
    }
    expect(Math.abs(brake.velocityRadiansPerSecond)).toBeLessThan(Math.abs(coast.velocityRadiansPerSecond) * 0.2);
  });
  it("servo travel takes physical time and respects hard stops and loads", () => {
    const servo = createBiobuzzAllRounder().servos[0]!;
    const state = { angle: servo.minRadians, target: 0.5, velocity: 0, torque: 0 };
    advanceServo(servo, state, 1, 0, 0.005);
    expect(state.angle).toBeLessThan(servo.minRadians + servo.speedRadiansPerSecond * 0.005 + 1e-10);
    for (let i = 0; i < 1000; i++) advanceServo(servo, state, 1, 0, 0.005);
    expect(state.angle).toBeLessThanOrEqual(servo.maxRadians);
    expect(state.angle).toBeCloseTo(servo.maxRadians, 3);
    const before = state.angle;
    advanceServo(servo, state, 1, servo.torqueNm * 2, 0.005);
    expect(state.angle).toBeLessThan(before);
  });
  it("fits the all-rounder within eight motors and the configured travel limits", () => {
    expect(createBiobuzzAllRounder().motors).toHaveLength(8);
    expect(validateWorldRobotConfiguration(createBiobuzzAllRounder())).toEqual([]);
  });
});

describe("shared world", () => {
  it("returns the same robot contact pairs when unrelated field contacts are excluded", async () => {
    const setup = options();
    setup.field.spawns = [
      { id: "on-robot", kind: "pollen", alliance: null, location: "field", position: { x: 0, y: 0.2, z: 0 } },
      { id: "on-floor", kind: "pollen", alliance: null, location: "field", position: { x: 1, y: 0.04, z: 0 } },
    ];
    const world = await SimulationWorld.create(setup);
    try {
      world.step(100);
      const full = world.contacts();
      const robotContacts = full.filter(contact => contact.first === "red-1" || contact.second === "red-1");
      const pairs = (contacts: typeof full) => contacts.map(contact => [contact.first, contact.second].sort().join("/")).sort();
      expect(robotContacts.length).toBeGreaterThan(0);
      expect(full.length).toBeGreaterThan(robotContacts.length);
      expect(pairs(world.contacts({ robotsOnly: true }))).toEqual(pairs(robotContacts));
    } finally { world.dispose(); }
  });
  it("reports robot pitch and roll independently of its field heading", async () => {
    const world = await SimulationWorld.create(options());
    try {
      for (const heading of [0, Math.PI / 4, -Math.PI / 2, Math.PI * 0.9]) {
        const pitch = 0.3, roll = -0.5;
        const snapshot = world.snapshot();
        const physics = RAPIER.World.restoreSnapshot(snapshot.physics);
        const body = physics.getRigidBody(snapshot.robots[0]!.handle);
        // FTC intrinsic Z-X-Y corresponds to world-local up, right, forward.
        body.setRotation(multiplyQ(axisAngle({ x: 0, y: 1, z: 0 }, heading),
          multiplyQ(axisAngle({ x: 0, y: 0, z: 1 }, pitch), axisAngle({ x: 1, y: 0, z: 0 }, roll))), true);
        body.setTranslation({ x: 0, y: 3, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        snapshot.physics = physics.takeSnapshot(); physics.free();
        world.restore(snapshot); world.step(4);
        const measured = world.sensorFrame("red-1").orientation;
        expect(measured.yawRadians).toBeCloseTo(heading, 5);
        expect(measured.pitchRadians).toBeCloseTo(pitch, 5);
        expect(measured.rollRadians).toBeCloseTo(roll, 5);
      }
    } finally { world.dispose(); }
  });
  it("keeps controller enable and encoder direction independent of match power", async () => {
    const world = await SimulationWorld.create(options());
    try {
      world.setPowered(false); world.step(4);
      expect(world.sensorFrame("red-1").motors.front_right_drive!.enabled).toBe(true);
      world.setPowered(true); world.step(96);
      world.enqueue(drive(world.tick, 0.5)); world.step(200);
      const before = world.sensorFrame("red-1").motors.front_right_drive!.positionTicks;
      expect(before).toBeGreaterThan(50);
      world.setPowered(false); world.step(4);
      const stopped = world.sensorFrame("red-1").motors.front_right_drive!;
      expect(stopped.enabled).toBe(true);
      expect(stopped.currentAmps).toBe(0);
      expect(stopped.positionTicks).toBeGreaterThan(before * 0.9);
      world.setPowered(true);
      world.enqueue({ ...drive(world.tick, 0.5), motors: Object.fromEntries(Object.keys(drive(0, 0).motors).map(name => [name, { power: 0.5, enabled: false }])) });
      world.step(4);
      world.setPowered(false); world.step(4); world.setPowered(true); world.step(4);
      expect(world.sensorFrame("red-1").motors.front_right_drive!.enabled).toBe(false);
      expect(world.sensorFrame("red-1").motors.front_right_drive!.currentAmps).toBe(0);
      world.enqueue({ ...drive(world.tick, 0.5), motors: Object.fromEntries(Object.entries(drive(0, 0.5).motors).map(([name, motor]) => [name, { ...motor, enabled: true }])) });
      world.step(200);
      expect(world.sensorFrame("red-1").motors.front_right_drive!.enabled).toBe(true);
      expect(world.observe().robots[0]!.position.x).toBeGreaterThan(0.3);
    } finally { world.dispose(); }
  });
  it("keeps protocol timestamps exact on every control boundary", async () => {
    const world = await SimulationWorld.create(options());
    try {
      for (let control = 1; control <= 300; control++) {
        world.step(4);
        expect(world.simulationTimeMs).toBe(control * 20);
        expect(world.sensorFrame("red-1").simulationTimeMs).toBe(control * 20);
      }
    } finally { world.dispose(); }
  });
  it("maps the standard FTC mecanum mix to forward, right strafe, and clockwise turn", async () => {
    for (const [forward, strafe, turn] of [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5]]) {
      const world = await SimulationWorld.create(options()); world.step(100);
      const command = drive(100, 0);
      const powers = [forward! + strafe! + turn!, forward! - strafe! - turn!, forward! - strafe! + turn!, forward! + strafe! - turn!];
      Object.values(command.motors).forEach((motor, index) => { motor.power = powers[index]!; });
      world.enqueue(command); world.step(200);
      const state = world.observe().robots[0]!;
      if (forward) { expect(state.position.x).toBeGreaterThan(0.2); expect(Math.abs(state.position.z)).toBeLessThan(0.04); }
      if (strafe) { expect(state.position.z).toBeGreaterThan(0.2); expect(Math.abs(state.position.x)).toBeLessThan(0.04); }
      if (turn) expect(state.sensors.orientation.yawRadians).toBeLessThan(-0.2);
      world.dispose();
    }
  });
  it("advances only the requested ticks and reproduces snapshot continuation exactly", async () => {
    const world = await SimulationWorld.create(options());
    world.enqueue(drive(0, 0.7)); world.step(200);
    const snapshot = world.snapshot(); world.step(200);
    const expected = world.observe();
    world.restore(snapshot); world.step(200);
    expect(world.observe()).toEqual(expected);
    expect(world.simulationTimeMs).toBe(2000);
    expect(world.replayCommands()).toHaveLength(1);
    world.dispose();
  });
  it("drives through floor contact and slows under added mass without locking pitch/roll", async () => {
    const lightOptions = options(); const heavyOptions = options();
    heavyOptions.robots[0]!.configuration.chassis.massKg = 24;
    const light = await SimulationWorld.create(lightOptions); const heavy = await SimulationWorld.create(heavyOptions);
    light.step(100); heavy.step(100);
    light.enqueue(drive(100, 1)); heavy.enqueue(drive(100, 1));
    light.step(100); heavy.step(100);
    const a = light.observe().robots[0]!; const b = heavy.observe().robots[0]!;
    expect(a.position.x).toBeGreaterThan(0.05);
    expect(a.position.x).toBeGreaterThan(b.position.x);
    expect(Math.abs(a.rotation.z)).toBeGreaterThan(0.00001);
    expect(a.sensors.motors.front_left_drive!.positionTicks).toBeGreaterThan(50);
    light.dispose(); heavy.dispose();
  });
  it("projectiles follow gravity and lose energy on a floor impact; resets preserve element identities", async () => {
    const setup = options(); setup.robots = [];
    setup.field.spawns = [{ id: "pollen-01", kind: "pollen", alliance: null, position: { x: 0, y: 1, z: 0 }, location: "field" }];
    const world = await SimulationWorld.create(setup);
    world.step(40);
    const falling = world.observe().elements[0]!;
    expect(falling.position.y).toBeCloseTo(1 - 0.5 * 9.80665 * 0.2 ** 2, 1);
    expect(falling.linearVelocity.y).toBeLessThan(-1.7);
    world.step(80);
    const bouncing = world.observe().elements[0]!;
    expect(bouncing.position.y).toBeLessThan(0.4);
    world.reset();
    expect(world.observe().elements.map((element) => element.id)).toEqual(["pollen-01"]);
    expect(world.observe().elements[0]!.position.y).toBe(1);
    world.dispose();
  });
  it("rejects unknown hardware, past commands and unbounded parameter randomization", async () => {
    const world = await SimulationWorld.create(options()); world.step(4);
    expect(() => world.enqueue(drive(0, 1))).toThrow("past");
    expect(() => world.enqueue({ ...drive(4, 1), motors: { unknown: { power: 1 } } })).toThrow("not configured");
    await expect(SimulationWorld.create({ ...options(), parameters: { ballRestitution: 1.5 } })).rejects.toThrow("experimental range");
    world.dispose();
  });
});
