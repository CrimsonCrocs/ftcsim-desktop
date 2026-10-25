import { Box3, BufferAttribute, BufferGeometry, Color, Group, Material, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Texture, Vector3 } from "three";
import { describeCadShape } from "./geometry";
import { CAD_MAX_PARTS, CAD_MAX_TRIANGLES, type CadImportOptions, type CadPart } from "./types";

export interface StepResult {
  success: boolean;
  originalTriangleCount?: number;
  simplifiedTriangleCount?: number;
  root: { name: string; meshes: number[]; children: StepResult["root"][] };
  meshes: { name: string; color?: number[]; attributes: { position: { array: number[] | Float32Array }; normal?: { array: number[] | Float32Array } }; index: { array: number[] | Uint32Array }; sourceGeometry?: { min: number[]; max: number[]; samples: Float32Array } }[];
}
const sourceSamples = new WeakMap<BufferGeometry, Float32Array>();

export function sceneFromStep(result: StepResult): Group {
  if (!result.success || !result.meshes?.length) throw new Error("The CAD file contains no readable solids. Export a STEP assembly with geometry included.");
  let triangles = 0;
  for (const mesh of result.meshes) triangles += mesh.index.array.length / 3;
  if (triangles > CAD_MAX_TRIANGLES) throw new Error("This assembly is too detailed. Export a simplified assembly with fewer than 1,500,000 triangles.");
  const meshes = result.meshes.map((entry) => {
    const geometry = new BufferGeometry();
    if (entry.sourceGeometry) {
      geometry.boundingBox = new Box3(new Vector3(...entry.sourceGeometry.min), new Vector3(...entry.sourceGeometry.max));
      sourceSamples.set(geometry, entry.sourceGeometry.samples);
    }
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(entry.attributes.position.array), 3));
    geometry.setIndex(new BufferAttribute(new Uint32Array(entry.index.array), 1));
    if (entry.attributes.normal) geometry.setAttribute("normal", new BufferAttribute(new Float32Array(entry.attributes.normal.array), 3));
    else geometry.computeVertexNormals();
    const color = entry.color ? new Color().setRGB(entry.color[0]!, entry.color[1]!, entry.color[2]!) : new Color("#b7c1ca");
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color, metalness: .35, roughness: .5 }));
    mesh.name = entry.name || "Solid";
    return mesh;
  });
  let count = 0;
  const visit = (node: StepResult["root"], depth = 0): Group => {
    if (++count > CAD_MAX_PARTS || depth > 64) throw new Error("The assembly has too many nested components. Export a simplified assembly.");
    const group = new Group(); group.name = node.name || "Assembly";
    for (const index of node.meshes ?? []) {
      if (!meshes[index]) throw new Error("The STEP assembly references a missing solid.");
      group.add(meshes[index]!.clone());
    }
    for (const child of node.children ?? []) group.add(visit(child, depth + 1));
    return group;
  };
  return visit(result.root);
}

/** Convert the user's axis choices to the simulator's +X forward, +Y up frame. */
export function normalizeCadScene(scene: Object3D, options: CadImportOptions, sourceBounds?: Box3) {
  const up = options.up === "z" ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const sign = options.forward.startsWith("-") ? -1 : 1;
  const axis = options.forward.at(-1);
  const forward = new Vector3(axis === "x" ? sign : 0, axis === "y" ? sign : 0, axis === "z" ? sign : 0);
  if (Math.abs(up.dot(forward)) > .1) throw new Error("Forward and up must use different axes.");
  const right = new Vector3().crossVectors(forward, up);
  const basis = new Matrix4().makeBasis(forward, up, right).transpose();
  const scale = options.units === "mm" ? .001 : options.units === "in" ? .0254 : 1;
  const root = new Group(); root.name = "Imported robot"; root.add(scene);
  root.applyMatrix4(basis); root.scale.multiplyScalar(scale); root.updateMatrixWorld(true);
  const bounds = sourceBounds ? sourceBounds.clone().applyMatrix4(root.matrixWorld) : new Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error("This file contains no visible geometry.");
  const center = bounds.getCenter(new Vector3()); root.position.sub(center); root.updateMatrixWorld(true);
  const size = bounds.getSize(new Vector3());
  if (![size.x, size.y, size.z].every((v) => Number.isFinite(v) && v > .0001) || Math.max(size.x, size.y, size.z) > 5) {
    throw new Error("The imported dimensions are outside the supported range. Check the units and export scale.");
  }
  return { root, size: { x: size.x, y: size.y, z: size.z } };
}

