import type { RobotVariant } from "@/lib/studio-types";
import { openRobotConfiguration, type DriveRole, type RobotConfigurationDocument, type RobotConfigurationV3 } from "@/lib/robot-configuration";
import { getCadProduct } from "./catalog";
import type { CadAnalysis, CadMatch, CadPart, CadVector } from "./types";
import { inferCadTransmission, type CadMotionOptions } from "./transmission";
import { cadCameraRotation } from "./camera";

const roles: DriveRole[] = ["frontLeft", "frontRight", "backLeft", "backRight"];
const roleNames = { frontLeft: "front_left_drive", frontRight: "front_right_drive", backLeft: "back_left_drive", backRight: "back_right_drive", center: "center_drive" };
const distance = (a: CadVector, b: CadVector) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
const roundedMount = (v: CadVector): CadVector => ({ x: Math.round(v.x * 10000) / 10000, y: Math.round(v.y * 10000) / 10000, z: Math.round(v.z * 10000) / 10000 });
const byId = (parts: CadPart[], id: string) => parts.find((part) => part.id === id)!;

export function inferCadDrivetrain(parts: CadPart[], matches: CadMatch[]): RobotVariant | null {
  const wheels = matches.filter((match) => match.enabled && getCadProduct(match.productId)?.kind === "wheel");
  if (wheels.length < 4) return null;
  if (wheels.filter((match) => getCadProduct(match.productId)?.wheel?.kind === "mecanum").length >= 4) return "mecanum";
  if (wheels.some((match) => getCadProduct(match.productId)?.wheel?.kind === "omni")) {
    if (wheels.length === 5) return "h-drive";
    return wheels.length === 4 && wheels.every((match) => { const axle = byId(parts, match.partId).shape.shortAxis; return axle && Math.abs(axle.x) > .4 && Math.abs(axle.z) > .4; }) ? "x-drive" : null;
  }
  // Geometry establishes positions; a rectangular four-wheel traction layout is a tank base.
  const points = wheels.map((match) => byId(parts, match.partId).position);
  return Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)) > .05
    && Math.max(...points.map((p) => p.z)) - Math.min(...points.map((p) => p.z)) > .05 ? "tank" : null;
}

function cornerWheels(parts: CadPart[], matches: CadMatch[]): Partial<Record<DriveRole, CadMatch>> {
  const wheels = matches.filter((match) => match.enabled && getCadProduct(match.productId)?.kind === "wheel");
  const result: Partial<Record<DriveRole, CadMatch>> = {};
  for (const role of roles) {
    const candidates = wheels.filter((wheel) => {
      const p = byId(parts, wheel.partId).position;
      return (role.startsWith("front") ? p.x > .02 : p.x < -.02) && (role.endsWith("Left") ? p.z < -.02 : p.z > .02);
    }).sort((a, b) => byId(parts, a.partId).position.y - byId(parts, b.partId).position.y);
    if (candidates[0]) result[role] = candidates[0];
  }
  const center = wheels.find((wheel) => !Object.values(result).includes(wheel));
  if (center) result.center = center;
  return result;
}

