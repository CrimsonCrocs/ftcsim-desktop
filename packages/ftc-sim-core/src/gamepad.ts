const analogFields = [
  "left_stick_x",
  "left_stick_y",
  "right_stick_x",
  "right_stick_y",
] as const;
const triggerFields = ["left_trigger", "right_trigger"] as const;
const buttonFields = [
  "a",
  "b",
  "x",
  "y",
  "dpad_up",
  "dpad_down",
  "dpad_left",
  "dpad_right",
  "left_bumper",
  "right_bumper",
  "left_stick_button",
  "right_stick_button",
  "start",
  "back",
  "guide",
] as const;

type AnalogField = (typeof analogFields)[number];
type TriggerField = (typeof triggerFields)[number];
export type GamepadButton = (typeof buttonFields)[number];

export type GamepadState = Partial<
  Record<AnalogField | TriggerField, number> & Record<GamepadButton, boolean>
>;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Gamepad analog values must be finite");
  return Math.min(max, Math.max(min, value));
}

/** FTC-style public gamepad fields plus sticky, consumable button-edge helpers. */
export class Gamepad {
  left_stick_x = 0;
  left_stick_y = 0;
  right_stick_x = 0;
  right_stick_y = 0;
  left_trigger = 0;
  right_trigger = 0;
  a = false;
  b = false;
  x = false;
  y = false;
  dpad_up = false;
  dpad_down = false;
  dpad_left = false;
  dpad_right = false;
  left_bumper = false;
  right_bumper = false;
  left_stick_button = false;
  right_stick_button = false;
  start = false;
  back = false;
  guide = false;

  private readonly pressedEdges = new Set<GamepadButton>();
  private readonly releasedEdges = new Set<GamepadButton>();

  setState(state: GamepadState): void {
    for (const field of analogFields) {
      const value = state[field];
      if (value !== undefined) this[field] = clamp(value, -1, 1);
    }
    for (const field of triggerFields) {
      const value = state[field];
      if (value !== undefined) this[field] = clamp(value, 0, 1);
    }
    for (const field of buttonFields) {
      const next = state[field];
      if (next === undefined || next === this[field]) continue;
      this[field] = next;
      (next ? this.pressedEdges : this.releasedEdges).add(field);
    }
  }

  copyFrom(other: Gamepad): void {
    const state: GamepadState = {};
    for (const field of analogFields) state[field] = other[field];
    for (const field of triggerFields) state[field] = other[field];
    for (const field of buttonFields) state[field] = other[field];
    this.setState(state);
  }

  reset(): void {
    const state: GamepadState = {};
    for (const field of analogFields) state[field] = 0;
    for (const field of triggerFields) state[field] = 0;
    for (const field of buttonFields) state[field] = false;
    this.setState(state);
    this.resetEdgeDetection();
  }

  resetEdgeDetection(): void {
    this.pressedEdges.clear();
    this.releasedEdges.clear();
  }

  atRest(): boolean {
    return analogFields.every((field) => this[field] === 0) && triggerFields.every((field) => this[field] === 0);
  }

  wasPressed(button: GamepadButton): boolean {
    return this.pressedEdges.delete(button);
  }

  wasReleased(button: GamepadButton): boolean {
    return this.releasedEdges.delete(button);
  }

  aWasPressed(): boolean {
    return this.wasPressed("a");
  }

  aWasReleased(): boolean {
    return this.wasReleased("a");
  }

  bWasPressed(): boolean {
    return this.wasPressed("b");
  }

  bWasReleased(): boolean {
    return this.wasReleased("b");
  }

  xWasPressed(): boolean {
    return this.wasPressed("x");
  }

  xWasReleased(): boolean {
    return this.wasReleased("x");
  }

  yWasPressed(): boolean {
    return this.wasPressed("y");
  }

  yWasReleased(): boolean {
    return this.wasReleased("y");
  }
}
