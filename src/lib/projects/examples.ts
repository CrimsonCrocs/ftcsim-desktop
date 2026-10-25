import officialCatalog from "./official-ftc-example-catalog.json";
import type { StarterLanguage } from "./types";

export type ExampleDescriptor = {
  id: string;
  name: string;
  language: "java" | "blocks" | "any";
  kind: "teleop" | "autonomous";
  origin: "ftcsim" | "official";
  summary: string;
  changes?: readonly string[];
  configurable?: boolean;
};

export const FTCSIM_EXAMPLES: readonly ExampleDescriptor[] = [
  { id: "ftcsim:driver-controlled", name: "Driver Controlled", language: "any", kind: "teleop", origin: "ftcsim", summary: "Default robot drive and mechanisms." },
  { id: "ftcsim:park-auto", name: "Park Autonomous", language: "any", kind: "autonomous", origin: "ftcsim", summary: "Drive forward and park." },
  { id: "ftcsim:basic-drive", name: "Basic TeleOp", language: "any", kind: "teleop", origin: "ftcsim", summary: "Gamepad driving and telemetry." },
  { id: "ftcsim:precision-drive", name: "Precision TeleOp", language: "any", kind: "teleop", origin: "ftcsim", summary: "Switch between three drive speeds." },
  { id: "ftcsim:timed-park", name: "Timed Park Autonomous", language: "any", kind: "autonomous", origin: "ftcsim", summary: "Drive forward for two seconds." },
  { id: "ftcsim:square-path", name: "Square Path Autonomous", language: "any", kind: "autonomous", origin: "ftcsim", summary: "Drive a timed square path." },
];

export const OFFICIAL_FTC_EXAMPLES: readonly ExampleDescriptor[] = officialCatalog.map((entry) => ({
  ...entry,
  language: entry.language as "java" | "blocks",
  kind: entry.kind as "teleop" | "autonomous",
  origin: "official" as const,
  summary: entry.language === "blocks" ? "FTC SDK 11.1 Blocks sample." : "FTC SDK 11.1 Java sample.",
  changes: entry.changes,
  configurable: entry.configurable,
}));

export const DEFAULT_EXAMPLE_IDS = ["ftcsim:driver-controlled", "ftcsim:park-auto"] as const;

export function availableExamples(starter: StarterLanguage): readonly ExampleDescriptor[] {
  return [
    ...FTCSIM_EXAMPLES,
    ...OFFICIAL_FTC_EXAMPLES.filter((entry) => (
      starter === "blocks" ? entry.language === "blocks" : entry.language === "java"
    )),
  ];
}

export function exampleById(id: string): ExampleDescriptor | undefined {
  return [...FTCSIM_EXAMPLES, ...OFFICIAL_FTC_EXAMPLES].find((entry) => entry.id === id);
}
