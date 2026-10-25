"use client";

import { useMemo, useState } from "react";
import { CAD_PRODUCTS, getCadProduct, type CadProduct } from "@/lib/cad/catalog";
import type { CadAnalysis, CadMatch, CadPart, CadVector } from "@/lib/cad/types";
import type { DriveRole } from "@/lib/robot-configuration";
import { CadNumberInput } from "./cad-number-input";
import styles from "./robot-cad-import.module.css";

const KINDS = [["motor", "Motor"], ["servo", "Servo"], ["camera", "Camera"], ["wheel", "Wheel"], ["hub", "Hub"], ["sensor", "Sensor"]] as const;
const ROLES = [["frontLeft", "Front left"], ["frontRight", "Front right"], ["backLeft", "Back left"], ["backRight", "Back right"], ["center", "Center"]] as const;
const DIRECTIONS: [string, CadVector][] = [["Front", { x: 1, y: 0, z: 0 }], ["Back", { x: -1, y: 0, z: 0 }], ["Left", { x: 0, y: 0, z: -1 }], ["Right", { x: 0, y: 0, z: 1 }], ["Up", { x: 0, y: 1, z: 0 }], ["Down", { x: 0, y: -1, z: 0 }]];
const needsReview = (match: CadMatch) => !match.productId && match.evidence !== "Not configured";
const methodLabel = (match: CadMatch) => !match.productId ? needsReview(match) ? "Needs review" : "Not configured" : match.method === "geometry" ? "Shape match" : match.method === "part-number" ? "Part number" : match.method === "manual" ? "Assigned" : "Name match";

type Props = {
  analysis: CadAnalysis; matches: CadMatch[]; selectedId: string | null; disabled: boolean; appearanceOnly: boolean;
  pickedNormal: CadVector | null; onSelect: (id: string) => void;
  onConfigureHardware: () => void;
  onUpdate: (id: string, update: Partial<CadMatch>) => void; onAssign: (part: CadPart, productId: string | null) => void;
  onRemove: (id: string) => void; onExclude: (id: string) => void;
};

export function RobotCadHardware(props: Props) {
  const { analysis, matches, selectedId, onSelect, disabled } = props;
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [browse, setBrowse] = useState(false), [limit, setLimit] = useState(80);
  const byId = useMemo(() => new Map(analysis.parts.map((part) => [part.id, part])), [analysis.parts]);
  const matchById = useMemo(() => new Map(matches.map((match) => [match.partId, match])), [matches]);
  const counts = (kind: string) => matches.filter((match) => kind === "review" ? needsReview(match) : kind === "all" || getCadProduct(match.productId)?.kind === kind).length;
  const rows = (browse ? analysis.parts.filter((part) => part.path.length > 1) : matches.flatMap((match) => byId.get(match.partId) ?? [])).filter((part) => {
    const match = matchById.get(part.id), product = getCadProduct(match?.productId);
    return (filter === "all" || filter === "review" && match && needsReview(match) || product?.kind === filter) && `${part.name} ${product?.label ?? ""} ${match?.hardwareName ?? ""}`.toLowerCase().includes(query.toLowerCase());
  });
  const selected = selectedId ? byId.get(selectedId) : null, selectedMatch = selected ? matchById.get(selected.id) : undefined;
  return <section className={styles.hardware} aria-label="Hardware review">
    <div className={styles.sectionHeading}><h4>Hardware</h4><span>{matches.filter((match) => match.enabled).length} configured · {counts("review")} to review</span></div>
    <div className={styles.filters} role="group" aria-label="Filter hardware">
      {[["all", "All hardware"], ["review", "Needs review"], ["motor", "Motors"], ["servo", "Servos"], ["camera", "Cameras"]].map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setBrowse(false); setLimit(80); }}>{label} <span>{counts(id)}</span></button>)}
    </div>
    <label className={styles.searchLabel}><span>Find a component</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(80); }} placeholder="Part name, model, or hardware name" /></label>
    <label className={styles.check}><input type="checkbox" checked={browse} onChange={(event) => { setBrowse(event.target.checked); setFilter("all"); setLimit(80); }} />Browse all assembly parts</label>
    <div className={styles.componentList} role="region" aria-label="CAD components" tabIndex={0}>
      {rows.slice(0, limit).map((part) => {
        const match = matchById.get(part.id), product = getCadProduct(match?.productId);
        return <div className={styles.componentRow} key={part.id} data-selected={selectedId === part.id}>
          {match && product ? <input type="checkbox" checked={match.enabled} disabled={disabled} aria-label={`Include ${part.name}`} onChange={(event) => props.onUpdate(part.id, { enabled: event.target.checked })} /> : <span className={styles.rowSpacer} />}
          <button type="button" aria-pressed={selectedId === part.id} onClick={() => onSelect(part.id)} title={part.labels.join(" / ")}>
            <strong>{product?.label ?? part.name}</strong><small>{product ? `${match?.hardwareName ? `${match.hardwareName} · ` : ""}${part.name}${match?.driveRole ? ` · ${ROLES.find(([id]) => id === match.driveRole)?.[1]}` : ""}` : match ? match.evidence === "Not configured" ? "Not configured" : "Choose a hardware model" : "Unassigned CAD part"}</small>
          </button><span className={styles.matchMethod}>{match ? methodLabel(match) : ""}</span>
        </div>;
      })}
      {rows.length === 0 && <p className={styles.listEmpty}>No matching components. Browse assembly parts or select a piece in 3D.</p>}
      {rows.length > limit && <button className={styles.showMore} type="button" onClick={() => setLimit((value) => value + 80)}>Show more · {rows.length - limit} remaining</button>}
    </div>
    <p className={styles.hint}>Select a row or click a piece in 3D to configure it.</p>
    {selected ? <ComponentInspector key={selected.id} {...props} part={selected} match={selectedMatch} /> : <div className={styles.inspectorEmpty}>Select a component to inspect its hardware and placement.</div>}
  </section>;
}

