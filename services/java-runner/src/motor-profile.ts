import {
  LEGACY_SIMULATED_MOTOR_PROFILE,
  type SimulatedHardwareManifest,
  type SimulatedMotorDescriptor,
} from "@ftc-studio/opmode-protocol";

/** Normalizes typed protocol calls that bypass the JSON validators in tests or local adapters. */
export function normalizeMotorDescriptors(
  motors: SimulatedHardwareManifest["motors"],
): SimulatedMotorDescriptor[] {
  return motors.map((motor) => (
    typeof motor === "string"
      ? { name: motor, ...LEGACY_SIMULATED_MOTOR_PROFILE }
      : { ...motor }
  ));
}

/** Safe, shell-free value for the JVM's --motor-profile argument. */
export function encodeMotorProfileArgument(motor: SimulatedMotorDescriptor): string {
  return [
    "v1",
    encodeURIComponent(motor.name),
    encodeURIComponent(motor.modelId),
    String(motor.ticksPerRevolution),
    String(motor.maxRpm),
    String(motor.achievableMaxRpmFraction),
  ].join(",");
}
