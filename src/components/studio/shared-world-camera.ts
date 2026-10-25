import type { WorldAlliance } from "@ftc-studio/sim-core";

export interface CameraPoint {
  x: number;
  y: number;
  z: number;
}

export interface OrbitCameraSettings {
  azimuth: number;
  elevation: number;
  distance: number;
}

export interface CameraPose {
  position: CameraPoint;
  target: CameraPoint;
  up: CameraPoint;
}

export interface CameraQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type SharedWorldCameraView = "field" | "follow" | "driver";

export function getSharedWorldCameraFov(view: SharedWorldCameraView): number {
  return view === "driver" ? 60 : view === "follow" ? 55 : 45;
}

export function getOrbitCameraPosition(target: CameraPoint, settings: OrbitCameraSettings): CameraPoint {
  const horizontalDistance = settings.distance * Math.cos(settings.elevation);
  return {
    x: target.x + horizontalDistance * Math.cos(settings.azimuth),
    y: target.y + settings.distance * Math.sin(settings.elevation),
    z: target.z + horizontalDistance * Math.sin(settings.azimuth),
  };
}

export function getDriverCameraPose(
  alliance: WorldAlliance,
  innerWallX: number,
): CameraPose {
  const direction = alliance === "red" ? -1 : 1;
  return {
    position: {
      x: direction * (Math.abs(innerWallX) + 1),
      y: 1.6,
      z: 0,
    },
    target: { x: 0, y: 0.4, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  };
}

/** Places a stable, heading-aligned third-person camera behind a robot. */
export function getRobotCameraPose(
  position: CameraPoint,
  rotation: CameraQuaternion,
  fallbackHeading: number,
): CameraPose {
  // Project the robot's actual world-space +X axis onto the field plane so
  // chassis pitch and roll never tilt the camera or its world-up direction.
  const forwardX = 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z);
  const forwardZ = 2 * (rotation.x * rotation.z - rotation.y * rotation.w);
  const horizontalLength = Math.hypot(forwardX, forwardZ);
  const forward = horizontalLength > 1e-6
    ? { x: forwardX / horizontalLength, z: forwardZ / horizontalLength }
    : { x: Math.cos(fallbackHeading), z: -Math.sin(fallbackHeading) };
  const behindDistance = 1.25;

  return {
    position: {
      x: position.x - forward.x * behindDistance,
      y: position.y + 0.85,
      z: position.z - forward.z * behindDistance,
    },
    target: {
      x: position.x + forward.x * 0.4,
      y: position.y + 0.25,
      z: position.z + forward.z * 0.4,
    },
    up: { x: 0, y: 1, z: 0 },
  };
}
