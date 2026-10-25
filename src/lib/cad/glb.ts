import { CAD_MAX_GLB_BYTES } from "./types";

/** Imported models must remain local and portable; GLTFLoader must never fetch CAD-supplied URLs. */
export function validateCadGlb(bytes: ArrayBuffer): void {
  if (bytes.byteLength > CAD_MAX_GLB_BYTES) throw new Error("The display model exceeds the 32 MiB geometry budget. Export a less detailed assembly.");
  if (bytes.byteLength < 20) throw new Error("The GLB file is incomplete.");
  const view = new DataView(bytes);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) throw new Error("Use a valid glTF 2.0 binary (.glb) model.");
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || length > bytes.byteLength - 20) throw new Error("The GLB JSON chunk is invalid.");
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)));
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (resource.uri !== undefined && (typeof resource.uri !== "string" || !/^data:(?:image\/(?:png|jpeg|webp)|application\/octet-stream);base64,[a-zA-Z0-9+/=]+$/.test(resource.uri))) {
      throw new Error("The model links to external files. Export a self-contained GLB with embedded textures and buffers.");
    }
  }
  if ((json.extensionsRequired ?? []).some((extension: string) => ["KHR_draco_mesh_compression", "EXT_meshopt_compression"].includes(extension))) {
    throw new Error("Export the GLB without Draco or Meshopt compression.");
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 16384) text += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(text);
}
export function base64ToBytes(base64: string): ArrayBuffer {
  const text = atob(base64), bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes.buffer;
}
