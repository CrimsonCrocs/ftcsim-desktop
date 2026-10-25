import rawLayout from "./decode-field-layout.json";
import type { ArtifactColor } from "./field-configuration";

export const DECODE_ARTIFACT_RADIUS_METERS = 0.0635;
export const DECODE_ARTIFACT_MASS_KILOGRAMS = 0.0748427;
export const DECODE_ARTIFACT_FRICTION = 0.65;
export const DECODE_ARTIFACT_RESTITUTION = 0.35;
export const DECODE_ARTIFACT_LINEAR_DAMPING = 0.02;
export const DECODE_ARTIFACT_ANGULAR_DAMPING = 0.01;
export const DECODE_ARTIFACT_MAX_USER_DROPS = 16;

export const DECODE_ARTIFACT_MODELS: Record<ArtifactColor, string> = {
  green: "/models/decode-artifact-green.glb",
  purple: "/models/decode-artifact-purple.glb",
};

export interface DecodeArtifactSpawn {
  id: string;
  color: ArtifactColor;
  position: [number, number, number];
  official: boolean;
  resetSignal: number;
}

export const DECODE_OFFICIAL_ARTIFACTS: readonly DecodeArtifactSpawn[] = rawLayout.artifacts.map((artifact) => ({
  id: artifact.id,
  color: artifact.color as ArtifactColor,
  position: artifact.position as [number, number, number],
  official: true,
  resetSignal: 0,
}));

const DROP_LANES = [-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35] as const;

export function createArtifactDrop(
  id: number,
  color: ArtifactColor,
  resetSignal: number,
  activeUserDrops: readonly DecodeArtifactSpawn[],
): DecodeArtifactSpawn | null {
  if (activeUserDrops.length >= DECODE_ARTIFACT_MAX_USER_DROPS) return null;
  const lane = DROP_LANES[id % DROP_LANES.length];
  return {
    id: `drop-${resetSignal}-${id}`,
    color,
    position: [lane, 0.35, -1.42],
    official: false,
    resetSignal,
  };
}
