import { add3, cross3, dot3, length3, scale3, sub3 } from "./world-math.js";
import type { ConvexRuleVolume, Vector3 } from "./world-types.js";

/** Exact sphere/convex-polytope intersection, including face, edge and vertex contact.
 * Expanding each plane alone would incorrectly score balls outside a corner.
 */
export function sphereIntersectsRuleVolume(center: Vector3, radius: number, volume: ConvexRuleVolume): boolean {
  const planes = volume.planes;
  const distances = planes.map(({ normal, offset }) => dot3(normal, center) - offset);
  if (distances.some((distance) => distance > radius + 1e-9)) return false;
  if (distances.every((distance) => distance <= 0)) return true;
  const feasible = (point: Vector3) => planes.every(({ normal, offset }) => dot3(normal, point) <= offset + 1e-8);
  const intersects = (point: Vector3) => length3(sub3(point, center)) <= radius + 1e-9 && feasible(point);
  for (let i = 0; i < planes.length; i++) {
    const a = planes[i]!;
    if (intersects(sub3(center, scale3(a.normal, distances[i]!)))) return true;
    for (let j = i + 1; j < planes.length; j++) {
      const b = planes[j]!, cosine = dot3(a.normal, b.normal), determinant = 1 - cosine * cosine;
      if (determinant < 1e-12) continue;
      const first = (distances[i]! - cosine * distances[j]!) / determinant;
      const second = (distances[j]! - cosine * distances[i]!) / determinant;
      if (intersects(sub3(center, add3(scale3(a.normal, first), scale3(b.normal, second))))) return true;
      for (let k = j + 1; k < planes.length; k++) {
        const c = planes[k]!, bc = cross3(b.normal, c.normal), divisor = dot3(a.normal, bc);
        if (Math.abs(divisor) < 1e-12) continue;
        const point = scale3(add3(add3(scale3(bc, a.offset), scale3(cross3(c.normal, a.normal), b.offset)), scale3(cross3(a.normal, b.normal), c.offset)), 1 / divisor);
        if (intersects(point)) return true;
      }
    }
  }
  return false;
}
