import {
  RepositoryControlFileError,
  assertCredentialSafeGitConfig,
  assertValidGitHead,
  isRepositoryCredentialPath,
  isRepositoryGitConfigPath,
} from "./repository-security";

const SNAPSHOT_MAGIC = new TextEncoder().encode("FTCSIMR1");
const SNAPSHOT_HEADER_BYTES = SNAPSHOT_MAGIC.byteLength + 4;
const SNAPSHOT_FORMAT = "ftcsim-lightningfs-repository";
const SNAPSHOT_SCHEMA_VERSION = 1 as const;

export const REPOSITORY_SNAPSHOT_MAX_FILES = 50_000;
export const REPOSITORY_SNAPSHOT_MAX_PATH_BYTES = 4_096;
export const REPOSITORY_SNAPSHOT_MAX_FILE_BYTES = 64 * 1024 * 1024;
export const REPOSITORY_SNAPSHOT_MAX_CONTENT_BYTES = 256 * 1024 * 1024;
export const REPOSITORY_SNAPSHOT_MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
export const REPOSITORY_SNAPSHOT_MAX_ARCHIVE_BYTES =
  SNAPSHOT_HEADER_BYTES
  + REPOSITORY_SNAPSHOT_MAX_MANIFEST_BYTES
  + REPOSITORY_SNAPSHOT_MAX_CONTENT_BYTES;

export type RepositorySnapshotErrorCode =
  | "INVALID_SNAPSHOT"
  | "UNSUPPORTED_SNAPSHOT"
  | "INVALID_PATH"
  | "DUPLICATE_PATH"
  | "LIMIT_EXCEEDED"
  | "CREDENTIALS_PRESENT"
  | "NOT_A_REPOSITORY";

export class RepositorySnapshotError extends Error {
  constructor(
    public readonly code: RepositorySnapshotErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RepositorySnapshotError";
  }
}

export interface RepositorySnapshotSourceFile {
  path: string;
  content: Uint8Array;
}

export interface SerializedRepositorySnapshot {
  bytes: Uint8Array;
  fileCount: number;
  contentBytes: number;
  excludedTransientPaths: string[];
  format: typeof SNAPSHOT_FORMAT;
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
}

export interface ParsedRepositorySnapshot {
  files: RepositorySnapshotSourceFile[];
  fileCount: number;
  contentBytes: number;
  format: typeof SNAPSHOT_FORMAT;
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
}

export interface ValidatedRepositorySnapshotFiles {
  files: RepositorySnapshotSourceFile[];
  fileCount: number;
  contentBytes: number;
}

interface RepositorySnapshotManifest {
  format: typeof SNAPSHOT_FORMAT;
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  fileCount: number;
  contentBytes: number;
  files: Array<{
    path: string;
    byteLength: number;
  }>;
}

