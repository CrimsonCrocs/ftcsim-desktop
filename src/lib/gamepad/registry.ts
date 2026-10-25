import { DEFAULT_KEYBOARD_BINDINGS, type KeyboardBindings } from "../play-settings";
import {
  displayNameForGamepad,
  fingerprintGamepad,
  identifyGamepadProfile,
} from "./profiles";
import {
  gamepadControlProfileToDraft,
  validateGamepadMappingDraft,
} from "./calibration";
import type {
  FtcGamepadState,
  GamepadAssignment,
  GamepadAssignmentState,
  GamepadControlProfile,
  GamepadFrame,
  GamepadInputSnapshot,
  GamepadRegistry,
  GamepadRegistryEventKind,
  GamepadSlot,
  PhysicalGamepadDevice,
  RumbleResult,
  TouchGamepadInput,
} from "./types";

const PREFERENCES_KEY = "ftc-simulator:gamepad-preferences:v1";
const CUSTOM_MAPPINGS_KEY = "ftc-simulator:gamepad-mappings:v1";
const UNBOUND_HINT_COOLDOWN_MS = 5_000;
const AXIS_DEADZONE = 0.08;

type PreferredSlots = Record<GamepadSlot, string | null>;
type SlotIndexes = Record<GamepadSlot, number | null>;
type GamepadRegistryEventType = "gamepadconnected" | "gamepaddisconnected" | "keydown" | "keyup" | "blur";

interface GamepadRegistryEnvironment {
  getGamepads: () => readonly (Gamepad | null)[];
  addEventListener: (type: GamepadRegistryEventType, listener: EventListener) => void;
  removeEventListener: (type: GamepadRegistryEventType, listener: EventListener) => void;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  now: () => number;
}

type ExtendedGamepad = Gamepad & {
  vibrationActuator?: {
    playEffect(type: "dual-rumble", parameters: {
      duration: number;
      startDelay: number;
      strongMagnitude: number;
      weakMagnitude: number;
    }): Promise<string>;
  };
  hapticActuators?: readonly {
    pulse(value: number, duration: number): Promise<boolean>;
  }[];
};

function browserEnvironment(persistPreferences = true): GamepadRegistryEnvironment {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      getGamepads: () => [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      storage: null,
      now: () => Date.now(),
    };
  }
  return {
    getGamepads: () => {
      // Documentation iframes may omit the optional gamepad permission.
      // Keyboard/touch controls must still work in that frame.
      try { return navigator.getGamepads?.() ?? []; } catch { return []; }
    },
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
    storage: persistPreferences ? window.localStorage : null,
    now: () => performance.now(),
  };
}

