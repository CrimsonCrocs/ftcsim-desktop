import type {
  GamepadAxisMapping,
  GamepadButtonMapping,
  GamepadControlProfile,
} from "./types";

export type GamepadAxisControl = keyof GamepadAxisMapping;
export type GamepadButtonControl = keyof GamepadButtonMapping;

export interface GamepadMappingField<TControl extends string> {
  control: TControl;
  label: string;
  optional?: boolean;
}

export const GAMEPAD_AXIS_FIELDS: readonly GamepadMappingField<GamepadAxisControl>[] = [
  { control: "left_stick_x", label: "Left stick X" },
  { control: "left_stick_y", label: "Left stick Y" },
  { control: "right_stick_x", label: "Right stick X" },
  { control: "right_stick_y", label: "Right stick Y" },
];

export const GAMEPAD_BUTTON_FIELDS: readonly GamepadMappingField<GamepadButtonControl>[] = [
  { control: "a", label: "A / Cross" },
  { control: "b", label: "B / Circle" },
  { control: "x", label: "X / Square" },
  { control: "y", label: "Y / Triangle" },
  { control: "left_bumper", label: "Left bumper" },
  { control: "right_bumper", label: "Right bumper" },
  { control: "left_trigger", label: "Left trigger" },
  { control: "right_trigger", label: "Right trigger" },
  { control: "back", label: "Back / Share" },
  { control: "start", label: "Start / Options" },
  { control: "left_stick_button", label: "Left stick button" },
  { control: "right_stick_button", label: "Right stick button" },
  { control: "dpad_up", label: "D-pad up" },
  { control: "dpad_down", label: "D-pad down" },
  { control: "dpad_left", label: "D-pad left" },
  { control: "dpad_right", label: "D-pad right" },
  { control: "guide", label: "Guide / PS", optional: true },
  { control: "touchpad", label: "Touchpad", optional: true },
];

export interface GamepadMappingDraft {
  label: string;
  axes: Record<GamepadAxisControl, number | null>;
  buttons: Record<GamepadButtonControl, number | null>;
}

export interface GamepadMappingValidation {
  profile: GamepadControlProfile | null;
  errors: Readonly<Record<string, string>>;
  summary: string | null;
}

function validSeedIndex(index: number | undefined, count: number): number | null {
  return index !== undefined && Number.isInteger(index) && index >= 0 && index < count ? index : null;
}

export function createGamepadMappingDraft(
  profile: GamepadControlProfile,
  axisCount: number,
  buttonCount: number,
): GamepadMappingDraft {
  const axes = Object.fromEntries(GAMEPAD_AXIS_FIELDS.map(({ control }) => [
    control,
    validSeedIndex(profile.axes[control], axisCount),
  ])) as unknown as Record<GamepadAxisControl, number | null>;
  const buttons = Object.fromEntries(GAMEPAD_BUTTON_FIELDS.map(({ control }) => [
    control,
    validSeedIndex(profile.buttons[control], buttonCount),
  ])) as unknown as Record<GamepadButtonControl, number | null>;
  return { label: profile.label, axes, buttons };
}

export function gamepadControlProfileToDraft(profile: GamepadControlProfile): GamepadMappingDraft {
  return {
    label: profile.label,
    axes: { ...profile.axes },
    buttons: Object.fromEntries(GAMEPAD_BUTTON_FIELDS.map(({ control }) => [
      control,
      profile.buttons[control] ?? null,
    ])) as unknown as Record<GamepadButtonControl, number | null>,
  };
}

function fieldKey(kind: "axis" | "button", control: string): string {
  return `${kind}:${control}`;
}

function validateCollection<TControl extends string>(
  kind: "axis" | "button",
  fields: readonly GamepadMappingField<TControl>[],
  values: Record<TControl, number | null>,
  count: number,
  errors: Record<string, string>,
): void {
  const controlsByIndex = new Map<number, TControl>();
  for (const field of fields) {
    const index = values[field.control];
    const key = fieldKey(kind, field.control);
    if (index === null) {
      if (!field.optional) errors[key] = `Choose ${field.label.toLocaleLowerCase()}.`;
      continue;
    }
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      errors[key] = `${field.label} must use an exposed ${kind} index.`;
      continue;
    }
    const existing = controlsByIndex.get(index);
    if (existing) {
      errors[key] = `${kind === "axis" ? "Axis" : "Button"} ${index} is already mapped.`;
      errors[fieldKey(kind, existing)] = `${kind === "axis" ? "Axis" : "Button"} ${index} is mapped more than once.`;
      continue;
    }
    controlsByIndex.set(index, field.control);
  }
}

export function validateGamepadMappingDraft(
  draft: GamepadMappingDraft,
  axisCount: number,
  buttonCount: number,
): GamepadMappingValidation {
  const errors: Record<string, string> = {};
  validateCollection("axis", GAMEPAD_AXIS_FIELDS, draft.axes, axisCount, errors);
  validateCollection("button", GAMEPAD_BUTTON_FIELDS, draft.buttons, buttonCount, errors);
  const errorCount = Object.keys(errors).length;
  if (errorCount > 0) {
    return {
      profile: null,
      errors,
      summary: `Fix ${errorCount} controller mapping ${errorCount === 1 ? "field" : "fields"} before saving.`,
    };
  }

  const buttons = Object.fromEntries(GAMEPAD_BUTTON_FIELDS
    .filter(({ control }) => draft.buttons[control] !== null)
    .map(({ control }) => [control, draft.buttons[control]])) as unknown as GamepadButtonMapping;
  return {
    profile: {
      id: "custom",
      label: draft.label.trim() || "Custom controller",
      axes: { ...draft.axes } as GamepadAxisMapping,
      buttons,
    },
    errors,
    summary: null,
  };
}

export function gamepadMappingFieldKey(kind: "axis" | "button", control: string): string {
  return fieldKey(kind, control);
}