function fail(
  code: RepositorySnapshotErrorCode,
  message: string,
): never {
  throw new RepositorySnapshotError(code, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

export function normalizeRepositorySnapshotPath(path: string): string {
  if (
    !path
    || path !== path.trim()
    || path.startsWith("/")
    || path.endsWith("/")
    || path.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(path)
  ) {
    fail("INVALID_PATH", `Repository snapshot contains an invalid path: ${JSON.stringify(path)}.`);
  }

  const pathBytes = new TextEncoder().encode(path).byteLength;
  if (pathBytes > REPOSITORY_SNAPSHOT_MAX_PATH_BYTES) {
    fail("LIMIT_EXCEEDED", `Repository path exceeds ${REPOSITORY_SNAPSHOT_MAX_PATH_BYTES} UTF-8 bytes.`);
  }

  const parts = path.split("/");
  if (parts.some((part) => !part || part !== part.trim() || part === "." || part === "..")) {
    fail("INVALID_PATH", `Repository snapshot contains an unsafe path: ${JSON.stringify(path)}.`);
  }
  if (parts.slice(1).includes(".git")) {
    fail("INVALID_PATH", "Nested .git entries are not supported in a synced repository.");
  }
  return parts.join("/");
}

export function isTransientGitSnapshotPath(path: string): boolean {
  if (!path.startsWith(".git/")) return false;
  const lowerPath = path.toLowerCase();
  const name = lowerPath.slice(lowerPath.lastIndexOf("/") + 1);
  return name.endsWith(".lock") || lowerPath === ".git/gc.pid";
}

function decodeUtf8(content: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return fail("INVALID_SNAPSHOT", `${label} is not valid UTF-8.`);
  }
}

export function assertRepositoryConfigHasNoCredentials(content: Uint8Array): void {
  try {
    assertCredentialSafeGitConfig(content);
  } catch (error) {
    if (!(error instanceof RepositoryControlFileError)) throw error;
    if (error.code === "LIMIT_EXCEEDED") fail("LIMIT_EXCEEDED", error.message);
    if (error.code === "CREDENTIALS_PRESENT") fail("CREDENTIALS_PRESENT", error.message);
    fail("INVALID_SNAPSHOT", error.message);
  }
}

function assertSafeFiles(files: readonly RepositorySnapshotSourceFile[]): void {
  const paths = new Set<string>();
  let primaryConfig: Uint8Array | null = null;
  const configs: Uint8Array[] = [];
  let head: Uint8Array | null = null;

  for (const file of files) {
    const path = normalizeRepositorySnapshotPath(file.path);
    if (!(file.content instanceof Uint8Array)) {
      fail("INVALID_SNAPSHOT", `${path} does not contain binary file data.`);
    }
    if (isTransientGitSnapshotPath(path)) {
      fail("INVALID_SNAPSHOT", `Transient Git lock ${path} cannot be restored from a snapshot.`);
    }
    if (isRepositoryCredentialPath(path)) {
      fail("CREDENTIALS_PRESENT", `${path} may contain credentials and cannot be synced.`);
    }
    if (paths.has(path)) fail("DUPLICATE_PATH", `Repository snapshot contains ${path} more than once.`);
    paths.add(path);
    if (isRepositoryGitConfigPath(path)) configs.push(file.content);
    if (path === ".git/config") primaryConfig = file.content;
    if (path === ".git/HEAD") head = file.content;
  }

  if (!head || !primaryConfig) {
    fail("NOT_A_REPOSITORY", "Repository snapshot must contain .git/HEAD and .git/config.");
  }
  try {
    assertValidGitHead(head);
  } catch (error) {
    if (!(error instanceof RepositoryControlFileError)) throw error;
    if (error.code === "LIMIT_EXCEEDED") fail("LIMIT_EXCEEDED", error.message);
    fail("NOT_A_REPOSITORY", error.message);
  }
  for (const config of configs) assertRepositoryConfigHasNoCredentials(config);
}

function prepareRepositorySnapshotFiles(
  sourceFiles: readonly RepositorySnapshotSourceFile[],
  excludeTransient: boolean,
): ValidatedRepositorySnapshotFiles & { excludedTransientPaths: string[] } {
  const excludedTransientPaths: string[] = [];
  const normalized = sourceFiles.flatMap((file) => {
    const path = normalizeRepositorySnapshotPath(file.path);
    if (isTransientGitSnapshotPath(path) && excludeTransient) {
      excludedTransientPaths.push(path);
      return [];
    }
    return [{ path, content: file.content }];
  }).sort((left, right) => left.path.localeCompare(right.path));

  if (normalized.length < 1 || normalized.length > REPOSITORY_SNAPSHOT_MAX_FILES) {
    fail("LIMIT_EXCEEDED", `Repository snapshots support 1–${REPOSITORY_SNAPSHOT_MAX_FILES} files.`);
  }
  const seen = new Set<string>();
  let contentBytes = 0;
  for (const file of normalized) {
    if (!(file.content instanceof Uint8Array)) {
      fail("INVALID_SNAPSHOT", `${file.path} does not contain binary file data.`);
    }
    if (seen.has(file.path)) fail("DUPLICATE_PATH", `Repository contains ${file.path} more than once.`);
    seen.add(file.path);
    if (file.content.byteLength > REPOSITORY_SNAPSHOT_MAX_FILE_BYTES) {
      fail("LIMIT_EXCEEDED", `${file.path} exceeds the ${REPOSITORY_SNAPSHOT_MAX_FILE_BYTES}-byte file limit.`);
    }
    contentBytes += file.content.byteLength;
    if (!Number.isSafeInteger(contentBytes) || contentBytes > REPOSITORY_SNAPSHOT_MAX_CONTENT_BYTES) {
      fail("LIMIT_EXCEEDED", `Repository content exceeds ${REPOSITORY_SNAPSHOT_MAX_CONTENT_BYTES} bytes.`);
    }
  }
  assertSafeFiles(normalized);
  return {
    files: normalized,
    fileCount: normalized.length,
    contentBytes,
    excludedTransientPaths: excludedTransientPaths.sort((left, right) => left.localeCompare(right)),
  };
}

/**
 * Validates and sorts raw content-addressable repository entries without
 * constructing a monolithic archive. Transient lock files are rejected here;
 * exporters should filter them before calling this boundary.
 */
export function validateRepositorySnapshotFiles(
  sourceFiles: readonly RepositorySnapshotSourceFile[],
): ValidatedRepositorySnapshotFiles {
  const prepared = prepareRepositorySnapshotFiles(sourceFiles, false);
  return {
    files: prepared.files,
    fileCount: prepared.fileCount,
    contentBytes: prepared.contentBytes,
  };
}

function parseManifest(raw: unknown): RepositorySnapshotManifest {
  if (!isPlainObject(raw) || !hasExactlyKeys(raw, [
    "format",
    "schemaVersion",
    "fileCount",
    "contentBytes",
    "files",
  ])) {
    return fail("INVALID_SNAPSHOT", "Repository snapshot manifest has an invalid shape.");
  }
  if (raw.format !== SNAPSHOT_FORMAT || raw.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    return fail("UNSUPPORTED_SNAPSHOT", "Repository snapshot uses an unsupported format or schema version.");
  }
  if (
    !Number.isSafeInteger(raw.fileCount)
    || !Number.isSafeInteger(raw.contentBytes)
    || (raw.fileCount as number) < 1
    || (raw.contentBytes as number) < 1
    || (raw.fileCount as number) > REPOSITORY_SNAPSHOT_MAX_FILES
    || (raw.contentBytes as number) > REPOSITORY_SNAPSHOT_MAX_CONTENT_BYTES
  ) {
    return fail("LIMIT_EXCEEDED", "Repository snapshot manifest exceeds the supported file or byte limits.");
  }
  if (!Array.isArray(raw.files) || raw.files.length !== raw.fileCount) {
    return fail("INVALID_SNAPSHOT", "Repository snapshot file count does not match its manifest.");
  }

  const files = raw.files.map((entry) => {
    if (
      !isPlainObject(entry)
      || !hasExactlyKeys(entry, ["path", "byteLength"])
      || typeof entry.path !== "string"
      || !Number.isSafeInteger(entry.byteLength)
      || (entry.byteLength as number) < 0
      || (entry.byteLength as number) > REPOSITORY_SNAPSHOT_MAX_FILE_BYTES
    ) {
      return fail("INVALID_SNAPSHOT", "Repository snapshot contains an invalid file entry.");
    }
    return {
      path: normalizeRepositorySnapshotPath(entry.path),
      byteLength: entry.byteLength as number,
    };
  });
  const sorted = [...files].sort((left, right) => left.path.localeCompare(right.path));
  if (files.some((entry, index) => entry.path !== sorted[index].path)) {
    return fail("INVALID_SNAPSHOT", "Repository snapshot file entries are not sorted.");
  }

  const contentBytes = files.reduce((total, file) => total + file.byteLength, 0);
  if (!Number.isSafeInteger(contentBytes) || contentBytes !== raw.contentBytes) {
    return fail("INVALID_SNAPSHOT", "Repository snapshot content size does not match its manifest.");
  }

  return {
    format: SNAPSHOT_FORMAT,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fileCount: raw.fileCount as number,
    contentBytes: raw.contentBytes as number,
    files,
  };
}

export function createRepositorySnapshot(
  sourceFiles: readonly RepositorySnapshotSourceFile[],
): SerializedRepositorySnapshot {
  const prepared = prepareRepositorySnapshotFiles(sourceFiles, true);
  const { files: normalized, contentBytes, excludedTransientPaths } = prepared;

  const manifest: RepositorySnapshotManifest = {
    format: SNAPSHOT_FORMAT,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fileCount: prepared.fileCount,
    contentBytes,
    files: normalized.map((file) => ({ path: file.path, byteLength: file.content.byteLength })),
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (manifestBytes.byteLength > REPOSITORY_SNAPSHOT_MAX_MANIFEST_BYTES) {
    fail("LIMIT_EXCEEDED", "Repository snapshot manifest is too large.");
  }
  const archiveBytes = SNAPSHOT_HEADER_BYTES + manifestBytes.byteLength + contentBytes;
  if (archiveBytes > REPOSITORY_SNAPSHOT_MAX_ARCHIVE_BYTES) {
    fail("LIMIT_EXCEEDED", "Repository snapshot is too large.");
  }

  const bytes = new Uint8Array(archiveBytes);
  bytes.set(SNAPSHOT_MAGIC, 0);
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .setUint32(SNAPSHOT_MAGIC.byteLength, manifestBytes.byteLength, false);
  bytes.set(manifestBytes, SNAPSHOT_HEADER_BYTES);
  let offset = SNAPSHOT_HEADER_BYTES + manifestBytes.byteLength;
  for (const file of normalized) {
    bytes.set(file.content, offset);
    offset += file.content.byteLength;
  }

  return {
    bytes,
    fileCount: prepared.fileCount,
    contentBytes,
    excludedTransientPaths: excludedTransientPaths.sort((left, right) => left.localeCompare(right)),
    format: SNAPSHOT_FORMAT,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  };
}

export function readRepositorySnapshot(bytes: Uint8Array): ParsedRepositorySnapshot {
  if (!(bytes instanceof Uint8Array)) fail("INVALID_SNAPSHOT", "Repository snapshot must be binary data.");
  if (bytes.byteLength < SNAPSHOT_HEADER_BYTES || bytes.byteLength > REPOSITORY_SNAPSHOT_MAX_ARCHIVE_BYTES) {
    fail("LIMIT_EXCEEDED", "Repository snapshot size is outside the supported range.");
  }
  for (let index = 0; index < SNAPSHOT_MAGIC.byteLength; index++) {
    if (bytes[index] !== SNAPSHOT_MAGIC[index]) {
      fail("INVALID_SNAPSHOT", "Repository snapshot magic header is invalid.");
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const manifestByteLength = view.getUint32(SNAPSHOT_MAGIC.byteLength, false);
  if (
    manifestByteLength < 1
    || manifestByteLength > REPOSITORY_SNAPSHOT_MAX_MANIFEST_BYTES
    || SNAPSHOT_HEADER_BYTES + manifestByteLength > bytes.byteLength
  ) {
    fail("LIMIT_EXCEEDED", "Repository snapshot manifest length is invalid.");
  }
  const manifestSource = decodeUtf8(
    bytes.subarray(SNAPSHOT_HEADER_BYTES, SNAPSHOT_HEADER_BYTES + manifestByteLength),
    "Repository snapshot manifest",
  );
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(manifestSource);
  } catch {
    return fail("INVALID_SNAPSHOT", "Repository snapshot manifest is not valid JSON.");
  }
  const manifest = parseManifest(rawManifest);
  const expectedBytes = SNAPSHOT_HEADER_BYTES + manifestByteLength + manifest.contentBytes;
  if (expectedBytes !== bytes.byteLength) {
    fail("INVALID_SNAPSHOT", "Repository snapshot payload length does not match its manifest.");
  }

  let offset = SNAPSHOT_HEADER_BYTES + manifestByteLength;
  const files = manifest.files.map((file) => {
    const content = bytes.subarray(offset, offset + file.byteLength);
    offset += file.byteLength;
    return { path: file.path, content };
  });
  assertSafeFiles(files);

  return {
    files,
    fileCount: manifest.fileCount,
    contentBytes: manifest.contentBytes,
    format: manifest.format,
    schemaVersion: manifest.schemaVersion,
  };
}
