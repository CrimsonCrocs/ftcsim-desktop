"use client";

import { createContext, memo, use, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Group, Mesh, Object3D, PerspectiveCamera, type Material, type WebGLRendererParameters } from "three";
import { type ElementState, type RobotId, type WorldAlliance, type WorldObservation, type WorldRobotSetup } from "@ftc-studio/sim-core";
import layout from "@/lib/biobuzz-field-layout.json";
import { clearHiveTags, ExportHiveAprilTags } from "./biobuzz-apriltags";
import { getDriverCameraPose, getOrbitCameraPosition, getRobotCameraPose, getSharedWorldCameraFov } from "./shared-world-camera";
import { ViewLoading } from "@/components/view-loading";
import { BIOBUZZ_STATIC_VISUALS, clearVisualAsset, fieldVisualAssets, loadVisualAsset, preloadFieldVisuals } from "./world-visual-assets";
import { WorldAssetBoundary } from "./world-asset-boundary";
import styles from "./shared-world-scene.module.css";
import { RobotModel, robotVisualAssets } from "./robot-visuals/robot-model";
import { watchSceneFrames } from "@/lib/scene-invalidation";
import { FramePacedRenderer } from "./frame-paced-renderer";
import { SimulatorWebcamCapture } from "./simulator-webcam-capture";
import type { SimulatorCameraCapture } from "@/lib/simulator-camera";
import { ADVANTAGE_SCOPE_FIELD_GROUP, type SceneAssetRegistration } from "@/lib/analysis/scene-assets";

const DEFAULT_ORBIT = { azimuth: 0.9, elevation: 0.64, distance: 7.02 };
const AssetContext = createContext<{ attempt: number; update: (id: string, status: "ready" | "failed") => void }>({ attempt: 0, update: () => {} });

function PacedGpuRenderer() {
  const { gl, invalidate } = useThree();
  useFrame(({ scene, camera }) => {
    // Resizing a canvas flushes pending GPU work synchronously. Keeping a
    // single frame in flight prevents that backlog from blocking control ticks.
    // Retry an unfinished frame even when the physics/camera has gone idle.
    if (gl instanceof FramePacedRenderer) {
      if (!gl.renderFrame(scene, camera)) invalidate();
    } else gl.render(scene, camera);
  }, 1);
  return null;
}

function Asset({ id, children }: { id: string; children: ReactNode }) {
  const { attempt, update } = useContext(AssetContext);
  const ready = useCallback(() => update(id, "ready"), [id, update]);
  const failed = useCallback(() => update(id, "failed"), [id, update]);
  return <WorldAssetBoundary key={attempt} onReady={ready} onError={failed}>{children}</WorldAssetBoundary>;
}

function renderRobotCad(url: string) {
  return <CadAsset url={url} />;
}

function CadAsset({ url }: { url: string }) {
  return <Asset id={url}><CadModel url={url} /></Asset>;
}

export interface SharedWorldSceneProps {
  observation: MutableRefObject<WorldObservation | null>;
  robots: readonly WorldRobotSetup[];
  onFrame?: (deltaSeconds: number) => void;
  onCameraFrame?: SimulatorCameraCapture;
  cameraFrameRequested?: (robotId: RobotId, camera: string) => boolean;
  playerRobot?: RobotId;
  view?: "field" | "follow" | "driver";
  driverAlliance?: WorldAlliance;
  fieldPreset?: "biobuzz-2026-2027" | "decode-2025-2026" | "empty";
  cameraSettings?: { azimuth: number; elevation: number; distance: number };
  animate?: boolean;
  theme?: "light" | "dark";
  assetExport?: SceneAssetRegistration;
}

function CaptureAdvantageScopeAssets({ registration, robots, playerRobot, fieldPreset, ready }: {
  registration: SceneAssetRegistration; robots: readonly WorldRobotSetup[]; playerRobot?: RobotId;
  fieldPreset: NonNullable<SharedWorldSceneProps["fieldPreset"]>; ready: boolean;
}) {
  const { scene } = useThree();
  const captured = useRef(false);
  useLayoutEffect(() => { captured.current = false; }, [registration, robots, playerRobot, fieldPreset, ready]);
  useFrame(() => {
    if (!ready || captured.current || !playerRobot) return;
    const robot = scene.getObjectByName(`robot:${playerRobot}`), field = scene.getObjectByName(ADVANTAGE_SCOPE_FIELD_GROUP);
    const setup = robots.find((robot) => robot.id === playerRobot);
    if (!robot || !field || !setup) return;
    let meshes = 0; robot.traverse((object: Object3D) => { if ((object as Mesh).isMesh) meshes++; });
    // Imported CAD finishes independently of the shared field asset boundary.
    if (!meshes) return;
    const copy = robot.clone(true);
    copy.position.set(0, setup.position.y, 0); copy.quaternion.identity(); copy.updateMatrixWorld(true);
    captured.current = registration.controller.capture({ identity: registration.identity, fieldPreset, robot: copy, field: field.clone(true) });
  });
  return null;
}

