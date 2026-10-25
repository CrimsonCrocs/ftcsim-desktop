"use client";

import {
  createBrowserGitEngine,
  destroyBrowserGitDatabase,
  restoreBrowserGitRepositoryFiles,
  type BrowserGitEngine,
  type RepositorySnapshotSourceFile,
} from "@/lib/browser-git";
import {
  FTC_SDK_VERSION,
  KOTLIN_VERSION,
  type PortableProjectRecord,
  type ProjectCatalog,
  type ProjectCloudState,
  type ProjectCloudReceipt,
  type ProjectRecord,
  type ProjectSession,
} from "./types";
import {
  PROJECT_SYNC_CHUNK_BYTES,
  PROJECT_SYNC_MAX_FILE_BYTES,
  PROJECT_SYNC_MAX_FILES,
  PROJECT_SYNC_MAX_PROJECT_BYTES,
  canonicalCloudRevision,
  type CloudFileManifestEntry,
  type CloudProjectRecord,
  type CloudProjectSummary,
  type CurrentProjectSyncResponse,
  type FinalizeSyncResponse,
  type PrepareSyncRequest,
  type PrepareSyncResponse,
  type ProjectSyncApiError,
  type ProjectSyncConflict,
  type ProjectSyncListResponse,
} from "./cloud-contract";
import { CloudSyncError } from "./cloud-queue";

const API_ROOT = "/api/project-sync";
const FILE_MODE_REGULAR = 0o100644;
const MAX_CONCURRENT_TRANSFERS = 4;

type SyncConflictDetails = ProjectCloudReceipt;

function asCloudProjectRecord(record: ProjectRecord): CloudProjectRecord {
  return {
    schemaVersion: 1,
    id: record.id,
    name: record.name,
    javaPackage: record.javaPackage,
    starter: record.starter,
    templateId: record.templateId,
    templateRevision: record.templateRevision,
    exampleIds: record.exampleIds,
    drivetrain: record.drivetrain,
    motorNamingPreset: record.motorNamingPreset,
    sdkVersion: record.sdkVersion,
    kotlinVersion: record.kotlinVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastOpenedAt: record.lastOpenedAt,
    remote: record.remote,
  };
}

function asPortableProjectRecord(record: CloudProjectRecord): PortableProjectRecord {
  if (
    record.schemaVersion !== 1
    || record.sdkVersion !== FTC_SDK_VERSION
    || record.kotlinVersion !== KOTLIN_VERSION
  ) {
    throw new CloudSyncError(
      "SYNC_FAILED",
      `Cloud project ${record.name || record.id} targets an incompatible FTC Simulator toolchain.`,
    );
  }
  return {
    ...record,
    sdkVersion: FTC_SDK_VERSION,
    kotlinVersion: KOTLIN_VERSION,
    nameKey: record.name.toLocaleLowerCase(),
    state: "ready",
  };
}

function cloudSummaryReceipt(summary: CloudProjectSummary): ProjectCloudReceipt {
  return {
    revision: summary.currentRevision,
    manifestSha256: summary.manifestSha256,
    updatedAt: summary.syncedAt,
  };
}

export function cloudSummaryAsProjectRecord(summary: CloudProjectSummary): ProjectRecord {
  const portable = asPortableProjectRecord(summary.project);
  return {
    ...portable,
    storageNamespace: "",
    cloudSyncEnabled: true,
    cloud: {
      revision: summary.currentRevision,
      manifestSha256: summary.manifestSha256,
      status: "synced",
      lastSyncedAt: summary.syncedAt,
      cloudUpdatedAt: summary.syncedAt,
    },
  };
}

