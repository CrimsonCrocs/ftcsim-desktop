import { createBrowserGitEngine, destroyBrowserGitDatabase } from "@/lib/browser-git";
import { normalizeGitHubRepository } from "@/lib/github-repository";
import {
  deleteRecord,
  getAllRecords,
  getRecord,
  mutateProjectAndSession,
  mutateRecord,
  openCatalogDatabase,
  putProjectAndSession,
  putRecord,
} from "./idb";
import { generateProjectTemplate, generateProjectWithExamples, getStarterTemplate, isStarterTemplateId } from "./templates";
import { availableExamples } from "./examples";
import { duplicateProjectFiles, nextProjectCopyName } from "./duplication";
import { legacyBlocksProjectUpdates } from "./legacy-blocks-configuration";
import {
  DEFAULT_NEW_PROJECT,
  FTC_SDK_VERSION,
  KOTLIN_VERSION,
  LEGACY_WORKSPACE_DATABASE,
  PROJECT_CATALOG_DATABASE,
  type NewProjectInput,
  type GitHubImportInput,
  type ProjectCloudReceipt,
  type ProjectCatalog,
  type ProjectCloudState,
  type ProjectRecord,
  type ProjectSession,
  type ProjectWorkspace,
} from "./types";

const LEGACY_MIGRATION_KEY = "legacy-workspace-migration-v1";
const CLOUD_DEVICE_ID_KEY = "cloud-sync-device-id-v1";

type MetaRecord = { key: string; value: unknown };

export function projectBelongsToAccount(
  record: Pick<ProjectRecord, "ownerUserId">,
  accountId?: string,
): boolean {
  // Guest projects remain local and accessible after optional sign-in. Opening
  // one does not assign an owner or enable uploads.
  return !accountId || !record.ownerUserId || record.ownerUserId === accountId;
}

export function touchProjectLastOpenedAt(
  record: ProjectRecord,
  timestamp: string,
): ProjectRecord {
  return {
    ...record,
    lastOpenedAt: timestamp,
  };
}

function canonicalSessionValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSessionValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalSessionValue(entry)]),
  );
}

export function projectSessionsSemanticallyEqual(
  left: ProjectSession,
  right: ProjectSession,
): boolean {
  const leftSemantic = Object.fromEntries(
    Object.entries(left).filter(([key]) => key !== "updatedAt"),
  );
  const rightSemantic = Object.fromEntries(
    Object.entries(right).filter(([key]) => key !== "updatedAt"),
  );
  return JSON.stringify(canonicalSessionValue(leftSemantic))
    === JSON.stringify(canonicalSessionValue(rightSemantic));
}

export function prepareProjectSessionSave(
  record: ProjectRecord,
  session: ProjectSession,
  timestamp: string,
): { project: ProjectRecord; session: ProjectSession } {
  return {
    project: record.drivetrain === session.robotConfiguration.drivetrain
      ? record
      : {
          ...record,
          drivetrain: session.robotConfiguration.drivetrain,
          updatedAt: timestamp,
        },
    session: {
      ...session,
      schemaVersion: 1,
      updatedAt: timestamp,
    },
  };
}

const CLOUD_HASH_PATTERN = /^[a-f0-9]{64}$/u;

export function normalizeProjectCloudState(
  cloud: Partial<ProjectCloudState> | undefined,
): ProjectCloudState | undefined {
  if (!cloud) return undefined;
  const revision = Number.isSafeInteger(cloud.revision) && (cloud.revision as number) >= 0
    ? cloud.revision as number
    : 0;
  const manifestSha256 = typeof cloud.manifestSha256 === "string"
    && CLOUD_HASH_PATTERN.test(cloud.manifestSha256)
    ? cloud.manifestSha256
    : null;
  const hasAuthoritativeReceipt = revision > 0 && manifestSha256 !== null;
  const requestedStatus = cloud.status === "conflict" || cloud.status === "dirty"
    ? cloud.status
    : "synced";
  const conflictIsComplete = Number.isSafeInteger(cloud.conflictRevision)
    && (cloud.conflictRevision as number) > 0
    && typeof cloud.conflictManifestSha256 === "string"
    && CLOUD_HASH_PATTERN.test(cloud.conflictManifestSha256);
  const status = requestedStatus === "conflict" && !conflictIsComplete
    ? "dirty"
    : requestedStatus === "synced" && !hasAuthoritativeReceipt
      ? "dirty"
      : requestedStatus;
  const availabilityIsComplete = Number.isSafeInteger(cloud.availableRevision)
    && (cloud.availableRevision as number) > 0
    && typeof cloud.availableManifestSha256 === "string"
    && CLOUD_HASH_PATTERN.test(cloud.availableManifestSha256);
  return {
    revision: hasAuthoritativeReceipt ? revision : 0,
    manifestSha256: hasAuthoritativeReceipt ? manifestSha256 : null,
    status,
    lastSyncedAt: hasAuthoritativeReceipt && typeof cloud.lastSyncedAt === "string"
      ? cloud.lastSyncedAt
      : null,
    ...(hasAuthoritativeReceipt && typeof cloud.cloudUpdatedAt === "string"
      ? { cloudUpdatedAt: cloud.cloudUpdatedAt }
      : {}),
    ...(status === "conflict" && conflictIsComplete ? {
      conflictRevision: cloud.conflictRevision,
      conflictManifestSha256: cloud.conflictManifestSha256,
    } : {}),
    ...(availabilityIsComplete ? {
      availableRevision: cloud.availableRevision,
      availableManifestSha256: cloud.availableManifestSha256,
      ...(typeof cloud.availableUpdatedAt === "string"
        ? { availableUpdatedAt: cloud.availableUpdatedAt }
        : {}),
    } : {}),
    localRevision: Number.isSafeInteger(cloud.localRevision) && (cloud.localRevision as number) >= 0
      ? cloud.localRevision
      : 0,
  };
}

