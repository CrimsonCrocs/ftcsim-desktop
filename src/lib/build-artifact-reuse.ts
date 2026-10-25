import type { LoadArtifact, SimulatedHardwareManifest } from '@ftc-studio/opmode-protocol';
import { createRepositorySnapshot } from './java-runner-client';

export async function reusableBuildArtifact(
  artifact: LoadArtifact | null,
  files: Readonly<Record<string, string | Uint8Array>>,
  hardware: SimulatedHardwareManifest,
  transport: "bundle" | "local" = "bundle",
): Promise<LoadArtifact | null> {
  if (!artifact || (transport === "bundle" && !artifact.artifactBundle)) return null;
  const snapshot = await createRepositorySnapshot(files);
  if (snapshot.sha256 !== artifact.repositorySnapshotHash) return null;
  const input = snapshot.sha256 + '\0hardware\0' + (hardware.configurationHash ?? JSON.stringify(hardware));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));
  const sourceHash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  return sourceHash === artifact.sourceHash ? artifact : null;
}