export function suggestCadAssignments(analysis: Pick<CadAnalysis, "parts" | "matches">, current?: RobotConfigurationDocument): CadMatch[] {
  const matches = analysis.matches.map((match) => ({ ...match }));
  const motors = matches.filter((match) => match.enabled && getCadProduct(match.productId)?.kind === "motor");
  const wheels = cornerWheels(analysis.parts, matches);
  const transmission = inferCadTransmission(analysis.parts, matches);
  const assigned = new Set(motors.filter((motor) => motor.driveRole).map((motor) => motor.partId));
  for (const role of roles) {
    const wheel = wheels[role]; if (!wheel || motors.some((motor) => motor.driveRole === role)) continue;
    const link = transmission.links.find((entry) => entry.partId === wheel.partId);
    const motor = link && motors.find((entry) => entry.partId === link.motorPartId && !entry.driveRole && !entry.driveRoleEdited);
    if (motor) { motor.driveRole = role; assigned.add(motor.partId); }
  }
  // Globally minimize wheel-to-motor distance, without assigning a motor twice.
  const remaining = roles.filter((role) => Boolean(wheels[role]) && !motors.some((m) => m.driveRole === role));
  let best = Infinity, bestAssignment: CadMatch[] = [];
  const search = (index: number, selected: CadMatch[], cost: number) => {
    if (cost >= best) return;
    if (index === remaining.length) { best = cost; bestAssignment = [...selected]; return; }
    const role = remaining[index]!, wheel = wheels[role];
    if (!wheel) return;
    const target = byId(analysis.parts, wheel.partId).position;
    const connected = transmission.links.find((entry) => entry.partId === wheel.partId);
    for (const motor of motors) if (!motor.driveRoleEdited && !assigned.has(motor.partId) && !selected.includes(motor) && (!connected || connected.motorPartId === motor.partId)) {
      const a = byId(analysis.parts, motor.partId).shape.longAxis, b = byId(analysis.parts, wheel.partId).shape.shortAxis;
      const orientationCost = a && b ? .0004 * (1 - Math.abs(a.x * b.x + a.y * b.y + a.z * b.z)) : 0;
      search(index + 1, [...selected, motor], cost + distance(byId(analysis.parts, motor.partId).position, target) + orientationCost);
    }
  };
  if (motors.length <= 8) search(0, [], 0);
  bestAssignment.forEach((motor, index) => { motor.driveRole = remaining[index]; assigned.add(motor.partId); });
  // Four named motors in separate quadrants can also be configured without wheel CAD.
  if (motors.length === 4 && !Object.keys(wheels).length) for (const motor of motors) {
    const p = byId(analysis.parts, motor.partId).position;
    if (!motor.driveRoleEdited && !motor.driveRole && Math.abs(p.x) > .02 && Math.abs(p.z) > .02) motor.driveRole = `${p.x > 0 ? "front" : "back"}${p.z < 0 ? "Left" : "Right"}` as DriveRole;
  }
  if (wheels.center && inferCadDrivetrain(analysis.parts, matches) === "h-drive") {
    const center = byId(analysis.parts, wheels.center.partId).position;
    const motor = motors.filter((entry) => !entry.driveRole && !entry.driveRoleEdited).sort((a, b) => distance(byId(analysis.parts, a.partId).position, center) - distance(byId(analysis.parts, b.partId).position, center))[0];
    if (motor) motor.driveRole = "center";
  }
  // Names are a fallback for assemblies without enough geometric placement.
  for (const role of roles) if (!motors.some((motor) => motor.driveRole === role)) {
    const named = motors.find((motor) => {
      if (motor.driveRole || motor.driveRoleEdited) return false;
      const label = byId(analysis.parts, motor.partId).labels.join(" ").toLowerCase().replace(/[^a-z]/g, "");
      return label.includes(role.toLowerCase()) || label.includes(role.replace("back", "rear").toLowerCase());
    });
    if (named) named.driveRole = role;
  }
  const names = new Map<string, number>();
  for (const match of matches) {
    const product = getCadProduct(match.productId); if (!product) continue;
    const base = match.driveRole ? roleNames[match.driveRole] : product.kind === "camera" ? product.camera?.kind === "webcam" ? "Webcam" : product.camera!.kind : product.kind;
    const count = (names.get(base) ?? 0) + 1; names.set(base, count);
    const existing = match.driveRole ? current?.resolved.driveMotors[match.driveRole]?.hardwareMapName : current?.configuration.physical.visualModel?.hardware.find((entry) => entry.productId === match.productId && entry.partName === byId(analysis.parts, match.partId).name)?.hardwareName;
    match.hardwareName ||= existing ?? (match.driveRole ? base : `${base}${product.kind === "camera" && product.camera?.kind === "webcam" ? " " : "_"}${count}`);
  }
  return matches;
}

