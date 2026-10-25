import { describe, expect, it } from "vitest";
import { createBiobuzzAllRounder } from "./robot-presets.js";
import { SimulationWorld } from "./simulation-world.js";
import type { WorldFieldConfiguration, WorldRobotConfiguration, WorldRobotState } from "./world-types.js";

const emptyField = (spawns: WorldFieldConfiguration["spawns"] = []): WorldFieldConfiguration => ({
  preset: "empty",
  halfSize: 5,
  floorHeight: 0,
  colliders: [],
  hives: [],
  tags: [],
  flowers: [],
  gardens: [],
  loadingZones: [],
  spawns,
});

function robotConfiguration(options: { wheelGrip?: number; mechanisms?: boolean } = {}): WorldRobotConfiguration {
  const robot = createBiobuzzAllRounder();
  robot.sensors = [];
  robot.cameras = [];
  if (options.wheelGrip !== undefined) robot.wheels.forEach((wheel) => { wheel.grip = options.wheelGrip!; });
  if (options.mechanisms === false) delete robot.mechanisms;
  return robot;
}

function forwardDriveCommand(tick: number) {
  const names = ["front_left_drive", "front_right_drive", "back_left_drive", "back_right_drive"];
  return {
    robotId: "red-1" as const,
    tick,
    sequence: tick,
    motors: Object.fromEntries(names.map((name) => [name, {
      power: 0.8,
      direction: name.includes("right") ? "REVERSE" as const : "FORWARD" as const,
      zeroPowerBehavior: "BRAKE" as const,
    }])),
    servos: {},
    source: "opmode" as const,
  };
}

async function drivenRobot(configuration: WorldRobotConfiguration): Promise<WorldRobotState> {
  const world = await SimulationWorld.create({
    seed: 18,
    field: emptyField(),
    robots: [{ id: "red-1", alliance: "red", configuration, position: { x: 0, y: 0.105, z: 0 }, heading: 0 }],
  });
  try {
    world.enqueue(forwardDriveCommand(0));
    world.step(200);
    return world.observe().robots[0]!;
  } finally {
    world.dispose();
  }
}

