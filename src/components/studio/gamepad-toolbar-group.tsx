"use client";

import { Gamepad2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  GamepadAssignment,
  GamepadAssignmentState,
  GamepadRegistry,
  GamepadSlot,
  PhysicalGamepadDevice,
} from "@/lib/gamepad";
import { GamepadMappingDialog } from "./gamepad-mapping-dialog";
import styles from "./gamepad-toolbar-group.module.css";

const SERVER_SNAPSHOT: GamepadAssignmentState = {
  devices: [],
  slots: { 1: null, 2: null },
  preferredSlots: { 1: null, 2: null },
  keyboardEnabledForSlot1: true,
  configurationOpen: false,
  detectionMessage: null,
  unboundHint: null,
  lastEvent: null,
};

interface GamepadToolbarGroupProps {
  registry: GamepadRegistry;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  returnFocus?: HTMLElement | null;
}

function AssignmentRow({
  slot,
  assignment,
  onUnassign,
  onConfigure,
}: {
  slot: GamepadSlot;
  assignment: GamepadAssignment | null;
  onUnassign: (slot: GamepadSlot) => void;
  onConfigure: (device: PhysicalGamepadDevice, opener: HTMLButtonElement) => void;
}) {
  const device = assignment?.device;
  return (
    <div className={styles.slot}>
      <div className={styles.slotIcon} aria-hidden="true">
        <Gamepad2 />
        <span>{slot}</span>
      </div>
      <div className={styles.slotCopy}>
        <strong>gamepad{slot}</strong>
        {device ? (
          <span className={device.mappingStatus === "needs-configuration" ? styles.unsupported : undefined}>
            {device.displayName}{device.mappingStatus === "needs-configuration" ? " · Mapping required" : " · Connected"}
          </span>
        ) : (
          <span>{slot === 1 ? "Start + A to assign" : "Start + B to assign"}</span>
        )}
      </div>
      {device && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            onClick={(event) => onConfigure(device, event.currentTarget)}
          >
            Configure Mapping
          </button>
          <button type="button" className={styles.action} onClick={() => onUnassign(slot)}>
            Unbind
          </button>
        </div>
      )}
    </div>
  );
}

export function GamepadToolbarGroup({
  registry,
  open: controlledOpen,
  onOpenChange,
  returnFocus,
}: GamepadToolbarGroupProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [mappingDevice, setMappingDevice] = useState<PhysicalGamepadDevice | null>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback((value: boolean | ((current: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(open) : value;
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }, [controlledOpen, onOpenChange, open]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const mappingOpenerRef = useRef<HTMLButtonElement | null>(null);
  const configurationOpenerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const state = useSyncExternalStore(
    useCallback((notify) => registry.subscribe(() => notify()), [registry]),
    registry.snapshot.bind(registry),
    () => SERVER_SNAPSHOT,
  );

  const connectedAssignments = ([1, 2] as const)
    .map((slot) => state.slots[slot])
    .filter((assignment): assignment is GamepadAssignment => assignment !== null && assignment.device.connected);
  const assignedIndexes = new Set(connectedAssignments.map((assignment) => assignment.deviceIndex));
  const unassignedDevices = state.devices.filter((device) => !assignedIndexes.has(device.index));

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    if (open && !wasOpen) {
      const activeElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      configurationOpenerRef.current = returnFocus?.isConnected ? returnFocus : activeElement;
    } else if (!open && wasOpen) {
      const opener = configurationOpenerRef.current;
      configurationOpenerRef.current = null;
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus();
      });
    }
    wasOpenRef.current = open;
  }, [open, returnFocus]);

  useEffect(() => {
    registry.setConfigurationOpen(open || mappingDevice !== null);
    return () => registry.setConfigurationOpen(false);
  }, [mappingDevice, open, registry]);

  useEffect(() => {
    if (!open && mappingDevice === null) return;
    registry.refresh();
    const monitor = window.setInterval(() => registry.refresh(), 50);
    return () => window.clearInterval(monitor);
  }, [mappingDevice, open, registry]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, setOpen]);

  const beginMapping = useCallback((device: PhysicalGamepadDevice, opener: HTMLButtonElement) => {
    mappingOpenerRef.current = opener;
    setMappingDevice(device);
  }, []);

  const closeMapping = useCallback(() => {
    setMappingDevice(null);
    window.requestAnimationFrame(() => {
      if (mappingOpenerRef.current?.isConnected) mappingOpenerRef.current.focus();
      else closeButtonRef.current?.focus();
    });
  }, []);

  if (connectedAssignments.length === 0 && !open) {
    return (
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {state.lastEvent?.message ?? ""}
      </span>
    );
  }

  return (
    <div className={styles.root} ref={rootRef}>
      {connectedAssignments.map((assignment) => (
        <button
          key={assignment.slot}
          type="button"
          className={styles.trigger}
          aria-label={`Gamepad ${assignment.slot}: ${assignment.device.displayName}. Open gamepad assignments.`}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={`${assignment.device.displayName} · gamepad${assignment.slot}`}
          onClick={() => setOpen((value) => !value)}
        >
          <Gamepad2 aria-hidden="true" />
          <span className={styles.slotNumber} aria-hidden="true">{assignment.slot}</span>
        </button>
      ))}

      {open && (
        <section
          className={styles.popover}
          role="dialog"
          aria-modal="false"
          aria-label="Gamepad assignments"
          aria-hidden={mappingDevice ? true : undefined}
          inert={Boolean(mappingDevice)}
        >
          <header className={styles.heading}>
            <span>Gamepad assignments</span>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.close}
              aria-label="Close gamepad assignments"
              title="Close gamepad assignments"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <div className={styles.slots}>
            <AssignmentRow slot={1} assignment={state.slots[1]} onUnassign={(slot) => registry.unassign(slot)} onConfigure={beginMapping} />
            <AssignmentRow slot={2} assignment={state.slots[2]} onUnassign={(slot) => registry.unassign(slot)} onConfigure={beginMapping} />
          </div>
          {unassignedDevices.length > 0 && (
            <section className={styles.detected} aria-label="Detected unassigned controllers">
              <h3>Detected controllers</h3>
              {unassignedDevices.map((device) => (
                <div className={styles.detectedRow} key={device.index}>
                  <Gamepad2 aria-hidden="true" />
                  <div>
                    <strong>{device.displayName}</strong>
                    <span>
                      {device.mappingStatus === "needs-configuration"
                        ? "Mapping required before assignment"
                        : "Press Start + A or Start + B to assign"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={(event) => beginMapping(device, event.currentTarget)}
                  >
                    Configure Mapping
                  </button>
                </div>
              ))}
            </section>
          )}
          {(state.detectionMessage || state.unboundHint) && (
            <p className={styles.notice}>{state.unboundHint?.message ?? state.detectionMessage}</p>
          )}
        </section>
      )}

      {mappingDevice && (
        <GamepadMappingDialog
          key={`${mappingDevice.fingerprint.key}:${mappingDevice.index}`}
          device={mappingDevice}
          registry={registry}
          onClose={closeMapping}
        />
      )}

      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {state.lastEvent?.message ?? ""}
      </span>
    </div>
  );
}
