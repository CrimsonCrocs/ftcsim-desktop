import { Box3, Mesh, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { base64ToBytes, bytesToBase64, validateCadGlb } from "./glb";
import { disposeCadScene } from "./scene";
import type { CadAnalysis, CadPart } from "./types";
import type { CadMotionOptions } from "./transmission";

export function remapCadMotionOptions(before: CadPart[], after: CadPart[], motion: CadMotionOptions): CadMotionOptions {
  const surviving = new Map(after.map((part) => [part.sourceNodeId ?? part.id, part.id]));
  const ids = new Map(before.map((part) => [part.id, surviving.get(part.sourceNodeId ?? part.id)]));
  return {
    excludedPartIds: motion.excludedPartIds?.flatMap((id) => ids.get(id) ?? []),
    ratios: motion.ratios && Object.fromEntries(Object.entries(motion.ratios).flatMap(([id, ratio]) => { const next = ids.get(id); return next ? [[next, ratio]] : []; })),
  };
}

export function cadNodeAtPath(root: Object3D, path: number[]) {
  let node: Object3D | undefined = root;
  for (const index of path) node = node?.children[index];
  return node;
}

/** Remove only explicitly chosen subtrees. Reframe and remap every surviving
 * binding before encoding; no simplification or geometry compression is used. */
export async function excludeCadParts(analysis: CadAnalysis, partIds: string[]): Promise<CadAnalysis> {
  const loaded = await new GLTFLoader().parseAsync(base64ToBytes(analysis.glbBase64), "");
  const scene = loaded.scene, root = scene.children[0];
  if (!root) throw new Error("The assembly has no editable components.");
  const detached: Object3D[] = [];
  try {
    const objects = new Map(analysis.parts.flatMap((part) => { const node = cadNodeAtPath(root, part.path); return node ? [[part.id, node] as const] : []; }));
    const excluded = new Set(partIds.map((id) => objects.get(id)).filter((node): node is Object3D => Boolean(node)));
    const removed = (node: Object3D) => { for (let parent: Object3D | null = node; parent; parent = parent.parent) if (excluded.has(parent)) return true; return false; };
    const retained = analysis.parts.filter((part) => { const node = objects.get(part.id); return node && !removed(node); });
    for (const node of excluded) { node.removeFromParent(); detached.push(node); }
    root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(root, true);
    if (bounds.isEmpty() || !retained.length) throw new Error("Keep at least one piece of the robot assembly.");
    const center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3());
    root.position.sub(center); root.updateMatrixWorld(true);
    const paths = new Map<Object3D, number[]>();
    const visit = (node: Object3D, path: number[]) => { paths.set(node, path); node.children.forEach((child, index) => visit(child, [...path, index])); };
    visit(root, []);
    const oldToNew = new Map<string, string>();
    const parts: CadPart[] = retained.flatMap((part) => {
      const node = objects.get(part.id)!, path = paths.get(node);
      if (!path) return [];
      const bounds = new Box3().setFromObject(node, true);
      if (bounds.isEmpty()) return [];
      const position = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3()), id = path.join("/") || "root";
      oldToNew.set(part.id, id);
      return [{ ...part, id, path, position: { x: position.x, y: position.y, z: position.z }, size: { x: size.x, y: size.y, z: size.z } }];
    });
    const matches = analysis.matches.flatMap((match) => { const partId = oldToNew.get(match.partId); return partId ? [{ ...match, partId }] : []; });
    let triangleCount = 0;
    root.traverse((node) => { if ((node as Mesh).isMesh) { const geometry = (node as Mesh).geometry; triangleCount += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3; } });
    const glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    if (!(glb instanceof ArrayBuffer)) throw new Error("Could not save the edited assembly.");
    validateCadGlb(glb);
    return { ...analysis, parts, matches, triangleCount, size: { x: size.x, y: size.y, z: size.z }, glbBase64: bytesToBase64(new Uint8Array(glb)) };
  } finally { disposeCadScene(scene); for (const node of detached) disposeCadScene(node); }
}
