import {
  add,
  branch,
  checkout,
  getConfig,
  clone,
  commit,
  currentBranch,
  fetch as gitFetch,
  init,
  listBranches,
  log,
  remove,
  resolveRef,
  pull,
  push,
  statusMatrix,
  setConfig,
  type FsClient,
  type StatusRow,
} from "isomorphic-git";
import http from "isomorphic-git/http/web";
import {
  createRepositorySnapshot,
  isTransientGitSnapshotPath,
  normalizeRepositorySnapshotPath,
  readRepositorySnapshot,
  validateRepositorySnapshotFiles,
  type RepositorySnapshotSourceFile,
  type SerializedRepositorySnapshot,
} from "@/lib/projects/repository-snapshot";
export type {
  RepositorySnapshotSourceFile,
  SerializedRepositorySnapshot,
} from "@/lib/projects/repository-snapshot";

const DEFAULT_DIRECTORY = "/workspace";
const DEFAULT_DATABASE_NAME = "ftc-simulator-git-v1";
const DEFAULT_BRANCH = "main";
const DEFAULT_LOG_DEPTH = 20;
const MAX_EDITABLE_TEXT_BYTES = 2 * 1024 * 1024;
const DEFAULT_AUTHOR = {
  name: "FTC Simulator",
  email: "simulator@ftcsim.local",
} as const;

export type GitChangeKind = "added" | "deleted" | "modified" | "unmodified" | "untracked";

export type GitFileChange = {
  path: string;
  kind: GitChangeKind;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  deleted: boolean;
  /** The familiar two-column porcelain status, such as `M `, ` M`, `??`, or `D `. */
  shortStatus: string;
};

export type GitCommitSummary = {
  oid: string;
  shortOid: string;
  message: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  parentOids: string[];
};

export type GitStatusSnapshot = {
  branch: string;
  branches: string[];
  headOid: string | null;
  dirty: boolean;
  changes: GitFileChange[];
  commits: GitCommitSummary[];
};

export type GitWorkspaceState = {
  files: Record<string, string>;
  binaryFiles: Record<string, Uint8Array>;
  entries: GitWorktreeEntry[];
  snapshot: GitStatusSnapshot;
};

export type GitWorktreeEntry = {
  path: string;
  byteLength: number;
  kind: "text" | "binary";
};

export type GitCredential = { token: string } | { session: true };

export type GitCloneRequest = {
  url: string;
  corsProxy: string;
  credential?: GitCredential;
  depth?: number;
};

export type BrowserGitEngineOptions = {
  /** IndexedDB namespace. Bump deliberately when the persisted repository format changes. */
  databaseName?: string;
  directory?: string;
  defaultBranch?: string;
  initialCommitMessage?: string;
  author?: {
    name: string;
    email: string;
  };
  logDepth?: number;
};

export interface BrowserGitEngine {
  /**
   * Opens the persisted repository, or creates it exactly once from `initialFiles`.
   * Existing IndexedDB contents always win over newly supplied sample files.
   */
  initialize(initialFiles: Record<string, string | Uint8Array>): Promise<GitWorkspaceState>;
  cloneFromRemote(request: GitCloneRequest): Promise<GitWorkspaceState>;
  configureRemote(request: { url: string; corsProxy: string }): Promise<GitWorkspaceState>;
  getState(): Promise<GitWorkspaceState>;
  status(): Promise<GitStatusSnapshot>;
  writeFile(path: string, content: string | Uint8Array): Promise<GitStatusSnapshot>;
  deleteFile(path: string): Promise<GitStatusSnapshot>;
  stageAllAndCommit(message: string): Promise<GitWorkspaceState>;
  createBranch(name: string): Promise<GitStatusSnapshot>;
  checkoutBranch(name: string): Promise<GitWorkspaceState>;
  discardWorkingChanges(): Promise<GitWorkspaceState>;
  fetchRemote(credential?: GitCredential): Promise<GitWorkspaceState>;
  pullRemote(credential?: GitCredential): Promise<GitWorkspaceState>;
  pushRemote(credential?: GitCredential): Promise<GitWorkspaceState>;
  readAllFiles(): Promise<Record<string, string | Uint8Array>>;
  /**
   * Serializes the complete repository, including `.git`, binary files, branch
   * refs, the index, and the dirty worktree. Short-lived Git lock files are
   * excluded and credential-bearing Git configuration is rejected.
   */
  exportRepositorySnapshot(): Promise<SerializedRepositorySnapshot>;
  /**
   * Returns sorted binary entries for content-addressed cloud synchronization
   * without first assembling a monolithic archive.
   */
  exportRepositoryFiles(): Promise<RepositorySnapshotSourceFile[]>;
}

