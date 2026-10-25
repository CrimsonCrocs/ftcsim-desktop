"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RobotConfigurationCommand, RobotConfigurationDocument, RobotConfigurationV3 } from "@/lib/robot-configuration";
import type { RobotVariant } from "@/lib/studio-types";
import { getCadProduct } from "@/lib/cad/catalog";
import { configureCadRobot, suggestCadAssignments } from "@/lib/cad/configure";
import { importCadFile } from "@/lib/cad/import-client";
import { excludeCadParts, remapCadMotionOptions } from "@/lib/cad/assembly-edit";
import type { CadAnalysis, CadImportOptions, CadMatch, CadPart, CadVector } from "@/lib/cad/types";
import { inferCadTransmission, type CadMotionOptions } from "@/lib/cad/transmission";
import { RobotCadPreview } from "./robot-cad-preview";
import { RobotCadHardware } from "./robot-cad-hardware";
import { CadNumberInput } from "./cad-number-input";
import styles from "./robot-cad-import.module.css";

const DRIVE_OPTIONS: [RobotVariant, string][] = [["mecanum", "Mecanum"], ["tank", "Tank-style"], ["x-drive", "X-drive"], ["h-drive", "H-drive"]];
const DEFAULT_OPTIONS: CadImportOptions = { units: "m", up: "z", forward: "x" };

function retainedAssignments(next: CadAnalysis, remembered: Map<string, CadMatch>, reassignDriveRoles = false) {
  const nextParts = new Map(next.parts.map((part) => [part.id, part]));
  const restore = (match: CadMatch, part: CadPart) => {
    const previous = remembered.get(part.sourceNodeId ?? part.id);
    return previous ? { ...previous, partId: part.id, ...(reassignDriveRoles && !previous.driveRoleEdited ? { driveRole: undefined } : {}) } : match;
  };
  const matches = next.matches.map((match) => restore(match, nextParts.get(match.partId)!));
  for (const part of next.parts) {
    const previous = remembered.get(part.sourceNodeId ?? part.id);
    if (previous?.method === "manual" && !matches.some((match) => match.partId === part.id)) matches.push({ ...previous, partId: part.id });
  }
  return matches;
}

