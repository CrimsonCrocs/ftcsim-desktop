import type { WorldRobotSensorFrame } from "@ftc-studio/opmode-protocol";
import type { WorldSensorFrame } from "@ftc-studio/sim-core";

/** Copies a normalized simulation snapshot into the runner's integer RGBA units. */
export function toRunnerWorldSensorFrame(frame: WorldSensorFrame): WorldRobotSensorFrame {
  return {
    ...frame,
    color: Object.fromEntries(Object.entries(frame.color).map(([name, color]) => [name, {
      red: Math.round(color.red * 255),
      green: Math.round(color.green * 255),
      blue: Math.round(color.blue * 255),
      alpha: Math.round(color.alpha * 255),
    }])),
  };
}
