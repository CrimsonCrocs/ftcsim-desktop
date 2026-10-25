import { add3, axisAngle, cross3, dot3, rotate3, scale3, unit3 } from "./world-math.js";
import type { Quaternion, Vector3, WorldCollider, WorldRobotConfiguration } from "./world-types.js";

export interface RobotLiftStageSpec {
  index: number;
  length: number;
  width: number;
  x: number;
  sideZ: number;
  crossbarSpan: number;
}

/** Shared dimensions and offsets for the rendered and collidable telescoping lift stages. */
export function robotLiftStageSpecs(config: WorldRobotConfiguration): RobotLiftStageSpec[] {
  const lift = config.mechanisms?.lift;
  if (!lift) return [];
  const length = Math.max(0.06, lift.maximumTravel / 3) + 0.018;
  return [0, 1, 2].map((index) => ({
    index,
    length,
    width: 0.016 - index * 0.003,
    // Keep the mast behind the tray's rear lip and the carried ball envelope.
    x: -0.085 + index * 0.005,
    sideZ: 0.07 - index * 0.004,
    crossbarSpan: 0.14 - index * 0.008,
  }));
}

/** Lift-stage box colliders in robot-local coordinates at the given vertical travel. */
export function robotLiftStageGeometry(config: WorldRobotConfiguration, liftHeight: number): WorldCollider[] {
  const lift = config.mechanisms?.lift;
  if (!lift) return [];
  const axis = unit3(lift.axis ?? { x: 0, y: 1, z: 0 });
  const crossAxis = cross3({ x: 0, y: 1, z: 0 }, axis);
  const axisRotation: Quaternion = dot3(crossAxis, crossAxis) < 1e-12
    ? { x: 0, y: 0, z: 0, w: 1 }
    : axisAngle(crossAxis, Math.acos(Math.max(-1, Math.min(1, axis.y))));
  const parts: WorldCollider[] = [];
  const specs = robotLiftStageSpecs(config);
  for (const stage of specs) {
    const origin = robotLiftPosition(config, liftHeight * stage.index / 3);
    const addBox = (id: string, size: Vector3, local: Vector3) => parts.push({
      id,
      position: add3(origin, rotate3(local, axisRotation)),
      rotation: axisRotation,
      shape: { kind: "box", halfExtents: scale3(size, 0.5) },
    });
    for (const side of [-1, 1]) {
      addBox(`lift-stage-${stage.index}-rail-${side}`, { x: stage.width, y: stage.length, z: stage.width }, { x: stage.x, y: stage.length / 2, z: side * stage.sideZ });
    }
    // The feet mount to the side rails; a lower crossbar would obstruct the conveyor.
    addBox(`lift-stage-${stage.index}-crossbar-upper`, { x: 0.012, y: 0.009, z: stage.crossbarSpan }, { x: stage.x, y: stage.length - 0.009, z: 0 });
  }
  return parts;
}

/** Carriage location at the observed vertical rise, including an inclined rail's reach. */
export function robotLiftPosition(config: WorldRobotConfiguration, verticalHeight: number): Vector3 {
  const lift = config.mechanisms?.lift;
  if (!lift) throw new Error("The robot has no configured lift.");
  const axis = lift.axis ?? { x: 0, y: 1, z: 0 };
  return add3(lift.mount, scale3(axis, verticalHeight / axis.y));
}

/** Manufactured channel parts of the configurable all-rounder, in robot coordinates.
 * Mounts move both the rendered part and its collider. The millimetre offsets are
 * construction dimensions of this robot preset, not measured FTC hardware data.
 */
