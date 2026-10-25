export type RobotVariant = "mecanum" | "tank" | "x-drive" | "h-drive";

export type OpModeState = "idle" | "initializing" | "ready" | "running" | "stopped";

export interface TelemetrySnapshot {
  x: number;
  z: number;
  heading: number;
  velocity: number;
  loopHz: number;
}

export interface ProjectNode {
  name: string;
  kind: "folder" | "file";
  path?: string;
  children?: ProjectNode[];
  tone?: "source" | "blocks" | "config" | "plain" | "binary";
  editable?: boolean;
}
