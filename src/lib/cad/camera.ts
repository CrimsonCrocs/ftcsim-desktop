import { Matrix4, Quaternion, Vector3 } from "three";
import type { CadVector } from "./types";

/** A camera looks along local +X. Keep its image upright against robot +Y. */
export function cadCameraRotation(forward: CadVector) {
  const x = new Vector3(forward.x, forward.y, forward.z);
  if (![x.x, x.y, x.z].every(Number.isFinite) || x.lengthSq() < 1e-12) throw new Error("Camera forward vector needs a non-zero direction.");
  x.normalize();
  const up = Math.abs(x.y) > .999 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
  const z = new Vector3().crossVectors(x, up).normalize(), y = new Vector3().crossVectors(z, x).normalize();
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}