describe("world physics acceptance", () => {
  it("shows wheel spin outrunning chassis motion on low grip, while grippy tires move the chassis", async () => {
    const highGripConfig = robotConfiguration({ wheelGrip: 0.85, mechanisms: false });
    const lowGripConfig = robotConfiguration({ wheelGrip: 0.03, mechanisms: false });
    const [grippy, slipping] = await Promise.all([
      drivenRobot(highGripConfig),
      drivenRobot(lowGripConfig),
    ]);
    const frontWheel = lowGripConfig.wheels.find((wheel) => wheel.motor === "front_left_drive")!;
    const motorShaft = slipping.motors.front_left_drive!;
    const tireSurfaceSpeed = motorShaft.velocityRadiansPerSecond
      / lowGripConfig.motors.find((motor) => motor.name === "front_left_drive")!.reduction
      * frontWheel.radius * Math.abs(Math.cos(frontWheel.tractionAngle));

    expect(grippy.position.x).toBeGreaterThan(0.5);
    expect(slipping.position.x).toBeLessThan(0.1);
    expect(grippy.position.x).toBeGreaterThan(slipping.position.x * 5);
    expect(tireSurfaceSpeed).toBeGreaterThan(Math.abs(slipping.linearVelocity.x) * 5);
  });

  it("registers real scoring elements as payload and reduces drive response under added carried mass", async () => {
    const pollen = Array.from({ length: 4 }, (_, index) => ({
      id: `pollen-${index + 1}`,
      kind: "pollen" as const,
      alliance: null,
      position: { x: -0.12 + index * 0.08, y: 0.105, z: 0 },
      location: "field" as const,
    }));
    const run = async (spawns: WorldFieldConfiguration["spawns"]) => {
      const world = await SimulationWorld.create({
        seed: 29,
        field: emptyField(spawns),
        robots: [{
          id: "red-1", alliance: "red", configuration: robotConfiguration(),
          position: { x: 0, y: 0.105, z: 0 }, heading: 0,
        }],
      });
      try {
        // Let gravity settle the field elements in the open storage channel before driving.
        world.step(100);
        world.enqueue(forwardDriveCommand(world.tick));
        world.step(100);
        return world.observe();
      } finally {
        world.dispose();
      }
    };

    const empty = await run([]);
    const loaded = await run(pollen);
    const emptyRobot = empty.robots[0]!;
    const loadedRobot = loaded.robots[0]!;

    expect(loadedRobot.payload).toHaveLength(pollen.length);
    expect(loadedRobot.payload).toEqual(expect.arrayContaining(pollen.map((element) => element.id)));
    expect(loaded.elements.every((element) => element.controlledBy === "red-1")).toBe(true);
    expect(emptyRobot.payload).toHaveLength(0);
    expect(loadedRobot.position.x).toBeLessThan(emptyRobot.position.x);
  });

  it("follows a gravity drop and loses vertical kinetic energy at the floor bounce", async () => {
    const gravity = 9.80665;
    const initialHeight = 1;
    const elapsedSeconds = 0.4;
    const world = await SimulationWorld.create({
      seed: 42,
      field: emptyField([{
        id: "drop-test-pollen", kind: "pollen", alliance: null,
        position: { x: 0, y: initialHeight, z: 0 }, location: "field",
      }]),
      robots: [],
    });

    try {
      world.step(elapsedSeconds * 200);
      const atFourTenths = world.observe().elements[0]!;
      const vacuumHeight = initialHeight - 0.5 * gravity * elapsedSeconds ** 2;
      const vacuumVelocity = -gravity * elapsedSeconds;

      // The small allowance is for the field's documented aerodynamic drag.
      expect(atFourTenths.position.y).toBeCloseTo(vacuumHeight, 1);
      expect(atFourTenths.position.y).toBeGreaterThan(vacuumHeight);
      expect(atFourTenths.linearVelocity.y).toBeLessThan(0);
      expect(atFourTenths.linearVelocity.y).toBeGreaterThan(vacuumVelocity - 0.15);

      let lastDescending = atFourTenths;
      let firstAscending: typeof atFourTenths | undefined;
      for (let step = 0; step < 40; step += 1) {
        world.step(1);
        const current = world.observe().elements[0]!;
        if (current.linearVelocity.y >= 0) {
          firstAscending = current;
          break;
        }
        lastDescending = current;
      }

      expect(lastDescending.linearVelocity.y).toBeLessThan(0);
      expect(firstAscending).toBeDefined();
      expect(firstAscending!.linearVelocity.y).toBeGreaterThan(0);
      const verticalEnergyFraction = (firstAscending!.linearVelocity.y / lastDescending.linearVelocity.y) ** 2;
      expect(verticalEnergyFraction).toBeLessThan(0.35);
    } finally {
      world.dispose();
    }
  });

  it("keeps a fired pollen ball on its first ballistic segment after leaving the flywheel", async () => {
    const robot = robotConfiguration();
    const world = await SimulationWorld.create({
      seed: 2,
      field: emptyField([{
        id: "shot-pollen", kind: "pollen", alliance: null,
        position: { x: 2, y: 1, z: 0 }, location: "field",
      }]),
      robots: [{ id: "red-1", alliance: "red", configuration: robot, position: { x: 0, y: 0.105, z: 0 }, heading: 0 }],
    });

    try {
      const motors = Object.fromEntries(robot.motors.map((motor) => [motor.name, { power: 0 }]));
      motors.flywheel = { power: 1 };
      motors[robot.mechanisms!.feeder.motor] = { power: 1 };
      world.enqueue({ robotId: "red-1", tick: 0, sequence: 0, motors, servos: {}, source: "opmode" });
      world.step(60);
      world.placeElement("shot-pollen", { x: -0.17, y: 0.345, z: 0 });
      world.step(1);
      const atLaunch = world.observe().elements.find((element) => element.id === "shot-pollen")!;
      expect(atLaunch.linearVelocity.x).toBeGreaterThan(1.5);
      expect(atLaunch.linearVelocity.y).toBeGreaterThan(0);

      world.setPowered(false);
      const flightSeconds = 3 * 0.005;
      world.step(3);
      const inFlight = world.observe().elements.find((element) => element.id === "shot-pollen")!;
      const ballisticX = atLaunch.position.x + atLaunch.linearVelocity.x * flightSeconds;
      const ballisticY = atLaunch.position.y + atLaunch.linearVelocity.y * flightSeconds
        - 0.5 * 9.80665 * flightSeconds ** 2;

      // Air drag is small over 15 ms. A large deviation indicates a chassis/mechanism collision.
      expect(inFlight.position.x).toBeGreaterThan(ballisticX - 0.01);
      expect(inFlight.position.y).toBeCloseTo(ballisticY, 2);
    } finally {
      world.dispose();
    }
  });
});
