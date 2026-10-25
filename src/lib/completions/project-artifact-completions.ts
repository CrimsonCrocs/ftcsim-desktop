import { unzipSync } from "fflate";

import type { LoadArtifact } from "@ftc-studio/opmode-protocol";

import { JvmCompletionCatalog, type JvmLanguageIndex } from "./language-index";
import { mergeJvmLanguageIndexes } from "./resolved-library-index";

export const PROJECT_COMPLETION_INDEX_PATH = "metadata/resolved-completion-index.json" as const;
export const PROJECT_COMPLETION_INDEX_FORMAT = "ftc-resolved-completion-index-v1" as const;
export const PROJECT_ARTIFACT_MANIFEST_PATH = "META-INF/ftc-sim/artifact.json" as const;

const ARTIFACT_BASE64_MAX_CHARS = 89_478_486;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_COMPLETION_INDEX_BYTES = 128 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 100_000;
const MAX_EXTRACTED_METADATA_BYTES = MAX_COMPLETION_INDEX_BYTES + MAX_MANIFEST_BYTES;

export interface ProjectArtifactCompletionDocument {
  format: typeof PROJECT_COMPLETION_INDEX_FORMAT;
  repositorySnapshotHash: string;
  index: JvmLanguageIndex;
  truncated: boolean;
  omittedClassFiles: number;
}

export interface ProjectArtifactCompletionEntry {
  artifactHash: string;
  repositorySnapshotHash: string;
  index: JvmLanguageIndex;
  catalog: JvmCompletionCatalog;
}

interface ArtifactBundleManifest {
  format: "ftc-teamcode-artifact-v1";
  artifactId: string;
  repositorySnapshotHash: string;
  completionIndexPath?: string;
  completionIndexSha256?: string;
  completionIndexFormat?: typeof PROJECT_COMPLETION_INDEX_FORMAT;
}

const projectEntries = new Map<string, ProjectArtifactCompletionEntry>();
const projectGenerations = new Map<string, number>();

/**
 * Install completion types from the exact dependency JARs attached to a successful build.
 * Call this after `session.load()` resolves. A newer call or clear wins if indexing is still
 * underway, so a slow old build cannot replace the latest project's symbols.
 */
export async function publishProjectArtifactCompletions(
  projectId: string,
  artifact: LoadArtifact,
): Promise<{ status: "installed"; typeCount: number } | { status: "empty" }> {
  const generation = nextProjectGeneration(projectId);
  projectEntries.delete(projectId);
  const bundle = artifact.artifactBundle;
  if (!bundle) return { status: "empty" };
  if (bundle.sha256 !== artifact.artifactHash || !/^[a-f0-9]{64}$/u.test(bundle.sha256)) {
    throw new Error("Project completion indexing received a mismatched build artifact hash");
  }

  const bytes = decodeBase64(bundle.content);
  if (await sha256Bytes(bytes) !== artifact.artifactHash) {
    throw new Error("Project completion indexing rejected a build artifact with an invalid hash");
  }
  const files = unzipSync(bytes, {
    filter: createMetadataZipFilter(),
  });
  const manifestBytes = files[PROJECT_ARTIFACT_MANIFEST_PATH];
  if (!manifestBytes) throw new Error("Build artifact is missing its manifest");
  const manifest = parseManifest(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  if (manifest.repositorySnapshotHash !== artifact.repositorySnapshotHash) {
    throw new Error("Build artifact repository snapshot does not match its completion metadata");
  }
  if (manifest.completionIndexPath !== PROJECT_COMPLETION_INDEX_PATH) return { status: "empty" };
  if (!manifest.completionIndexSha256 || !/^[a-f0-9]{64}$/u.test(manifest.completionIndexSha256)) {
    throw new Error("Build artifact completion index checksum is invalid");
  }
  const indexBytes = files[PROJECT_COMPLETION_INDEX_PATH];
  if (!indexBytes || await sha256Bytes(indexBytes) !== manifest.completionIndexSha256) {
    throw new Error("Build artifact completion index does not match its manifest checksum");
  }
  const document = parseCompletionDocument(new TextDecoder("utf-8", { fatal: true }).decode(indexBytes));
  return installCompletionDocument(projectId, artifact, document, generation);
}

/** Native desktop metadata arrives over its private bridge, without a transferable build archive. */
export function publishLocalProjectArtifactCompletions(
  projectId: string,
  artifact: LoadArtifact,
  document: ProjectArtifactCompletionDocument,
): { status: "installed"; typeCount: number } | { status: "empty" } {
  const generation = nextProjectGeneration(projectId);
  projectEntries.delete(projectId);
  return installCompletionDocument(projectId, artifact, parseCompletionDocument(JSON.stringify(document)), generation);
}

function installCompletionDocument(projectId: string, artifact: LoadArtifact, document: ProjectArtifactCompletionDocument, generation: number): { status: "installed"; typeCount: number } | { status: "empty" } {
  if (document.repositorySnapshotHash !== artifact.repositorySnapshotHash) {
    throw new Error("Project completion index belongs to a different repository snapshot");
  }
  const catalog = new JvmCompletionCatalog(document.index);
  if (projectGenerations.get(projectId) !== generation) return { status: "empty" };
  projectEntries.set(projectId, {
    artifactHash: artifact.artifactHash,
    repositorySnapshotHash: artifact.repositorySnapshotHash,
    index: catalog.index,
    catalog,
  });
  return { status: "installed", typeCount: catalog.index.summary[0] };
}

/** Clear dependency symbols on rebuild, Git workspace replacement, or project close.
 * Ordinary source edits retain the last successful dependency index for completion.
 */
export function clearProjectArtifactCompletions(projectId: string): void {
  nextProjectGeneration(projectId);
  projectEntries.delete(projectId);
}

export function projectArtifactCompletionCatalog(
  projectId: string,
): ProjectArtifactCompletionEntry | undefined {
  return projectEntries.get(projectId);
}

export function mergeProjectArtifactCompletionCatalog(
  base: JvmCompletionCatalog,
  project: ProjectArtifactCompletionEntry | undefined,
): JvmCompletionCatalog {
  if (!project) return base;
  return new JvmCompletionCatalog(mergeIndexesPreferProject(base.index, project.index));
}

function mergeIndexesPreferProject(base: JvmLanguageIndex, project: JvmLanguageIndex): JvmLanguageIndex {
  // Dependency versions resolved by this build follow the Java compiler's classpath precedence.
  return mergeJvmLanguageIndexes("ftc-project-workspace", [base, project], {
    duplicateTypes: "prefer-last",
  });
}

function parseManifest(source: string): ArtifactBundleManifest {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)
      || value.format !== "ftc-teamcode-artifact-v1"
      || typeof value.artifactId !== "string"
      || typeof value.repositorySnapshotHash !== "string") {
    throw new Error("Build artifact manifest is invalid for completion indexing");
  }
  return {
    format: "ftc-teamcode-artifact-v1",
    artifactId: value.artifactId,
    repositorySnapshotHash: value.repositorySnapshotHash,
    ...(typeof value.completionIndexPath === "string" ? { completionIndexPath: value.completionIndexPath } : {}),
    ...(typeof value.completionIndexSha256 === "string" ? { completionIndexSha256: value.completionIndexSha256 } : {}),
    ...(typeof value.completionIndexFormat === "string"
      ? { completionIndexFormat: value.completionIndexFormat as typeof PROJECT_COMPLETION_INDEX_FORMAT }
      : {}),
  };
}

