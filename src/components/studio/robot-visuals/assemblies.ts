import { Quaternion } from "three";
import { robotFixedGeometry, robotLiftStageSpecs, type RobotLiftStageSpec, type WorldRobotConfiguration } from "@ftc-studio/sim-core";
import { Assembly, type Point } from "./geometry";

// Constructed visual assemblies, not manufacturer CAD of a complete robot.
// Contact surfaces and pivots retain the configured simulation dimensions.
export function chassisAssembly(config: WorldRobotConfiguration) {
  const a = new Assembly();
  const { x: length, y: height, z: width } = config.chassis.size;
  const top = height / 2 - 0.012;
  const bottom = -height / 2 + 0.008;
  const side = width / 2 - 0.009;
  const end = length / 2 - 0.012;
  for (const sign of [-1, 1]) {
    // Open side channels expose the wheel faces instead of solid collision boxes.
    a.box([length, 0.018, 0.018], [0, top, sign * side]);
    a.box([length, 0.012, 0.016], [0, bottom, sign * side], "dark");
    for (const x of [-end, end]) {
      a.beam([x, bottom, sign * side], [x, top, sign * side], 0.018);
      a.bolt([x, top, sign * (side + 0.01)]);
    }
    const plateLength = Math.min(0.13, length * 0.35);
    a.box([plateLength, Math.min(0.052, height * 0.4), 0.004], [0, top - 0.025, sign * (side + 0.005)], "alliance");
    for (const x of [-1, 1]) a.bolt([x * (plateLength / 2 - 0.009), top - 0.025, sign * (side + 0.008)]);
    const holes = Math.max(2, Math.floor(length / 0.045));
    for (let i = 1; i < holes; i++) {
      const x = -length / 2 + length * i / holes;
      a.cylinder(0.0033, 0.0008, [x, top + 0.0095, sign * side], "dark", [0, 1, 0], 10);
    }
    a.box([length * 0.72, 0.004, Math.max(0.025, width * 0.2)], [-length * 0.05, top - 0.012, sign * width * 0.285], "dark");
  }
  a.box([0.018, 0.028, width - 0.018], [-end, top - 0.005, 0]);
  // Leave the intake aperture open on mechanism-equipped robots.
  a.box([0.012, 0.008, width - 0.018], [end, bottom, 0], "edge");
  if (!config.mechanisms) a.box([length - 0.045, 0.004, width - 0.04], [0, top - 0.015, 0], "dark");
  for (const wheel of config.wheels) {
    const sideways = Math.abs(Math.cos(wheel.tractionAngle)) < 0.1;
    const y = wheel.mount.y - wheel.suspensionTravel + 0.004;
    if (sideways) {
      a.box([0.06, 0.008, 0.095], [wheel.mount.x, y + wheel.radius + 0.008, wheel.mount.z]);
      for (const sign of [-1, 1]) a.box([0.006, wheel.radius, 0.035], [wheel.mount.x + sign * 0.025, y + wheel.radius / 2, wheel.mount.z]);
      a.cylinder(0.005, 0.06, [wheel.mount.x, y, wheel.mount.z], "edge", [1, 0, 0]);
      continue;
    }
    const sign = wheel.mount.z < 0 ? -1 : 1;
    const inner = wheel.mount.z - sign * 0.03;
    a.box([0.042, top - y + 0.017, 0.006], [wheel.mount.x, (top + y) / 2, inner], "aluminum");
    a.cylinder(0.012, 0.008, [wheel.mount.x, y, inner], "dark");
    a.cylinder(0.005, 0.047, [wheel.mount.x, y, wheel.mount.z - sign * 0.01], "edge");
    a.cylinder(0.018, 0.049, [wheel.mount.x, y + 0.002, inner - sign * 0.029], "aluminum");
    a.cylinder(0.0185, 0.012, [wheel.mount.x, y + 0.002, inner - sign * 0.06], "gold");
    a.cylinder(0.013, 0.008, [wheel.mount.x, y + 0.002, inner - sign * 0.07], "dark");
    for (const x of [-0.015, 0.015]) a.bolt([wheel.mount.x + x, top, inner - sign * 0.004]);
  }
  const hubZ = config.mechanisms ? -width * 0.285 : -width * 0.18;
  const batteryZ = config.mechanisms ? width * 0.285 : width * 0.18;
  a.box([0.11, 0.027, 0.062], [-length * 0.1, top + 0.007, hubZ], "dark");
  a.box([0.078, 0.002, 0.046], [-length * 0.1, top + 0.0215, hubZ], "edge");
  for (let i = 0; i < 6; i++) a.box([0.007, 0.003, 0.008], [-length * 0.1 - 0.043 + i * 0.017, top + 0.023, hubZ + 0.023], "dark");
  a.cylinder(0.002, 0.002, [-length * 0.1 + 0.032, top + 0.024, hubZ], "green", [0, 1, 0], 8);
  a.box([0.108, 0.035, 0.048], [-length * 0.05, top + 0.009, batteryZ], "dark");
  for (const x of [-0.032, 0.032]) a.box([0.012, 0.037, 0.05], [-length * 0.05 + x, top + 0.009, batteryZ], "edge");
  for (const offset of [0, 0.005]) a.cable([
    [-length * 0.05 + 0.054, top + 0.018, batteryZ + offset],
    [length * 0.18 + offset, top + 0.007, batteryZ],
    [length * 0.18 + offset, top + 0.006, hubZ],
    [-length * 0.1 + 0.055, top + 0.014, hubZ + offset],
  ], 0.0016, offset ? "rubber" : "redWire");
  return a.finish();
}

