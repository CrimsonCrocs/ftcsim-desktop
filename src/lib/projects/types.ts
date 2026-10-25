import type { BrowserGitEngine, GitCredential, GitWorkspaceState } from "@/lib/browser-git";
import type { RobotVariant } from "@/lib/studio-types";

export const PROJECT_CATALOG_DATABASE = "ftc-simulator-project-catalog-v1";
export const LEGACY_WORKSPACE_DATABASE = "ftc-simulator-git-v1";
export const FTC_SDK_VERSION = "11.1.0";
export const KOTLIN_VERSION = "2.2.10";

export type ProjectRecordState = "creating" | "ready" | "failed";
export type StarterLanguage = "java" | "kotlin" | "blocks";
export type PersistedStarterLanguage = StarterLanguage | "empty";
export type StarterTemplateId =
  | "empty"
  | "teleop-basic"
  | "teleop-precision"
  | "autonomous-timed"
  | "autonomous-square"
  | "competition-starter";
export type MotorNamingPreset = "official" | "descriptive";

export interface NewProjectInput {
  name: string;
  javaPackage: string;
  starter: StarterLanguage;
  templateId: StarterTemplateId;
  /** Selected examples in creation order. Undefined means a legacy single-template project. */
  exampleIds?: string[];
  drivetrain: RobotVariant;
  motorNamingPreset: MotorNamingPreset;
}

export interface GitHubImportInput {
  repository: string;
  localProjectName: string;
  credential?: GitCredential;
  /** @deprecated Pass credential: { token } instead. */
  token?: string;
}

export interface ProjectRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  nameKey: string;
  javaPackage: string;
  storageNamespace: string;
  state: ProjectRecordState;
  /** `empty` is retained only so schema-1 records created by older releases remain recoverable. */
  starter: PersistedStarterLanguage;
  templateId?: StarterTemplateId;
  templateRevision?: number;
  exampleIds?: string[];
  drivetrain: RobotVariant;
  motorNamingPreset: MotorNamingPreset;
  sdkVersion: typeof FTC_SDK_VERSION;
  kotlinVersion: typeof KOTLIN_VERSION;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  /** Device-local Better Auth owner. Never leaves the browser catalog. */
  ownerUserId?: string;
  /** Cloud upload remains off until the user explicitly opts this project in. */
  cloudSyncEnabled?: boolean;
  failureReason?: string;
  legacy?: boolean;
  cloud?: ProjectCloudState;
  remote?: {
    provider: "github";
    owner: string;
    repository: string;
    branch: string;
    shallowDepth: 0 | 50;
    private: boolean;
  };
}

export type ProjectCloudSyncStatus = "dirty" | "synced" | "conflict";

export interface ProjectCloudState {
  revision: number;
  manifestSha256: string | null;
  status: ProjectCloudSyncStatus;
  lastSyncedAt: string | null;
  cloudUpdatedAt?: string;
  conflictRevision?: number;
  conflictManifestSha256?: string;
  /** Newer cloud head observed during catalog reconciliation; not yet hydrated locally. */
  availableRevision?: number;
  availableManifestSha256?: string;
  availableUpdatedAt?: string;
  /** Monotonic local mutation generation used for sync acknowledgements. */
  localRevision?: number;
}

/** Project metadata that can move between devices; storageNamespace is browser-local. */
export type PortableProjectRecord = Omit<
  ProjectRecord,
  "storageNamespace" | "cloud" | "cloudSyncEnabled" | "failureReason" | "ownerUserId"
>;

export interface ProjectCloudReceipt {
  revision: number;
  manifestSha256: string;
  updatedAt: string;
}

export interface AdoptCloudProjectInput {
  record: PortableProjectRecord;
  session: ProjectSession;
  storageNamespace: string;
  receipt: ProjectCloudReceipt;
}

export type LaunchMode = "build" | "reuse";

export interface ProjectSession {
  schemaVersion: 1;
  projectId: string;
  openTabs: string[];
  activeFile: string | null;
  selectedOpMode: string | null;
  launchModes?: { play: LaunchMode; game: LaunchMode };
  robotConfiguration: {
    drivetrain: RobotVariant;
    motorNamingPreset: MotorNamingPreset;
    physicsSettings?: Record<string, number | string | boolean>;
  };
  toolWindows: {
    project: boolean;
    simulator: boolean;
    rightTool?: "simulator" | "configuration";
    bottom: boolean;
    bottomTab: string;
    paneLayout?: Record<string, number>;
  };
  updatedAt: string;
}

export interface ProjectWorkspace {
  record: ProjectRecord;
  git: BrowserGitEngine;
  state: GitWorkspaceState;
}

export interface ProjectCatalog {
  /** Lists only fully-created, openable projects, most recently opened first. */
  list(): Promise<ProjectRecord[]>;
  /** Includes interrupted/failed records for diagnostics and recovery UI. */
  listAll(): Promise<ProjectRecord[]>;
  /** Ready projects created before account-scoped sync; claiming is always explicit. */
  listUnowned(): Promise<ProjectRecord[]>;
  claimUnowned(projectId: string): Promise<ProjectRecord>;
  enableCloudSync(projectId: string): Promise<ProjectRecord>;
  setRemote(projectId: string, remote: NonNullable<ProjectRecord["remote"]>): Promise<ProjectRecord>;
  create(input: NewProjectInput): Promise<ProjectRecord>;
  /** Creates an independent local project from the current saved worktree. */
  duplicate(projectId: string): Promise<ProjectRecord>;
  importFromGitHub(input: GitHubImportInput): Promise<ProjectRecord>;
  retryCreation(projectId: string): Promise<ProjectRecord>;
  removeFailed(projectId: string): Promise<void>;
  open(projectId: string, options?: { touch?: boolean; migrateLegacyBlocks?: boolean }): Promise<ProjectWorkspace>;
  get(projectId: string): Promise<ProjectRecord | undefined>;
  loadSession(projectId: string): Promise<ProjectSession>;
  saveSession(session: ProjectSession): Promise<void>;
  markCloudDirty(projectId: string): Promise<ProjectRecord>;
  markCloudSynced(
    projectId: string,
    receipt: ProjectCloudReceipt,
    expectedLocalRevision?: number,
  ): Promise<ProjectRecord>;
  markCloudUpdateAvailable(
    projectId: string,
    receipt: ProjectCloudReceipt,
  ): Promise<ProjectRecord>;
  resolveCloudConflict(
    projectId: string,
    receipt: ProjectCloudReceipt,
    expectedConflictRevision: number,
    expectedLocalRevision: number,
  ): Promise<ProjectRecord>;
  markCloudConflict(projectId: string, receipt: ProjectCloudReceipt): Promise<ProjectRecord>;
  cloudDeviceId(): Promise<string>;
  adoptCloudProject(input: AdoptCloudProjectInput): Promise<{
    record: ProjectRecord;
    replacedStorageNamespace?: string;
  }>;
}

export const DEFAULT_NEW_PROJECT: NewProjectInput = {
  name: "MyFTCProject",
  javaPackage: "org.firstinspires.ftc.teamcode",
  starter: "java",
  templateId: "competition-starter",
  drivetrain: "mecanum",
  motorNamingPreset: "descriptive",
};
