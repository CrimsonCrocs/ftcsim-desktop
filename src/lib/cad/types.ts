import type { RobotVariant } from "@/lib/studio-types";
import type { DriveRole } from "@/lib/robot-configuration";

export type CadVector = { x: number; y: number; z: number };
export interface CadShape {
  /** Principal-axis dimensions in metres, shortest first. */
  dimensions: number[];
  /** Rotation/translation invariant sampled distance distributions. */
  radial: number[];
  pairs: number[];
  /** Shortest principal axis in the sampled coordinate frame, useful for wheel axles. */
  shortAxis?: CadVector;
  longAxis?: CadVector;
}
export interface CadPart {
  id: string;
  sourceNodeId?: string;
  path: number[];
  name: string;
  labels: string[];
  position: CadVector;
  rotation: { x: number; y: number; z: number; w: number };
  size: CadVector;
  shape: CadShape;
}
export interface CadReference {
  productIds: string[];
  sourceUrl: string;
  sourceSha256: string;
  shape: CadShape;
}
export interface CadMatch {
  partId: string;
  productId: string | null;
  candidates: string[];
  method: "part-number" | "name" | "geometry" | "manual" | "unknown";
  evidence: string;
  enabled: boolean;
  hardwareName: string;
  driveRole?: DriveRole;
  driveRoleEdited?: boolean;
  /** Camera direction in the normalized robot frame (+X forward, +Y up, +Z right). */
  camera?: { forward: CadVector; horizontalFov: number; verticalFov: number };
}
export interface CadImportOptions {
  units: "m" | "mm" | "in";
  up: "y" | "z";
  forward: "x" | "-x" | "y" | "-y" | "z" | "-z";
}
export interface CadAnalysis {
  sourceFileName: string;
  sourceSha256: string;
  glbBase64: string;
  parts: CadPart[];
  matches: CadMatch[];
  size: CadVector;
  triangleCount: number;
  drivetrain: RobotVariant | null;
  warnings: string[];
}

export const CAD_MAX_INPUT_BYTES = 384 * 1024 * 1024;
// Saved as a compressed binary asset, separately from the small robot manifest.
export const CAD_MAX_GLB_BYTES = 32 * 1024 * 1024;
export const CAD_MAX_TRIANGLES = 1_500_000;
export const CAD_MAX_PARTS = 10_000;
