import { readGlbColliders, type SimulationWorldOptions, type WorldCollider, type WorldRobotConfiguration } from "@ftc-studio/sim-core";
import { DECODE_ARTIFACT_MASS_KILOGRAMS, DECODE_ARTIFACT_RADIUS_METERS, DECODE_OFFICIAL_ARTIFACTS } from "./decode-artifacts";
import { DECODE_GOAL_EXCLUSION_COLLIDERS, DECODE_RAMP_EXCLUSION_COLLIDERS } from "./decode-goal-collisions";

export type WorldAssetLoader = (url: string) => Promise<Uint8Array>;
const assetRequests = new Map<string, Promise<Uint8Array>>();
export const fetchWorldAsset: WorldAssetLoader = (url) => {
  const existing = assetRequests.get(url);
  if (existing) return existing;
  const download = async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`Field asset could not load (${response.status}): ${url}`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const pending = (async () => {
    try {
      return await download();
    } catch (error) {
      // A transient browser abort or network drop should not leave the whole
      // physical field unavailable after its other assets have loaded.
      if (!(error instanceof Error) || !["AbortError", "TimeoutError", "TypeError"].includes(error.name)) throw error;
      return download();
    }
  })();
  // Resets, configuration changes, and the match preview share immutable bytes.
  // Rejected downloads are evicted so the existing Retry action can recover.
  assetRequests.set(url, pending);
  if (assetRequests.size > 24) assetRequests.delete(assetRequests.keys().next().value!);
  void pending.catch(() => { if (assetRequests.get(url) === pending) assetRequests.delete(url); });
  return pending;
};

export function perimeterColliders(): WorldCollider[] {
  return [
    { id: "wall-left", position: { x: -1.8415, y: 0.1524, z: 0 }, halfExtents: { x: 0.0127, y: 0.1524, z: 1.8542 } },
    { id: "wall-right", position: { x: 1.8415, y: 0.1524, z: 0 }, halfExtents: { x: 0.0127, y: 0.1524, z: 1.8542 } },
    { id: "wall-audience", position: { x: 0, y: 0.1524, z: 1.8415 }, halfExtents: { x: 1.8288, y: 0.1524, z: 0.0127 } },
    { id: "wall-scoring", position: { x: 0, y: 0.1524, z: -1.8415 }, halfExtents: { x: 1.8288, y: 0.1524, z: 0.0127 } },
  ].map(({ halfExtents, ...collider }) => ({ ...collider, shape: { kind: "box", halfExtents }, friction: 0.6, restitution: 0.1 }));
}

export async function createLegacyWorldOptions(
  preset: "decode-2025-2026" | "empty",
  configuration: WorldRobotConfiguration,
  loadAsset: WorldAssetLoader = fetchWorldAsset,
): Promise<SimulationWorldOptions> {
  const colliders = perimeterColliders();
  if (preset === "decode-2025-2026") {
    colliders.push(...readGlbColliders(await loadAsset("/models/decode-field-collision.glb"), "decode"));
    for (const blocker of [...DECODE_GOAL_EXCLUSION_COLLIDERS, ...DECODE_RAMP_EXCLUSION_COLLIDERS]) {
      const [x, y, z] = "rotationYRadians" in blocker ? [0, blocker.rotationYRadians, 0] : blocker.rotation;
      const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
      colliders.push({
      id: `decode-exclusion/${blocker.id}`,
      position: { x: blocker.position[0], y: blocker.position[1], z: blocker.position[2] },
      rotation: { x: sx * cy * cz + cx * sy * sz, y: cx * sy * cz - sx * cy * sz, z: cx * cy * sz + sx * sy * cz, w: cx * cy * cz - sx * sy * sz },
      shape: { kind: "box", halfExtents: { x: blocker.halfExtents[0], y: blocker.halfExtents[1], z: blocker.halfExtents[2] } },
      });
    }
  }
  return {
    seed: 2026,
    robots: [{ id: "red-1", alliance: "red", configuration, position: { x: -1.3, y: 0.105, z: 0 }, heading: 0 }],
    field: {
      preset, halfSize: 1.8288, floorHeight: 0, colliders, hives: [], tags: [], flowers: [], gardens: [], loadingZones: [],
      spawns: preset === "decode-2025-2026" ? DECODE_OFFICIAL_ARTIFACTS.map((artifact) => ({
        id: artifact.id, kind: "artifact", alliance: null, location: "field", appearance: artifact.color,
        position: { x: artifact.position[0], y: artifact.position[1], z: artifact.position[2] },
        radius: DECODE_ARTIFACT_RADIUS_METERS, massKg: DECODE_ARTIFACT_MASS_KILOGRAMS,
      })) : [],
    },
  };
}
