export type RuntimeMotorDirection = "FORWARD" | "REVERSE";
export type RuntimeMotorRunMode =
  | "RUN_WITHOUT_ENCODER"
  | "RUN_USING_ENCODER"
  | "RUN_TO_POSITION"
  | "STOP_AND_RESET_ENCODER";
export type RuntimeZeroPowerBehavior = "BRAKE" | "FLOAT";

export interface RuntimeMotorCommand {
  power: number;
  direction?: RuntimeMotorDirection;
  mode?: RuntimeMotorRunMode;
  targetPosition?: number;
  targetPositionTolerance?: number;
  velocitySetpointTicksPerSecond?: number | null;
  zeroPowerBehavior?: RuntimeZeroPowerBehavior;
  enabled?: boolean;
}

/** The only actuator input accepted by the physical robot simulation. */
export interface SimulatorActuatorFrame {
  sequence: number;
  simulationTimeMs: number;
  motors: Record<string, RuntimeMotorCommand>;
  servos?: Record<string, number>;
  telemetry?: Record<string, string>;
  /** Render images only for these Java camera consumers; absent on legacy builds. */
  cameraFrameRequests?: readonly string[];
}

export interface RuntimeMotorFeedback {
  currentPosition: number;
  velocityTicksPerSecond: number;
  currentAmps: number;
  enabled: boolean;
}

export interface SimulatorHardwareFrame {
  sequence: number;
  simulationTimeMs: number;
  pose: {
    xMeters: number;
    yMeters: number;
    headingRadians: number;
  };
  chassisVelocity: {
    xMetersPerSecond: number;
    yMetersPerSecond: number;
    angularRadiansPerSecond: number;
  };
  motors: Record<string, RuntimeMotorFeedback>;
  sensors?: import("@ftc-studio/opmode-protocol").RobotSensorFrame | import("@ftc-studio/opmode-protocol").WorldRobotSensorFrame;
}

export interface DriveMotorNames {
  frontLeft: string;
  frontRight: string;
  backLeft: string;
  backRight: string;
  center?: string;
}

export const DEFAULT_DRIVE_MOTOR_NAMES: Readonly<DriveMotorNames> = {
  frontLeft: "frontLeft",
  frontRight: "frontRight",
  backLeft: "backLeft",
  backRight: "backRight",
  center: "center",
};
