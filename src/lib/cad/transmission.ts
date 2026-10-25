import { getCadProduct } from "./catalog";
import type { CadMatch, CadPart, CadVector } from "./types";

export interface CadMotionLink {
  partId: string;
  motorPartId: string;
  /** Part angular displacement / manufacturer motor output displacement. */
  ratio: number;
  axis: CadVector;
  pivot: CadVector;
  evidence: "coaxial" | "gear-mesh";
}
export interface CadTransmission { links: CadMotionLink[]; warnings: string[] }
export interface CadMotionOptions { excludedPartIds?: string[]; ratios?: Record<string, number> }
type Node = { part: CadPart; kind: "motor" | "shaft" | "wheel" | "gear" | "coupler"; axis: CadVector; pivot: CadVector; halfLength: number; radius: number; teeth?: number };
const dot = (a: CadVector, b: CadVector) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: CadVector, b: CadVector): CadVector => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (v: CadVector) => Math.hypot(v.x, v.y, v.z);
export const cadAncestor = (a: CadPart, b: CadPart) => a.path.length < b.path.length && a.path.every((v, i) => b.path[i] === v);
export function canonicalCadAxis(axis: CadVector): CadVector {
  const components = [axis.x, axis.y, axis.z], absolute = components.map(Math.abs), major = absolute.indexOf(Math.max(...absolute));
  const sign = (components[major] ?? 1) < 0 ? -1 : 1, norm = length(axis) || 1;
  return { x: axis.x * sign / norm, y: axis.y * sign / norm, z: axis.z * sign / norm };
}
function makeNode(part: CadPart, kind: Node["kind"]): Node | null {
  const flat = kind === "wheel" || kind === "gear" || kind === "coupler" && part.shape.dimensions[0]! < part.shape.dimensions[1]! * .65;
  const axis = flat ? part.shape.shortAxis : part.shape.longAxis;
  if (!axis) return null;
  return { part, kind, axis: canonicalCadAxis(axis), pivot: part.position, halfLength: part.shape.dimensions[flat ? 0 : 2]! / 2, radius: part.shape.dimensions[1]! / 2,
    teeth: kind === "gear" ? Number(part.name.match(/(?:^|\D)(\d{1,3})\s*(?:tooth|teeth|t\b)/i)?.[1]) || undefined : undefined };
}
function coaxial(a: Node, b: Node): boolean {
  if (Math.abs(dot(a.axis, b.axis)) < .995) return false;
  const delta = sub(b.pivot, a.pivot), axial = dot(delta, a.axis);
  const radial = Math.sqrt(Math.max(0, dot(delta, delta) - axial * axial));
  return radial <= .0015 && Math.abs(axial) <= a.halfLength + b.halfLength + .003;
}
function gearMesh(a: Node, b: Node): "mesh" | "unknown-ratio" | null {
  if (a.kind !== "gear" || b.kind !== "gear" || Math.abs(dot(a.axis, b.axis)) < .995) return null;
  if (/bevel|worm|internal gear/i.test((a.part.name + " " + b.part.name).replace(/[_-]+/g, " "))) return null;
  const delta = sub(b.pivot, a.pivot), axial = Math.abs(dot(delta, a.axis));
  if (axial > a.halfLength + b.halfLength + .001) return null;
  const radial = Math.sqrt(Math.max(0, dot(delta, delta) - axial * axial));
  if (radial <= Math.max(a.radius, b.radius) * 1.05) return null;
  if (!a.teeth || !b.teeth) return Math.abs(radial - a.radius - b.radius) <= Math.max(.003, Math.min(a.radius, b.radius) * .2) ? "unknown-ratio" : null;
  const moduleA = a.radius * 2 / (a.teeth + 2), moduleB = b.radius * 2 / (b.teeth + 2);
  if (Math.abs(moduleA - moduleB) / Math.max(moduleA, moduleB) > .12) return null;
  const pitchDistance = (a.teeth + b.teeth) * (moduleA + moduleB) / 4;
  return Math.abs(radial - pitchDistance) <= Math.max(.0015, Math.max(moduleA, moduleB) * 1.5) ? "mesh" : null;
}

/** Infer only rigid coaxial trains and external parallel spur gears. Proximity
 * alone cannot establish bearings, welded joints, belts or closed-loop mechanisms. */