export function fixedMechanismsAssembly(config: WorldRobotConfiguration) {
  const a = new Assembly();
  const m = config.mechanisms!;
  for (const part of robotFixedGeometry(config)) {
    if (part.shape.kind !== "box" || part.id.startsWith("rail-") || part.id === "chute-back") continue;
    const { x, y, z } = part.shape.halfExtents;
    const rotation = part.rotation ? new Quaternion(part.rotation.x, part.rotation.y, part.rotation.z, part.rotation.w) : undefined;
    a.box([x * 2, y * 2, z * 2], [part.position.x, part.position.y, part.position.z], part.id === "storage-roof" ? "clear" : part.id === "chute-back" ? "dark" : "edge", rotation);
  }
  const { storage, shooter, intake } = m;
  const floor = storage.mount.y - config.chassis.size.y / 2 + 0.014;
  const back = shooter.mount.x - 0.116;
  a.box([0.006, Math.max(0.01, shooter.mount.y - 0.074 - floor), storage.width], [back, (floor + shooter.mount.y - 0.074) / 2, storage.mount.z], "dark");
  for (const side of [-1, 1]) {
    const z = storage.mount.z + side * (storage.width / 2 + 0.003);
    a.box([storage.length, 0.10, 0.004], [storage.mount.x, floor + 0.05, z], "clear");
    a.box([storage.length, 0.009, 0.009], [storage.mount.x, floor + 0.104, z]);
    a.box([storage.length, 0.009, 0.009], [storage.mount.x, floor, z]);
    a.beam([back, floor, z], [back, shooter.mount.y - 0.064, z], 0.016, 0.016);
    a.beam([shooter.mount.x + 0.025, config.chassis.size.y / 2 - 0.012, z], [shooter.mount.x + 0.025, shooter.mount.y - 0.064, z], 0.012);
    a.box([0.12, Math.max(0.01, shooter.mount.y - floor - 0.065), 0.003], [back + 0.058, (floor + shooter.mount.y - 0.065) / 2, z], "clear");
    a.beam([back - 0.003, shooter.mount.y - 0.068, z], [shooter.mount.x + 0.026, shooter.mount.y - 0.068, z], 0.014);
    a.beam([shooter.mount.x + 0.025, config.chassis.size.y / 2 - 0.012, z], [back, shooter.mount.y - 0.068, z], 0.008, 0.008, "edge");
    const intakeZ = intake.mount.z + side * (intake.width / 2 + 0.006);
    a.beam([intake.mount.x - 0.07, config.chassis.size.y / 2 - 0.02, intakeZ], [intake.mount.x, intake.mount.y, intakeZ], 0.009, 0.009, "dark");
    a.cylinder(intake.radius * 0.35, 0.007, [intake.mount.x, intake.mount.y, intakeZ], "aluminum");
    a.bolt([intake.mount.x, intake.mount.y, intakeZ + side * 0.005]);
  }
  a.annulus(0.047, 0.064, 0.009, [shooter.mount.x, shooter.mount.y - 0.064, shooter.mount.z], "aluminum");
  a.ring(0.051, 0.005, [shooter.mount.x, shooter.mount.y - 0.057, shooter.mount.z], "dark", [0, 1, 0]);
  a.box([0.005, Math.max(0.01, shooter.mount.y - floor - 0.02), storage.width * 0.68], [back + 0.008, (floor + shooter.mount.y - 0.02) / 2, storage.mount.z], "rubber");
  return a.finish();
}

