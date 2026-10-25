"use client";

import type { ReactNode } from "react";
import type { ResolvedRobotConfiguration } from "@/lib/robot-configuration";
import type { FieldPresetId, FieldParameters } from "@/lib/field-configuration";
import type { KeyboardBindings } from "@/lib/play-settings";
import type { SimulatorActuatorStore } from "@/lib/simulator-actuator-store";
import type { SimulatorTickBudget } from "@/lib/simulator-tick-budget";
import type { SimulatorHardwareFrame } from "@/lib/runtime-types";
import type { OpModeState, RobotVariant, TelemetrySnapshot } from "@/lib/studio-types";
import { WorldSimulator } from "./world-simulator";
import type { SceneAssetRegistration } from "@/lib/analysis/scene-assets";

export interface RobotSimulatorProps {
  variant: RobotVariant;
  state: OpModeState;
  paused?: boolean;
  resetSignal: number;
  actuatorStore: SimulatorActuatorStore;
  tickBudget: SimulatorTickBudget;
  robotConfiguration: ResolvedRobotConfiguration;
  inputSource: string;
  fullscreenControls?: ReactNode;
  touchControls?: ReactNode;
  simulateWhileHidden?: boolean;
  keyboardBindings: KeyboardBindings;
  fieldPreset: FieldPresetId;
  fieldParameters: FieldParameters;
  initialCamera?: "field" | "follow" | "driver";
  theme?: "light" | "dark";
  worldSetup?: { seed: number; alliance: "red" | "blue"; startPosition: "near" | "far" };
  showControls?: boolean;
  compactControls?: boolean;
  onFieldError?: (message: string) => void;
  visible?: boolean;
  readOnly?: boolean;
  assetExport?: SceneAssetRegistration;
  onTelemetry: (snapshot: TelemetrySnapshot) => void;
  onHardwareFrame: (frame: SimulatorHardwareFrame) => void;
}

/** React displays the shared headless world; it does not implement robot physics. */
export function RobotSimulator(props: RobotSimulatorProps) {
  return <WorldSimulator {...props} />;
}
