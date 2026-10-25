import type { WorldRobotConfiguration, WorldRobotState, WheelConfiguration } from "../../packages/ftc-sim-core/src/world-types";
import { robotTurretAngle } from "@ftc-studio/sim-core";

export interface RobotVisualState {
  wheelAngles: number[];
  turretAngle: number;
  hoodAngle: number;
  intakeAngle: number;
  feederAngle: number;
  flywheelAngle: number;
  liftHeight: number;
  releaseAngle: number;
  gateAngle: number;
}

const motorOutputAngle = (configuration: WorldRobotConfiguration, state: WorldRobotState | undefined, name: string | undefined): number => {
  if (!name) return 0;
  const motor = configuration.motors.find((candidate) => candidate.name === name);
  const shaftAngle = state?.motors[name]?.positionRadians;
  return motor && shaftAngle !== undefined ? shaftAngle / motor.reduction : 0;
};

/** Any wheel constrained to lateral travel has a local +X axle, wherever it is mounted. */
export function isLateralWheel(wheel: WheelConfiguration): boolean {
  return Math.abs(Math.sin(wheel.tractionAngle)) > 1 - 1e-6
    && Math.abs(Math.cos(wheel.tractionAngle)) < 1e-6;
}

function servoAngle(configuration: WorldRobotConfiguration, state: WorldRobotState | undefined, name: string | undefined): number {
  if (!name) return 0;
  const servo = configuration.servos.find((candidate) => candidate.name === name);
  if (!servo) return 0;
  const observed = state?.servos[name]?.angle;
  if (observed !== undefined) return observed;
  // SimulationWorld initializes the literal "turret" servo at travel midpoint;
  // other servo shafts start at their configured minimum, including renamed turrets.
  return servo.name === "turret" ? (servo.minRadians + servo.maxRadians) / 2 : servo.minRadians;
}

/** Map observed physical shafts and absolute servo angles to renderer joint angles. */
export function getRobotVisualState(
  configuration: WorldRobotConfiguration,
  state: WorldRobotState | undefined,
): RobotVisualState {
  const mechanisms = configuration.mechanisms;
  const hoodName = mechanisms?.shooter.hoodServo;
  const releaseName = mechanisms?.lift.releaseServo;
  const gateName = mechanisms?.gate.servo;
  const wheels = configuration.wheels.map((wheel) => {
    const outputAngle = motorOutputAngle(configuration, state, wheel.motor);
    // Positive +Z spin drives the bottom rim forward (+X); physical forward roll
    // therefore needs negative renderer rotation. A +X lateral axle uses the
    // sign of its configured lateral travel. Reversed traction axes reverse the visual spin.
    if (outputAngle === 0) return 0;
    return outputAngle * (isLateralWheel(wheel) ? -Math.sign(Math.sin(wheel.tractionAngle)) : -Math.sign(Math.cos(wheel.tractionAngle)));
  });

  // Mechanism outputs retain positive shaft phase. The renderer applies the
  // mechanism axes: intake about -Z, feeder and flywheel about +Z.
  return {
    wheelAngles: wheels,
    turretAngle: robotTurretAngle(configuration, state),
    hoodAngle: servoAngle(configuration, state, hoodName),
    intakeAngle: motorOutputAngle(configuration, state, mechanisms?.intake.motor),
    feederAngle: motorOutputAngle(configuration, state, mechanisms?.feeder.motor) / (mechanisms?.feeder.reduction ?? 1),
    flywheelAngle: motorOutputAngle(configuration, state, mechanisms?.shooter.motor),
    liftHeight: state?.mechanism.liftHeight ?? 0,
    releaseAngle: servoAngle(configuration, state, releaseName),
    gateAngle: servoAngle(configuration, state, gateName),
  };
}