function normalizeProjectRecord(record: ProjectRecord): ProjectRecord {
  const cloud = normalizeProjectCloudState(record.cloud);
  const cloudSyncEnabled = record.cloudSyncEnabled ?? Boolean(cloud);
  if (
    JSON.stringify(cloud) === JSON.stringify(record.cloud)
    && cloudSyncEnabled === record.cloudSyncEnabled
  ) return record;
  return { ...record, cloud, cloudSyncEnabled };
}

export function markProjectCloudDirty(
  record: ProjectRecord,
  timestamp: string,
): ProjectRecord {
  if (!record.cloudSyncEnabled) return record;
  return {
    ...record,
    updatedAt: timestamp,
    cloud: {
      revision: record.cloud?.revision ?? 0,
      manifestSha256: record.cloud?.manifestSha256 ?? null,
      status: record.cloud?.status === "conflict" ? "conflict" : "dirty",
      lastSyncedAt: record.cloud?.lastSyncedAt ?? null,
      cloudUpdatedAt: record.cloud?.cloudUpdatedAt,
      conflictRevision: record.cloud?.conflictRevision,
      conflictManifestSha256: record.cloud?.conflictManifestSha256,
      availableRevision: record.cloud?.availableRevision,
      availableManifestSha256: record.cloud?.availableManifestSha256,
      availableUpdatedAt: record.cloud?.availableUpdatedAt,
      localRevision: (record.cloud?.localRevision ?? 0) + 1,
    },
  };
}

export function enableProjectCloudSync(
  record: ProjectRecord,
  accountId: string,
  timestamp: string,
): ProjectRecord {
  const ownerUserId = accountId.trim();
  if (!ownerUserId) {
    throw new ProjectCatalogError("INVALID_INPUT", "Sign in with Google before enabling project sync.");
  }
  if (record.ownerUserId && record.ownerUserId !== ownerUserId) {
    throw new ProjectCatalogError("NOT_FOUND", "Project was not found for this account.");
  }
  const owned = { ...record, ownerUserId, cloudSyncEnabled: true };
  return record.cloudSyncEnabled ? owned : markProjectCloudDirty(owned, timestamp);
}

export function acknowledgeProjectCloudSync(
  record: ProjectRecord,
  receipt: ProjectCloudReceipt,
  timestamp: string,
  expectedLocalRevision?: number,
): ProjectRecord {
  if (record.cloud?.status === "conflict") return record;
  const localRevision = record.cloud?.localRevision ?? expectedLocalRevision ?? 0;
  const changedDuringUpload = expectedLocalRevision !== undefined
    && localRevision !== expectedLocalRevision;
  const availableIsNewer = record.cloud?.availableRevision !== undefined
    && record.cloud.availableRevision > receipt.revision;
  return {
    ...record,
    cloud: {
      revision: receipt.revision,
      manifestSha256: receipt.manifestSha256,
      status: changedDuringUpload ? "dirty" : "synced",
      lastSyncedAt: timestamp,
      cloudUpdatedAt: receipt.updatedAt,
      localRevision,
      ...(availableIsNewer ? {
        availableRevision: record.cloud?.availableRevision,
        availableManifestSha256: record.cloud?.availableManifestSha256,
        availableUpdatedAt: record.cloud?.availableUpdatedAt,
      } : {}),
    },
  };
}

export function markProjectCloudUpdateAvailable(
  record: ProjectRecord,
  receipt: ProjectCloudReceipt,
): ProjectRecord {
  return {
    ...record,
    cloud: {
      revision: record.cloud?.revision ?? 0,
      manifestSha256: record.cloud?.manifestSha256 ?? null,
      status: record.cloud?.status ?? "dirty",
      lastSyncedAt: record.cloud?.lastSyncedAt ?? null,
      cloudUpdatedAt: record.cloud?.cloudUpdatedAt,
      conflictRevision: record.cloud?.conflictRevision,
      conflictManifestSha256: record.cloud?.conflictManifestSha256,
      availableRevision: receipt.revision,
      availableManifestSha256: receipt.manifestSha256,
      availableUpdatedAt: receipt.updatedAt,
      localRevision: record.cloud?.localRevision ?? 0,
    },
  };
}