/** Clears a failed project's LightningFS contents before its catalog tombstone is removed. */
export async function destroyBrowserGitDatabase(databaseName: string): Promise<void> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    throw new BrowserGitError("BROWSER_REQUIRED", "The Git workspace can only be removed in a browser.");
  }
  // LightningFS 4.6.2 wipes by stealing its mutex. Wait for the previous
  // instance to finish and release it, avoiding an unhandled stolen-lock error.
  if (navigator.locks) {
    await navigator.locks.request(`${databaseName}_lock`, { signal: AbortSignal.timeout(5_000) }, () => undefined);
  }
  const lightningFsPackage = await import("@isomorphic-git/lightning-fs");
  const LightningFS = lightningFsPackage.default;
  const fileSystem = new LightningFS(databaseName, { wipe: true });
  await fileSystem.promises.stat("/");
  await fileSystem.promises.flush();
}

export type BranchNameValidation =
  | { valid: true; name: string }
  | { valid: false; reason: string };

export class BrowserGitError extends Error {
  constructor(
    public readonly code:
      | "BROWSER_REQUIRED"
      | "INVALID_BRANCH"
      | "INVALID_COMMIT_MESSAGE"
      | "INVALID_PATH"
      | "NOT_INITIALIZED"
      | "NOTHING_TO_COMMIT"
      | "REPOSITORY_CORRUPT"
      | "RESTORE_TARGET_NOT_EMPTY"
      | "WORKTREE_DIRTY"
      | "REMOTE_FAILED"
      | "REMOTE_NOT_CONFIGURED",
    message: string,
  ) {
    super(message);
    this.name = "BrowserGitError";
  }
}