/** Bounded per-node samples keep recognition practical for large assemblies. */
export function describeCadScene(root: Object3D, triangleBudget = CAD_MAX_TRIANGLES, options: { nodeBudget?: number; includePart?: (object: Object3D) => boolean } = {}): { parts: CadPart[]; triangleCount: number } {
  root.updateMatrixWorld(true);
  const parts: CadPart[] = []; let triangleCount = 0, count = 0;
  const visit = (object: Object3D, path: number[], labels: string[], depth: number): number[] => {
    if (++count > (options.nodeBudget ?? CAD_MAX_PARTS) || depth > 64) throw new Error("The model exceeds the scene-node budget. Simplify the assembly first.");
    const samples: number[] = [];
    if ((object as Mesh).isMesh) {
      const meshObject = object as Mesh;
      const positions = meshObject.geometry.getAttribute("position"), index = meshObject.geometry.getIndex();
      if (!positions || positions.itemSize !== 3) throw new Error("A mesh is missing 3D vertex positions.");
      const vertices = index?.count ?? positions.count;
      triangleCount += vertices / 3;
      if (triangleCount > triangleBudget) throw new Error("This assembly exceeds the display triangle budget. Export a simplified model.");
      const point = new Vector3(), original = sourceSamples.get(meshObject.geometry), count = original ? original.length / 3 : Math.min(vertices, 1536);
      for (let i = 0; i < count; i++) {
        const vertex = Math.floor(i * vertices / count);
        if (original) point.fromArray(original, i * 3); else point.fromBufferAttribute(positions, index ? index.getX(vertex) : vertex);
        point.applyMatrix4(object.matrixWorld);
        if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error("A CAD vertex is not finite.");
        samples.push(point.x, point.y, point.z);
      }
    }
    const names = object.name ? [...labels, object.name] : labels;
    for (let i = 0; i < object.children.length; i++) samples.push(...visit(object.children[i]!, [...path, i], names, depth + 1));
    const sampled = samples.length <= 4608 ? samples : Array.from({ length: 1536 }, (_, i) => {
      const offset = Math.floor(i * (samples.length / 3) / 1536) * 3;
      return samples.slice(offset, offset + 3);
    }).flat();
    if (sampled.length && (!options.includePart || options.includePart(object))) {
      const bounds = new Box3().setFromObject(object), position = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3());
      const rotation = object.getWorldQuaternion(new Quaternion());
      parts.push({ id: path.join("/") || "root", path, name: object.name || "Unnamed component", labels: names, position: { x: position.x, y: position.y, z: position.z }, rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }, size: { x: size.x, y: size.y, z: size.z }, shape: describeCadShape(sampled) });
    }
    return sampled;
  };
  visit(root, [], [], 0);
  return { parts, triangleCount };
}

export function disposeCadScene(root: Object3D) {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  root.traverse((object) => { if ((object as Mesh).isMesh) { const meshObject = object as Mesh; geometries.add(meshObject.geometry); for (const material of Array.isArray(meshObject.material) ? meshObject.material : [meshObject.material]) materials.add(material); } });
  for (const geometry of geometries) geometry.dispose();
  const textures = new Set<Texture>();
  for (const material of materials) { for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value); material.dispose(); }
  for (const texture of textures) texture.dispose();
}
