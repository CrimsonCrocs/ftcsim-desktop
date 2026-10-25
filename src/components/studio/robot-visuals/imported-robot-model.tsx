"use client";

import { useContext, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Object3D, Quaternion } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { WorldObservation, WorldRobotSetup } from "@ftc-studio/sim-core";
import { base64ToBytes, validateCadGlb } from "@/lib/cad/glb";
import { disposeCadScene } from "@/lib/cad/scene";
import { getRobotVisualState } from "@/lib/robot-visual-state";
import type { CadModelAsset } from "@/lib/cad/assets";
import { CadAssetReaderContext } from "../cad-asset-context";
import { prepareCadMotion } from "@/lib/cad/motion";

export function useImportedCadScene(source: string | CadModelAsset) {
  const readAsset = useContext(CadAssetReaderContext);
  const [result, setResult] = useState<{ source: string; scene?: Object3D; error?: string } | null>(null);
  const inline = typeof source === "string" ? source : undefined;
  const path = typeof source === "string" ? undefined : source.path;
  const sha256 = typeof source === "string" ? undefined : source.sha256;
  const byteLength = typeof source === "string" ? undefined : source.byteLength;
  const key = inline ?? sha256!;
  useEffect(() => {
    let cancelled = false, scene: Object3D | undefined;
    void Promise.resolve().then(async () => {
      const bytes = inline !== undefined ? base64ToBytes(inline) : await readAsset({ path: path!, sha256: sha256!, byteLength: byteLength!, encoding: "gzip" }); validateCadGlb(bytes);
      return new GLTFLoader().parseAsync(bytes, "");
    }).then((gltf) => {
      scene = gltf.scene;
      if (cancelled) { disposeCadScene(scene); return; }
      scene.traverse((object) => { object.castShadow = true; object.receiveShadow = true; });
      setResult({ source: key, scene });
    }).catch((error) => { if (!cancelled) setResult({ source: key, error: String(error) }); });
    return () => { cancelled = true; if (scene) disposeCadScene(scene); };
  }, [inline, path, sha256, byteLength, key, readAsset]);
  return result?.source === key ? result : null;
}

export function ImportedRobotModel({ setup, observation }: { setup: WorldRobotSetup; observation: MutableRefObject<WorldObservation | null> }) {
  const root = useRef<Group>(null), model = setup.configuration.visualModel!;
  const loaded = useImportedCadScene(model.asset ?? model.glbBase64!);
  const prepared = useMemo(() => {
    const scene = loaded?.scene?.clone(true);
    if (!scene) return null;
    const animated = prepareCadMotion(scene, model);
    return { scene, animated };
  }, [loaded?.scene, model]);
  const rotation = useMemo(() => new Quaternion(), []);
  useFrame(() => {
    const state = observation.current?.robots.find((robot) => robot.id === setup.id);
    if (!state || !root.current) return;
    root.current.position.set(state.position.x, state.position.y, state.position.z);
    root.current.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
    const pose = getRobotVisualState(setup.configuration, state);
    for (const wheel of prepared?.animated ?? []) {
      const index = setup.configuration.wheels.findIndex((entry) => entry.motor === wheel.motor);
      const phase = wheel.phase === "wheel" ? pose.wheelAngles[index] ?? 0 : state.motors[wheel.motor]?.positionRadians ?? 0;
      wheel.pivot.quaternion.copy(rotation.setFromAxisAngle(wheel.axis, phase * wheel.ratio));
    }
  });
  // Import validation and the preview exercise decoding before applying the model.
  if (loaded?.error) throw new Error(`Imported robot could not be displayed: ${loaded.error}`);
  return <group ref={root} name={`robot:${setup.id}`} position={[setup.position.x, setup.position.y, setup.position.z]} rotation={[0, setup.heading, 0]}>
    {prepared && <primitive object={prepared.scene} />}
  </group>;
}
