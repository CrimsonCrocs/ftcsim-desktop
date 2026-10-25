"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ArrowHelper, Box3, Box3Helper, Color, Matrix3, Vector3, type Intersection, type Object3D } from "three";
import type { CadMatch, CadPart, CadVector } from "@/lib/cad/types";
import { getCadProduct } from "@/lib/cad/catalog";
import { cadNodeAtPath } from "@/lib/cad/assembly-edit";
import { cadPartForHit } from "@/lib/cad/selection";
import { useImportedCadScene } from "./robot-visuals/imported-robot-model";
import styles from "./robot-cad-import.module.css";

class PreviewBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

type Selection = { parts: CadPart[]; matches: CadMatch[]; selectedId: string | null; onSelect: (id: string, normal?: CadVector) => void };
function PreviewModel({ base64, onReady, onError, selection }: { base64: string; onReady: () => void; onError: (message: string) => void; selection?: Selection }) {
  const result = useImportedCadScene(base64), { invalidate } = useThree();
  const nodes = useMemo(() => {
    const root = result?.scene?.children[0], nodes = new Map<Object3D, CadPart>();
    if (root) for (const part of selection?.parts ?? []) { const node = cadNodeAtPath(root, part.path); if (node) nodes.set(node, part); }
    return nodes;
  }, [result?.scene, selection?.parts]);
  const selected = selection?.parts.find((part) => part.id === selection.selectedId);
  const box = useMemo(() => {
    if (!selected) return null;
    const root = result?.scene?.children[0], node = root && cadNodeAtPath(root, selected.path);
    if (!node) return null;
    result?.scene?.updateMatrixWorld(true);
    const helper = new Box3Helper(new Box3().setFromObject(node, true), new Color("#7296d1"));
    for (const material of Array.isArray(helper.material) ? helper.material : [helper.material]) material.depthTest = false;
    helper.renderOrder = 30;
    return helper;
  }, [selected, result?.scene]);
  useEffect(() => { invalidate(); return () => { box?.geometry.dispose(); (box?.material as { dispose?: () => void })?.dispose?.(); }; }, [box, invalidate]);
  useEffect(() => { if (result?.scene) onReady(); else if (result?.error) onError(result.error); }, [result, onReady, onError]);
  const click = (event: ThreeEvent<MouseEvent>) => {
    if (!selection || event.delta > 5) return;
    event.stopPropagation();
    // Fiber's peer Three declarations can resolve separately under Bun. The
    // runtime event includes Three's ray intersection, as documented by Fiber.
    const hit = event as ThreeEvent<MouseEvent> & Intersection;
    const ancestors: CadPart[] = [];
    for (let node: Object3D | null = hit.object; node; node = node.parent) { const part = nodes.get(node); if (part) ancestors.push(part); }
    const part = cadPartForHit(ancestors, selection.matches, selection.selectedId); if (!part) return;
    const normal = hit.face?.normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
    selection.onSelect(part.id, normal ? { x: normal.x, y: normal.y, z: normal.z } : undefined);
  };
  return result?.scene ? <><primitive object={result.scene} onClick={click} />{box && <primitive object={box} />}</> : null;
}

function CameraAim({ part, match, length }: { part: CadPart; match: CadMatch; length: number }) {
  const forward = match.camera?.forward ?? { x: 1, y: 0, z: 0 };
  const { invalidate } = useThree();
  const helper = useMemo(() => {
    const direction = new Vector3(forward.x, forward.y, forward.z);
    if (!direction.toArray().every(Number.isFinite) || direction.lengthSq() < 1e-12) return null;
    const arrow = new ArrowHelper(direction.normalize(), new Vector3(part.position.x, part.position.y, part.position.z), length, "#dcac66", length * .15, length * .08);
    for (const material of [arrow.line.material, arrow.cone.material].flat()) material.depthTest = false;
    arrow.line.renderOrder = arrow.cone.renderOrder = 31;
    return arrow;
  }, [forward.x, forward.y, forward.z, part.position.x, part.position.y, part.position.z, length]);
  useEffect(() => { invalidate(); return () => { helper?.dispose(); }; }, [helper, invalidate]);
  return helper ? <primitive object={helper} /> : null;
}