function ComponentInspector({ part, match, ...props }: Props & { part: CadPart; match?: CadMatch }) {
  const product = getCadProduct(match?.productId);
  const [kind, setKind] = useState<CadProduct["kind"]>(product?.kind ?? getCadProduct(match?.candidates[0])?.kind ?? "motor"), [query, setQuery] = useState("");
  const ancestors = props.analysis.parts.filter((entry) => entry.path.length > 1 && entry.path.length <= part.path.length && entry.path.every((value, index) => part.path[index] === value)).sort((a, b) => a.path.length - b.path.length);
  const candidates = CAD_PRODUCTS.filter((entry) => entry.kind === kind && `${entry.label} ${entry.id}`.toLowerCase().includes(query.toLowerCase()));
  const likely = match?.candidates.map((id) => getCadProduct(id)).filter((entry): entry is CadProduct => Boolean(entry && entry.kind === kind)) ?? [];
  const products = query ? candidates : [...new Map([...likely, ...candidates].map((entry) => [entry.id, entry])).values()];
  const camera = match?.camera ?? { forward: { x: 1, y: 0, z: 0 }, horizontalFov: product?.camera?.horizontalFov ?? 70, verticalFov: product?.camera?.verticalFov ?? 50 };
  const updateCamera = (next: Partial<typeof camera>) => props.onUpdate(part.id, { camera: { ...camera, ...next } });
  const assign = (id: string) => { props.onAssign(part, id); setQuery(""); };
  return <section className={styles.inspector} aria-label="Selected component" tabIndex={-1}>
    <div className={styles.sectionHeading}><h4>Selected component</h4><button type="button" disabled={props.disabled} onClick={() => props.onExclude(part.id)}>Exclude piece</button></div>
    <strong className={styles.partName}>{part.name}</strong>
    {ancestors.length > 1 && <label>Assembly level<select aria-label="Selected assembly component" value={part.id} onChange={(event) => props.onSelect(event.target.value)}>{ancestors.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}
    <p className={styles.hint}>{[part.size.x, part.size.y, part.size.z].map((v) => (v * 1000).toFixed(1)).join(" × ")} mm</p>{match && <p className={styles.hint}>{match.evidence}{product?.needsReview ? `. ${product.needsReview}` : ""}</p>}
    {props.appearanceOnly && <div className={styles.notice}>Appearance only is selected. Hardware edits will not be applied.<button type="button" disabled={props.disabled} onClick={props.onConfigureHardware}>Configure hardware instead</button></div>}
    {product?.kind !== "camera" && <button type="button" disabled={props.disabled} onClick={() => { setKind("camera"); assign("webcam"); }}>Use as webcam</button>}
    {product && <div className={styles.componentFields}>
      <label className={styles.check}><input type="checkbox" checked={match!.enabled} disabled={props.disabled} onChange={(event) => props.onUpdate(part.id, { enabled: event.target.checked })} />Include component</label>
      {!["wheel", "hub"].includes(product.kind) && <label>HardwareMap name<input aria-label="Component HardwareMap name" value={match!.hardwareName} disabled={props.disabled || !match!.enabled} onChange={(event) => props.onUpdate(part.id, { hardwareName: event.target.value })} /></label>}
      {product.kind === "motor" && <label>Drive assignment<select aria-label="Component drive assignment" value={match?.driveRole ?? ""} disabled={props.disabled || !match!.enabled} onChange={(event) => props.onUpdate(part.id, { driveRole: (event.target.value || undefined) as DriveRole | undefined, driveRoleEdited: true })}><option value="">Mechanism / unassigned</option>{ROLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
      {product.kind === "servo" && <p className={styles.hint}>Servo profile is configured from this model. Travel and dynamics remain editable in Mechanisms.</p>}
      {product.kind === "camera" && <fieldset className={styles.cameraSettings} disabled={props.disabled || !match!.enabled}>
        <legend>Camera direction</legend><p className={styles.hint}>Relative to the robot. The arrow shows where the camera looks.</p>
        <div className={styles.directionButtons} role="group" aria-label="Camera facing">{DIRECTIONS.map(([label, forward]) => <button type="button" key={label} aria-pressed={Math.abs(camera.forward.x - forward.x) + Math.abs(camera.forward.y - forward.y) + Math.abs(camera.forward.z - forward.z) < .001} onClick={() => updateCamera({ forward })}>{label}</button>)}</div>
        {props.pickedNormal && <button type="button" onClick={() => updateCamera({ forward: props.pickedNormal! })}>Use picked surface normal</button>}
        <details><summary>Custom forward vector</summary><div className={styles.vectorFields}>{(["x", "y", "z"] as const).map((axis) => <label key={axis}>{axis.toUpperCase()}<CadNumberInput step="any" aria-label={`Camera forward ${axis.toUpperCase()}`} value={camera.forward[axis]} onValueChange={(value) => updateCamera({ forward: { ...camera.forward, [axis]: value } })} /></label>)}</div><p className={styles.hint}>+X front · +Y up · +Z right. Any non-zero vector is normalized.</p></details>
        <div className={styles.fields}><label>Horizontal FOV (°)<CadNumberInput min="1" max="179" step="any" aria-label="Camera horizontal FOV" value={camera.horizontalFov} onValueChange={(horizontalFov) => updateCamera({ horizontalFov })} /></label><label>Vertical FOV (°)<CadNumberInput min="1" max="179" step="any" aria-label="Camera vertical FOV" value={camera.verticalFov} onValueChange={(verticalFov) => updateCamera({ verticalFov })} /></label></div>
        <p className={styles.hint}>{product.camera?.assumedOptics ? "Default optics are estimates; match your webcam’s lens." : "Verify lens direction before importing."} {product.camera?.kind !== "webcam" ? "Imports a camera feed; device-specific SDK APIs are not simulated." : ""}</p>
      </fieldset>}
      
    </div>}
    <details className={styles.modelPicker} open={!product || undefined}>
      <summary>{product ? `Change model · ${product.label}` : "Choose hardware model"}</summary>
      <label>Hardware type<select aria-label="Hardware type" value={kind} disabled={props.disabled} onChange={(event) => { setKind(event.target.value as CadProduct["kind"]); setQuery(""); }}>{KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Find hardware model<input type="search" value={query} placeholder="Brand, part number, or RPM" onChange={(event) => setQuery(event.target.value)} /></label>
      <div className={styles.modelResults} role="group" aria-label="Matching hardware models">{products.map((entry) => <button key={entry.id} type="button" aria-pressed={product?.id === entry.id} disabled={props.disabled} onClick={() => assign(entry.id)}>{entry.label}{likely.some((candidate) => candidate.id === entry.id) && <small>Suggested</small>}</button>)}{products.length === 0 && <p className={styles.hint}>No models match this search.</p>}</div>
    </details>
    {match && <button type="button" disabled={props.disabled} onClick={() => props.onRemove(part.id)}>Clear hardware assignment</button>}
  </section>;
}
