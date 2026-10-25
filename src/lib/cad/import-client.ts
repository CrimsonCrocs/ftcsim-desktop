import { Box3, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { CAD_MAX_INPUT_BYTES, type CadAnalysis, type CadImportOptions, type CadPart } from "./types";
import { describeCadScene, disposeCadScene, normalizeCadScene, sceneFromStep, type StepResult } from "./scene";
import { detectCadComponents } from "./detect";
import { bytesToBase64, validateCadGlb } from "./glb";
import { inferCadDrivetrain } from "./configure";
import { CAD_NATIVE_THRESHOLD, convertNativeCad, hashCadFile, type NativeCadResult } from "./native-client";

const convertedSteps = new WeakMap<File, { sourceSha256: string; result: StepResult }>();
const nativeSteps = new WeakMap<File, { sourceSha256: string; result: NativeCadResult }>();
async function loadCadGlb(bytes: ArrayBuffer) {
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  // Three sanitizes display names for animation-track syntax. CAD identity and
  // human-readable labels use the original glTF node name instead.
  gltf.scene.traverse((node) => { const index = gltf.parser.associations.get(node)?.nodes; if (index !== undefined && typeof gltf.parser.json.nodes[index]?.name === "string") node.name = gltf.parser.json.nodes[index].name; });
  return gltf.scene;
}

/** Preserve source measurements while remapping native CAD IDs to display paths. */
export function normalizedNativeParts(parts: CadPart[], scene: Object3D, root: Object3D): CadPart[] {
  const paths = new Map<string, number[]>(), visit = (node: Object3D, path: number[]) => { if (typeof node.userData.cadSourceId === "string") paths.set(node.userData.cadSourceId, path); for (let i = 0; i < node.children.length; i++) visit(node.children[i]!, [...path, i]); };
  paths.set("scene", [0]); visit(scene, [0]);
  const rotation = root.getWorldQuaternion(new Quaternion());
  const axis = (v: { x: number; y: number; z: number }) => { const result = new Vector3(v.x, v.y, v.z).transformDirection(root.matrixWorld); return { x: result.x, y: result.y, z: result.z }; };
  return parts.map((part) => {
    const path = paths.get(part.sourceNodeId!); if (!path) throw new Error(`The display model lost component ${part.name}.`);
    const bounds = new Box3(new Vector3(part.position.x - part.size.x / 2, part.position.y - part.size.y / 2, part.position.z - part.size.z / 2), new Vector3(part.position.x + part.size.x / 2, part.position.y + part.size.y / 2, part.position.z + part.size.z / 2)).applyMatrix4(root.matrixWorld);
    const position = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3()), q = new Quaternion(part.rotation.x, part.rotation.y, part.rotation.z, part.rotation.w).premultiply(rotation);
    return { ...part, path, id: path.join("/"), position: { x: position.x, y: position.y, z: position.z }, size: { x: size.x, y: size.y, z: size.z }, rotation: { x: q.x, y: q.y, z: q.z, w: q.w }, shape: { ...part.shape, ...(part.shape.shortAxis ? { shortAxis: axis(part.shape.shortAxis) } : {}), ...(part.shape.longAxis ? { longAxis: axis(part.shape.longAxis) } : {}) } };
  });
}

export function readStepInWorker(bytes: ArrayBuffer, iges: boolean, signal?: AbortSignal, onProgress?: (message: string) => void): Promise<StepResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Import cancelled", "AbortError")); return; }
    const worker = new Worker("/cad-import-worker.js");
    const finish = () => { worker.terminate(); clearTimeout(timeout); signal?.removeEventListener("abort", abort); };
    const abort = () => { finish(); reject(new DOMException("Import cancelled", "AbortError")); };
    const timeout = setTimeout(() => { finish(); reject(new Error("CAD conversion exceeded twenty minutes. Try a less detailed CAD export.")); }, 1_200_000);
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => { finish(); reject(new Error("The CAD converter could not load. Reconnect and try again, or export a GLB.")); };
    worker.onmessage = ({ data }) => { if (data.progress) { onProgress?.(data.progress); return; } finish(); if (data.error) reject(new Error(data.error)); else resolve(data.result); };
    worker.postMessage({ bytes, iges }, [bytes]);
  });
}