function emptyGamepad(source: FtcGamepadState["source"] = "none"): FtcGamepadState {
  return {
    connected: source === "keyboard" || source === "touch",
    source,
    deviceId: source === "keyboard" ? "Keyboard" : null,
    timestamp: 0,
    left_stick_x: 0,
    left_stick_y: 0,
    right_stick_x: 0,
    right_stick_y: 0,
    left_trigger: 0,
    right_trigger: 0,
    a: false,
    b: false,
    x: false,
    y: false,
    cross: false,
    circle: false,
    square: false,
    triangle: false,
    dpad_up: false,
    dpad_down: false,
    dpad_left: false,
    dpad_right: false,
    left_bumper: false,
    right_bumper: false,
    left_stick_button: false,
    right_stick_button: false,
    start: false,
    options: false,
    back: false,
    share: false,
    guide: false,
    touchpad: false,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

function axis(gamepad: Gamepad, index: number): number {
  const value = gamepad.axes[index] ?? 0;
  return Math.abs(value) < AXIS_DEADZONE ? 0 : clamp(value, -1, 1);
}

function buttonValue(gamepad: Gamepad, index: number | undefined): number {
  if (index === undefined) return 0;
  return clamp(gamepad.buttons[index]?.value ?? 0, 0, 1);
}

function buttonPressed(gamepad: Gamepad, index: number | undefined): boolean {
  if (index === undefined) return false;
  const button = gamepad.buttons[index];
  return Boolean(button?.pressed || (button?.value ?? 0) > 0.5);
}

function mapPhysicalGamepad(
  gamepad: Gamepad,
  profile: GamepadControlProfile,
  consumeAssignmentChord: boolean,
): FtcGamepadState {
  const buttons = profile.buttons;
  const a = buttonPressed(gamepad, buttons.a);
  const b = buttonPressed(gamepad, buttons.b);
  const x = buttonPressed(gamepad, buttons.x);
  const y = buttonPressed(gamepad, buttons.y);
  const start = buttonPressed(gamepad, buttons.start);
  const back = buttonPressed(gamepad, buttons.back);
  const touchpad = buttonPressed(gamepad, buttons.touchpad);
  return {
    connected: gamepad.connected,
    source: "physical",
    deviceId: gamepad.id,
    timestamp: gamepad.timestamp,
    left_stick_x: axis(gamepad, profile.axes.left_stick_x),
    left_stick_y: axis(gamepad, profile.axes.left_stick_y),
    right_stick_x: axis(gamepad, profile.axes.right_stick_x),
    right_stick_y: axis(gamepad, profile.axes.right_stick_y),
    left_trigger: buttonValue(gamepad, buttons.left_trigger),
    right_trigger: buttonValue(gamepad, buttons.right_trigger),
    a: consumeAssignmentChord ? false : a,
    b: consumeAssignmentChord ? false : b,
    x,
    y,
    cross: consumeAssignmentChord ? false : a,
    circle: consumeAssignmentChord ? false : b,
    square: x,
    triangle: y,
    dpad_up: buttonPressed(gamepad, buttons.dpad_up),
    dpad_down: buttonPressed(gamepad, buttons.dpad_down),
    dpad_left: buttonPressed(gamepad, buttons.dpad_left),
    dpad_right: buttonPressed(gamepad, buttons.dpad_right),
    left_bumper: buttonPressed(gamepad, buttons.left_bumper),
    right_bumper: buttonPressed(gamepad, buttons.right_bumper),
    left_stick_button: buttonPressed(gamepad, buttons.left_stick_button),
    right_stick_button: buttonPressed(gamepad, buttons.right_stick_button),
    start: consumeAssignmentChord ? false : start,
    options: consumeAssignmentChord ? false : start,
    back,
    share: back,
    guide: buttonPressed(gamepad, buttons.guide),
    touchpad,
  };
}

function parsePreferredSlots(storage: GamepadRegistryEnvironment["storage"]): PreferredSlots {
  if (!storage) return { 1: null, 2: null };
  try {
    const parsed = JSON.parse(storage.getItem(PREFERENCES_KEY) ?? "null") as Partial<Record<"1" | "2", unknown>> | null;
    return {
      1: typeof parsed?.["1"] === "string" ? parsed["1"] : null,
      2: typeof parsed?.["2"] === "string" ? parsed["2"] : null,
    };
  } catch {
    try {
      storage.removeItem(PREFERENCES_KEY);
    } catch {
      // Storage can be denied wholesale in privacy modes.
    }
    return { 1: null, 2: null };
  }
}

function parseCustomMappings(storage: GamepadRegistryEnvironment["storage"]): Map<string, GamepadControlProfile> {
  if (!storage) return new Map();
  try {
    const parsed = JSON.parse(storage.getItem(CUSTOM_MAPPINGS_KEY) ?? "{}") as Record<string, GamepadControlProfile>;
    return new Map(Object.entries(parsed).filter(([, profile]) => profile?.id === "custom"));
  } catch {
    try {
      storage.removeItem(CUSTOM_MAPPINGS_KEY);
    } catch {
      // Storage can be denied wholesale in privacy modes.
    }
    return new Map();
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], .monaco-editor"));
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return Boolean(target.closest("button, input, select, textarea, a[href], [role='menuitem']"));
}

export class BrowserGamepadRegistry implements GamepadRegistry {
  private readonly environment: GamepadRegistryEnvironment;
  private readonly listeners = new Set<(state: GamepadAssignmentState) => void>();
  private readonly preferredSlots: PreferredSlots;
  private readonly customMappings: Map<string, GamepadControlProfile>;
  private readonly slotIndexes: SlotIndexes = { 1: null, 2: null };
  private readonly consumedChordIndexes = new Set<number>();
  private readonly pendingNeutralSlots = new Set<GamepadSlot>();
  private readonly hintedIndexes = new Map<number, number>();
  private readonly keyboardCodes = new Set<string>();
  private keyboardBindings: KeyboardBindings = { ...DEFAULT_KEYBOARD_BINDINGS };
  private touchInput: TouchGamepadInput = {};
  private devices = new Map<number, PhysicalGamepadDevice>();
  private currentState: GamepadAssignmentState;
  private sequence = 0;
  private eventId = 0;
  private configurationOpen = false;
  private unboundHint: GamepadAssignmentState["unboundHint"] = null;
  private lastEvent: GamepadAssignmentState["lastEvent"] = null;
  private listening = false;

  private readonly handleConnectionEvent = () => {
    this.synchronizeDevices(true);
  };

  private readonly handleKeyDown = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.code || keyboardEvent.repeat || isEditableTarget(event.target)) return;
    if (!Object.values(this.keyboardBindings).includes(keyboardEvent.code)) return;
    if ((keyboardEvent.code === "Space" || keyboardEvent.code.startsWith("Arrow")) && isInteractiveTarget(event.target)) return;
    this.keyboardCodes.add(keyboardEvent.code);
  };

  private readonly handleKeyUp = (event: Event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.code) this.keyboardCodes.delete(keyboardEvent.code);
  };

  private readonly handleWindowBlur = () => {
    this.keyboardCodes.clear();
    this.touchInput = {};
  };

  constructor(environment: GamepadRegistryEnvironment = browserEnvironment()) {
    this.environment = environment;
    this.preferredSlots = parsePreferredSlots(environment.storage);
    this.customMappings = parseCustomMappings(environment.storage);
    this.currentState = this.createState();
    this.start();
  }

  start(): void {
    if (this.listening) return;
    this.listening = true;
    this.environment.addEventListener("gamepadconnected", this.handleConnectionEvent);
    this.environment.addEventListener("gamepaddisconnected", this.handleConnectionEvent);
    this.environment.addEventListener("keydown", this.handleKeyDown);
    this.environment.addEventListener("keyup", this.handleKeyUp);
    this.environment.addEventListener("blur", this.handleWindowBlur);
    this.synchronizeDevices(false);
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    this.environment.removeEventListener("gamepadconnected", this.handleConnectionEvent);
    this.environment.removeEventListener("gamepaddisconnected", this.handleConnectionEvent);
    this.environment.removeEventListener("keydown", this.handleKeyDown);
    this.environment.removeEventListener("keyup", this.handleKeyUp);
    this.environment.removeEventListener("blur", this.handleWindowBlur);
    this.keyboardCodes.clear();
    this.touchInput = {};
  }

  snapshot(): GamepadAssignmentState {
    return this.currentState;
  }

  subscribe(listener: (state: GamepadAssignmentState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  assign(deviceIndex: number, slot: GamepadSlot): void {
    this.synchronizeDevices(false);
    const device = this.devices.get(deviceIndex);
    if (!device?.connected) return;
    if (device.mappingStatus === "needs-configuration") {
      this.emitEvent("mapping-required", `${device.displayName} needs a controller mapping before it can be assigned.`, undefined, deviceIndex);
      return;
    }

    const previousSlot = this.slotForDevice(deviceIndex);
    const displacedIndex = this.slotIndexes[slot];
    if (previousSlot && previousSlot !== slot) this.slotIndexes[previousSlot] = null;
    if (displacedIndex !== null && displacedIndex !== deviceIndex) {
      this.consumedChordIndexes.delete(displacedIndex);
    }
    this.slotIndexes[slot] = deviceIndex;
    this.preferredSlots[slot] = device.fingerprint.key;
    if (previousSlot && previousSlot !== slot) this.preferredSlots[previousSlot] = null;
    this.persistPreferences();
    this.emitEvent(
      displacedIndex !== null || (previousSlot !== null && previousSlot !== slot) ? "reassigned" : "assigned",
      `${device.displayName} assigned to gamepad${slot}.`,
      slot,
      deviceIndex,
    );
  }

  unassign(slot: GamepadSlot): void {
    const deviceIndex = this.slotIndexes[slot];
    if (deviceIndex === null && this.preferredSlots[slot] === null) return;
    const name = deviceIndex === null ? `gamepad${slot}` : this.devices.get(deviceIndex)?.displayName ?? `gamepad${slot}`;
    this.slotIndexes[slot] = null;
    if (deviceIndex !== null) this.pendingNeutralSlots.add(slot);
    this.preferredSlots[slot] = null;
    if (deviceIndex !== null) this.consumedChordIndexes.delete(deviceIndex);
    this.persistPreferences();
    this.emitEvent("unassigned", `${name} unbound from gamepad${slot}.`, slot, deviceIndex ?? undefined);
  }

  setConfigurationOpen(open: boolean): void {
    if (this.configurationOpen === open) return;
    this.configurationOpen = open;
    if (!open) this.unboundHint = null;
    this.publish();
  }

  getMapping(deviceIndex: number): GamepadControlProfile | null {
    const gamepad = this.environment.getGamepads()[deviceIndex];
    if (!gamepad?.connected) return null;
    const profile = this.profileFor(gamepad);
    if (!profile) return null;
    return {
      ...profile,
      axes: { ...profile.axes },
      buttons: { ...profile.buttons },
    };
  }

  readInput(deviceIndex: number): GamepadInputSnapshot | null {
    const gamepad = this.environment.getGamepads()[deviceIndex];
    if (!gamepad?.connected) return null;
    return {
      deviceIndex,
      connected: true,
      timestamp: gamepad.timestamp,
      axes: Object.freeze(gamepad.axes.map((value) => clamp(value, -1, 1))),
      buttons: Object.freeze(gamepad.buttons.map((button, index) => Object.freeze({
        index,
        pressed: button.pressed,
        touched: button.touched,
        value: clamp(button.value, 0, 1),
      }))),
    };
  }

  configureMapping(deviceIndex: number, profile: GamepadControlProfile): void {
    const gamepad = this.environment.getGamepads()[deviceIndex];
    if (!gamepad?.connected) return;
    this.assertValidCustomMapping(gamepad, profile);
    const fingerprint = fingerprintGamepad(gamepad);
    this.customMappings.set(fingerprint.key, { ...profile, id: "custom" });
    this.persistCustomMappings();
    this.synchronizeDevices(false);
    this.emitEvent("mapping-saved", `${displayNameForGamepad(gamepad, profile)} mapping saved.`, undefined, deviceIndex);
  }

  clearCustomMapping(deviceIndex: number): void {
    const gamepad = this.environment.getGamepads()[deviceIndex];
    if (!gamepad) return;
    this.customMappings.delete(fingerprintGamepad(gamepad).key);
    this.persistCustomMappings();
    const slot = this.slotForDevice(deviceIndex);
    if (slot !== null && !identifyGamepadProfile(gamepad)) {
      this.slotIndexes[slot] = null;
      this.pendingNeutralSlots.add(slot);
    }
    this.synchronizeDevices(false);
  }

  poll(): GamepadFrame {
    this.synchronizeDevices(false);
    const browserGamepads = this.environment.getGamepads();
    this.scanAssignments(browserGamepads);

    const neutralizeGamepad1 = this.pendingNeutralSlots.delete(1);
    const neutralizeGamepad2 = this.pendingNeutralSlots.delete(2);
    const gamepad1 = neutralizeGamepad1
      ? emptyGamepad()
      : this.frameForSlot(1, browserGamepads) ?? this.syntheticGamepad1Frame();
    const gamepad2 = neutralizeGamepad2
      ? emptyGamepad()
      : this.frameForSlot(2, browserGamepads) ?? emptyGamepad();
    const label = gamepad1.source === "physical"
      ? this.currentState.slots[1]?.device.displayName ?? gamepad1.deviceId ?? "Controller → gamepad1"
      : gamepad2.source === "physical"
        ? `${this.currentState.slots[2]?.device.displayName ?? gamepad2.deviceId} → gamepad2`
        : gamepad1.source === "touch"
          ? "Touch controls → gamepad1"
          : gamepad1.source === "keyboard"
            ? "Keyboard → gamepad1"
            : "No assigned input";

    return {
      sequence: ++this.sequence,
      capturedAt: this.environment.now(),
      gamepad1,
      gamepad2,
      inputSourceLabel: label,
    };
  }

  refresh(): void {
    this.synchronizeDevices(false);
    this.scanAssignments(this.environment.getGamepads());
  }

  setKeyboardInput(code: string, pressed: boolean): void {
    if (!code || !Object.values(this.keyboardBindings).includes(code)) return;
    if (pressed) this.keyboardCodes.add(code);
    else this.keyboardCodes.delete(code);
  }

  setKeyboardBindings(bindings: KeyboardBindings): void {
    this.keyboardBindings = { ...bindings };
    this.keyboardCodes.clear();
  }

  resetKeyboardInput(): void {
    this.keyboardCodes.clear();
  }

  setTouchInput(input: TouchGamepadInput): void {
    this.touchInput = { ...input };
  }

  resetTouchInput(): void {
    this.touchInput = {};
  }

  private scanAssignments(browserGamepads: readonly (Gamepad | null)[]): void {

    for (const gamepad of browserGamepads) {
      if (!gamepad?.connected) continue;
      const profile = this.profileFor(gamepad);
      if (!profile) {
        if (this.hasMeaningfulInput(gamepad)) this.maybeShowUnboundHint(gamepad.index, true);
        continue;
      }
      const start = buttonPressed(gamepad, profile.buttons.start);
      const a = buttonPressed(gamepad, profile.buttons.a);
      const b = buttonPressed(gamepad, profile.buttons.b);
      const chordSlot: GamepadSlot | null = start && a ? 1 : start && b ? 2 : null;
      if (chordSlot !== null) {
        if (!this.consumedChordIndexes.has(gamepad.index)) this.assign(gamepad.index, chordSlot);
        this.consumedChordIndexes.add(gamepad.index);
      } else if (this.consumedChordIndexes.has(gamepad.index) && !start && !a && !b) {
        this.consumedChordIndexes.delete(gamepad.index);
      }

      if (this.slotForDevice(gamepad.index) === null && this.hasMeaningfulInput(gamepad)) {
        this.maybeShowUnboundHint(gamepad.index, false);
      }
    }
  }

  async rumble(
    slot: GamepadSlot,
    durationMs: number,
    strongMagnitude = 1,
    weakMagnitude = 1,
  ): Promise<RumbleResult> {
    this.synchronizeDevices(false);
    const index = this.slotIndexes[slot];
    const gamepad = index === null ? null : this.environment.getGamepads()[index] as ExtendedGamepad | null;
    if (!gamepad?.connected) {
      return { status: "unavailable", message: `gamepad${slot} is not connected.` };
    }
    const duration = clamp(durationMs, 0, 5_000);
    try {
      if (gamepad.vibrationActuator?.playEffect) {
        await gamepad.vibrationActuator.playEffect("dual-rumble", {
          duration,
          startDelay: 0,
          strongMagnitude: clamp(strongMagnitude, 0, 1),
          weakMagnitude: clamp(weakMagnitude, 0, 1),
        });
        return { status: "played", message: `Rumble sent to gamepad${slot}.` };
      }
      const actuator = gamepad.hapticActuators?.[0];
      if (actuator) {
        await actuator.pulse(Math.max(clamp(strongMagnitude, 0, 1), clamp(weakMagnitude, 0, 1)), duration);
        return { status: "played", message: `Rumble sent to gamepad${slot}.` };
      }
    } catch {
      return { status: "failed", message: `gamepad${slot} rejected the rumble request.` };
    }
    return { status: "unavailable", message: `${gamepad.id} does not expose browser haptics.` };
  }

  close(): void {
    this.stop();
    this.listeners.clear();
  }

  private createState(): GamepadAssignmentState {
    const slots = { 1: this.assignmentForSlot(1), 2: this.assignmentForSlot(2) } as const;
    return Object.freeze({
      devices: Object.freeze([...this.devices.values()].sort((a, b) => a.index - b.index)),
      slots: Object.freeze(slots),
      preferredSlots: Object.freeze({ ...this.preferredSlots }),
      keyboardEnabledForSlot1: slots[1] === null,
      configurationOpen: this.configurationOpen,
      detectionMessage: this.configurationOpen && this.devices.size === 0
        ? "Press a controller button to detect it."
        : null,
      unboundHint: this.unboundHint,
      lastEvent: this.lastEvent,
    });
  }

  private publish(): void {
    this.currentState = this.createState();
    for (const listener of this.listeners) listener(this.currentState);
  }

  private emitEvent(kind: GamepadRegistryEventKind, message: string, slot?: GamepadSlot, deviceIndex?: number): void {
    this.lastEvent = { id: ++this.eventId, kind, message, slot, deviceIndex };
    this.publish();
  }

  private synchronizeDevices(announceConnections: boolean): void {
    const previous = this.devices;
    const next = new Map<number, PhysicalGamepadDevice>();
    for (const gamepad of this.environment.getGamepads()) {
      if (!gamepad?.connected) continue;
      const profile = this.profileFor(gamepad);
      const extended = gamepad as ExtendedGamepad;
      next.set(gamepad.index, {
        index: gamepad.index,
        id: gamepad.id,
        displayName: displayNameForGamepad(gamepad, profile),
        connected: true,
        mapping: gamepad.mapping,
        fingerprint: fingerprintGamepad(gamepad),
        profileId: profile?.id ?? "unsupported",
        mappingStatus: profile ? "ready" : "needs-configuration",
        capabilities: {
          rumble: Boolean(extended.vibrationActuator || extended.hapticActuators?.length),
          led: false,
        },
      });
    }

    let disconnected: { slot: GamepadSlot; device: PhysicalGamepadDevice } | null = null;
    for (const slot of [1, 2] as const) {
      const index = this.slotIndexes[slot];
      if (index !== null && !next.has(index)) {
        const device = previous.get(index);
        this.slotIndexes[slot] = null;
        this.pendingNeutralSlots.add(slot);
        this.consumedChordIndexes.delete(index);
        if (device) disconnected = { slot, device };
      }
    }

    this.devices = next;
    const restoredSlots = this.restoreUnambiguousPreferences();

    if (disconnected) {
      this.emitEvent(
        "disconnected",
        `${disconnected.device.displayName} disconnected from gamepad${disconnected.slot}. Motor input was neutralized.`,
        disconnected.slot,
        disconnected.device.index,
      );
      return;
    }

    if (announceConnections && restoredSlots.length === 1) {
      const slot = restoredSlots[0];
      const restored = this.assignmentForSlot(slot);
      if (restored) {
        this.emitEvent(
          "restored",
          `${restored.device.displayName} reconnected as gamepad${slot}.`,
          slot,
          restored.deviceIndex,
        );
        return;
      }
    }

    if (announceConnections) {
      const connected = [...next.values()].find((device) => !previous.has(device.index));
      if (connected) {
        this.emitEvent("connected", `${connected.displayName} connected.`, undefined, connected.index);
        return;
      }
    }
    if (!this.sameDeviceSet(previous, next) || restoredSlots.length > 0) this.publish();
  }

  private restoreUnambiguousPreferences(): GamepadSlot[] {
    const restored: GamepadSlot[] = [];
    const preferredFingerprints = new Set(
      ([1, 2] as const)
        .map((slot) => this.preferredSlots[slot])
        .filter((value): value is string => value !== null),
    );

    for (const fingerprint of preferredFingerprints) {
      const preferredSlots = ([1, 2] as const).filter((slot) => this.preferredSlots[slot] === fingerprint);
      const missingSlots = preferredSlots.filter((slot) => this.slotIndexes[slot] === null);
      const assignedMatchingDevices = preferredSlots.filter((slot) => {
        const index = this.slotIndexes[slot];
        return index !== null && this.devices.get(index)?.fingerprint.key === fingerprint;
      });
      const candidates = [...this.devices.values()].filter((device) => (
        device.fingerprint.key === fingerprint
        && device.mappingStatus === "ready"
        && this.slotForDevice(device.index) === null
      ));

      // Browser fingerprints contain no serial number. If multiple remembered slots share one
      // fingerprint, a lone returning device is ambiguous unless another identical device is
      // still assigned and anchors the remaining slot.
      const hasIdentityAnchor = preferredSlots.length === 1 || assignedMatchingDevices.length > 0;
      if (hasIdentityAnchor && missingSlots.length === 1 && candidates.length === 1) {
        const slot = missingSlots[0];
        this.slotIndexes[slot] = candidates[0].index;
        restored.push(slot);
      }
    }
    return restored;
  }

  private sameDeviceSet(
    previous: ReadonlyMap<number, PhysicalGamepadDevice>,
    next: ReadonlyMap<number, PhysicalGamepadDevice>,
  ): boolean {
    if (previous.size !== next.size) return false;
    for (const [index, device] of previous) {
      const candidate = next.get(index);
      if (!candidate
          || candidate.fingerprint.key !== device.fingerprint.key
          || candidate.profileId !== device.profileId
          || candidate.mappingStatus !== device.mappingStatus
          || candidate.capabilities.rumble !== device.capabilities.rumble) return false;
    }
    return true;
  }

  private assignmentForSlot(slot: GamepadSlot): GamepadAssignment | null {
    const index = this.slotIndexes[slot];
    if (index === null) return null;
    const device = this.devices.get(index);
    if (!device) return null;
    return { slot, deviceIndex: index, fingerprintKey: device.fingerprint.key, device };
  }

  private slotForDevice(deviceIndex: number): GamepadSlot | null {
    if (this.slotIndexes[1] === deviceIndex) return 1;
    if (this.slotIndexes[2] === deviceIndex) return 2;
    return null;
  }

  private frameForSlot(slot: GamepadSlot, gamepads: readonly (Gamepad | null)[]): FtcGamepadState | null {
    const index = this.slotIndexes[slot];
    if (index === null) return null;
    const gamepad = gamepads[index];
    if (!gamepad?.connected) return null;
    const profile = this.profileFor(gamepad);
    if (!profile) return null;
    return mapPhysicalGamepad(gamepad, profile, this.consumedChordIndexes.has(index));
  }

  private keyboardFrame(): FtcGamepadState {
    const frame = emptyGamepad("keyboard");
    frame.timestamp = this.environment.now();
    frame.left_stick_y = (this.keyboardCodes.has(this.keyboardBindings.backward) ? 1 : 0) - (this.keyboardCodes.has(this.keyboardBindings.forward) ? 1 : 0);
    frame.left_stick_x = (this.keyboardCodes.has(this.keyboardBindings.right) ? 1 : 0) - (this.keyboardCodes.has(this.keyboardBindings.left) ? 1 : 0);
    frame.right_stick_x = (this.keyboardCodes.has(this.keyboardBindings.turnRight) ? 1 : 0) - (this.keyboardCodes.has(this.keyboardBindings.turnLeft) ? 1 : 0);
    frame.dpad_up = this.keyboardCodes.has(this.keyboardBindings.dpadUp);
    frame.dpad_down = this.keyboardCodes.has(this.keyboardBindings.dpadDown);
    frame.dpad_left = this.keyboardCodes.has(this.keyboardBindings.dpadLeft);
    frame.dpad_right = this.keyboardCodes.has(this.keyboardBindings.dpadRight);
    frame.a = this.keyboardCodes.has(this.keyboardBindings.a);
    frame.cross = frame.a;
    frame.b = this.keyboardCodes.has(this.keyboardBindings.b); frame.circle = frame.b;
    frame.x = this.keyboardCodes.has(this.keyboardBindings.x); frame.square = frame.x;
    frame.y = this.keyboardCodes.has(this.keyboardBindings.y); frame.triangle = frame.y;
    frame.left_trigger = this.keyboardCodes.has(this.keyboardBindings.leftTrigger) ? 1 : 0;
    frame.right_trigger = this.keyboardCodes.has(this.keyboardBindings.rightTrigger) ? 1 : 0;
    frame.left_bumper = this.keyboardCodes.has(this.keyboardBindings.leftBumper);
    frame.right_bumper = this.keyboardCodes.has(this.keyboardBindings.rightBumper);
    return frame;
  }

  private syntheticGamepad1Frame(): FtcGamepadState {
    const keyboard = this.keyboardFrame();
    const touch = this.touchInput;
    const hasTouchInput = Object.values(touch).some((value) => typeof value === "boolean" ? value : value !== 0);
    if (!hasTouchInput) return keyboard;

    const frame = { ...keyboard, source: "touch" as const, deviceId: "Touch controls" };
    for (const field of ["left_stick_x", "left_stick_y", "right_stick_x", "right_stick_y"] as const) {
      frame[field] = clamp(frame[field] + (touch[field] ?? 0), -1, 1);
    }
    for (const field of ["left_trigger", "right_trigger"] as const) {
      frame[field] = Math.max(frame[field], clamp(touch[field] ?? 0, 0, 1));
    }
    for (const field of [
      "a", "b", "x", "y", "dpad_up", "dpad_down", "dpad_left", "dpad_right",
      "left_bumper", "right_bumper",
    ] as const) {
      frame[field] = frame[field] || touch[field] === true;
    }
    frame.cross = frame.a;
    frame.circle = frame.b;
    frame.square = frame.x;
    frame.triangle = frame.y;
    return frame;
  }

  private hasMeaningfulInput(gamepad: Gamepad): boolean {
    return gamepad.axes.some((value) => Math.abs(value) > 0.25)
      || gamepad.buttons.some((button) => button.pressed || button.value > 0.5);
  }

  private maybeShowUnboundHint(deviceIndex: number, mappingRequired: boolean): void {
    const now = this.environment.now();
    const previous = this.hintedIndexes.get(deviceIndex) ?? -Infinity;
    if (now - previous < UNBOUND_HINT_COOLDOWN_MS) return;
    this.hintedIndexes.set(deviceIndex, now);
    this.unboundHint = {
      deviceIndex,
      shownAt: now,
      message: mappingRequired
        ? "Controller detected, but its layout is unknown. Configure its mapping in Settings before assigning it."
        : "Controller not assigned. Press Start + A for gamepad1 or Start + B for gamepad2.",
    };
    if (mappingRequired) {
      const device = this.devices.get(deviceIndex);
      this.emitEvent(
        "mapping-required",
        `${device?.displayName ?? "Controller"} needs a controller mapping before it can be assigned.`,
        undefined,
        deviceIndex,
      );
    } else {
      this.publish();
    }
  }

  private persistPreferences(): void {
    try {
      this.environment.storage?.setItem(PREFERENCES_KEY, JSON.stringify(this.preferredSlots));
    } catch {
      // Assignment remains active for this tab when storage is unavailable.
    }
  }

  private profileFor(gamepad: Gamepad): GamepadControlProfile | null {
    return this.customMappings.get(fingerprintGamepad(gamepad).key) ?? identifyGamepadProfile(gamepad);
  }

  private assertValidCustomMapping(gamepad: Gamepad, profile: GamepadControlProfile): void {
    const validation = validateGamepadMappingDraft(
      gamepadControlProfileToDraft(profile),
      gamepad.axes.length,
      gamepad.buttons.length,
    );
    if (!validation.profile) throw new RangeError(validation.summary ?? "The controller mapping is invalid.");
  }

  private persistCustomMappings(): void {
    try {
      this.environment.storage?.setItem(CUSTOM_MAPPINGS_KEY, JSON.stringify(Object.fromEntries(this.customMappings)));
    } catch {
      // The live mapping remains usable for this tab when storage is unavailable.
    }
  }
}

export function createGamepadRegistry(options: { persistPreferences?: boolean } = {}): BrowserGamepadRegistry {
  return new BrowserGamepadRegistry(browserEnvironment(options.persistPreferences));
}

export const GAMEPAD_PREFERENCES_STORAGE_KEY = PREFERENCES_KEY;
export const GAMEPAD_MAPPINGS_STORAGE_KEY = CUSTOM_MAPPINGS_KEY;
export const createGamepadRegistryForTesting = (environment: GamepadRegistryEnvironment) =>
  new BrowserGamepadRegistry(environment);
