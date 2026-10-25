import { describe, expect, it } from "vitest";
import { createBiobuzzAllRounder, validateWorldRobotConfiguration } from "./robot-presets.js";

type Axis = { x: number; y: number; z: number };

function setLiftAxis(robot: ReturnType<typeof createBiobuzzAllRounder>, axis: Axis): void {
  robot.mechanisms!.lift.axis = axis;
}

function liftAxis(robot: ReturnType<typeof createBiobuzzAllRounder>): Axis | undefined {
  return robot.mechanisms!.lift.axis;
}

describe("robot configuration acceptance", () => {
  it("keeps the default BIOBUZZ preset legal within the controller and travel limits", () => {
    const configuration = createBiobuzzAllRounder();

    expect(configuration.motors).toHaveLength(8);
    expect(configuration.servos).toHaveLength(3);
    expect(configuration.id).toBe("biobuzz-all-rounder-v4");
    expect(configuration.mechanisms!.shooter.turretMotor).toBe("turret");
    expect(configuration.mechanisms!.feeder.motor).toBe(configuration.mechanisms!.intake.motor);
    expect(configuration.mechanisms!.intake.mount.z).toBe(0.012);
    expect(liftAxis(configuration)).toEqual({ x: 0.25, y: Math.sqrt(0.9375), z: 0 });
    expect(configuration.mechanisms!.lift.maximumTravel).toBe(0.61);
    expect(validateWorldRobotConfiguration(configuration)).toEqual([]);
  });

  it("keeps saved lift configurations without an axis vertical", () => {
    const configuration = createBiobuzzAllRounder();
    delete configuration.mechanisms!.lift.axis;

    expect(validateWorldRobotConfiguration(configuration)).toEqual([]);
  });

  it("requires an explicit lift axis to be finite, unit length, and upward", () => {
    const invalidAxes: Array<{ axis: Axis; message: string }> = [
      { axis: { x: 0.28, y: 0.95, z: 0 }, message: "unit vector" },
      { axis: { x: 0, y: 0, z: 1 }, message: "positive Y" },
      { axis: { x: 0, y: -1, z: 0 }, message: "positive Y" },
      { axis: { x: Number.NaN, y: 1, z: 0 }, message: "finite" },
    ];

    for (const invalid of invalidAxes) {
      const configuration = createBiobuzzAllRounder();
      setLiftAxis(configuration, invalid.axis);
      expect(validateWorldRobotConfiguration(configuration).some((error) => error.includes(invalid.message))).toBe(true);
    }
  });

  it("reports every dangling configured motor and servo reference", () => {
    const badMotorReferences = [
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.wheels[0]!.motor = "missing-wheel-motor"; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.intake.motor = "missing-intake-motor"; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.feeder.motor = "missing-feeder-motor"; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.shooter.motor = "missing-shooter-motor"; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.lift.motor = "missing-lift-motor"; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.shooter.turretMotor = "missing-turret-motor"; },
    ];
    const badServoReferences = [
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.shooter.turretServo = "missing-turret"; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.shooter.hoodServo = "missing-hood"; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.lift.releaseServo = "missing-release"; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.gate.servo = "missing-gate"; },
    ];

    for (const corrupt of badMotorReferences) {
      const configuration = createBiobuzzAllRounder();
      corrupt(configuration);
      expect(validateWorldRobotConfiguration(configuration).some((error) => error.includes("missing"))).toBe(true);
    }
    for (const corrupt of badServoReferences) {
      const configuration = createBiobuzzAllRounder();
      corrupt(configuration);
      expect(validateWorldRobotConfiguration(configuration).some((error) => error.includes("missing"))).toBe(true);
    }
  });

  it("rejects non-finite physical values and out-of-range servo travel", () => {
    const nonFinite = createBiobuzzAllRounder();
    nonFinite.motors[0]!.reduction = Number.NaN;
    nonFinite.sensors[0]!.mount.position.x = Number.POSITIVE_INFINITY;
    nonFinite.battery.internalResistanceOhms = Number.NEGATIVE_INFINITY;
    expect(validateWorldRobotConfiguration(nonFinite).some((error) => error.includes("finite"))).toBe(true);

    const invalidTravel = createBiobuzzAllRounder();
    invalidTravel.servos[0]!.minRadians = 0.4;
    invalidTravel.servos[0]!.maxRadians = 0.3;
    expect(validateWorldRobotConfiguration(invalidTravel).some((error) => error.includes("minimum travel"))).toBe(true);
  });

  it("does not invent competition caps for robot mass or motor speed", () => {
    const configuration = createBiobuzzAllRounder();
    configuration.chassis.massKg = 35;
    configuration.motors[0]!.profile.freeSpeedRpm = 6000;

    expect(validateWorldRobotConfiguration(configuration)).toEqual([]);
  });

  it("checks the chassis against the three-dimensional 18-inch starting envelope", () => {
    const configuration = createBiobuzzAllRounder();
    configuration.chassis.size.y = 0.4573;

    expect(validateWorldRobotConfiguration(configuration).some((error) => error.includes("18-inch starting envelope"))).toBe(true);
    expect(configuration.chassis.size.y).toBe(0.4573);
  });

  it("includes fixed wheel radius and mount in the starting envelope", () => {
    const wheelOutsideStartBox = createBiobuzzAllRounder();
    wheelOutsideStartBox.wheels[0]!.mount.z = 0.25;
    wheelOutsideStartBox.wheels[0]!.radius = 0.05;
    expect(validateWorldRobotConfiguration(wheelOutsideStartBox).some((error) => error.includes("18-inch starting envelope"))).toBe(true);
  });
  it("uses imported wheel thickness and axle direction without relaxing the start envelope", () => {
    const configuration = createBiobuzzAllRounder();
    const wheel = configuration.wheels[0]!;
    wheel.mount.z = -.212; wheel.width = .022; wheel.axle = { x: 0, y: 0, z: 1 };
    expect(validateWorldRobotConfiguration(configuration)).toEqual([]);
    wheel.width = .1;
    expect(validateWorldRobotConfiguration(configuration).some((message) => message.includes("18-inch starting envelope"))).toBe(true);
    wheel.axle = { x: 0, y: 0, z: 0 };
    expect(validateWorldRobotConfiguration(configuration).some((message) => message.includes("unit vector"))).toBe(true);
  });

  it("includes all sensor and camera mounts in the 18-inch starting volume", () => {
    const sensorOutsideStartBox = createBiobuzzAllRounder();
    sensorOutsideStartBox.sensors[0]!.mount.position.y = 0.4;
    expect(validateWorldRobotConfiguration(sensorOutsideStartBox).some((error) => error.includes("18-inch starting envelope"))).toBe(true);

    const cameraOutsideStartBox = createBiobuzzAllRounder();
    cameraOutsideStartBox.cameras[0]!.mount.position.y = 0.4;
    expect(validateWorldRobotConfiguration(cameraOutsideStartBox).some((error) => error.includes("18-inch starting envelope"))).toBe(true);
  });

  it("keeps mechanisms legal at their stowed start pose while allowing lift travel during play", () => {
    const configuration = createBiobuzzAllRounder();
    delete configuration.mechanisms!.lift.axis;
    configuration.mechanisms!.lift.maximumTravel = 0.62;

    expect(validateWorldRobotConfiguration(configuration)).toEqual([]);
  });

  it("includes each stowed mechanism in the 18-inch starting envelope", () => {
    const outsideStart = [
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.intake.mount.y = 0.4; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.storage.mount.x = 0.2; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.shooter.mount.y = 0.42; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.lift.mount.y = 0.38; robot.mechanisms!.lift.maximumTravel = 0; },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => { robot.mechanisms!.lift.mount.y = 0.35; robot.mechanisms!.lift.maximumTravel = 0; },
    ];

    for (const configureOutsideStart of outsideStart) {
      const configuration = createBiobuzzAllRounder();
      configureOutsideStart(configuration);
      expect(validateWorldRobotConfiguration(configuration).some((error) => error.includes("18-inch starting envelope"))).toBe(true);
    }
  });

  it("includes the rotated manufactured ramp and chute box corners in the start bounds", () => {
    const rotatedRampOutsideStart = createBiobuzzAllRounder();
    rotatedRampOutsideStart.mechanisms!.intake.mount.x = -0.199;
    expect(validateWorldRobotConfiguration(rotatedRampOutsideStart).some((error) => error.includes("18-inch starting envelope"))).toBe(true);

    const chuteOutsideStart = createBiobuzzAllRounder();
    chuteOutsideStart.mechanisms!.shooter.mount.x = -0.12;
    expect(validateWorldRobotConfiguration(chuteOutsideStart).some((error) => error.includes("18-inch starting envelope"))).toBe(true);
  });

  it("rejects a storage channel offset or width that leaves a manufactured side rail zero-width", () => {
    const zeroWidthRail = createBiobuzzAllRounder();
    zeroWidthRail.mechanisms!.storage.mount.z = zeroWidthRail.chassis.size.z / 2 - zeroWidthRail.mechanisms!.storage.width / 2;
    expect(validateWorldRobotConfiguration(zeroWidthRail).some((error) => error.includes("positive width for both manufactured side rails"))).toBe(true);

    const channelOutsideChassis = createBiobuzzAllRounder();
    channelOutsideChassis.mechanisms!.storage.mount.z = 0.18;
    expect(validateWorldRobotConfiguration(channelOutsideChassis).some((error) => error.includes("positive width for both manufactured side rails"))).toBe(true);
  });

  it("rejects shooter compression that collapses the wheel's effective radius", () => {
    const configuration = createBiobuzzAllRounder();
    configuration.mechanisms!.shooter.compression = configuration.mechanisms!.shooter.wheelRadius;

    expect(validateWorldRobotConfiguration(configuration).some((error) => error.includes("effective radius positive"))).toBe(true);
  });

  it("measures expanded footprint from each mechanism mount and its physical size", () => {
    const cases = [
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => {
        robot.mechanisms!.intake.mount.x = 0.38;
        robot.mechanisms!.intake.radius = 0.04;
      },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => {
        robot.mechanisms!.storage.mount.x = 0.25;
        robot.mechanisms!.storage.length = 0.45;
      },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => {
        robot.mechanisms!.shooter.mount.x = 0.37;
        robot.mechanisms!.shooter.wheelRadius = 0.04;
      },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => {
        robot.mechanisms!.lift.mount.x = 0.38;
      },
      (robot: ReturnType<typeof createBiobuzzAllRounder>) => {
        robot.wheels[0]!.mount.x = 0.38;
        robot.wheels[0]!.radius = 0.08;
      },
    ];

    for (const extendMechanism of cases) {
      const configuration = createBiobuzzAllRounder();
      extendMechanism(configuration);
      expect(validateWorldRobotConfiguration(configuration).some((error) => error.includes("expanded envelope"))).toBe(true);
    }
  });

  it("includes lift mounting height, travel, and carriage geometry in the expanded height", () => {
    const configuration = createBiobuzzAllRounder();
    configuration.mechanisms!.lift.mount.y = 0.12;
    configuration.mechanisms!.lift.maximumTravel = 0.62;

    expect(validateWorldRobotConfiguration(configuration).some((error) => error.includes("29 inches"))).toBe(true);
  });

  it("measures the lift tray to its rim without counting a carried scoring element as robot height", () => {
    const configuration = createBiobuzzAllRounder();
    delete configuration.mechanisms!.lift.axis;
    configuration.mechanisms!.lift.maximumTravel = 0.655;

    expect(validateWorldRobotConfiguration(configuration)).toEqual([]);
    expect(validateWorldRobotConfiguration(configuration).some((error) => error.includes("18-inch starting envelope"))).toBe(false);
  });

  it("uses the tilted rail travel when checking the expanded horizontal footprint", () => {
    const configuration = createBiobuzzAllRounder();
    setLiftAxis(configuration, { x: 0.5, y: Math.sqrt(0.75), z: 0 });

    expect(validateWorldRobotConfiguration(configuration).some((error) => error.includes("expanded envelope"))).toBe(true);
  });

  it("checks every reachable tray tilt against expanded bounds, including intermediate angles", () => {
    const configuration = createBiobuzzAllRounder();
    configuration.mechanisms!.lift.maximumTravel = 0.63;

    // At the stowed servo angle the robot remains inside its start box. Near 22°,
    // the angled front rim's rotated corner extends the 24-inch footprint limit.
    expect(validateWorldRobotConfiguration(configuration).some((error) => error.includes("expanded envelope"))).toBe(true);
  });
});
