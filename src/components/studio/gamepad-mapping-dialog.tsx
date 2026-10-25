"use client";

import { Gamepad2, Radio, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  CONFIGURABLE_GAMEPAD_PROFILE_IDS,
  createGamepadMappingDraft,
  GAMEPAD_AXIS_FIELDS,
  GAMEPAD_BUTTON_FIELDS,
  gamepadMappingFieldKey,
  getGamepadControlProfile,
  validateGamepadMappingDraft,
  type GamepadAxisControl,
  type GamepadButtonControl,
  type GamepadControlProfile,
  type GamepadInputSnapshot,
  type GamepadMappingDraft,
  type GamepadProfileId,
  type GamepadRegistry,
  type PhysicalGamepadDevice,
} from "@/lib/gamepad";
import styles from "./gamepad-toolbar-group.module.css";

type ConfigurableProfileId = typeof CONFIGURABLE_GAMEPAD_PROFILE_IDS[number];
type CaptureTarget =
  | { kind: "axis"; control: GamepadAxisControl; label: string }
  | { kind: "button"; control: GamepadButtonControl; label: string };

interface GamepadMappingDialogProps {
  device: PhysicalGamepadDevice;
  registry: GamepadRegistry;
  onClose: () => void;
}

interface MappingFieldProps<TControl extends string> {
  kind: "axis" | "button";
  control: TControl;
  label: string;
  optional?: boolean;
  value: number | null;
  count: number;
  error?: string;
  captureActive: boolean;
  onChange: (value: number | null) => void;
  onCapture: () => void;
}

function isConfigurableProfile(profileId: GamepadProfileId): profileId is ConfigurableProfileId {
  return CONFIGURABLE_GAMEPAD_PROFILE_IDS.includes(profileId as ConfigurableProfileId);
}

function snapshotSignature(snapshot: GamepadInputSnapshot | null): string {
  if (!snapshot) return "disconnected";
  return [
    snapshot.timestamp,
    ...snapshot.axes.map((value) => value.toFixed(3)),
    ...snapshot.buttons.map((button) => `${button.pressed ? 1 : 0}:${button.value.toFixed(3)}`),
  ].join("|");
}

function MappingField<TControl extends string>({
  kind,
  control,
  label,
  optional,
  value,
  count,
  error,
  captureActive,
  onChange,
  onCapture,
}: MappingFieldProps<TControl>) {
  const inputId = `gamepad-map-${kind}-${control}`;
  const errorId = `${inputId}-error`;
  const noun = kind === "axis" ? "axis" : "button";
  return (
    <div className={styles.mappingField}>
      <label htmlFor={inputId}>{label}{optional ? <span>Optional</span> : null}</label>
      <div className={styles.mappingControl}>
        <select
          id={inputId}
          value={value ?? ""}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        >
          <option value="">{optional ? "Not mapped" : `Choose ${noun}`}</option>
          {Array.from({ length: count }, (_, index) => (
            <option key={index} value={index}>{kind === "axis" ? "Axis" : "Button"} {index}</option>
          ))}
        </select>
        <button
          type="button"
          className={styles.detectButton}
          aria-pressed={captureActive}
          onClick={onCapture}
        >
          <Radio aria-hidden="true" />
          {captureActive ? "Listening…" : "Detect"}
        </button>
      </div>
      {error ? <span id={errorId} className={styles.fieldError}>{error}</span> : null}
    </div>
  );
}

