import type { WorldCollider, WorldFieldConfiguration, WorldRobotConfiguration } from "@ftc-studio/sim-core";
interface Point { x: number; z: number }
interface Box { left: number; right: number; top: number; bottom: number }
/** Conservative 2D route planning from published static CAD; live robots are handled by local steering. */
export class BotNavigation {
  private readonly boxes: Box[];
  private readonly bound: number;
  private readonly cell = 0.08;
  private readonly count: number;
  constructor(field: WorldFieldConfiguration, robot: WorldRobotConfiguration) {
    const margin = Math.hypot(robot.chassis.size.x, robot.chassis.size.z) / 2 + 0.015;
    this.bound = field.halfSize - Math.max(robot.chassis.size.x, robot.chassis.size.z) / 2 - 0.005;
    this.count = Math.floor(this.bound * 2 / this.cell) + 1;
    this.boxes = field.colliders.filter(collider => !collider.id.startsWith("wall")).flatMap(collider => {
      const bounds = colliderBounds(collider);
      if (!bounds || bounds.maxY < field.floorHeight + 0.01 || bounds.minY > field.floorHeight + robot.chassis.size.y + 0.16) return [];
      return [{ left: bounds.minX - margin, right: bounds.maxX + margin, top: bounds.minZ - margin, bottom: bounds.maxZ + margin }];
    });
  }
  clear(point: Point): boolean {
    return Math.abs(point.x) <= this.bound && Math.abs(point.z) <= this.bound && !this.boxes.some(box => point.x > box.left && point.x < box.right && point.z > box.top && point.z < box.bottom);
  }
  segmentClear(from: Point, to: Point): boolean {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const samples = Math.max(1, Math.ceil(length / (this.cell / 2)));
    for (let i = 1; i <= samples; i++) if (!this.clear({ x: from.x + (to.x - from.x) * i / samples, z: from.z + (to.z - from.z) * i / samples })) return false;
    return true;
  }
  /** Physical contact can leave a chassis inside conservative clearance, even though it is outside the CAD solid. */
  private escape(from: Point): Point | undefined {
    const penetration = (point: Point) => this.boxes.reduce((sum, box) => sum + Math.max(0, Math.min(point.x - box.left, box.right - point.x, point.z - box.top, box.bottom - point.z)), 0);
    let best: Point | undefined, bestDistance = Infinity;
    for (let direction = 0; direction < 32; direction++) {
      const angle = direction * Math.PI / 16;
      let depth = penetration(from);
      for (let distance = 0.025; distance <= 0.8 && distance < bestDistance; distance += 0.025) {
        const candidate = { x: from.x + Math.cos(angle) * distance, z: from.z + Math.sin(angle) * distance };
        const nextDepth = penetration(candidate);
        if (Math.abs(candidate.x) > this.bound || Math.abs(candidate.z) > this.bound || nextDepth > depth + 1e-6) break;
        if (this.clear(candidate)) { best = candidate; bestDistance = distance; break; }
        depth = nextDepth;
      }
    }
    return best;
  }
  route(from: Point, to: Point): Point[] {
    if (!this.clear(to)) return [];
    if (!this.clear(from)) {
      const escape = this.escape(from);
      if (!escape) return [];
      const onward = this.route(escape, to);
      return onward.length ? [escape, ...onward] : [];
    }
    if (this.segmentClear(from, to)) return [to];
    const index = (point: Point) => Math.max(0, Math.min(this.count - 1, Math.round((point.x + this.bound) / this.cell))) + this.count * Math.max(0, Math.min(this.count - 1, Math.round((point.z + this.bound) / this.cell)));
    const point = (id: number) => ({ x: (id % this.count) * this.cell - this.bound, z: Math.floor(id / this.count) * this.cell - this.bound });
    const start = index(from), goal = index(to);
    const open = new Set([start]), closed = new Set<number>();
    const costs = new Map([[start, 0]]), previous = new Map<number, number>();
    const estimate = (id: number) => { const p = point(id); return Math.hypot(p.x - to.x, p.z - to.z); };
    while (open.size) {
      let current = -1, best = Infinity;
      for (const id of open) { const score = costs.get(id)! + estimate(id); if (score < best) { best = score; current = id; } }
      if (current === goal) {
        const route: Point[] = [to];
        while (current !== start) { route.unshift(point(current)); current = previous.get(current)!; }
        const smoothed: Point[] = []; let anchor = from;
        for (let i = 0; i < route.length;) {
          let end = route.length - 1;
          while (end > i && !this.segmentClear(anchor, route[end]!)) end--;
          anchor = route[end]!; smoothed.push(anchor); i = end + 1;
        }
        return smoothed;
      }
      open.delete(current); closed.add(current);
      const origin = point(current), x = current % this.count, z = Math.floor(current / this.count);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if ((!dx && !dz) || x + dx < 0 || x + dx >= this.count || z + dz < 0 || z + dz >= this.count) continue;
        const id = current + dx + dz * this.count;
        if (closed.has(id) || !this.segmentClear(origin, point(id))) continue;
        const cost = costs.get(current)! + Math.hypot(dx, dz) * this.cell;
        if (cost >= (costs.get(id) ?? Infinity)) continue;
        costs.set(id, cost); previous.set(id, current); open.add(id);
      }
    }
    return [];
  }
}
function colliderBounds(collider: WorldCollider) {
  const shape = collider.shape;
  const vertices = shape.kind === "mesh" ? shape.vertices : (() => {
    const half = shape.kind === "box" ? shape.halfExtents : { x: shape.radius, y: shape.halfHeight, z: shape.radius };
    const points: number[] = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push(x * half.x, y * half.y, z * half.z); return points;
  })();
  if (!vertices.length) return null;
  const result = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  const q = collider.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i]!, y = vertices[i + 1]!, z = vertices[i + 2]!;
    const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
    const wx = collider.position.x + x + q.w * tx + q.y * tz - q.z * ty;
    const wy = collider.position.y + y + q.w * ty + q.z * tx - q.x * tz;
    const wz = collider.position.z + z + q.w * tz + q.x * ty - q.y * tx;
    result.minX = Math.min(result.minX, wx); result.maxX = Math.max(result.maxX, wx);
    result.minY = Math.min(result.minY, wy); result.maxY = Math.max(result.maxY, wy);
    result.minZ = Math.min(result.minZ, wz); result.maxZ = Math.max(result.maxZ, wz);
  }
  return result;
}
