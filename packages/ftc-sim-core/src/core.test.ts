import { describe, expect, it } from "vitest";

import {
  DcMotor,
  DcMotorEx,
  DeterministicClock,
  Direction,
  Gamepad,
  HardwareMap,
  HDrive,
  LinearOpMode,
  MecanumDrive,
  OpMode,
  OpModeRunner,
  OpModeState,
  PlanarDriveDynamics,
  RunMode,
  Servo,
  TankDrive,
  Telemetry,
  XDrive,
  ZeroPowerBehavior,
} from "./index";

const wheelRadiusForOneMeterPerSecond = 1 / (2 * Math.PI);

describe("hardware map and deterministic devices", () => {
  it("gets devices by FTC-style name and runtime type", () => {
    const clock = new DeterministicClock(20);
    const motor = new DcMotor(clock);
    const map = new HardwareMap();

    map.put("left_drive", motor);

    expect(map.get(DcMotor, " left_drive ")).toBe(motor);
    expect(map.tryGet(Servo, "left_drive")).toBeUndefined();
    expect(() => map.get(Servo, "left_drive")).toThrow(
      'Unable to find a hardware device with name "left_drive" and type Servo',
    );
  });

  it("integrates motor encoder motion and honors run-to-position", () => {
    const clock = new DeterministicClock(20);
    const motor = new DcMotor(clock, { maxTicksPerSecond: 100 });

    motor.setPower(0.5);
    clock.step(10);
    expect(motor.getCurrentPosition()).toBe(10);

    motor.setMode(RunMode.STOP_AND_RESET_ENCODER);
    expect(motor.getCurrentPosition()).toBe(0);

    motor.setMode(RunMode.RUN_TO_POSITION);
    motor.setTargetPosition(15);
    motor.setPower(1);
    clock.step(20);
    expect(motor.getCurrentPosition()).toBe(15);
    expect(motor.isBusy()).toBe(false);
  });

  it("uses motor direction for physical wheel output while retaining a stable command API", () => {
    const clock = new DeterministicClock(20);
    const motor = new DcMotor(clock, { maxTicksPerSecond: 100 });

    motor.setDirection(Direction.REVERSE);
    motor.setPower(0.5);
    clock.step(10);

    expect(motor.getCurrentPosition()).toBe(10);
    expect(motor.getPhysicalVelocityTicksPerSecond()).toBe(-50);
  });

  it("decelerates a braking wheel across multiple ticks instead of snapping to zero", () => {
    const clock = new DeterministicClock(20);
    const motor = new DcMotor(clock, { maxTicksPerSecond: 100 });

    motor.setPower(1);
    clock.step();
    const poweredVelocity = motor.getPhysicalVelocityTicksPerSecond();
    motor.setPower(0);
    clock.step();
    const firstBrakeTick = motor.getPhysicalVelocityTicksPerSecond();

    expect(poweredVelocity).toBe(100);
    expect(firstBrakeTick).toBeGreaterThan(0);
    expect(firstBrakeTick).toBeLessThan(poweredVelocity);
  });

  it("uses configurable finite powered acceleration, braking, and floating decay", () => {
    const clock = new DeterministicClock(20);
    const motor = new DcMotor(clock, {
      maxTicksPerSecond: 100,
      poweredAccelerationTicksPerSecondSquared: 100,
      brakeDecelerationTicksPerSecondSquared: 50,
      floatDampingPerSecond: 2,
    });

    motor.setPower(1);
    clock.step();
    expect(motor.getPhysicalVelocityTicksPerSecond()).toBeCloseTo(2, 10);

    motor.setPower(0);
    clock.step();
    expect(motor.getPhysicalVelocityTicksPerSecond()).toBeCloseTo(1, 10);

    motor.setPower(1);
    clock.step();
    motor.setZeroPowerBehavior(ZeroPowerBehavior.FLOAT);
    motor.setPower(0);
    clock.step();
    expect(motor.getPhysicalVelocityTicksPerSecond()).toBeCloseTo(3 * Math.exp(-0.04), 10);
  });

  it("rejects non-positive or non-finite motor dynamics settings", () => {
    const clock = new DeterministicClock(20);
    expect(() => new DcMotor(clock, { poweredAccelerationTicksPerSecondSquared: 0 })).toThrow(RangeError);
    expect(() => new DcMotor(clock, { brakeDecelerationTicksPerSecondSquared: Number.NaN })).toThrow(RangeError);
  });

  it("provides velocity and current extensions on DcMotorEx", () => {
    const clock = new DeterministicClock(20);
    const motor = new DcMotorEx(clock, { maxTicksPerSecond: 100, stallCurrentAmps: 8 });

    motor.setMode(RunMode.RUN_USING_ENCODER);
    motor.setVelocity(40);
    clock.step(25);

    expect(motor.getVelocity()).toBeCloseTo(40, 5);
    expect(motor.getCurrent()).toBeGreaterThan(0);
    motor.setPower(1);
    clock.step();
    expect(motor.getVelocity()).toBeCloseTo(100, 5);
    motor.setCurrentAlert(0.1);
    expect(motor.isOverCurrent()).toBe(true);
  });

  it("advances physical servo position on the deterministic clock", () => {
    const clock = new DeterministicClock(20);
    const servo = new Servo(clock, { maxSpeedPerSecond: 1 });

    servo.setPosition(1);
    clock.step(10);

    expect(servo.getPosition()).toBe(1);
    expect(servo.getPhysicalPosition()).toBeCloseTo(0.2, 5);

    servo.scaleRange(0.25, 0.75);
    servo.setPosition(1);
    clock.step(40);
    expect(servo.getPhysicalPosition()).toBeCloseTo(0.75, 5);
  });
});

