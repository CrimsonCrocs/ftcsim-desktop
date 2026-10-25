import type {
  GamepadControlProfile,
  GamepadFingerprint,
  GamepadProfileId,
} from "./types";

const STANDARD_PROFILE: GamepadControlProfile = {
  id: "standard",
  label: "Standard gamepad",
  axes: {
    left_stick_x: 0,
    left_stick_y: 1,
    right_stick_x: 2,
    right_stick_y: 3,
  },
  buttons: {
    a: 0,
    b: 1,
    x: 2,
    y: 3,
    left_bumper: 4,
    right_bumper: 5,
    left_trigger: 6,
    right_trigger: 7,
    back: 8,
    start: 9,
    left_stick_button: 10,
    right_stick_button: 11,
    dpad_up: 12,
    dpad_down: 13,
    dpad_left: 14,
    dpad_right: 15,
    guide: 16,
    touchpad: 17,
  },
};

const PROFILES: Record<Exclude<GamepadProfileId, "custom" | "unsupported">, GamepadControlProfile> = {
  standard: STANDARD_PROFILE,
  xbox: { ...STANDARD_PROFILE, id: "xbox", label: "Xbox controller" },
  "logitech-f310": { ...STANDARD_PROFILE, id: "logitech-f310", label: "Logitech F310" },
  "dualshock-4": { ...STANDARD_PROFILE, id: "dualshock-4", label: "DualShock 4" },
  dualsense: { ...STANDARD_PROFILE, id: "dualsense", label: "DualSense" },
};

export const CONFIGURABLE_GAMEPAD_PROFILE_IDS = [
  "standard",
  "xbox",
  "logitech-f310",
  "dualshock-4",
  "dualsense",
] as const;

export function getGamepadControlProfile(
  id: typeof CONFIGURABLE_GAMEPAD_PROFILE_IDS[number],
): GamepadControlProfile {
  const profile = PROFILES[id];
  return {
    ...profile,
    axes: { ...profile.axes },
    buttons: { ...profile.buttons },
  };
}

function normalizedId(id: string): string {
  return id.trim().replace(/\s+/g, " ").toLowerCase();
}

export function fingerprintGamepad(gamepad: Pick<Gamepad, "id" | "mapping" | "axes" | "buttons">): GamepadFingerprint {
  const id = gamepad.id.trim().replace(/\s+/g, " ") || "Unknown controller";
  const mapping = gamepad.mapping || "none";
  const axes = gamepad.axes.length;
  const buttons = gamepad.buttons.length;
  return {
    key: `${normalizedId(id)}|${mapping}|a${axes}|b${buttons}`,
    id,
    mapping,
    axes,
    buttons,
  };
}

export function identifyGamepadProfile(gamepad: Pick<Gamepad, "id" | "mapping" | "axes" | "buttons">): GamepadControlProfile | null {
  const id = normalizedId(gamepad.id);
  const hasStandardShape = gamepad.axes.length >= 4 && gamepad.buttons.length >= 16;

  if (/dualsense|054c[-:]0(?:ce6|df2)|sony interactive entertainment wireless controller/.test(id)) {
    return hasStandardShape ? PROFILES.dualsense : null;
  }
  if (/dualshock|054c[-:]0(?:5c4|9cc)|wireless controller \(standard gamepad vendor/.test(id)) {
    return hasStandardShape ? PROFILES["dualshock-4"] : null;
  }
  if (/logitech.*(?:f310|gamepad f310)|046d[-:]c21d/.test(id)) {
    return hasStandardShape ? PROFILES["logitech-f310"] : null;
  }
  if (/xbox|xinput|045e[-:]/.test(id)) {
    return hasStandardShape ? PROFILES.xbox : null;
  }
  if (gamepad.mapping === "standard" && hasStandardShape) return PROFILES.standard;
  return null;
}

export function displayNameForGamepad(gamepad: Pick<Gamepad, "id">, profile: GamepadControlProfile | null): string {
  if (profile && profile.id !== "standard") return profile.label;
  const name = gamepad.id.trim().replace(/\s+/g, " ");
  return name || profile?.label || "Unknown controller";
}
