import type { Quaternion, Vector3 } from "./world-types.js";

export const VEC_ZERO: Vector3 = { x: 0, y: 0, z: 0 };
export const QUAT_IDENTITY: Quaternion = { x: 0, y: 0, z: 0, w: 1 };
export const add3 = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale3 = (a: Vector3, scale: number): Vector3 => ({ x: a.x * scale, y: a.y * scale, z: a.z * scale });
export const dot3 = (a: Vector3, b: Vector3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vector3, b: Vector3): Vector3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const length3 = (a: Vector3): number => Math.hypot(a.x, a.y, a.z);
export const unit3 = (a: Vector3): Vector3 => scale3(a, 1 / Math.max(1e-12, length3(a)));
export const conjugate = (q: Quaternion): Quaternion => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export const multiplyQ = (a: Quaternion, b: Quaternion): Quaternion => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
export const rotate3 = (v: Vector3, q: Quaternion): Vector3 => {
  const uv = cross3(q, v);
  const uuv = cross3(q, uv);
  return add3(v, scale3(add3(scale3(uv, q.w), uuv), 2));
};
export const axisAngle = (axis: Vector3, angle: number): Quaternion => ({ ...scale3(unit3(axis), Math.sin(angle / 2)), w: Math.cos(angle / 2) });
export const point3 = (local: Vector3, position: Vector3, rotation: Quaternion): Vector3 => add3(position, rotate3(local, rotation));
export const inversePoint3 = (point: Vector3, position: Vector3, rotation: Quaternion): Vector3 => rotate3(sub3(point, position), conjugate(rotation));

/** State is explicit so replay restoration includes sensor randomness. */
export class WorldRandom {
  state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 0x6d2b79f5; }
  next(): number {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }
  noise(scale: number): number { return (this.next() + this.next() + this.next() + this.next() - 2) * scale * Math.sqrt(3); }
}