function CadModel({ url }: { url: string }) {
  const { scene } = use(loadVisualAsset(url));
  const clone = useMemo(() => {
    const copy = scene.clone(true);
    const transparentMaterials = new Map<Material, Material>();
    const prepareMaterial = (material: Material) => {
      if (!material.transparent) return material;
      if (!transparentMaterials.has(material)) {
        const clear = material.clone();
        // Clear panels must not mask the far panel/contents in the depth buffer.
        clear.depthWrite = false;
        transparentMaterials.set(material, clear);
      }
      return transparentMaterials.get(material)!;
    };
    copy.traverse((object: Object3D) => {
      if (!(object instanceof Mesh)) return;
      object.material = Array.isArray(object.material) ? object.material.map(prepareMaterial) : prepareMaterial(object.material);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      // Conventional shadow maps do not transmit light through clear plastic.
      object.castShadow = materials.some((material) => !material.transparent);
      object.receiveShadow = object.castShadow;
    });
    return { scene: copy, materials: [...transparentMaterials.values()] };
  }, [scene]);
  useEffect(() => () => { clone.materials.forEach((material) => material.dispose()); }, [clone]);
  return <primitive object={clone.scene} />;
}

function MovingHive({ id, urls, observation }: { id: string; urls: string[]; observation: SharedWorldSceneProps["observation"] }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const state = observation.current?.hives.find((hive) => hive.id === id);
    if (!group.current || !state) return;
    group.current.position.set(state.position.x, state.position.y, state.position.z);
    group.current.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
  });
  return <group ref={group}>
    {urls.map((url) => <CadAsset key={url} url={url} />)}
    <Asset id={`tags:${id}`}><ExportHiveAprilTags hiveId={id} /></Asset>
  </group>;
}

function GamePiece({ initial, observation }: { initial: ElementState; observation: SharedWorldSceneProps["observation"] }) {
  const mesh = useRef<Group>(null);
  useFrame(() => {
    const state = observation.current?.elements.find((element) => element.id === initial.id);
    if (!mesh.current || !state) return;
    mesh.current.visible = state.location === "field";
    mesh.current.position.set(state.position.x, state.position.y, state.position.z);
    mesh.current.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
  });
  const model = initial.kind === "pollen" ? layout.gamePieces.pollen.mesh
    : initial.kind === "nectar" ? initial.alliance === "red" ? layout.gamePieces.nectar.redMesh : layout.gamePieces.nectar.blueMesh
      : null;
  const scale = initial.kind === "pollen" ? layout.gamePieces.pollen.visualScale
    : initial.alliance === "red" ? layout.gamePieces.nectar.redVisualScale : layout.gamePieces.nectar.blueVisualScale;
  return <group ref={mesh} visible={false}>
    {model ? <group scale={scale}><CadAsset url={model} /></group> : <mesh castShadow receiveShadow>
      <sphereGeometry args={[initial.radius, 20, 16]} />
      <meshStandardMaterial color={initial.appearance === "green" ? "#60b83f" : "#9462cb"} roughness={0.93} />
    </mesh>}
  </group>;
}