export function resolveProjectCloudConflict(
  record: ProjectRecord,
  receipt: ProjectCloudReceipt,
  timestamp: string,
  expectedConflictRevision: number,
  expectedLocalRevision: number,
): ProjectRecord {
  if (
    record.cloud?.status !== "conflict"
    || record.cloud.conflictRevision !== expectedConflictRevision
    || (record.cloud.localRevision ?? 0) !== expectedLocalRevision
  ) {
    return record;
  }
  return {
    ...record,
    cloud: {
      revision: receipt.revision,
      manifestSha256: receipt.manifestSha256,
      status: "synced",
      lastSyncedAt: timestamp,
      cloudUpdatedAt: receipt.updatedAt,
      localRevision: expectedLocalRevision,
    },
  };
}

export class ProjectCatalogError extends Error {
  constructor(
    public readonly code:
      | "DUPLICATE_NAME"
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "NOT_READY"
      | "CREATION_FAILED",
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProjectCatalogError";
  }
}

export function validateNewProjectInput(input: NewProjectInput): NewProjectInput {
  const name = input.name.trim();
  const javaPackage = input.javaPackage.trim();
  const rawStarter = (input as { starter?: unknown }).starter;
  const rawTemplateId = (input as { templateId?: unknown }).templateId;
  if (name.length < 1 || name.length > 80 || /[\\/:*?"<>|\u0000-\u001f]/u.test(name)) {
    throw new ProjectCatalogError("INVALID_INPUT", "Project name must be 1–80 characters and cannot contain file-name separators.");
  }
  const packageSegments = javaPackage.split(".");
  if (packageSegments.length < 2 || packageSegments.some((segment) => !/^[A-Za-z_$][\w$]*$/u.test(segment))) {
    throw new ProjectCatalogError("INVALID_INPUT", "Java package must contain dot-separated Java identifiers.");
  }
  if (rawStarter !== "java" && rawStarter !== "kotlin" && rawStarter !== "blocks" && rawStarter !== "empty") {
    throw new ProjectCatalogError("INVALID_INPUT", "Choose Java, Kotlin, or Blocks for TeamCode.");
  }
  const starter = rawStarter === "kotlin" || rawStarter === "blocks" ? rawStarter : "java";
  const templateId = rawTemplateId === undefined
    ? rawStarter === "empty" ? "empty" : "teleop-basic"
    : rawTemplateId;
  if (!isStarterTemplateId(templateId)) {
    throw new ProjectCatalogError("INVALID_INPUT", "Choose a supported project template.");
  }
  if (!["mecanum", "tank", "x-drive", "h-drive"].includes(input.drivetrain)) {
    throw new ProjectCatalogError("INVALID_INPUT", "Choose a supported drivetrain.");
  }
  if (!["official", "descriptive"].includes(input.motorNamingPreset)) {
    throw new ProjectCatalogError("INVALID_INPUT", "Choose a supported motor naming preset.");
  }
  if (input.exampleIds !== undefined) {
    const validIds = new Set(availableExamples(starter).filter((example) => example.configurable !== false).map((example) => example.id));
    if (!Array.isArray(input.exampleIds)
        || input.exampleIds.length > 120
        || new Set(input.exampleIds).size !== input.exampleIds.length
        || input.exampleIds.some((id) => typeof id !== "string" || !validIds.has(id))) {
      throw new ProjectCatalogError("INVALID_INPUT", "Choose examples available for this language.");
    }
  }
  return { ...input, name, javaPackage, starter, templateId };
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultSession(
  record: ProjectRecord,
  activeFile: string | null,
): ProjectSession {
  return {
    schemaVersion: 1,
    projectId: record.id,
    openTabs: activeFile ? [activeFile] : [],
    activeFile,
    selectedOpMode: null,
    robotConfiguration: {
      drivetrain: record.drivetrain,
      motorNamingPreset: record.motorNamingPreset,
    },
    toolWindows: {
      project: true,
      simulator: true,
      rightTool: "simulator",
      bottom: true,
      bottomTab: "Run",
    },
    updatedAt: record.updatedAt,
  };
}

function inferLegacyName(files: Record<string, string>): string {
  try {
    const manifest = JSON.parse(files["ftcsim.project.json"] ?? "{}") as { name?: unknown };
    if (typeof manifest.name === "string" && manifest.name.trim()) return manifest.name.trim();
  } catch {
    // A malformed optional manifest must not rewrite or block an otherwise healthy Git repository.
  }
  const settingsMatch = files["settings.gradle"]?.match(/rootProject\.name\s*=\s*['"]([^'"]+)['"]/u);
  return settingsMatch?.[1] || "FTC_STUDIO_SAMPLE";
}

async function indexedDatabaseExists(name: string): Promise<boolean> {
  const factory = indexedDB as IDBFactory & { databases?: () => Promise<IDBDatabaseInfo[]> };
  if (!factory.databases) return false;
  const databases = await factory.databases();
  return databases.some((database) => database.name === name);
}

export function createProjectCatalog(options: {
  databaseName?: string;
  now?: () => Date;
  id?: () => string;
  accountId?: string | null;
} = {}): ProjectCatalog {
  const databaseName = options.databaseName ?? PROJECT_CATALOG_DATABASE;
  const now = options.now ?? (() => new Date());
  const id = options.id ?? createId;
  const ownerUserId = options.accountId?.trim() || undefined;
  let databasePromise: Promise<IDBDatabase> | null = null;
  let migrationPromise: Promise<void> | null = null;

  const database = () => {
    if (!databasePromise) {
      databasePromise = openCatalogDatabase(databaseName)
        .then((opened) => {
          opened.addEventListener("versionchange", () => {
            if (databasePromise) databasePromise = null;
          }, { once: true });
          return opened;
        })
        .catch((error) => {
          databasePromise = null;
          throw error;
        });
    }
    return databasePromise;
  };

  async function rawList(): Promise<ProjectRecord[]> {
    const db = await database();
    const records = await getAllRecords<ProjectRecord>(db, "projects");
    const normalized = records.map(normalizeProjectRecord);
    await Promise.all(normalized.map((record, index) => (
      record === records[index] ? Promise.resolve() : putRecord(db, "projects", record)
    )));
    return normalized;
  }

  function isOwned(record: ProjectRecord): boolean {
    return projectBelongsToAccount(record, ownerUserId);
  }

  function requireOwned(record: ProjectRecord | undefined): ProjectRecord {
    if (!record || !isOwned(record)) {
      throw new ProjectCatalogError("NOT_FOUND", "Project was not found for this account.");
    }
    return record;
  }

  async function ownedList(): Promise<ProjectRecord[]> {
    return (await rawList()).filter(isOwned);
  }

  async function ensureLegacyMigration(): Promise<void> {
    if (databaseName !== PROJECT_CATALOG_DATABASE) return;
    if (migrationPromise) return migrationPromise;
    migrationPromise = (async () => {
      const db = await database();
      if (await getRecord<MetaRecord>(db, "meta", LEGACY_MIGRATION_KEY)) return;
      const records = await rawList();
      const alreadyRegistered = records.some((record) => record.storageNamespace === LEGACY_WORKSPACE_DATABASE);
      if (!alreadyRegistered && await indexedDatabaseExists(LEGACY_WORKSPACE_DATABASE)) {
        const timestamp = now().toISOString();
        const creating: ProjectRecord = {
          schemaVersion: 1,
          id: "legacy-workspace",
          name: "FTC_STUDIO_SAMPLE",
          nameKey: "ftc_studio_sample",
          javaPackage: DEFAULT_NEW_PROJECT.javaPackage,
          storageNamespace: LEGACY_WORKSPACE_DATABASE,
          state: "creating",
          starter: "java",
          drivetrain: "mecanum",
          motorNamingPreset: "official",
          sdkVersion: FTC_SDK_VERSION,
          kotlinVersion: KOTLIN_VERSION,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastOpenedAt: timestamp,
          legacy: true,
        };
        await putRecord(db, "projects", creating);
        try {
          const git = createBrowserGitEngine({ databaseName: LEGACY_WORKSPACE_DATABASE });
          const state = await git.initialize({});
          const inferredName = inferLegacyName(state.files);
          const name = records.some((record) => record.nameKey === inferredName.toLocaleLowerCase())
            ? `${inferredName} (Legacy)`
            : inferredName;
          const ready = {
            ...creating,
            name,
            nameKey: name.toLocaleLowerCase(),
            state: "ready" as const,
          };
          await putRecord(db, "projects", ready);
          await putRecord(db, "sessions", defaultSession(ready, Object.keys(state.files).find((path) => /TeamCode\/src\/main\/.+\.(?:java|kt)$/u.test(path)) ?? null));
        } catch (cause) {
          await putRecord(db, "projects", {
            ...creating,
            state: "failed",
            failureReason: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
      await putRecord(db, "meta", { key: LEGACY_MIGRATION_KEY, value: now().toISOString() });
    })().catch((error) => {
      migrationPromise = null;
      throw error;
    });
    return migrationPromise;
  }

  async function finishCreation(record: ProjectRecord): Promise<ProjectRecord> {
    const db = await database();
    const templateId = record.templateId ?? (record.starter === "empty" ? "empty" : "teleop-basic");
    const input: NewProjectInput = {
      name: record.name,
      javaPackage: record.javaPackage,
      starter: record.starter === "kotlin" || record.starter === "blocks" ? record.starter : "java",
      templateId,
      exampleIds: record.exampleIds,
      drivetrain: record.drivetrain,
      motorNamingPreset: record.motorNamingPreset,
    };
    try {
      const descriptor = getStarterTemplate(templateId);
      if (record.templateRevision !== undefined && record.templateRevision !== descriptor.revision) {
        throw new Error(`Starter template ${templateId} revision ${record.templateRevision} is not available in this release.`);
      }
      const template = await generateProjectWithExamples(input);
      const git = createBrowserGitEngine({
        databaseName: record.storageNamespace,
        initialCommitMessage: `Create ${record.name}`,
      });
      await git.initialize(template.files);
      const timestamp = now().toISOString();
      const ready: ProjectRecord = {
        ...record,
        state: "ready",
        starter: input.starter,
        templateId,
        exampleIds: input.exampleIds,
        templateRevision: descriptor.revision,
        updatedAt: timestamp,
        lastOpenedAt: timestamp,
        failureReason: undefined,
      };
      await putRecord(db, "sessions", defaultSession(ready, template.activeFile));
      await putRecord(db, "projects", ready);
      return ready;
    } catch (cause) {
      const failed: ProjectRecord = {
        ...record,
        state: "failed",
        updatedAt: now().toISOString(),
        failureReason: cause instanceof Error ? cause.message : String(cause),
      };
      await putRecord(db, "projects", failed);
      throw new ProjectCatalogError("CREATION_FAILED", `Could not create ${record.name}.`, cause);
    }
  }

  async function finishGitHubImport(
    record: ProjectRecord,
    input: GitHubImportInput,
  ): Promise<ProjectRecord> {
    const db = await database();
    const repository = normalizeGitHubRepository(input.repository);
    try {
      const git = createBrowserGitEngine({ databaseName: record.storageNamespace });
      let state = await git.cloneFromRemote({
        url: repository.cloneUrl,
        corsProxy: `${window.location.origin}/api/git/github`,
        credential: input.credential ?? (input.token?.trim() ? { token: input.token.trim() } : undefined),
        depth: 50,
      });
      const sourceEntry = Object.entries(state.files).find(([path]) => (
        /TeamCode\/src\/main\/.+\.(?:java|kt)$/u.test(path)
      ));
      const packageName = sourceEntry?.[1].match(/\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/u)?.[1]
        ?? DEFAULT_NEW_PROJECT.javaPackage;
      const starter = sourceEntry?.[0].endsWith(".kt") ? "kotlin" as const : "java" as const;
      if (!("ftcsim.project.json" in state.files)) {
        const generated = generateProjectTemplate({
          ...DEFAULT_NEW_PROJECT,
          name: record.name,
          javaPackage: packageName,
          starter,
        });
        await git.writeFile("ftcsim.project.json", generated.files["ftcsim.project.json"]);
        state = await git.getState();
      }
      const timestamp = now().toISOString();
      const ready: ProjectRecord = {
        ...record,
        state: "ready",
        javaPackage: packageName,
        starter,
        remote: {
          provider: "github",
          owner: repository.owner,
          repository: repository.repository,
          branch: state.snapshot.branch,
          shallowDepth: 50,
          private: Boolean(input.credential || input.token?.trim()),
        },
        updatedAt: timestamp,
        lastOpenedAt: timestamp,
        failureReason: undefined,
      };
      const activeFile = sourceEntry?.[0] ?? null;
      await putRecord(db, "sessions", defaultSession(ready, activeFile));
      await putRecord(db, "projects", ready);
      return ready;
    } catch (cause) {
      const failed: ProjectRecord = {
        ...record,
        state: "failed",
        updatedAt: now().toISOString(),
        failureReason: cause instanceof Error ? cause.message : String(cause),
      };
      await putRecord(db, "projects", failed);
      throw new ProjectCatalogError("CREATION_FAILED", `Could not clone ${repository.slug}.`, cause);
    }
  }

  return {
    async list() {
      await ensureLegacyMigration();
      return (await ownedList())
        .filter((record) => record.state === "ready")
        .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
    },

    async listAll() {
      await ensureLegacyMigration();
      return (await ownedList()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async listUnowned() {
      await ensureLegacyMigration();
      if (!ownerUserId) return [];
      return (await rawList())
        .filter((record) => !record.ownerUserId && record.state === "ready")
        .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
    },

    async claimUnowned(projectId) {
      await ensureLegacyMigration();
      if (!ownerUserId) {
        throw new ProjectCatalogError("INVALID_INPUT", "An authenticated account is required to claim a local project.");
      }
      const db = await database();
      const record = await getRecord<ProjectRecord>(db, "projects", projectId);
      if (!record || record.ownerUserId || record.state !== "ready") {
        throw new ProjectCatalogError("NOT_FOUND", "Unclaimed local project was not found.");
      }
      if ((await ownedList()).some((owned) => owned.id !== record.id && owned.nameKey === record.nameKey)) {
        throw new ProjectCatalogError(
          "DUPLICATE_NAME",
          `Your account already has a project named ${record.name}. Rename one copy before claiming it.`,
        );
      }
      const claimed: ProjectRecord = {
        ...record,
        ownerUserId,
        cloudSyncEnabled: true,
        updatedAt: now().toISOString(),
        cloud: {
          revision: 0,
          manifestSha256: null,
          status: "dirty",
          lastSyncedAt: null,
          localRevision: 1,
        },
      };
      await putRecord(db, "projects", claimed);
      return claimed;
    },

    async enableCloudSync(projectId) {
      if (!ownerUserId) {
        throw new ProjectCatalogError("INVALID_INPUT", "Sign in with Google before enabling project sync.");
      }
      const db = await database();
      return mutateRecord<ProjectRecord>(db, "projects", projectId, (stored) => {
        if (!stored || (stored.ownerUserId && stored.ownerUserId !== ownerUserId) || stored.state !== "ready") {
          throw new ProjectCatalogError("NOT_READY", "Only a ready local project for this account can be synchronized.");
        }
        return enableProjectCloudSync(stored, ownerUserId, now().toISOString());
      });
    },

    async setRemote(projectId, remote) {
      const db = await database();
      return mutateRecord<ProjectRecord>(db, "projects", projectId, (stored) => {
        const record = stored && isOwned(stored) ? stored : undefined;
        if (!record || record.state !== "ready") {
          throw new ProjectCatalogError("NOT_READY", "Only a ready project for this account can have a Git remote.");
        }
        if (record.remote && (
          record.remote.provider !== remote.provider
          || record.remote.owner.toLocaleLowerCase() !== remote.owner.toLocaleLowerCase()
          || record.remote.repository.toLocaleLowerCase() !== remote.repository.toLocaleLowerCase()
        )) {
          throw new ProjectCatalogError("INVALID_INPUT", "This project already has a different GitHub remote configured.");
        }
        return { ...record, remote: { ...remote }, updatedAt: now().toISOString() };
      });
    },

    async create(rawInput) {
      await ensureLegacyMigration();
      const input = validateNewProjectInput(rawInput);
      const db = await database();
      const duplicate = (await ownedList()).some((record) => record.nameKey === input.name.toLocaleLowerCase());
      if (duplicate) throw new ProjectCatalogError("DUPLICATE_NAME", `A project named ${input.name} already exists.`);
      const timestamp = now().toISOString();
      const projectId = id();
      const template = getStarterTemplate(input.templateId);
      const creating: ProjectRecord = {
        schemaVersion: 1,
        id: projectId,
        name: input.name,
        nameKey: input.name.toLocaleLowerCase(),
        javaPackage: input.javaPackage,
        storageNamespace: `ftc-simulator-project-${projectId}-git-v1`,
        state: "creating",
        starter: input.starter,
        templateId: template.id,
        templateRevision: template.revision,
        exampleIds: input.exampleIds,
        drivetrain: input.drivetrain,
        motorNamingPreset: input.motorNamingPreset,
        sdkVersion: FTC_SDK_VERSION,
        kotlinVersion: KOTLIN_VERSION,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastOpenedAt: timestamp,
        ownerUserId,
        cloudSyncEnabled: false,
      };
      try {
        await putRecord(db, "projects", creating);
      } catch (cause) {
        throw new ProjectCatalogError("DUPLICATE_NAME", `A project named ${input.name} already exists.`, cause);
      }
      return finishCreation(creating);
    },

    async duplicate(projectId) {
      await ensureLegacyMigration();
      const copy = async () => {
        const db = await database();
        const source = requireOwned(await getRecord<ProjectRecord>(db, "projects", projectId));
        if (source.state !== "ready") throw new ProjectCatalogError("NOT_READY", `${source.name} is not ready to duplicate.`);
        const sourceGit = createBrowserGitEngine({ databaseName: source.storageNamespace });
        await sourceGit.initialize({});
        const sourceFiles = await sourceGit.readAllFiles();
        const sourceSession = await getRecord<ProjectSession>(db, "sessions", projectId);
        const name = nextProjectCopyName(source.name, (await ownedList()).map((project) => project.name));
        const timestamp = now().toISOString();
        const copyId = id();
        const record: ProjectRecord = {
          schemaVersion: 1,
          id: copyId,
          name,
          nameKey: name.toLocaleLowerCase(),
          javaPackage: source.javaPackage,
          storageNamespace: `ftc-simulator-project-${copyId}-git-v1`,
          state: "ready",
          starter: source.starter,
          templateId: source.templateId,
          templateRevision: source.templateRevision,
          exampleIds: source.exampleIds,
          drivetrain: source.drivetrain,
          motorNamingPreset: source.motorNamingPreset,
          sdkVersion: source.sdkVersion,
          kotlinVersion: source.kotlinVersion,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastOpenedAt: timestamp,
          ownerUserId,
          cloudSyncEnabled: false,
        };
        try {
          const git = createBrowserGitEngine({
            databaseName: record.storageNamespace,
            initialCommitMessage: `Duplicate ${source.name}`,
          });
          await git.initialize(duplicateProjectFiles(sourceFiles, name));
          const session: ProjectSession = sourceSession
            ? { ...sourceSession, projectId: copyId, updatedAt: timestamp }
            : defaultSession(record, null);
          await putProjectAndSession(db, record, session);
          return record;
        } catch (cause) {
          // Publish the catalog record only after the complete copy is durable.
          await destroyBrowserGitDatabase(record.storageNamespace);
          throw new ProjectCatalogError("CREATION_FAILED", `Could not duplicate ${source.name}.`, cause);
        }
      };
      // Two tabs duplicating at once must still allocate different copy names.
      return typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks.request(`${databaseName}:duplicate:${ownerUserId ?? "guest"}`, copy)
        : copy();
    },

    async importFromGitHub(rawInput) {
      await ensureLegacyMigration();
      const repository = normalizeGitHubRepository(rawInput.repository);
      const name = rawInput.localProjectName.trim();
      if (name.length < 1 || name.length > 80 || /[\\/:*?"<>|\u0000-\u001f]/u.test(name)) {
        throw new ProjectCatalogError("INVALID_INPUT", "Local project name must be 1–80 file-safe characters.");
      }
      const db = await database();
      if ((await ownedList()).some((record) => record.nameKey === name.toLocaleLowerCase())) {
        throw new ProjectCatalogError("DUPLICATE_NAME", `A project named ${name} already exists.`);
      }
      const timestamp = now().toISOString();
      const projectId = id();
      const creating: ProjectRecord = {
        schemaVersion: 1,
        id: projectId,
        name,
        nameKey: name.toLocaleLowerCase(),
        javaPackage: DEFAULT_NEW_PROJECT.javaPackage,
        storageNamespace: `ftc-simulator-project-${projectId}-git-v1`,
        state: "creating",
        starter: "java",
        drivetrain: DEFAULT_NEW_PROJECT.drivetrain,
        motorNamingPreset: DEFAULT_NEW_PROJECT.motorNamingPreset,
        sdkVersion: FTC_SDK_VERSION,
        kotlinVersion: KOTLIN_VERSION,
        remote: {
          provider: "github",
          owner: repository.owner,
          repository: repository.repository,
          branch: "HEAD",
          shallowDepth: 50,
          private: Boolean(rawInput.credential || rawInput.token?.trim()),
        },
        createdAt: timestamp,
        updatedAt: timestamp,
        lastOpenedAt: timestamp,
        ownerUserId,
        cloudSyncEnabled: false,
      };
      await putRecord(db, "projects", creating);
      return finishGitHubImport(creating, {
        repository: repository.slug,
        localProjectName: name,
        credential: rawInput.credential,
        token: rawInput.token,
      });
    },

    async retryCreation(projectId) {
      const record = requireOwned(await getRecord<ProjectRecord>(await database(), "projects", projectId));
      if (record.state === "ready") return record;
      if (record.remote) {
        throw new ProjectCatalogError(
          "NOT_READY",
          "GitHub credentials are never saved. Remove this interrupted import and clone the repository again.",
        );
      }
      await putRecord(await database(), "projects", { ...record, state: "creating", failureReason: undefined });
      return finishCreation(record);
    },

    async removeFailed(projectId) {
      const db = await database();
      const stored = await getRecord<ProjectRecord>(db, "projects", projectId);
      if (!stored) return;
      const record = requireOwned(stored);
      if (record.state === "ready") throw new ProjectCatalogError("NOT_READY", "A ready project cannot be removed as an interrupted creation.");
      await destroyBrowserGitDatabase(record.storageNamespace);
      await deleteRecord(db, "sessions", projectId);
      await deleteRecord(db, "projects", projectId);
    },

    async open(projectId, openOptions): Promise<ProjectWorkspace> {
      await ensureLegacyMigration();
      const db = await database();
      const stored = await getRecord<ProjectRecord>(db, "projects", projectId);
      let record = requireOwned(stored ? normalizeProjectRecord(stored) : undefined);
      if (stored && record !== stored) await putRecord(db, "projects", record);
      if (record.state !== "ready") throw new ProjectCatalogError("NOT_READY", `${record.name} is not ready to open.`);
      const git = createBrowserGitEngine({ databaseName: record.storageNamespace });
      let state = await git.initialize({});
      const updates = openOptions?.migrateLegacyBlocks
        ? await legacyBlocksProjectUpdates(state.files, record.starter)
        : null;
      if (updates) {
        record = await mutateRecord<ProjectRecord>(db, "projects", projectId, (latest) => (
          markProjectCloudDirty(requireOwned(latest), now().toISOString())
        ));
        for (const [path, content] of Object.entries(updates)) await git.writeFile(path, content);
        state = await git.getState();
      }
      const openedAt = now().toISOString();
      const opened = openOptions?.touch === false
          ? record
          : await mutateRecord<ProjectRecord>(db, "projects", projectId, (stored) => {
            const latest = stored && isOwned(stored) ? normalizeProjectRecord(stored) : undefined;
            if (!latest || latest.state !== "ready") {
              throw new ProjectCatalogError("NOT_READY", `${record.name} is not ready to open.`);
            }
            return touchProjectLastOpenedAt(latest, openedAt);
          });
      return { record: opened, git, state };
    },

    async get(projectId) {
      await ensureLegacyMigration();
      const db = await database();
      const stored = await getRecord<ProjectRecord>(db, "projects", projectId);
      const record = stored ? normalizeProjectRecord(stored) : undefined;
      if (stored && record !== stored) await putRecord(db, "projects", record);
      return record && isOwned(record) ? record : undefined;
    },

    async loadSession(projectId) {
      const db = await database();
      const stored = await getRecord<ProjectSession>(db, "sessions", projectId);
      const record = requireOwned(await getRecord<ProjectRecord>(db, "projects", projectId));
      if (stored) return stored;
      return defaultSession(record, null);
    },

    async saveSession(session) {
      const db = await database();
      const timestamp = now().toISOString();
      await mutateProjectAndSession<ProjectRecord, ProjectSession>(
        db,
        session.projectId,
        (stored) => {
          const record = stored && isOwned(stored) ? stored : undefined;
          if (!record || record.state !== "ready") {
            throw new ProjectCatalogError("NOT_READY", "Session belongs to a project that is not ready.");
          }
          return prepareProjectSessionSave(record, session, timestamp);
        },
      );
    },

    async markCloudDirty(projectId) {
      const db = await database();
      return mutateRecord<ProjectRecord>(db, "projects", projectId, (stored) => {
        const record = stored && isOwned(stored) ? normalizeProjectRecord(stored) : undefined;
        if (!record || record.state !== "ready") {
          throw new ProjectCatalogError("NOT_READY", "Only a ready project can be marked for cloud sync.");
        }
        return markProjectCloudDirty(record, now().toISOString());
      });
    },

    async markCloudSynced(projectId, receipt: ProjectCloudReceipt, expectedLocalRevision) {
      const db = await database();
      return mutateRecord<ProjectRecord>(db, "projects", projectId, (stored) => {
        const record = stored && isOwned(stored) ? stored : undefined;
        if (!record || record.state !== "ready") {
          throw new ProjectCatalogError("NOT_READY", "Only a ready project can finish cloud sync.");
        }
        return acknowledgeProjectCloudSync(
          record,
          receipt,
          now().toISOString(),
          expectedLocalRevision,
        );
      });
    },

    async markCloudUpdateAvailable(projectId, receipt: ProjectCloudReceipt) {
      const db = await database();
      return mutateRecord<ProjectRecord>(db, "projects", projectId, (stored) => {
        const record = stored && isOwned(stored) ? stored : undefined;
        if (!record || record.state !== "ready") {
          throw new ProjectCatalogError("NOT_READY", "Only a ready project can record a cloud update.");
        }
        return markProjectCloudUpdateAvailable(record, receipt);
      });
    },

    async resolveCloudConflict(
      projectId,
      receipt,
      expectedConflictRevision,
      expectedLocalRevision,
    ) {
      const db = await database();
      return mutateRecord<ProjectRecord>(db, "projects", projectId, (stored) => {
        const record = stored && isOwned(stored) ? stored : undefined;
        if (!record || record.state !== "ready") {
          throw new ProjectCatalogError("NOT_READY", "Only a ready project can resolve a cloud conflict.");
        }
        return resolveProjectCloudConflict(
          record,
          receipt,
          now().toISOString(),
          expectedConflictRevision,
          expectedLocalRevision,
        );
      });
    },

    async markCloudConflict(projectId, receipt: ProjectCloudReceipt) {
      const db = await database();
      return mutateRecord<ProjectRecord>(db, "projects", projectId, (stored) => {
        const record = stored && isOwned(stored) ? stored : undefined;
        if (!record || record.state !== "ready") {
          throw new ProjectCatalogError("NOT_READY", "Only a ready project can enter cloud conflict.");
        }
        return {
          ...record,
          cloud: {
            revision: record.cloud?.revision ?? 0,
            manifestSha256: record.cloud?.manifestSha256 ?? null,
            status: "conflict",
            lastSyncedAt: record.cloud?.lastSyncedAt ?? null,
            cloudUpdatedAt: receipt.updatedAt,
            conflictRevision: receipt.revision,
            conflictManifestSha256: receipt.manifestSha256,
            availableRevision: receipt.revision,
            availableManifestSha256: receipt.manifestSha256,
            availableUpdatedAt: receipt.updatedAt,
            localRevision: record.cloud?.localRevision ?? 0,
          },
        };
      });
    },

    async cloudDeviceId() {
      const db = await database();
      const deviceKey = `${CLOUD_DEVICE_ID_KEY}:${ownerUserId ?? "unscoped"}`;
      const stored = await getRecord<MetaRecord>(db, "meta", deviceKey);
      if (typeof stored?.value === "string" && /^[0-9a-f-]{36}$/iu.test(stored.value)) {
        return stored.value;
      }
      const value = createId();
      await putRecord(db, "meta", { key: deviceKey, value });
      return value;
    },

    async adoptCloudProject(input) {
      await ensureLegacyMigration();
      const db = await database();
      const current = await getRecord<ProjectRecord>(db, "projects", input.record.id);
      if (current && !isOwned(current)) {
        throw new ProjectCatalogError(
          "DUPLICATE_NAME",
          "A project from another account on this device already uses this project identity.",
        );
      }
      if (input.record.state !== "ready" || input.session.projectId !== input.record.id) {
        throw new ProjectCatalogError("INVALID_INPUT", "The cloud project snapshot is not internally consistent.");
      }
      const adopted: ProjectRecord = {
        ...input.record,
        storageNamespace: input.storageNamespace,
        ownerUserId,
        cloudSyncEnabled: true,
        failureReason: undefined,
        cloud: {
          revision: input.receipt.revision,
          manifestSha256: input.receipt.manifestSha256,
          status: "synced",
          lastSyncedAt: now().toISOString(),
          cloudUpdatedAt: input.receipt.updatedAt,
        },
      };
      await putProjectAndSession(db, adopted, {
        ...input.session,
        schemaVersion: 1,
        projectId: adopted.id,
      });
      return {
        record: adopted,
        ...(current?.storageNamespace && current.storageNamespace !== input.storageNamespace
          ? { replacedStorageNamespace: current.storageNamespace }
          : {}),
      };
    },
  };
}