export function rollerAssembly(radius: number, width: number, intake = false) {
  const a = new Assembly();
  a.cylinder(radius * 0.23, width + 0.02, [0, 0, 0], "edge");
  const count = intake ? Math.max(3, Math.round(width / 0.042)) : 3;
  for (let i = 0; i < count; i++) {
    const z = -width / 2 + width * (i + 0.5) / count;
    const length = width / count * 0.85;
    a.cylinder(radius, length, [0, 0, z], intake ? "green" : "rubber", [0, 0, 1], 32);
    a.cylinder(radius * 0.39, length + 0.001, [0, 0, z], "dark");
    for (let rib = 0; rib < 6; rib++) {
      const angle = rib * Math.PI / 3 + i * 0.2;
      a.cylinder(radius * 0.115, length + 0.0015, [Math.cos(angle) * radius * 0.64, Math.sin(angle) * radius * 0.64, z], "dark", [0, 0, 1], 8);
    }
  }
  return a.finish();
}

export function turretAssembly() {
  const a = new Assembly();
  a.annulus(0.046, 0.06, 0.009, [0, -0.049, 0], "dark");
  a.ring(0.054, 0.003, [0, -0.044, 0], "gold", [0, 1, 0]);
  for (const side of [-1, 1]) {
    a.box([0.11, 0.008, 0.016], [0.005, -0.04, side * 0.045]);
    a.beam([-0.037, -0.038, side * 0.055], [0, 0, side * 0.055], 0.012, 0.006);
    a.beam([0.045, -0.038, side * 0.055], [0, 0, side * 0.055], 0.01, 0.006);
    a.cylinder(0.012, 0.012, [0, 0, side * 0.055], "edge");
    a.bolt([0, 0, side * 0.063]);
  }
  a.box([0.03, 0.035, 0.016], [0, -0.018, -0.071], "dark");
  a.cylinder(0.013, 0.006, [0, 0, -0.062], "gold");
  return a.finish();
}

export function hoodAssembly(radius: number) {
  const a = new Assembly();
  // The hood pivots outside the turret's fixed braces at z = ±0.055.
  // Keep their side faces separate at every hood angle.
  const zSide = 0.065;
  for (const side of [-1, 1]) {
    a.box([radius * 2.4, 0.065, 0.003], [radius * 0.3, -0.007, side * zSide], "clear");
    a.beam([-radius * 0.8, -0.038, side * zSide], [radius * 1.5, -0.038, side * zSide], 0.006, 0.006, "edge");
    // Uprights bolt to the outside of the rail, rather than sharing its visible face.
    const uprightZ = side * (zSide + 0.006);
    a.beam([-radius * 0.8, -0.038, uprightZ], [-radius * 0.8, 0.02, uprightZ], 0.006, 0.006, "aluminum");
    a.box([radius * 1.7, 0.016, 0.004], [radius * 0.55, 0.024, side * (zSide + 0.002)], "alliance");
    for (const x of [-radius * 0.8, radius * 1.45]) a.bolt([x, -0.038, side * (zSide + 0.010)]);
  }
  a.box([radius * 2.4, 0.004, 0.107], [radius * 0.3, -radius - 0.035, 0], "dark");
  for (const side of [-1, 1]) a.beam([radius * 1.45, -radius - 0.035, side * (zSide + 0.006)], [radius * 1.45, 0.024, side * (zSide + 0.006)], 0.006, 0.006, "edge");
  a.box([0.018, 0.004, 0.105], [radius * 1.5, -radius - 0.032, 0], "alliance");
  a.cylinder(0.018, 0.044, [-0.028, -0.034, zSide + 0.016], "aluminum");
  a.cylinder(0.0185, 0.01, [-0.028, -0.034, zSide + 0.043], "gold");
  a.beam([-0.028, -0.034, zSide - 0.002], [0, 0, zSide - 0.002], 0.019, 0.006, "dark");
  return a.finish();
}

