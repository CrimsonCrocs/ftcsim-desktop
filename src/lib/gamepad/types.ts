import type { KeyboardBindings } from "../play-settings";
export type GamepadSlot = 1 | 2;

export type GamepadProfileId =
  | "standard"
  | "xbox"
  | "logitech-f310"
  | "dualshock-4"
  | "dualsense"
  | "custom"
  | "unsupported";

export type GamepadMappingStatus = "ready" | "needs-configuration";

export interface GamepadFingerprint {
  /** Browser-safe identity only. The Gamepad API does not expose serial numbers. */
  key: string;
  id: string;
  mapping: string;
  axes: number;
  buttons: number;
}

export interface PhysicalGamepadDevice {
  index: number;
  id: string;
  displayName: string;
  connected: boolean;
  mapping: string;
  fingerprint: GamepadFingerprint;
  profileId: GamepadProfileId;
  mappingStatus: GamepadMappingStatus;
  capabilities: {
    rumble: boolean;
    led: false;
  };
}

export interface GamepadAssignment {
  slot: GamepadSlot;
  deviceIndex: number;
  fingerprintKey: string;
  device: PhysicalGamepadDevice;
}

export type GamepadRegistryEventKind =
  | "connected"
  | "disconnected"
  | "assigned"
  | "reassigned"
  | "unassigned"
  | "restored"
  | "mapping-saved"
  | "mapping-required";

export interface GamepadRegistryEvent {
  id: number;
  kind: GamepadRegistryEventKind;
  message: string;
  slot?: GamepadSlot;
  deviceIndex?: number;
}

export interface UnboundGamepadHint {
  deviceIndex: number;
  message: string;
  shownAt: number;
}

export interface GamepadAssignmentState {
  devices: readonly PhysicalGamepadDevice[];
  slots: Readonly<Record<GamepadSlot, GamepadAssignment | null>>;
  preferredSlots: Readonly<Record<GamepadSlot, string | null>>;
  keyboardEnabledForSlot1: boolean;
  configurationOpen: boolean;
  detectionMessage: string | null;
  unboundHint: UnboundGamepadHint | null;
  lastEvent: GamepadRegistryEvent | null;
}

export interface FtcGamepadState {
  connected: boolean;
  source: "none" | "keyboard" | "touch" | "physical";
  deviceId: string | null;
  timestamp: number;
  left_stick_x: number;
  left_stick_y: number;
  right_stick_x: number;
  right_stick_y: number;
  left_trigger: number;
  right_trigger: number;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  cross: boolean;
  circle: boolean;
  square: boolean;
  triangle: boolean;
  dpad_up: boolean;
  dpad_down: boolean;
  dpad_left: boolean;
  dpad_right: boolean;
  left_bumper: boolean;
  right_bumper: boolean;
  left_stick_button: boolean;
  right_stick_button: boolean;
  start: boolean;
  options: boolean;
  back: boolean;
  share: boolean;
  guide: boolean;
  touchpad: boolean;
}

/** Independent synthetic gamepad1 controls supplied by the touch surface. */
export type TouchGamepadInput = Partial<Pick<FtcGamepadState,
  | "left_stick_x" | "left_stick_y" | "right_stick_x" | "right_stick_y"
  | "left_trigger" | "right_trigger"
  | "a" | "b" | "x" | "y"
  | "dpad_up" | "dpad_down" | "dpad_left" | "dpad_right"
  | "left_bumper" | "right_bumper"
>>;

export interface GamepadFrame {
  sequence: number;
  capturedAt: number;
  gamepad1: FtcGamepadState;
  gamepad2: FtcGamepadState;
  inputSourceLabel: string;
}

export interface GamepadButtonMapping {
  a: number;
  b: number;
  x: number;
  y: number;
  left_bumper: number;
  right_bumper: number;
  left_trigger: number;
  right_trigger: number;
  back: number;
  start: number;
  left_stick_button: number;
  right_stick_button: number;
  dpad_up: number;
  dpad_down: number;
  dpad_left: number;
  dpad_right: number;
  guide?: number;
  touchpad?: number;
}

export interface GamepadAxisMapping {
  left_stick_x: number;
  left_stick_y: number;
  right_stick_x: number;
  right_stick_y: number;
}

export interface GamepadControlProfile {
  id: Exclude<GamepadProfileId, "unsupported">;
  label: string;
  axes: GamepadAxisMapping;
  buttons: GamepadButtonMapping;
}

export interface GamepadInputButtonSnapshot {
  index: number;
  pressed: boolean;
  touched: boolean;
  value: number;
}

/** A read-only browser frame used by the controller mapping surface. */
export interface GamepadInputSnapshot {
  deviceIndex: number;
  connected: boolean;
  timestamp: number;
  axes: readonly number[];
  buttons: readonly GamepadInputButtonSnapshot[];
}

export interface RumbleResult {
  status: "played" | "unavailable" | "failed";
  message: string;
}

export interface GamepadRegistry {
  /** Starts browser event capture. Safe to call more than once. */
  start(): void;
  /** Pauses browser event capture without discarding assignments or subscribers. */
  stop(): void;
  snapshot(): GamepadAssignmentState;
  assign(deviceIndex: number, slot: GamepadSlot): void;
  unassign(slot: GamepadSlot): void;
  /** Detects binding gestures without producing a runtime frame. */
  refresh(): void;
  /** Updates keyboard gamepad1 when input originates in an embedded editor. */
  setKeyboardInput(code: string, pressed: boolean): void;
  /** Releases every held keyboard gamepad1 control. */
  resetKeyboardInput(): void;
  setKeyboardBindings(bindings: KeyboardBindings): void;
  /** Replaces only touch-originated controls; keyboard input remains independent. */
  setTouchInput(input: TouchGamepadInput): void;
  /** Releases every held touch gamepad1 control. */
  resetTouchInput(): void;
  poll(): GamepadFrame;
  subscribe(listener: (state: GamepadAssignmentState) => void): () => void;
  setConfigurationOpen(open: boolean): void;
  getMapping(deviceIndex: number): GamepadControlProfile | null;
  readInput(deviceIndex: number): GamepadInputSnapshot | null;
  configureMapping(deviceIndex: number, profile: GamepadControlProfile): void;
  clearCustomMapping(deviceIndex: number): void;
  rumble(slot: GamepadSlot, durationMs: number, strongMagnitude?: number, weakMagnitude?: number): Promise<RumbleResult>;
  /** Permanently releases browser listeners and subscriptions. */
  close(): void;
}
