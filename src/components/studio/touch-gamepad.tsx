"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import type { GamepadRegistry } from "@/lib/gamepad";
import { TouchInputTracker, type TouchControl, type TouchStick } from "@/lib/gamepad/touch-input";
import styles from "./touch-gamepad.module.css";

const BUTTONS: ReadonlyArray<{ label: string; control: TouchControl; className?: string }> = [
  { label: "Y", control: "y", className: "top" },
  { label: "X", control: "x", className: "left" },
  { label: "B", control: "b", className: "right" },
  { label: "A", control: "a", className: "bottom" },
];

export function TouchGamepad({ registry, active }: { registry: GamepadRegistry; active: boolean }) {
  const [tracker] = useState(() => new TouchInputTracker());
  const input = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, tracker.getSnapshot);
  const [stickTravel, setStickTravel] = useState<Record<TouchStick, number>>({ left: 24, right: 24 });
  const rootRef = useRef<HTMLElement>(null);
  const buttonsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  const publish = useCallback(() => {
    tracker.commit();
    const next = tracker.getSnapshot();
    registry.setTouchInput(next);
  }, [registry, tracker]);

  const releaseAll = useCallback(() => {
    tracker.reset();
    tracker.commit();
    registry.resetTouchInput();
  }, [registry, tracker]);

  useLayoutEffect(() => {
    if (!active) releaseAll();
  }, [active, releaseAll]);

  useEffect(() => {
    const handleBlur = () => releaseAll();
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") releaseAll();
    };
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
      releaseAll();
    };
  }, [releaseAll]);

  useEffect(() => {
    if (!active || !rootRef.current) return;
    const root = rootRef.current;
    const field = root.closest(".simulator__canvas");
    if (!field) return;
    const measure = () => root.style.setProperty("--touch-field-height", field.getBoundingClientRect().height + "px");
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(field);
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const close = (restoreFocus: boolean) => {
      if (!buttonsRef.current?.open) return;
      buttonsRef.current.open = false;
      tracker.closeButtons();
      publish();
      if (restoreFocus) summaryRef.current?.focus();
    };
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) close(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !buttonsRef.current?.open) return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [active, publish, tracker]);

  const updateStick = useCallback((pointerId: number, stick: TouchStick, element: HTMLDivElement, clientX: number, clientY: number) => {
    const bounds = element.getBoundingClientRect();
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2 - 18);
    setStickTravel((current) => current[stick] === radius ? current : { ...current, [stick]: radius });
    const dx = clientX - (bounds.left + bounds.width / 2);
    const dy = clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius ? radius / distance : 1;
    tracker.moveStick(pointerId, stick, (dx * scale) / radius, (dy * scale) / radius);
    publish();
  }, [publish, tracker]);

  const beginStick = (stick: TouchStick, event: PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateStick(event.pointerId, stick, event.currentTarget, event.clientX, event.clientY);
  };

  const moveStick = (stick: TouchStick, event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateStick(event.pointerId, stick, event.currentTarget, event.clientX, event.clientY);
  };

  const endPointer = (event: PointerEvent<HTMLElement>) => {
    tracker.releasePointer(event.pointerId);
    publish();
  };

  const beginButton = (control: TouchControl, event: PointerEvent<HTMLButtonElement>) => {
    if (!active) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    tracker.pressButton(event.pointerId, control);
    publish();
  };

  const keyDown = (control: TouchControl, event: KeyboardEvent<HTMLButtonElement>) => {
    if (!active || (event.key !== " " && event.key !== "Enter")) return;
    event.preventDefault();
    if (event.repeat) return;
    tracker.pressKey(event.code, control);
    publish();
  };

  const keyUp = (control: TouchControl, event: KeyboardEvent<HTMLButtonElement>) => {
    tracker.releaseKey(event.code, control);
    publish();
  };

  const axisSlider = (axis: "left_stick_x" | "left_stick_y" | "right_stick_x" | "right_stick_y", label: string) => (
    <label className={styles.axisSlider} key={axis}>
      <span>{label}</span>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={input[axis] ?? 0}
        aria-label={label}
        aria-valuetext={`${(input[axis] ?? 0).toFixed(2)} on a scale from -1 to 1`}
        onChange={(event) => {
          tracker.setSlider(axis, Number(event.currentTarget.value));
          publish();
        }}
      />
      <output>{(input[axis] ?? 0).toFixed(2)}</output>
    </label>
  );

  if (!active) return null;

  const stick = (name: TouchStick, title: string, label: string) => {
    const xControl = name === "left" ? "left_stick_x" : "right_stick_x";
    const yControl = name === "left" ? "left_stick_y" : "right_stick_y";
    const x = input[xControl] ?? 0;
    const y = input[yControl] ?? 0;
    return (
      <div className={styles.stickGroup}>
        <div
          className={styles.stick}
          role="group"
          aria-label={`${title} stick, touch and drag to move`}
          onPointerDown={(event) => beginStick(name, event)}
          onPointerMove={(event) => moveStick(name, event)}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onLostPointerCapture={endPointer}
        >
          <span className={styles.stickCrosshair} aria-hidden="true" />
          <span className={styles.stickKnob} style={{ transform: `translate(calc(-50% + ${x * stickTravel[name]}px), calc(-50% + ${y * stickTravel[name]}px))` }} aria-hidden="true" />
        </div>
        <span className={styles.stickLabel}>{label}</span>
      </div>
    );
  };

  const holdButton = (label: string, control: TouchControl, className?: string, visibleLabel = label) => {
    const pressed = typeof input[control] === "boolean" ? input[control] : (input[control] ?? 0) > 0;
    return (
      <button
        key={control}
        type="button"
        className={`${styles.holdButton} ${className ? styles[className] : ""}`}
        aria-label={label}
        aria-pressed={Boolean(pressed)}
        onPointerDown={(event) => beginButton(control, event)}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
        onKeyDown={(event) => keyDown(control, event)}
        onKeyUp={(event) => keyUp(control, event)}
        onBlur={() => {
          tracker.releaseControlKeys(control);
          publish();
        }}
      >
        {visibleLabel}
      </button>
    );
  };

  return (
    <section ref={rootRef} className={styles.root} aria-label="Touch gamepad for gamepad1">
      <div className={styles.stickStrip}>
        {stick("left", "Left", "L stick")}
        <details
          ref={buttonsRef}
          className={styles.more}
          onToggle={(event) => {
            if (event.currentTarget.open) return;
            tracker.closeButtons();
            publish();
          }}
        >
          <summary ref={summaryRef}>Buttons</summary>
          <div className={styles.popover} role="group" aria-label="Gamepad buttons">
            <div className={styles.panelHeader}><span>Gamepad 1</span><button type="button" aria-label="Close gamepad buttons" onClick={() => {
              if (buttonsRef.current) buttonsRef.current.open = false;
              tracker.closeButtons();
              publish();
              summaryRef.current?.focus();
            }}>×</button></div>
            <div className={styles.buttonDeck}>
              <svg className={styles.controllerShape} viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true"><path d="M74 22C43 22 29 37 21 65L5 155C0 181 17 199 37 187L83 150H237L283 187C303 199 320 181 315 155L299 65C291 37 277 22 246 22Z" /></svg>
              <div className={styles.shoulders}>
                {holdButton("L1 left bumper", "left_bumper", undefined, "L1")}
                {holdButton("L2 left trigger", "left_trigger", undefined, "L2")}
                {holdButton("R2 right trigger", "right_trigger", undefined, "R2")}
                {holdButton("R1 right bumper", "right_bumper", undefined, "R1")}
              </div>
              <div className={styles.dpad} role="group" aria-label="Directional pad">
                {holdButton("D-pad up", "dpad_up", "up", "↑")}
                {holdButton("D-pad left", "dpad_left", "left", "←")}
                <span className={styles.dpadCenter} aria-hidden="true">+</span>
                {holdButton("D-pad right", "dpad_right", "right", "→")}
                {holdButton("D-pad down", "dpad_down", "down", "↓")}
              </div>
              <div className={styles.faceButtons} role="group" aria-label="ABXY buttons">
                {BUTTONS.map(({ label, control, className }) => holdButton(label, control, className))}
              </div>
            </div>
            <details className={styles.axisControls}>
              <summary>Stick axes</summary>
              <div className={styles.axisHeading}>
                <span>Stick axes</span>
                <button
                  type="button"
                  className={styles.resetSticks}
                  onClick={() => {
                    tracker.resetSticks();
                    publish();
                  }}
                >
                  Center sticks
                </button>
              </div>
              <div className={styles.axisSliders} role="group" aria-label="Keyboard and single-pointer stick controls">
                {axisSlider("left_stick_x", "Left X")}
                {axisSlider("left_stick_y", "Left Y")}
                {axisSlider("right_stick_x", "Right X")}
                {axisSlider("right_stick_y", "Right Y")}
              </div>
            </details>
          </div>
        </details>
        {stick("right", "Right", "R stick")}
      </div>
    </section>
  );
}