export function GamepadMappingDialog({ device, registry, onClose }: GamepadMappingDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFocusRef = useRef<HTMLSelectElement | null>(null);
  const captureTargetRef = useRef<CaptureTarget | null>(null);
  const captureBaselineRef = useRef<Set<number>>(new Set());
  const initialProfile = useMemo<GamepadControlProfile>(() => (
    registry.getMapping(device.index)
    ?? getGamepadControlProfile(isConfigurableProfile(device.profileId) ? device.profileId : "standard")
  ), [device.index, device.profileId, registry]);
  const [selectedPreset, setSelectedPreset] = useState<ConfigurableProfileId | "custom">(
    initialProfile.id === "custom" ? "custom" : isConfigurableProfile(initialProfile.id) ? initialProfile.id : "standard",
  );
  const [draft, setDraft] = useState<GamepadMappingDraft>(() => createGamepadMappingDraft(
    initialProfile,
    device.fingerprint.axes,
    device.fingerprint.buttons,
  ));
  const [snapshot, setSnapshot] = useState<GamepadInputSnapshot | null>(() => registry.readInput(device.index));
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState("Use Detect, then move or press a control.");
  const validation = useMemo(
    () => validateGamepadMappingDraft(draft, device.fingerprint.axes, device.fingerprint.buttons),
    [device.fingerprint.axes, device.fingerprint.buttons, draft],
  );

  const updateAxis = useCallback((control: GamepadAxisControl, value: number | null) => {
    setDraft((current) => ({ ...current, axes: { ...current.axes, [control]: value } }));
    setSelectedPreset("custom");
    setSubmitted(false);
  }, []);

  const updateButton = useCallback((control: GamepadButtonControl, value: number | null) => {
    setDraft((current) => ({ ...current, buttons: { ...current.buttons, [control]: value } }));
    setSelectedPreset("custom");
    setSubmitted(false);
  }, []);

  const stopCapture = useCallback(() => {
    captureTargetRef.current = null;
    captureBaselineRef.current.clear();
    setCaptureTarget(null);
  }, []);

  const beginCapture = useCallback((target: CaptureTarget) => {
    const current = registry.readInput(device.index);
    const active = target.kind === "axis"
      ? current?.axes.flatMap((value, index) => Math.abs(value) >= 0.65 ? [index] : []) ?? []
      : current?.buttons.flatMap((button) => button.pressed || button.value >= 0.55 ? [button.index] : []) ?? [];
    captureBaselineRef.current = new Set(active);
    captureTargetRef.current = target;
    setCaptureTarget(target);
    setStatus(target.kind === "axis" ? `Move ${target.label.toLocaleLowerCase()} fully.` : `Press ${target.label.toLocaleLowerCase()}.`);
  }, [device.index, registry]);

  useEffect(() => {
    let animationFrame = 0;
    let lastSample = 0;
    let lastSignature = "";
    const sample = (now: number) => {
      if (now - lastSample >= 32) {
        lastSample = now;
        const next = registry.readInput(device.index);
        const signature = snapshotSignature(next);
        if (signature !== lastSignature) {
          lastSignature = signature;
          setSnapshot(next);
        }

        const target = captureTargetRef.current;
        if (target && next) {
          const active = target.kind === "axis"
            ? next.axes.flatMap((value, index) => Math.abs(value) >= 0.65 ? [index] : [])
            : next.buttons.flatMap((button) => button.pressed || button.value >= 0.55 ? [button.index] : []);
          const activeSet = new Set(active);
          for (const baselineIndex of captureBaselineRef.current) {
            if (!activeSet.has(baselineIndex)) captureBaselineRef.current.delete(baselineIndex);
          }
          const detected = active.find((index) => !captureBaselineRef.current.has(index));
          if (detected !== undefined) {
            if (target.kind === "axis") updateAxis(target.control, detected);
            else updateButton(target.control, detected);
            setStatus(`${target.label} mapped to ${target.kind} ${detected}.`);
            stopCapture();
          }
        }
      }
      animationFrame = window.requestAnimationFrame(sample);
    };
    animationFrame = window.requestAnimationFrame(sample);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [device.index, registry, stopCapture, updateAxis, updateButton]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFocusRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ) ?? [])].filter((element) => !element.hasAttribute("hidden"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1) ?? first;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const applyPreset = (profileId: ConfigurableProfileId) => {
    const profile = getGamepadControlProfile(profileId);
    setSelectedPreset(profileId);
    setDraft(createGamepadMappingDraft(profile, device.fingerprint.axes, device.fingerprint.buttons));
    setSubmitted(false);
    stopCapture();
    setStatus(`${profile.label} indexes loaded. Review the live controls, then save.`);
  };

  const handleSave = () => {
    setSubmitted(true);
    stopCapture();
    if (!snapshot) {
      setStatus("The controller disconnected. Reconnect it before saving this mapping.");
      return;
    }
    if (!validation.profile) {
      setStatus(validation.summary ?? "The controller mapping is incomplete.");
      const invalid = dialogRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
      invalid?.focus();
      return;
    }
    try {
      registry.configureMapping(device.index, {
        ...validation.profile,
        label: `${device.displayName} custom mapping`,
      });
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The controller mapping could not be saved.");
    }
  };

  const visibleErrors = submitted ? validation.errors : {};
  const axisCount = snapshot?.axes.length ?? device.fingerprint.axes;
  const buttonCount = snapshot?.buttons.length ?? device.fingerprint.buttons;

  return (
    <div
      className={styles.mappingBackdrop}
      onPointerDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.mappingDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gamepad-mapping-title"
        aria-describedby="gamepad-mapping-description"
        onKeyDown={handleDialogKeyDown}
      >
        <header className={styles.mappingHeader}>
          <div className={styles.mappingTitle}>
            <Gamepad2 aria-hidden="true" />
            <div>
              <h2 id="gamepad-mapping-title">Controller mapping</h2>
              <p id="gamepad-mapping-description">{device.displayName} · {axisCount} axes · {buttonCount} buttons</p>
            </div>
          </div>
          <button type="button" className={styles.close} aria-label="Close controller mapping" title="Close controller mapping" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.mappingBody}>
          <section className={styles.liveControls} aria-labelledby="live-controller-inputs-title">
            <div className={styles.sectionHeading}>
              <h3 id="live-controller-inputs-title">Live controller inputs</h3>
              <span className={snapshot ? styles.connected : styles.disconnected}>{snapshot ? "Connected" : "Disconnected"}</span>
            </div>
            {snapshot ? (
              <div className={styles.liveGrid}>
                <div className={styles.axisPreview} aria-label="Live axis values">
                  {snapshot.axes.map((value, index) => (
                    <div className={styles.axisValue} key={index}>
                      <span>Axis {index}</span>
                      <div className={styles.axisTrack} aria-hidden="true">
                        <i className={value < 0 ? styles.axisNegative : styles.axisPositive} style={{ width: `${Math.abs(value) * 50}%` }} />
                      </div>
                      <output>{value.toFixed(2)}</output>
                    </div>
                  ))}
                </div>
                <div className={styles.buttonPreview} aria-label="Live button values">
                  {snapshot.buttons.map((button) => (
                    <div className={button.pressed || button.value > 0.05 ? styles.buttonActive : undefined} key={button.index}>
                      <span>B{button.index}</span>
                      <output>{button.value.toFixed(2)}</output>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className={styles.disconnectedMessage}>Reconnect this controller to inspect its inputs or save a mapping.</p>
            )}
          </section>

          <section className={styles.mappingForm} aria-labelledby="mapping-fields-title">
            <div className={styles.sectionHeading}>
              <h3 id="mapping-fields-title">FTC controls</h3>
              <label className={styles.presetLabel}>
                Starting layout
                <select
                  ref={firstFocusRef}
                  value={selectedPreset}
                  onChange={(event) => applyPreset(event.target.value as ConfigurableProfileId)}
                >
                  {selectedPreset === "custom" ? <option value="custom">Custom mapping</option> : null}
                  {CONFIGURABLE_GAMEPAD_PROFILE_IDS.map((profileId) => (
                    <option key={profileId} value={profileId}>{getGamepadControlProfile(profileId).label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.mappingColumns}>
              <fieldset className={`${styles.mappingGroup} ${styles.axisMappingGroup}`}>
                <legend>Stick axes</legend>
                {GAMEPAD_AXIS_FIELDS.map((field) => (
                  <MappingField
                    key={field.control}
                    kind="axis"
                    control={field.control}
                    label={field.label}
                    value={draft.axes[field.control]}
                    count={axisCount}
                    error={visibleErrors[gamepadMappingFieldKey("axis", field.control)]}
                    captureActive={captureTarget?.kind === "axis" && captureTarget.control === field.control}
                    onChange={(value) => updateAxis(field.control, value)}
                    onCapture={() => beginCapture({ kind: "axis", control: field.control, label: field.label })}
                  />
                ))}
              </fieldset>

              <fieldset className={styles.mappingGroup}>
                <legend>Buttons, triggers, and D-pad</legend>
                <div className={styles.buttonMappingGrid}>
                  {GAMEPAD_BUTTON_FIELDS.map((field) => (
                    <MappingField
                      key={field.control}
                      kind="button"
                      control={field.control}
                      label={field.label}
                      optional={field.optional}
                      value={draft.buttons[field.control]}
                      count={buttonCount}
                      error={visibleErrors[gamepadMappingFieldKey("button", field.control)]}
                      captureActive={captureTarget?.kind === "button" && captureTarget.control === field.control}
                      onChange={(value) => updateButton(field.control, value)}
                      onCapture={() => beginCapture({ kind: "button", control: field.control, label: field.label })}
                    />
                  ))}
                </div>
              </fieldset>
            </div>
          </section>
        </div>

        <footer className={styles.mappingFooter}>
          <p role="status" aria-live="polite" aria-atomic="true">{status}</p>
          <div>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancel</button>
            <button type="button" className={styles.primaryButton} disabled={!snapshot} onClick={handleSave}>Save mapping</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
