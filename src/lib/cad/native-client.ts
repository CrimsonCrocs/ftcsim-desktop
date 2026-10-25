import { unzipSync, strFromU8 } from "fflate";
import { sha256 } from "@noble/hashes/sha2.js";
import { CAD_MAX_GLB_BYTES, CAD_MAX_PARTS, type CadPart } from "./types";
import { validateCadGlb } from "./glb";

const CHUNK_BYTES = 512 * 1024;
export const CAD_NATIVE_THRESHOLD = 32 * 1024 * 1024;
export interface NativeCadResult { glb: ArrayBuffer; parts: CadPart[]; warnings: string[] }
interface Job { id: string; status: string; stage: string; uploadedChunks: number[]; chunkCount: number; outputBytes?: number; outputChunks?: number; error?: string }
const hex = (bytes: Uint8Array) => Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
export async function hashCadFile(file: File, signal?: AbortSignal) {
  const hash = sha256.create();
  for (let offset = 0; offset < file.size; offset += 8 * 1024 * 1024) { signal?.throwIfAborted(); hash.update(new Uint8Array(await file.slice(offset, offset + 8 * 1024 * 1024).arrayBuffer())); }
  return hex(hash.digest());
}
async function request(path: string, options: RequestInit = {}) {
  const response = await fetch("/api/cad-import" + path, { ...options, cache: "no-store" });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "CAD conversion could not be completed. Try again."); }
  return response;
}
const stages: Record<string, string> = { queued: "Waiting for the private converter…", reading: "Reading assembly…", transferring: "Loading CAD components…", tessellating: "Preparing CAD surfaces…", "checking-surfaces": "Checking surface coverage…", exporting: "Preparing display geometry…", "reducing-display": "Optimizing display geometry…" };
async function pause(signal?: AbortSignal) { await new Promise<void>((resolve, reject) => { const abort = () => { clearTimeout(timer); reject(signal?.reason); }; const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, 1000); signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort(); }); }

/** A private, bounded conversion job. Source bytes are removed by the converter;
 * only its prepared model is retained in the project. */
