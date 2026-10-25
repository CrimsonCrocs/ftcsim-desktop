"use client";

import { WORLD_PHYSICAL_PARAMETERS } from "@ftc-studio/sim-core";
import type { FieldParameters, FieldPresetId } from "@/lib/field-configuration";
import styles from "./robot-configuration-pane.module.css";

export function FieldSettingsEditor({ preset, parameters, disabled, onPresetChange, onParametersChange }: {
  preset: FieldPresetId;
  parameters: FieldParameters;
  disabled: boolean;
  onPresetChange: (preset: FieldPresetId) => Promise<boolean>;
  onParametersChange: (parameters: FieldParameters) => void;
}) {
  return <div className={styles.fieldSettings}>
    <label className={styles.fieldPreset}><span>Field</span><select aria-label="Simulation field" value={preset} disabled={disabled} onChange={(event) => void onPresetChange(event.target.value as FieldPresetId)}>
      <option value="biobuzz-2026-2027">BIOBUZZ Field</option>
      <option value="decode-2025-2026">DECODE Field</option>
      <option value="empty">Empty Field</option>
    </select></label>
    <div className={styles.toolbar}><h3>Physical parameters</h3><button type="button" disabled={disabled || Object.keys(parameters).length === 0} onClick={() => onParametersChange({})}>Reset parameters</button></div>
    <p className={styles.keyHint}>Unvalidated estimates. Changes reset the field.</p>
    <div className={styles.fieldParameters}>
      {Object.entries(WORLD_PHYSICAL_PARAMETERS).filter(([, parameter]) => parameter.experimentalRange).map(([name, parameter]) => {
        const label = name.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
        const value = parameters[name] ?? parameter.value;
        return <label key={name} className={styles.fieldParameter} title={parameter.source}>
          <span>{label}<small>{parameter.unit}</small></span>
          <input key={value} aria-label={label} type="number" defaultValue={value} min={parameter.experimentalRange![0]} max={parameter.experimentalRange![1]} step="any" required disabled={disabled}
            onBlur={(event) => {
              if (!event.currentTarget.reportValidity()) return;
              const next = event.currentTarget.valueAsNumber;
              if (Number.isFinite(next) && next !== value) onParametersChange({ ...parameters, [name]: next });
            }}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
          />
        </label>;
      })}
    </div>
  </div>;
}