export function flywheelAssembly(radius: number) {
  const a = new Assembly();
  a.cylinder(0.006, 0.127, [0, 0, 0], "edge");
  for (const side of [-1, 1]) {
    const z = side * 0.026;
    a.cylinder(radius, 0.027, [0, 0, z], "rubber", [0, 0, 1], 48);
    a.cylinder(radius * 0.53, 0.028, [0, 0, z], "aluminum");
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      a.cylinder(radius * 0.085, 0.03, [Math.cos(angle) * radius * 0.35, Math.sin(angle) * radius * 0.35, z], "dark", [0, 0, 1], 8);
    }
    a.box([radius * 0.45, 0.004, 0.0008], [radius * 0.61, 0, z + side * 0.014], "alliance");
  }
  return a.finish();
}

export function liftStageAssembly(stage: RobotLiftStageSpec) {
  const a = new Assembly();
  const { length, width, x, sideZ, crossbarSpan } = stage;
  // Stagger the visible rail faces so collapsed stages do not share the
  // preceding stage's dark guide-strip surface.
  for (const side of [-1, 1]) {
    const z = side * sideZ;
    a.box([width, length, width], [x, length / 2, z]);
    a.box([0.002, length - 0.012, width * 0.4], [x + width / 2, length / 2, z], "dark");
    a.cylinder(0.009, 0.009, [x + 0.002, length - 0.009, z], "dark");
    a.bolt([x + 0.002, length - 0.009, z + side * 0.007]);
  }
  a.box([0.012, 0.009, crossbarSpan], [x, length - 0.009, 0], "edge");
  return a.finish();
}

export function liftStageAssemblies(config: WorldRobotConfiguration) {
  return robotLiftStageSpecs(config).map(liftStageAssembly);
}

export function liftTrayAssembly(width: number) {
  const a = new Assembly();
  a.box([0.12, 0.006, width], [0, 0, 0], "alliance");
  a.box([0.006, 0.024, width], [0.058, 0.012, 0], "edge");
  a.box([0.006, 0.008, width], [-0.058, 0.004, 0], "edge");
  for (const side of [-1, 1]) {
    a.box([0.12, 0.024, 0.006], [0, 0.012, side * width / 2], "edge");
    a.bolt([-0.04, 0, side * (width / 2 + 0.005)]);
  }
  return a.finish();
}

export function cameraAssembly(config: WorldRobotConfiguration) {
  const a = new Assembly();
  for (const camera of config.cameras) {
    const p = camera.mount.position; const r = camera.mount.rotation;
    const footY = config.chassis.size.y / 2 - 0.012;
    const baseZ = config.mechanisms ? config.mechanisms.storage.width / 2 + 0.009 : 0.045;
    for (const side of [-1, 1]) a.beam([p.x, footY, p.z + side * baseZ], [p.x, p.y - 0.018, p.z + side * baseZ], 0.008, 0.008, "dark");
    a.beam([p.x, p.y - 0.018, p.z - baseZ], [p.x, p.y - 0.018, p.z + baseZ], 0.008, 0.008, "dark");
    const rotation = new Quaternion(r.x, r.y, r.z, r.w);
    a.box([0.021, 0.023, 0.045], [p.x, p.y, p.z], "dark", rotation);
    const forward: Point = [1 - 2 * (r.y * r.y + r.z * r.z), 2 * (r.x * r.y + r.w * r.z), 2 * (r.x * r.z - r.w * r.y)];
    a.cylinder(0.008, 0.008, [p.x + forward[0] * 0.013, p.y + forward[1] * 0.013, p.z + forward[2] * 0.013], "edge", forward);
    a.cylinder(0.006, 0.009, [p.x + forward[0] * 0.015, p.y + forward[1] * 0.015, p.z + forward[2] * 0.015], "lens", forward);
  }
  return a.finish();
}