function Scene({ observation, robots, onFrame, animate, playerRobot, view = "field", driverAlliance, cameraSettings, fieldPreset = "biobuzz-2026-2027", theme = "dark" }: SharedWorldSceneProps) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { camera, invalidate } = useThree();
  useEffect(() => watchSceneFrames({
    observation: () => observation.current,
    invalidate,
    continuous: Boolean(onFrame) && animate !== false,
  }), [observation, invalidate, onFrame, animate]);
  const [initialElements, setInitialElements] = useState<ElementState[] | null>(null);
  const capturedInitialElements = useRef(false);
  const selectedDriverAlliance = driverAlliance ?? robots.find((robot) => robot.id === playerRobot)?.alliance ?? "red";
  const innerWallX = layout.field.nominalSizeMeters[0]! / 2;
  const driverPose = getDriverCameraPose(selectedDriverAlliance, innerWallX);
  useEffect(() => {
    const orbitControls = controls.current;
    if (!orbitControls) return;

    if (orbitControls.object instanceof PerspectiveCamera) {
      const fov = getSharedWorldCameraFov(view);
      if (orbitControls.object.fov !== fov) {
        orbitControls.object.fov = fov;
        orbitControls.object.updateProjectionMatrix();
      }
    }

    if (view === "driver") {
      orbitControls.target.set(driverPose.target.x, driverPose.target.y, driverPose.target.z);
      camera.position.set(driverPose.position.x, driverPose.position.y, driverPose.position.z);
      orbitControls.update();
      return;
    }

    if (view === "follow" && playerRobot) {
      const setup = robots.find((robot) => robot.id === playerRobot);
      const followedRobot = observation.current?.robots.find((robot) => robot.id === playerRobot);
      if (setup) {
        const pose = getRobotCameraPose(
          followedRobot?.position ?? setup.position,
          followedRobot?.rotation ?? { x: 0, y: Math.sin(setup.heading / 2), z: 0, w: Math.cos(setup.heading / 2) },
          setup.heading,
        );
        orbitControls.target.set(pose.target.x, pose.target.y, pose.target.z);
        camera.position.set(pose.position.x, pose.position.y, pose.position.z);
        camera.up.set(pose.up.x, pose.up.y, pose.up.z);
        orbitControls.update();
        return;
      }
    }

    const settings = cameraSettings ?? DEFAULT_ORBIT;
    const target = { x: 0, y: 0.1, z: 0 };
    orbitControls.target.set(target.x, target.y, target.z);
    const position = getOrbitCameraPosition(target, settings);
    camera.position.set(position.x, position.y, position.z);
    orbitControls.update();
  }, [camera, cameraSettings, driverPose.position.x, driverPose.position.y, driverPose.position.z, driverPose.target.x, driverPose.target.y, driverPose.target.z, observation, playerRobot, robots, view]);
  useFrame(({ camera }, delta) => {
    onFrame?.(delta);
    if (!capturedInitialElements.current && observation.current) {
      capturedInitialElements.current = true;
      setInitialElements(observation.current.elements);
    }
    if (view === "follow" && playerRobot && controls.current) {
      const setup = robots.find((robot) => robot.id === playerRobot);
      if (setup) {
        const robot = observation.current?.robots.find((robot) => robot.id === playerRobot);
        const pose = getRobotCameraPose(
          robot?.position ?? setup.position,
          robot?.rotation ?? { x: 0, y: Math.sin(setup.heading / 2), z: 0, w: Math.cos(setup.heading / 2) },
          setup.heading,
        );
        camera.up.set(pose.up.x, pose.up.y, pose.up.z);
        camera.position.set(pose.position.x, pose.position.y, pose.position.z);
        controls.current.target.set(pose.target.x, pose.target.y, pose.target.z);
        controls.current.update();
      }
    }
  });
  return <>
    <color attach="background" args={[theme === "light" ? "#f3f4f6" : "#22272d"]} />
    <ambientLight intensity={fieldPreset === "biobuzz-2026-2027" ? 0.85 : 1.2} />
    <directionalLight position={[1, 6, 3]} intensity={fieldPreset === "biobuzz-2026-2027" ? 1.8 : 2.5} castShadow shadow-mapSize={[4096, 4096]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} shadow-camera-near={0.1} shadow-camera-far={12} shadow-bias={-0.00005} shadow-normalBias={0.0015} />
    <group name={ADVANTAGE_SCOPE_FIELD_GROUP}>
      {fieldPreset === "biobuzz-2026-2027" ? <>
        {BIOBUZZ_STATIC_VISUALS.map((url) => <CadAsset key={url} url={url} />)}
        {layout.movableBodies.map((hive) => <MovingHive key={hive.id} id={hive.id} urls={[hive.mesh, ...hive.cells.map((cell) => cell.mesh)]} observation={observation} />)}
      </> : <CadAsset url={fieldPreset === "empty" ? "/models/empty-field-visual.glb" : "/models/decode-field-visual.glb"} />}
    </group>
    {robots.map((setup) => <RobotModel key={setup.id} setup={setup} observation={observation} renderCad={renderRobotCad} />)}
      {initialElements?.map((element) => <GamePiece key={element.id} initial={element} observation={observation} />)}
    <OrbitControls ref={controls} enabled={view === "field"} enableZoom={view === "field"} enablePan={view === "field"} target={[0, 0.1, 0]} minDistance={0.5} maxDistance={8} maxPolarAngle={Math.PI / 2 - 0.05} makeDefault />
  </>;
}