export function configureCadRobot(analysis: CadAnalysis, matches: CadMatch[], variant: RobotVariant, massKg: number, current: RobotConfigurationDocument, appearanceOnly = false, motion: CadMotionOptions = {}): RobotConfigurationDocument {
  const configuration: RobotConfigurationV3 = structuredClone(current.configuration);
  const visual = { version: 1 as const, sourceFileName: analysis.sourceFileName, sourceSha256: analysis.sourceSha256, glbBase64: analysis.glbBase64,
    wheelBindings: [] as NonNullable<typeof configuration.physical.visualModel>["wheelBindings"],
    motionBindings: [] as NonNullable<NonNullable<typeof configuration.physical.visualModel>["motionBindings"]>,
    hardware: matches.filter((m) => m.enabled && m.productId).map((m) => ({ partName: byId(analysis.parts, m.partId).name, productId: m.productId!, hardwareName: m.hardwareName, method: m.method })) };
  if (appearanceOnly) {
    configuration.physical.visualModel = visual;
    return openRobotConfiguration(JSON.stringify({ ...current.manifest, schemaVersion: 3, robot: configuration }));
  }
  const selected = matches.filter((match) => match.enabled && getCadProduct(match.productId));
  const motors = selected.filter((match) => getCadProduct(match.productId)!.kind === "motor");
  if (motors.length > 8) throw new Error("The simulator supports eight DC motors. Exclude the extra matches before importing.");
  const servos = selected.filter((match) => getCadProduct(match.productId)!.kind === "servo");
  if (servos.length > 8) throw new Error("The simulator supports eight servos. Exclude the extra matches before importing.");
  const sensors = selected.filter((match) => getCadProduct(match.productId)!.kind === "sensor");
  if (sensors.length > 8) throw new Error("The simulator supports eight I2C sensors. Exclude the extra matches before importing.");
  if (selected.filter((match) => getCadProduct(match.productId)!.kind === "camera").length > 4) throw new Error("The simulator supports four cameras. Exclude the extra matches before importing.");
  const needsExpansion = motors.length > 4 || servos.length > 6 || sensors.length > 4 || selected.some((m) => m.productId === "rev-expansion-hub");
  configuration.controllers = [{ id: "control-hub", kind: "rev-control-hub", name: "Control Hub", address: 1 }, ...(needsExpansion ? [{ id: "expansion-hub", kind: "rev-expansion-hub" as const, name: "Expansion Hub", address: 2 }] : [])];
  configuration.drivetrain = { kind: variant, bindings: {} };
  configuration.devices = motors.map((match, i) => ({ id: `cad-motor-${i}`, kind: "dc-motor", hardwareMapName: match.hardwareName, motorModelId: getCadProduct(match.productId)!.motorModelId!, controllerId: i < 4 ? "control-hub" : "expansion-hub", port: i % 4 }));
  const boundRoles = new Set<DriveRole>();
  for (let i = 0; i < motors.length; i++) if (motors[i]!.driveRole) {
    const role = motors[i]!.driveRole!;
    if (boundRoles.has(role)) throw new Error("Each drivetrain position needs a different motor. Check the drive assignments.");
    boundRoles.add(role); configuration.drivetrain.bindings[role] = configuration.devices[i]!.id;
  }
  const wheels = cornerWheels(analysis.parts, matches);
  const transmission = inferCadTransmission(analysis.parts, matches, { ratios: motion.ratios });
  const drivenWheels = new Map(motors.flatMap((motor) => {
    const wheel = motor.driveRole && wheels[motor.driveRole];
    const link = wheel && transmission.links.find((entry) => entry.partId === wheel.partId && entry.motorPartId === motor.partId);
    return link ? [[motor.partId, link] as const] : [];
  }));
  const physical = configuration.physical;
  physical.id = `cad-${analysis.sourceSha256.slice(0, 16)}`; physical.label = analysis.sourceFileName.replace(/\.[^.]+$/, "");
  // Collision is explicitly a chassis box; unmeasured mass/friction remain editable estimates.
  physical.chassis = { size: { ...analysis.size }, massKg, centerOfMass: { x: 0, y: 0, z: 0 } };
  physical.motors = motors.map((match) => ({ name: match.hardwareName, profile: { ...getCadProduct(match.productId)!.motor! }, reduction: 1 / Math.abs(drivenWheels.get(match.partId)?.ratio ?? 1), efficiency: .9, inverted: Boolean(match.driveRole?.endsWith("Right")) !== ((drivenWheels.get(match.partId)?.ratio ?? 1) < 0) }));
  physical.wheels = motors.flatMap((match) => {
    if (!match.driveRole) return [];
    const wheel = wheels[match.driveRole], wheelPart = wheel ? byId(analysis.parts, wheel.partId) : null;
    const motorPart = byId(analysis.parts, match.partId), role = match.driveRole;
    const measuredRadius = wheelPart ? wheelPart.shape.dimensions[1]! / 2 : 0;
    const radius = measuredRadius >= .015 && measuredRadius <= .15 ? measuredRadius : wheel ? getCadProduct(wheel.productId)!.wheel!.radius : .048;
    const mount = wheelPart ? { ...wheelPart.position } : { x: motorPart.position.x, y: -.5 * analysis.size.y + radius, z: motorPart.position.z };
    const lateral = role === "center", mecanum = variant === "mecanum";
    const axle = wheelPart?.shape.shortAxis ?? (lateral ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 });
    const tractionAngle = lateral ? -Math.PI / 2 : mecanum ? (role === "frontLeft" || role === "backRight" ? -1 : 1) * Math.PI / 4 : variant === "x-drive" ? (role === "frontLeft" || role === "backRight" ? -1 : 1) * Math.PI / 4 : 0;
    const positiveAxle = lateral ? axle.x >= 0 : axle.z >= 0;
    if (wheelPart) visual.wheelBindings.push({ path: wheelPart.path, motor: match.hardwareName, pivot: mount, axis: positiveAxle ? axle : { x: -axle.x, y: -axle.y, z: -axle.z } });
    return [{ motor: match.hardwareName, mount, radius, ...(wheelPart ? { width: wheelPart.shape.dimensions[0], axle } : {}), tractionAngle, driveProjection: mecanum ? Math.SQRT1_2 : 1, grip: .85, rollerGrip: variant === "tank" ? .85 : .035, inertiaKgM2: .00035, suspensionTravel: .005, springNPerM: 12000, damperNsPerM: 130 }];
  });
  const excludedMotion = new Set(motion.excludedPartIds ?? []);
  visual.motionBindings = visual.wheelBindings.flatMap((binding) => {
    const partId = binding.path.join("/");
    return excludedMotion.has(partId) ? [] : [{ ...binding, phase: "wheel" as const, ratio: 1 }];
  });
  for (const link of transmission.links) {
    const match = motors.find((motor) => motor.partId === link.motorPartId);
    if (!match || excludedMotion.has(link.partId)) continue;
    const part = byId(analysis.parts, link.partId), driveWheel = drivenWheels.get(match.partId);
    if (visual.motionBindings.some((binding) => binding.path.join("/") === part.id)) continue;
    visual.motionBindings.push({ path: part.path, motor: match.hardwareName, pivot: link.pivot, axis: link.axis,
      phase: match.driveRole ? "wheel" : "motor", ratio: link.ratio / (match.driveRole ? driveWheel?.ratio ?? 1 : 1) });
  }
  physical.servos = servos.map((match) => { const product = getCadProduct(match.productId)!; return { name: match.hardwareName, mount: { ...byId(analysis.parts, match.partId).position }, minRadians: 0, maxRadians: Math.PI, speedRadiansPerSecond: product.servo?.speedRadiansPerSecond ?? 5, torqueNm: product.servo?.torqueNm ?? 2, inertiaKgM2: .004, source: product.servo ? `${product.source}; ${product.servo.voltage} V profile, 180° editable starting travel; verify programmed endpoints` : "CAD detected identity; editable unmeasured servo dynamics" }; });
  configuration.servoPorts = servos.map((match, i) => ({ id: `cad-servo-${i}`, hardwareMapName: match.hardwareName, controllerId: i < 6 ? "control-hub" : "expansion-hub", port: i % 6 }));
  physical.sensors = sensors.map((match) => ({ name: match.hardwareName, kind: getCadProduct(match.productId)!.sensorKind!, mount: { position: { ...byId(analysis.parts, match.partId).position }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, maximumRange: 2, noise: 0, latencyMs: 20 }));
  configuration.sensorPorts = sensors.map((match, i) => ({ id: `cad-sensor-${i}`, hardwareMapName: match.hardwareName, kind: getCadProduct(match.productId)!.sensorKind!, controllerId: i < 4 ? "control-hub" : "expansion-hub", port: i % 4 }));
  physical.cameras = selected.filter((match) => getCadProduct(match.productId)!.kind === "camera").map((match) => {
    const product = getCadProduct(match.productId)!, part = byId(analysis.parts, match.partId);
    const optics = match.camera ?? { forward: { x: 1, y: 0, z: 0 }, ...product.camera! };
    if (![optics.horizontalFov, optics.verticalFov].every((angle) => Number.isFinite(angle) && angle > 0 && angle < 180)) throw new Error("Camera field of view must be between 0° and 180°.");
    return { name: match.hardwareName, mount: { position: roundedMount(part.position), rotation: cadCameraRotation(optics.forward) }, horizontalFovRadians: optics.horizontalFov * Math.PI / 180, verticalFovRadians: optics.verticalFov * Math.PI / 180, maximumRange: 4, latencyMs: 80, framesPerSecond: 30, positionNoiseMeters: 0, angleNoiseRadians: 0 };
  });
  delete physical.mechanisms;
  physical.visualModel = visual;
  return openRobotConfiguration(JSON.stringify({ ...current.manifest, schemaVersion: 3, robot: configuration }));
}
