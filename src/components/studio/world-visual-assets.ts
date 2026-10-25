import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import layout from "@/lib/biobuzz-field-layout.json";
import parts from "@/lib/biobuzz-visual-parts.json";
import type { FieldPresetId } from "@/lib/field-configuration";
import { preloadHiveTags } from "./biobuzz-apriltags";

export const BIOBUZZ_STATIC_VISUALS = parts.chunks.map((part) => part.url);
const requests = new Map<string, { promise: Promise<GLTF>; abort: AbortController }>();
const waitingDownloads: Array<() => void> = [];
let activeDownloads = 0;

/** Leave network capacity for editor scripts and simulation collision data. */
function downloadVisual<T>(signal: AbortSignal, download: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      const position = waitingDownloads.indexOf(start);
      if (position >= 0) waitingDownloads.splice(position, 1);
      reject(signal.reason);
    };
    const start = () => {
      signal.removeEventListener("abort", cancel);
      activeDownloads++;
      void download().then(resolve, reject).finally(() => {
        activeDownloads--;
        waitingDownloads.shift()?.();
      });
    };
    if (signal.aborted) { reject(signal.reason); return; }
    if (activeDownloads < 3) start();
    else {
      waitingDownloads.push(start);
      signal.addEventListener("abort", cancel, { once: true });
    }
  });
}

export function loadVisualAsset(url: string): Promise<GLTF> {
  const existing = requests.get(url);
  if (existing) return existing.promise;
  const abort = new AbortController();
  const promise = downloadVisual(abort.signal, async () => {
    const response = await fetch(visualAssetUrl(url), { priority: "low", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(45_000)]) });
    if (!response.ok) throw new Error(`Field asset could not load (${response.status}): ${url}`);
    // All published field GLBs embed their buffers; no external decoder or
    // sequential follow-up downloads are needed to parse an individual part.
    return new GLTFLoader().parseAsync(await response.arrayBuffer(), "/");
  });
  requests.set(url, { promise, abort });
  // Suspense's boundary reports failures; preloads also need a rejection handler.
  void promise.catch(() => {});
  return promise;
}

export function clearVisualAsset(url: string) {
  requests.get(url)?.abort.abort();
  requests.delete(url);
}

export function visualAssetUrl(url: string) {
  if (!url.startsWith("/models/biobuzz/") || url.includes("/visual-parts/")) return url;
  const revision = layout.generated.gamePieceVisuals.find((piece) => piece.path === url)?.sha256
    ?? `${layout.generated.visualMaterials.revision}-${layout.generated.outputs.staticVisual.sha256}`;
  return `${url}?appearance=${revision}`;
}

export function fieldVisualAssets(preset: FieldPresetId): string[] {
  if (preset !== "biobuzz-2026-2027") return [preset === "empty" ? "/models/empty-field-visual.glb" : "/models/decode-field-visual.glb"];
  return [...BIOBUZZ_STATIC_VISUALS,
    ...layout.movableBodies.flatMap((hive) => [hive.mesh, ...hive.cells.map((cell) => cell.mesh)]),
    layout.gamePieces.pollen.mesh, layout.gamePieces.nectar.redMesh, layout.gamePieces.nectar.blueMesh,
  ];
}

/** Start visual downloads alongside physics, not after physics initialization. */
export function preloadFieldVisuals(preset: FieldPresetId) {
  for (const url of fieldVisualAssets(preset)) void loadVisualAsset(url);
  if (preset === "biobuzz-2026-2027") preloadHiveTags();
}