export async function convertNativeCad(file: File, sourceSha256: string, signal?: AbortSignal, onProgress?: (message: string) => void): Promise<NativeCadResult> {
  const availability = await (await request("", { signal })).json();
  if (!availability.available) throw new Error(availability.reason || "This large assembly needs the native CAD converter. Configure the conversion service, or import a prepared GLB.");
  let job: Job | undefined;
  const abort = () => { if (job) void fetch(`/api/cad-import/jobs/${job.id}`, { method: "DELETE", keepalive: true }).catch(() => {}); };
  try {
    job = await (await request("/jobs", { method: "POST", body: JSON.stringify({ name: file.name, sha256: sourceSha256, byteLength: file.size }), headers: { "content-type": "application/json" }, signal })).json();
    if (!job || !/^[a-f0-9-]{36}$/.test(job.id)) throw new Error("The converter returned an invalid job.");
    signal?.addEventListener("abort", abort, { once: true }); signal?.throwIfAborted();
    if (job.status === "uploading") {
      const completed = new Set(job.uploadedChunks); let next = 0;
      const upload = async () => { for (;;) { const index = next++; if (index >= job!.chunkCount) return; if (completed.has(index)) continue;
        const bytes = new Uint8Array(await file.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).arrayBuffer());
        await request(`/jobs/${job!.id}/chunks/${index}`, { method: "PUT", body: bytes, headers: { "x-cad-chunk-sha256": hex(sha256(bytes)) }, signal });
        completed.add(index); onProgress?.(`Uploading assembly privately… ${Math.round(completed.size / job!.chunkCount * 100)}%`);
      } };
      await Promise.all([upload(), upload(), upload()]);
      job = await (await request(`/jobs/${job.id}/start`, { method: "POST", signal })).json();
    }
    const deadline = Date.now() + 10 * 60_000;
    while (job!.status !== "ready") {
      if (["failed", "cancelled"].includes(job!.status)) throw new Error(job!.error || "CAD conversion was cancelled.");
      if (Date.now() > deadline) throw new Error("The assembly exceeded the conversion time budget. Try again.");
      onProgress?.(stages[job!.stage] ?? "Preparing assembly…"); await pause(signal);
      job = await (await request(`/jobs/${job!.id}`, { signal })).json();
    }
    if (!Number.isInteger(job!.outputBytes) || job!.outputBytes! <= 0 || job!.outputBytes! > CAD_MAX_GLB_BYTES || job!.outputChunks !== Math.ceil(job!.outputBytes! / CHUNK_BYTES)) throw new Error("The prepared model exceeds the import budget.");
    onProgress?.("Downloading prepared model…"); const archive = new Uint8Array(job!.outputBytes!);
    for (let index = 0; index < job!.outputChunks!; index++) {
      const response = await request(`/jobs/${job!.id}/chunks/${index}`, { signal }), bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== Math.min(CHUNK_BYTES, archive.length - index * CHUNK_BYTES) || hex(sha256(bytes)) !== response.headers.get("x-cad-chunk-sha256")) throw new Error("The prepared model failed its integrity check. Import it again.");
      archive.set(bytes, index * CHUNK_BYTES);
    }
    const limits: Record<string, number> = { "model.glb": CAD_MAX_GLB_BYTES, "source-parts.json": 16 * 1024 * 1024, "report.json": 256 * 1024 };
    const files = unzipSync(archive, { filter: ({ name, originalSize }) => { if (!(name in limits) || originalSize > limits[name]!) throw new Error("The converter returned an invalid model archive."); return true; } });
    if (Object.keys(files).length !== 3 || !files["model.glb"] || !files["source-parts.json"] || !files["report.json"]) throw new Error("The prepared model is incomplete.");
    const glb = new Uint8Array(files["model.glb"]).buffer; validateCadGlb(glb);
    const parts = JSON.parse(strFromU8(files["source-parts.json"]));
    if (!Array.isArray(parts) || !parts.length || parts.length > CAD_MAX_PARTS || parts.some((part) => !validPart(part))) throw new Error("The converter returned invalid component measurements.");
    const report = JSON.parse(strFromU8(files["report.json"]));
    if (report.frame !== "z-up-metres" || !Array.isArray(report.failedComponents) || report.failedComponents.length) throw new Error("The converter could not preserve all CAD surfaces.");
    const warnings: string[] = [];
    if (report.componentsWithoutSurfaces?.length) warnings.push(`${report.componentsWithoutSurfaces.length} source CAD definitions contain no surfaces and cannot be displayed.`);
    return { glb, parts, warnings: [...warnings, ...(report.sourceTriangles !== report.displayTriangles ? ["Display tessellation was reduced within a 0.35 mm simplifier tolerance. Component dimensions and recognition use the original geometry."] : [])] };
  } catch (error) { abort(); throw error; }
  finally { signal?.removeEventListener("abort", abort); }
}
function validPart(part: CadPart): boolean {
  const vector = (v: Record<string, number> | undefined, keys = ["x", "y", "z"]) => Boolean(v && keys.every((key) => Number.isFinite(v[key])));
  return typeof part?.sourceNodeId === "string" && typeof part.name === "string" && part.name.length <= 4096 && Array.isArray(part.labels) && part.labels.length <= 64 && part.labels.every((v) => typeof v === "string" && v.length <= 4096) && vector(part.position) && vector(part.size) && vector(part.rotation, ["x", "y", "z", "w"]) && Boolean(part.shape && [part.shape.dimensions, part.shape.radial, part.shape.pairs].every((v) => Array.isArray(v) && v.length <= 64 && v.every(Number.isFinite)) && (!part.shape.shortAxis || vector(part.shape.shortAxis)) && (!part.shape.longAxis || vector(part.shape.longAxis)));
}
