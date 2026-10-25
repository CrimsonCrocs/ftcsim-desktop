import type { GamepadSnapshot, SimulationFrame } from "@ftc-studio/opmode-protocol";
import type { GamepadFrame } from "./gamepad";
import type { SimulatorActuatorFrame } from "./runtime-types";

export function toActuatorFrame(frame: SimulationFrame): SimulatorActuatorFrame {
  return {
    sequence: frame.sequence,
    simulationTimeMs: frame.simulationTimeMillis,
    ...(frame.cameraFrameRequests === undefined ? {} : { cameraFrameRequests: frame.cameraFrameRequests }),
    motors: Object.fromEntries(Object.entries(frame.motors).map(([name, motor]) => [name, {
      power: motor.power,
      direction: motor.direction,
      mode: motor.mode,
      targetPosition: motor.targetPosition,
      targetPositionTolerance: motor.targetPositionTolerance,
      velocitySetpointTicksPerSecond: motor.velocitySetpointTicksPerSecond,
      zeroPowerBehavior: motor.zeroPowerBehavior,
      enabled: motor.enabled,
    }])),
    telemetry: frame.telemetry,
    servos: Object.fromEntries(Object.entries(frame.servos).map(([name, servo]) => [name, servo.direction === "REVERSE" ? 1 - servo.position : servo.position])),
  };
}

const PROTOCOL_GAMEPAD_FIELDS = [
  "left_stick_x", "left_stick_y", "right_stick_x", "right_stick_y",
  "left_trigger", "right_trigger", "a", "b", "x", "y",
  "cross", "circle", "square", "triangle",
  "dpad_up", "dpad_down", "dpad_left", "dpad_right",
  "left_bumper", "right_bumper", "left_stick_button", "right_stick_button",
  "start", "options", "back", "share", "guide", "touchpad",
] as const satisfies readonly (keyof GamepadSnapshot)[];

export function toProtocolGamepad(frame: GamepadFrame["gamepad1"] | undefined): GamepadSnapshot {
  if (!frame) return {};
  return Object.fromEntries(PROTOCOL_GAMEPAD_FIELDS.map((field) => [field, frame[field]])) as GamepadSnapshot;
}

