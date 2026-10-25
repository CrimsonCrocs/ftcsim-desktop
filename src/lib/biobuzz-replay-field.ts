import { createBiobuzzAllRounder, type SimulationWorldOptions } from "@ftc-studio/sim-core";
import { createBiobuzzWorldOptions } from "./biobuzz-world-field";
import type { WorldAssetLoader } from "./legacy-world-field";
import layout from "./biobuzz-field-layout.json";
import physicsLayout from "./biobuzz-physics-layout.json";
import flowerScoring from "./biobuzz-flower-scoring.json";

export interface BiobuzzReplayFieldDescriptor {
  schema: "biobuzz-replay-field-v1";
  assetPackSha256: string;
  seed: number;
  robots: SimulationWorldOptions["robots"];
  spawns: SimulationWorldOptions["field"]["spawns"];
  parameters?: SimulationWorldOptions["parameters"];
  recordCommands: boolean;
}

/** Immutable asset references replace millions of repeated triangle coordinates in a replay. */
export async function biobuzzAssetPackFingerprint(): Promise<string> {
  const identity = {
    schema: "biobuzz-field-assets-v1",
    staticColliders: layout.assets.staticCollision.groups.map(({ url, sha256 }) => ({ url, sha256 })),
    movingBodies: layout.movableBodies.map(body => ({ id: body.id, pivot: body.pivot, collider: { url: body.collider.url, sha256: body.collider.sha256 }, cells: body.cells.map(cell => ({ id: cell.id, collider: { url: cell.collider.url, sha256: cell.collider.sha256 } })) })),
    physics: physicsLayout,
    scoring: flowerScoring,
    flowers: layout.flowers,
    initialGamePieces: layout.initialGamePieces,
    tagSizeMeters: layout.apriltags.targetSizeMeters,
  };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(identity)));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

export async function describeBiobuzzReplayField(options: SimulationWorldOptions): Promise<BiobuzzReplayFieldDescriptor> {
  if (options.field.preset !== "biobuzz-2026-2027" || options.robots.length !== 4) throw new Error("BIOBUZZ replay requires a four-robot season field.");
  return {
    schema: "biobuzz-replay-field-v1",
    assetPackSha256: await biobuzzAssetPackFingerprint(),
    seed: options.seed,
    robots: structuredClone(options.robots),
    spawns: structuredClone(options.field.spawns),
    ...(options.parameters ? { parameters: structuredClone(options.parameters) } : {}),
    recordCommands: options.recordCommands ?? false,
  };
}

export async function resolveBiobuzzReplayField(descriptor: BiobuzzReplayFieldDescriptor, loadAsset?: WorldAssetLoader): Promise<SimulationWorldOptions> {
  if (descriptor.schema !== "biobuzz-replay-field-v1" || descriptor.assetPackSha256 !== await biobuzzAssetPackFingerprint()) {
    throw new Error("This replay requires a different version of the BIOBUZZ field assets.");
  }
  if (!Number.isSafeInteger(descriptor.seed) || !Array.isArray(descriptor.robots) || descriptor.robots.length !== 4 || !Array.isArray(descriptor.spawns) || descriptor.spawns.length !== 56) throw new Error("Replay world configuration is malformed.");
  const canonical = await createBiobuzzWorldOptions({ seed: descriptor.seed, alliance: "red", startPosition: "near", robotConfiguration: createBiobuzzAllRounder() }, loadAsset);
  return {
    ...canonical,
    field: { ...canonical.field, spawns: structuredClone(descriptor.spawns) },
    robots: structuredClone(descriptor.robots),
    ...(descriptor.parameters ? { parameters: structuredClone(descriptor.parameters) } : {}),
    recordCommands: descriptor.recordCommands,
  };
}