function isApiError(value: unknown): value is ProjectSyncApiError {
  if (!value || typeof value !== "object" || !("error" in value)) return false;
  const candidate = value as ProjectSyncApiError;
  return Boolean(candidate.error) && typeof candidate.error.message === "string";
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (cause) {
    throw new CloudSyncError("SYNC_OFFLINE", "Project sync could not reach FTC Simulator.", cause);
  }
  const body = await responseJson(response);
  if (response.status === 409 && isApiError(body) && body.error.code === "SYNC_CONFLICT") {
    const conflict = body as ProjectSyncConflict;
    const details: SyncConflictDetails = {
      revision: conflict.error.cloudRevision,
      manifestSha256: conflict.error.cloudManifestSha256,
      updatedAt: conflict.error.cloudUpdatedAt,
    };
    throw new CloudSyncError("SYNC_CONFLICT", conflict.error.message, details);
  }
  if (!response.ok) {
    throw new CloudSyncError(
      response.status === 413 ? "SYNC_TOO_LARGE" : "SYNC_FAILED",
      isApiError(body) ? body.error.message : `Project sync failed with HTTP ${response.status}.`,
      body,
    );
  }
  return body as T;
}

export async function sha256Hex(content: Uint8Array | string): Promise<string> {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await operation(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface PreparedCloudRepository {
  manifest: CloudFileManifestEntry[];
  contentsByHash: Map<string, Uint8Array>;
}

async function describeRepositoryFiles(
  files: readonly RepositorySnapshotSourceFile[],
): Promise<PreparedCloudRepository> {
  if (files.length < 1 || files.length > PROJECT_SYNC_MAX_FILES) {
    throw new CloudSyncError("SYNC_TOO_LARGE", `Cloud sync supports at most ${PROJECT_SYNC_MAX_FILES.toLocaleString()} repository files.`);
  }
  let totalBytes = 0;
  const contentsByHash = new Map<string, Uint8Array>();
  const manifest = await mapConcurrent(files, MAX_CONCURRENT_TRANSFERS, async (file) => {
    if (file.content.byteLength > PROJECT_SYNC_MAX_FILE_BYTES) {
      throw new CloudSyncError("SYNC_TOO_LARGE", `${file.path} is larger than the ${(PROJECT_SYNC_MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB per-file sync limit.`);
    }
    totalBytes += file.content.byteLength;
    if (totalBytes > PROJECT_SYNC_MAX_PROJECT_BYTES) {
      throw new CloudSyncError("SYNC_TOO_LARGE", `This repository exceeds the ${(PROJECT_SYNC_MAX_PROJECT_BYTES / 1024 / 1024).toFixed(0)} MB cloud-sync limit.`);
    }
    const sha256 = await sha256Hex(file.content);
    contentsByHash.set(sha256, file.content);
    return {
      path: file.path,
      sha256,
      byteLength: file.content.byteLength,
      chunkCount: file.content.byteLength === 0
        ? 0
        : Math.ceil(file.content.byteLength / PROJECT_SYNC_CHUNK_BYTES),
      fileMode: FILE_MODE_REGULAR,
    };
  });
  manifest.sort((left, right) => left.path.localeCompare(right.path));
  return { manifest, contentsByHash };
}

export async function prepareCloudRepository(
  engine: BrowserGitEngine,
  signal?: AbortSignal,
): Promise<PreparedCloudRepository> {
  signal?.throwIfAborted();
  const files = await engine.exportRepositoryFiles();
  signal?.throwIfAborted();
  const prepared = await describeRepositoryFiles(files);
  signal?.throwIfAborted();
  return prepared;
}

async function uploadBlob(
  descriptor: { sha256: string; byteLength: number; chunkCount: number },
  content: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  if (content.byteLength !== descriptor.byteLength) {
    throw new CloudSyncError("SYNC_FAILED", `Prepared blob ${descriptor.sha256} no longer matches the local repository.`);
  }
  const chunks = Array.from({ length: descriptor.chunkCount }, (_, index) => {
    const start = index * PROJECT_SYNC_CHUNK_BYTES;
    return content.subarray(start, Math.min(start + PROJECT_SYNC_CHUNK_BYTES, content.byteLength));
  });
  await mapConcurrent(chunks, MAX_CONCURRENT_TRANSFERS, async (chunk, index) => {
    signal?.throwIfAborted();
    const chunkSha256 = await sha256Hex(chunk);
    let response: Response;
    try {
      const requestBytes = new Uint8Array(chunk.byteLength);
      requestBytes.set(chunk);
      response = await fetch(`${API_ROOT}/blobs/${descriptor.sha256}/chunks/${index}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/octet-stream",
          "x-ftcsim-chunk-sha256": chunkSha256,
          "x-ftcsim-blob-size": String(descriptor.byteLength),
          "x-ftcsim-blob-chunks": String(descriptor.chunkCount),
        },
        body: requestBytes.buffer,
        signal,
      });
    } catch (cause) {
      throw new CloudSyncError("SYNC_OFFLINE", "Project sync stopped while uploading repository data.", cause);
    }
    if (!response.ok) {
      const error = await responseJson(response);
      throw new CloudSyncError(
        response.status === 413 ? "SYNC_TOO_LARGE" : "SYNC_FAILED",
        isApiError(error) ? error.error.message : `A repository chunk failed with HTTP ${response.status}.`,
        error,
      );
    }
  });
  await requestJson(`${API_ROOT}/blobs/${descriptor.sha256}/complete`, {
    method: "POST",
    body: JSON.stringify({
      byteLength: descriptor.byteLength,
      chunkCount: descriptor.chunkCount,
    }),
    signal,
  });
}

export async function listCloudProjects(signal?: AbortSignal): Promise<CloudProjectSummary[]> {
  const response = await requestJson<ProjectSyncListResponse>(`${API_ROOT}/projects`, { signal });
  return response.projects;
}

export async function syncProjectToCloud(input: {
  catalog: ProjectCatalog;
  engine: BrowserGitEngine;
  record: ProjectRecord;
  session: ProjectSession;
  baseRevision?: number;
  resolveConflictRevision?: number;
  preparedRepository?: PreparedCloudRepository;
  signal?: AbortSignal;
}): Promise<ProjectRecord> {
  input.signal?.throwIfAborted();
  if (!input.record.cloudSyncEnabled) {
    throw new CloudSyncError(
      "SYNC_FAILED",
      "Cloud sync is off. Choose Sync to account from Projects before uploading this project.",
    );
  }
  const { manifest, contentsByHash } = input.preparedRepository
    ?? await prepareCloudRepository(input.engine, input.signal);
  const expectedLocalRevision = input.record.cloud?.localRevision ?? 0;
  const project = asCloudProjectRecord(input.record);
  const manifestSha256 = await sha256Hex(canonicalCloudRevision(project, input.session, manifest));
  const request: PrepareSyncRequest = {
    baseRevision: input.baseRevision ?? input.record.cloud?.revision ?? 0,
    manifestSha256,
    deviceId: await input.catalog.cloudDeviceId(),
    project,
    session: input.session,
    files: manifest,
  };

  let prepared: PrepareSyncResponse;
  try {
    prepared = await requestJson<PrepareSyncResponse>(
      `${API_ROOT}/projects/${encodeURIComponent(input.record.id)}/prepare`,
      { method: "POST", body: JSON.stringify(request), signal: input.signal },
    );
  } catch (cause) {
    if (cause instanceof CloudSyncError && cause.code === "SYNC_CONFLICT") {
      const receipt = cause.details as SyncConflictDetails;
      await input.catalog.markCloudConflict(input.record.id, receipt);
    }
    throw cause;
  }

  await mapConcurrent(prepared.missingBlobs, MAX_CONCURRENT_TRANSFERS, async (missing) => {
    input.signal?.throwIfAborted();
    const content = contentsByHash.get(missing.sha256);
    if (!content) throw new CloudSyncError("SYNC_FAILED", `The server requested unknown repository blob ${missing.sha256}.`);
    await uploadBlob(missing, content, input.signal);
  });

  let finalized: FinalizeSyncResponse;
  try {
    finalized = await requestJson<FinalizeSyncResponse>(
      `${API_ROOT}/projects/${encodeURIComponent(input.record.id)}/revisions`,
      { method: "POST", body: JSON.stringify(request), signal: input.signal },
    );
  } catch (cause) {
    if (cause instanceof CloudSyncError && cause.code === "SYNC_CONFLICT") {
      const receipt = cause.details as SyncConflictDetails;
      await input.catalog.markCloudConflict(input.record.id, receipt);
    }
    throw cause;
  }
  const receipt = {
    revision: finalized.currentRevision,
    manifestSha256: finalized.manifestSha256,
    updatedAt: finalized.project.syncedAt,
  };
  if (input.resolveConflictRevision !== undefined) {
    const resolved = await input.catalog.resolveCloudConflict(
      input.record.id,
      receipt,
      input.resolveConflictRevision,
      expectedLocalRevision,
    );
    if (resolved.cloud?.status !== "synced" || resolved.cloud.revision !== receipt.revision) {
      throw new CloudSyncError(
        "SYNC_CONFLICT",
        "This project changed again while the conflict was being resolved. Both copies are still preserved.",
      );
    }
    return resolved;
  }
  return input.catalog.markCloudSynced(
    input.record.id,
    receipt,
    expectedLocalRevision,
  );
}

async function downloadBlob(file: CloudFileManifestEntry, signal?: AbortSignal): Promise<Uint8Array> {
  const content = new Uint8Array(file.byteLength);
  const chunks = Array.from({ length: file.chunkCount }, (_, index) => index);
  await mapConcurrent(chunks, MAX_CONCURRENT_TRANSFERS, async (index) => {
    signal?.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(`${API_ROOT}/blobs/${file.sha256}/chunks/${index}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
    } catch (cause) {
      throw new CloudSyncError("SYNC_OFFLINE", "Project sync stopped while downloading repository data.", cause);
    }
    if (!response.ok) {
      const error = await responseJson(response);
      throw new CloudSyncError(
        "SYNC_FAILED",
        isApiError(error) ? error.error.message : `A repository chunk failed with HTTP ${response.status}.`,
        error,
      );
    }
    const chunk = new Uint8Array(await response.arrayBuffer());
    const offset = index * PROJECT_SYNC_CHUNK_BYTES;
    if (offset + chunk.byteLength > content.byteLength) {
      throw new CloudSyncError("SYNC_FAILED", `Cloud blob ${file.sha256} contains an oversized chunk.`);
    }
    const expectedChunkHash = response.headers.get("x-ftcsim-chunk-sha256");
    if (expectedChunkHash && await sha256Hex(chunk) !== expectedChunkHash) {
      throw new CloudSyncError("SYNC_FAILED", `Cloud blob ${file.sha256} failed chunk verification.`);
    }
    content.set(chunk, offset);
  });
  if (await sha256Hex(content) !== file.sha256) {
    throw new CloudSyncError("SYNC_FAILED", `Cloud blob ${file.sha256} failed integrity verification.`);
  }
  return content;
}

export async function getCurrentCloudProject(
  projectId: string,
  signal?: AbortSignal,
): Promise<CurrentProjectSyncResponse> {
  return requestJson<CurrentProjectSyncResponse>(
    `${API_ROOT}/projects/${encodeURIComponent(projectId)}/current`,
    { signal },
  );
}

export async function hydrateCloudProject(
  catalog: ProjectCatalog,
  current: CurrentProjectSyncResponse,
  signal?: AbortSignal,
  operations: {
    restoreFiles?: typeof restoreBrowserGitRepositoryFiles;
    createEngine?: typeof createBrowserGitEngine;
    destroyDatabase?: typeof destroyBrowserGitDatabase;
  } = {},
): Promise<ProjectRecord> {
  signal?.throwIfAborted();
  const files = await mapConcurrent(current.files, MAX_CONCURRENT_TRANSFERS, async (file) => ({
    path: file.path,
    content: await downloadBlob(file, signal),
  }));
  signal?.throwIfAborted();
  const namespace = `ftc-simulator-project-${current.project.id}-cloud-${current.revision}-${crypto.randomUUID()}`;
  const restoreFiles = operations.restoreFiles ?? restoreBrowserGitRepositoryFiles;
  const createEngine = operations.createEngine ?? createBrowserGitEngine;
  const destroyDatabase = operations.destroyDatabase ?? destroyBrowserGitDatabase;
  try {
    await restoreFiles({ databaseName: namespace, files });
    signal?.throwIfAborted();
    const engine = createEngine({ databaseName: namespace });
    await engine.initialize({});
    signal?.throwIfAborted();
    const adopted = await catalog.adoptCloudProject({
      record: asPortableProjectRecord(current.project),
      session: current.session,
      storageNamespace: namespace,
      receipt: {
        revision: current.revision,
        manifestSha256: current.manifestSha256,
        updatedAt: current.syncedAt,
      },
    });
    if (adopted.replacedStorageNamespace) {
      await destroyDatabase(adopted.replacedStorageNamespace).catch(() => undefined);
    }
    return adopted.record;
  } catch (cause) {
    await destroyDatabase(namespace).catch(() => undefined);
    throw cause;
  }
}

export function shouldCheckCloudProjectOnOpen(
  accountId: string | null,
  local: Pick<ProjectRecord, "cloudSyncEnabled"> | undefined,
): boolean {
  // A cloud-only project has no local opt-in record until hydration completes.
  return Boolean(accountId && (!local || local.cloudSyncEnabled));
}

export async function ensureCloudProjectAvailable(
  catalog: ProjectCatalog,
  projectId: string,
  cloudProjects?: readonly CloudProjectSummary[],
  signal?: AbortSignal,
): Promise<ProjectRecord | undefined> {
  const local = await catalog.get(projectId);
  const summaries = cloudProjects ?? await listCloudProjects(signal);
  const cloud = summaries.find((summary) => summary.project.id === projectId);
  if (!cloud) return local;
  if (!local) return hydrateCloudProject(catalog, await getCurrentCloudProject(projectId, signal), signal);

  if (
    local.cloud?.revision === cloud.currentRevision
    && local.cloud.manifestSha256 === cloud.manifestSha256
    && local.cloud.status !== "conflict"
  ) {
    return local;
  }
  const localHasUnsyncedChanges = !local.cloud
    || local.cloud.status === "dirty"
    || local.cloud.status === "conflict";
  if (localHasUnsyncedChanges) {
    return catalog.markCloudConflict(projectId, cloudSummaryReceipt(cloud));
  }
  const localCloud = local.cloud;
  if (
    localCloud
    && (
      cloud.currentRevision > localCloud.revision
      || (
        cloud.currentRevision === localCloud.revision
        && cloud.manifestSha256 !== localCloud.manifestSha256
      )
    )
  ) {
    const receipt = cloudSummaryReceipt(cloud);
    await catalog.markCloudUpdateAvailable(projectId, receipt);
    return hydrateCloudProject(catalog, await getCurrentCloudProject(projectId, signal), signal);
  }
  return local;
}

export function mergeLocalAndCloudProjects(
  local: readonly ProjectRecord[],
  cloud: readonly CloudProjectSummary[],
): ProjectRecord[] {
  const merged = new Map(local.map((record) => [record.id, record]));
  for (const summary of cloud) {
    const current = merged.get(summary.project.id);
    if (current) {
      const localCloud = current.cloud ?? {
        revision: 0,
        manifestSha256: null,
        status: "dirty" as const,
        lastSyncedAt: null,
        localRevision: 0,
      };
      const cloudIsAvailable = summary.currentRevision > localCloud.revision
        || (
          summary.currentRevision === localCloud.revision
          && summary.manifestSha256 !== localCloud.manifestSha256
        );
      const localReceipt: ProjectCloudState = { ...localCloud };
      delete localReceipt.availableRevision;
      delete localReceipt.availableManifestSha256;
      delete localReceipt.availableUpdatedAt;
      merged.set(current.id, {
        ...current,
        cloud: cloudIsAvailable
          ? {
              ...localReceipt,
              availableRevision: summary.currentRevision,
              availableManifestSha256: summary.manifestSha256,
              availableUpdatedAt: summary.syncedAt,
            }
          : localReceipt,
      });
    } else {
      merged.set(summary.project.id, cloudSummaryAsProjectRecord(summary));
    }
  }
  return [...merged.values()].sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
}
