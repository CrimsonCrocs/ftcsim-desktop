import type { SimulatedCameraFrame } from "@ftc-studio/opmode-protocol";

export function validateCameraFrames(value: unknown, timeMs: number, configured?: readonly string[]): SimulatedCameraFrame[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) throw new Error("cameraFrames must contain at most 32 camera exposures");
  const seen = new Set<string>();
  let bytes = 0;
  return value.map((raw) => {
    if (!raw || typeof raw !== "object" || Object.keys(raw).some((key) => !["camera", "captureTimeMs", "width", "height", "imageBase64", "intrinsics"].includes(key))
      || typeof raw.camera !== "string" || !raw.camera.length || raw.camera.length > 128
      || raw.camera.trim() !== raw.camera || /[\x00-\x1f\x7f]/u.test(raw.camera)
      || seen.has(raw.camera) || (configured && !configured.includes(raw.camera))) throw new Error("cameraFrames references a duplicate or unconfigured camera");
    seen.add(raw.camera);
    if (!Number.isSafeInteger(raw.captureTimeMs) || raw.captureTimeMs < 0 || raw.captureTimeMs > timeMs) throw new Error("Camera capture time must not be in the future");
    if (!Number.isInteger(raw.width) || !Number.isInteger(raw.height) || raw.width < 1 || raw.height < 1
      || raw.width > 1280 || raw.height > 720) throw new Error("Camera image dimensions must be within 1280 × 720");
    if (typeof raw.imageBase64 !== "string" || raw.imageBase64.length > 699052 || raw.imageBase64.length % 4 !== 0
      || !/^[A-Za-z0-9+/]+={0,2}$/u.test(raw.imageBase64)) throw new Error("Camera JPEG must be base64 and at most 512 KiB");
    const image = Buffer.from(raw.imageBase64, "base64");
    bytes += image.byteLength;
    if (image.byteLength > 512 * 1024 || bytes > 2 * 1024 * 1024 || image[0] !== 0xff || image[1] !== 0xd8) throw new Error("Camera JPEG payload is invalid or exceeds the frame budget");
    let intrinsics: SimulatedCameraFrame["intrinsics"];
    if (raw.intrinsics !== undefined) {
      const values = raw.intrinsics;
      if (!values || typeof values !== "object" || Object.keys(values).length !== 4
        || ![values.fx, values.fy, values.cx, values.cy].every((value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e9)
        || values.fx <= 0 || values.fy <= 0 || values.cx < 0 || values.cx > raw.width || values.cy < 0 || values.cy > raw.height) throw new Error("Invalid rendered camera intrinsics");
      intrinsics = { fx: values.fx, fy: values.fy, cx: values.cx, cy: values.cy };
    }
    return { camera: raw.camera, captureTimeMs: raw.captureTimeMs, width: raw.width, height: raw.height, imageBase64: raw.imageBase64, ...(intrinsics ? { intrinsics } : {}) };
  });
}
