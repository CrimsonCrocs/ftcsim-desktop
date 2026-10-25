import {
  createBiobuzzRobotConfiguration,
  createLegacyPhysicalHardware,
  createRobotConfigurationManifest,
  openRobotConfiguration,
  type DriveRole,
} from "@/lib/robot-configuration";
import type { PersistedStarterLanguage } from "./types";
import { readGeneratedBlocksMetadata, validateBlocksGeneratedSources } from "@/lib/blocks/documents";

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return Array.isArray(left) === Array.isArray(right)
    && keys.length === Object.keys(b).length
    && keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

const DRIVE_ROLES: readonly DriveRole[] = ["frontLeft", "frontRight", "backLeft", "backRight"];
const DEFAULT_NAMES = {
  official: ["front_left_drive", "front_right_drive", "back_left_drive", "back_right_drive"],
  descriptive: ["frontLeftMotor", "frontRightMotor", "backLeftMotor", "backRightMotor"],
};

/** Upgrade only the recognizable untouched, four-motor mecanum Blocks starter. */
export function migrateLegacyBlocksConfiguration(source: string, starter: PersistedStarterLanguage): string | null {
  if (starter !== "blocks") return null;
  try {
    const document = openRobotConfiguration(source);
    const current = document.configuration;
    if (current.drivetrain.kind !== "mecanum" || current.devices.length !== 4 || document.diagnostics.length) return null;
    const naming = current.motorNamingPreset ?? "official";
    const names = DEFAULT_NAMES[naming];
    const legacy = createRobotConfigurationManifest("mecanum", naming, names);
    if (!sameValue(current.controllers, legacy.controllers)
        || !sameValue(current.devices, legacy.devices)
        || !sameValue(current.drivetrain, legacy.drivetrain)) return null;
    const physical = createLegacyPhysicalHardware(legacy);
    if (!sameValue(current.physical, physical.robot)
        || !sameValue(current.servoPorts, physical.servoPorts)
        || !sameValue(current.sensorPorts, physical.sensorPorts)) return null;

    const upgraded = createBiobuzzRobotConfiguration(naming, names);
    // Stable device IDs are embedded in Blocks XML. Retain all drive bindings.
    DRIVE_ROLES.forEach((role, index) => {
      const original = current.devices.find((device) => device.id === current.drivetrain.bindings[role])!;
      upgraded.devices[index] = { ...upgraded.devices[index]!, id: original.id };
      upgraded.drivetrain.bindings[role] = original.id;
    });
    upgraded.editor = current.editor;
    const manifest = { ...document.manifest, schemaVersion: 3, robot: upgraded };
    const text = `${JSON.stringify(manifest, null, 2)}\n`;
    return openRobotConfiguration(text).diagnostics.length ? null : text;
  } catch {
    // Invalid or unfamiliar configurations stay available for normal recovery.
    return null;
  }
}

export async function legacyBlocksProjectUpdates(
  files: Readonly<Record<string, string>>,
  starter: PersistedStarterLanguage,
): Promise<Record<string, string> | null> {
  const source = files["ftcsim.project.json"];
  if (!source) return null;
  const manifest = migrateLegacyBlocksConfiguration(source, starter);
  if (!manifest) return null;
  const previousHash = openRobotConfiguration(source).resolved.configurationHash;
  const nextHash = openRobotConfiguration(manifest).resolved.configurationHash;
  const diagnostics = await validateBlocksGeneratedSources(files, previousHash);
  const updates: Record<string, string> = {};
  for (const [path, java] of Object.entries(files)) {
    if (!path.endsWith(".java")) continue;
    const metadata = readGeneratedBlocksMetadata(java);
    if (!metadata || diagnostics.some((diagnostic) => diagnostic.file === path || diagnostic.file === metadata.sourcePath)) continue;
    // Only hardware was added; every existing motor ID and name is unchanged.
    // Carry forward verified generated outputs, including unopened OpModes.
    // Invalid or edited output retains its normal regeneration requirement.
    updates[path] = java.replace(`configuration=${previousHash}`, `configuration=${nextHash}`);
  }
  // Write the manifest last so interrupted upgrades can finish on the next open.
  updates["ftcsim.project.json"] = manifest;
  return updates;
}