describe("FTC-style operator inputs and telemetry", () => {
  it("normalizes gamepad values and exposes consumable edge detection", () => {
    const gamepad = new Gamepad();

    gamepad.setState({ left_stick_x: 2, left_trigger: -1, a: true });
    expect(gamepad.left_stick_x).toBe(1);
    expect(gamepad.left_trigger).toBe(0);
    expect(gamepad.aWasPressed()).toBe(true);
    expect(gamepad.aWasPressed()).toBe(false);

    gamepad.setState({ a: false });
    expect(gamepad.aWasReleased()).toBe(true);
  });

  it("publishes deterministic telemetry frames", () => {
    const clock = new DeterministicClock(20);
    const telemetry = new Telemetry(clock);

    telemetry.addData("motor", "%.2f", 0.5);
    telemetry.addData("status", "ready");

    expect(telemetry.update()).toBe(true);
    expect(telemetry.getLatestFrame()).toMatchObject({
      timestampMs: 0,
      data: [
        { caption: "motor", value: "0.50" },
        { caption: "status", value: "ready" },
      ],
    });
  });
});

describe("OpMode lifecycle", () => {
  it("runs the iterative init/start/loop/stop state machine", async () => {
    class Recorder extends OpMode {
      readonly calls: string[] = [];

      init(): void {
        this.calls.push("init");
      }

      init_loop(): void {
        this.calls.push("initLoop");
      }

      start(): void {
        this.calls.push("start");
      }

      loop(): void {
        this.calls.push("loop");
      }

      stop(): void {
        this.calls.push("stop");
      }
    }

    const clock = new DeterministicClock(20);
    const runner = new OpModeRunner({ clock });
    const mode = new Recorder();

    runner.load(mode);
    await runner.init();
    await runner.tick();
    await runner.start();
    await runner.tick(2);
    await runner.stop();

    expect(runner.state).toBe(OpModeState.STOPPED);
    expect(mode.calls).toEqual(["init", "initLoop", "start", "loop", "loop", "stop"]);
    expect(mode.getRuntime()).toBeCloseTo(0.04, 5);
  });

  it("lets a linear OpMode wait for start and deterministic sleep", async () => {
    class LinearRecorder extends LinearOpMode {
      readonly calls: string[] = [];

      async runOpMode(): Promise<void> {
        this.calls.push("created");
        await this.waitForStart();
        if (!this.opModeIsActive()) return;
        this.calls.push("started");
        await this.sleep(40);
        if (this.opModeIsActive()) this.calls.push("awake");
      }
    }

    const clock = new DeterministicClock(20);
    const runner = new OpModeRunner({ clock });
    const mode = new LinearRecorder();

    runner.load(mode);
    await runner.init();
    await Promise.resolve();
    expect(mode.calls).toEqual(["created"]);

    await runner.start();
    await Promise.resolve();
    expect(mode.calls).toEqual(["created", "started"]);

    await runner.tick(2);
    await Promise.resolve();
    expect(mode.calls).toEqual(["created", "started", "awake"]);
  });
});