export default function RobotCadImportPanel({ document, disabled, onCommand }: { document: RobotConfigurationDocument; disabled: boolean; onCommand: (command: RobotConfigurationCommand) => void | boolean | Promise<boolean> }) {
  const input = useRef<HTMLInputElement>(null), abort = useRef<AbortController | null>(null), generation = useRef(0);
  const importerRef = useRef<HTMLDivElement>(null), exclusionUndoButton = useRef<HTMLButtonElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null), acceptedOptions = useRef(DEFAULT_OPTIONS), undo = useRef<RobotConfigurationV3 | null>(null);
  const [file, setFile] = useState<File | null>(null), [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [analysis, setAnalysis] = useState<CadAnalysis | null>(null), [matches, setMatches] = useState<CadMatch[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState("Reading local file…");
  const [saving, setSaving] = useState(false), [elapsed, setElapsed] = useState(0), [readStartedAt, setReadStartedAt] = useState(0);
  const [motion, setMotion] = useState<CadMotionOptions>({});
  const [selectedId, setSelectedId] = useState<string | null>(null), [pickedNormal, setPickedNormal] = useState<CadVector | null>(null);
  const [excludedSources, setExcludedSources] = useState<string[]>([]);
  const rememberedAssignments = useRef(new Map<string, CadMatch>());
  const [exclusionUndo, setExclusionUndo] = useState<{ analysis: CadAnalysis; matches: CadMatch[]; motion: CadMotionOptions; sources: string[]; partId: string } | null>(null);
  useEffect(() => { if (!busy) return; const started = readStartedAt; const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000); return () => clearInterval(timer); }, [busy, readStartedAt]);
  const [variant, setVariant] = useState<RobotVariant>(document.resolved.variant), [mass, setMass] = useState(document.configuration.physical.chassis.massKg), [appearanceOnly, setAppearanceOnly] = useState(false);
  const [previewReady, setPreviewReady] = useState(false), [previewError, setPreviewError] = useState<string | null>(null);
  const priorPreview = useRef<{ ready: boolean; error: string | null }>({ ready: false, error: null });
  const loaded = document.configuration.physical.visualModel;
  const setReady = useCallback(() => setPreviewReady(true), []);
  const failPreview = useCallback((message: string) => { setPreviewError(message); setPreviewReady(false); }, []);
  useEffect(() => () => { generation.current++; abort.current?.abort(); }, []);

  const rememberAssignments = () => { if (analysis) for (const match of matches) { const part = analysis.parts.find((part) => part.id === match.partId); if (part) rememberedAssignments.current.set(part.sourceNodeId ?? part.id, match); } };
  const read = async (nextFile: File, nextOptions: CadImportOptions, fresh = false, restorePieces = false) => {
    if (fresh) rememberedAssignments.current.clear(); else rememberAssignments();
    const nextGeneration = ++generation.current;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    if (!busy) priorPreview.current = { ready: previewReady, error: previewError };
    setBusy(true); setReadStartedAt(Date.now()); setElapsed(0); setProgress("Reading local file…"); setError(null); setSuccess(null); setPreviewReady(false); setPreviewError(null);
    try {
      let imported = await importCadFile(nextFile, nextOptions, controller.signal, (message) => { if (nextGeneration === generation.current) setProgress(message); });
      const sameSource = !fresh && analysis?.sourceSha256 === imported.sourceSha256;
      if (sameSource && !restorePieces && excludedSources.length) {
        const excluded = imported.parts.filter((part) => excludedSources.includes(part.sourceNodeId ?? part.id)).map((part) => part.id);
        imported = await excludeCadParts(imported, excluded);
      }
      if (nextGeneration !== generation.current) return;
      const retained = sameSource ? retainedAssignments(imported, rememberedAssignments.current, true) : imported.matches;
      const assigned = suggestCadAssignments({ ...imported, matches: retained }, document);
      acceptedOptions.current = nextOptions;
      if (restorePieces) setExcludedSources([]);
      setAnalysis(imported); setMatches(assigned); if (sameSource) setMotion(remapCadMotionOptions(analysis.parts, imported.parts, motion)); setPickedNormal(null); setSelectedId(assigned.find((match) => !match.productId)?.partId ?? assigned[0]?.partId ?? null);
      setExclusionUndo(null);
      if (!sameSource) { setVariant(imported.drivetrain ?? document.resolved.variant); setAppearanceOnly(!assigned.some((match) => match.driveRole)); }
    } catch (failure) { if (nextGeneration === generation.current && !controller.signal.aborted) { setOptions(acceptedOptions.current); setPreviewReady(priorPreview.current.ready); setPreviewError(priorPreview.current.error); setError(failure instanceof Error ? failure.message : String(failure)); } }
    finally { if (nextGeneration === generation.current) setBusy(false); }
  };
  const choose = (nextFile: File | undefined) => {
    if (!nextFile || disabled) return;
    const glb = /\.glb$/i.test(nextFile.name), nextOptions: CadImportOptions = { units: /\.stl$/i.test(nextFile.name) ? "mm" : "m", up: glb ? "y" : "z", forward: "x" };
    setExcludedSources([]); setExclusionUndo(null); setSelectedId(null); setPickedNormal(null);
    setFile(nextFile); setMass(document.configuration.physical.chassis.massKg); setOptions(nextOptions); setAnalysis(null); setMotion({}); void read(nextFile, nextOptions, true);
  };
  const changeOptions = (next: CadImportOptions) => { setOptions(next); if (file) void read(file, next); };
  const updateMatch = (id: string, update: Partial<CadMatch>) => setMatches((current) => current.map((match) => match.partId === id ? { ...match, ...update } : match));
  const uniqueName = (productId: string) => {
    const product = getCadProduct(productId)!;
    const base = product.kind === "camera" ? product.camera!.kind === "webcam" ? "Webcam " : product.camera!.kind + "_" : product.kind + "_";
    let index = 1; while (matches.some((match) => match.hardwareName === base + index)) index++;
    return base + index;
  };
  const assign = (part: CadPart, productId: string | null) => {
    const product = getCadProduct(productId), previous = matches.find((entry) => entry.partId === part.id);
    const match: CadMatch = { partId: part.id, productId, candidates: previous?.candidates ?? [], method: "manual", evidence: "Assigned by you", enabled: Boolean(product), hardwareName: previous?.hardwareName || (product ? uniqueName(product.id) : ""),
      ...(product?.kind === "motor" && previous?.driveRole ? { driveRole: previous.driveRole, driveRoleEdited: true } : {}),
      ...(product?.kind === "camera" ? { camera: previous?.camera ?? { forward: pickedNormal ?? { x: 1, y: 0, z: 0 }, horizontalFov: product.camera!.horizontalFov, verticalFov: product.camera!.verticalFov } } : {}) };
    setMatches((current) => [...current.filter((entry) => entry.partId !== part.id), match]); setSelectedId(part.id);
  };
  const exclude = async (id: string) => {
    if (!analysis || busy || saving || disabled) return;
    const source = analysis.parts.find((part) => part.id === id); if (!source) return;
    rememberAssignments();
    const revision = ++generation.current; setSaving(true); setError(null);
    try {
      const edited = await excludeCadParts({ ...analysis, matches }, [id]);
      if (revision !== generation.current) return;
      setExclusionUndo({ analysis, matches, motion, sources: [...excludedSources], partId: id }); setExcludedSources([...excludedSources, source.sourceNodeId ?? source.id]);
      setAnalysis(edited); setMatches(edited.matches); setMotion(remapCadMotionOptions(analysis.parts, edited.parts, motion)); setSelectedId(null); setPickedNormal(null); setPreviewReady(false);
      requestAnimationFrame(() => exclusionUndoButton.current?.focus());
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setSaving(false); }
  };
  const undoExclusion = () => {
    if (!exclusionUndo || !analysis) return;
    rememberAssignments();
    const currentSources = new Set(analysis.parts.map((part) => part.sourceNodeId ?? part.id));
    const restoredOnly = exclusionUndo.analysis.parts.filter((part) => !currentSources.has(part.sourceNodeId ?? part.id));
    const recoveredMotion = remapCadMotionOptions(exclusionUndo.analysis.parts, restoredOnly, exclusionUndo.motion);
    const currentMotion = remapCadMotionOptions(analysis.parts, exclusionUndo.analysis.parts, motion);
    setAnalysis(exclusionUndo.analysis); setMatches(retainedAssignments({ ...exclusionUndo.analysis, matches: exclusionUndo.matches }, rememberedAssignments.current));
    setMotion({ excludedPartIds: [...(recoveredMotion.excludedPartIds ?? []), ...(currentMotion.excludedPartIds ?? [])], ratios: { ...recoveredMotion.ratios, ...currentMotion.ratios } });
    setExcludedSources(exclusionUndo.sources); setSelectedId(exclusionUndo.partId); setExclusionUndo(null); setPreviewReady(false);
    requestAnimationFrame(() => { const row = importerRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"] > button'); if (row) row.focus(); else focusComponentList(); });
  };
  const draft = useMemo(() => {
    if (!analysis || busy) return null;
    try { return { document: configureCadRobot(analysis, matches, variant, mass, document, appearanceOnly, motion), error: null }; }
    catch (failure) { return { document: null, error: failure instanceof Error ? failure.message : String(failure) }; }
  }, [analysis, matches, variant, mass, document, appearanceOnly, busy, motion]);
  const transmission = useMemo(() => analysis ? inferCadTransmission(analysis.parts, matches) : { links: [], warnings: [] }, [analysis, matches]);
  const diagnostics = draft?.document?.diagnostics ?? [];
  const previousNames = [...document.configuration.devices.map((device) => device.hardwareMapName), ...document.configuration.physical.cameras.map((camera) => camera.name), ...document.configuration.physical.servos.map((servo) => servo.name), ...document.configuration.physical.sensors.map((sensor) => sensor.name)];
  const removedNames = appearanceOnly ? [] : previousNames.filter((name) => !matches.some((match) => match.enabled && match.hardwareName === name));
  const disabledReason = saving ? "Preparing model…" : busy ? "Updating assembly…" : previewError ? "A working 3D preview is required to review the robot." : !previewReady ? "Loading preview…" : draft?.error ?? diagnostics[0]?.message ?? null;
  const canApply = Boolean(draft?.document && !diagnostics.length && !busy && !saving && !disabled && previewReady && !previewError);
  const applyImport = async () => {
    if (!draft?.document || !canApply) return;
    const previous = structuredClone(document.configuration); setSaving(true); setError(null);
    try {
      if (await onCommand({ type: "import-cad-robot", configuration: draft.document.configuration }) === false) throw new Error("The project is currently read-only. Try again when it is editable.");
      undo.current = previous; setSuccess("Robot imported into this project."); setAnalysis(null); setFile(null); setExclusionUndo(null); chooseButton.current?.focus();
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setSaving(false); requestAnimationFrame(() => chooseButton.current?.focus()); }
  };
  const removeAppearance = async () => {
    const previous = structuredClone(document.configuration); setSaving(true); setError(null);
    try {
      if (await onCommand({ type: "remove-cad-model" }) === false) throw new Error("The project is currently read-only. Try again when it is editable.");
      undo.current = previous; setSuccess("Built-in appearance restored.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setSaving(false); requestAnimationFrame(() => chooseButton.current?.focus()); }
  };
  const select = (id: string, normal?: CadVector) => { setSelectedId(id); setPickedNormal(normal ?? null); };
  const selectInPreview = (id: string, normal?: CadVector) => { select(id, normal); if (window.matchMedia("(max-width: 800px), (max-height: 650px)").matches) requestAnimationFrame(() => importerRef.current?.querySelector<HTMLElement>('[aria-label="Selected component"]')?.scrollIntoView({ block: "nearest" })); };
  const focusComponentList = () => importerRef.current?.querySelector<HTMLElement>('[aria-label="CAD components"]')?.focus();

  return <div ref={importerRef} className={styles.importer}>
    <div className={styles.heading}><div className={styles.fileHeading}><h3>Import robot CAD</h3><p>{file?.name ?? "STEP, IGES, GLB, or STL assembly"}</p></div><div className={styles.headerActions}><button ref={chooseButton} type="button" disabled={disabled || saving} onClick={() => input.current?.click()}>{file || loaded ? "Choose another file" : "Choose CAD file"}</button>{analysis && <button type="button" className={styles.primary} disabled={!canApply} onClick={() => { void applyImport(); }} aria-describedby={disabledReason ? "cad-import-disabled-reason" : removedNames.length ? "cad-import-replacements" : undefined}>{saving ? "Preparing model…" : "Use this robot"}</button>}</div>{analysis && disabledReason && <span id="cad-import-disabled-reason" className={styles.hint} role="status">{disabledReason}</span>}{analysis && removedNames.length > 0 && <span id="cad-import-replacements" className={styles.hint}>{removedNames.length} existing hardware names will be removed. Review name changes below the preview.</span>}</div>
    <input ref={input} type="file" accept=".step,.stp,.iges,.igs,.glb,.stl" aria-label="Robot CAD file" className={styles.fileInput} disabled={disabled || saving} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
    <div className={styles.body}>
      {!analysis && !busy && <div className={styles.empty}>{loaded ? <><strong>{loaded.sourceFileName}</strong><p>Imported robot is active. Hardware, camera mounts, and physics remain editable in Robot Settings.</p><button type="button" disabled={disabled || saving} onClick={() => { void removeAppearance(); }}>Use built-in appearance</button></> : <><strong>Use your CAD assembly as the robot</strong><p>Open an assembly, review detected hardware, and select pieces in 3D to configure motors, servos, and webcams.</p><p>STEP and GLB retain component names for better detection. Up to 384 MiB; the optimized model is saved separately.</p></>}<p className={styles.hint}>STEP files over 32 MiB use private conversion when available. Source CAD is deleted after conversion.</p></div>}
      {busy && <div className={analysis ? styles.updating : styles.progress} role="status"><strong>{analysis ? "Updating assembly…" : "Reading assembly…"}</strong><span>{progress} · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span><button type="button" onClick={() => { generation.current++; abort.current?.abort(); setBusy(false); setOptions(acceptedOptions.current); setPreviewReady(priorPreview.current.ready); setPreviewError(priorPreview.current.error); if (!analysis) setFile(null); chooseButton.current?.focus(); }}>Cancel import</button></div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {success && <div className={styles.saved} role="status"><span>{success}</span><button type="button" disabled={disabled || saving} onClick={async () => { if (!undo.current) return; setSaving(true); try { if (await onCommand({ type: "import-cad-robot", configuration: undo.current }) === false) throw new Error("The project is currently read-only. Try undo again when it is editable."); undo.current = null; setSuccess(null); chooseButton.current?.focus(); } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); } finally { setSaving(false); requestAnimationFrame(() => chooseButton.current?.focus()); } }}>Undo import</button></div>}
      {analysis && <div className={styles.review}>
        <div className={styles.options} inert={saving}>
          <details className={styles.setup}><summary>Assembly setup <span>{appearanceOnly ? "Appearance only" : DRIVE_OPTIONS.find(([id]) => id === variant)?.[1]} · {mass} kg</span></summary><h4>Assembly setup</h4>
            <div className={styles.fields}>
              <label>Units<select aria-label="Units" value={options.units} disabled={disabled || /\.(step|stp|iges|igs)$/i.test(file?.name ?? "")} onChange={(e) => changeOptions({ ...options, units: e.target.value as CadImportOptions["units"] })}><option value="m">{/\.(step|stp|iges|igs)$/i.test(file?.name ?? "") ? "From file" : "Metres"}</option><option value="mm">Millimetres</option><option value="in">Inches</option></select></label>
              <label>Up axis<select aria-label="Up axis" value={options.up} disabled={disabled} onChange={(e) => { const up = e.target.value as "y" | "z"; changeOptions({ ...options, up, forward: options.forward.endsWith(up) ? "x" : options.forward }); }}><option value="z">Z up</option><option value="y">Y up</option></select></label>
              <label>Front of robot<select aria-label="Front of robot" value={options.forward} disabled={disabled} onChange={(e) => changeOptions({ ...options, forward: e.target.value as CadImportOptions["forward"] })}>{(["x", "-x", "y", "-y", "z", "-z"] as const).filter((axis) => !axis.endsWith(options.up)).map((axis) => <option key={axis} value={axis}>{axis.startsWith("-") ? "−" : "+"}{axis.at(-1)?.toUpperCase()}</option>)}</select></label>
              <label>Mass (kg)<CadNumberInput aria-label="Mass (kg)" min=".1" max="100" step=".1" value={mass} disabled={disabled || appearanceOnly} onValueChange={setMass} /></label>
            </div>
            <label className={styles.check}><input type="checkbox" checked={appearanceOnly} disabled={disabled} onChange={(e) => setAppearanceOnly(e.target.checked)} />Import appearance only</label>
            <p className={styles.hint}>{appearanceOnly ? "Keeps current motors, cameras, drivetrain, and physics." : "Hub ports are assigned for simulation. Verify wiring, mass, and gear reductions."}</p>
            {!appearanceOnly && <label className={styles.driveLabel}>Drivetrain<select aria-label="Imported drivetrain" value={variant} disabled={disabled} onChange={(e) => setVariant(e.target.value as RobotVariant)}>{DRIVE_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}{analysis.drivetrain === id ? " · detected" : ""}</option>)}</select></label>}
            {/\.(step|stp|iges|igs)$/i.test(file?.name ?? "") && <p className={styles.hint}>STEP/IGES units are read from the file.</p>}
          </details>
          <RobotCadHardware analysis={analysis} matches={matches} selectedId={selectedId} pickedNormal={pickedNormal} appearanceOnly={appearanceOnly} disabled={disabled || busy || saving} onConfigureHardware={() => setAppearanceOnly(false)} onSelect={select} onUpdate={updateMatch} onAssign={assign} onRemove={(id) => { updateMatch(id, { productId: null, enabled: false, hardwareName: "", driveRole: undefined, driveRoleEdited: true, method: "manual", camera: undefined, evidence: "Not configured" }); requestAnimationFrame(focusComponentList); }} onExclude={(id) => { void exclude(id); }} />
          {(transmission.links.length > 0 || transmission.warnings.length > 0) && <details className={styles.unmatched} inert={busy || saving || appearanceOnly}><summary>Motion connections · {transmission.links.length}</summary><p className={styles.hint}>Review inferred coaxial shafts and external spur gear trains.</p>{transmission.links.map((link) => { const part = analysis.parts.find((entry) => entry.id === link.partId)!, motor = matches.find((entry) => entry.partId === link.motorPartId); return <label className={styles.check} key={link.partId}><input type="checkbox" checked={!motion.excludedPartIds?.includes(link.partId)} disabled={disabled} onChange={(event) => { const checked = event.target.checked; setMotion((current) => ({ ...current, excludedPartIds: checked ? current.excludedPartIds?.filter((id) => id !== link.partId) : [...(current.excludedPartIds ?? []), link.partId] })); }} /><span>{motor?.hardwareName || "Motor"} → {part.name}<small className={styles.motionRatio}>{link.evidence === "gear-mesh" ? "Gear train" : "Shared axle"} · {link.ratio < 0 ? "reverse · " : ""}{Number(Math.abs(link.ratio).toFixed(4))}× motor output</small></span></label>; })}{transmission.warnings.map((warning) => <p className={styles.hint} key={warning}>{warning}</p>)}</details>}
        </div>
        <div className={styles.previewColumn} role="region" aria-label="Model preview and import notes">
          <RobotCadPreview base64={analysis.glbBase64} size={analysis.size} onReady={setReady} onError={failPreview} loading={!previewReady || busy || saving} selection={{ parts: analysis.parts, matches, selectedId, onSelect: selectInPreview }} />
          <div className={styles.previewNotes}>
            {excludedSources.length > 0 && <div className={styles.saved} role="status"><span>{excludedSources.length} {excludedSources.length === 1 ? "piece" : "pieces"} excluded. Remaining assembly recentered.</span>{exclusionUndo && <button ref={exclusionUndoButton} type="button" disabled={busy || saving} onClick={undoExclusion}>Undo exclusion</button>}<button type="button" disabled={busy || saving} onClick={() => { if (file) void read(file, options, false, true); }}>Restore all pieces</button></div>}
            {previewError && <p className={styles.error} role="alert">3D preview unavailable: {previewError}</p>}
            <p className={styles.hint}>{analysis.triangleCount.toLocaleString()} triangles · {analysis.parts.length.toLocaleString()} assembly nodes · collision uses the chassis box.</p>
            <details><summary>Import notes{analysis.warnings.length ? ` · ${analysis.warnings.length}` : ""}</summary><p className={styles.hint}>Coaxial shafts and supported spur gears share motor motion. Other joints need configuration.</p><p className={styles.hint}>STEP files over 32 MiB use private conversion when available. Source CAD is deleted after conversion.</p>{analysis.warnings.map((warning) => <p key={warning} className={styles.hint}>{warning}</p>)}</details>
            {removedNames.length > 0 && <details><summary>Hardware being replaced · {removedNames.length}</summary><p className={styles.hint}>{removedNames.join(", ")}. Update code that uses these names, or choose appearance only.</p></details>}
          </div>
        </div>
      </div>}
    </div>
  </div>;
}
