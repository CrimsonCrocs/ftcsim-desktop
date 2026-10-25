"use client";

import { useState } from "react";
import { KEYBOARD_CONTROLS, DEFAULT_KEYBOARD_BINDINGS, assignKeyboardBinding, isBindableKey, keyboardKeyLabel, type KeyboardControl, type PlaySettings } from "@/lib/play-settings";
import styles from "./robot-configuration-pane.module.css";
import { GamepadControlsGuide } from "./gamepad-controls-guide";

export function PlaySettingsEditor({ settings, disabled, onChange }: {
  settings: PlaySettings;
  disabled: boolean;
  onChange: (settings: PlaySettings) => void;
}) {
  const [capturing, setCapturing] = useState<KeyboardControl | null>(null);
  return <div className={styles.playSettings}>
    <div className={styles.toolbar}>
      <h3>Keyboard · Gamepad 1</h3>
      <button type="button" disabled={disabled} onClick={() => { setCapturing(null); onChange({ keyboard: { ...DEFAULT_KEYBOARD_BINDINGS } }); }}>Reset bindings</button>
    </div>
    <p className={styles.keyHint}>Select a binding and press a key. Backspace clears it.</p>
    <div className={styles.keyBindings}>
      {KEYBOARD_CONTROLS.map(({ id, label, gamepad }) => <div key={id} className={styles.keyBinding}>
        <span>{label}<small>{gamepad}</small></span>
        <button type="button" disabled={disabled} aria-label={`${label}: ${capturing === id ? "press a key" : keyboardKeyLabel(settings.keyboard[id])}`}
          title={`Change ${label.toLowerCase()} key`} aria-pressed={capturing === id}
          onClick={() => setCapturing(capturing === id ? null : id)}
          onBlur={() => setCapturing(null)}
          onKeyDown={(event) => {
            if (capturing !== id) return;
            event.stopPropagation();
            if (event.key === "Tab") { setCapturing(null); return; }
            event.preventDefault();
            if (event.key === "Escape") { setCapturing(null); return; }
            if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
            const code = event.key === "Backspace" || event.key === "Delete" ? "" : event.code;
            if (code && !isBindableKey(code)) return;
            onChange({ keyboard: assignKeyboardBinding(settings.keyboard, id, code) });
            setCapturing(null);
          }}
        >{capturing === id ? "Press a key…" : keyboardKeyLabel(settings.keyboard[id])}</button>
      </div>)}
    </div>
    <section className={styles.controlsGuide} aria-label="Gamepad controls">
      <h3>Gamepad controls</h3>
      <GamepadControlsGuide bindings={settings.keyboard} />
    </section>
  </div>;
}
