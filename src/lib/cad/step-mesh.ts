import { MeshoptSimplifier } from "meshoptimizer";
import type { StepResult } from "./scene";
import { CAD_MAX_PARTS, CAD_MAX_TRIANGLES } from "./types";

/** Reduce display tessellation in the conversion worker, keeping every named CAD node.
 * STEP face boundaries duplicate positions; weld these before simplifying, then
 * rebuild display normals in Three.js. A 0.35 mm geometric error is a visual
 * approximation, not a replacement for the source's manufacturing surfaces. */
export async function compactStepMeshes(result: StepResult, nodeBudget = CAD_MAX_PARTS): Promise<StepResult> {
  const uses = new Uint32Array(result.meshes.length);
  let nodes = 0;
  const visit = (node: StepResult["root"], depth: number) => {
    if (++nodes > nodeBudget || depth > 64) throw new Error("This assembly exceeds the scene-node budget. Simplify the assembly first.");
    for (const index of node.meshes) { if (index >= uses.length) throw new Error("The STEP references a missing solid."); uses[index]!++; }
    for (const child of node.children) visit(child, depth + 1);
  };
  visit(result.root, 0);
  const original = result.meshes.reduce((sum, mesh, i) => sum + mesh.index.array.length / 3 * uses[i]!, 0);
  if (!original) throw new Error("The CAD engine produced no display surfaces. This assembly needs native conversion.");
  const reduce = original > 150_000;
  if (reduce) await MeshoptSimplifier.ready;
  const meshes = result.meshes.map((mesh, meshIndex) => {
    const input = mesh.attributes.position.array;
    const sourceGeometry = reduce ? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], samples: new Float32Array(Math.min(mesh.index.array.length, 1536) * 3) } : undefined;
    if (sourceGeometry) {
      for (let i = 0; i < input.length; i++) { const axis = i % 3; sourceGeometry.min[axis] = Math.min(sourceGeometry.min[axis]!, input[i]!); sourceGeometry.max[axis] = Math.max(sourceGeometry.max[axis]!, input[i]!); }
      for (let i = 0; i < sourceGeometry.samples.length / 3; i++) {
        const index = mesh.index.array[Math.floor(i * mesh.index.array.length / (sourceGeometry.samples.length / 3))]!;
        sourceGeometry.samples.set([input[index * 3]!, input[index * 3 + 1]!, input[index * 3 + 2]!], i * 3);
      }
    }
    let positions = new Float32Array(input), indices = new Uint32Array(mesh.index.array);
    if (reduce && uses[meshIndex] && indices.length > 120) {
      const unique = new Map<string, number>(), welded: number[] = [], remap = new Uint32Array(positions.length / 3);
      for (let i = 0; i < positions.length; i += 3) {
        const key = `${Math.round(positions[i]! * 1e7)},${Math.round(positions[i + 1]! * 1e7)},${Math.round(positions[i + 2]! * 1e7)}`;
        let index = unique.get(key);
        if (index === undefined) { index = welded.length / 3; unique.set(key, index); welded.push(positions[i]!, positions[i + 1]!, positions[i + 2]!); }
        remap[i / 3] = index;
      }
      positions = new Float32Array(welded);
      indices = indices.map((index) => remap[index]!);
      const target = Math.max(36, Math.floor(indices.length * 150_000 / original / 3) * 3);
      indices = new Uint32Array(MeshoptSimplifier.simplify(indices, positions, 3, target, .00035, ["ErrorAbsolute"])[0]);
      const [compact, count] = MeshoptSimplifier.compactMesh(indices);
      const packed = new Float32Array(count * 3);
      for (let i = 0; i < compact.length; i++) if (compact[i]! < count) packed.set(positions.subarray(i * 3, i * 3 + 3), compact[i]! * 3);
      positions = packed;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < positions.length; i++) { const axis = i % 3; min[axis] = Math.min(min[axis]!, positions[i]!); max[axis] = Math.max(max[axis]!, positions[i]!); }
      // Keep the original mesh if simplification removes a whole part or changes
      // its outline beyond the declared display tolerance.
      if (!indices.length || sourceGeometry && min.some((value, axis) => Math.abs(value - sourceGeometry.min[axis]!) > .00035 || Math.abs(max[axis]! - sourceGeometry.max[axis]!) > .00035)) {
        positions = new Float32Array(input); indices = new Uint32Array(mesh.index.array);
      }
    }
    return { name: mesh.name, color: mesh.color, sourceGeometry, attributes: { position: { array: positions },
      ...(!reduce && mesh.attributes.normal ? { normal: { array: new Float32Array(mesh.attributes.normal.array) } } : {}) }, index: { array: indices } };
  });
  const triangles = meshes.reduce((sum, mesh, i) => sum + mesh.index.array.length / 3 * uses[i]!, 0);
  if (triangles > CAD_MAX_TRIANGLES) throw new Error(`This assembly remains above 1,500,000 display triangles after simplification (${Math.round(triangles).toLocaleString()}). Export a less detailed assembly.`);
  return { success: result.success, root: result.root, meshes, originalTriangleCount: original, simplifiedTriangleCount: triangles };
}
