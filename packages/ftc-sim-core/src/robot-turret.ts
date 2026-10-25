import type { WorldRobotConfiguration, WorldRobotState } from "./world-types.js";

export function normalizeRotationRadians(angle: number): number {
  const turn = 2 * Math.PI;
  return ((angle % turn) + turn) % turn;
}

/** Physical turret orientation, independent of the software encoder's zero offset. */
export function robotTurretAngle(configuration: WorldRobotConfiguration, state?: Pick<WorldRobotState, "motors" | "servos">): number {
  const shooter = configuration.mechanisms?.shooter;
  if (shooter?.turretMotor) {
    const motor = configuration.motors.find((candidate) => candidate.name === shooter.turretMotor);
    return normalizeRotationRadians((state?.motors[shooter.turretMotor]?.positionRadians ?? 0) / (motor?.reduction ?? 1));
  }
  const servo = configuration.servos.find((candidate) => candidate.name === shooter?.turretServo);
  if (!servo) return 0;
  return state?.servos[servo.name]?.angle ?? (servo.name === "turret" ? (servo.minRadians + servo.maxRadians) / 2 : servo.minRadians);
}
