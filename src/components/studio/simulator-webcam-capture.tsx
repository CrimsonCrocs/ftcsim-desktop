"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, WebGLRenderTarget, SRGBColorSpace } from "three";
import type { SharedWorldSceneProps } from "./shared-world-scene";
import { placeSimulatorCamera, simulatorCameraIntrinsics } from "@/lib/simulator-camera";

/** Capture the same scene after its moving objects have applied the current world snapshot. */
export function SimulatorWebcamCapture({ observation, robots, playerRobot, onCameraFrame, cameraFrameRequested }: SharedWorldSceneProps) {
  const { gl } = useThree();
  const lastTime = useRef(-1);
  const resources = useMemo(() => {
    const width = 640, height = 480;
    const target = new WebGLRenderTarget(width, height);
    target.texture.colorSpace = SRGBColorSpace;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d")!;
    return { target, canvas, context, image: context.createImageData(width, height), pixels: new Uint8Array(width * height * 4),
      camera: new PerspectiveCamera(), next: new Map<string, number>() };
  }, []);
  useEffect(() => () => resources.target.dispose(), [resources]);
  useEffect(() => { resources.next.clear(); lastTime.current = -1; }, [resources, robots, observation]);
  useFrame(({ scene }) => {
    const current = observation.current;
    if (!current || !onCameraFrame) return;
    if (current.simulationTimeMs < lastTime.current) resources.next.clear();
    lastTime.current = current.simulationTimeMs;
    for (const setup of robots) {
      if (playerRobot && setup.id !== playerRobot) continue;
      const robot = current.robots.find((candidate) => candidate.id === setup.id);
      if (!robot) continue;
      for (const configuration of setup.configuration.cameras) {
        // Avoid synchronous GPU render/readback and JPEG encoding when neither
        // Java nor an open raw preview needs this camera's pixels.
        if (cameraFrameRequested && !cameraFrameRequested(robot.id, configuration.name)) continue;
        const key = `${robot.id}\0${configuration.name}`;
        const timeMs = current.simulationTimeMs;
        if (timeMs < (resources.next.get(key) ?? 0)) continue;
        // Bound GPU readback/encoding work independently of physics/control cadence.
        resources.next.set(key, timeMs + Math.max(1000 / Math.min(15, configuration.framesPerSecond), configuration.latencyMs / 60));
        placeSimulatorCamera(resources.camera, configuration, robot.position, robot.rotation);
        const previous = gl.getRenderTarget();
        const xr = gl.xr.enabled;
        // The geometric sensor model excludes its own robot body too. Camera
        // mounts can sit inside the decorative CAD camera/hood geometry.
        const self = scene.getObjectByName(`robot:${robot.id}`);
        const selfVisible = self?.visible;
        try {
          if (self) self.visible = false;
          gl.xr.enabled = false;
          gl.setRenderTarget(resources.target);
          gl.clear();
          gl.render(scene, resources.camera);
          gl.readRenderTargetPixels(resources.target, 0, 0, 640, 480, resources.pixels);
        } finally { gl.setRenderTarget(previous); gl.xr.enabled = xr; if (self) self.visible = selfVisible!; }
        const image = resources.image;
        for (let y = 0; y < 480; y++) image.data.set(resources.pixels.subarray((479 - y) * 2560, (480 - y) * 2560), y * 2560);
        resources.context.putImageData(image, 0, 0);
        onCameraFrame(robot.id, { camera: configuration.name, captureTimeMs: timeMs, width: 640, height: 480,
          intrinsics: simulatorCameraIntrinsics(resources.camera, 640, 480),
          imageBase64: resources.canvas.toDataURL("image/jpeg", 0.85).split(",")[1] }, configuration.latencyMs);
      }
    }
  }, 0.5);
  return null;
}
