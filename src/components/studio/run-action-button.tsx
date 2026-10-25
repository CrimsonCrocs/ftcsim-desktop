import { ChevronDown, Gamepad2, LoaderCircle, Play, Square } from "lucide-react";
import type { Ref } from "react";
import type { LaunchMode } from "@/lib/projects/types";
import { BuildActionIcon } from "./build-action-icon";

export function RunActionButton({
  kind, mode, onModeChange, onRun, disabled, optionsDisabled, running = false,
  targetLabel, buttonRef, busyLabel,
}: {
  kind: "play" | "game";
  mode: LaunchMode;
  onModeChange: (mode: LaunchMode) => void;
  onRun: () => void;
  disabled: boolean;
  optionsDisabled: boolean;
  running?: boolean;
  targetLabel?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  busyLabel?: string;
}) {
  const plainLabel = kind === "play" ? "Play last build" : "Simulate last build";
  const buildLabel = kind === "play" ? "Build and Play" : "Build and Simulate Game";
  const actionLabel = mode === "build" ? buildLabel : plainLabel;
  const label = running ? "Stop running OpMode" : busyLabel ?? `${actionLabel}${targetLabel ? ` — ${targetLabel}` : ""}`;
  const optionsLabel = kind === "play" ? "Play options" : "Game Simulation options";
  const Icon = kind === "play" ? Play : Gamepad2;

  return <div className="run-action">
    <button
      // A stopped/disconnected session must not turn a held Stop gesture into
      // a fresh launch. Distinct elements keep the browser's click target safe.
      key={running ? "stop" : "launch"}
      ref={buttonRef}
      type="button"
      className={`header-action header-action--${kind === "play" ? "run" : "game"}${running ? " is-running" : ""}`}
      onClick={onRun}
      disabled={disabled}
      aria-label={label}
      aria-busy={Boolean(busyLabel) && !running || undefined}
      title={label}
    >
      {running ? <Square aria-hidden="true" /> : busyLabel ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : mode === "build" ? <BuildActionIcon kind={kind} /> : <Icon aria-hidden="true" />}
    </button>
    <label className="run-action__options" title={`${optionsLabel}: ${actionLabel}`}>
      <select
        aria-label={optionsLabel}
        value={mode}
        onChange={(event) => onModeChange(event.target.value as LaunchMode)}
        disabled={optionsDisabled}
      >
        <option value="build">{buildLabel}</option>
        <option value="reuse">{plainLabel}</option>
      </select>
      <ChevronDown aria-hidden="true" />
    </label>
  </div>;
}