export async function importCadFile(file: File, options: CadImportOptions, signal?: AbortSignal, onProgress?: (message: string) => void): Promise<CadAnalysis> {
  if (!file.size || file.size > CAD_MAX_INPUT_BYTES) throw new Error("Choose a CAD file smaller than 384 MiB. Export a simplified assembly for larger source files.");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (!["step", "stp", "iges", "igs", "glb", "stl"].includes(extension ?? "")) throw new Error("Choose a STEP, IGES, GLB, or STL file. STEP and GLB preserve component names.");
  onProgress?.("Reading local file…");
  const native = ["step", "stp"].includes(extension!) && file.size > CAD_NATIVE_THRESHOLD;
  const cached = convertedSteps.get(file), nativeCached = nativeSteps.get(file);
  const bytes = cached || native ? null : await file.arrayBuffer();
  const sourceSha256 = nativeCached?.sourceSha256 ?? cached?.sourceSha256 ?? await hashCadFile(file, signal);
  let step: StepResult | undefined;
  let prepared: NativeCadResult | undefined;
  let scene: Object3D;
  if (native) { prepared = nativeCached?.result ?? await convertNativeCad(file, sourceSha256, signal, onProgress); nativeSteps.set(file, { sourceSha256, result: prepared }); scene = await loadCadGlb(prepared.glb); }
  else if (extension === "glb") { validateCadGlb(bytes!); scene = await loadCadGlb(bytes!); }
  else if (extension === "stl") { scene = new Mesh(new STLLoader().parse(bytes!), new MeshStandardMaterial({ color: "#b7c1ca", metalness: .35, roughness: .5 })); scene.name = file.name.replace(/\.stl$/i, ""); }
  else { step = cached?.result ?? await readStepInWorker(bytes!, extension === "iges" || extension === "igs", signal, onProgress); convertedSteps.set(file, { sourceSha256, result: step }); scene = sceneFromStep(step); }
  let root: Object3D = scene;
  try {
    if (signal?.aborted) throw new DOMException("Import cancelled", "AbortError");
    const measurement = prepared?.parts.find((part) => part.sourceNodeId === "scene");
    const bounds = measurement ? new Box3(new Vector3(measurement.position.x - measurement.size.x / 2, measurement.position.y - measurement.size.y / 2, measurement.position.z - measurement.size.z / 2), new Vector3(measurement.position.x + measurement.size.x / 2, measurement.position.y + measurement.size.y / 2, measurement.position.z + measurement.size.z / 2)) : undefined;
    const normalized = normalizeCadScene(scene, { ...options, units: ["step", "stp", "iges", "igs"].includes(extension!) ? "m" : options.units }, bounds);
    root = normalized.root;
    onProgress?.("Comparing hardware and preparing preview…");
    const described = describeCadScene(root), parts = prepared ? normalizedNativeParts(prepared.parts, scene, root) : described.parts.map((part) => ({ ...part, sourceNodeId: part.id })), triangleCount = described.triangleCount;
    const matches = detectCadComponents(parts);
    const glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    if (!(glb instanceof ArrayBuffer)) throw new Error("Could not encode the imported model.");
    validateCadGlb(glb);
    return { sourceFileName: file.name, sourceSha256, glbBase64: bytesToBase64(new Uint8Array(glb)), parts, matches, size: normalized.size, triangleCount,
      drivetrain: inferCadDrivetrain(parts, matches), warnings: prepared?.warnings ?? (extension === "stl" ? ["STL is a single surface without assembly names. Separate components or use STEP/GLB for hardware detection."] : step && step.originalTriangleCount !== step.simplifiedTriangleCount ? ["Display geometry was reduced using a 0.35 mm simplifier tolerance. Hardware recognition and dimensions use the original CAD geometry."] : []) };
  } finally { disposeCadScene(root); }
}