function parseCompletionDocument(source: string): ProjectArtifactCompletionDocument {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value)
      || value.format !== PROJECT_COMPLETION_INDEX_FORMAT
      || typeof value.repositorySnapshotHash !== "string"
      || typeof value.truncated !== "boolean"
      || !Number.isSafeInteger(value.omittedClassFiles)
      || (value.omittedClassFiles as number) < 0
      || !isRecord(value.index)) {
    throw new Error("Resolved dependency completion index is invalid");
  }
  const index = value.index as unknown as JvmLanguageIndex;
  if (!Array.isArray(index.types) || !Array.isArray(index.members)
      || !Array.isArray(index.artifacts)
      || index.types.length > 25_000
      || index.members.length > 200_000
      || index.artifacts.length > 1_024) {
    throw new Error("Resolved dependency completion index exceeds its browser limits");
  }
  return value as unknown as ProjectArtifactCompletionDocument;
}

function decodeBase64(content: string): Uint8Array {
  if (content.length > ARTIFACT_BASE64_MAX_CHARS || !isStandardBase64(content)) {
    throw new Error("Build artifact encoding is invalid for completion indexing");
  }
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isStandardBase64(content: string): boolean {
  if (content.length % 4 !== 0) return false;
  let paddingStarted = false;
  let paddingCount = 0;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code === 61) {
      paddingStarted = true;
      paddingCount += 1;
      if (paddingCount > 2 || index < content.length - 2) return false;
      continue;
    }
    if (paddingStarted || !isBase64CharacterCode(code)) return false;
  }
  return true;
}

function isBase64CharacterCode(code: number): boolean {
  return (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || (code >= 48 && code <= 57)
    || code === 43
    || code === 47;
}

function createMetadataZipFilter(): (file: {
  name: string;
  size: number;
  originalSize: number;
  compression: number;
}) => boolean {
  let entryCount = 0;
  let extractedBytes = 0;
  const acceptedNames = new Set<string>();
  return (file) => {
    entryCount += 1;
    if (entryCount > MAX_ZIP_ENTRIES) {
      throw new Error("Build artifact contains too many ZIP entries for completion indexing");
    }
    if (file.name !== PROJECT_ARTIFACT_MANIFEST_PATH
        && file.name !== PROJECT_COMPLETION_INDEX_PATH) return false;
    if (acceptedNames.has(file.name)) {
      throw new Error(`Build artifact contains duplicate completion metadata: ${file.name}`);
    }
    acceptedNames.add(file.name);
    if (!Number.isSafeInteger(file.size) || file.size < 0
        || !Number.isSafeInteger(file.originalSize) || file.originalSize < 0
        || file.originalSize > (file.name === PROJECT_ARTIFACT_MANIFEST_PATH
          ? MAX_MANIFEST_BYTES
          : MAX_COMPLETION_INDEX_BYTES)
        || file.size > ARTIFACT_BASE64_MAX_CHARS
        || (file.compression !== 0 && file.compression !== 8)) {
      throw new Error(`Build artifact completion metadata exceeds safe ZIP limits: ${file.name}`);
    }
    extractedBytes += file.originalSize;
    if (extractedBytes > MAX_EXTRACTED_METADATA_BYTES) {
      throw new Error("Build artifact completion metadata exceeds the extraction limit");
    }
    return true;
  };
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function nextProjectGeneration(projectId: string): number {
  const next = (projectGenerations.get(projectId) ?? 0) + 1;
  projectGenerations.set(projectId, next);
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
