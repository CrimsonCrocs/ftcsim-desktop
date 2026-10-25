import { PerspectiveCamera, Quaternion, Vector3, Matrix4 } from "three";
import type { SimulatedCameraFrame } from "@ftc-studio/opmode-protocol";
import type { CameraConfiguration, WorldObservation } from "@ftc-studio/sim-core";

// Match the sensor model: local +X is forward, +Y up, -Z left.
export function placeSimulatorCamera(camera: PerspectiveCamera, configuration: CameraConfiguration,
  position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number; w: number }) {
  const body = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const mount = configuration.mount;
  const orientation = body.clone().multiply(new Quaternion(mount.rotation.x, mount.rotation.y, mount.rotation.z, mount.rotation.w));
  camera.position.copy(new Vector3(mount.position.x, mount.position.y, mount.position.z).applyQuaternion(body)
    .add(new Vector3(position.x, position.y, position.z)));
  const forward = new Vector3(1, 0, 0).applyQuaternion(orientation);
  camera.up.copy(new Vector3(0, 1, 0).applyQuaternion(orientation));
  camera.lookAt(camera.position.clone().add(forward));
  // Independent H/V FOVs preserve the configured sensor frustum at any raster aspect ratio.
  const near = 0.01;
  const top = near * Math.tan(configuration.verticalFovRadians / 2);
  const right = near * Math.tan(configuration.horizontalFovRadians / 2);
  camera.projectionMatrix.copy(new Matrix4().makePerspective(-right, right, top, -top, near, configuration.maximumRange));
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld();
}

export function simulatorCameraIntrinsics(camera: PerspectiveCamera, width: number, height: number) {
  const projection = camera.projectionMatrix.elements;
  const fx = projection[0] * width / 2, fy = projection[5] * height / 2;
  if (![fx, fy].every((value) => Number.isFinite(value) && value > 0 && value <= 1e9)) return undefined;
  return { fx, fy, cx: (1 - projection[8]) * width / 2, cy: (1 + projection[9]) * height / 2 };
}

/** Latest delivered exposures only; reset on scene/world replacement. */
export class SimulatorCameraFrames {
  private frames = new Map<string, { frame: SimulatedCameraFrame; availableTimeMs: number }[]>();
  private previewCameras = new Map<string, string>();
  requestPreview(robotId: string, camera: string | null) {
    if (camera === null) this.previewCameras.delete(robotId);
    else this.previewCameras.set(robotId, camera);
  }
  needsCapture(robotId: string, camera: string, runtimeRequests?: readonly string[]): boolean {
    return runtimeRequests === undefined || runtimeRequests.includes(camera) || this.previewCameras.get(robotId) === camera;
  }
  accept(robotId: string, frame: SimulatedCameraFrame, latencyMs: number) {
    const key = `${robotId}\0${frame.camera}`;
    const queue = this.frames.get(key) ?? [];
    if (queue.length && queue[queue.length - 1].frame.captureTimeMs >= frame.captureTimeMs) return;
    queue.push({ frame, availableTimeMs: frame.captureTimeMs + latencyMs });
    this.frames.set(key, queue.slice(-64));
  }
  read(robotId: string, timeMs: number): SimulatedCameraFrame[] {
    const result: SimulatedCameraFrame[] = [];
    for (const [key, queue] of this.frames) {
      if (!key.startsWith(`${robotId}\0`)) continue;
      let delivered = -1;
      for (let i = 0; i < queue.length; i++) if (queue[i].availableTimeMs <= timeMs) delivered = i;
      if (delivered < 0) continue;
      result.push(queue[delivered].frame);
      if (delivered) queue.splice(0, delivered);
    }
    return result;
  }
  clear() { this.frames.clear(); }
  latest(robotId: string): SimulatedCameraFrame[] {
    return [...this.frames].filter(([key]) => key.startsWith(`${robotId}\0`)).map(([, queue]) => queue[queue.length - 1].frame);
  }
}

export type SimulatorCameraCapture = (robotId: WorldObservation["robots"][number]["id"], frame: SimulatedCameraFrame, latencyMs: number) => void;
