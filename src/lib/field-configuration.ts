export const LATEST_FIELD_PRESET = "biobuzz-2026-2027" as const;
export const DEFAULT_FIELD_PRESET = LATEST_FIELD_PRESET;
const LEGACY_FIELD_PRESET = "decode-2025-2026" as const;

export type FieldPresetId = typeof DEFAULT_FIELD_PRESET | typeof LEGACY_FIELD_PRESET | "empty";
export type ArtifactColor = "green" | "purple";

export interface FieldConfiguration {
  preset: FieldPresetId;
  parameters?: FieldParameters;
}

export function isFieldPresetId(value: unknown): value is FieldPresetId {
  return value === "biobuzz-2026-2027" || value === "decode-2025-2026" || value === "empty";
}

export function readFieldConfiguration(manifest: Record<string, unknown>): FieldConfiguration {
  const field = manifest.field;
  if (typeof field !== "object" || field === null || Array.isArray(field)) {
    return { preset: LEGACY_FIELD_PRESET };
  }
  const preset = (field as Record<string, unknown>).preset;
  return { preset: isFieldPresetId(preset) ? preset : LEGACY_FIELD_PRESET };
}

export function writeFieldConfiguration(
  manifest: Record<string, unknown>,
  configuration: FieldConfiguration,
): Record<string, unknown> {
  return {
    ...manifest,
    field: {
      ...(typeof manifest.field === "object" && manifest.field !== null && !Array.isArray(manifest.field) ? manifest.field : {}),
      preset: configuration.preset,
      ...(configuration.parameters === undefined ? {} : { parameters: normalizeFieldParameters(configuration.parameters) }),
    },
  };
}
import { WORLD_PHYSICAL_PARAMETERS } from "@ftc-studio/sim-core";

export type FieldParameters = Partial<Record<string, number>>;

export function normalizeFieldParameters(value: unknown): FieldParameters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([name, number]) => {
    const range = WORLD_PHYSICAL_PARAMETERS[name]?.experimentalRange;
    return range && typeof number === "number" && Number.isFinite(number) && number >= range[0] && number <= range[1];
  }));
}

export function readFieldParameters(manifest: Record<string, unknown>): FieldParameters {
  const field = manifest.field;
  return normalizeFieldParameters(field && typeof field === "object" && "parameters" in field ? field.parameters : undefined);
}
