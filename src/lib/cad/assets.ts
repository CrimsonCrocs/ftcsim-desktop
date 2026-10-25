import type { ImportedRobotVisual } from "../../../packages/ftc-sim-core/src/world-types";
import { PROJECT_SYNC_MAX_FILE_BYTES } from "../projects/cloud-contract";
import { CAD_MAX_GLB_BYTES } from "./types";
import { base64ToBytes, validateCadGlb } from "./glb";

export type CadModelAsset = NonNullable<ImportedRobotVisual["asset"]>;
const hash = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (v) => v.toString(16).padStart(2, "0")).join("");
export function validCadAsset(value: unknown): value is CadModelAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<CadModelAsset>;
  return typeof asset.sha256 === "string" && /^[a-f0-9]{64}$/.test(asset.sha256) && asset.path === `.ftcsim/cad/${asset.sha256}.glb.gz`
    && asset.encoding === "gzip" && typeof asset.byteLength === "number" && Number.isInteger(asset.byteLength) && asset.byteLength >= 20 && asset.byteLength <= CAD_MAX_GLB_BYTES;
}

export async function packCadModel(model: ImportedRobotVisual): Promise<{ model: ImportedRobotVisual; bytes: Uint8Array } | null> {
  if (!model.glbBase64) return null;
  const raw = base64ToBytes(model.glbBase64); validateCadGlb(raw);
  const sha256 = await hash(raw);
  const bytes = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  if (bytes.byteLength > PROJECT_SYNC_MAX_FILE_BYTES) throw new Error("The compressed model exceeds the project's 16 MiB asset budget. Use a less detailed display model.");
  const metadata = { ...model }; delete metadata.glbBase64;
  return { model: { ...metadata, asset: { path: `.ftcsim/cad/${sha256}.glb.gz`, sha256, byteLength: raw.byteLength, encoding: "gzip" } }, bytes };
}

/** Validate size while inflating, then validate hash and portable GLB before loading. */
export async function unpackCadModel(asset: CadModelAsset, compressed: Uint8Array): Promise<ArrayBuffer> {
  if (!validCadAsset(asset) || compressed.byteLength > PROJECT_SYNC_MAX_FILE_BYTES) throw new Error("The saved CAD asset is invalid.");
  const reader = new Blob([new Uint8Array(compressed).buffer]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > asset.byteLength || length > CAD_MAX_GLB_BYTES) { await reader.cancel(); throw new Error("The saved CAD asset expands beyond its recorded size."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (length !== asset.byteLength) throw new Error("The saved CAD asset is incomplete.");
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (await hash(bytes.buffer) !== asset.sha256) throw new Error("The saved CAD asset failed its integrity check.");
  validateCadGlb(bytes.buffer); return bytes.buffer;
}
