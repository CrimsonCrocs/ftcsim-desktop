import { BoxGeometry, BufferGeometry, CatmullRomCurve3, CylinderGeometry, LatheGeometry, Matrix4, Quaternion, TorusGeometry, TubeGeometry, Vector2, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type Point = readonly [number, number, number];
export type Finish = "aluminum" | "edge" | "dark" | "rubber" | "alliance" | "green" | "gold" | "clear" | "lens" | "redWire";
export type GeometryPart = { finish: Finish; geometry: BufferGeometry };
const Y = new Vector3(0, 1, 0);

/** Bake fixed fasteners and frame members together: detail need not cost a draw call per screw. */
export class Assembly {
  private parts = new Map<Finish, BufferGeometry[]>();
  add(geometry: BufferGeometry, finish: Finish, at: Point = [0, 0, 0], rotation?: Quaternion) {
    geometry.applyMatrix4(new Matrix4().compose(new Vector3(...at), rotation ?? new Quaternion(), new Vector3(1, 1, 1)));
    const parts = this.parts.get(finish) ?? [];
    parts.push(geometry); this.parts.set(finish, parts);
    return this;
  }
  box(size: Point, at: Point, finish: Finish = "aluminum", rotation?: Quaternion) {
    return this.add(new BoxGeometry(...size), finish, at, rotation);
  }
  cylinder(radius: number, length: number, at: Point, finish: Finish, axis: Point = [0, 0, 1], segments = 20) {
    return this.add(new CylinderGeometry(radius, radius, length, segments), finish, at, new Quaternion().setFromUnitVectors(Y, new Vector3(...axis).normalize()));
  }
  ring(radius: number, tube: number, at: Point, finish: Finish, axis: Point = [0, 0, 1]) {
    return this.add(new TorusGeometry(radius, tube, 6, 40), finish, at, new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...axis).normalize()));
  }
  annulus(innerRadius: number, outerRadius: number, height: number, at: Point, finish: Finish) {
    const half = height / 2;
    const profile = [[innerRadius, -half], [outerRadius, -half], [outerRadius, half], [innerRadius, half], [innerRadius, -half]];
    return this.add(new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), 48), finish, at);
  }
  beam(from: Point, to: Point, width: number, depth = width, finish: Finish = "aluminum") {
    const start = new Vector3(...from); const end = new Vector3(...to); const direction = end.clone().sub(start);
    if (direction.lengthSq() < 1e-10) return this;
    return this.box([width, direction.length(), depth], start.add(end).multiplyScalar(0.5).toArray(), finish, new Quaternion().setFromUnitVectors(Y, direction.normalize()));
  }
  cable(points: Point[], radius: number, finish: Finish) {
    return this.add(new TubeGeometry(new CatmullRomCurve3(points.map((point) => new Vector3(...point))), points.length * 8, radius, 6, false), finish);
  }
  bolt(at: Point, axis: Point = [0, 0, 1]) {
    return this.cylinder(0.0032, 0.002, at, "edge", axis, 6);
  }
  finish(): GeometryPart[] {
    return [...this.parts].map(([finish, parts]) => {
      const geometry = mergeGeometries(parts, false)!;
      parts.forEach((part) => part.dispose());
      geometry.computeBoundingSphere();
      return { finish, geometry };
    });
  }
}