export function robotFixedGeometry(config: WorldRobotConfiguration): WorldCollider[] {
  const size = config.chassis.size;
  const mechanism = config.mechanisms;
  if (!mechanism) return [{ id: "chassis", position: { x: 0, y: 0, z: 0 }, shape: { kind: "box", halfExtents: { x: size.x / 2, y: size.y / 2, z: size.z / 2 } } }];
  const { storage, intake, shooter } = mechanism;
  const channelHalf = storage.width / 2;
  const leftEdge = storage.mount.z - channelHalf;
  const rightEdge = storage.mount.z + channelHalf;
  const gate = robotGateGeometry(config);
  const parts: WorldCollider[] = [];
  const box = (id: string, x: number, y: number, z: number, hx: number, hy: number, hz: number, friction?: number): void => {
    if (hx <= 0 || hy <= 0 || hz <= 0) return;
    parts.push({ id, position: { x, y, z }, shape: { kind: "box", halfExtents: { x: hx, y: hy, z: hz } }, ...(friction === undefined ? {} : { friction }) });
  };
  const funnelBackX = Math.min(size.x / 2, intake.mount.x - 0.1);
  const rearStart = -size.x / 2;
  box("rail-left", (rearStart + funnelBackX) / 2, 0, (leftEdge - size.z / 2) / 2, (funnelBackX - rearStart) / 2, size.y / 2, (leftEdge + size.z / 2) / 2);
  const railHalf = (size.z / 2 - rightEdge) / 2;
  const railCenter = rightEdge + railHalf;
  for (const [index, [start, end]] of [[rearStart, Math.min(funnelBackX, gate.x - 0.07)], [gate.x + 0.07, funnelBackX]].entries()) {
    box(`rail-right-${index}`, (start! + end!) / 2, 0, railCenter, (end! - start!) / 2, size.y / 2, railHalf);
  }
  // The intake needs a wide physical entrance. Full-width solid side rails here
  // would block every off-center ball before the roller could center it.
  for (const side of [-1, 1]) {
    const startZ = storage.mount.z + side * (channelHalf + 0.004);
    const endZ = intake.mount.z + side * (intake.width / 2 + intake.radius + 0.004);
    const frontX = size.x / 2;
    const dx = frontX - funnelBackX;
    const dz = endZ - startZ;
    box(`funnel-guide-${side}`, (frontX + funnelBackX) / 2, 0, (startZ + endZ) / 2, Math.hypot(dx, dz) / 2, size.y / 2, 0.004, 0.25);
    parts.at(-1)!.rotation = axisAngle({ x: 0, y: 1, z: 0 }, -Math.atan2(dz, dx));
  }
  const floorY = storage.mount.y - size.y / 2 + 0.014;
  box("rejection-floor", gate.x, floorY, railCenter, 0.07, 0.004, railHalf, 0.4);
  box("floor", storage.mount.x, floorY, storage.mount.z, storage.length / 2 + 0.029, 0.004, channelHalf, 0.4);
  box("intake-ramp", intake.mount.x - 0.025, intake.mount.y - 0.034, intake.mount.z, 0.06, 0.003, intake.width / 2, 0.4);
  parts.at(-1)!.rotation = axisAngle({ x: 0, y: 0, z: 1 }, -Math.atan(0.258));
  box("storage-roof", storage.mount.x, storage.mount.y + 0.072, storage.mount.z, storage.length * 7 / 24, 0.004, channelHalf);
  const bottom = floorY - 0.004;
  const top = shooter.mount.y + 0.035;
  box("chute-back", shooter.mount.x - 0.116, (bottom + top) / 2, shooter.mount.z, 0.006, (top - bottom) / 2, channelHalf);
  for (const part of parts) if (["storage-roof", "chute-back"].includes(part.id)) part.restitution = 0.05;
  return parts;
}

/** Servo offset locates the sorting linkage relative to the storage outlet. */
export function robotGateGeometry(config: WorldRobotConfiguration): { x: number; y: number; z: number } {
  const mechanism = config.mechanisms!;
  const mount = config.servos.find((servo) => servo.name === mechanism.gate.servo)!.mount;
  return { x: mount.x, y: mount.y - 0.01, z: mechanism.storage.mount.z + mechanism.storage.width / 2 + mount.z };
}