type LightningFileSystem = {
  promises: {
    mkdir(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    readFile(path: string): Promise<Uint8Array>;
    readFile(path: string, encoding: "utf8"): Promise<string>;
    stat(path: string): Promise<{
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
    unlink(path: string): Promise<void>;
    rmdir(path: string): Promise<void>;
    writeFile(path: string, content: string | Uint8Array, encoding?: string): Promise<void>;
    flush(): Promise<void>;
  };
};

export interface RestoreBrowserGitRepositorySnapshotOptions {
  /** A fresh LightningFS namespace. Existing root entries are never overwritten. */
  databaseName: string;
  snapshot: Uint8Array;
  directory?: string;
}

export interface RestoreBrowserGitRepositoryFilesOptions {
  /** A fresh LightningFS namespace. Existing root entries are never overwritten. */
  databaseName: string;
  files: readonly RepositorySnapshotSourceFile[];
  directory?: string;
}

export interface RestoredBrowserGitRepository {
  databaseName: string;
  directory: string;
  fileCount: number;
  contentBytes: number;
}

type NormalizedOptions = Required<
  Omit<BrowserGitEngineOptions, "author">
> & {
  author: {
    name: string;
    email: string;
  };
};

function shortIndexStatus(head: number, stage: number): string {
  if (head === stage) return " ";
  if (head === 0) return "A";
  if (stage === 0) return "D";
  return "M";
}

function shortWorktreeStatus(head: number, workdir: number, stage: number): string {
  if (workdir === stage) return " ";
  if (workdir === 0) return "D";
  if (head === 0 && stage === 0) return "?";
  return "M";
}

/** Convert isomorphic-git's HEAD/workdir/index tuple into UI-ready Git state. */
export function mapStatusRow(row: StatusRow): GitFileChange {
  const [path, head, workdir, stage] = row;
  const untracked = head === 0 && workdir === 2 && stage === 0;
  const deleted = workdir === 0;
  const staged = head !== stage;
  const unstaged = workdir !== stage;

  let kind: GitChangeKind = "unmodified";
  if (untracked) kind = "untracked";
  else if (deleted) kind = "deleted";
  else if (head === 0) kind = "added";
  else if (staged || unstaged) kind = "modified";

  return {
    path,
    kind,
    staged,
    unstaged,
    untracked,
    deleted,
    shortStatus: untracked
      ? "??"
      : `${shortIndexStatus(head, stage)}${shortWorktreeStatus(head, workdir, stage)}`,
  };
}

/** A strict, browser-safe subset of `git check-ref-format --branch`. */
export function validateBranchName(name: string): BranchNameValidation {
  if (!name) return { valid: false, reason: "Branch name cannot be empty." };
  if (name !== name.trim()) {
    return { valid: false, reason: "Branch name cannot begin or end with whitespace." };
  }
  if (name === "@") return { valid: false, reason: "Branch name cannot be @." };
  if (name.startsWith("-") || name.startsWith("/") || name.endsWith("/")) {
    return { valid: false, reason: "Branch name has an invalid leading or trailing character." };
  }
  if (name.includes("..") || name.includes("@{") || name.includes("//")) {
    return { valid: false, reason: "Branch name contains an invalid sequence." };
  }
  if (/[\u0000-\u0020\u007f~^:?*[\\]/u.test(name)) {
    return { valid: false, reason: "Branch name contains a character Git does not allow." };
  }

  const invalidComponent = name
    .split("/")
    .some((component) => component.startsWith(".") || component.endsWith(".") || component.endsWith(".lock"));
  if (invalidComponent) {
    return { valid: false, reason: "A branch path segment cannot start or end with a dot or end in .lock." };
  }

  return { valid: true, name };
}

function normalizeProjectPath(path: string): string {
  if (
    !path ||
    path !== path.trim() ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    path.includes("\u0000")
  ) {
    throw new BrowserGitError("INVALID_PATH", `Invalid project path: ${JSON.stringify(path)}`);
  }

  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part === ".git")) {
    throw new BrowserGitError("INVALID_PATH", `Invalid project path: ${JSON.stringify(path)}`);
  }

  return parts.join("/");
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && /ENOENT/u.test(`${"code" in error ? error.code : ""} ${error.message}`);
}

function joinAbsolute(root: string, relativePath: string): string {
  return `${root.replace(/\/$/u, "")}/${relativePath}`;
}

function normalizeRepositoryDirectory(directory: string): string {
  if (
    !directory
    || directory === "/"
    || !directory.startsWith("/")
    || directory.endsWith("/")
    || directory.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(directory)
  ) {
    throw new BrowserGitError("INVALID_PATH", "Repository directory must be a normalized absolute non-root path.");
  }
  const parts = directory.slice(1).split("/");
  if (parts.some((part) => !part || part !== part.trim() || part === "." || part === "..")) {
    throw new BrowserGitError("INVALID_PATH", "Repository directory contains an unsafe path segment.");
  }
  return `/${parts.join("/")}`;
}

async function lightningPathExists(
  fileSystem: LightningFileSystem,
  path: string,
): Promise<boolean> {
  try {
    await fileSystem.promises.stat(path);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

async function ensureLightningDirectory(
  fileSystem: LightningFileSystem,
  path: string,
): Promise<void> {
  if (path === "/" || await lightningPathExists(fileSystem, path)) return;
  const parent = path.slice(0, path.lastIndexOf("/")) || "/";
  await ensureLightningDirectory(fileSystem, parent);
  try {
    await fileSystem.promises.mkdir(path);
  } catch (error) {
    if (!/EEXIST/u.test(error instanceof Error ? error.message : String(error))) throw error;
  }
}

async function restoreValidatedBrowserGitRepository(
  options: {
    databaseName: string;
    directory?: string;
    files: readonly RepositorySnapshotSourceFile[];
    fileCount: number;
    contentBytes: number;
  },
): Promise<RestoredBrowserGitRepository> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    throw new BrowserGitError("BROWSER_REQUIRED", "Git repository snapshots can only be restored in a browser.");
  }
  const databaseName = options.databaseName.trim();
  if (
    !databaseName
    || databaseName !== options.databaseName
    || databaseName.length > 240
    || /[\u0000-\u001f\u007f]/u.test(databaseName)
  ) {
    throw new BrowserGitError("INVALID_PATH", "LightningFS snapshot namespace is invalid.");
  }
  const directory = normalizeRepositoryDirectory(options.directory ?? DEFAULT_DIRECTORY);

  const lightningFsPackage = await import("@isomorphic-git/lightning-fs");
  const LightningFS = lightningFsPackage.default;
  const fileSystem = new LightningFS(databaseName) as unknown as LightningFileSystem;
  await fileSystem.promises.stat("/");
  const existingRootEntries = await fileSystem.promises.readdir("/");
  if (existingRootEntries.length > 0) {
    throw new BrowserGitError(
      "RESTORE_TARGET_NOT_EMPTY",
      "The repository snapshot target already contains data and was left untouched.",
    );
  }

  await ensureLightningDirectory(fileSystem, directory);
  for (const file of options.files) {
    const path = normalizeRepositorySnapshotPath(file.path);
    const absolutePath = joinAbsolute(directory, path);
    const parent = absolutePath.slice(0, absolutePath.lastIndexOf("/"));
    await ensureLightningDirectory(fileSystem, parent);
    await fileSystem.promises.writeFile(absolutePath, file.content);
  }
  await fileSystem.promises.flush();

  return {
    databaseName,
    directory,
    fileCount: options.fileCount,
    contentBytes: options.contentBytes,
  };
}

/**
 * Restores exact raw repository files into a new LightningFS namespace.
 *
 * This is the preferred content-addressable cloud-sync boundary. The target is
 * checked before the first write and is never wiped or merged.
 */
export async function restoreBrowserGitRepositoryFiles(
  options: RestoreBrowserGitRepositoryFilesOptions,
): Promise<RestoredBrowserGitRepository> {
  const validated = validateRepositorySnapshotFiles(options.files);
  return restoreValidatedBrowserGitRepository({
    databaseName: options.databaseName,
    directory: options.directory,
    files: validated.files,
    fileCount: validated.fileCount,
    contentBytes: validated.contentBytes,
  });
}

/**
 * Restores an exact serialized repository snapshot into a new LightningFS
 * namespace. Callers should switch catalog namespaces only after this function
 * and `BrowserGitEngine.initialize({})` both succeed.
 */
export async function restoreBrowserGitRepositorySnapshot(
  options: RestoreBrowserGitRepositorySnapshotOptions,
): Promise<RestoredBrowserGitRepository> {
  const parsed = readRepositorySnapshot(options.snapshot);
  return restoreValidatedBrowserGitRepository({
    databaseName: options.databaseName,
    directory: options.directory,
    files: parsed.files,
    fileCount: parsed.fileCount,
    contentBytes: parsed.contentBytes,
  });
}

export function decodeEditableGitText(bytes: Uint8Array): string | null {
  if (bytes.byteLength > MAX_EDITABLE_TEXT_BYTES || bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function credentialHeaders(credential?: GitCredential): Record<string, string> | undefined {
  if (credential && "session" in credential && credential.session) {
    return { "X-FTC-GitHub-Session": "1" };
  }
  if (!credential || !("token" in credential)) return undefined;
  const token = credential?.token.trim();
  if (!token) return undefined;
  return { Authorization: `Basic ${btoa(`x-access-token:${token}`)}` };
}

/** Validates the publish origin and its same-site GitHub proxy before saving either. */
export function validateGitHubRemoteConfiguration(
  request: { url: string; corsProxy: string },
  siteOrigin: string,
): { url: string; corsProxy: string } {
  const url = request.url.trim();
  const corsProxy = request.corsProxy.trim();
  if (!url || !corsProxy || /[\u0000-\u001f\u007f]/u.test(url + corsProxy)) {
    throw new BrowserGitError("REMOTE_FAILED", "A valid repository URL and CORS proxy are required.");
  }
  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch {
    throw new BrowserGitError("REMOTE_FAILED", "Repository URL is invalid.");
  }
  const repositoryPath = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/u.test(parsedUrl.pathname);
  if (
    url !== parsedUrl.href
    || parsedUrl.protocol !== "https:"
    || parsedUrl.hostname !== "github.com"
    || parsedUrl.port
    || parsedUrl.username
    || parsedUrl.password
    || parsedUrl.search
    || parsedUrl.hash
    || !repositoryPath
  ) {
    throw new BrowserGitError("REMOTE_FAILED", "Remote must be a canonical https://github.com/owner/repository URL without credentials, query, or fragment.");
  }
  let proxyUrl: URL;
  try { proxyUrl = new URL(corsProxy); } catch {
    throw new BrowserGitError("REMOTE_FAILED", "CORS proxy URL is invalid.");
  }
  if (
    corsProxy !== proxyUrl.href
    || proxyUrl.origin !== siteOrigin
    || proxyUrl.pathname !== "/api/git/github"
    || proxyUrl.username
    || proxyUrl.password
    || proxyUrl.search
    || proxyUrl.hash
  ) {
    throw new BrowserGitError("REMOTE_FAILED", "CORS proxy must be this site's /api/git/github endpoint without credentials, query, or fragment.");
  }
  return { url, corsProxy };
}

export function createBrowserGitEngine(
  options: BrowserGitEngineOptions = {},
): BrowserGitEngine {
  const config: NormalizedOptions = {
    databaseName: options.databaseName ?? DEFAULT_DATABASE_NAME,
    directory: options.directory ?? DEFAULT_DIRECTORY,
    defaultBranch: options.defaultBranch ?? DEFAULT_BRANCH,
    initialCommitMessage: options.initialCommitMessage ?? "Initial FTC project",
    author: options.author ?? DEFAULT_AUTHOR,
    logDepth: options.logDepth ?? DEFAULT_LOG_DEPTH,
  };

  const branchValidation = validateBranchName(config.defaultBranch);
  if (!branchValidation.valid) {
    throw new BrowserGitError(
      "INVALID_BRANCH",
      `Invalid default branch: ${branchValidation.reason}`,
    );
  }
  normalizeRepositoryDirectory(config.directory);
  if (!config.initialCommitMessage.trim()) {
    throw new BrowserGitError(
      "INVALID_COMMIT_MESSAGE",
      "Initial commit message cannot be empty.",
    );
  }

  let fs: LightningFileSystem | null = null;
  let initialized = false;
  let operationTail: Promise<void> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function requireFileSystem(): LightningFileSystem {
    if (!fs || !initialized) {
      throw new BrowserGitError("NOT_INITIALIZED", "Initialize the browser Git repository first.");
    }
    return fs;
  }

  async function currentSiteProxy(fileSystem: LightningFileSystem): Promise<string> {
    const url = await getConfig({ fs: asGitFileSystem(fileSystem), dir: config.directory, path: "remote.origin.url" });
    if (typeof url !== "string") throw new BrowserGitError("REMOTE_NOT_CONFIGURED", "Connect a GitHub repository first.");
    // Imported/cloud-restored Git config may name the previous site's proxy.
    // Never send credentials to a destination read from that configuration.
    return validateGitHubRemoteConfiguration({ url, corsProxy: `${window.location.origin}/api/git/github` }, window.location.origin).corsProxy;
  }

  function asGitFileSystem(fileSystem: LightningFileSystem): FsClient {
    return fileSystem as unknown as FsClient;
  }

  async function exists(fileSystem: LightningFileSystem, path: string): Promise<boolean> {
    try {
      await fileSystem.promises.stat(path);
      return true;
    } catch (error) {
      if (isMissingFile(error)) return false;
      throw error;
    }
  }

  async function ensureDirectory(fileSystem: LightningFileSystem, path: string): Promise<void> {
    if (path === "/" || (await exists(fileSystem, path))) return;
    const parent = path.slice(0, path.lastIndexOf("/")) || "/";
    await ensureDirectory(fileSystem, parent);
    try {
      await fileSystem.promises.mkdir(path);
    } catch (error) {
      if (!/EEXIST/u.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }

  async function writeWorkingFile(
    fileSystem: LightningFileSystem,
    path: string,
    content: string | Uint8Array,
  ): Promise<void> {
    const normalized = normalizeProjectPath(path);
    const absolutePath = joinAbsolute(config.directory, normalized);
    const parent = absolutePath.slice(0, absolutePath.lastIndexOf("/"));
    await ensureDirectory(fileSystem, parent);
    await fileSystem.promises.writeFile(absolutePath, content, typeof content === "string" ? "utf8" : undefined);
  }

  async function readWorkingTree(fileSystem: LightningFileSystem): Promise<{
    files: Record<string, string>;
    binaryFiles: Record<string, Uint8Array>;
    entries: GitWorktreeEntry[];
  }> {
    const files: Record<string, string> = {};
    const binaryFiles: Record<string, Uint8Array> = {};
    const entries: GitWorktreeEntry[] = [];

    async function visit(absoluteDirectory: string, relativeDirectory: string): Promise<void> {
      const names = (await fileSystem.promises.readdir(absoluteDirectory)).sort((a, b) =>
        a.localeCompare(b),
      );
      for (const name of names) {
        if (!relativeDirectory && name === ".git") continue;
        const absolutePath = `${absoluteDirectory}/${name}`;
        const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
        const stats = await fileSystem.promises.stat(absolutePath);
        if (stats.isDirectory()) await visit(absolutePath, relativePath);
        else if (stats.isFile()) {
          const bytes = await fileSystem.promises.readFile(absolutePath);
          const text = decodeEditableGitText(bytes);
          entries.push({
            path: relativePath,
            byteLength: bytes.byteLength,
            kind: text === null ? "binary" : "text",
          });
          if (text === null) binaryFiles[relativePath] = bytes;
          else files[relativePath] = text;
        }
      }
    }

    await visit(config.directory, "");
    return { files, binaryFiles, entries };
  }

  async function readCompleteRepository(
    fileSystem: LightningFileSystem,
  ): Promise<RepositorySnapshotSourceFile[]> {
    const files: RepositorySnapshotSourceFile[] = [];

    async function visit(absoluteDirectory: string, relativeDirectory: string): Promise<void> {
      const names = (await fileSystem.promises.readdir(absoluteDirectory)).sort((left, right) =>
        left.localeCompare(right),
      );
      for (const name of names) {
        const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
        const normalizedPath = normalizeRepositorySnapshotPath(relativePath);
        if (isTransientGitSnapshotPath(normalizedPath)) continue;
        const absolutePath = `${absoluteDirectory}/${name}`;
        const stats = await fileSystem.promises.stat(absolutePath);
        if (stats.isDirectory()) {
          await visit(absolutePath, normalizedPath);
        } else if (stats.isFile()) {
          files.push({
            path: normalizedPath,
            content: await fileSystem.promises.readFile(absolutePath),
          });
        } else {
          throw new BrowserGitError(
            "REPOSITORY_CORRUPT",
            `Repository snapshot cannot preserve unsupported filesystem entry ${normalizedPath}.`,
          );
        }
      }
    }

    await visit(config.directory, "");
    return validateRepositorySnapshotFiles(files).files;
  }

  async function snapshot(fileSystem: LightningFileSystem): Promise<GitStatusSnapshot> {
    const gitFs = asGitFileSystem(fileSystem);
    const activeBranch = await currentBranch({
      fs: gitFs,
      dir: config.directory,
      fullname: false,
    });
    const branches = (await listBranches({ fs: gitFs, dir: config.directory })).sort((a, b) =>
      a.localeCompare(b),
    );
    const rows = await statusMatrix({
      fs: gitFs,
      dir: config.directory,
      refresh: false,
    });
    const changes = rows.map(mapStatusRow).filter((change) => change.staged || change.unstaged);

    let headOid: string | null = null;
    let history: Awaited<ReturnType<typeof log>> = [];
    try {
      headOid = await resolveRef({ fs: gitFs, dir: config.directory, ref: "HEAD" });
      history = await log({
        fs: gitFs,
        dir: config.directory,
        ref: "HEAD",
        depth: config.logDepth,
      });
    } catch (error) {
      if (!/CouldNotFind|NotFound|ResolveRef|ENOENT/u.test(error instanceof Error ? `${error.name} ${error.message}` : String(error))) {
        throw error;
      }
    }

    return {
      branch: activeBranch ?? "HEAD",
      branches,
      headOid,
      dirty: changes.length > 0,
      changes,
      commits: history.map(({ oid, commit: commitObject }) => ({
        oid,
        shortOid: oid.slice(0, 7),
        message: commitObject.message.trimEnd(),
        authorName: commitObject.author.name,
        authorEmail: commitObject.author.email,
        authoredAt: new Date(commitObject.author.timestamp * 1_000).toISOString(),
        parentOids: [...commitObject.parent],
      })),
    };
  }

  async function state(fileSystem: LightningFileSystem): Promise<GitWorkspaceState> {
    const [worktree, currentSnapshot] = await Promise.all([
      readWorkingTree(fileSystem),
      snapshot(fileSystem),
    ]);
    return { ...worktree, snapshot: currentSnapshot };
  }

  async function flush(fileSystem: LightningFileSystem): Promise<void> {
    await fileSystem.promises.flush();
  }

  async function removeEmptyParents(
    fileSystem: LightningFileSystem,
    relativePath: string,
  ): Promise<void> {
    let parent = relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "";
    while (parent) {
      const absoluteParent = joinAbsolute(config.directory, parent);
      const names = await fileSystem.promises.readdir(absoluteParent);
      if (names.length > 0) return;
      await fileSystem.promises.rmdir(absoluteParent);
      parent = parent.includes("/") ? parent.slice(0, parent.lastIndexOf("/")) : "";
    }
  }

  return {
    initialize(initialFiles) {
      return serialize(async () => {
        if (initialized && fs) return state(fs);
        if (typeof window === "undefined" || typeof indexedDB === "undefined") {
          throw new BrowserGitError(
            "BROWSER_REQUIRED",
            "The Git workspace uses IndexedDB and can only be opened in a browser.",
          );
        }

        const lightningFsPackage = await import("@isomorphic-git/lightning-fs");
        const LightningFS = lightningFsPackage.default;
        const fileSystem = new LightningFS(config.databaseName) as unknown as LightningFileSystem;
        fs = fileSystem;

        const gitDirectory = `${config.directory}/.git`;
        const headPath = `${gitDirectory}/HEAD`;
        const workspaceExists = await exists(fileSystem, config.directory);
        const gitDirectoryExists = await exists(fileSystem, gitDirectory);
        const repositoryExists = await exists(fileSystem, headPath);
        if (gitDirectoryExists && !repositoryExists) {
          throw new BrowserGitError(
            "REPOSITORY_CORRUPT",
            "The persisted Git repository is missing .git/HEAD; it was left untouched.",
          );
        }
        if (!repositoryExists) {
          if (workspaceExists) {
            const persistedEntries = await fileSystem.promises.readdir(config.directory);
            if (persistedEntries.length > 0) {
              throw new BrowserGitError(
                "REPOSITORY_CORRUPT",
                "The persisted workspace contains files but no Git repository; it was left untouched.",
              );
            }
          }
          const entries = Object.entries(initialFiles)
            .map(([path, content]) => [normalizeProjectPath(path), content] as const)
            .sort(([left], [right]) => left.localeCompare(right));
          await ensureDirectory(fileSystem, config.directory);
          const gitFs = asGitFileSystem(fileSystem);
          await init({
            fs: gitFs,
            dir: config.directory,
            defaultBranch: config.defaultBranch,
          });

          const paths = entries.map(([path]) => path);
          for (const [path, content] of entries) await writeWorkingFile(fileSystem, path, content);
          if (paths.length > 0) {
            await add({ fs: gitFs, dir: config.directory, filepath: paths, parallel: false });
          }
          await commit({
            fs: gitFs,
            dir: config.directory,
            message: config.initialCommitMessage,
            author: config.author,
          });
          await flush(fileSystem);
        }

        initialized = true;
        return state(fileSystem);
      });
    },

    cloneFromRemote(request) {
      return serialize(async () => {
        if (initialized && fs) {
          throw new BrowserGitError("REMOTE_FAILED", "This project workspace already contains a Git repository.");
        }
        if (typeof window === "undefined" || typeof indexedDB === "undefined") {
          throw new BrowserGitError("BROWSER_REQUIRED", "GitHub projects can only be cloned in a browser.");
        }
        const lightningFsPackage = await import("@isomorphic-git/lightning-fs");
        const LightningFS = lightningFsPackage.default;
        const fileSystem = new LightningFS(config.databaseName) as unknown as LightningFileSystem;
        fs = fileSystem;
        await ensureDirectory(fileSystem, config.directory);
        const existing = await fileSystem.promises.readdir(config.directory);
        if (existing.length > 0) {
          throw new BrowserGitError("REPOSITORY_CORRUPT", "The interrupted clone contains data and was left untouched for recovery.");
        }
        try {
          await clone({
            fs: asGitFileSystem(fileSystem),
            http,
            dir: config.directory,
            url: request.url,
            corsProxy: request.corsProxy,
            depth: request.depth ?? 50,
            singleBranch: true,
            noTags: true,
            headers: credentialHeaders(request.credential),
            nonBlocking: true,
            batchSize: 100,
          });
          await setConfig({
            fs: asGitFileSystem(fileSystem), dir: config.directory,
            path: "http.corsProxy", value: request.corsProxy,
          });
          initialized = true;
          await flush(fileSystem);
          return state(fileSystem);
        } catch (cause) {
          throw new BrowserGitError(
            "REMOTE_FAILED",
            cause instanceof Error ? cause.message : "GitHub could not clone this repository.",
          );
        }
      });
    },

    configureRemote(request) {
      return serialize(async () => {
        const fileSystem = requireFileSystem();
        const gitFs = asGitFileSystem(fileSystem);
        const { url, corsProxy } = validateGitHubRemoteConfiguration(request, window.location.origin);
        const origin = await getConfig({ fs: gitFs, dir: config.directory, path: "remote.origin.url" });
        if (typeof origin === "string" && origin !== url) {
          throw new BrowserGitError("REMOTE_FAILED", "This project already has a different origin configured.");
        }
        const activeBranch = await currentBranch({ fs: gitFs, dir: config.directory, fullname: false });
        if (!activeBranch) {
          throw new BrowserGitError("REMOTE_FAILED", "A remote can only be configured on a named branch.");
        }
        await setConfig({ fs: gitFs, dir: config.directory, path: "remote.origin.url", value: url });
        await setConfig({ fs: gitFs, dir: config.directory, path: "remote.origin.fetch", value: "+refs/heads/*:refs/remotes/origin/*" });
        await setConfig({ fs: gitFs, dir: config.directory, path: `branch.${activeBranch}.remote`, value: "origin" });
        await setConfig({ fs: gitFs, dir: config.directory, path: `branch.${activeBranch}.merge`, value: `refs/heads/${activeBranch}` });
        await setConfig({ fs: gitFs, dir: config.directory, path: "http.corsProxy", value: corsProxy });
        await flush(fileSystem);
        return state(fileSystem);
      });
    },

    getState() {
      return serialize(async () => state(requireFileSystem()));
    },

    status() {
      return serialize(async () => snapshot(requireFileSystem()));
    },

    writeFile(path, content) {
      return serialize(async () => {
        const fileSystem = requireFileSystem();
        await writeWorkingFile(fileSystem, path, content);
        await flush(fileSystem);
        return snapshot(fileSystem);
      });
    },

    deleteFile(path) {
      return serialize(async () => {
        const fileSystem = requireFileSystem();
        const normalized = normalizeProjectPath(path);
        const absolutePath = joinAbsolute(config.directory, normalized);
        try {
          await fileSystem.promises.unlink(absolutePath);
          await removeEmptyParents(fileSystem, normalized);
        } catch (error) {
          if (!isMissingFile(error)) throw error;
        }
        await flush(fileSystem);
        return snapshot(fileSystem);
      });
    },

    stageAllAndCommit(message) {
      return serialize(async () => {
        const trimmedMessage = message.trim();
        if (!trimmedMessage) {
          throw new BrowserGitError("INVALID_COMMIT_MESSAGE", "Commit message cannot be empty.");
        }

        const fileSystem = requireFileSystem();
        const gitFs = asGitFileSystem(fileSystem);
        const rows = await statusMatrix({
          fs: gitFs,
          dir: config.directory,
          refresh: false,
        });
        const changedRows = rows.filter(([, head, workdir, stage]) => head !== stage || workdir !== stage);
        if (changedRows.length === 0) {
          throw new BrowserGitError("NOTHING_TO_COMMIT", "There are no changes to commit.");
        }

        for (const [path, , workdir] of changedRows) {
          if (workdir === 0) await remove({ fs: gitFs, dir: config.directory, filepath: path });
          else await add({ fs: gitFs, dir: config.directory, filepath: path });
        }
        await commit({
          fs: gitFs,
          dir: config.directory,
          message: trimmedMessage,
          author: config.author,
        });
        await flush(fileSystem);
        return state(fileSystem);
      });
    },

    createBranch(name) {
      return serialize(async () => {
        const validation = validateBranchName(name);
        if (!validation.valid) {
          throw new BrowserGitError("INVALID_BRANCH", validation.reason);
        }
        const fileSystem = requireFileSystem();
        await branch({
          fs: asGitFileSystem(fileSystem),
          dir: config.directory,
          ref: validation.name,
          checkout: false,
        });
        await flush(fileSystem);
        return snapshot(fileSystem);
      });
    },

    checkoutBranch(name) {
      return serialize(async () => {
        const validation = validateBranchName(name);
        if (!validation.valid) {
          throw new BrowserGitError("INVALID_BRANCH", validation.reason);
        }

        const fileSystem = requireFileSystem();
        const gitFs = asGitFileSystem(fileSystem);
        const currentStatus = await snapshot(fileSystem);
        if (currentStatus.dirty) {
          throw new BrowserGitError(
            "WORKTREE_DIRTY",
            "Commit or discard working-tree changes before switching branches.",
          );
        }
        const branches = await listBranches({ fs: gitFs, dir: config.directory });
        if (!branches.includes(validation.name)) {
          throw new BrowserGitError("INVALID_BRANCH", `Branch ${validation.name} does not exist.`);
        }

        await checkout({
          fs: gitFs,
          dir: config.directory,
          ref: validation.name,
          force: false,
          nonBlocking: true,
        });
        await flush(fileSystem);
        return state(fileSystem);
      });
    },

    discardWorkingChanges() {
      return serialize(async () => {
        const fileSystem = requireFileSystem();
        const gitFs = asGitFileSystem(fileSystem);
        const activeBranch = await currentBranch({ fs: gitFs, dir: config.directory });
        if (!activeBranch) {
          throw new BrowserGitError("INVALID_BRANCH", "Cannot reset a detached HEAD.");
        }

        const rows = await statusMatrix({
          fs: gitFs,
          dir: config.directory,
          refresh: false,
        });
        for (const [path, head, workdir] of rows) {
          if (head === 0 && workdir !== 0) {
            const absolutePath = joinAbsolute(config.directory, path);
            try {
              await fileSystem.promises.unlink(absolutePath);
              await removeEmptyParents(fileSystem, path);
            } catch (error) {
              if (!isMissingFile(error)) throw error;
            }
          }
        }

        await checkout({
          fs: gitFs,
          dir: config.directory,
          ref: activeBranch,
          force: true,
          nonBlocking: true,
        });
        await flush(fileSystem);
        return state(fileSystem);
      });
    },

    fetchRemote(credential) {
      return serialize(async () => {
        const fileSystem = requireFileSystem();
        try {
          const corsProxy = await currentSiteProxy(fileSystem);
          await gitFetch({
            fs: asGitFileSystem(fileSystem),
            http,
            dir: config.directory,
            remote: "origin",
            corsProxy,
            singleBranch: true,
            tags: false,
            prune: true,
            headers: credentialHeaders(credential),
          });
          await flush(fileSystem);
          return state(fileSystem);
        } catch (cause) {
          throw new BrowserGitError("REMOTE_FAILED", cause instanceof Error ? cause.message : "Fetch failed.");
        }
      });
    },

    pullRemote(credential) {
      return serialize(async () => {
        const fileSystem = requireFileSystem();
        if ((await snapshot(fileSystem)).dirty) {
          throw new BrowserGitError("WORKTREE_DIRTY", "Commit or discard local changes before pulling from GitHub.");
        }
        try {
          const corsProxy = await currentSiteProxy(fileSystem);
          await pull({
            fs: asGitFileSystem(fileSystem),
            http,
            dir: config.directory,
            remote: "origin",
            corsProxy,
            singleBranch: true,
            fastForwardOnly: true,
            author: config.author,
            headers: credentialHeaders(credential),
          });
          await flush(fileSystem);
          return state(fileSystem);
        } catch (cause) {
          throw new BrowserGitError("REMOTE_FAILED", cause instanceof Error ? cause.message : "Pull failed.");
        }
      });
    },

    pushRemote(credential) {
      return serialize(async () => {
        const fileSystem = requireFileSystem();
        try {
          const corsProxy = await currentSiteProxy(fileSystem);
          const result = await push({
            fs: asGitFileSystem(fileSystem),
            http,
            dir: config.directory,
            remote: "origin",
            corsProxy,
            headers: credentialHeaders(credential),
          });
          if (!result.ok) {
            throw new Error(result.error || "GitHub rejected the push update.");
          }
          await flush(fileSystem);
          return state(fileSystem);
        } catch (cause) {
          throw new BrowserGitError("REMOTE_FAILED", cause instanceof Error ? cause.message : "Push failed.");
        }
      });
    },

    readAllFiles() {
      return serialize(async () => {
        const worktree = await readWorkingTree(requireFileSystem());
        return { ...worktree.files, ...worktree.binaryFiles };
      });
    },

    exportRepositoryFiles() {
      return serialize(async () => {
        const fileSystem = requireFileSystem();
        await flush(fileSystem);
        return readCompleteRepository(fileSystem);
      });
    },

    exportRepositorySnapshot() {
      return serialize(async () => {
        const fileSystem = requireFileSystem();
        await flush(fileSystem);
        return createRepositorySnapshot(await readCompleteRepository(fileSystem));
      });
    },
  };
}