// Live transforms are read from the observation ref in useFrame. Scoreboard and
// clock updates must not rebuild the CAD/robot component tree.
function StreamingWorldScene(props: SharedWorldSceneProps) {
  const preset = props.fieldPreset ?? "biobuzz-2026-2027";
  const assets = useMemo(() => [...fieldVisualAssets(preset), ...robotVisualAssets(props.robots), ...(preset === "biobuzz-2026-2027" ? layout.movableBodies.map((hive) => `tags:${hive.id}`) : [])], [preset, props.robots]);
  const [statuses, setStatuses] = useState<Record<string, "ready" | "failed">>({});
  const [attempt, setAttempt] = useState(0);
  const [delayed, setDelayed] = useState(false);
  const update = useCallback((id: string, status: "ready" | "failed") => {
    setStatuses((current) => current[id] === status ? current : { ...current, [id]: status });
  }, []);
  const context = useMemo(() => ({ attempt, update }), [attempt, update]);
  const pending = assets.filter((id) => statuses[id] !== "ready");
  const loading = pending.length > 0;
  const failed = pending.some((id) => statuses[id] === "failed");
  useEffect(() => {
    preloadFieldVisuals(preset);
    for (const url of robotVisualAssets(props.robots)) void loadVisualAsset(url);
    const timeout = window.setTimeout(() => setDelayed(true), 45_000);
    return () => window.clearTimeout(timeout);
  }, [preset, attempt, props.robots]);
  const retry = () => {
    for (const id of pending) {
      if (id.startsWith("tags:")) clearHiveTags(id.slice(5));
      else clearVisualAsset(id);
    }
    setStatuses((current) => Object.fromEntries(Object.entries(current).filter(([, status]) => status === "ready")));
    setDelayed(false);
    setAttempt((value) => value + 1);
  };
  const playerAlliance = props.driverAlliance ?? props.robots.find((robot) => robot.id === props.playerRobot)?.alliance ?? "red";
  const label = props.view === "driver"
    ? `${playerAlliance} alliance driver station field view; camera is locked.`
    : props.view === "follow"
      ? "Robot view locked behind your robot and following its heading; camera controls are disabled."
      : "Robot field view. Drag to orbit and scroll to zoom; simulation controls are outside the view.";
  return <div className={styles.scene} aria-busy={loading}>
    <AssetContext.Provider value={context}>
    <div role="img" aria-label={label} className={styles.scene}>
    <Canvas frameloop="demand" shadows="soft" dpr={[1, 2]} camera={{ position: [3.5, 4.3, 4.4], fov: 45, near: 0.02, far: 30 }} gl={(defaults: WebGLRendererParameters) => new FramePacedRenderer({ canvas: defaults.canvas, antialias: true, powerPreference: "high-performance" })}>
    <Scene {...props} />
    {props.assetExport && <CaptureAdvantageScopeAssets registration={props.assetExport} robots={props.robots} playerRobot={props.playerRobot} fieldPreset={preset} ready={!loading} />}
    {props.onCameraFrame && <SimulatorWebcamCapture {...props} onCameraFrame={loading ? undefined : props.onCameraFrame} />}
    <PacedGpuRenderer />
    </Canvas>
    </div>
    </AssetContext.Provider>
    {loading && (failed || delayed ? <div className={styles.error} role="alert">
      <p>{failed ? "Some field assets couldn’t load." : "Field loading is taking longer than expected."}</p>
      <button type="button" onClick={retry}>Retry loading</button>
    </div> : <ViewLoading label="Loading field" overlay />)}
  </div>;
}

export const SharedWorldScene = memo(function SharedWorldScene(props: SharedWorldSceneProps) {
  return <StreamingWorldScene key={props.fieldPreset ?? "biobuzz-2026-2027"} {...props} />;
});
