"use client";

import { useId, useRef } from "react";
import { CircleHelp, X } from "lucide-react";
import { KEYBOARD_CONTROLS, keyboardKeyLabel, type KeyboardBindings, type KeyboardControl } from "@/lib/play-settings";
import styles from "./gamepad-controls-guide.module.css";

// These describe the BIOBUZZ DriverControlled starter in projects/templates.ts.
// User-written OpModes own their own gamepad behavior.
const ROBOT_ACTIONS: Record<KeyboardControl, string> = {
  forward: "Drive forward",
  backward: "Drive backward",
  left: "Strafe left",
  right: "Strafe right",
  turnLeft: "Turn left",
  turnRight: "Turn right",
  dpadUp: "Raise lift",
  dpadDown: "Lower lift",
  dpadLeft: "Hold to turn turret left; release to stop",
  dpadRight: "Hold to turn turret right; release to stop",
  a: "Run the shared intake/feeder motor forward at full power",
  b: "Reverse the shared intake/feeder motor and open the rejection gate",
  x: "Reverse the shared intake/feeder motor",
  y: "Release lift tray",
  leftTrigger: "Run the shared intake/feeder motor forward in proportion to trigger",
  rightTrigger: "Spin shooter wheels",
  leftBumper: "Lower shooter hood",
  rightBumper: "Raise shooter hood",
};

export function GamepadControlsGuide({ bindings }: { bindings: KeyboardBindings }) {
  return <div className={styles.guide}>
    <p className={styles.note}>BIOBUZZ starter controls. Intake and feeder share one motor: A commands full forward power; otherwise the left trigger varies forward power. B or X overrides forward input and reverses it; B also opens the rejection gate. Hold one turret direction to move it; holding both directions or neither stops it. Turret encoder telemetry wraps through 0–360°. Custom OpModes may differ.</p>
    <table className={styles.table}>
      <thead><tr><th scope="col">Gamepad [Keyboard]</th><th scope="col">Robot action</th></tr></thead>
      <tbody>{KEYBOARD_CONTROLS.map(({ id, label, gamepad }) => <tr key={id}>
        <th scope="row">{gamepad.includes("stick") ? gamepad : label} <span className={styles.binding}>[<kbd>{keyboardKeyLabel(bindings[id]).trim()}</kbd>]</span></th>
        <td>{ROBOT_ACTIONS[id]}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

export function GamepadControlsHelp({ bindings }: { bindings: KeyboardBindings }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  return <>
    <button type="button" className={styles.helpButton} aria-label="Gamepad controls" title="Gamepad controls" aria-haspopup="dialog" aria-controls={id} onClick={() => dialog.current?.showModal()}>
      <CircleHelp aria-hidden="true" />
    </button>
    <dialog ref={dialog} id={id} className={styles.dialog} aria-labelledby={`${id}-title`} onKeyDown={(event) => event.stopPropagation()}>
      <header className={styles.header}>
        <h2 id={`${id}-title`}>Gamepad controls</h2>
        <button type="button" className={styles.closeButton} aria-label="Close gamepad controls" title="Close gamepad controls" onClick={() => dialog.current?.close()}><X aria-hidden="true" /></button>
      </header>
      <div className={styles.content}><GamepadControlsGuide bindings={bindings} /></div>
      <footer className={styles.footer}>Edit keybinds in <strong>Settings → Play Settings</strong> using the cog in the top right.</footer>
    </dialog>
  </>;
}