describe("drivetrain kinematics", () => {
  function motor(clock: DeterministicClock): DcMotor {
    return new DcMotor(clock, { maxTicksPerSecond: 100 });
  }

  it("moves tank drive forward and turns from differential wheel speed", () => {
    const clock = new DeterministicClock(20);
    const left = motor(clock);
    const right = motor(clock);
    const drive = new TankDrive(clock, { left, right, trackWidthMeters: 0.5, wheelRadiusMeters: wheelRadiusForOneMeterPerSecond, ticksPerRevolution: 100 });

    left.setPower(1);
    right.setPower(1);
    clock.step(50);
    expect(drive.pose.xMeters).toBeCloseTo(1, 4);
    expect(drive.pose.yMeters).toBeCloseTo(0, 4);

    left.setPower(-1);
    right.setPower(1);
    clock.step(5);
    expect(drive.pose.headingRadians).toBeGreaterThan(0);
  });

  it("strafes an ideal mecanum and X-drive from the standard wheel pattern", () => {
    const mecanumClock = new DeterministicClock(20);
    const mecanum = new MecanumDrive(mecanumClock, {
      frontLeft: motor(mecanumClock),
      frontRight: motor(mecanumClock),
      backLeft: motor(mecanumClock),
      backRight: motor(mecanumClock),
      wheelBaseMeters: 0.4,
      trackWidthMeters: 0.4,
      wheelRadiusMeters: wheelRadiusForOneMeterPerSecond,
      ticksPerRevolution: 100,
    });
    mecanum.frontLeft.setPower(-1);
    mecanum.frontRight.setPower(1);
    mecanum.backLeft.setPower(1);
    mecanum.backRight.setPower(-1);
    mecanumClock.step(50);
    expect(mecanum.pose.yMeters).toBeCloseTo(1, 4);

    const xClock = new DeterministicClock(20);
    const xDrive = new XDrive(xClock, {
      frontLeft: motor(xClock),
      frontRight: motor(xClock),
      backLeft: motor(xClock),
      backRight: motor(xClock),
      wheelBaseMeters: 0.4,
      trackWidthMeters: 0.4,
      wheelRadiusMeters: wheelRadiusForOneMeterPerSecond,
      ticksPerRevolution: 100,
    });
    xDrive.frontLeft.setPower(-1);
    xDrive.frontRight.setPower(1);
    xDrive.backLeft.setPower(1);
    xDrive.backRight.setPower(-1);
    xClock.step(50);
    expect(xDrive.pose.yMeters).toBeCloseTo(1, 4);
  });

  it("exposes mecanum wheel angular velocity signs for forward, strafe, and turn", () => {
    const clock = new DeterministicClock(20);
    const drive = new MecanumDrive(clock, {
      frontLeft: motor(clock),
      frontRight: motor(clock),
      backLeft: motor(clock),
      backRight: motor(clock),
      wheelBaseMeters: 0.4,
      trackWidthMeters: 0.4,
      wheelRadiusMeters: wheelRadiusForOneMeterPerSecond,
      ticksPerRevolution: 100,
    });

    drive.setChassisVelocity(1, 0, 0);
    clock.step();
    expect(Object.values(drive.getWheelAngularVelocities()).map(Math.sign)).toEqual([1, 1, 1, 1]);

    drive.setChassisVelocity(0, 1, 0);
    clock.step();
    expect(Object.values(drive.getWheelAngularVelocities()).map(Math.sign)).toEqual([-1, 1, 1, -1]);

    drive.setChassisVelocity(0, 0, 1);
    clock.step();
    expect(Object.values(drive.getWheelAngularVelocities()).map(Math.sign)).toEqual([-1, 1, -1, 1]);
  });

  it("uses the center wheel for H-drive strafe", () => {
    const clock = new DeterministicClock(20);
    const center = motor(clock);
    const drive = new HDrive(clock, {
      left: motor(clock),
      right: motor(clock),
      center,
      trackWidthMeters: 0.5,
      wheelRadiusMeters: wheelRadiusForOneMeterPerSecond,
      ticksPerRevolution: 100,
    });

    center.setPower(1);
    clock.step(50);

    expect(drive.pose.xMeters).toBeCloseTo(0, 4);
    expect(drive.pose.yMeters).toBeCloseTo(1, 4);
  });
});

