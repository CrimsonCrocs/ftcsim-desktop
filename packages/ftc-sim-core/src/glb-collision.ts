import type { Vector3, WorldCollider } from "./world-types.js";

type GltfNode = { name?: string; mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] };
type Gltf = {
  scene?: number;
  scenes: { nodes?: number[] }[];
  nodes: GltfNode[];
  meshes: { name?: string; primitives: { attributes: { POSITION?: number }; indices?: number; mode?: number; extensions?: Record<string, unknown> }[] }[];
  accessors: { name?: string; bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; sparse?: unknown }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
};
const identityMatrix = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a: number[], b: number[]): number[] {
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) result[column * 4 + row]! += a[k * 4 + row]! * b[column * 4 + k]!;
  return result;
}
function nodeMatrix(node: GltfNode): number[] {
  if (node.matrix) { if (node.matrix.length !== 16) throw new Error("Invalid CAD node matrix."); return node.matrix; }
  const [x = 0, y = 0, z = 0, w = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  return [(1 - 2 * y * y - 2 * z * z) * sx, (2 * x * y + 2 * z * w) * sx, (2 * x * z - 2 * y * w) * sx, 0,
    (2 * x * y - 2 * z * w) * sy, (1 - 2 * x * x - 2 * z * z) * sy, (2 * y * z + 2 * x * w) * sy, 0,
    (2 * x * z + 2 * y * w) * sz, (2 * y * z - 2 * x * w) * sz, (1 - 2 * x * x - 2 * y * y) * sz, 0, tx, ty, tz, 1];
}

/** Reads the uncompressed, triangle-only collision GLBs from the CAD pipeline in browsers and Node. */
export function readGlbColliders(bytes: Uint8Array, prefix: string): WorldCollider[] {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.byteLength < 20 || data.getUint32(0, true) !== 0x46546c67 || data.getUint32(4, true) !== 2 || data.getUint32(8, true) !== data.byteLength) throw new Error("Invalid GLB 2.0 collision asset.");
  let gltf: Gltf | undefined; let binary: DataView | undefined;
  for (let offset = 12; offset + 8 <= data.byteLength;) {
    const length = data.getUint32(offset, true); const kind = data.getUint32(offset + 4, true); offset += 8;
    if (offset + length > data.byteLength) throw new Error("Truncated GLB collision asset.");
    if (kind === 0x4e4f534a) gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(offset, offset + length)).trim()) as Gltf;
    if (kind === 0x004e4942) binary = new DataView(bytes.buffer, bytes.byteOffset + offset, length);
    offset += length;
  }
  if (!gltf || !binary) throw new Error("Collision asset requires embedded JSON and binary chunks.");
  const document = gltf; const buffer = binary;
  const readAccessor = (index: number, components: number): number[] => {
    const accessor = document.accessors[index];
    if (!accessor || accessor.bufferView === undefined || accessor.sparse) throw new Error("Collision assets require dense accessors.");
    if ((components === 3 && accessor.type !== "VEC3") || (components === 1 && accessor.type !== "SCALAR")) throw new Error("Unexpected collision accessor dimensions.");
    const view = document.bufferViews[accessor.bufferView];
    if (!view || view.buffer !== 0) throw new Error("Collision asset references an external buffer.");
    const componentBytes = accessor.componentType === 5126 || accessor.componentType === 5125 ? 4 : accessor.componentType === 5123 ? 2 : accessor.componentType === 5121 ? 1 : 0;
    if (!componentBytes) throw new Error("Unsupported collision accessor component.");
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = view.byteStride ?? components * componentBytes;
    const result: number[] = [];
    for (let item = 0; item < accessor.count; item++) for (let component = 0; component < components; component++) {
      const offset = start + item * stride + component * componentBytes;
      if (offset + componentBytes > (view.byteOffset ?? 0) + view.byteLength) throw new Error("Collision accessor exceeds its buffer view.");
      const value = accessor.componentType === 5126 ? buffer.getFloat32(offset, true) : accessor.componentType === 5125 ? buffer.getUint32(offset, true) : accessor.componentType === 5123 ? buffer.getUint16(offset, true) : buffer.getUint8(offset);
      if (!Number.isFinite(value)) throw new Error("Collision asset contains a non-finite coordinate.");
      result.push(value);
    }
    return result;
  };
  const result: WorldCollider[] = [];
  const visiting = new Set<number>();
  const visit = (index: number, parent: number[]) => {
    if (visiting.has(index)) throw new Error("Collision asset contains a cyclic node hierarchy.");
    visiting.add(index);
    const node = document.nodes[index];
    if (!node) throw new Error("Collision asset references a missing node.");
    const matrix = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = document.meshes[node.mesh];
      if (!mesh) throw new Error("Collision asset references a missing mesh.");
      for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
        if ((primitive.mode ?? 4) !== 4 || primitive.attributes.POSITION === undefined || primitive.extensions?.KHR_draco_mesh_compression) throw new Error("Collision assets must contain uncompressed triangle primitives.");
        const vertices = readAccessor(primitive.attributes.POSITION, 3);
        for (let i = 0; i < vertices.length; i += 3) {
          const x = vertices[i]!; const y = vertices[i + 1]!; const z = vertices[i + 2]!;
          vertices[i] = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
          vertices[i + 1] = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!;
          vertices[i + 2] = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!;
        }
        const indices = primitive.indices === undefined ? Array.from({ length: vertices.length / 3 }, (_, i) => i) : readAccessor(primitive.indices, 1);
        if (indices.length % 3 || indices.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= vertices.length / 3)) throw new Error("Collision asset contains invalid triangle indices.");
        const part = document.accessors[primitive.attributes.POSITION]?.name?.replace(/-position$/, "") ?? node.name ?? mesh.name ?? String(index);
        result.push({ id: `${prefix}/${part}/${index}/${primitiveIndex}`, position: { x: 0, y: 0, z: 0 }, shape: { kind: "mesh", vertices, indices } });
      }
    }
    for (const child of node.children ?? []) visit(child, matrix);
    visiting.delete(index);
  };
  for (const node of document.scenes[document.scene ?? 0]?.nodes ?? []) visit(node, identityMatrix());
  if (!result.length) throw new Error("Collision asset contains no triangle meshes.");
  return result;
}

export function meshBounds(collider: WorldCollider): { center: Vector3; halfExtents: Vector3 } {
  if (collider.shape.kind !== "mesh") throw new Error("meshBounds requires triangle geometry.");
  const minimum = { x: Infinity, y: Infinity, z: Infinity }; const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
  const axes = ["x", "y", "z"] as const;
  for (let index = 0; index < collider.shape.vertices.length; index++) {
    const axis = axes[index % 3]!; const value = collider.shape.vertices[index]!;
    minimum[axis] = Math.min(minimum[axis], value); maximum[axis] = Math.max(maximum[axis], value);
  }
  return { center: { x: (minimum.x + maximum.x) / 2, y: (minimum.y + maximum.y) / 2, z: (minimum.z + maximum.z) / 2 }, halfExtents: { x: (maximum.x - minimum.x) / 2, y: (maximum.y - minimum.y) / 2, z: (maximum.z - minimum.z) / 2 } };
}
