"use client";

import {
  CircleAlert,
  CirclePlus,
  Camera,
  Cog,
  Cuboid,
  FileJson2,
  FileBox,
  SlidersHorizontal,
  Settings,
  Gamepad2,
  Map,
  CircuitBoard,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import dynamic from "next/dynamic";
import {
  MAX_EXPANSION_HUBS,
  type RobotConfigurationCommand,
  type RobotConfigurationDocument,
} from "@/lib/robot-configuration";
import { FieldSettingsEditor } from "./field-settings-editor";
import type { FieldParameters, FieldPresetId } from "@/lib/field-configuration";
import { PlaySettingsEditor } from "./play-settings-editor";
import type { PlaySettings } from "@/lib/play-settings";
import type { RobotVariant } from "@/lib/studio-types";
import { HubConfiguration, DrivetrainAssignments } from "./hub-configuration";
import { RobotConfigurationPhysicalEditor, type PhysicalConfigurationSection } from "./robot-configuration-physical";
import styles from "./robot-configuration-pane.module.css";

const RobotCadImportPanel = dynamic(() => import("./robot-cad-import-panel"), { ssr: false, loading: () => <p role="status">Loading CAD importer…</p> });
type ConfigurationSection = "connections" | "cad" | "play" | "field" | PhysicalConfigurationSection;
const CONFIGURATION_SECTIONS = [
  { id: "connections", label: "Hub Configuration", icon: CircuitBoard },
  { id: "chassis", label: "Chassis", icon: Cuboid },
  { id: "cad", label: "Import CAD", icon: FileBox },
  { id: "drive", label: "Drivetrain", icon: Cog },
  { id: "mechanisms", label: "Mechanisms", icon: SlidersHorizontal },
  { id: "cameras", label: "Cameras", icon: Camera },
  { id: "field", label: "Field Settings", icon: Map },
  { id: "play", label: "Play Settings", icon: Gamepad2 },
] as const;

const ROBOT_LABELS: Record<RobotVariant, string> = {
  mecanum: "Mecanum",
  tank: "Tank-style",
  "x-drive": "X-drive",
  "h-drive": "H-drive",
};

const FOCUSABLE_SELECTOR = [
  "button:not(:disabled)",
  "select:not(:disabled)",
  "input:not(:disabled)",
  "summary",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function RobotConfigurationDialog({
  active = true,
  disabled,
  disabledReason,
  document,
  error,
  onClose,
  onCommand,
  onOpenManifest,
  fieldPreset,
  fieldParameters,
  onFieldPresetChange,
  onFieldParametersChange,
  playSettings,
  onPlaySettingsChange,
}: {
  active?: boolean;
  fieldPreset: FieldPresetId;
  fieldParameters: FieldParameters;
  onFieldPresetChange: (preset: FieldPresetId) => Promise<boolean>;
  onFieldParametersChange: (parameters: FieldParameters) => void;
  playSettings: PlaySettings;
  onPlaySettingsChange: (settings: PlaySettings) => void;
  disabled: boolean;
  disabledReason: string | null;
  document: RobotConfigurationDocument | null;
  error: string | null;
  onClose: () => void;
  onCommand: (command: RobotConfigurationCommand) => void | boolean | Promise<boolean>;
  onOpenManifest: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [section, setSection] = useState<ConfigurationSection>("connections");
  const [cadVisited, setCadVisited] = useState(false);
  const [cadOpen, setCadOpen] = useState(false);
  const cadDialogRef = useRef<HTMLElement | null>(null);
  const cadLauncherRef = useRef<HTMLButtonElement | null>(null);
  const selectSection = (next: ConfigurationSection) => setSection(next);
  const closeCadImporter = () => {
    setCadOpen(false);
    window.requestAnimationFrame(() => cadLauncherRef.current?.focus());
  };
  const [horizontalTabs, setHorizontalTabs] = useState(false);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const expansionHubCount = document?.configuration.controllers.filter((controller) => (
    controller.kind === "rev-expansion-hub"
  )).length ?? 0;
  const canAddExpansionHub = expansionHubCount < MAX_EXPANSION_HUBS;

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    const firstControl = dialog?.querySelector<HTMLElement>("select, button");
    window.requestAnimationFrame(() => firstControl?.focus());
  }, [active]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 600px), (max-height: 500px) and (orientation: landscape)");
    const updateOrientation = () => setHorizontalTabs(query.matches);
    updateOrientation();
    query.addEventListener("change", updateOrientation);
    return () => query.removeEventListener("change", updateOrientation);
  }, []);

  useEffect(() => {
    if (!active || !cadOpen) return;
    const frame = window.requestAnimationFrame(() => cadDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [active, cadOpen]);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement && event.target.type === "search") { event.stopPropagation(); return; }
      event.preventDefault();
      event.stopPropagation();
      if (cadOpen) closeCadImporter(); else onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const currentDialog = cadOpen ? cadDialogRef.current : dialogRef.current;
    const controls = Array.from(currentDialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
      .filter((element) => element.getClientRects().length > 0 && !element.closest("[inert], [aria-hidden='true']"));
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && (globalThis.document.activeElement === first || !currentDialog?.contains(globalThis.document.activeElement))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const handleSectionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % CONFIGURATION_SECTIONS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + CONFIGURATION_SECTIONS.length) % CONFIGURATION_SECTIONS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = CONFIGURATION_SECTIONS.length - 1;
    else return;
    event.preventDefault();
    selectSection(CONFIGURATION_SECTIONS[nextIndex].id);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")[nextIndex]?.focus();
  };

  return (
    <div className={`robot-configuration-dialog ${styles.overlay}`} role="presentation">
      <section
        ref={dialogRef}
        hidden={cadOpen}
        className={`robot-configuration-pane robot-configuration-pane--dialog ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="robot-configuration-dialog-title"
        aria-describedby={document ? undefined : "robot-configuration-dialog-description"}
        onKeyDown={handleDialogKeyDown}
      >
        <header className="robot-configuration-pane__header">
          <h2><Settings aria-hidden="true" /><span id="robot-configuration-dialog-title">Project Settings</span></h2>
          <div className="robot-configuration-pane__header-actions">
            <button type="button" onClick={onClose} aria-label="Close Project Settings" title="Close Project Settings">
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        {document ? (
          <div className={styles.workspace}>
            <div className={styles.tabs} ref={tabsRef} role="tablist" aria-orientation={horizontalTabs ? "horizontal" : "vertical"} aria-label="Project Settings categories">
              <div className={styles.categoryHeading} role="presentation"><Settings aria-hidden="true" />Robot Settings</div>
              {CONFIGURATION_SECTIONS.map(({ id, label, icon: Icon }, index) => <button
                className={(id === "play" || id === "field") ? styles.topLevelCategory : styles.robotCategory}
                key={id}
                type="button"
                role="tab"
                id={`configuration-tab-${id}`}
                aria-controls={`configuration-panel-${id}`}
                aria-selected={section === id}
                tabIndex={section === id ? 0 : -1}
                onClick={() => selectSection(id)}
                onKeyDown={(event) => handleSectionKeyDown(event, index)}
              ><Icon aria-hidden="true" /><span>{label}</span></button>)}
            </div>

            {document.diagnostics.length > 0 && (
              <div className="configuration-diagnostics" role="status" aria-live="polite">
                <CircleAlert aria-hidden="true" />
                <div>
                  <strong>Configuration needs attention</strong>
                  <ul>{document.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${index}`}>{diagnostic.message}</li>)}</ul>
                </div>
              </div>
            )}

            {CONFIGURATION_SECTIONS.map(({ id }) => <div
              key={id}
              hidden={section !== id}
              className={`${styles.panel} ${id === "connections" ? styles.connections : styles.physical}`}
              role="tabpanel"
              id={`configuration-panel-${id}`}
              aria-labelledby={`configuration-tab-${id}`}
              tabIndex={0}
            >
              {section === id && (id === "cad" ? <div className={styles.toolbar}>
                <button ref={cadLauncherRef} type="button" aria-haspopup="dialog" onClick={() => { setCadVisited(true); setCadOpen(true); }}>Open CAD Importer</button>
              </div> : id === "field" ? <FieldSettingsEditor preset={fieldPreset} parameters={fieldParameters} disabled={disabled} onPresetChange={onFieldPresetChange} onParametersChange={onFieldParametersChange} /> : id === "play" ? <PlaySettingsEditor settings={playSettings} disabled={disabled} onChange={onPlaySettingsChange} /> : id === "connections" ? <>
                <div className={styles.toolbar}>
                  <button
                    type="button"
                    disabled={disabled || !canAddExpansionHub}
                    title={canAddExpansionHub ? "Add one REV Expansion Hub" : "One Expansion Hub is already configured"}
                    onClick={() => onCommand({ type: "add-expansion-hub" })}
                  ><CirclePlus aria-hidden="true" /> Add Expansion Hub</button>
                </div>
                <HubConfiguration document={document} disabled={disabled} onCommand={onCommand} />
              </> : <>
                {id === "drive" && <div className={styles.driveSetup}>
                  <div className={styles.toolbar}><label><span>Drivetrain</span><select
                    aria-label="Drivetrain"
                    value={document.configuration.drivetrain.kind}
                    onChange={(event) => onCommand({ type: "set-drivetrain", variant: event.target.value as RobotVariant })}
                    disabled={disabled}
                  >{Object.entries(ROBOT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
</div>
                  <DrivetrainAssignments document={document} disabled={disabled} onCommand={onCommand} />
                </div>}
                {id === "drive" ? <details className={styles.advanced}>
                  <summary>Advanced physics</summary>
                  <RobotConfigurationPhysicalEditor document={document} disabled={disabled} section={id} onCommand={onCommand} />
                </details> : <RobotConfigurationPhysicalEditor document={document} disabled={disabled} section={id} onCommand={onCommand} />}
              </>)}
            </div>)}
          </div>
        ) : (
          <div className="robot-configuration-dialog__error" role="alert">
            <CircleAlert aria-hidden="true" />
            <strong>Configuration could not be loaded</strong>
            <p id="robot-configuration-dialog-description">{error ?? "ftcsim.project.json is unavailable."}</p>
            <button type="button" onClick={onOpenManifest}>Open ftcsim.project.json</button>
          </div>
        )}

        <footer className="robot-configuration-dialog__footer">
          <span>{disabled ? disabledReason ?? "Configuration is currently read-only." : "Changes save automatically."}</span>
          <div>
            <button type="button" className={`robot-configuration-dialog__manifest ${styles.manifestButton}`} aria-label="Open Manifest" title="Open Manifest" onClick={onOpenManifest}>
              <FileJson2 aria-hidden="true" /><span>Open Manifest</span>
            </button>
            <button type="button" className="robot-configuration-dialog__done" onClick={onClose}>Done</button>
          </div>
        </footer>
      </section>
      {cadVisited && document && <section
        ref={cadDialogRef}
        hidden={!cadOpen}
        className={`robot-configuration-pane robot-configuration-pane--dialog ${styles.dialog} ${styles.cadImporterDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cad-importer-title"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="robot-configuration-pane__header">
          <h2 id="cad-importer-title">CAD Importer</h2>
          <button type="button" onClick={closeCadImporter} aria-label="Close CAD Importer" title="Close CAD Importer"><X aria-hidden="true" /></button>
        </header>
        <div className={styles.cadImporterBody}>
          <RobotCadImportPanel document={document} disabled={disabled} onCommand={onCommand} />
        </div>
        <footer className="robot-configuration-dialog__footer">
          <span>{disabled ? disabledReason ?? "Configuration is currently read-only." : "Closing keeps this review. Use this robot to apply."}</span>
          <div><button type="button" onClick={closeCadImporter}>Close</button></div>
        </footer>
      </section>}
    </div>
  );
}