type ViewCommand = "left" | "right" | "front" | "side" | "top" | "reset" | "zoom-in" | "zoom-out" | "selection";
function PreviewView({ command, distance, selected }: { command: { kind: ViewCommand; revision: number }; distance: number; selected?: CadPart }) {
  const { camera, controls, invalidate, size } = useThree(), lastRevision = useRef(-1), selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => {
    const kind = command.revision === lastRevision.current ? "reset" : command.kind;
    const selected = selectedRef.current;
    lastRevision.current = command.revision;
    const target = controls && "target" in controls && controls.target instanceof Vector3 ? controls.target : null;
    const offset = camera.position.clone().sub(target ?? new Vector3());
    const fitDistance = distance * Math.max(1, size.height / Math.max(1, size.width));
    if (kind === "zoom-in" || kind === "zoom-out") {
      const length = Math.min(distance * 4, Math.max(distance * .03, offset.length() * (kind === "zoom-in" ? .8 : 1.25)));
      camera.position.copy(offset.setLength(length).add(target ?? new Vector3()));
    } else if (kind === "left" || kind === "right") {
      camera.position.copy(offset.applyAxisAngle(new Vector3(0, 1, 0), kind === "left" ? -Math.PI / 4 : Math.PI / 4).add(target ?? new Vector3()));
    } else if (kind === "selection" && selected) {
      const center = new Vector3(selected.position.x, selected.position.y, selected.position.z);
      target?.copy(center);
      const d = Math.max(.04, Math.max(selected.size.x, selected.size.y, selected.size.z) * 2.5);
      camera.position.copy(center).add(offset.normalize().multiplyScalar(d));
    } else {
      target?.set(0, 0, 0);
      const angle = kind === "front" ? 0 : kind === "side" ? Math.PI / 2 : Math.PI / 4;
      camera.position.copy(kind === "top" ? new Vector3(.001, fitDistance, .001) : new Vector3(Math.cos(angle) * fitDistance, fitDistance * .55, Math.sin(angle) * fitDistance));
    }
    camera.lookAt(target ?? new Vector3()); camera.updateProjectionMatrix(); invalidate();
    if (controls && "update" in controls && typeof controls.update === "function") controls.update();
  }, [command, distance, camera, controls, invalidate, size.width, size.height]);
  return null;
}

export function RobotCadPreview({ base64, size, onReady, onError, loading = false, selection }: { base64: string; size: CadVector; onReady: () => void; onError: (message: string) => void; loading?: boolean; selection?: Selection }) {
  const [view, setView] = useState<{ kind: ViewCommand; revision: number }>({ kind: "reset", revision: 0 });
  const command = (kind: ViewCommand) => setView((previous) => ({ kind, revision: previous.revision + 1 }));
  const distance = Math.max(size.x, size.y, size.z) * 2.1;
  const selected = selection?.parts.find((part) => part.id === selection.selectedId), match = selection?.matches.find((entry) => entry.partId === selected?.id);
  return <section className={styles.preview} aria-label="Imported robot 3D preview">
    <div className={styles.previewHeader}><strong>3D preview</strong><span className={styles.finePointerHint}>Click to select · drag to rotate · scroll to zoom</span><span className={styles.touchHint}>Tap a piece · drag to rotate · + / − to zoom</span></div>
    <div className={styles.canvas} role="img" aria-label="3D robot assembly. Components can also be selected from the hardware list.">
      <PreviewBoundary key={base64.slice(-64)} onError={onError}>
        <Canvas camera={{ position: [distance, distance * .6, distance], fov: 40, near: .001, far: 100 }} frameloop="demand" dpr={[1, 1.5]} aria-label="Orbitable CAD assembly" gl={{ antialias: true, alpha: true }}>
          <ambientLight intensity={1.8} /><directionalLight position={[3, 5, 4]} intensity={2.5} /><directionalLight position={[-3, 2, -4]} intensity={1.2} />
          <PreviewView command={view} distance={distance} selected={selected} />
          <PreviewModel base64={base64} onReady={onReady} onError={onError} selection={selection} />
          {selected && match && getCadProduct(match.productId)?.kind === "camera" && <CameraAim part={selected} match={match} length={Math.max(size.x, size.y, size.z) * .45} />}
          <gridHelper args={[Math.max(size.x, size.z) * 1.5, 10, "#69727c", "#a4aab0"]} position={[0, -size.y / 2 - .002, 0]} />
          <arrowHelper args={[new Vector3(1, 0, 0), new Vector3(0, -size.y / 2 - .001, 0), size.x * .7, "#b65454", size.x * .08, size.x * .05]} />
          <OrbitControls makeDefault target={[0, 0, 0]} enableDamping={false} minDistance={distance * .03} maxDistance={distance * 6} />
        </Canvas>
      </PreviewBoundary>
      <span className={styles.frontMarker}>Red arrow: robot front{match && getCadProduct(match.productId)?.kind === "camera" ? " · Gold arrow: camera" : ""}</span>
      {loading && <div className={styles.previewLoading} role="status">Loading preview…</div>}
    </div>
    <div className={styles.previewControls} aria-label="Preview controls">
      <button type="button" onClick={() => command("left")} aria-label="Rotate preview left" title="Rotate preview left"><RotateCcw size={14} aria-hidden="true" /></button>
      <button type="button" onClick={() => command("right")} aria-label="Rotate preview right" title="Rotate preview right"><RotateCw size={14} aria-hidden="true" /></button>
      <button type="button" onClick={() => command("zoom-in")} aria-label="Zoom preview in">+</button>
      <button type="button" onClick={() => command("zoom-out")} aria-label="Zoom preview out">−</button>
      <button type="button" onClick={() => command("front")}>Front</button><button type="button" onClick={() => command("side")}>Side</button><button type="button" onClick={() => command("top")}>Top</button>
      <button type="button" disabled={!selected} onClick={() => command("selection")}>Focus piece</button><button type="button" onClick={() => command("reset")}>Reset view</button>
    </div>
    <p className={styles.dimensions}>{[size.x, size.y, size.z].map((v) => (v * 1000).toFixed(0)).join(" × ")} mm <span>length × height × width</span></p>
  </section>;
}