describe("force-driven planar drivetrain dynamics", () => {
  const config = {
    massKg: 15,
    yawMomentOfInertiaKgMetersSquared: 0.5,
    maxLinearAccelerationMetersPerSecondSquared: 4.5,
    maxLinearBrakeDecelerationMetersPerSecondSquared: 6,
    coastDecelerationMetersPerSecondSquared: 0.4,
    maxLinearJerkMetersPerSecondCubed: 18,
    maxAngularAccelerationRadiansPerSecondSquared: 12,
    maxAngularBrakeDecelerationRadiansPerSecondSquared: 16,
    coastAngularDecelerationRadiansPerSecondSquared: 1.2,
    maxAngularJerkRadiansPerSecondCubed: 48,
    velocityGainPerSecond: 8,
    angularVelocityGainPerSecond: 9,
  } as const;

  function runForwardResponse(
    dynamics: PlanarDriveDynamics,
    targetMetersPerSecond: number,
    seconds: number,
    initialVelocity = 0,
    idleBehavior: "brake" | "coast" = "brake",
  ) {
    const deltaSeconds = 0.02;
    let velocity = initialVelocity;
    let distance = 0;
    let previousAcceleration = dynamics.getAcceleration().xMetersPerSecondSquared;
    let peakJerk = 0;

    for (let elapsed = 0; elapsed < seconds - Number.EPSILON; elapsed += deltaSeconds) {
      const output = dynamics.step({
        targetVelocity: {
          xMetersPerSecond: targetMetersPerSecond,
          yMetersPerSecond: 0,
          angularRadiansPerSecond: 0,
        },
        currentVelocity: {
          xMetersPerSecond: velocity,
          yMetersPerSecond: 0,
          angularRadiansPerSecond: 0,
        },
        deltaSeconds,
        idleBehavior,
      });
      const acceleration = output.acceleration.xMetersPerSecondSquared;
      peakJerk = Math.max(peakJerk, Math.abs(acceleration - previousAcceleration) / deltaSeconds);
      previousAcceleration = acceleration;
      velocity += acceleration * deltaSeconds;
      distance += velocity * deltaSeconds;
    }

    return { velocity, distance, peakJerk };
  }

  it("reaches a realistic FTC top speed with force output and bounded jerk", () => {
    const dynamics = new PlanarDriveDynamics(config);
    const response = runForwardResponse(dynamics, 2.8, 2.5);

    expect(response.velocity).toBeGreaterThanOrEqual(2.65);
    expect(response.velocity).toBeLessThanOrEqual(2.9);
    expect(response.distance).toBeGreaterThan(5);
    expect(response.peakJerk).toBeLessThanOrEqual(config.maxLinearJerkMetersPerSecondCubed + 1e-9);

    const output = dynamics.step({
      targetVelocity: { xMetersPerSecond: 2.8, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      currentVelocity: { xMetersPerSecond: response.velocity, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      deltaSeconds: 0.02,
      idleBehavior: "brake",
    });
    expect(output.force.xNewtons).toBeCloseTo(output.acceleration.xMetersPerSecondSquared * config.massKg, 10);
  });

  it("brakes faster than it coasts without reversing velocity", () => {
    const brakingDynamics = new PlanarDriveDynamics(config);
    const coastingDynamics = new PlanarDriveDynamics(config);
    const acceleratedBrake = runForwardResponse(brakingDynamics, 2.8, 1);
    const acceleratedCoast = runForwardResponse(coastingDynamics, 2.8, 1);

    const braked = runForwardResponse(brakingDynamics, 0, 1, acceleratedBrake.velocity, "brake");
    const coasted = runForwardResponse(coastingDynamics, 0, 1, acceleratedCoast.velocity, "coast");

    expect(braked.velocity).toBeGreaterThanOrEqual(-0.01);
    expect(braked.velocity).toBeLessThan(0.12);
    expect(coasted.velocity).toBeGreaterThan(braked.velocity + 0.8);
  });

  it("blends BRAKE and FLOAT per chassis axis for mixed wheel configurations", () => {
    const dynamics = new PlanarDriveDynamics({
      ...config,
      maxLinearBrakeJerkMetersPerSecondCubed: 10_000,
      maxAngularBrakeJerkRadiansPerSecondCubed: 10_000,
    });
    const output = dynamics.step({
      targetVelocity: { xMetersPerSecond: 0, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      currentVelocity: { xMetersPerSecond: 2, yMetersPerSecond: 2, angularRadiansPerSecond: 2 },
      deltaSeconds: 0.02,
      idleBehavior: { forward: 1, lateral: 0, angular: 0.5 },
    });

    expect(Math.abs(output.acceleration.xMetersPerSecondSquared)).toBeGreaterThan(
      Math.abs(output.acceleration.yMetersPerSecondSquared) * 3,
    );
    expect(output.acceleration.angularRadiansPerSecondSquared).toBeLessThan(-1.2);
    expect(output.acceleration.angularRadiansPerSecondSquared).toBeGreaterThan(-16);
  });

  it("drops drive force promptly when the driver releases the stick", () => {
    const dynamics = new PlanarDriveDynamics(config);
    const accelerated = runForwardResponse(dynamics, 2.8, 0.5);
    const releaseVelocity = accelerated.velocity;
    let velocity = releaseVelocity;
    let peakVelocity = velocity;

    for (let elapsed = 0; elapsed < 0.3; elapsed += 0.02) {
      const output = dynamics.step({
        targetVelocity: { xMetersPerSecond: 0, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
        currentVelocity: { xMetersPerSecond: velocity, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
        deltaSeconds: 0.02,
        idleBehavior: "brake",
      });
      velocity += output.acceleration.xMetersPerSecondSquared * 0.02;
      peakVelocity = Math.max(peakVelocity, velocity);
    }

    expect(peakVelocity).toBeLessThanOrEqual(releaseVelocity + 0.1);
    expect(velocity).toBeLessThan(releaseVelocity);
  });

  it("uses moment of inertia to turn angular acceleration into torque", () => {
    const dynamics = new PlanarDriveDynamics(config);
    const output = dynamics.step({
      targetVelocity: { xMetersPerSecond: 0, yMetersPerSecond: 0, angularRadiansPerSecond: 3 },
      currentVelocity: { xMetersPerSecond: 0, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      deltaSeconds: 0.02,
      idleBehavior: "brake",
    });

    expect(output.torqueNewtonMeters).toBeCloseTo(
      output.acceleration.angularRadiansPerSecondSquared * config.yawMomentOfInertiaKgMetersSquared,
      10,
    );
  });

  it("caps planar traction at coefficient times normal force", () => {
    const massKg = 20;
    const tractionCoefficient = 0.2;
    const gravityMetersPerSecondSquared = 9.81;
    const dynamics = new PlanarDriveDynamics({
      massKg,
      maxLinearAccelerationMetersPerSecondSquared: 100,
      maxLinearJerkMetersPerSecondCubed: 10_000,
      maxDriveForceNewtons: 10_000,
      tractionCoefficient,
      gravityMetersPerSecondSquared,
    });
    const output = dynamics.step({
      targetVelocity: { xMetersPerSecond: 100, yMetersPerSecond: 100, angularRadiansPerSecond: 0 },
      currentVelocity: { xMetersPerSecond: 0, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      deltaSeconds: 0.02,
    });

    const expectedTractionLimit = tractionCoefficient * massKg * gravityMetersPerSecondSquared;
    expect(Math.hypot(output.force.xNewtons, output.force.yNewtons)).toBeCloseTo(expectedTractionLimit, 10);
    expect(Math.hypot(
      output.acceleration.xMetersPerSecondSquared,
      output.acceleration.yMetersPerSecondSquared,
    )).toBeCloseTo(tractionCoefficient * gravityMetersPerSecondSquared, 10);
  });

  it("uses floor grip to cap yaw traction", () => {
    const massKg = 20;
    const tractionCoefficient = 0.1;
    const gravityMetersPerSecondSquared = 10;
    const tractionYawRadiusMeters = 0.25;
    const dynamics = new PlanarDriveDynamics({
      massKg,
      yawMomentOfInertiaKgMetersSquared: 2,
      maxAngularAccelerationRadiansPerSecondSquared: 100,
      maxAngularJerkRadiansPerSecondCubed: 10_000,
      tractionCoefficient,
      gravityMetersPerSecondSquared,
      tractionYawRadiusMeters,
    });
    const output = dynamics.step({
      targetVelocity: { xMetersPerSecond: 0, yMetersPerSecond: 0, angularRadiansPerSecond: 100 },
      currentVelocity: { xMetersPerSecond: 0, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      deltaSeconds: 0.02,
    });

    const forceBudget = tractionCoefficient * massKg * gravityMetersPerSecondSquared;
    expect(Math.abs(output.torqueNewtonMeters)).toBeCloseTo(forceBudget * tractionYawRadiusMeters, 10);
  });

  it("shares one traction budget between translation and yaw", () => {
    const massKg = 20;
    const tractionCoefficient = 0.2;
    const gravityMetersPerSecondSquared = 10;
    const tractionYawRadiusMeters = 0.25;
    const dynamics = new PlanarDriveDynamics({
      massKg,
      yawMomentOfInertiaKgMetersSquared: 2,
      maxLinearAccelerationMetersPerSecondSquared: 100,
      maxLinearJerkMetersPerSecondCubed: 10_000,
      maxAngularAccelerationRadiansPerSecondSquared: 100,
      maxAngularJerkRadiansPerSecondCubed: 10_000,
      maxDriveForceNewtons: 10_000,
      tractionCoefficient,
      gravityMetersPerSecondSquared,
      tractionYawRadiusMeters,
    });
    const output = dynamics.step({
      targetVelocity: { xMetersPerSecond: 100, yMetersPerSecond: 0, angularRadiansPerSecond: 100 },
      currentVelocity: { xMetersPerSecond: 0, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      deltaSeconds: 0.02,
    });

    const forceBudget = tractionCoefficient * massKg * gravityMetersPerSecondSquared;
    const normalizedUsage = Math.hypot(
      Math.hypot(output.force.xNewtons, output.force.yNewtons) / forceBudget,
      Math.abs(output.torqueNewtonMeters) / (forceBudget * tractionYawRadiusMeters),
    );
    expect(normalizedUsage).toBeCloseTo(1, 10);
  });

  it("makes a heavier robot accelerate less under the same finite drive force", () => {
    const commonConfig = {
      maxLinearAccelerationMetersPerSecondSquared: 100,
      maxLinearJerkMetersPerSecondCubed: 10_000,
      maxDriveForceNewtons: 60,
      tractionCoefficient: 10,
    } as const;
    const light = new PlanarDriveDynamics({ ...commonConfig, massKg: 10 });
    const heavy = new PlanarDriveDynamics({ ...commonConfig, massKg: 20 });
    const input = {
      targetVelocity: { xMetersPerSecond: 100, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      currentVelocity: { xMetersPerSecond: 0, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      deltaSeconds: 0.02,
    } as const;

    const lightOutput = light.step(input);
    const heavyOutput = heavy.step(input);
    expect(lightOutput.force.xNewtons).toBeCloseTo(60, 10);
    expect(heavyOutput.force.xNewtons).toBeCloseTo(60, 10);
    expect(lightOutput.acceleration.xMetersPerSecondSquared).toBeCloseTo(6, 10);
    expect(heavyOutput.acceleration.xMetersPerSecondSquared).toBeCloseTo(3, 10);
  });

  it("supports separate forward and lateral coasting resistance with a legacy isotropic fallback", () => {
    const input = {
      targetVelocity: { xMetersPerSecond: 0, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      currentVelocity: { xMetersPerSecond: 1, yMetersPerSecond: 1, angularRadiansPerSecond: 0 },
      deltaSeconds: 0.02,
      idleBehavior: "coast",
    } as const;
    const directional = new PlanarDriveDynamics({
      coastForwardDecelerationMetersPerSecondSquared: 0.2,
      coastLateralDecelerationMetersPerSecondSquared: 1.1,
      maxLinearBrakeJerkMetersPerSecondCubed: 10_000,
    }).step(input);
    const legacy = new PlanarDriveDynamics({
      coastDecelerationMetersPerSecondSquared: 0.7,
      maxLinearBrakeJerkMetersPerSecondCubed: 10_000,
    }).step(input);

    expect(directional.acceleration.xMetersPerSecondSquared).toBeCloseTo(-0.2, 10);
    expect(directional.acceleration.yMetersPerSecondSquared).toBeCloseTo(-1.1, 10);
    expect(legacy.acceleration.xMetersPerSecondSquared).toBeCloseTo(-0.7, 10);
    expect(legacy.acceleration.yMetersPerSecondSquared).toBeCloseTo(-0.7, 10);
  });

  it("rejects invalid traction, force, coast, gravity, and brake-jerk tuning", () => {
    expect(() => new PlanarDriveDynamics({ tractionCoefficient: 0 })).toThrow(RangeError);
    expect(() => new PlanarDriveDynamics({ gravityMetersPerSecondSquared: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => new PlanarDriveDynamics({ tractionYawRadiusMeters: 0 })).toThrow(RangeError);
    expect(() => new PlanarDriveDynamics({ maxDriveForceNewtons: -1 })).toThrow(RangeError);
    expect(() => new PlanarDriveDynamics({ maxBrakeForceNewtons: Number.NaN })).toThrow(RangeError);
    expect(() => new PlanarDriveDynamics({ coastForwardDecelerationMetersPerSecondSquared: 0 })).toThrow(RangeError);
    expect(() => new PlanarDriveDynamics({ coastLateralDecelerationMetersPerSecondSquared: -0.1 })).toThrow(RangeError);
    expect(() => new PlanarDriveDynamics({ maxLinearBrakeJerkMetersPerSecondCubed: 0 })).toThrow(RangeError);
    expect(() => new PlanarDriveDynamics({ maxAngularBrakeJerkRadiansPerSecondCubed: Number.NaN })).toThrow(RangeError);
    const dynamics = new PlanarDriveDynamics();
    expect(() => dynamics.step({
      targetVelocity: { xMetersPerSecond: 0, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      currentVelocity: { xMetersPerSecond: 1, yMetersPerSecond: 0, angularRadiansPerSecond: 0 },
      deltaSeconds: 0.02,
      idleBehavior: { forward: 1.1, lateral: 0, angular: 0 },
    })).toThrow(RangeError);
  });
});
