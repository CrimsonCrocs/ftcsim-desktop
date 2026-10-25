import type {
  MotorNamingPreset,
  PersistedStarterLanguage,
  ProjectSession,
  StarterTemplateId,
} from "./types";
import type { RobotVariant } from "@/lib/studio-types";

function compareCanonicalText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const PROJECT_SYNC_CHUNK_BYTES = 512 * 1024;
export const PROJECT_SYNC_MAX_FILE_BYTES = 16 * 1024 * 1024;
export const PROJECT_SYNC_MAX_PROJECT_BYTES = 64 * 1024 * 1024;
export const PROJECT_SYNC_MAX_FILES = 10_000;

export interface CloudProjectRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  javaPackage: string;
  starter: PersistedStarterLanguage;
  templateId?: StarterTemplateId;
  templateRevision?: number;
  exampleIds?: string[];
  drivetrain: RobotVariant;
  motorNamingPreset: MotorNamingPreset;
  sdkVersion: string;
  kotlinVersion: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  remote?: {
    provider: "github";
    owner: string;
    repository: string;
    branch: string;
    shallowDepth: 0 | 50;
    private: boolean;
  };
}

export interface CloudFileManifestEntry {
  path: string;
  sha256: string;
  byteLength: number;
  chunkCount: number;
  fileMode: number;
}

export interface CloudProjectSummary {
  project: CloudProjectRecord;
  currentRevision: number;
  manifestSha256: string;
  totalBytes: number;
  fileCount: number;
  syncedAt: string;
}

export interface PrepareSyncRequest {
  baseRevision: number;
  manifestSha256: string;
  deviceId: string;
  project: CloudProjectRecord;
  session: ProjectSession;
  files: CloudFileManifestEntry[];
}

export interface MissingCloudBlob {
  sha256: string;
  byteLength: number;
  chunkCount: number;
}

export interface PrepareSyncResponse {
  projectId: string;
  currentRevision: number;
  missingBlobs: MissingCloudBlob[];
}

export type FinalizeSyncRequest = PrepareSyncRequest;

export interface FinalizeSyncResponse {
  project: CloudProjectSummary;
  currentRevision: number;
  manifestSha256: string;
}

export interface CurrentProjectSyncResponse {
  project: CloudProjectRecord;
  revision: number;
  manifestSha256: string;
  totalBytes: number;
  syncedAt: string;
  session: ProjectSession;
  files: CloudFileManifestEntry[];
}

export interface ProjectSyncListResponse {
  projects: CloudProjectSummary[];
}

export interface ProjectSyncConflict {
  error: {
    code: "SYNC_CONFLICT";
    message: string;
    cloudRevision: number;
    cloudUpdatedAt: string;
    cloudManifestSha256: string;
  };
}

export interface ProjectSyncApiError {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Canonical, order-independent input for the revision manifest digest.
 * Callers hash the returned UTF-8 bytes with SHA-256.
 */
export function canonicalCloudManifest(files: readonly CloudFileManifestEntry[]): string {
  return [...files]
    .sort((left, right) => compareCanonicalText(left.path, right.path))
    .map((file) => (
      `${file.path}\0${file.sha256}\0${file.byteLength}\0${file.chunkCount}\0${file.fileMode}\n`
    ))
    .join("");
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareCanonicalText(left, right))
      .map(([key, entry]) => [key, canonicalJsonValue(entry)]),
  );
}

/**
 * Canonical revision input. Project/session-only changes intentionally produce
 * a new digest even when every repository file is unchanged.
 */
export function canonicalCloudRevision(
  project: CloudProjectRecord,
  session: ProjectSession,
  files: readonly CloudFileManifestEntry[],
): string {
  return JSON.stringify(canonicalJsonValue({
    project,
    session,
    files: [...files].sort((left, right) => compareCanonicalText(left.path, right.path)),
  }));
}