export function inferCadTransmission(parts: CadPart[], matches: CadMatch[], options: CadMotionOptions = {}): CadTransmission {
  const matched = new Map(matches.filter((m) => m.enabled).map((m) => [m.partId, getCadProduct(m.productId)]));
  const excluded = new Set(options.excludedPartIds ?? []), warnings = new Set<string>();
  const candidates: Node[] = [];
  for (const part of parts) {
    if (excluded.has(part.id)) continue;
    const product = matched.get(part.id), name = part.name.toLowerCase().replace(/[_-]+/g, " "), d = part.shape.dimensions;
    let kind: Node["kind"] | undefined = product?.kind === "motor" ? "motor" : product?.kind === "wheel" ? "wheel" : undefined;
    if (!kind && !/bearing|bushing|housing|frame|mount|plate|screw|standoff|washer|spacer|shield|cap|sticker|\brobot\b|\bdrivetrain\b|\bgear\s*train\b/i.test(name)) {
      if (/shaft|axle/i.test(name) && d[2]! > .015 && d[2]! > d[1]! * 2 && d[1]! < .04) kind = "shaft";
      else if (/gear/i.test(name) && !/gearbox|gear motor|gearmotor/i.test(name) && d[0]! < d[1]! * .6 && d[1]! / d[2]! > .82) kind = "gear";
      else if (/coupl|sonic hub|clamping hub|shaft hub/i.test(name)) kind = "coupler";
    }
    const node = kind && makeNode(part, kind); if (node) candidates.push(node);
  }
  let nodes = candidates.filter((node) => !candidates.some((other) => other !== node && other.kind === node.kind && cadAncestor(other.part, node.part)));
  // Use a modeled output shaft when available; the housing's PCA can be skewed
  // by an encoder connector, gearbox flange or mounting features.
  const outputShafts = new Set<string>(), uncertainMotors = new Set<string>(), motors = nodes.filter((n) => n.kind === "motor");
  for (const motor of motors) {
    const protrusion = (node: Node) => Math.abs(dot(sub(node.pivot, motor.pivot), motor.axis)) + node.halfLength;
    const shaft = nodes.filter((n) => n.kind === "shaft" && cadAncestor(motor.part, n.part)).sort((a, b) => protrusion(b) - protrusion(a) || b.halfLength - a.halfLength)[0];
    if (shaft) { outputShafts.add(shaft.part.id); motor.axis = shaft.axis; motor.pivot = shaft.pivot; motor.halfLength = shaft.halfLength; }
    else if (matched.get(motor.part.id)?.outputShaftRequired) { uncertainMotors.add(motor.part.id); warnings.add(`The output shaft of ${motor.part.name} is not modeled. Its right-angle housing cannot establish an axis; motion was left unbound.`); }
  }
  // Manufacturer motor profiles already include their internal gearbox. Bind its
  // output shaft, rather than attempting to rediscover a planetary mechanism.
  nodes = nodes.filter((node) => !uncertainMotors.has(node.part.id) && (node.kind === "motor" || outputShafts.has(node.part.id) || !motors.some((motor) => cadAncestor(motor.part, node.part))));
  const edges = nodes.map(() => [] as { to: number; ratio: number; gear: boolean }[]);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i]!, b = nodes[j]!;
    let ratio: number | undefined, gear = false;
    if (coaxial(a, b)) ratio = Math.sign(dot(a.axis, b.axis));
    else {
      const mesh = gearMesh(a, b);
      if (mesh === "unknown-ratio") warnings.add(`Possible gear contact: ${a.part.name} ↔ ${b.part.name}. Tooth counts are needed to establish the ratio.`);
      else if (mesh === "mesh") { ratio = -a.teeth! / b.teeth! * Math.sign(dot(a.axis, b.axis)); gear = true; }
    }
    if (ratio !== undefined) { edges[i]!.push({ to: j, ratio, gear }); edges[j]!.push({ to: i, ratio: 1 / ratio, gear }); }
  }
  const reached = new Map<number, { motor: Node; ratio: number; gear: boolean }[]>();
  for (let root = 0; root < nodes.length; root++) if (nodes[root]!.kind === "motor") {
    const ratios = new Map<number, { ratio: number; gear: boolean }>([[root, { ratio: 1, gear: false }]]), queue = [root];
    let conflict = false;
    for (let next = 0; next < queue.length; next++) {
      const from = queue[next]!, prior = ratios.get(from)!;
      for (const edge of edges[from]!) {
        const ratio = prior.ratio * edge.ratio, known = ratios.get(edge.to);
        if (!Number.isFinite(ratio) || Math.abs(ratio) > 1000 || Math.abs(ratio) < .001) { conflict = true; continue; }
        if (known) { if (Math.abs(known.ratio - ratio) > Math.abs(ratio) * .02) conflict = true; continue; }
        ratios.set(edge.to, { ratio, gear: prior.gear || edge.gear }); queue.push(edge.to);
      }
    }
    if (conflict) { warnings.add(`Conflicting gear loop near ${nodes[root]!.part.name}. Motion was left unbound for review.`); continue; }
    for (const [index, value] of ratios) if (index !== root && nodes[index]!.kind !== "motor") {
      const entries = reached.get(index) ?? []; entries.push({ motor: nodes[root]!, ...value }); reached.set(index, entries);
    }
  }
  const links: CadMotionLink[] = [];
  for (const [index, sources] of reached) {
    const node = nodes[index]!;
    if (sources.length !== 1) { warnings.add(`${node.part.name} connects to multiple motors. Choose its driver before binding motion.`); continue; }
    const source = sources[0]!, ratio = options.ratios?.[node.part.id] ?? source.ratio;
    if (!Number.isFinite(ratio) || Math.abs(ratio) < .001 || Math.abs(ratio) > 1000) continue;
    links.push({ partId: node.part.id, motorPartId: source.motor.part.id, ratio, axis: node.axis, pivot: node.pivot, evidence: source.gear ? "gear-mesh" : "coaxial" });
  }
  return { links, warnings: [...warnings] };
}
