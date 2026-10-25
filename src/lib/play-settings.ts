export const KEYBOARD_CONTROLS = [
  { id: "forward", label: "Forward", gamepad: "Left stick ↑", key: "KeyW" },
  { id: "backward", label: "Backward", gamepad: "Left stick ↓", key: "KeyS" },
  { id: "left", label: "Strafe left", gamepad: "Left stick ←", key: "KeyA" },
  { id: "right", label: "Strafe right", gamepad: "Left stick →", key: "KeyD" },
  { id: "turnLeft", label: "Turn left", gamepad: "Right stick ←", key: "KeyQ" },
  { id: "turnRight", label: "Turn right", gamepad: "Right stick →", key: "KeyE" },
  { id: "dpadUp", label: "D-pad up", gamepad: "↑", key: "ArrowUp" },
  { id: "dpadDown", label: "D-pad down", gamepad: "↓", key: "ArrowDown" },
  { id: "dpadLeft", label: "D-pad left", gamepad: "←", key: "ArrowLeft" },
  { id: "dpadRight", label: "D-pad right", gamepad: "→", key: "ArrowRight" },
  { id: "a", label: "A / Cross", gamepad: "A", key: "Space" },
  { id: "b", label: "B / Circle", gamepad: "B", key: "KeyB" },
  { id: "x", label: "X / Square", gamepad: "X", key: "KeyX" },
  { id: "y", label: "Y / Triangle", gamepad: "Y", key: "KeyY" },
  { id: "leftTrigger", label: "Left trigger", gamepad: "LT", key: "KeyF" },
  { id: "rightTrigger", label: "Right trigger", gamepad: "RT", key: "KeyR" },
  { id: "leftBumper", label: "Left bumper", gamepad: "LB", key: "KeyZ" },
  { id: "rightBumper", label: "Right bumper", gamepad: "RB", key: "KeyC" },
] as const;

export type KeyboardControl = typeof KEYBOARD_CONTROLS[number]["id"];
export type KeyboardBindings = Record<KeyboardControl, string>;
export interface PlaySettings { keyboard: KeyboardBindings }
export const DEFAULT_KEYBOARD_BINDINGS = Object.fromEntries(KEYBOARD_CONTROLS.map(({ id, key }) => [id, key])) as KeyboardBindings;

export function isBindableKey(code: string): boolean {
  return /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Shift(Left|Right)|Bracket(Left|Right)|Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal|Backquote|Numpad[0-9])$/.test(code);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readPlaySettings(manifest: Record<string, unknown>): PlaySettings {
  const saved = record(record(manifest.playSettings).keyboard);
  const keyboard = { ...DEFAULT_KEYBOARD_BINDINGS };
  const used = new Set<string>();
  for (const { id } of KEYBOARD_CONTROLS) {
    const value = saved[id];
    if (typeof value === "string" && (value === "" || isBindableKey(value))) keyboard[id] = value;
    if (used.has(keyboard[id])) keyboard[id] = "";
    if (keyboard[id]) used.add(keyboard[id]);
  }
  return { keyboard };
}

export function writePlaySettings(manifest: Record<string, unknown>, settings: PlaySettings): Record<string, unknown> {
  return { ...manifest, playSettings: { ...record(manifest.playSettings), keyboard: { ...settings.keyboard } } };
}

export function assignKeyboardBinding(bindings: KeyboardBindings, control: KeyboardControl, code: string): KeyboardBindings {
  if (code !== "" && !isBindableKey(code)) return bindings;
  const next = { ...bindings, [control]: code };
  for (const { id } of KEYBOARD_CONTROLS) {
    if (id !== control && code && bindings[id] === code) next[id] = bindings[control];
  }
  return next;
}

export function keyboardKeyLabel(code: string): string {
  return code.replace(/^Key|^Digit/, "").replace(/^Arrow/, "").replace(/(Left|Right)$/, " $1") || "Unbound";
}
