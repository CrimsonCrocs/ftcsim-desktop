"use client";

import { ViewLoading } from "@/components/view-loading";
import { RunActionButton } from "./run-action-button";
import { useMobileWorkspace } from "./use-mobile-workspace";
import { MobileWorkspaceNav, type MobileWorkspaceView } from "./mobile-workspace-nav";
import { MobileToolbarActions } from "./mobile-toolbar-actions";
import { TouchGamepad } from "./touch-gamepad";

import {
  Activity,
  Bot,
  Bug,
  ChevronDown,
  CircleAlert,
  Code2,
  Command,
  Download,
  Flame,
  FolderTree,
  Gamepad2,
  Hammer,
  PanelBottom,
  Play,
  RotateCcw,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { EditorPane } from "./editor-pane";
import { BlocksEditorPane } from "./blocks-editor-pane";
import { NewOpModeDialog } from "./new-opmode-dialog";
import { ProjectPane } from "./project-pane";
import { ResizeHandle } from "./resize-handle";
import { generatedBlocksSourcePath } from "@/lib/blocks/documents";
import { discoverProjectOpModes, resolveRunOpMode } from "@/lib/project-opmodes";
import { readPlaySettings, writePlaySettings, type PlaySettings } from "@/lib/play-settings";
import { RobotConfigurationDialog } from "./robot-configuration-pane";
import { CadAssetReaderContext } from "./cad-asset-context";
import { packCadModel, unpackCadModel, type CadModelAsset } from "@/lib/cad/assets";
import { RobotSimulator } from "./robot-simulator";
import { TelemetryPanel } from "./telemetry-panel";
import { DebugPanel } from "./debug-panel";
import { DebuggerController } from "@/lib/debugger";
import { AnalysisStore, runtimeChannels, variableChannels } from "@/lib/analysis/store";
import { AdvantageScopePublisher } from "@/lib/analysis/live-publisher";
import { AdvantageScopeSceneAssets } from "@/lib/analysis/scene-assets";
import { BuildElapsedTime } from "./build-elapsed-time";
import { reusableBuildArtifact } from "@/lib/build-artifact-reuse";
import {
  clampPaneSize,
  fitPaneLayout,
  getPaneBounds,
  PANE_LAYOUT_DEFAULTS,
  PANE_LAYOUT_LIMITS,
  type PaneLayout,
} from "@/lib/pane-layout";
import type { JavaDiagnostic } from "@/lib/java-runner-client";
import { ensureBuildFailureDiagnostics, formatBuildDiagnostic } from "@/lib/build-diagnostics";
import {
  type BrowserGitEngine,
  type GitCredential,
  type GitWorktreeEntry,
  type GitStatusSnapshot,
  type GitWorkspaceState,
} from "@/lib/browser-git";
import { publishProjectArtifactCompletions, clearProjectArtifactCompletions, projectArtifactCompletionCatalog } from "@/lib/completions";
import type { OpModeState, RobotVariant } from "@/lib/studio-types";
import {
  DEFAULT_DRIVE_MOTOR_NAMES,
  type SimulatorHardwareFrame,
} from "@/lib/runtime-types";
import { toActuatorFrame, toProtocolGamepad } from "@/lib/runtime-frames";
import { SimulatorActuatorStore } from "@/lib/simulator-actuator-store";
import { SimulatorTickBudget } from "@/lib/simulator-tick-budget";
import { deliverRuntimeFrame } from "@/lib/runtime-frame-delivery";
import {
  shouldIssueRuntimeTick,
  startRuntimeTickLoop,
} from "@/lib/runtime-cadence";
import { stopRuntimeSession, stopRuntimeSessionForReuse } from "@/lib/runtime-stop";
import { fastReloadSources, HotReloadController, type HotReloadTicket } from "@/lib/hot-reload";
import {
  applyRobotConfigurationCommand,
  getMotorModelProfile,
  openRobotConfiguration,
  robotConfigurationCommandEffect,
  serializeRobotConfiguration,
  type RobotConfigurationCommand,
  type RobotConfigurationDocument,
} from "@/lib/robot-configuration";
import {
  CoalescingAutosave,
  CloudProjectSyncQueue,
  CloudSyncError,
  acquireProjectWorkspaceLease,
  createProjectExportArchive,
  ensureCloudProjectAvailable,
  getCurrentCloudProject,
  hydrateCloudProject,
  prepareCloudRepository,
  projectSessionsSemanticallyEqual,
  shouldCheckCloudProjectOnOpen,
  syncProjectToCloud,
  useProjectCatalog,
  useProjectAccountId,
  type AutosaveStatus,
  type CloudSyncStatus,
  type PreparedCloudRepository,
  type ProjectCatalog,
  type ProjectRecord,
  type ProjectSession,
  type LaunchMode,
  type ProjectWorkspaceLease,
} from "@/lib/projects";
import {
  createGamepadRegistry,
  type GamepadFrame,
  type GamepadRegistry,
} from "@/lib/gamepad";
import { GitBranchMenu, ProjectSwitcher } from "./studio-header-menus";
import { GamepadToolbarGroup } from "./gamepad-toolbar-group";
import { GameSimulationPanel, type GameSimulationDifficulty } from "./game-simulation-panel";
import { createBiobuzzWorldOptions } from "@/lib/biobuzz-world-field";
import { ProgrammedBotSquad } from "@/lib/game-policy/programmed-bot-squad";
import { AutomatedHumanPlayer, fullyAutomatedAlliances } from "@/lib/game-policy/human-player";
import type { GameSimulation } from "@ftc-studio/sim-core";
import { GitHubProjectDialog, NewProjectDialog } from "@/components/welcome/welcome-screen";
import { TemporaryAccountMenu } from "@/components/auth/temporary-account-menu";
import { useTemporaryAuthExitHandler } from "@/components/auth/temporary-live-auth-boundary";
import { GitHubPublishDialog, type GitHubPublishSelection } from "./github-publish-dialog";
import { createGitHubRepository } from "@/lib/github/client";
import { ProjectExportDialog, type ProjectExportSelection } from "./project-export-dialog";
import { OpModeSessionError, WebSocketOpModeSession, describeOpModeFailure, type OpModeSession } from "@/lib/opmode-session";
import {
  canAcceptBlocksSnapshot,
  getStudioActionAvailability,
  getWorkspaceProjectCapabilities,
  resolveWorkspaceEditorState,
  type StudioBuildStatus,
  type WorkspaceMutationPhase,
} from "@/lib/studio-actions";
import { TelemetryViewStore } from "@/lib/telemetry-store";
import {
  createNewOpModeFiles,
  isGeneratedBlocksJava,
  validateBlocksGeneratedSources,
  type NewOpModeInput,
  type OpModeKind,
} from "@/lib/blocks/documents";
import type { BlocksFrameKeyboardMessage } from "@/lib/blocks/protocol";
import {
  readFieldConfiguration,
  readFieldParameters,
  normalizeFieldParameters,
  type FieldParameters,
  writeFieldConfiguration,
  type FieldPresetId,
} from "@/lib/field-configuration";
import type {
  LoadArtifact,
  BuildJobProgress,
  SimulatedHardwareManifest,
  SimulatedMotorDescriptor,
  SimulationFrame,
} from "@ftc-studio/opmode-protocol";

type BottomTab = "Run" | "Build" | "Problems" | "Telemetry" | "Debug";

const ROBOT_LABELS: Record<RobotVariant, string> = {
  mecanum: "Mecanum",
  tank: "Tank-style",
  "x-drive": "X-drive",
  "h-drive": "H-drive",
};

const FALLBACK_ROBOT_CONFIGURATION = openRobotConfiguration(JSON.stringify({
  schemaVersion: 1,
  robot: {
    drivetrain: "mecanum",
    motors: {
      frontLeft: DEFAULT_DRIVE_MOTOR_NAMES.frontLeft,
      frontRight: DEFAULT_DRIVE_MOTOR_NAMES.frontRight,
      backLeft: DEFAULT_DRIVE_MOTOR_NAMES.backLeft,
      backRight: DEFAULT_DRIVE_MOTOR_NAMES.backRight,
    },
  },
})).resolved;

type WorkbenchSize = {
  width: number;
  height: number;
};

type BuildViewState = {
  startedAt?: number;
  status: StudioBuildStatus;
  title: string;
  detail: string;
  diagnostics: JavaDiagnostic[];
};

type BrowserNavigateEvent = Event & {
  canIntercept: boolean;
  downloadRequest: string | null;
  hashChange: boolean;
  intercept(options: { handler: () => Promise<void> }): void;
};

type BrowserNavigation = EventTarget;

const INITIAL_BUILD_STATE: BuildViewState = {
  status: "idle",
  title: "TeamCode compiler ready",
  detail: "Build Java or Kotlin OpModes against the FTC simulator API.",
  diagnostics: [],
};

function BuildDiagnostics({ diagnostics }: { diagnostics: JavaDiagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <ol className="build-diagnostics" aria-label="TeamCode compiler diagnostics">
      {diagnostics.map((diagnostic, index) => (
        <li key={`${diagnostic.file ?? "build"}-${diagnostic.line ?? 0}-${index}`}>
          <span className={`diagnostic-kind diagnostic-kind--${diagnostic.kind}`}>{diagnostic.kind}</span>
          <code>
            {diagnostic.file && `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ""}` : ""} — `}
            {diagnostic.message}
          </code>
        </li>
      ))}
    </ol>
  );
}

function ExitSaveFailureDialog({
  error,
  kind,
  onCancel,
  onLeave,
  onRetry,
  projectName,
}: {
  error: string;
  kind: "local" | "cloud";
  onCancel: () => void;
  onLeave: () => void;
  onRetry: () => void;
  projectName: string;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => focusable().at(-1)?.focus());
    return () => dialog?.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="exit-save-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        className="exit-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-save-title"
        aria-describedby="exit-save-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CircleAlert aria-hidden="true" />
        <div>
          <h2 id="exit-save-title">{kind === "cloud" ? `Couldn’t sync ${projectName}` : `Couldn’t save ${projectName}`}</h2>
          <p id="exit-save-description">
            {kind === "cloud"
              ? "Your changes are saved on this device, but they are not available on your other devices yet. Retry sync or exit with the local copy."
              : "Your latest changes are still in this tab. Retry saving before returning to Welcome, or leave without saving."}
          </p>
          <small>{error}</small>
        </div>
        <footer>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="exit-save-dialog__leave" onClick={onLeave}>
            {kind === "cloud" ? "Exit with local copy" : "Leave without saving"}
          </button>
          <button type="button" className="exit-save-dialog__primary" onClick={onRetry}>
            {kind === "cloud" ? "Retry sync" : "Retry save"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function CloudSyncConflictDialog({
  busy,
  error,
  onCancel,
  onKeepDevice,
  onUseCloud,
  projectName,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onKeepDevice: () => void;
  onUseCloud: () => void;
  projectName: string;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
      if (event.key !== "Tab") return;
      const first = controls()[0];
      const last = controls().at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener("keydown", keydown);
    window.requestAnimationFrame(() => controls()[0]?.focus());
    return () => dialog?.removeEventListener("keydown", keydown);
  }, [busy, onCancel]);

  return (
    <div className="exit-save-backdrop" role="presentation" onMouseDown={() => { if (!busy) onCancel(); }}>
      <section
        ref={dialogRef}
        className="exit-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-conflict-title"
        aria-describedby="cloud-conflict-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CircleAlert aria-hidden="true" />
        <div>
          <h2 id="cloud-conflict-title">Choose which {projectName} to keep</h2>
          <p id="cloud-conflict-description">
            This project changed on another device after this browser last synced. Both copies were preserved.
          </p>
          <small>
            Use cloud copy replaces this browser’s worktree. Keep this device publishes the worktree currently open here.
          </small>
          {error && <small role="alert">{error}</small>}
        </div>
        <footer>
          <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="exit-save-dialog__leave" onClick={onUseCloud} disabled={busy}>
            {busy ? "Resolving…" : "Use cloud copy"}
          </button>
          <button type="button" className="exit-save-dialog__primary" onClick={onKeepDevice} disabled={busy}>
            {busy ? "Resolving…" : "Keep this device"}
          </button>
        </footer>
      </section>
    </div>
  );
}

const ToolButton = ({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    className={`tool-rail-button${active ? " is-active" : ""}`}
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={label}
  >
    {children}
  </button>
);

function RunStateLabel({ state }: { state: OpModeState }) {
  const label = {
    idle: "Idle",
    initializing: "Initializing",
    ready: "Ready",
    running: "Running",
    stopped: "Stopped",
  }[state];
  return <span className={`run-state run-state--${state}`}>{label}</span>;
}

export function StudioShell({ projectId, desktop }: { projectId: string; desktop?: {
  hotReload: boolean;
  rehearsalSeed?: number;
  saveFiles(projectId: string, files: Record<string, string>): Promise<void>;
  setRuntimeActive?(active:boolean):Promise<void>;
  registerSaveBarrier?(save:()=>Promise<void>):()=>void;
  registerAutomation?(control:(action:string,args:Record<string,unknown>)=>Promise<unknown>):()=>void;
  publishCompletions?: typeof publishProjectArtifactCompletions;
} }) {
  const desktopSaveFiles = desktop?.saveFiles;
  const publishArtifactCompletions = desktop?.publishCompletions ?? publishProjectArtifactCompletions;
  const router = useRouter();
  const projectCatalog = useProjectCatalog();
  const projectAccountId = useProjectAccountId();
  const mobile = useMobileWorkspace();
  const [mobileView, setMobileView] = useState<MobileWorkspaceView>("code");
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [worktreeEntries, setWorktreeEntries] = useState<GitWorktreeEntry[]>([]);
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState("");
  const [projectRecord, setProjectRecord] = useState<ProjectRecord | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectRecord[]>([]);
  const [projectSession, setProjectSession] = useState<ProjectSession | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [fileSaveStatus, setFileSaveStatus] = useState<AutosaveStatus>("saved");
  const [sessionSaveStatus, setSessionSaveStatus] = useState<AutosaveStatus>("saved");
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>("idle");
  const [cloudSyncError, setCloudSyncError] = useState<CloudSyncError | null>(null);
  const [cloudConflictOpen, setCloudConflictOpen] = useState(false);
  const [cloudConflictBusy, setCloudConflictBusy] = useState(false);
  const [cloudConflictError, setCloudConflictError] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [gameSimulationOpen, setGameSimulationOpen] = useState(false);
  const [gameSimulationButton, setGameSimulationButton] = useState<HTMLButtonElement | null>(null);
  const [newOpModeOpen, setNewOpModeOpen] = useState(false);
  const [newOpModeKind, setNewOpModeKind] = useState<OpModeKind>("teleop");
  const [openBlocksXmlRequest, setOpenBlocksXmlRequest] = useState<{ id: number; path: string } | null>(null);
  const [newOpModeReturnFocus, setNewOpModeReturnFocus] = useState<HTMLElement | null>(null);
  const [gitHubProjectOpen, setGitHubProjectOpen] = useState(false);
  const githubPublishOpenerRef = useRef<HTMLButtonElement | null>(null);
  const [githubPublishOpen, setGitHubPublishOpen] = useState(false);
  const [projectExportOpen, setProjectExportOpen] = useState(false);
  const [projectExportStatus, setProjectExportStatus] = useState("");
  const [duplicatingProject, setDuplicatingProject] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [projectOpen, setProjectOpen] = useState(true);
  const [simulatorOpen, setSimulatorOpen] = useState(true);
  const [rightTool, setRightTool] = useState<"simulator" | "configuration">("simulator");
  const [configurationMaximized, setConfigurationMaximized] = useState(false);
  const [configurationVisited, setConfigurationVisited] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>("Run");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [runConfiguration, setRunConfiguration] = useState("");
  const [playLaunchMode, setPlayLaunchMode] = useState<LaunchMode>("build");
  const [gameLaunchMode, setGameLaunchMode] = useState<LaunchMode>("build");
  const [runtimeEntryClass, setRuntimeEntryClass] = useState("");
  const [variant, setVariant] = useState<RobotVariant>("mecanum");
  const [opModeState, setOpModeState] = useState<OpModeState>("idle");
  const [hotReload] = useState(() => {
    const controller = new HotReloadController();
    controller.setEnabled(desktop?.hotReload ?? false);
    return controller;
  });
  const [hotReloadEnabled, setHotReloadEnabled] = useState(desktop?.hotReload ?? false);
  const [hotReloadActive, setHotReloadActive] = useState(false);
  const [telemetryStore] = useState(() => new TelemetryViewStore());
  const [analysisStore] = useState(() => new AnalysisStore());
  const [advantageScope] = useState(() => new AdvantageScopePublisher());
  const [advantageScopeAssets] = useState(() => new AdvantageScopeSceneAssets());
  const [debuggerController] = useState(() => new DebuggerController());
  const debugPaused = useSyncExternalStore(debuggerController.subscribe, () => debuggerController.paused, () => false);
  const [editorLocation, setEditorLocation] = useState<{ path: string; line: number; nonce: number } | null>(null);
  useEffect(() => {
    debuggerController.load(projectId); analysisStore.clear(); advantageScope.disconnect();
    return () => { debuggerController.detach(); advantageScope.disconnect(); };
  }, [projectId, analysisStore, advantageScope, debuggerController]);
  const [actuatorStore] = useState(() => new SimulatorActuatorStore());
  const [tickBudget] = useState(() => new SimulatorTickBudget());
  const [buildArtifact, setBuildArtifact] = useState<LoadArtifact | null>(null);
  const lastSuccessfulArtifactRef = useRef<LoadArtifact | null>(null);
  const buildBeforeGameSimulationRef = useRef(false);
  // Keep Gradle-discovered source-set metadata when edits invalidate executable code.
  const hardwareFrameRef = useRef<SimulatorHardwareFrame | null>(null);
  const runtimeHardwareRef = useRef(new Map<number, SimulatorHardwareFrame>());
  const gamepadFrameRef = useRef<GamepadFrame | null>(null);
  const [inputSourceLabel, setInputSourceLabel] = useState("Keyboard → gamepad1");
  const [gamepadRegistry] = useState<GamepadRegistry>(() => createGamepadRegistry());
  const [gamepadConfigurationOpen, setGamepadConfigurationOpen] = useState(false);
  const [gamepadConfigurationReturnFocus, setGamepadConfigurationReturnFocus] =
    useState<HTMLElement | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [preferredPaneLayout, setPreferredPaneLayout] = useState<PaneLayout>(PANE_LAYOUT_DEFAULTS);
  const [workbenchSize, setWorkbenchSize] = useState<WorkbenchSize>({ width: 1512, height: 700 });
  const [buildState, setBuildState] = useState<BuildViewState>(INITIAL_BUILD_STATE);
  const [runnerMode, setRunnerMode] = useState<"local-v3" | "sandbox-v3" | "cloud-run-v2" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/java-runner/health", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json())
      .then((health: { runnerMode?: string }) => {
        if (health.runnerMode === "local-v3" || health.runnerMode === "sandbox-v3" || health.runnerMode === "cloud-run-v2") setRunnerMode(health.runnerMode);
      }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  const [gitSnapshot, setGitSnapshot] = useState<GitStatusSnapshot | null>(null);
  const [gitBusy, setGitBusy] = useState(true);
  const [workspaceMutationLocked, setWorkspaceMutationLocked] = useState(false);
  const [exitState, setExitState] = useState<"idle" | "saving" | "failed">("idle");
  const [exitError, setExitError] = useState<string | null>(null);
  const [exitFailureKind, setExitFailureKind] = useState<"local" | "cloud">("local");
  const [gitError, setGitError] = useState<string | null>(null);
  const [runLog, setRunLog] = useState<string[]>([
    "FTC Simulator ready.",
    "Core compatibility target: FTC SDK 11.1.",
  ]);
  const gitEngineRef = useRef<BrowserGitEngine | null>(null);
  const cadAssetCache = useRef(new Map<string, Promise<ArrayBuffer>>());
  const readCadAsset = useCallback((asset: CadModelAsset) => {
    const key = `${projectId}:${asset.sha256}`;
    let pending = cadAssetCache.current.get(key);
    if (!pending) {
      const engine = gitEngineRef.current;
      pending = (async () => {
        const files = await engine?.readAllFiles(), bytes = files?.[asset.path];
        if (!(bytes instanceof Uint8Array)) throw new Error("The saved robot model is missing from this project. Restore the project asset or import the CAD again.");
        return unpackCadModel(asset, bytes);
      })();
      cadAssetCache.current.set(key, pending);
      void pending.catch(() => cadAssetCache.current.delete(key));
    }
    return pending;
  }, [projectId]);
  const catalogRef = useRef<ProjectCatalog>(projectCatalog);
  const autosaveRef = useRef<CoalescingAutosave<Record<string, string>> | null>(null);
  const sessionAutosaveRef = useRef<CoalescingAutosave<ProjectSession> | null>(null);
  const cloudSyncRef = useRef<CloudProjectSyncQueue | null>(null);
  const cloudSyncDeferredRef = useRef(false);
  const opModeStateRef = useRef<OpModeState>(opModeState);
  const workspaceLeaseRef = useRef<ProjectWorkspaceLease | null>(null);
  const persistedFilesRef = useRef<{ projectId: string; files: Record<string, string> }>({
    projectId: "",
    files: {},
  });
  const persistedSessionRef = useRef<ProjectSession | null>(null);
  const fileContentsRef = useRef<Record<string, string>>({});
  const blocksFlushRef = useRef<(() => Promise<void>) | null>(null);
  const blocksXmlRequestIdRef = useRef(0);
  const blocksHostFlushDepthRef = useRef(0);
  const opModeSessionRef = useRef<OpModeSession | null>(null);
  const buildSessionRef = useRef<OpModeSession | null>(null);
  useEffect(() => () => clearProjectArtifactCompletions(projectId), [projectId]);
  const workspaceMutationLockRef = useRef(false);
  const workspaceMutationPhaseRef = useRef<WorkspaceMutationPhase>("idle");
  const workspaceMutationTokenRef = useRef(0);
  const fileRevisionRef = useRef(0);
  const repositorySyncGenerationRef = useRef(0);
  const projectOpenGenerationRef = useRef(0);
  const cloudRepositoryCacheRef = useRef<{
    generation: number;
    prepared: Promise<PreparedCloudRepository>;
  } | null>(null);
  const artifactRevisionRef = useRef<number | null>(null);
  const fastReloadBaseRef = useRef<{artifact: LoadArtifact; files: Record<string, string | Uint8Array>} | null>(null);
  const liveProgramRef = useRef<{session: OpModeSession; revision: number; artifact: LoadArtifact} | null>(null);
  const buildGenerationRef = useRef(0);
  const lifecycleGenerationRef = useRef(0);
  const runtimeGenerationRef = useRef(0);
  const runtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runtimeTickPromisesRef = useRef(new Set<Promise<void>>());
  const runtimeLogBufferRef = useRef<string[]>([]);
  const runtimeLogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manifestRuntimeInvalidationRef = useRef(false);
  const runtimeTickSequenceRef = useRef(0);
  const physicsGrantSequenceRef = useRef(0);
  const workbenchRef = useRef<HTMLDivElement | null>(null);
  const commandPaletteRef = useRef<HTMLElement | null>(null);
  const commandOpenerRef = useRef<HTMLElement | null>(null);
  const configurationOpenerRef = useRef<HTMLElement | null>(null);
  const projectExportOpenerRef = useRef<HTMLElement | null>(null);
  const navigationBypassRef = useRef(false);
  const {
    build: canBuild,
    initialize: canInitialize,
    run: canRun,
    stop: canStop,
  } = getStudioActionAvailability(buildState.status, opModeState);
  const canBuildWorkspace = canBuild && !gitBusy && !workspaceMutationLocked && !hotReloadActive;
  const canInitializeWorkspace = canInitialize && !gitBusy && !workspaceMutationLocked && !hotReloadActive;
  const canRunWorkspace = canRun && !gitBusy && !workspaceMutationLocked && !hotReloadActive;
  const editorMutationLocked = readOnly || workspaceMutationLocked || opModeState === "initializing";
  const robotConfigurationLocked = readOnly
    || workspaceMutationLocked
    || buildState.status === "building"
    || opModeState === "initializing"
    || opModeState === "ready"
    || opModeState === "running";
  const robotConfigurationLockReason = readOnly
    ? "This project is open read-only in another tab."
    : opModeState === "initializing" || opModeState === "ready" || opModeState === "running"
      ? "Stop the OpMode before changing hardware."
      : buildState.status === "building" || workspaceMutationLocked
        ? "Wait for the current project operation to finish."
        : null;
  const saveStatus: AutosaveStatus = fileSaveStatus === "failed" || sessionSaveStatus === "failed"
    ? "failed"
    : fileSaveStatus === "saving" || sessionSaveStatus === "saving"
      ? "saving"
      : "saved";

  useEffect(() => () => hotReload.stop(), [hotReload]);

  useEffect(() => {
    catalogRef.current = projectCatalog;
  }, [projectCatalog]);

  useEffect(() => {
    hotReload.stop();
  }, [hotReload, projectId]);

  useEffect(() => {
    fileContentsRef.current = fileContents;
  }, [fileContents]);

  useEffect(() => {
    opModeStateRef.current = opModeState;
    const runtimeOwnsResources = (
      opModeState === "initializing"
      || opModeState === "ready"
      || opModeState === "running"
    );
    if (runtimeOwnsResources) {
      cloudSyncRef.current?.pause();
      return;
    }
    cloudSyncRef.current?.resume();
    if (cloudSyncDeferredRef.current) {
      cloudSyncDeferredRef.current = false;
      cloudSyncRef.current?.schedule();
    }
  }, [opModeState]);

  const scheduleCloudSync = useCallback(() => {
    if (
      opModeStateRef.current === "running"
      || opModeStateRef.current === "initializing"
      || opModeStateRef.current === "ready"
    ) {
      cloudSyncDeferredRef.current = true;
      cloudSyncRef.current?.pause();
      return;
    }
    cloudSyncDeferredRef.current = false;
    cloudSyncRef.current?.schedule();
  }, []);

  const lockWorkspaceMutations = useCallback(() => {
    const token = ++workspaceMutationTokenRef.current;
    workspaceMutationPhaseRef.current = "idle";
    workspaceMutationLockRef.current = true;
    setWorkspaceMutationLocked(true);
    return token;
  }, []);

  const unlockWorkspaceMutations = useCallback((token: number) => {
    if (workspaceMutationTokenRef.current !== token) return;
    workspaceMutationPhaseRef.current = "idle";
    workspaceMutationLockRef.current = false;
    setWorkspaceMutationLocked(false);
  }, []);

  const cancelWorkspaceMutationLock = useCallback(() => {
    workspaceMutationTokenRef.current++;
    workspaceMutationPhaseRef.current = "idle";
    workspaceMutationLockRef.current = false;
    setWorkspaceMutationLocked(false);
  }, []);

  const drainRuntimeTicks = useCallback(async () => {
    await Promise.allSettled([...runtimeTickPromisesRef.current]);
  }, []);

  const suspendStudioRuntime = useCallback(() => {
    buildGenerationRef.current++;
    void buildSessionRef.current?.close();
    buildSessionRef.current = null;
    lifecycleGenerationRef.current++;
    runtimeGenerationRef.current++;
    if (runtimeTimerRef.current) clearTimeout(runtimeTimerRef.current);
    tickBudget.reset();
    actuatorStore.neutralize();
    void opModeSessionRef.current?.close();
    gamepadRegistry.stop();
  }, [actuatorStore, gamepadRegistry, tickBudget]);

  useEffect(() => {
    // React Strict Mode intentionally runs setup → cleanup → setup in development.
    // Restarting this reversible listener lifecycle keeps keyboard gamepad1 alive
    // after that safety pass while still releasing it when the studio unmounts.
    gamepadRegistry.start();
    return suspendStudioRuntime;
  }, [gamepadRegistry, suspendStudioRuntime]);

  useEffect(() => {
    const poll = () => {
      const frame = gamepadRegistry.poll();
      gamepadFrameRef.current = frame;
      setInputSourceLabel((current) => current === frame.inputSourceLabel ? current : frame.inputSourceLabel);
    };
    poll();
    const interval = window.setInterval(poll, 20);
    return () => window.clearInterval(interval);
  }, [gamepadRegistry]);

  useEffect(() => {
    if (projectLoading) return;
    const workbench = workbenchRef.current;
    if (!workbench) return;

    const measure = () => {
      const rect = workbench.getBoundingClientRect();
      setWorkbenchSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workbench);
    return () => observer.disconnect();
  }, [projectLoading]);

  const openCommandPalette = useCallback(() => {
    if (document.activeElement instanceof HTMLElement
        && !document.activeElement.closest(".command-palette")) {
      commandOpenerRef.current = document.activeElement;
    }
    setCommandOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setCommandOpen(false);
    setCommandQuery("");
    const opener = commandOpenerRef.current;
    commandOpenerRef.current = null;
    window.requestAnimationFrame(() => opener?.focus());
  }, []);

  const closeCommandPaletteForFocusTransfer = useCallback(() => {
    setCommandOpen(false);
    setCommandQuery("");
    commandOpenerRef.current = null;
  }, []);

  const handleGamepadConfigurationOpenChange = useCallback((open: boolean) => {
    setGamepadConfigurationOpen(open);
    if (!open) setGamepadConfigurationReturnFocus(null);
  }, []);

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
      }
      if (event.key === "Escape") closeCommandPalette();
    };
    window.addEventListener("keydown", keyHandler, true);
    return () => window.removeEventListener("keydown", keyHandler, true);
  }, [closeCommandPalette, openCommandPalette]);

  useEffect(() => {
    if (!commandOpen) return;
    const backgroundRegions = document.querySelectorAll<HTMLElement>(
      ".studio-shell > .skip-link, .studio-shell > .app-header, .studio-shell > .workbench, .studio-shell > .status-bar",
    );
    backgroundRegions.forEach((region) => region.setAttribute("inert", ""));

    const dialog = commandPaletteRef.current;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1) as HTMLElement;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener("keydown", trapFocus);
    return () => {
      dialog?.removeEventListener("keydown", trapFocus);
      backgroundRegions.forEach((region) => region.removeAttribute("inert"));
    };
  }, [commandOpen]);

  const breadcrumb = useMemo(() => activePath.split("/"), [activePath]);
  const robotManifestSource = fileContents["ftcsim.project.json"];
  const robotConfiguration = useMemo<{ document: RobotConfigurationDocument | null; error: string | null }>(() => {
    try {
      if (!robotManifestSource) return { document: null, error: "ftcsim.project.json is missing." };
      return { document: openRobotConfiguration(robotManifestSource), error: null };
    } catch (error) {
      return {
        document: null,
        error: error instanceof Error ? error.message : "ftcsim.project.json is not valid.",
      };
    }
  }, [robotManifestSource]);
  const configuredMotors = useMemo<SimulatedMotorDescriptor[]>(() => (
    robotConfiguration.document?.resolved.motors.flatMap((motor) => {
      const profile = getMotorModelProfile(motor.motorModelId);
      return profile && motor.hardwareMapName ? [{
        name: motor.hardwareMapName,
        modelId: profile.id,
        ticksPerRevolution: profile.ticksPerRevolution,
        maxRpm: profile.maxRpm,
        achievableMaxRpmFraction: profile.achievableMaxRpmFraction,
      }] : [];
    }) ?? []
  ), [robotConfiguration.document]);
  const configuredMotorNames = useMemo(() => configuredMotors.map((motor) => motor.name), [configuredMotors]);
  const configuredHardware = useMemo<SimulatedHardwareManifest>(() => ({
    motors: configuredMotors,
    servos: robotConfiguration.document?.resolved.physical.servos.map((servo) => servo.name) ?? [],
    sensors: robotConfiguration.document?.resolved.physical.sensors.map(({ name, kind }) => ({ name, kind })) ?? [],
    cameras: robotConfiguration.document?.resolved.physical.cameras.map(({ name }) => ({ name })) ?? [],
    configurationHash: robotConfiguration.document?.resolved.configurationHash,
  }), [configuredMotors, robotConfiguration.document]);
  const configuredBlocksMotors = useMemo(() => (
    robotConfiguration.document?.resolved.motors.flatMap((motor) => (
      motor.hardwareMapName
        ? [{ id: motor.id, name: motor.hardwareMapName }]
        : []
    )) ?? []
  ), [robotConfiguration.document]);
  const playSettings = useMemo(() => readPlaySettings(robotConfiguration.document?.manifest ?? {}), [robotConfiguration.document]);
  useEffect(() => {
    gamepadRegistry.setKeyboardBindings(playSettings.keyboard);
  }, [gamepadRegistry, playSettings]);

  const simulatorRobotConfiguration = robotConfiguration.document?.resolved ?? FALLBACK_ROBOT_CONFIGURATION;
  const activeVariant = robotConfiguration.document?.resolved.variant ?? variant;
  const fieldPreset = robotConfiguration.document
    ? readFieldConfiguration(robotConfiguration.document.manifest).preset
    : "decode-2025-2026";
  const fieldParameters = useMemo(() => readFieldParameters(robotConfiguration.document?.manifest ?? {}), [robotConfiguration.document]);
  const assetExport = useMemo(() => ({ controller: advantageScopeAssets, identity: {
    key: `${projectId}:${simulatorRobotConfiguration.configurationHash}:${fieldPreset}`,
    projectId, projectName: projectRecord?.name ?? "Project", configurationHash: simulatorRobotConfiguration.configurationHash,
  } }), [advantageScopeAssets, projectId, projectRecord?.name, simulatorRobotConfiguration.configurationHash, fieldPreset]);
  useEffect(() => { advantageScopeAssets.setIdentity(assetExport.identity.key); }, [advantageScopeAssets, assetExport]);
  const loadMatchWorldOptions = useCallback(async (options: Parameters<typeof createBiobuzzWorldOptions>[0]) => ({
    ...await createBiobuzzWorldOptions(options), parameters: fieldParameters,
  }), [fieldParameters]);
  const runConfigurations = useMemo(() => discoverProjectOpModes(fileContents, generatedBlocksSourcePath), [fileContents]);
  const resolvedRunConfiguration = resolveRunOpMode(runConfigurations, runConfiguration, activePath);
  const effectiveRunConfiguration = ["initializing", "ready", "running"].includes(opModeState)
    ? runtimeEntryClass || resolvedRunConfiguration
    : resolvedRunConfiguration;
  const runTargetLabel = runConfigurations.find((configuration) => configuration.value === effectiveRunConfiguration)?.label;
  const normalizedCommandQuery = commandQuery.trim().toLocaleLowerCase();
  const matchingCommandFiles = useMemo(() => Object.keys(fileContents)
    .filter((path) => !normalizedCommandQuery || path.toLocaleLowerCase().includes(normalizedCommandQuery))
    .slice(0, 8), [fileContents, normalizedCommandQuery]);
  const existingProjectPaths = useMemo(() => new Set(Object.keys(fileContents)), [fileContents]);
  const commandMatches = (label: string) => (
    !normalizedCommandQuery || label.toLocaleLowerCase().includes(normalizedCommandQuery)
  );
  const workspaceCapabilities = getWorkspaceProjectCapabilities(projectRecord?.starter ?? "java");
  const compactWorkbench = workbenchSize.width < 1_120;
  const hasActiveEditor = openPaths.includes(activePath);
  const effectiveProjectOpen = (mobile || workspaceCapabilities.showProjectTree)
    && (mobile || (projectOpen && !(compactWorkbench && simulatorOpen)));
  const activeMobileView = mobileView === "code" && !hasActiveEditor ? "simulation" : mobileView;
  const showSimulator = mobile ? activeMobileView === "simulation" : simulatorOpen && rightTool === "simulator";
  const paneBounds = useMemo(() => getPaneBounds(
    preferredPaneLayout,
    workbenchSize.width,
    workbenchSize.height,
    effectiveProjectOpen,
    simulatorOpen,
  ), [effectiveProjectOpen, preferredPaneLayout, simulatorOpen, workbenchSize]);
  const paneLayout = useMemo(() => fitPaneLayout(
    preferredPaneLayout,
    workbenchSize.width,
    workbenchSize.height,
    effectiveProjectOpen,
    simulatorOpen,
  ), [effectiveProjectOpen, preferredPaneLayout, simulatorOpen, workbenchSize]);

  const workbenchStyle = {
    "--project-width": `${paneLayout.project}px`,
    "--simulator-width": `${paneLayout.simulator}px`,
    "--bottom-window-height": `${paneLayout.bottom}px`,
  } as CSSProperties;

  const updatePaneSize = useCallback((pane: keyof PaneLayout, value: number) => {
    setPreferredPaneLayout((current) => ({
      ...current,
      [pane]: clampPaneSize(value, PANE_LAYOUT_LIMITS[pane]),
    }));
  }, []);

  const resetPaneLayout = useCallback(() => {
    setPreferredPaneLayout(PANE_LAYOUT_DEFAULTS);
    closeCommandPalette();
  }, [closeCommandPalette]);

  const toggleProjectWindow = useCallback(() => {
    if (!workspaceCapabilities.showProjectTree) return;
    if (configurationMaximized) {
      setConfigurationMaximized(false);
      setProjectOpen(true);
      if (compactWorkbench) setSimulatorOpen(false);
      return;
    }
    if (!effectiveProjectOpen) {
      setProjectOpen(true);
      if (compactWorkbench) setSimulatorOpen(false);
    } else {
      setProjectOpen(false);
    }
  }, [
    compactWorkbench,
    configurationMaximized,
    effectiveProjectOpen,
    workspaceCapabilities.showProjectTree,
  ]);

  const openRightToolWindow = useCallback((tool: "simulator") => {
    setRightTool(tool);
    setSimulatorOpen(true);
    setMobileView("simulation");
  }, []);

  const toggleSimulatorWindow = useCallback(() => {
    if (simulatorOpen && rightTool === "simulator") setSimulatorOpen(false);
    else openRightToolWindow("simulator");
  }, [openRightToolWindow, rightTool, simulatorOpen]);

  const appendLog = useCallback((message: string) => {
    setRunLog((lines) => [...lines.slice(-40), message]);
  }, []);

  useEffect(() => {
    const notify = desktop?.setRuntimeActive;
    if (!notify) return;
    const active = buildState.status === "building" || opModeState === "initializing" ||
      opModeState === "ready" || opModeState === "running";
    const publish = () => {void notify(active).catch(error => appendLog(`DESKTOP — ${String(error)}`));};
    publish();
    const timer = active ? setInterval(publish,5000) : undefined;
    return () => {if(timer)clearInterval(timer);void notify(false).catch(()=>undefined);};
  }, [appendLog,buildState.status,desktop,opModeState]);

  const appendRuntimeLog = useCallback((message: string) => {
    runtimeLogBufferRef.current.push(message);
    if (runtimeLogTimerRef.current) return;
    runtimeLogTimerRef.current = setTimeout(() => {
      runtimeLogTimerRef.current = null;
      const batch = runtimeLogBufferRef.current.splice(0);
      if (batch.length > 0) setRunLog((lines) => [...lines, ...batch].slice(-80));
    }, 100);
  }, []);

  useEffect(() => () => {
    if (runtimeLogTimerRef.current) clearTimeout(runtimeLogTimerRef.current);
  }, []);

  const openProjectExportDialog = useCallback(() => {
    projectExportOpenerRef.current = commandPaletteRef.current?.contains(globalThis.document.activeElement)
      ? commandOpenerRef.current
      : globalThis.document.activeElement as HTMLElement | null;
    setProjectExportStatus("");
    setProjectExportOpen(true);
  }, []);

  const closeProjectExportDialog = useCallback(() => {
    setProjectExportOpen(false);
    window.requestAnimationFrame(() => projectExportOpenerRef.current?.focus());
  }, []);

  const openRobotConfigurationDialog = useCallback(() => {
    configurationOpenerRef.current = commandPaletteRef.current?.contains(globalThis.document.activeElement)
      ? commandOpenerRef.current
      : globalThis.document.activeElement as HTMLElement | null;
    setConfigurationMaximized(true);
    setConfigurationVisited(true);
    appendLog("Project Settings opened.");
  }, [appendLog]);

  const closeRobotConfiguration = useCallback(() => {
    setConfigurationMaximized(false);
    appendLog("Project Settings closed.");
    window.requestAnimationFrame(() => configurationOpenerRef.current?.focus());
  }, [appendLog]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => window.cancelAnimationFrame(frame);
  }, [configurationMaximized, paneLayout.bottom, paneLayout.project, paneLayout.simulator]);

  useEffect(() => {
    if (!configurationMaximized && !gameSimulationOpen) return;
    const background = document.querySelectorAll<HTMLElement>(
      ".studio-shell > .skip-link, .studio-shell > .app-header, .studio-shell > .workbench, .studio-shell > .status-bar",
    );
    background.forEach((element) => element.setAttribute("inert", ""));
    return () => {
      background.forEach((element) => element.removeAttribute("inert"));
    };
  }, [configurationMaximized, gameSimulationOpen]);

  useEffect(() => {
    if (!newOpModeOpen) return;
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(".studio-shell > *"),
    ).filter((element) => !element.classList.contains("new-opmode-dialog-root"));
    background.forEach((element) => element.setAttribute("inert", ""));
    return () => background.forEach((element) => element.removeAttribute("inert"));
  }, [newOpModeOpen]);

  useEffect(() => {
    if (exitState !== "failed") return;
    const background = document.querySelectorAll<HTMLElement>(
      ".studio-shell > .skip-link, .studio-shell > .app-header, .studio-shell > .workbench, .studio-shell > .status-bar",
    );
    background.forEach((element) => element.setAttribute("inert", ""));
    return () => background.forEach((element) => element.removeAttribute("inert"));
  }, [exitState]);

  useEffect(() => {
    if (!cloudConflictOpen) return;
    const background = document.querySelectorAll<HTMLElement>(
      ".studio-shell > .skip-link, .studio-shell > .app-header, .studio-shell > .workbench, .studio-shell > .status-bar",
    );
    background.forEach((element) => element.setAttribute("inert", ""));
    return () => background.forEach((element) => element.removeAttribute("inert"));
  }, [cloudConflictOpen]);

  useEffect(() => {
    if (!projectExportOpen) return;
    const background = document.querySelectorAll<HTMLElement>(
      ".studio-shell > .skip-link, .studio-shell > .app-header, .studio-shell > .workbench, .studio-shell > .status-bar",
    );
    background.forEach((element) => element.setAttribute("inert", ""));
    return () => background.forEach((element) => element.removeAttribute("inert"));
  }, [projectExportOpen]);

  const invalidateRuntime = useCallback(async (
    reason?: string,
    options: { preserveLifecycle?: boolean; preserveBuildArtifact?: boolean; preserveHotReload?: boolean } = {},
  ) => {
    if (!options.preserveHotReload) hotReload.stop();
    if (!options.preserveLifecycle) lifecycleGenerationRef.current++;
    runtimeGenerationRef.current++;
    if (runtimeTimerRef.current) {
      clearTimeout(runtimeTimerRef.current);
      runtimeTimerRef.current = null;
    }
    actuatorStore.neutralize();
    tickBudget.reset();
    setOpModeState("idle");
    const session = opModeSessionRef.current;
    opModeSessionRef.current = null;
    await stopRuntimeSession(session, runtimeTickPromisesRef.current);
    if (!options.preserveBuildArtifact) {
      fastReloadBaseRef.current = null;
      liveProgramRef.current = null;
      setBuildArtifact(null);
      artifactRevisionRef.current = null;
    }
    telemetryStore.reset();
    cloudSyncRef.current?.resume();
    if (reason) appendLog(reason);
  }, [actuatorStore, appendLog, hotReload, telemetryStore, tickBudget]);

  const applyGitWorkspace = useCallback((workspace: GitWorkspaceState) => {
    fileRevisionRef.current++;

    clearProjectArtifactCompletions(projectId);
    lastSuccessfulArtifactRef.current = null;
    artifactRevisionRef.current = null;
    const starter = projectRecord?.starter ?? "java";
    fileContentsRef.current = workspace.files;
    setFileContents(workspace.files);
    setWorktreeEntries(workspace.entries);
    persistedFilesRef.current = { projectId, files: workspace.files };
    repositorySyncGenerationRef.current++;
    cloudRepositoryCacheRef.current = null;
    setGitSnapshot(workspace.snapshot);
    setOpenBlocksXmlRequest(null);
    const editorState = resolveWorkspaceEditorState({
      starter,
      files: workspace.files,
      openTabs: openPaths,
      activeFile: activePath,
    });
    setOpenPaths(editorState.openTabs);
    setActivePath(editorState.activeFile);
  }, [activePath, openPaths, projectId, projectRecord?.starter]);

  const currentProjectRecordId = projectRecord?.id ?? null;

  const flushPendingSaves = useCallback(async () => {
    try {
      blocksHostFlushDepthRef.current++;
      try {
        await blocksFlushRef.current?.();
      } finally {
        blocksHostFlushDepthRef.current--;
      }
      await Promise.all([
        autosaveRef.current?.drain(),
        sessionAutosaveRef.current?.drain(),
      ]);
      setGitError(null);
      return gitSnapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The latest project changes could not be saved.";
      setGitError(message);
      throw error;
    }
  }, [gitSnapshot]);

  useEffect(() => desktop?.registerSaveBarrier?.(async () => { await flushPendingSaves(); }), [desktop, flushPendingSaves]);

  const currentProjectSession = useCallback((): ProjectSession | null => {
    if (!currentProjectRecordId || !projectSession || currentProjectRecordId !== projectId || readOnly) return null;
    return {
      ...projectSession,
      projectId,
      openTabs: openPaths,
      activeFile: activePath || null,
      selectedOpMode: runConfiguration || null,
      launchModes: { play: playLaunchMode, game: gameLaunchMode },
      robotConfiguration: {
        ...projectSession.robotConfiguration,
        drivetrain: activeVariant,
      },
      toolWindows: {
        project: workspaceCapabilities.showProjectTree && projectOpen,
        simulator: simulatorOpen,
        rightTool,
        bottom: bottomOpen,
        bottomTab,
        paneLayout: preferredPaneLayout,
      },
      updatedAt: new Date().toISOString(),
    };
  }, [
    activePath,
    activeVariant,
    bottomOpen,
    bottomTab,
    openPaths,
    preferredPaneLayout,
    projectId,
    projectOpen,
    currentProjectRecordId,
    projectSession,
    readOnly,
    rightTool,
    runConfiguration,
    playLaunchMode,
    gameLaunchMode,
    simulatorOpen,
    workspaceCapabilities.showProjectTree,
  ]);

  const scheduleCurrentProjectSession = useCallback(() => {
    const session = currentProjectSession();
    if (
      session
      && (
        !persistedSessionRef.current
        || !projectSessionsSemanticallyEqual(persistedSessionRef.current, session)
      )
    ) {
      sessionAutosaveRef.current?.schedule(session);
    }
    return session;
  }, [currentProjectSession]);

  const drainCloudSync = useCallback(async () => {
    const queue = cloudSyncRef.current;
    if (!queue) return;
    if (queue.status === "update-unavailable") {
      throw queue.error ?? new CloudSyncError(
        "SYNC_OFFLINE",
        "A newer account copy is available, but it has not been downloaded.",
      );
    }
    if (queue.error?.code === "SYNC_CONFLICT") {
      setCloudConflictError(null);
      setCloudConflictOpen(true);
      throw queue.error;
    }
    if (queue.error) await queue.retry();
    else await queue.drain();
  }, []);

  const executeGitOperation = useCallback(async (
    operation: (engine: BrowserGitEngine) => Promise<GitStatusSnapshot | GitWorkspaceState>,
    successMessage?: string,
    options: { invalidatesRuntime?: boolean; marksCloudDirty?: boolean } = {},
  ) => {
    const engine = gitEngineRef.current;
    if (!engine) throw new Error("The browser Git repository is not ready yet.");
    if (readOnly) throw new Error("This project is read-only because it is open in another tab.");
    if (workspaceMutationLockRef.current) throw new Error("Another workspace operation is still in progress.");

    const mutationToken = lockWorkspaceMutations();
    let dirtyRecord: ProjectRecord | null = null;
    setGitBusy(true);
    setGitError(null);
    try {
      // The exclusive lock rejects competing operations immediately. The
      // correlated host-flush scope below is the only source allowed to publish
      // its final Blocks snapshot while that lock is held.
      workspaceMutationPhaseRef.current = "flushing-blocks";
      await flushPendingSaves();
      workspaceMutationPhaseRef.current = "mutating";
      if (options.invalidatesRuntime !== false) {
        await invalidateRuntime("Runtime invalidated because the Git worktree changed.");
      }
      if (options.marksCloudDirty !== false) {
        // Persist the dirty bit before Git changes durable repository state.
        // A failed operation can leave a harmless extra sync, but a successful
        // operation can never remain falsely labelled Synced.
        const catalog = catalogRef.current;
        if (catalog) {
          dirtyRecord = await catalog.markCloudDirty(projectId);
          setProjectRecord(dirtyRecord);
          // Drop any prepared repository before the mutation starts. A Git
          // command may durably change several files and then throw; its final
          // sync must snapshot that partial local state, never the prior cache.
          repositorySyncGenerationRef.current++;
          cloudRepositoryCacheRef.current = null;
        }
      }
      const result = await operation(engine);
      if ("files" in result) applyGitWorkspace(result);
      else setGitSnapshot(result);
      if (successMessage) appendLog(successMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The Git operation failed.";
      setGitError(message);
      appendLog(`GIT — ${message}`);
      throw error;
    } finally {
      if (dirtyRecord) scheduleCloudSync();
      setGitBusy(false);
      unlockWorkspaceMutations(mutationToken);
    }
  }, [appendLog, applyGitWorkspace, flushPendingSaves, invalidateRuntime, lockWorkspaceMutations, projectId, readOnly, scheduleCloudSync, unlockWorkspaceMutations]);

  useEffect(() => {
    const openGeneration = ++projectOpenGenerationRef.current;
    let cancelled = false;
    const openController = new AbortController();
    const isCurrent = () => (
      !cancelled && projectOpenGenerationRef.current === openGeneration
    );
    let unsubscribeAutosave: (() => void) | null = null;
    let unsubscribeSessionAutosave: (() => void) | null = null;
    let unsubscribeCloudSync: (() => void) | null = null;
    let acquiredLease: ProjectWorkspaceLease | null = null;
    let cloudOpenWarning: string | null = null;
    const releaseLeaseForPageExit = () => {
      (workspaceLeaseRef.current ?? acquiredLease)?.release();
    };
    const catalog = catalogRef.current;
    if (!catalog) return;

    lastSuccessfulArtifactRef.current = null;
    buildGenerationRef.current++;
    void buildSessionRef.current?.close();
    buildSessionRef.current = null;
    lifecycleGenerationRef.current++;
    runtimeGenerationRef.current++;
    if (runtimeTimerRef.current) clearTimeout(runtimeTimerRef.current);
    tickBudget.reset();
    actuatorStore.neutralize();
    void opModeSessionRef.current?.close();
    opModeSessionRef.current = null;
    artifactRevisionRef.current = null;
    setBuildArtifact(null);

    setBuildState(INITIAL_BUILD_STATE);
    setOpModeState("idle");
    cancelWorkspaceMutationLock();

    // React cleanup cannot finish asynchronous work once the document is being
    // replaced. Release the native Web Lock synchronously on pagehide so a hard
    // reload never mistakes its own previous document for a second editor tab.
    window.addEventListener("pagehide", releaseLeaseForPageExit);

    setProjectLoading(true);
    setProjectError(null);
    setGitBusy(true);
    setCloudSyncStatus("idle");
    setCloudSyncError(null);
    cloudSyncRef.current?.close();
    cloudSyncRef.current = null;
    void (async () => {
      const lease = await acquireProjectWorkspaceLease(projectId);
      acquiredLease = lease;
      const local = await catalog.get(projectId);
      const cloudEnabled = shouldCheckCloudProjectOnOpen(projectAccountId, local);
      const forceCloudKey = `ftc-simulator:use-cloud-copy:${projectId}`;
      const retryCloudKey = `ftc-simulator:retry-cloud-copy:${projectId}`;
      const forceCloudCopy = window.sessionStorage.getItem(forceCloudKey) === "1";
      const retryCloudCopy = window.sessionStorage.getItem(retryCloudKey) === "1";
      window.sessionStorage.removeItem(forceCloudKey);
      window.sessionStorage.removeItem(retryCloudKey);
      if (!cloudEnabled) return lease;
      if (lease.readOnly && !local) {
        const writable = await lease.whenWritable;
        if (!writable || cancelled) throw new Error("Project access was cancelled before its cloud copy could open.");
      }
      if (lease.readOnly) {
        if (forceCloudCopy) window.sessionStorage.setItem(forceCloudKey, "1");
        if (retryCloudCopy) window.sessionStorage.setItem(retryCloudKey, "1");
        cloudOpenWarning = "Cloud refresh is waiting for the other editor tab to close.";
        return lease;
      }
      if (forceCloudCopy) {
        await hydrateCloudProject(
          catalog,
          await getCurrentCloudProject(projectId, openController.signal),
          openController.signal,
        );
        return lease;
      }
      if (retryCloudCopy) {
        const latestLocal = await catalog.get(projectId);
        if (latestLocal?.cloud?.status !== "synced") {
          await ensureCloudProjectAvailable(catalog, projectId, undefined, openController.signal);
        } else {
          await hydrateCloudProject(
            catalog,
            await getCurrentCloudProject(projectId, openController.signal),
            openController.signal,
          );
        }
        return lease;
      }
      try {
        await ensureCloudProjectAvailable(catalog, projectId, undefined, openController.signal);
      } catch (error) {
        if (!local) throw error;
        cloudOpenWarning = error instanceof Error
          ? error.message
          : "Cloud sync is unavailable; the local project was opened.";
      }
      return lease;
    })().then((lease) => {
      return Promise.all([
        catalog.open(projectId, { touch: !lease.readOnly, migrateLegacyBlocks: !lease.readOnly }),
        catalog.loadSession(projectId),
      ])
        .then(([workspace, session]) => [workspace, session, lease] as const);
    }).then(([workspace, session, lease]) => {
      if (cancelled) {
        lease.release();
        return;
      }
      workspaceLeaseRef.current = lease;
      gitEngineRef.current = workspace.git;
      setReadOnly(lease.readOnly);
      if (lease.readOnly) {
        void lease.whenWritable.then((writable) => {
          if (!cancelled && writable) {
            appendLog("Write access restored; reopening against the latest cloud revision.");
            navigationBypassRef.current = true;
            window.location.reload();
          }
        });
      }
      persistedSessionRef.current = session;
      setProjectRecord(workspace.record);
      void catalog.list().then((projects) => {
        if (!cancelled) setRecentProjects(projects);
      });
      setProjectSession(session);
      fileRevisionRef.current++;
      clearProjectArtifactCompletions(projectId);
      artifactRevisionRef.current = null;
      fileContentsRef.current = workspace.state.files;
      setFileContents(workspace.state.files);
      setWorktreeEntries(workspace.state.entries);
      persistedFilesRef.current = { projectId: workspace.record.id, files: workspace.state.files };
      repositorySyncGenerationRef.current++;
      cloudRepositoryCacheRef.current = null;
      setGitSnapshot(workspace.state.snapshot);
      const editorState = resolveWorkspaceEditorState({
        starter: workspace.record.starter,
        files: workspace.state.files,
        openTabs: session.openTabs,
        activeFile: session.activeFile,
      });
      setOpenPaths(editorState.openTabs);
      setActivePath(editorState.activeFile);
      const storedOpMode = session.selectedOpMode;
      setPlayLaunchMode(session.launchModes?.play ?? "build");
      setGameLaunchMode(session.launchModes?.game ?? "build");
      const duplicatedPrefix = `${workspace.record.javaPackage}.${workspace.record.javaPackage}.`;
      setRunConfiguration(
        storedOpMode?.startsWith(duplicatedPrefix)
          ? storedOpMode.slice(workspace.record.javaPackage.length + 1)
          : storedOpMode?.includes(".")
            ? storedOpMode
            : storedOpMode
              ? `${workspace.record.javaPackage}.${storedOpMode}`
              : "",
      );
      setVariant(session.robotConfiguration.drivetrain);
      // Older Blocks sessions saved the project pane as closed while it did
      // not exist. Show the new OpMode list when those projects reopen.
      setProjectOpen(workspace.record.starter === "blocks" || session.toolWindows.project);
      setSimulatorOpen(session.toolWindows.simulator);
      // Hardware configuration is an object-level dialog, not a competing
      // simulator tool window. Normalize sessions written by earlier builds.
      setRightTool("simulator");
      const sessionPaneLayout = session.toolWindows.paneLayout;
      if (sessionPaneLayout) {
        setPreferredPaneLayout({
          project: clampPaneSize(sessionPaneLayout.project ?? PANE_LAYOUT_DEFAULTS.project, PANE_LAYOUT_LIMITS.project),
          simulator: clampPaneSize(sessionPaneLayout.simulator ?? PANE_LAYOUT_DEFAULTS.simulator, PANE_LAYOUT_LIMITS.simulator),
          bottom: clampPaneSize(sessionPaneLayout.bottom ?? PANE_LAYOUT_DEFAULTS.bottom, PANE_LAYOUT_LIMITS.bottom),
        });
      }
      setBottomOpen(session.toolWindows.bottom);
      if (["Run", "Build", "Problems", "Telemetry", "Debug"].includes(session.toolWindows.bottomTab)) {
        setBottomTab(session.toolWindows.bottomTab as BottomTab);
      }

      const autosave = new CoalescingAutosave<Record<string, string>>(async (files) => {
        if (lease.readOnly) throw new Error("This project is read-only because it is open in another tab.");
        const baseline = persistedFilesRef.current.projectId === workspace.record.id
          ? persistedFilesRef.current.files
          : {};
        const changed = Object.entries(files).some(([path, content]) => (
          baseline[path] !== content
        ));
        if (changed) {
          const dirty = await catalog.markCloudDirty(workspace.record.id);
          if (isCurrent()) setProjectRecord(dirty);
        }
        let snapshot: GitStatusSnapshot | null = null;
        for (const [path, content] of Object.entries(files)) {
          if (baseline[path] === content) continue;
          snapshot = await workspace.git.writeFile(path, content);
        }
        await desktopSaveFiles?.(workspace.record.id, files);
        if (isCurrent()) {
          persistedFilesRef.current = { projectId: workspace.record.id, files: { ...files } };
        }
        if (snapshot && isCurrent()) {
          repositorySyncGenerationRef.current++;
          cloudRepositoryCacheRef.current = null;
          setGitSnapshot(snapshot);
          scheduleCloudSync();
        }
      });
      autosaveRef.current = autosave;
      unsubscribeAutosave = autosave.subscribe((status, error) => {
        setFileSaveStatus(status);
        if (error) setGitError(error.message);
      });
      const sessionAutosave = new CoalescingAutosave<ProjectSession>(async (nextSession) => {
        if (lease.readOnly) throw new Error("This project is read-only because it is open in another tab.");
        const dirty = await catalog.markCloudDirty(nextSession.projectId);
        await catalog.saveSession(nextSession);
        if (isCurrent()) {
          persistedSessionRef.current = nextSession;
          setProjectRecord((current) => (
            current?.id === nextSession.projectId
              ? {
                  ...dirty,
                  drivetrain: nextSession.robotConfiguration.drivetrain,
                }
              : current
          ));
          setRecentProjects((projects) => {
            let changed = false;
            const next = projects.map((project) => {
              if (project.id !== nextSession.projectId
                  || project.drivetrain === nextSession.robotConfiguration.drivetrain) return project;
              changed = true;
              return { ...project, drivetrain: nextSession.robotConfiguration.drivetrain };
            });
            return changed ? next : projects;
          });
          scheduleCloudSync();
        }
      });
      sessionAutosaveRef.current = sessionAutosave;
      unsubscribeSessionAutosave = sessionAutosave.subscribe((status, error) => {
        setSessionSaveStatus(status);
        if (error) setGitError(error.message);
      });
      const cloudUpdateUnavailable = workspace.record.cloud?.availableRevision !== undefined
        && (
          workspace.record.cloud.availableRevision > workspace.record.cloud.revision
          || (
            workspace.record.cloud.availableRevision === workspace.record.cloud.revision
            && workspace.record.cloud.availableManifestSha256 !== workspace.record.cloud.manifestSha256
          )
        );
      const cloudUpdateError = cloudUpdateUnavailable
        ? new CloudSyncError(
            "SYNC_OFFLINE",
            "A newer account copy is available, but it could not be downloaded. Retry to open that copy.",
          )
        : null;
      if (projectAccountId && workspace.record.cloudSyncEnabled) {
      const cloudSync = new CloudProjectSyncQueue(async (signal) => {
        await Promise.all([
          autosave.drain(),
          sessionAutosave.drain(),
        ]);
        const latestRecord = await catalog.get(workspace.record.id);
        if (!latestRecord) throw new CloudSyncError("SYNC_FAILED", "The local project record disappeared before sync.");
        if (!latestRecord.cloudSyncEnabled) return;
        // Coalesced UI effects can leave a harmless extra queue signal behind.
        // A clean cloud receipt is authoritative; do not manufacture another
        // revision from a no-op project open.
        if (latestRecord.cloud?.status === "synced") {
          const available = latestRecord.cloud.availableRevision !== undefined
            && (
              latestRecord.cloud.availableRevision > latestRecord.cloud.revision
              || (
                latestRecord.cloud.availableRevision === latestRecord.cloud.revision
                && latestRecord.cloud.availableManifestSha256 !== latestRecord.cloud.manifestSha256
              )
            );
          if (available) {
            throw new CloudSyncError(
              "SYNC_OFFLINE",
              "A newer account copy is available, but it has not been downloaded.",
            );
          }
          return;
        }
        if (latestRecord.cloud?.status === "conflict") {
          throw new CloudSyncError(
            "SYNC_CONFLICT",
            "This project changed on another device. Choose which copy to keep.",
            latestRecord.cloud.conflictRevision === undefined ? undefined : {
              revision: latestRecord.cloud.conflictRevision,
              manifestSha256: latestRecord.cloud.conflictManifestSha256 ?? "",
              updatedAt: latestRecord.cloud.cloudUpdatedAt ?? new Date().toISOString(),
            },
          );
        }
        const latestSession = await catalog.loadSession(workspace.record.id);
        const repositoryGeneration = repositorySyncGenerationRef.current;
        let repositoryCache = cloudRepositoryCacheRef.current;
        if (!repositoryCache || repositoryCache.generation !== repositoryGeneration) {
          const prepared = prepareCloudRepository(workspace.git, signal);
          repositoryCache = { generation: repositoryGeneration, prepared };
          cloudRepositoryCacheRef.current = repositoryCache;
          void prepared.catch(() => {
            if (cloudRepositoryCacheRef.current?.prepared === prepared) {
              cloudRepositoryCacheRef.current = null;
            }
          });
        }
        const synced = await syncProjectToCloud({
          catalog,
          engine: workspace.git,
          record: latestRecord,
          session: latestSession,
          preparedRepository: await repositoryCache.prepared,
          signal,
        });
        if (isCurrent()) {
          setProjectRecord(synced);
          setRecentProjects((projects) => projects.map((project) => (
            project.id === synced.id ? synced : project
          )));
          if (synced.cloud?.status === "dirty") scheduleCloudSync();
        }
      }, 1_500, cloudUpdateUnavailable
        ? "update-unavailable"
        : workspace.record.cloud?.status === "synced"
          ? "synced"
          : "idle", cloudUpdateError);
      cloudSyncRef.current = cloudSync;
      unsubscribeCloudSync = cloudSync.subscribe((status, error) => {
        if (cancelled) return;
        setCloudSyncStatus(status);
        setCloudSyncError(error);
      });
      if (!lease.readOnly && workspace.record.cloud?.status !== "synced") scheduleCloudSync();
      }
      setGitError(null);
      appendLog(`Project ${workspace.record.name} ready on ${workspace.state.snapshot.branch}.`);
      if (cloudOpenWarning) appendLog(`SYNC — ${cloudOpenWarning}`);
    }).catch((error: unknown) => {
      if (cancelled) {
        acquiredLease?.release();
        return;
      }
      acquiredLease?.release();
      acquiredLease = null;
      const message = error instanceof Error ? error.message : "Project workspace could not be opened.";
      setProjectError(message);
      setGitError(message);
      appendLog(`PROJECT — ${message}`);
    }).finally(() => {
      if (!cancelled) {
        setGitBusy(false);
        setProjectLoading(false);
        setHotReloadActive(false);
      }
    });

    return () => {
      cancelled = true;
      openController.abort();
      window.removeEventListener("pagehide", releaseLeaseForPageExit);
      unsubscribeAutosave?.();
      unsubscribeSessionAutosave?.();
      unsubscribeCloudSync?.();
      const autosave = autosaveRef.current;
      const sessionAutosave = sessionAutosaveRef.current;
      const cloudSync = cloudSyncRef.current;
      const lease = workspaceLeaseRef.current ?? acquiredLease;
      autosaveRef.current = null;
      sessionAutosaveRef.current = null;
      persistedSessionRef.current = null;
      cloudSyncRef.current = null;
      cloudSyncDeferredRef.current = false;
      workspaceLeaseRef.current = null;
      gitEngineRef.current = null;
      cloudSync?.close();
      void Promise.all([
        autosave?.drain().catch(() => undefined),
        sessionAutosave?.drain().catch(() => undefined),
      ]).finally(() => lease?.release());
    };
  }, [actuatorStore, appendLog, cancelWorkspaceMutationLock, desktopSaveFiles, projectAccountId, projectCatalog, projectId, scheduleCloudSync, tickBudget]);

  useEffect(() => {
    const save = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      scheduleCurrentProjectSession();
      void flushPendingSaves()
        .then(drainCloudSync)
        .catch(() => undefined);
    };
    window.addEventListener("keydown", save, true);
    return () => window.removeEventListener("keydown", save, true);
  }, [drainCloudSync, flushPendingSaves, scheduleCurrentProjectSession]);

  useEffect(() => {
    if (saveStatus === "saved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveStatus]);

  useEffect(() => {
    const navigation = (window as Window & { navigation?: BrowserNavigation }).navigation;
    if (!navigation || saveStatus === "saved") return;
    const guardNavigation = (rawEvent: Event) => {
      if (navigationBypassRef.current) {
        navigationBypassRef.current = false;
        return;
      }
      const event = rawEvent as BrowserNavigateEvent;
      if (!event.canIntercept || event.downloadRequest || event.hashChange) return;
      event.intercept({
        handler: async () => {
          try {
            await flushPendingSaves();
          } catch {
            const leave = window.confirm("The latest edit could not be saved. Leave this project without saving it?");
            if (!leave) throw new DOMException("Navigation cancelled", "AbortError");
          }
        },
      });
    };
    navigation.addEventListener("navigate", guardNavigation);
    return () => navigation.removeEventListener("navigate", guardNavigation);
  }, [flushPendingSaves, saveStatus]);

  useLayoutEffect(() => {
    // Mark session changes unsaved before the updated pane/tab state is painted.
    // A quick Save/reload must not observe the previous "Saved locally" state.
    scheduleCurrentProjectSession();
  }, [scheduleCurrentProjectSession]);

  const handleGitRefresh = useCallback(async () => {
    await executeGitOperation((engine) => engine.status(), undefined, {
      invalidatesRuntime: false,
      marksCloudDirty: false,
    });
  }, [executeGitOperation]);

  const handleGitCommit = useCallback(async (message: string) => {
    await executeGitOperation(
      (engine) => engine.stageAllAndCommit(message),
      `Committed all changes: ${message}`,
      { invalidatesRuntime: false },
    );
  }, [executeGitOperation]);

  const handleGitCreateBranch = useCallback(async (name: string) => {
    await executeGitOperation(async (engine) => {
      await engine.createBranch(name);
      return engine.checkoutBranch(name);
    }, `Created and checked out branch ${name}.`, { invalidatesRuntime: false });
  }, [executeGitOperation]);

  const handleGitCheckout = useCallback(async (name: string) => {
    await executeGitOperation(
      (engine) => engine.checkoutBranch(name),
      `Checked out branch ${name}.`,
    );
  }, [executeGitOperation]);

  const handleGitDiscard = useCallback(async () => {
    if (!window.confirm("Discard every uncommitted change in this browser workspace? This cannot be undone.")) return;
    await executeGitOperation(
      (engine) => engine.discardWorkingChanges(),
      "Discarded all uncommitted Git changes.",
    );
  }, [executeGitOperation]);

  const handleGitFetch = useCallback(async (credential?: GitCredential) => {
    await executeGitOperation(
      (engine) => engine.fetchRemote(credential),
      "Fetched the latest GitHub references.",
      { invalidatesRuntime: false },
    );
  }, [executeGitOperation]);

  const handleGitPull = useCallback(async (credential?: GitCredential) => {
    await executeGitOperation(
      (engine) => engine.pullRemote(credential),
      "Pulled the current branch from GitHub.",
    );
  }, [executeGitOperation]);

  const handleGitPush = useCallback(async (credential?: GitCredential) => {
    await executeGitOperation(
      (engine) => engine.pushRemote(credential),
      "Pushed the current branch to GitHub.",
      { invalidatesRuntime: false },
    );
  }, [executeGitOperation]);

  const handleGitPublish = useCallback(async (selection: GitHubPublishSelection) => {
    await executeGitOperation(async (engine) => {
      const catalog = catalogRef.current;
      if (!catalog) throw new Error("The project is not ready yet.");
      const current = await engine.status();
      if (current.dirty) await engine.stageAllAndCommit("Prepare project for GitHub");
      let remote = projectRecord?.remote;
      if (remote && (remote.repository.toLowerCase() !== selection.name.toLowerCase() || remote.private !== selection.private)) {
        throw new Error("This project is already connected to a different repository.");
      }
      if (!remote) {
        const repository = await createGitHubRepository(selection.name, selection.private, selection.credential);
        remote = { provider: "github", ...repository, branch: current.branch, shallowDepth: 0 };
      }
      await engine.configureRemote({
        url: `https://github.com/${remote.owner}/${remote.repository}.git`,
        corsProxy: `${window.location.origin}/api/git/github`,
      });
      // Remember the destination before uploading so a failed push can be retried after reload.
      const record = await catalog.setRemote(projectId, remote);
      setProjectRecord(record);
      return engine.pushRemote(selection.credential);
    }, "Published the project to GitHub.", { invalidatesRuntime: false });
  }, [executeGitOperation, projectId, projectRecord?.remote]);

  const openBottom = useCallback((tab: BottomTab) => {
    setConfigurationMaximized(false);
    setBottomTab(tab);
    setBottomOpen(true);
    if (tab === "Debug") setPreferredPaneLayout((current) => current.bottom >= 320 ? current : { ...current, bottom: 320 });
  }, []);

  const openFile = (path: string) => {
    if (!(path in fileContentsRef.current)) return;
    setOpenBlocksXmlRequest(null);
    setOpenPaths((paths) => paths.includes(path) ? paths : [...paths, path]);
    setActivePath(path);
    setMobileView("code");
  };

  const handleOpenFile = (path: string) => {
    if (path === activePath) { setMobileView("code"); return; }
    if (activePath.endsWith(".blk") && blocksFlushRef.current) {
      void blocksFlushRef.current()
        .then(() => openFile(path))
        .catch((error) => {
          setGitError(error instanceof Error ? error.message : "The Blocks OpMode could not be saved.");
        });
      return;
    }
    openFile(path);
  };

  useEffect(() => {
    return debuggerController.setHandlers({ onLocation: (frame) => {
      if (!frame.path || !(frame.path in fileContentsRef.current)) return;
      setOpenPaths((paths) => paths.includes(frame.path!) ? paths : [...paths, frame.path!]);
      setActivePath(frame.path);
      setEditorLocation({ path: frame.path, line: frame.line, nonce: Date.now() });
    }, onPause: () => {
      openBottom("Debug");
    }, onVariables: (state, frameId) => {
      const time = analysisStore.getSnapshot().end;
      const frame = state.frames.find((entry) => entry.id === frameId);
      analysisStore.record(time, { "/Session/DebugPaused": true,
        ...variableChannels(frame?.variables ?? [], "/Debug/Locals"), ...variableChannels(state.watches, "/Debug/Watches") });
    }, onTerminated: () => { void invalidateRuntime("The debugger stopped. Motor demand returned to zero.", { preserveBuildArtifact: true }); } });
  }, [analysisStore, debuggerController, invalidateRuntime, openBottom]);

  const openRobotConfigurationManifest = () => {
    setConfigurationMaximized(false);
    handleOpenFile("ftcsim.project.json");
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".monaco-editor textarea")?.focus());
  };

  const handleCreateTeamCodeFile = () => {
    if (
      readOnly
      || workspaceMutationLockRef.current
      || !projectRecord
      || !workspaceCapabilities.allowNewOpMode
    ) return;
    setNewOpModeReturnFocus(document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null);
    setNewOpModeKind("teleop");
    setNewOpModeOpen(true);
  };

  const handleCreateBlocksOpMode = (kind: OpModeKind) => {
    if (editorMutationLocked || projectRecord?.starter !== "blocks") return;
    setNewOpModeReturnFocus(document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null);
    setNewOpModeKind(kind);
    setNewOpModeOpen(true);
  };

  const handleCreateOpMode = async (input: NewOpModeInput) => {
    if (readOnly || workspaceMutationLockRef.current || !projectRecord) return;
    if (activePath.endsWith(".blk")) await blocksFlushRef.current?.();
    const created = await createNewOpModeFiles(input);
    for (const path of Object.keys(created.files)) {
      if (path in fileContentsRef.current) throw new Error(`${path.split("/").at(-1)} already exists.`);
    }
    const next = { ...fileContentsRef.current, ...created.files };
    fileContentsRef.current = next;
    fileRevisionRef.current++;
    artifactRevisionRef.current = null;
    setFileContents(next);
    autosaveRef.current?.schedule(next);
    setOpenPaths((paths) => paths.includes(created.paths.sourcePath) ? paths : [...paths, created.paths.sourcePath]);
    setOpenBlocksXmlRequest(null);
    setActivePath(created.paths.sourcePath);
    setBuildArtifact(null);
    setBuildState((current) => current.status === "succeeded" ? {
      ...INITIAL_BUILD_STATE,
      title: "Build artifact is stale",
      detail: "A new OpMode was added. Choose Build and Play to compile it.",
    } : current);
    setGitError(null);
    setNewOpModeOpen(false);
  };

  const closeFile = (path: string) => {
    setOpenPaths((paths) => {
      const next = paths.filter((candidate) => candidate !== path);
      if (path === activePath) setActivePath(next.at(-1) ?? "");
      return next;
    });
  };

  const handleCloseFile = (path: string) => {
    if (path === activePath && activePath.endsWith(".blk") && blocksFlushRef.current) {
      void blocksFlushRef.current()
        .then(() => closeFile(path))
        .catch((error) => {
          setGitError(error instanceof Error ? error.message : "The Blocks OpMode could not be saved.");
        });
      return;
    }
    closeFile(path);
  };

  const handleEditorChange = (path: string, value: string) => {
    if (readOnly || workspaceMutationLockRef.current || opModeStateRef.current === "initializing") return;
    if (isGeneratedBlocksJava(fileContentsRef.current[path] ?? "")) {
      setGitError("Generated Blocks Java is read-only. Edit the paired .blk OpMode instead.");
      return;
    }
    if (path === "ftcsim.project.json"
        && (opModeState === "ready" || opModeState === "running")
        && !manifestRuntimeInvalidationRef.current) {
      manifestRuntimeInvalidationRef.current = true;
      void invalidateRuntime("Runtime stopped because the robot configuration changed in the editor.")
        .finally(() => { manifestRuntimeInvalidationRef.current = false; });
    }
    if (path === "ftcsim.project.json") lastSuccessfulArtifactRef.current = null;
    fileRevisionRef.current++;
    artifactRevisionRef.current = null;
    setBuildArtifact(null);
    setBuildState((current) => current.status === "succeeded" ? {
      ...INITIAL_BUILD_STATE,
      title: "Build artifact is stale",
      detail: "TeamCode changed. Play uses the last successful build; choose Build and Play to compile these edits.",
    } : current);
    // Schedule persistence from the input event. React may replay state updater
    // functions during rendering; those updaters must not start writes or set
    // autosave status. The ref also retains consecutive edits before a render.
    const next = { ...fileContentsRef.current, [path]: value };
    fileContentsRef.current = next;
    setFileContents(next);
    autosaveRef.current?.schedule(next);
  };

  const handleBlocksSnapshot = useCallback((
    sourcePath: string,
    sourceXml: string,
    javaPath: string,
    generatedJava?: string,
  ) => {
    if (!canAcceptBlocksSnapshot({
      readOnly,
      workspaceLocked: workspaceMutationLockRef.current,
      workspacePhase: workspaceMutationPhaseRef.current,
      hostFlushDepth: blocksHostFlushDepthRef.current,
      runtimeInitializing: opModeState === "initializing",
    })) return false;
    const current = fileContentsRef.current;
    if (current[sourcePath] === sourceXml
        && (generatedJava === undefined || current[javaPath] === generatedJava)) return true;
    const next = {
      ...current,
      [sourcePath]: sourceXml,
      ...(generatedJava === undefined ? {} : { [javaPath]: generatedJava }),
    };
    fileContentsRef.current = next;
    fileRevisionRef.current++;
    artifactRevisionRef.current = null;
    setBuildArtifact(null);
    setBuildState((currentState) => currentState.status === "succeeded" ? {
      ...INITIAL_BUILD_STATE,
      title: "Build artifact is stale",
      detail: "Blocks changed. Play uses the last successful build; choose Build and Play to regenerate and compile TeamCode.",
    } : currentState);
    setFileContents(next);
    autosaveRef.current?.schedule(next);
    return true;
  }, [opModeState, readOnly]);

  const registerBlocksFlush = useCallback((flush: (() => Promise<void>) | null) => {
    blocksFlushRef.current = flush;
  }, []);

  const acknowledgeBlocksXmlRequest = useCallback((id: number) => {
    setOpenBlocksXmlRequest((current) => current?.id === id ? null : current);
  }, []);

  const handleBlocksKeyboardInput = useCallback((
    message: Pick<BlocksFrameKeyboardMessage, "phase" | "code">,
  ) => {
    if (message.phase === "reset") {
      gamepadRegistry.resetKeyboardInput();
      return;
    }
    if (message.code) {
      gamepadRegistry.setKeyboardInput(message.code, message.phase === "down");
    }
  }, [gamepadRegistry]);

  const handlePlaySettingsChange = (settings: PlaySettings) => {
    if (robotConfigurationLocked || !robotConfiguration.document) return;
    const updated = { ...robotConfiguration.document, manifest: writePlaySettings(robotConfiguration.document.manifest, settings) };
    const next = { ...fileContentsRef.current, "ftcsim.project.json": serializeRobotConfiguration(updated) };
    fileContentsRef.current = next;
    setFileContents(next);
    autosaveRef.current?.schedule(next);
  };

  const handleFieldParametersChange = (parameters: FieldParameters) => {
    if (robotConfigurationLocked || !robotConfiguration.document) return;
    const current = robotConfiguration.document;
    const updated = { ...current, manifest: writeFieldConfiguration(current.manifest, { preset: fieldPreset, parameters }) };
    const next = { ...fileContentsRef.current, "ftcsim.project.json": serializeRobotConfiguration(updated) };
    fileContentsRef.current = next;
    setFileContents(next);
    autosaveRef.current?.schedule(next);
  };

  useEffect(() => {
    const current = robotConfiguration.document;
    if (robotConfigurationLocked || !current) return;
    const field = current.manifest.field;
    if (field && typeof field === "object" && "parameters" in field) return;
    try {
      const legacy = localStorage.getItem(`ftc-simulator:robot-physics:${projectId}:v1:shared-world`);
      if (!legacy) return;
      const parameters = normalizeFieldParameters(JSON.parse(legacy));
      const updated = { ...current, manifest: writeFieldConfiguration(current.manifest, { preset: fieldPreset, parameters }) };
      const next = { ...fileContentsRef.current, "ftcsim.project.json": serializeRobotConfiguration(updated) };
      fileContentsRef.current = next;
      setFileContents(next);
      autosaveRef.current?.schedule(next);
    } catch { /* Ignore invalid legacy browser settings; the manifest remains authoritative. */ }
  }, [fieldPreset, projectId, robotConfiguration.document, robotConfigurationLocked]);

  const handleRobotConfigurationCommand = (command: RobotConfigurationCommand) => {
    if (readOnly || workspaceMutationLockRef.current) return false;
    const current = robotConfiguration.document;
    if (!current) {
      setGitError(robotConfiguration.error ?? "Robot configuration is unavailable.");
      return false;
    }
    if (command.type === "import-cad-robot" && command.configuration.physical.visualModel?.glbBase64) {
      const manifestBeforeImport = fileContentsRef.current["ftcsim.project.json"];
      return (async () => {
        const packed = await packCadModel(command.configuration.physical.visualModel!);
        if (!packed) return false;
        const configuration = structuredClone(command.configuration);
        configuration.physical.visualModel = packed.model;
        const updated = applyRobotConfigurationCommand(current, { type: "import-cad-robot", configuration });
        await executeGitOperation(async (engine) => {
          if (fileContentsRef.current["ftcsim.project.json"] !== manifestBeforeImport) throw new Error("Robot settings changed while the model was being saved. Review the import and try again.");
          await engine.writeFile(packed.model.asset!.path, packed.bytes);
          await engine.writeFile("ftcsim.project.json", serializeRobotConfiguration(updated));
          return engine.getState();
        });
        setVariant(updated.resolved.variant); setBuildArtifact(null);
        return true;
      })();
    }
    const effect = robotConfigurationCommandEffect(command);
    lastSuccessfulArtifactRef.current = null;
    if (effect === "hardware") {
      void invalidateRuntime("Runtime invalidated because the robot configuration changed.");
    }
    const updated = applyRobotConfigurationCommand(current, command);
    setVariant(updated.resolved.variant);
    if (effect === "hardware") {
      setBuildArtifact(null);
      fileRevisionRef.current++;
      artifactRevisionRef.current = null;
      setBuildState((currentState) => currentState.status === "succeeded" ? {
        ...INITIAL_BUILD_STATE,
        title: "Build artifact is stale",
        detail: "Robot hardware changed. Choose Build and Play to compile this configuration.",
      } : currentState);
    }
    const next = { ...fileContentsRef.current, "ftcsim.project.json": serializeRobotConfiguration(updated) };
    fileContentsRef.current = next;
    setFileContents(next);
    autosaveRef.current?.schedule(next);
    setGitError(updated.diagnostics[0]?.message ?? null);
    return true;
  };

  const buildProgram = useCallback(async (
    options: { preserveLifecycle?: boolean; hotReload?: boolean; onBuildProgress?: (progress: BuildJobProgress) => void } = {},
  ): Promise<LoadArtifact | null> => {
    if (workspaceMutationLockRef.current) return null;
    const buildGeneration = ++buildGenerationRef.current;
    let buildRevision = fileRevisionRef.current;
    let buildFiles = { ...fileContentsRef.current };
    let mutationToken: number | null = null;
    openBottom("Build");
    closeCommandPalette();
    setBuildState({
      status: "building",
      startedAt: performance.now(),
      title: "Building TeamCode…",
      detail: "Saving the working tree and running its Gradle build.",
      diagnostics: [],
    });

    try {
      await flushPendingSaves();
      mutationToken = lockWorkspaceMutations();
      buildRevision = fileRevisionRef.current;
      buildFiles = { ...fileContentsRef.current };
      const blocksDiagnostics = await validateBlocksGeneratedSources(
        buildFiles,
        robotConfiguration.document?.resolved.configurationHash ?? "00000000",
      );
      if (blocksDiagnostics.length > 0) {
        setBuildState({
          status: "failed",
          title: "Blocks generation required",
          detail: blocksDiagnostics[0].message,
          diagnostics: blocksDiagnostics,
        });
        appendLog(`BUILD FAILED — ${blocksDiagnostics[0].message}`);
        blocksDiagnostics.forEach((diagnostic) => appendLog(formatBuildDiagnostic(diagnostic)));
        openBottom("Problems");
        unlockWorkspaceMutations(mutationToken);
        mutationToken = null;
        return null;
      }
      if (buildGenerationRef.current !== buildGeneration) {
        unlockWorkspaceMutations(mutationToken);
        mutationToken = null;
        return null;
      }
      await invalidateRuntime(undefined, {
        preserveLifecycle: options.preserveLifecycle,
        preserveHotReload: options.hotReload,
      });
    } catch (error) {
      if (buildGenerationRef.current !== buildGeneration) {
        if (mutationToken !== null) unlockWorkspaceMutations(mutationToken);
        return null;
      }
      setBuildState({
        status: "failed",
        title: "Save failed",
        detail: error instanceof Error ? error.message : "The project must be saved before it can be built.",
        diagnostics: [],
      });
      if (mutationToken !== null) unlockWorkspaceMutations(mutationToken);
      return null;
    }
    let candidateSession: OpModeSession | null = null;
    try {
      const repositoryFiles = { ...await gitEngineRef.current?.readAllFiles(), ...buildFiles };
      const cached = await reusableBuildArtifact(lastSuccessfulArtifactRef.current, repositoryFiles, configuredHardware, desktop ? "local" : "bundle");
      if (buildGenerationRef.current !== buildGeneration || fileRevisionRef.current !== buildRevision) return null;
      if (cached) {
        artifactRevisionRef.current = buildRevision;
        fastReloadBaseRef.current = { artifact: cached, files: repositoryFiles };
        setBuildArtifact(cached);
        setBuildState({ status: "succeeded", title: "Build up to date", detail: "Project and hardware unchanged. Using the successful build.", diagnostics: cached.diagnostics });
        appendLog(`BUILD UP-TO-DATE — reused artifact ${cached.artifactId.slice(0, 8)}.`);
        return cached;
      }
      clearProjectArtifactCompletions(projectId);
      appendLog("Building the project with Gradle…");
      // Compile an immutable snapshot while allowing the next edit to be saved.
      // A newer revision is queued for another reload, never started as stale code.
      if (options.hotReload && mutationToken !== null) {
        unlockWorkspaceMutations(mutationToken);
        mutationToken = null;
      }
      if (buildGenerationRef.current !== buildGeneration) return null;
      const session = await WebSocketOpModeSession.connect({ projectId });
      candidateSession = session;
      if (buildGenerationRef.current !== buildGeneration) { await session.close(); return null; }
      buildSessionRef.current = session;
      const artifact = await session.load(buildFiles, configuredHardware, {
        repositoryFiles,
        onBuildProgress: (progress) => {
          if (buildGenerationRef.current !== buildGeneration) return;
          setBuildState((state) => ({ ...state, detail: progress.message }));
          options.onBuildProgress?.(progress);
        },
      });
      if (buildGenerationRef.current !== buildGeneration || fileRevisionRef.current !== buildRevision) {
        await session.close().catch(() => undefined);
        candidateSession = null;
        if (buildGenerationRef.current === buildGeneration) {
          setBuildState({ ...INITIAL_BUILD_STATE, title: "Newer edits saved", detail: "Hot Reload will build the latest revision." });
        }
        return null;
      }
      runtimeTickSequenceRef.current = 0;
      await session.close();
      opModeSessionRef.current = null;
      candidateSession = null;
      artifactRevisionRef.current = buildRevision;
      fastReloadBaseRef.current = {artifact, files: repositoryFiles};
      lastSuccessfulArtifactRef.current = artifact;
      setBuildArtifact(artifact);

      // Editor indexing can finish after the compiled program starts loading.
      void publishArtifactCompletions(projectId, artifact).then((completion) => {
        if (buildGenerationRef.current === buildGeneration && completion.status === "installed") appendLog(`Project autocomplete ready — ${completion.typeCount.toLocaleString()} types from the resolved build dependencies.`);
      }).catch((error) => {
        if (buildGenerationRef.current === buildGeneration) appendLog(`Library completion index unavailable: ${error instanceof Error ? error.message : String(error)}`);
      });
      const warnings = artifact.diagnostics.filter((diagnostic) => diagnostic.kind === "warning").length;
      setBuildState({
        status: "succeeded",
        title: "Build completed",
        detail: `${artifact.opModes.length} OpMode${artifact.opModes.length === 1 ? "" : "s"} compiled${warnings ? ` with ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}. Simulation support is checked when you select INIT.`,
        diagnostics: artifact.diagnostics,
      });
      appendLog(`BUILD SUCCESSFUL — artifact ${artifact.artifactId.slice(0, 8)} (${artifact.opModes.length} OpModes).`);
      return artifact;
    } catch (error) {
      void candidateSession?.close();
      if (buildGenerationRef.current !== buildGeneration) return null;
      const runnerError = error instanceof OpModeSessionError ? error : null;
      const unavailable = runnerError?.code === "RUNNER_OFFLINE" || runnerError?.code === "RUNNER_DISCONNECTED";
      const detail = error instanceof Error ? error.message : "The Java runner request failed.";
      const diagnostics = ensureBuildFailureDiagnostics(
        detail,
        runnerError?.diagnostics,
        runnerError?.code ?? "BUILD_FAILED",
      );
      setBuildState({
        status: unavailable ? "unavailable" : "failed",
        title: unavailable ? "JVM runner unavailable" : "Build failed",
        detail,
        diagnostics,
      });
      appendLog(`BUILD FAILED — ${detail}`);
      diagnostics.forEach((diagnostic) => appendLog(formatBuildDiagnostic(diagnostic)));
      openBottom("Problems");
      return null;
    } finally {
      if (buildSessionRef.current === candidateSession || buildGenerationRef.current === buildGeneration) buildSessionRef.current = null;
      if (mutationToken !== null) unlockWorkspaceMutations(mutationToken);
    }
  }, [appendLog, closeCommandPalette, configuredHardware, desktop, flushPendingSaves, invalidateRuntime, lockWorkspaceMutations, openBottom, projectId, publishArtifactCompletions, robotConfiguration, unlockWorkspaceMutations]);

  const openRuntimeArtifact = useCallback(async (artifact: LoadArtifact, onStatus?: (message: string) => void): Promise<OpModeSession> => {
    onStatus?.("Starting robot runtime…");
    const session = await WebSocketOpModeSession.connect({ stage: "runtime", artifactHash: artifact.artifactHash, projectId });
    try {
      onStatus?.("Loading compiled program…");
      await session.loadArtifact(artifact, configuredHardware);
      return session;
    }
    catch (error) { await session.close().catch(() => undefined); throw error; }
  }, [configuredHardware, projectId]);

  const prepareMatchProgram = useCallback(async (options?: { onBuildProgress?: (progress: BuildJobProgress) => void; onStatus?: (message: string) => void }) => {
    await flushPendingSaves();
    const buildFirst = buildBeforeGameSimulationRef.current;
    let artifact: LoadArtifact | null;
    if (buildFirst) {
      options?.onStatus?.("Compiling project…");
      artifact = await buildProgram(options);
      if (artifact) buildBeforeGameSimulationRef.current = false;
    } else {
      artifact = lastSuccessfulArtifactRef.current;
      options?.onStatus?.("Using last successful build…");
    }
    if (!artifact) {
      throw new Error(buildFirst
        ? "The project did not build. Open Build for diagnostics."
        : "There is no successful build yet. Choose Build and Simulate Game to build the project first.");
    }
    return { artifact, session: await openRuntimeArtifact(artifact, options?.onStatus) };
  }, [buildProgram, flushPendingSaves, openRuntimeArtifact]);

  const createMatchPolicies = useCallback(async (game: GameSimulation, options: { difficulty: GameSimulationDifficulty }) => {
    const player = game.world.robotSetups.find((robot) => robot.controller === "opmode")?.id;
    if (!player) throw new Error("The match has no robot assigned to the selected OpModes.");
    const squad = new ProgrammedBotSquad(game, options.difficulty);
    const humanPlayer = new AutomatedHumanPlayer(fullyAutomatedAlliances(game));
    return {
      async commands(current: GameSimulation) {
        humanPlayer.step(current);
        return squad.commands(current);
      },
      close() { squad.close(); },
    };
  }, []);

  const handleBuild = useCallback(async () => {
    if (!canBuildWorkspace) return;
    await buildProgram();
  }, [buildProgram, canBuildWorkspace]);

  const handleCancelBuild = useCallback(() => {
    hotReload.stop();
    setHotReloadActive(false);
    lifecycleGenerationRef.current++;
    buildGenerationRef.current++;
    void buildSessionRef.current?.close();
    buildSessionRef.current = null;
    cancelWorkspaceMutationLock();
    setBuildState({ ...INITIAL_BUILD_STATE, title: "Build cancelled", detail: "Your project edits are saved. Build again when you are ready." });
    appendLog("BUILD CANCELLED — the build session was closed.");
  }, [appendLog, cancelWorkspaceMutationLock, hotReload]);

  const cancelHotReload = useCallback(() => {
    handleCancelBuild();
    void invalidateRuntime("Hot Reload stopped.");
  }, [handleCancelBuild, invalidateRuntime]);

  const applyRuntimeFrame = useCallback((
    frame: SimulationFrame,
    options: { lifecycle?: boolean } = {},
  ) => {
    actuatorStore.publish(toActuatorFrame(frame), { force: options.lifecycle });
    if (frame.telemetryUpdate) telemetryStore.publish(frame.telemetryUpdate);
    const measured = runtimeHardwareRef.current.get(frame.sequence) ?? hardwareFrameRef.current;
    analysisStore.record(frame.simulationTimeMillis, { ...runtimeChannels(frame, measured), "/Session/DebugPaused": false });
    for (const sequence of runtimeHardwareRef.current.keys()) if (sequence <= frame.sequence) runtimeHardwareRef.current.delete(sequence);
    if (frame.variables) debuggerController.updateFields(frame.variables);
    if (frame.capturedStdout.trim()) appendRuntimeLog(`TeamCode: ${frame.capturedStdout.trim()}`);
    ([1, 2] as const).forEach((slot) => {
      const request = frame.haptics?.[`gamepad${slot}`];
      if (!request) return;
      void gamepadRegistry.rumble(
        slot,
        request.durationMillis,
        request.strongMagnitude,
        request.weakMagnitude,
      ).then((result) => {
        if (result.status !== "played") appendLog(`GAMEPAD — ${result.message}`);
      });
    });
  }, [actuatorStore, analysisStore, debuggerController, appendLog, appendRuntimeLog, gamepadRegistry, telemetryStore]);

  const neutralizeActuators = useCallback(() => {
    actuatorStore.neutralize();
  }, [actuatorStore]);

  const handleFieldPresetChange = useCallback(async (nextPreset: FieldPresetId): Promise<boolean> => {
    if (readOnly || workspaceMutationLockRef.current || opModeState === "initializing") return false;
    const current = robotConfiguration.document;
    if (!current || nextPreset === readFieldConfiguration(current.manifest).preset) return false;
    if ((opModeState === "ready" || opModeState === "running")
        && !window.confirm("Changing the field stops the current OpMode and resets the simulation. Change field?")) {
      return false;
    }

    if (opModeState === "ready" || opModeState === "running") {
      lifecycleGenerationRef.current++;
      runtimeGenerationRef.current++;
      if (runtimeTimerRef.current) {
        clearTimeout(runtimeTimerRef.current);
        runtimeTimerRef.current = null;
      }
      neutralizeActuators();
      tickBudget.reset();
      const session = opModeSessionRef.current;
      opModeSessionRef.current = null;
      await stopRuntimeSession(session, runtimeTickPromisesRef.current);
      neutralizeActuators();
      setOpModeState("stopped");
      telemetryStore.reset();
    }

    const updated: RobotConfigurationDocument = {
      ...current,
      manifest: writeFieldConfiguration(current.manifest, { preset: nextPreset }),
    };
    const nextFiles = {
      ...fileContents,
      "ftcsim.project.json": serializeRobotConfiguration(updated),
    };
    fileContentsRef.current = nextFiles;
    setFileContents(nextFiles);
    autosaveRef.current?.schedule(nextFiles);
    setResetSignal((signal) => signal + 1);
    appendLog(`${nextPreset === "biobuzz-2026-2027" ? "BIOBUZZ" : nextPreset === "decode-2025-2026" ? "DECODE" : "Empty"} field loaded. TeamCode build remains current.`);
    return true;
  }, [appendLog, fileContents, neutralizeActuators, opModeState, readOnly, robotConfiguration.document, telemetryStore, tickBudget]);

  const startControlLoop = useCallback((session: OpModeSession) => {
    const generation = ++runtimeGenerationRef.current;
    runtimeHardwareRef.current.clear();
    tickBudget.reset();
    // The first desktop tick consumes the sensor frame granted at START.
    // Waiting for a newer frame would leave both fixed-step clocks waiting.
    let lastSensorTime = desktop ? -1 : hardwareFrameRef.current?.simulationTimeMs ?? -1;

    const issueTick = () => {
      if (runtimeGenerationRef.current !== generation) return;
      runtimeTimerRef.current = null;
      if (debuggerController.paused) return;
      if (!shouldIssueRuntimeTick(runtimeTickPromisesRef.current.size)) {
        return;
      }

      // Read the controller at dispatch time instead of reusing the UI poll.
      // This avoids adding up to one full 20 ms control interval before the
      // snapshot even enters the runner pipeline.
      const gamepads = gamepadRegistry.poll();
      gamepadFrameRef.current = gamepads;
      const hardware = hardwareFrameRef.current;
      // A delayed browser task may run before physics publishes another frame.
      // Never fabricate time or resend a timestamp to the JVM.
      if (!hardware || hardware.simulationTimeMs <= lastSensorTime) return;
      lastSensorTime = hardware.simulationTimeMs;
      const expectedMotorNames = configuredMotorNames;
      const motorFeedback = Object.fromEntries(expectedMotorNames.map((name) => [name, {
        positionTicks: hardware?.motors[name]?.currentPosition ?? 0,
        velocityTicksPerSecond: hardware?.motors[name]?.velocityTicksPerSecond ?? 0,
        currentAmps: hardware?.motors[name]?.currentAmps ?? 0,
        enabled: hardware?.motors[name]?.enabled ?? true,
      }]));
      const totalCurrentAmps = Object.values(motorFeedback)
        .reduce((total, motor) => total + motor.currentAmps, 0);
      const sequence = ++runtimeTickSequenceRef.current;
      runtimeHardwareRef.current.set(sequence, hardware);
      const request = session.tick({
        sequence,
        gamepad1: toProtocolGamepad(gamepads?.gamepad1),
        gamepad2: toProtocolGamepad(gamepads?.gamepad2),
        motors: motorFeedback,
        sensors: hardware?.sensors ?? {
          orientationRadians: {
            yaw: hardware?.pose.headingRadians ?? 0,
            pitch: 0,
            roll: 0,
          },
          angularVelocityRadiansPerSecond: {
            x: 0,
            y: 0,
            z: hardware?.chassisVelocity.angularRadiansPerSecond ?? 0,
          },
          voltage: Math.max(9, Math.min(12.6, 12.6 - totalCurrentAmps * 0.025)),
        },
      });
      const tracked = request.then((frame) => deliverRuntimeFrame(frame, {
        advanceEachFrame: Boolean(desktop),
        isCurrent: () => runtimeGenerationRef.current === generation,
        apply: applyRuntimeFrame,
        waitForPhysics: () => tickBudget.grant(++physicsGrantSequenceRef.current),
        finish: async () => {
          // Practice ends when runOpMode returns. Full matches own a separate
          // session and keep their clock alive until the scheduled handoff.
          const stoppedGeneration = ++runtimeGenerationRef.current;
          neutralizeActuators();
          tickBudget.reset();
          setOpModeState("stopped");
          const stopped = await session.transition("stop");
          if (runtimeGenerationRef.current !== stoppedGeneration) return;
          if (stopped) applyRuntimeFrame(stopped, { lifecycle: true });
          neutralizeActuators();
          setOpModeState("stopped");
          appendLog("PROGRAM FINISHED — the selected OpMode has returned.");
        },
      })).catch((error) => {
        if (runtimeGenerationRef.current !== generation) return;
        runtimeGenerationRef.current++;
        if (runtimeTimerRef.current) {
          clearTimeout(runtimeTimerRef.current);
          runtimeTimerRef.current = null;
        }
        tickBudget.reset();
        neutralizeActuators();
        setOpModeState("stopped");
        openBottom("Run");
        appendLog(`RUNTIME STOPPED — ${describeOpModeFailure(error, "The JVM runner disconnected.")}`);
      }).finally(() => {
        runtimeTickPromisesRef.current.delete(tracked);
      });
      runtimeTickPromisesRef.current.add(tracked);
    };
    startRuntimeTickLoop({
      isCurrent: () => runtimeGenerationRef.current === generation,
      dispatch: issueTick,
      schedule: (callback, delay) => { runtimeTimerRef.current = setTimeout(callback, delay); },
    });
  }, [appendLog, applyRuntimeFrame, configuredMotorNames, debuggerController, desktop, gamepadRegistry, neutralizeActuators, openBottom, tickBudget]);

  const startRuntime = useCallback(async (
    session: OpModeSession,
    lifecycleGeneration = ++lifecycleGenerationRef.current,
  ) => {
    runtimeGenerationRef.current++;
    if (runtimeTimerRef.current) clearTimeout(runtimeTimerRef.current);
    tickBudget.reset();
    await drainRuntimeTicks();
    if (lifecycleGenerationRef.current !== lifecycleGeneration) return;
    const frame = await session.transition("start");
    if (lifecycleGenerationRef.current !== lifecycleGeneration) {
      await session.close().catch(() => undefined);
      return;
    }
    if (frame) applyRuntimeFrame(frame, { lifecycle: true });
    // Native Run continues under an occluded window, where rAF can be suspended.
    // Commit Running synchronously there before granting the first physics step.
    if (desktop) flushSync(() => setOpModeState("running"));
    else setOpModeState("running");
    openBottom("Run");
    appendLog(`START received. ${inputSourceLabel} is feeding TeamCode.`);
    // Let React commit the Running phase before Rapier consumes START output.
    // Otherwise a same-frame grant can be stepped under the Ready phase and
    // discard the first motor command returned by the JVM.
    if (!desktop) await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    if (lifecycleGenerationRef.current !== lifecycleGeneration) return;
    await tickBudget.grant(++physicsGrantSequenceRef.current);
    if (lifecycleGenerationRef.current !== lifecycleGeneration) return;
    startControlLoop(session);
  }, [appendLog, applyRuntimeFrame, desktop, drainRuntimeTicks, inputSourceLabel, openBottom, startControlLoop, tickBudget]);

  const initializeRuntime = useCallback(async (
    startAfterInit: boolean,
    options: { reloadTicket?: HotReloadTicket; reuseLastSuccessfulBuild?: boolean } = {},
  ): Promise<boolean> => {
    const reloadTicket = options.reloadTicket;
    const reuseLastSuccessfulBuild = options.reuseLastSuccessfulBuild === true && !reloadTicket;
    if (reloadTicket ? !hotReload.isCurrent(reloadTicket) : (startAfterInit ? !canRunWorkspace : !canInitializeWorkspace)) return false;
    const entryClass = reloadTicket?.entryClass ?? effectiveRunConfiguration;
    if (!entryClass) {
      appendLog("Open an annotated OpMode or choose one to run.");
      openBottom("Run");
      return false;
    }
    setRuntimeEntryClass(entryClass);
    const lifecycleGeneration = ++lifecycleGenerationRef.current;
    let restartingStoppedSession = opModeState === "stopped" && Boolean(opModeSessionRef.current);
    let reuseReconnectAttempted = false;
    const reloadStarted = performance.now();
    opModeStateRef.current = "initializing";
    cloudSyncRef.current?.pause();
    setOpModeState("initializing");
    openBottom("Run");
    try {
      await flushPendingSaves();
      if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
      let artifact = reuseLastSuccessfulBuild
        ? (liveProgramRef.current?.session === opModeSessionRef.current
          ? liveProgramRef.current.artifact
          : lastSuccessfulArtifactRef.current)
        : artifactRevisionRef.current === fileRevisionRef.current ? buildArtifact : null;
      let runtimeRevision = artifactRevisionRef.current;
      const live = liveProgramRef.current;
      if (reuseLastSuccessfulBuild && live?.session === opModeSessionRef.current) {
        runtimeRevision = live.revision;
      } else if (!reuseLastSuccessfulBuild && live?.session === opModeSessionRef.current && live?.revision === fileRevisionRef.current) {
        artifact = live.artifact;
        runtimeRevision = live.revision;
      }
      const base = fastReloadBaseRef.current;
      let currentSession = opModeSessionRef.current;
      if (reloadTicket && base?.artifact.hotReload && currentSession?.reloadSources) {
        const capturedRevision = fileRevisionRef.current;
        const repositoryFiles = {...await gitEngineRef.current?.readAllFiles(), ...fileContentsRef.current};
        if (lifecycleGenerationRef.current !== lifecycleGeneration || capturedRevision !== fileRevisionRef.current) return false;
        const sources = fastReloadSources(base.files, repositoryFiles, base.artifact.hotReload.sourcePaths);
        if (sources) {
          runtimeGenerationRef.current++;
          if (runtimeTimerRef.current) clearTimeout(runtimeTimerRef.current);
          tickBudget.reset();
          neutralizeActuators();
          await drainRuntimeTicks();
          if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
          // Keep editing available while the immutable source snapshot compiles.
          opModeStateRef.current = "idle";
          setOpModeState("idle");
          setBuildState({status: "building", startedAt: performance.now(), title: "Hot Reload", detail: "Compiling saved code with loaded dependencies…", diagnostics: []});
          liveProgramRef.current = null;
          let result;
          try {
            result = await currentSession.reloadSources(sources);
          } catch (error) {
            if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
            const expired = error instanceof OpModeSessionError
              && ["SESSION_CLOSED", "RUNNER_DISCONNECTED"].includes(error.code);
            if (!expired) throw error;
            appendLog("Reconnecting Hot Reload to its compiled dependencies…");
            const candidate = await openRuntimeArtifact(base.artifact);
            if (lifecycleGenerationRef.current !== lifecycleGeneration || capturedRevision !== fileRevisionRef.current) {
              await candidate.close();
              return false;
            }
            opModeSessionRef.current = candidate;
            currentSession = candidate;
            if (!candidate.reloadSources) throw error;
            result = await candidate.reloadSources(sources);
          }
          if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
          runtimeTickSequenceRef.current = 0;
          if (capturedRevision !== fileRevisionRef.current) {
            setOpModeState("stopped");
            setBuildState({...INITIAL_BUILD_STATE, title: "Newer edits saved", detail: "Applying the latest code…"});
            return false;
          }
          artifact = {...base.artifact, opModes: result.opModes, diagnostics: result.diagnostics};
          runtimeRevision = capturedRevision;
          restartingStoppedSession = false;
          liveProgramRef.current = {session: currentSession, revision: capturedRevision, artifact};

          setBuildState({status: "succeeded", title: "Hot Reload complete", detail: `Compiled in ${(result.durationMs / 1000).toFixed(1)}s.`, diagnostics: result.diagnostics});
        } else appendLog("Project settings or source files changed — a full build is required.");
      }
      if (!artifact && reuseLastSuccessfulBuild) {
        throw new OpModeSessionError("There is no successful build yet. Choose Build and Play to compile the project first.", "NO_BUILD_ARTIFACT");
      }
      if (!artifact) {
        artifact = await buildProgram({ preserveLifecycle: true, hotReload: Boolean(reloadTicket) });
        runtimeRevision = artifactRevisionRef.current;
      }
      if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
      if (!reuseLastSuccessfulBuild && artifact && runtimeRevision !== fileRevisionRef.current) return false;
      let selected = artifact?.opModes.find((opMode) => (
        opMode.className === entryClass || opMode.className.split(".").at(-1) === entryClass
      ));
      if (reuseLastSuccessfulBuild && artifact && !selected) {
        throw new OpModeSessionError("This OpMode is not in the last successful build. Choose Build and Play to compile it.", "OPMODE_NOT_FOUND");
      }
      if (selected && !hardwareFrameRef.current?.sensors) {
        appendLog("Waiting for the field to load before INIT…");
        const fieldDeadline = performance.now() + 95_000;
        while (lifecycleGenerationRef.current === lifecycleGeneration
            && !hardwareFrameRef.current?.sensors
            && performance.now() < fieldDeadline) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
        }
        if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
        if (!reuseLastSuccessfulBuild && runtimeRevision !== fileRevisionRef.current) return false;
        if (!hardwareFrameRef.current?.sensors) {
          throw new Error("The physical field could not load. Choose Retry field, then Play again.");
        }
      }
      if (artifact) {
        opModeStateRef.current = "initializing";
        setOpModeState("initializing");
      }
      if (artifact && !opModeSessionRef.current) {
        const candidate = await openRuntimeArtifact(artifact);
        if (lifecycleGenerationRef.current !== lifecycleGeneration || (!reuseLastSuccessfulBuild && runtimeRevision !== fileRevisionRef.current)) {
          await candidate.close();
          return false;
        }
        opModeSessionRef.current = candidate;
      }
      let session = opModeSessionRef.current;
      if (!artifact || !session) {
        setOpModeState("idle");
        return false;
      }
      const reconnectFromLastSuccessfulBuild = async (): Promise<boolean> => {
        if (reuseReconnectAttempted) {
          throw new OpModeSessionError("The saved build could not reconnect to the runner. Choose Build and Play to create a fresh runtime.", "ARTIFACT_RELOAD_FAILED");
        }
        const fullArtifact = lastSuccessfulArtifactRef.current;
        if (!fullArtifact) {
          throw new OpModeSessionError("The runtime session expired and no successful build is available. Choose Build and Play to compile the project.", "NO_BUILD_ARTIFACT");
        }
        const recoveredOpMode = fullArtifact.opModes.find((opMode) => (
          opMode.className === entryClass || opMode.className.split(".").at(-1) === entryClass
        ));
        const expiredSession = opModeSessionRef.current;
        opModeSessionRef.current = null;
        currentSession = null;
        session = null;
        await expiredSession?.close().catch(() => undefined);
        if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
        if (!recoveredOpMode) {
          artifact = fullArtifact;
          selected = undefined;
          throw new OpModeSessionError("This OpMode is not in the last successful build. Choose Build and Play to compile it.", "OPMODE_NOT_FOUND");
        }
        reuseReconnectAttempted = true;
        let candidate: OpModeSession;
        try {
          candidate = await openRuntimeArtifact(fullArtifact);
        } catch (error) {
          if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
          const detail = error instanceof Error ? error.message : "The runner rejected the saved artifact.";
          throw new OpModeSessionError(`The last successful build could not be reloaded (${detail}). Choose Build and Play to create a fresh runtime.`, "ARTIFACT_RELOAD_FAILED");
        }
        if (lifecycleGenerationRef.current !== lifecycleGeneration) {
          await candidate.close().catch(() => undefined);
          return false;
        }
        artifact = fullArtifact;
        runtimeRevision = artifactRevisionRef.current;
        selected = recoveredOpMode;
        session = candidate;
        currentSession = candidate;
        opModeSessionRef.current = candidate;
        restartingStoppedSession = false;
        return true;
      };
      // Build owns the Build window while compiling; once an artifact exists,
      // return the user to the lifecycle output they asked to run.
      openBottom("Run");
      setOpModeState("initializing");
      if (restartingStoppedSession) {
        try {
          runtimeGenerationRef.current++;
          if (runtimeTimerRef.current) clearTimeout(runtimeTimerRef.current);
          tickBudget.reset();
          await drainRuntimeTicks();
          const resetFrame = await session.transition("reset");
          if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
          runtimeTickSequenceRef.current = 0;
          telemetryStore.reset();
          if (resetFrame) applyRuntimeFrame(resetFrame, { lifecycle: true });
          appendLog("Previous run reset. Starting a fresh OpMode JVM.");
        } catch (error) {
          if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
          const expired = error instanceof OpModeSessionError
            && ["SESSION_CLOSED", "RUNNER_DISCONNECTED"].includes(error.code);
          if (!expired) throw error;
          appendLog("The stopped build session expired; reconnecting to the runner…");
          if (reuseLastSuccessfulBuild) {
            if (!await reconnectFromLastSuccessfulBuild()) return false;
          } else {
            artifact = await buildProgram({ preserveLifecycle: true, hotReload: Boolean(reloadTicket) });
            if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
            if (artifact) {
              const candidate = await openRuntimeArtifact(artifact);
              if (lifecycleGenerationRef.current !== lifecycleGeneration || artifactRevisionRef.current !== fileRevisionRef.current) {
                await candidate.close();
                return false;
              }
              opModeSessionRef.current = candidate;
            }
            session = opModeSessionRef.current;
            if (!artifact || !session) {
              setOpModeState("idle");
              return false;
            }
            selected = artifact.opModes.find((opMode) => (
              opMode.className === entryClass || opMode.className.split(".").at(-1) === entryClass
            ));
          }
        }
      }
      if (!selected) throw new OpModeSessionError("Choose a compiled @TeleOp or @Autonomous OpMode before initializing.", "OPMODE_NOT_FOUND");
      analysisStore.clear();
      appendLog(`Initializing ${selected.displayName} for ${ROBOT_LABELS[activeVariant]}…`);
      let frame: SimulationFrame | null = null;
      try {
        const sensors = hardwareFrameRef.current?.sensors;
        if (!sensors || !("robotId" in sensors)) throw new Error("The physical world is still loading. Wait for the field before INIT.");
        debuggerController.attach(session);
        frame = await session.init(selected.className, sensors, debuggerController.configuration(Object.keys(fileContentsRef.current)));
        if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
      } catch (error) {
        if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
        const expired = error instanceof OpModeSessionError
          && ["SESSION_CLOSED", "RUNNER_DISCONNECTED"].includes(error.code);
        if (!expired) throw error;
        appendLog("The build session expired; reconnecting to the runner…");
        if (reuseLastSuccessfulBuild) {
          if (!await reconnectFromLastSuccessfulBuild()) return false;
        } else {
          const rebuilt = await buildProgram({ preserveLifecycle: true, hotReload: Boolean(reloadTicket) });
          if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
          if (rebuilt) {
            const candidate = await openRuntimeArtifact(rebuilt);
            if (lifecycleGenerationRef.current !== lifecycleGeneration || artifactRevisionRef.current !== fileRevisionRef.current) {
              await candidate.close();
              return false;
            }
            opModeSessionRef.current = candidate;
            artifact = rebuilt;
            session = candidate;
            selected = rebuilt.opModes.find((opMode) => (
              opMode.className === entryClass || opMode.className.split(".").at(-1) === entryClass
            ));
          }
          const replacement = opModeSessionRef.current;
          const replacementOpMode = artifact?.opModes.find((opMode) => opMode.className === entryClass
            || opMode.className.split(".").at(-1) === entryClass);
          if (!artifact || !replacement || !replacementOpMode) throw error;
          setOpModeState("initializing");
          const sensors = hardwareFrameRef.current?.sensors;
          if (!sensors || !("robotId" in sensors)) throw new Error("The physical world is unavailable.");
          debuggerController.attach(replacement);
          frame = await replacement.init(replacementOpMode.className, sensors, debuggerController.configuration(Object.keys(fileContentsRef.current)));
          if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
        }
        if (reuseLastSuccessfulBuild) {
          if (!session || !selected) throw new OpModeSessionError("The selected OpMode is not in the last successful build. Choose Build and Play to compile it.", "OPMODE_NOT_FOUND");
          setOpModeState("initializing");
          const sensors = hardwareFrameRef.current?.sensors;
          if (!sensors || !("robotId" in sensors)) throw new Error("The physical world is unavailable.");
          debuggerController.attach(session);
          frame = await session.init(selected.className, sensors, debuggerController.configuration(Object.keys(fileContentsRef.current)));
          if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
        }
      }
      if (!selected) throw new OpModeSessionError("The selected OpMode is not available in the loaded build. Choose Build and Play to compile it.", "OPMODE_NOT_FOUND");
      if (frame) applyRuntimeFrame(frame, { lifecycle: true });
      setOpModeState("ready");
      appendLog("INIT complete. Waiting for START.");
      const activeSession = opModeSessionRef.current ?? session;
      if (startAfterInit) await startRuntime(activeSession, lifecycleGeneration);
      else startControlLoop(activeSession);
      if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
      hotReload.recordProgram({ entryClass: selected.className, startAfterInit, revision: runtimeRevision ?? fileRevisionRef.current });
      if (reloadTicket) appendLog(`Hot Reload restarted ${selected.displayName} in ${((performance.now() - reloadStarted) / 1000).toFixed(1)}s.`);
      return true;
    } catch (error) {
      if (lifecycleGenerationRef.current !== lifecycleGeneration) return false;
      neutralizeActuators();
      setOpModeState("stopped");
      if (reloadTicket) {
        const diagnostics = error instanceof OpModeSessionError ? error.diagnostics : [];
        setBuildState({status: "failed", title: "Hot Reload failed", detail: "Fix the error and save again.", diagnostics});
      }
      appendLog(`INIT FAILED — ${describeOpModeFailure(error, "The OpMode could not be initialized.")}`);
      return false;
    }
  }, [activeVariant, analysisStore, appendLog, applyRuntimeFrame, buildArtifact, buildProgram, canInitializeWorkspace, canRunWorkspace, debuggerController, drainRuntimeTicks, effectiveRunConfiguration, flushPendingSaves, hotReload, neutralizeActuators, openBottom, openRuntimeArtifact, opModeState, startControlLoop, startRuntime, telemetryStore, tickBudget]);

  const handleRun = useCallback(async () => {
    if (hotReload.active) {
      cancelHotReload();
      return;
    }
    const session = opModeSessionRef.current;
    if (opModeState === "running") {
      if (!canStop) return;
      hotReload.stop();
      const stopGeneration = ++lifecycleGenerationRef.current;
      runtimeGenerationRef.current++;
      if (runtimeTimerRef.current) clearTimeout(runtimeTimerRef.current);
      neutralizeActuators();
      tickBudget.reset();
      opModeSessionRef.current = null;
      try {
        const frame = await stopRuntimeSessionForReuse(session ?? null, runtimeTickPromisesRef.current);
        if (lifecycleGenerationRef.current !== stopGeneration) {
          await session?.close().catch(() => undefined);
          return;
        }
        if (frame) {
          opModeSessionRef.current = session;
          applyRuntimeFrame(frame, { lifecycle: true });
        }
      } finally {
        if (lifecycleGenerationRef.current === stopGeneration) {
          neutralizeActuators();
          setOpModeState("stopped");
          appendLog("STOP requested. Motor demand returned to zero.");
          openBottom("Run");
        }
      }
      return;
    }
    if (!canRunWorkspace) return;
    if (opModeState === "ready" && session
        && ((buildArtifact && artifactRevisionRef.current === fileRevisionRef.current)
          || (liveProgramRef.current?.session === opModeSessionRef.current && liveProgramRef.current?.revision === fileRevisionRef.current))) {
      try {
        await flushPendingSaves();
        await startRuntime(session);
        hotReload.recordProgram({ entryClass: effectiveRunConfiguration, startAfterInit: true, revision: artifactRevisionRef.current ?? fileRevisionRef.current });
      } catch (error) {
        neutralizeActuators();
        setOpModeState("stopped");
        appendLog(`START FAILED — ${describeOpModeFailure(error, "The OpMode could not start.")}`);
      }
      return;
    }
    if (opModeState === "ready") await invalidateRuntime("TeamCode changed after INIT; using the last successful build for START.");
    await initializeRuntime(true, { reuseLastSuccessfulBuild: true });
  }, [appendLog, applyRuntimeFrame, buildArtifact, cancelHotReload, canRunWorkspace, canStop, effectiveRunConfiguration, flushPendingSaves, hotReload, initializeRuntime, invalidateRuntime, neutralizeActuators, openBottom, opModeState, startRuntime, tickBudget]);

  const handleBuildAndPlay = useCallback(async () => {
    if (!canBuildWorkspace || !effectiveRunConfiguration) return;
    const artifact = await buildProgram();
    if (!artifact) return;
    await initializeRuntime(true, { reuseLastSuccessfulBuild: true });
  }, [buildProgram, canBuildWorkspace, effectiveRunConfiguration, initializeRuntime]);

  const openGameSimulation = useCallback((buildFirst: boolean) => {
    if (!canBuildWorkspace || readOnly) return;
    buildBeforeGameSimulationRef.current = buildFirst;
    void invalidateRuntime("Practice stopped. Opening Game Simulation.", { preserveBuildArtifact: true })
      .then(() => setGameSimulationOpen(true));
  }, [canBuildWorkspace, invalidateRuntime, readOnly]);

  const toggleHotReload = useCallback(() => {
    const enabled = !hotReloadEnabled;
    if (!enabled && hotReload.active) cancelHotReload();
    hotReload.setEnabled(enabled);
    setHotReloadEnabled(enabled);
    appendLog(enabled ? "Hot Reload on. Saved code restarts this OpMode; program variables reset." : "Hot Reload off.");
  }, [appendLog, cancelHotReload, hotReload, hotReloadEnabled]);

  useEffect(() => {
    if (debugPaused || !hotReloadEnabled || hotReloadActive || readOnly || gameSimulationOpen || gitBusy
        || workspaceMutationLocked || buildState.status === "building" || opModeState === "initializing"
        || fileSaveStatus !== "saved") return;
    const revision = fileRevisionRef.current;
    // Coalesce autosaved keystrokes before compiling the latest source snapshot.
    const timer = window.setTimeout(() => {
      if (fileRevisionRef.current !== revision) return;
      const ticket = hotReload.begin(revision);
      if (!ticket) return;
      setHotReloadActive(true);
      appendLog("Hot Reload — applying saved edits…");
      void initializeRuntime(ticket.startAfterInit, { reloadTicket: ticket })
        .then((succeeded) => hotReload.finish(ticket, succeeded))
        .finally(() => setHotReloadActive(hotReload.active));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [appendLog, buildState.status, debugPaused, fileContents, fileSaveStatus, gameSimulationOpen, gitBusy, hotReload, hotReloadActive, hotReloadEnabled, initializeRuntime, opModeState, readOnly, workspaceMutationLocked]);

  useEffect(() => {
    if (!debugPaused) return;
    const timer = window.setInterval(() => { void opModeSessionRef.current?.keepAlive().catch(() => undefined); }, 2_000);
    return () => window.clearInterval(timer);
  }, [debugPaused]);

  useEffect(() => {
    if (analysisStore.getSnapshot().count && (opModeState === "stopped" || opModeState === "idle")) {
      analysisStore.record(analysisStore.getSnapshot().end, { "/Session/Phase": "stopped", "/Session/Running": false, "/Session/DebugPaused": false });
    }
  }, [analysisStore, opModeState]);

  useEffect(() => {
    if (opModeState !== "stopped") return;
    // Preserve acknowledged STOP sessions for Play last build, including while editing.
    // Only stopped sessions are kept warm; the live control watchdog is unchanged.
    let pending = false;
    const timer = window.setInterval(() => {
      const session = opModeSessionRef.current;
      if (!session || pending || hotReload.active) return;
      pending = true;
      void session.keepAlive().catch(() => undefined).finally(() => { pending = false; });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [hotReload, opModeState]);

  const handleReset = useCallback(async () => {
    hotReload.stop();
    setHotReloadActive(false);
    buildGenerationRef.current++;
    void buildSessionRef.current?.close();
    buildSessionRef.current = null;
    lifecycleGenerationRef.current++;
    cancelWorkspaceMutationLock();
    runtimeGenerationRef.current++;
    if (runtimeTimerRef.current) clearTimeout(runtimeTimerRef.current);
    neutralizeActuators();
    tickBudget.reset();
    const session = opModeSessionRef.current;
    opModeSessionRef.current = null;
    await stopRuntimeSession(session, runtimeTickPromisesRef.current);
    neutralizeActuators();
    setOpModeState("idle");
    setBuildArtifact(null);
    artifactRevisionRef.current = null;
    setBuildState(INITIAL_BUILD_STATE);
    setResetSignal((signal) => signal + 1);
    telemetryStore.reset();
    runtimeTickSequenceRef.current = 0;
    appendLog("Simulation reset to the field origin.");
  }, [appendLog, cancelWorkspaceMutationLock, hotReload, neutralizeActuators, telemetryStore, tickBudget]);

  useEffect(() => desktop?.registerAutomation?.(async (action,args) => {
    if(action==="status")return {projectId,opModeState,buildState,hotReloadEnabled,hotReloadActive,saveStatus:fileSaveStatus,activeFile:activePath,runLog:runLog.slice(-60),telemetry:telemetryStore.getSnapshot(),simulationTimeMs:hardwareFrameRef.current?.simulationTimeMs??0,fieldReady:Boolean(hardwareFrameRef.current?.sensors),documentVisible:!document.hidden,sceneVisible:showSimulator&&!gameSimulationOpen,debugPaused,view:{editorCharacters:document.querySelector(".monaco-editor .view-lines")?.textContent?.length??0,canvases:Array.from(document.querySelectorAll("canvas")).map(canvas=>({width:canvas.width,height:canvas.height})),busyRegions:Array.from(document.querySelectorAll('[aria-busy="true"],[role="status"]')).map(node=>node.getAttribute("aria-label")??node.textContent?.slice(0,100))},actuators:actuatorStore.getSnapshot(),rehearsalSeed:desktop?.rehearsalSeed??2026};
    if(action==="run"){
      if(opModeState==="running")throw new Error("OpMode is already running");
      if(!canRunWorkspace)throw new Error("The workspace is not ready to run");
      await handleRun();return {requested:"run"};
    }
    if(action==="stop"){
      if(opModeState==="running"||hotReload.active)await handleRun();
      else if(opModeState==="initializing"||opModeState==="ready")await invalidateRuntime("STOP requested through MCP.");
      return {requested:"stop"};
    }
    if(action==="rewind"){
      if(workspaceMutationLockRef.current||opModeStateRef.current==="initializing")throw new Error("Wait for the current operation before rewinding the field");
      hotReload.stop();setHotReloadActive(false);
      const generation=++lifecycleGenerationRef.current;
      opModeStateRef.current="initializing";setOpModeState("initializing");
      runtimeGenerationRef.current++;
      if(runtimeTimerRef.current)clearTimeout(runtimeTimerRef.current);
      neutralizeActuators();tickBudget.reset();
      const session=opModeSessionRef.current;opModeSessionRef.current=null;
      try{
        const frame=await stopRuntimeSessionForReuse(session,runtimeTickPromisesRef.current);
        if(lifecycleGenerationRef.current!==generation)throw new Error("Field rewind was superseded");
        if(frame){opModeSessionRef.current=session;applyRuntimeFrame(frame,{lifecycle:true});}
      }catch(error){
        await session?.close().catch(()=>undefined);
        if(lifecycleGenerationRef.current===generation)setOpModeState("stopped");
        throw error;
      }finally{if(lifecycleGenerationRef.current===generation)neutralizeActuators();}
      runtimeTickSequenceRef.current=0;hardwareFrameRef.current=null;
      telemetryStore.reset();setOpModeState(buildArtifact?"stopped":"idle");
      setResetSignal(signal=>signal+1);
      appendLog("Field rewound. The loaded build is ready to run again.");
      return {requested:"rewind"};
    }
    if(action==="build"){
      if(!canBuildWorkspace)throw new Error("The workspace is not ready to build");
      await handleBuild();return {requested:"build"};
    }
    if(action==="edit"){
      const {path,search,replacement}=args;
      if(typeof path!=="string"||typeof search!=="string"||!search||typeof replacement!=="string")throw new Error("Edit requires a file path, nonempty search, and replacement");
      if(readOnly||workspaceMutationLockRef.current||opModeStateRef.current==="initializing")throw new Error("The editor is busy");
      const current=fileContentsRef.current[path];
      if(current===undefined)throw new Error("File is not open in this project");
      const index=current.indexOf(search);
      if(index<0||current.indexOf(search,index+search.length)>=0)throw new Error("Editor search must match exactly once");
      handleOpenFile(path);
      handleEditorChange(path,current.slice(0,index)+replacement+current.slice(index+search.length));
      return {path,updated:true};
    }
    throw new Error("Unsupported editor action");
  }));

  const duplicateCurrentProject = useCallback(async () => {
    if (readOnly || workspaceMutationLockRef.current) return;
    const token = lockWorkspaceMutations();
    setDuplicatingProject(true);
    setDuplicateError(null);
    try {
      scheduleCurrentProjectSession();
      workspaceMutationPhaseRef.current = "flushing-blocks";
      await flushPendingSaves();
      if (workspaceMutationTokenRef.current !== token) return;
      workspaceMutationPhaseRef.current = "mutating";
      const copy = await projectCatalog.duplicate(projectId);
      if (workspaceMutationTokenRef.current !== token) return;
      router.push(`/studio/${encodeURIComponent(copy.id)}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The project could not be duplicated.";
      setDuplicateError(message);
      appendLog(`PROJECT — ${message}`);
    } finally {
      setDuplicatingProject(false);
      unlockWorkspaceMutations(token);
    }
  }, [appendLog, projectCatalog, flushPendingSaves, lockWorkspaceMutations, projectId, readOnly, router, scheduleCurrentProjectSession, unlockWorkspaceMutations]);

  const navigateAfterSave = useCallback(async (destination: string) => {
    try {
      scheduleCurrentProjectSession();
      await flushPendingSaves();
    } catch {
      const leave = window.confirm("The latest edit could not be saved. Leave this project without saving it?");
      if (!leave) return;
      router.push(destination);
      return;
    }
    try {
      await drainCloudSync();
    } catch (error) {
      if (error instanceof CloudSyncError && error.code === "SYNC_CONFLICT") return;
      const leave = window.confirm(
        "Your changes are saved on this device but have not synced to your account. Switch projects with the local copy?",
      );
      if (!leave) return;
    }
    router.push(destination);
  }, [drainCloudSync, flushPendingSaves, router, scheduleCurrentProjectSession]);

  const saveAndExitToWelcome = useCallback(async (leaveWithoutSaving = false) => {
    if (exitState === "saving" || workspaceMutationLockRef.current) return;
    setExitState("saving");
    setExitError(null);
    setExitFailureKind("local");
    try {
      await invalidateRuntime();
      if (!leaveWithoutSaving && !readOnly) {
        scheduleCurrentProjectSession();
        await Promise.all([
          autosaveRef.current?.retry(),
          sessionAutosaveRef.current?.retry(),
        ]);
        await flushPendingSaves();
        try {
          await drainCloudSync();
        } catch (error) {
          if (error instanceof CloudSyncError && error.code === "SYNC_CONFLICT") {
            setExitState("idle");
            return;
          }
          setExitFailureKind("cloud");
          throw error;
        }
      }
      navigationBypassRef.current = true;
      workspaceLeaseRef.current?.release();
      workspaceLeaseRef.current = null;
      router.replace("/");
    } catch (error) {
      setExitError(error instanceof Error ? error.message : "The latest project changes could not be saved.");
      setExitState("failed");
    }
  }, [drainCloudSync, exitState, flushPendingSaves, invalidateRuntime, readOnly, router, scheduleCurrentProjectSession]);

  const prepareStudioForAccountSignOut = useCallback(async (
    reason: "sign-out" | "revoked",
  ): Promise<"ready" | "cancelled"> => {
    if (reason === "revoked") {
      const deadline = Date.now() + 4_000;
      while (workspaceMutationLockRef.current && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      if (workspaceMutationLockRef.current) {
        setExitFailureKind("local");
        setExitError("The current project operation must finish before this tab can close safely.");
        setExitState("failed");
        return "cancelled";
      }
      try {
        await invalidateRuntime();
        if (!readOnly) {
          scheduleCurrentProjectSession();
          await Promise.all([
            autosaveRef.current?.retry(),
            sessionAutosaveRef.current?.retry(),
          ]);
          await flushPendingSaves();
        }
      } catch (error) {
        setExitFailureKind("local");
        setExitError(error instanceof Error ? error.message : "The latest project edit is still only in memory.");
        setExitState("failed");
        return "cancelled";
      }
      return "ready";
    }
    if (exitState === "saving" || workspaceMutationLockRef.current) {
      setExitFailureKind("local");
      setExitError("Wait for the current project operation to finish, then sign out again.");
      setExitState("failed");
      return "cancelled";
    }
    setExitState("saving");
    setExitError(null);
    setExitFailureKind("local");
    try {
      await invalidateRuntime();
      if (!readOnly) {
        scheduleCurrentProjectSession();
        await Promise.all([
          autosaveRef.current?.retry(),
          sessionAutosaveRef.current?.retry(),
        ]);
        await flushPendingSaves();
        try {
          await drainCloudSync();
        } catch (error) {
          if (error instanceof CloudSyncError && error.code === "SYNC_CONFLICT") {
            setExitState("idle");
            return "cancelled";
          }
          const leaveWithLocalCopy = window.confirm(
            "Your work is saved on this device, but account sync is unavailable. Sign out and keep this device copy?",
          );
          if (!leaveWithLocalCopy) {
            setExitFailureKind("cloud");
            setExitError(error instanceof Error ? error.message : "Account sync is unavailable.");
            setExitState("failed");
            return "cancelled";
          }
        }
      }
      setExitState("idle");
      return "ready";
    } catch (error) {
      setExitFailureKind("local");
      setExitError(error instanceof Error ? error.message : "The latest project changes could not be saved.");
      setExitState("failed");
      return "cancelled";
    }
  }, [
    drainCloudSync,
    exitState,
    flushPendingSaves,
    invalidateRuntime,
    readOnly,
    scheduleCurrentProjectSession,
  ]);

  useTemporaryAuthExitHandler(prepareStudioForAccountSignOut);

  const handleRetryCloudUpdate = useCallback(async () => {
    try {
      scheduleCurrentProjectSession();
      await flushPendingSaves();
      const current = await projectCatalog.get(projectId);
      const cloud = current?.cloud;
      if (!current || cloud?.availableRevision === undefined || !cloud.availableManifestSha256) {
        throw new Error("The available cloud update could not be identified. Reload the project list and try again.");
      }
      if (cloud.status !== "synced") {
        const conflict = await projectCatalog.markCloudConflict(projectId, {
          revision: cloud.availableRevision,
          manifestSha256: cloud.availableManifestSha256,
          updatedAt: cloud.availableUpdatedAt ?? new Date().toISOString(),
        });
        setProjectRecord(conflict);
        setCloudSyncError(new CloudSyncError(
          "SYNC_CONFLICT",
          "This project changed locally after a newer account copy became available.",
        ));
        setCloudSyncStatus("conflict");
        setCloudConflictError(null);
        setCloudConflictOpen(true);
        return;
      }
      window.sessionStorage.setItem(`ftc-simulator:retry-cloud-copy:${projectId}`, "1");
      navigationBypassRef.current = true;
      window.location.reload();
    } catch (error) {
      const failure = error instanceof CloudSyncError
        ? error
        : new CloudSyncError(
            "SYNC_FAILED",
            error instanceof Error ? error.message : "The cloud update could not be retried.",
            error,
          );
      setCloudSyncError(failure);
      setCloudSyncStatus(failure.code === "SYNC_OFFLINE" ? "offline" : "failed");
    }
  }, [flushPendingSaves, projectCatalog, projectId, scheduleCurrentProjectSession]);

  const handleUseCloudConflictCopy = useCallback(async () => {
    if (cloudConflictBusy) return;
    setCloudConflictBusy(true);
    setCloudConflictError(null);
    try {
      scheduleCurrentProjectSession();
      await flushPendingSaves();
      window.sessionStorage.setItem(`ftc-simulator:use-cloud-copy:${projectId}`, "1");
      navigationBypassRef.current = true;
      window.location.reload();
    } catch (error) {
      setCloudConflictError(error instanceof Error ? error.message : "The latest local edit could not be saved first.");
      setCloudConflictBusy(false);
    }
  }, [cloudConflictBusy, flushPendingSaves, projectId, scheduleCurrentProjectSession]);

  const keepDeviceConflictCopy = useCallback(async () => {
    if (cloudConflictBusy) return;
    const catalog = catalogRef.current;
    const engine = gitEngineRef.current;
    if (!catalog || !engine) return;
    setCloudConflictBusy(true);
    setCloudConflictError(null);
    try {
      scheduleCurrentProjectSession();
      await flushPendingSaves();
      const [record, session, cloud] = await Promise.all([
        catalog.get(projectId),
        catalog.loadSession(projectId),
        getCurrentCloudProject(projectId),
      ]);
      if (!record) throw new Error("The local project record is unavailable.");
      if (record.cloud?.status !== "conflict" || record.cloud.conflictRevision !== cloud.revision) {
        throw new Error("The cloud project changed again. Refresh the conflict before choosing a copy.");
      }
      const synced = await syncProjectToCloud({
        catalog,
        engine,
        record,
        session,
        baseRevision: cloud.revision,
        resolveConflictRevision: cloud.revision,
      });
      setProjectRecord(synced);
      cloudSyncRef.current?.resetAfterResolution();
      setCloudConflictOpen(false);
      appendLog(`SYNC — Kept this device as cloud revision ${synced.cloud?.revision ?? cloud.revision + 1}.`);
    } catch (error) {
      setCloudConflictError(error instanceof Error ? error.message : "The project conflict could not be resolved.");
    } finally {
      setCloudConflictBusy(false);
    }
  }, [
    appendLog,
    cloudConflictBusy,
    flushPendingSaves,
    projectId,
    scheduleCurrentProjectSession,
  ]);

  const openNewProject = useCallback(async () => {
    try {
      scheduleCurrentProjectSession();
      await flushPendingSaves();
      await drainCloudSync();
      setNewProjectOpen(true);
    } catch {
      // The status bar exposes Retry; project creation must not hide a failed save.
    }
  }, [drainCloudSync, flushPendingSaves, scheduleCurrentProjectSession]);

  const openGitHubProject = useCallback(async () => {
    try {
      scheduleCurrentProjectSession();
      await flushPendingSaves();
      await drainCloudSync();
      setGitHubProjectOpen(true);
    } catch {
      // The status bar retains the failed save and exposes Retry.
    }
  }, [drainCloudSync, flushPendingSaves, scheduleCurrentProjectSession]);

  const exportProject = useCallback(async (selection: ProjectExportSelection) => {
    scheduleCurrentProjectSession();
    await flushPendingSaves();
    const exportFiles = await gitEngineRef.current?.readAllFiles() ?? fileContents;
    const archive = createProjectExportArchive(exportFiles, {
      projectName: projectRecord?.name ?? "FTC-Project",
      scope: selection.scope,
      includeSimulatorConfiguration: selection.scope === "full-project" && selection.includeSimulatorConfiguration,
      fileName: selection.fileName,
    });
    const buffer = archive.bytes.buffer.slice(
      archive.bytes.byteOffset,
      archive.bytes.byteOffset + archive.bytes.byteLength,
    ) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/zip" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = archive.fileName;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    const message = `Exported ${archive.fileCount} project file${archive.fileCount === 1 ? "" : "s"} to ${archive.fileName}.`;
    appendLog(`EXPORT — ${message}`);
    setProjectExportStatus(message);
    setProjectExportOpen(false);
    window.requestAnimationFrame(() => projectExportOpenerRef.current?.focus());
  }, [appendLog, fileContents, flushPendingSaves, projectRecord?.name, scheduleCurrentProjectSession]);

  const opModeRunControls = (
    <div className="run-controls" role="group" aria-label="Run OpMode">
      <label className="run-config" title="Choose OpMode to run">
        <span className="header-select__value" aria-hidden="true">
          {runConfiguration ? runConfigurations.find((configuration) => configuration.value === runConfiguration)?.label ?? "OpMode unavailable" : "Run Current OpMode"}
        </span>
        <select aria-label="OpMode to run" value={runConfiguration}
          onChange={(event) => setRunConfiguration(event.target.value)}
          disabled={opModeState === "initializing" || opModeState === "ready" || opModeState === "running" || buildState.status === "building"}>
          <option value="">Run Current OpMode</option>
          {runConfiguration && !runConfigurations.some((configuration) => configuration.value === runConfiguration) && <option value={runConfiguration} disabled>OpMode unavailable</option>}
          {runConfigurations.map((configuration) => <option key={configuration.value} value={configuration.value}>{configuration.label} · {configuration.kind === "autonomous" ? "Autonomous" : "TeleOp"}</option>)}
        </select>
        <ChevronDown aria-hidden="true" />
      </label>
      <RunActionButton
        kind="play"
        mode={playLaunchMode}
        onModeChange={setPlayLaunchMode}
        running={opModeState === "running" || hotReloadActive}
        targetLabel={runTargetLabel}
        busyLabel={buildState.status === "building" ? "Building project" : opModeState === "initializing" ? "Starting OpMode" : undefined}
        onRun={() => {
          setMobileView("simulation");
          if (opModeState === "running" || hotReloadActive || playLaunchMode === "reuse") void handleRun();
          else void handleBuildAndPlay();
        }}
        disabled={opModeState === "running" || hotReloadActive
          ? !canStop && !hotReloadActive
          : !(playLaunchMode === "build" ? canBuildWorkspace : canRunWorkspace) || !effectiveRunConfiguration}
        optionsDisabled={!canBuildWorkspace || opModeState === "running" || hotReloadActive}
      />
    </div>
  );

  const secondaryToolbarActions = <>
    <button type="button" className="header-action" onClick={handleBuild} disabled={!canBuildWorkspace}
      aria-label={buildState.status === "building" ? "Building project" : "Build project"} title="Build project">
      <Hammer aria-hidden="true" />{mobile && <span>Build project</span>}
    </button>
    <button type="button" className="header-action header-action--hot-reload" onClick={toggleHotReload}
      disabled={readOnly} aria-label="Hot Reload" aria-pressed={hotReloadEnabled} title="Hot Reload">
      <Flame aria-hidden="true" />{mobile && <span>Hot Reload</span>}
    </button>
    <button type="button" className="header-action" onClick={() => { void handleReset(); }} aria-label="Reset simulation" title="Reset simulation">
      <RotateCcw aria-hidden="true" />{mobile && <span>Reset simulation</span>}
    </button>
  </>;

  if (projectLoading) {
    return <main className="studio-loading"><ViewLoading label="Opening project" /></main>;
  }
  if (projectError || !projectRecord) {
    return <main className="studio-loading" role="alert"><CircleAlert aria-hidden="true" /><strong>Project could not be opened</strong><span>{projectError ?? "The project record is unavailable."}</span><button type="button" onClick={() => router.push("/")}>Return to Welcome</button></main>;
  }

  return (
    <CadAssetReaderContext.Provider value={readCadAsset}>
    <main className={`studio-shell${mobile ? " is-mobile" : ""}${configurationMaximized ? " is-configuration-maximized" : ""}`} data-mobile-view={activeMobileView}>
      <a className="skip-link" href="#editor-workspace" tabIndex={configurationMaximized ? -1 : undefined} aria-hidden={configurationMaximized || undefined}>Skip to editor</a>

      <header className="app-header">
        <ProjectSwitcher
          currentProjectId={projectId}
          exitDisabled={workspaceMutationLocked || exitState === "saving"}
          projectName={projectRecord.name}
          projects={recentProjects}
          readOnly={readOnly}
          onNewProject={() => { void openNewProject(); }}
          onOpenProject={(nextProjectId) => {
            if (nextProjectId === projectId) {
              setProjectOpen(true);
              if (compactWorkbench) setSimulatorOpen(false);
            }
            else void navigateAfterSave(`/studio/${encodeURIComponent(nextProjectId)}`);
          }}
          onOpenWelcome={() => { void navigateAfterSave("/?open=1"); }}
          onExportProject={openProjectExportDialog}
          onDuplicateProject={() => { void duplicateCurrentProject(); }}
          duplicating={duplicatingProject}
          onGitHubProject={() => { void openGitHubProject(); }}
          onPublishGitHub={projectRecord.remote ? undefined : () => {
            githubPublishOpenerRef.current = document.querySelector<HTMLButtonElement>(".project-widget");
            setGitHubPublishOpen(true);
          }}
          onExitToWelcome={() => { void saveAndExitToWelcome(); }}
        />
        <GitBranchMenu
          snapshot={gitSnapshot}
          busy={gitBusy || editorMutationLocked}
          error={readOnly ? "This project is open read-only in this tab." : gitError}
          onRefresh={handleGitRefresh}
          onCommit={handleGitCommit}
          onCreateBranch={handleGitCreateBranch}
          onCheckout={handleGitCheckout}
          onDiscard={handleGitDiscard}
          onFetch={handleGitFetch}
          onPull={handleGitPull}
          onPush={handleGitPush}
          remote={projectRecord.remote}
          onPublish={() => {
            githubPublishOpenerRef.current = document.querySelector<HTMLButtonElement>(".branch-widget");
            setGitHubPublishOpen(true);
          }}
        />

        <div className="header-spacer" />

        <div className="gamepad-toolbar-host"><GamepadToolbarGroup
          registry={gamepadRegistry}
          open={gamepadConfigurationOpen}
          onOpenChange={handleGamepadConfigurationOpenChange}
          returnFocus={gamepadConfigurationReturnFocus}
        /></div>
        <div className="execution-tools" role="group" aria-label="Build and simulation controls">
        {opModeRunControls}
        <div className="game-controls" role="group" aria-label="Game Simulation">
          <RunActionButton
            kind="game"
            mode={gameLaunchMode}
            onModeChange={setGameLaunchMode}
            buttonRef={setGameSimulationButton}
            disabled={!canBuildWorkspace || readOnly}
            optionsDisabled={!canBuildWorkspace || readOnly}
            onRun={() => openGameSimulation(gameLaunchMode === "build")}
          />
        </div>
        {mobile ? <MobileToolbarActions>{secondaryToolbarActions}
          <button type="button" className="header-action" aria-label="Gamepad assignments" title="Gamepad assignments"
            onClick={() => {
              setGamepadConfigurationReturnFocus(document.querySelector<HTMLButtonElement>(".mobile-toolbar-actions > button"));
              handleGamepadConfigurationOpenChange(true);
            }}><Gamepad2 aria-hidden="true" /><span>Gamepad assignments</span></button>
        </MobileToolbarActions> : secondaryToolbarActions}
        </div>
        <button type="button" className="header-action" onClick={openCommandPalette} aria-label="Search everywhere" title="Search everywhere (⌘K)">
          <Search aria-hidden="true" />
        </button>
        <button type="button" className="header-action" onClick={openRobotConfigurationDialog}
          disabled={workspaceMutationLocked} aria-label="Project Settings" title="Project Settings">
          <Settings aria-hidden="true" />
        </button>
        <TemporaryAccountMenu />
      </header>

      <div className="workbench" ref={workbenchRef} style={workbenchStyle}>
      {duplicateError && <div className="project-copy-error" role="alert">
        <span>{duplicateError}</span>
        <button type="button" disabled={duplicatingProject} onClick={() => void duplicateCurrentProject()}>Retry duplicate</button>
        <button type="button" onClick={() => setDuplicateError(null)}>Dismiss</button>
      </div>}
        <aside className="tool-rail tool-rail--left" aria-label="Left tool windows">
          <div className="tool-rail__group">
            {workspaceCapabilities.showProjectTree && (
              <ToolButton label="Project" active={effectiveProjectOpen && !configurationMaximized} onClick={toggleProjectWindow}><FolderTree /></ToolButton>
            )}
          </div>
          <div className="tool-rail__group tool-rail__group--bottom">
            <ToolButton label="Run" active={!configurationMaximized && bottomOpen && bottomTab === "Run"} onClick={() => openBottom("Run")}><Play /></ToolButton>
            <ToolButton label="Build" active={!configurationMaximized && bottomOpen && bottomTab === "Build"} onClick={() => openBottom("Build")}><Hammer /></ToolButton>
            <ToolButton label="Problems" active={!configurationMaximized && bottomOpen && bottomTab === "Problems"} onClick={() => openBottom("Problems")}><CircleAlert /></ToolButton>
            <ToolButton label="Telemetry" active={!configurationMaximized && bottomOpen && bottomTab === "Telemetry"} onClick={() => openBottom("Telemetry")}><Activity /></ToolButton>
            <ToolButton label="Debug" active={!configurationMaximized && bottomOpen && bottomTab === "Debug"} onClick={() => openBottom("Debug")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 5h8v14H8zM4 8h4m8 0h4M4 13h4m8 0h4M5 20l3-3m8 0 3 3M9 2l2 3m4-3-2 3M12 9v6" /></svg></ToolButton>
          </div>
        </aside>

        {effectiveProjectOpen && (
          <>
            <ProjectPane
              activePath={activePath}
              files={fileContents}
              entries={worktreeEntries}
              projectName={projectRecord.name}
              onOpenFile={handleOpenFile}
              blocksOnly={projectRecord.starter === "blocks"}
              blocksOpModes={runConfigurations}
              onCreateBlocksOpMode={editorMutationLocked ? undefined : handleCreateBlocksOpMode}
              onCreateFile={editorMutationLocked ? undefined : handleCreateTeamCodeFile}
            />
            <ResizeHandle
              label="Resize Project tool window"
              orientation="vertical"
              value={paneLayout.project}
              bounds={paneBounds.project}
              defaultValue={PANE_LAYOUT_DEFAULTS.project}
              direction={1}
              onResize={(value) => updatePaneSize("project", value)}
            />
          </>
        )}

        <div className={`workspace-stack${bottomOpen ? " has-bottom-window" : ""}`} id="editor-workspace">
          <div className={`editor-and-simulator${simulatorOpen ? " has-simulator" : ""}${hasActiveEditor ? "" : " is-editor-empty"}`}>
            {hasActiveEditor && (activePath.endsWith(".blk") ? (
              <BlocksEditorPane
                key={activePath}
                activePath={activePath}
                sourceXml={fileContents[activePath] ?? ""}
                configurationHash={simulatorRobotConfiguration.configurationHash}
                motors={configuredBlocksMotors}
                readOnly={editorMutationLocked}
                onSelectFile={handleOpenFile}
                onApplySnapshot={handleBlocksSnapshot}
                onKeyboardInput={handleBlocksKeyboardInput}
                onRegisterFlush={registerBlocksFlush}
                openXmlRequest={openBlocksXmlRequest}
                onOpenXmlRequestHandled={acknowledgeBlocksXmlRequest}
              />
            ) : (
                <EditorPane
                  activePath={activePath}
                  mobile={mobile}
                  blocksOnly={projectRecord.starter === "blocks"}
                projectId={projectId}
                openPaths={openPaths}
                fileContents={fileContents}
                diagnostics={buildState.diagnostics}
                debuggerController={debuggerController}
                editorLocation={editorLocation}
                projectCompletionTypeCount={projectArtifactCompletionCatalog(projectId)?.index.summary[0]}
                readOnly={editorMutationLocked}
                onSelectFile={handleOpenFile}
                onCloseFile={handleCloseFile}
                onChange={handleEditorChange}
                onOpenCommand={openCommandPalette}
              />
            ))}
            {simulatorOpen && hasActiveEditor && (
              <>
                <ResizeHandle
                  label="Resize Robot Simulator tool window"
                  orientation="vertical"
                  value={paneLayout.simulator}
                  bounds={paneBounds.simulator}
                  defaultValue={PANE_LAYOUT_DEFAULTS.simulator}
                  direction={-1}
                  onResize={(value) => updatePaneSize("simulator", value)}
                />
              </>
            )}
            <div
              className={`simulator-host${showSimulator ? "" : " is-hidden"}`}
              id="mobile-simulation-view"
              aria-hidden={showSimulator ? undefined : true}
              inert={showSimulator ? undefined : true}
            >
              <RobotSimulator
                worldSetup={desktop?.rehearsalSeed===undefined?undefined:{seed:desktop.rehearsalSeed,alliance:"red",startPosition:"near"}}
                variant={activeVariant}
                state={opModeState}
                paused={debugPaused}
                resetSignal={resetSignal}
                actuatorStore={actuatorStore}
                tickBudget={tickBudget}
                robotConfiguration={simulatorRobotConfiguration}
                inputSource={inputSourceLabel}
                fullscreenControls={opModeRunControls}
                simulateWhileHidden={mobile}
                runInBackground={Boolean(desktop)}
                controlDriven={Boolean(desktop)}
                touchControls={mobile && opModeState === "running" && <TouchGamepad registry={gamepadRegistry} active={showSimulator && !gameSimulationOpen && !configurationMaximized && !commandOpen && !gamepadConfigurationOpen} />}
                keyboardBindings={playSettings.keyboard}
                fieldPreset={fieldPreset}
                fieldParameters={fieldParameters}
                assetExport={assetExport}
                visible={showSimulator && !gameSimulationOpen}
                readOnly={readOnly}
                onTelemetry={(snapshot) => telemetryStore.publishRobot(snapshot)}
                onHardwareFrame={(frame) => { hardwareFrameRef.current = frame; }}
              />
            </div>
          </div>

          {(bottomOpen || mobile) && (
            <>
              <ResizeHandle
                label="Resize bottom tool window"
                orientation="horizontal"
                value={paneLayout.bottom}
                bounds={paneBounds.bottom}
                defaultValue={PANE_LAYOUT_DEFAULTS.bottom}
                direction={-1}
                onResize={(value) => updatePaneSize("bottom", value)}
              />
              <section className="bottom-window" id="mobile-output-view" aria-label={`${bottomTab} tool window`}>
              <header className="bottom-window__tabs">
                <div className="bottom-window__tablist" role="tablist" aria-label="Bottom tool windows">
                  {(["Run", "Build", "Problems", "Telemetry", "Debug"] as BottomTab[]).map((tab) => (
                    <button
                      type="button"
                      role="tab"
                      id={`bottom-tab-${tab.toLocaleLowerCase()}`}
                      aria-controls="bottom-tool-panel"
                      aria-selected={tab === bottomTab}
                      tabIndex={tab === bottomTab ? 0 : -1}
                      key={tab}
                      className={tab === bottomTab ? "is-active" : ""}
                      onClick={() => setBottomTab(tab)}
                      onKeyDown={(event) => {
                        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                        event.preventDefault();
                        const tabs: BottomTab[] = ["Run", "Build", "Problems", "Telemetry", "Debug"];
                        const index = tabs.indexOf(tab);
                        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
                          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                        setBottomTab(tabs[next]);
                        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <button type="button" className="bottom-window__close" onClick={() => { setBottomOpen(false); if (mobile) setMobileView("simulation"); }} aria-label="Close bottom tool window" title="Close bottom tool window">
                  <X aria-hidden="true" />
                </button>
              </header>
              <div
                className="bottom-window__content"
                id="bottom-tool-panel"
                role="tabpanel"
                aria-labelledby={`bottom-tab-${bottomTab.toLocaleLowerCase()}`}
              >
                {bottomTab === "Run" && (
                  <pre>{runLog.join("\n")}</pre>
                )}
                {bottomTab === "Build" && (
                  <div className="build-view">
                    <div className={`tool-message tool-message--${buildState.status}`}>
                      {buildState.status === "failed" || buildState.status === "unavailable"
                        ? <CircleAlert aria-hidden="true" />
                        : <Hammer aria-hidden="true" />}
                      <div><strong>{buildState.title}{buildState.status === "building" && buildState.startedAt !== undefined && <BuildElapsedTime key={buildState.startedAt} startedAt={buildState.startedAt} />}</strong><span>{buildState.detail}</span></div>
                    </div>
                    <button type="button" className="build-action" onClick={buildState.status === "building" ? handleCancelBuild : handleBuild} disabled={buildState.status !== "building" && !canBuildWorkspace}>
                      {buildState.status === "building" ? "Cancel build" : "Build project"}
                    </button>
                    <BuildDiagnostics diagnostics={buildState.diagnostics} />
                    {runnerMode === "local-v3" && <p className="trusted-local-note">Runs on this computer. Build only code you trust.</p>}
                  </div>
                )}
                {bottomTab === "Problems" && (
                  buildState.diagnostics.length > 0 ? (
                    <div className="problems-view">
                      <strong>{buildState.diagnostics.length} build diagnostic{buildState.diagnostics.length === 1 ? "" : "s"}</strong>
                      <BuildDiagnostics diagnostics={buildState.diagnostics} />
                    </div>
                  ) : (
                    <div className="tool-message tool-message--success">
                      <CircleAlert aria-hidden="true" />
                      <div><strong>No build diagnostics</strong><span>Build the project to check the Java sources.</span></div>
                    </div>
                  )
                )}
                {bottomTab === "Telemetry" && (
                  <TelemetryPanel
                    store={telemetryStore}
                    analysisStore={analysisStore}
                    advantageScope={advantageScope}
                    advantageScopeAssets={advantageScopeAssets}
                    onAnalysisOpen={() => { if (!mobile) updatePaneSize("bottom", Math.max(paneLayout.bottom, 460)); }}
                    opModeState={opModeState}
                    drivetrainLabel={ROBOT_LABELS[activeVariant]}
                  />
                )}
                {bottomTab === "Debug" && <DebugPanel controller={debuggerController}
                  sourcePaths={Object.keys(fileContents).filter((path) => /\.(java|kt)$/u.test(path)).sort()}
                  activePath={activePath} runActive={["initializing", "ready", "running"].includes(opModeState)}
                  onOpenFile={(path, line) => { handleOpenFile(path); if (line) setEditorLocation({ path, line, nonce: Date.now() }); }}
                  onStop={() => { void invalidateRuntime("Debug run stopped. Motor demand returned to zero.", { preserveBuildArtifact: true }); }} />}
              </div>
              </section>
            </>
          )}
        </div>

        <aside className="tool-rail tool-rail--right" aria-label="Right tool windows">
          <div className="tool-rail__group">
            <ToolButton label="Robot Simulator" active={simulatorOpen && rightTool === "simulator"} onClick={toggleSimulatorWindow}><Bot /></ToolButton>
          </div>
        </aside>
      </div>

      {mobile && <MobileWorkspaceNav view={activeMobileView} onChange={setMobileView}
        hasProblems={buildState.status === "failed"} blocksOnly={projectRecord.starter === "blocks"} />}
      <footer className="status-bar">
        <nav className="breadcrumbs" aria-label={projectRecord.starter === "blocks" ? "Current OpMode" : "Current file path"}>
          {projectRecord.starter === "blocks" && /\.(?:blk|java)$/u.test(activePath) ? (
            <span>{activePath.split("/").at(-1)?.replace(/\.(?:blk|java)$/u, "")}</span>
          ) : breadcrumb.map((segment, index) => (
            <span key={`${segment}-${index}`}>{segment}{index < breadcrumb.length - 1 && <ChevronDown aria-hidden="true" />}</span>
          ))}
        </nav>
        <div className="status-bar__spacer" />
        <RunStateLabel state={opModeState} />
        {debugPaused && <button type="button" className="status-bar__retry" onClick={() => openBottom("Debug")}>Paused at breakpoint</button>}
        {readOnly && <span title="The project is open in another tab">Read-only</span>}
        {duplicatingProject && <span>Duplicating project…</span>}
        {saveStatus === "saving" && <span>Saving…</span>}
        {saveStatus === "saved" && (readOnly || cloudSyncStatus === "idle") && (
          <span>{readOnly ? "Local copy" : projectAccountId ? "Saved locally · Sync pending" : "Saved locally"}</span>
        )}
        {saveStatus === "saved" && cloudSyncStatus === "syncing" && <span>Saved locally · Syncing…</span>}
        {saveStatus === "saved" && cloudSyncStatus === "synced" && <span>Synced</span>}
        {saveStatus === "saved" && (cloudSyncStatus === "offline" || cloudSyncStatus === "failed") && (
          <button
            type="button"
            className="status-bar__retry"
            title={cloudSyncError?.message}
            onClick={() => { void cloudSyncRef.current?.retry().catch(() => undefined); }}
          >
            Saved locally · Sync paused — Retry
          </button>
        )}
        {saveStatus === "saved" && cloudSyncStatus === "paused-size" && (
          <button
            type="button"
            className="status-bar__retry"
            title={cloudSyncError?.message}
            onClick={() => { void cloudSyncRef.current?.retry().catch(() => undefined); }}
          >
            Saved locally · Cloud limit — Retry
          </button>
        )}
        {saveStatus === "saved" && cloudSyncStatus === "paused-runtime" && (
          <span>Saved locally · Sync paused while OpMode runs</span>
        )}
        {saveStatus === "saved" && cloudSyncStatus === "update-unavailable" && (
          <button
            type="button"
            className="status-bar__retry"
            title={cloudSyncError?.message}
            onClick={() => { void handleRetryCloudUpdate(); }}
          >
            Cloud update unavailable — Retry
          </button>
        )}
        {saveStatus === "saved" && cloudSyncStatus === "conflict" && (
          <button
            type="button"
            className="status-bar__retry"
            onClick={() => {
              setCloudConflictError(null);
              setCloudConflictOpen(true);
            }}
          >
            Sync conflict — Review
          </button>
        )}
        {saveStatus === "failed" && (
          <button
            type="button"
            className="status-bar__retry"
            onClick={() => {
              void Promise.all([
                autosaveRef.current?.retry(),
                sessionAutosaveRef.current?.retry(),
              ]).catch(() => undefined);
            }}
          >
            Save failed — Retry
          </button>
        )}
        <span>50 Hz</span>
        <span>LF</span>
        <span>UTF-8</span>
        <span>4 spaces</span>
        <span>FTC SDK 11.1.0</span>
      </footer>

      <div className="live-status" aria-live="polite">
        {exitState === "saving" ? "Saving and exiting to Welcome… " : ""}
        OpMode state: {opModeState}. Build: {buildState.title}.
        Cloud project state: {cloudSyncStatus}.
        {configurationMaximized ? " Robot Settings dialog open." : ""}
        {projectExportStatus ? ` ${projectExportStatus}` : ""}
        {duplicatingProject ? " Duplicating project…" : ""}
      </div>

      {commandOpen && (
        <div className="command-backdrop" role="presentation" onMouseDown={closeCommandPalette}>
          <section ref={commandPaletteRef} className="command-palette" role="dialog" aria-modal="true" aria-label="Search everywhere" onMouseDown={(event) => event.stopPropagation()}>
            <div className="command-palette__input">
              <Search aria-hidden="true" />
              <input
                autoFocus
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Search files and actions"
                aria-label="Search files and actions"
              />
              <kbd>Esc</kbd>
            </div>
            <div className="command-palette__results">
              {matchingCommandFiles.map((path) => (
                <button type="button" key={path} onClick={() => { handleOpenFile(path); closeCommandPalette(); }}>
                  <Code2 /><span><strong>{path.split("/").at(-1)}</strong><small>{path}</small></span>
                </button>
              ))}
              {commandMatches("Open Robot Simulator") && <button type="button" onClick={() => { closeCommandPalette(); openRightToolWindow("simulator"); }}><Bot /><span><strong>Open Robot Simulator</strong><small>Tool Windows</small></span><Command /></button>}
              {commandMatches("Open Project Settings") && <button type="button" onClick={() => { openRobotConfigurationDialog(); closeCommandPaletteForFocusTransfer(); }}><Settings /><span><strong>Open Project Settings</strong><small>Robot</small></span></button>}
              {commandMatches("Initialize selected OpMode") && <button type="button" disabled={!canInitializeWorkspace} onClick={() => { closeCommandPalette(); void initializeRuntime(false); }}><Bug /><span><strong>Initialize selected OpMode</strong><small>{canInitializeWorkspace ? "Run" : "Unavailable while the workspace is busy"}</small></span></button>}
              {commandMatches("Run selected OpMode") && <button type="button" disabled={!canRunWorkspace} onClick={() => { closeCommandPalette(); void handleRun(); }}><Play /><span><strong>Run selected OpMode</strong><small>{canRunWorkspace ? "Run" : "Unavailable while the workspace is busy"}</small></span></button>}
              {commandMatches("Build project") && <button type="button" disabled={!canBuildWorkspace} onClick={() => { void handleBuild(); }}><Hammer /><span><strong>Build project</strong><small>{canBuildWorkspace ? "Build" : "Unavailable while the workspace is busy"}</small></span></button>}
              {workspaceCapabilities.allowNewOpMode && commandMatches("New OpMode") && <button type="button" disabled={editorMutationLocked} onClick={() => {
                setNewOpModeReturnFocus(commandOpenerRef.current);
                setNewOpModeKind("teleop");
                closeCommandPaletteForFocusTransfer();
                setNewOpModeOpen(true);
              }}><Code2 /><span><strong>New OpMode…</strong><small>TeamCode</small></span></button>}
              {activePath.endsWith(".blk") && commandMatches("Open Blocks XML source") && <button type="button" onClick={() => {
                closeCommandPaletteForFocusTransfer();
                setOpenBlocksXmlRequest({ id: ++blocksXmlRequestIdRef.current, path: activePath });
              }}><Code2 /><span><strong>Open Blocks XML source</strong><small>Blocks</small></span></button>}
              {commandMatches("Export Project") && <button type="button" onClick={() => { openProjectExportDialog(); closeCommandPaletteForFocusTransfer(); }}><Download /><span><strong>Export Project…</strong><small>Project</small></span></button>}
              {commandMatches("Duplicate Project") && <button type="button" disabled={readOnly || workspaceMutationLocked} onClick={() => { closeCommandPalette(); void duplicateCurrentProject(); }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 4h12v12M4 8h12v12H4z" /></svg><span><strong>Duplicate Project</strong><small>Project</small></span></button>}
              {commandMatches("Gamepad Configuration") && <button type="button" onClick={() => {
                setGamepadConfigurationReturnFocus(commandOpenerRef.current);
                closeCommandPaletteForFocusTransfer();
                setGamepadConfigurationOpen(true);
              }}><Gamepad2 /><span><strong>Gamepad Configuration</strong><small>Settings</small></span></button>}
              {commandMatches("Reset simulation") && <button type="button" onClick={() => { closeCommandPalette(); void handleReset(); }}><RotateCcw /><span><strong>Reset simulation</strong><small>Robot</small></span></button>}
              {commandMatches("Show Telemetry") && <button type="button" onClick={() => { closeCommandPalette(); openBottom("Telemetry"); }}><PanelBottom /><span><strong>Show Telemetry</strong><small>Tool Windows</small></span></button>}
              {commandMatches("Show Debug") && <button type="button" onClick={() => { closeCommandPalette(); openBottom("Debug"); }}><span><strong>Show Debug</strong><small>Breakpoints, variables, watches</small></span></button>}
              {commandMatches("Reset tool window sizes") && <button type="button" onClick={resetPaneLayout}><PanelBottom /><span><strong>Reset tool window sizes</strong><small>Window</small></span></button>}
              {matchingCommandFiles.length === 0 && ![
                "Open Robot Simulator",
                "Open Project Settings",
                "Initialize selected OpMode",
                "Run selected OpMode",
                "Build project",
                ...(workspaceCapabilities.allowNewOpMode ? ["New OpMode"] : []),
                ...(activePath.endsWith(".blk") ? ["Open Blocks XML source"] : []),
                "Export Project",
                "Duplicate Project",
                "Gamepad Configuration",
                "Reset simulation",
                "Show Telemetry",
                "Reset tool window sizes",
              ].some(commandMatches) && <p className="command-palette__empty">No matching files or actions.</p>}
            </div>
          </section>
        </div>
      )}

      {configurationVisited && <div hidden={!configurationMaximized} style={{ display: configurationMaximized ? "contents" : "none" }}>
        <RobotConfigurationDialog
          active={configurationMaximized}
          fieldPreset={fieldPreset}
          fieldParameters={fieldParameters}
          onFieldPresetChange={handleFieldPresetChange}
          onFieldParametersChange={handleFieldParametersChange}
          playSettings={playSettings}
          onPlaySettingsChange={handlePlaySettingsChange}
          document={robotConfiguration.document}
          error={robotConfiguration.error}
          disabled={robotConfigurationLocked}
          disabledReason={robotConfigurationLockReason}
          onCommand={handleRobotConfigurationCommand}
          onOpenManifest={openRobotConfigurationManifest}
          onClose={closeRobotConfiguration}
        />
      </div>}

      {gameSimulationOpen && <GameSimulationPanel
        rehearsalSeed={desktop?.rehearsalSeed}
        open
        onClose={() => setGameSimulationOpen(false)}
        onConfigureRobot={() => { setGameSimulationOpen(false); openRobotConfigurationDialog(); }}
        returnFocus={gameSimulationButton}
        robotConfiguration={simulatorRobotConfiguration.physical}
        opModes={runConfigurations.map((configuration) => ({ className: configuration.value, displayName: configuration.label, kind: configuration.kind }))}
        loadWorldOptions={loadMatchWorldOptions}
        prepareProgram={prepareMatchProgram}
        touchRegistry={mobile ? gamepadRegistry : undefined}
        readGamepads={() => { const frame = gamepadRegistry.poll(); return { gamepad1: toProtocolGamepad(frame.gamepad1), gamepad2: toProtocolGamepad(frame.gamepad2) }; }}
        createPolicies={createMatchPolicies}
        handoffProgram={(session, entryClass, sensors) => session.handoff({ entryClass, sensors })}
      />}

      {githubPublishOpen && <GitHubPublishDialog
        projectName={projectRecord.name} dirty={gitSnapshot?.dirty ?? false} remote={projectRecord.remote}
        onClose={() => { setGitHubPublishOpen(false); window.requestAnimationFrame(() => {
          const buttons = [githubPublishOpenerRef.current, ...document.querySelectorAll<HTMLButtonElement>('.project-widget, button[title="Project Settings"]')];
          buttons.find((button) => button && button.getClientRects().length > 0)?.focus();
        }); }}
        onPublish={handleGitPublish}
      />}
      {projectExportOpen && (
        <ProjectExportDialog
          projectName={projectRecord.name}
          fullFileCount={Object.keys(fileContents).length}
          teamCodeFileCount={Object.keys(fileContents).filter((path) => path.startsWith("TeamCode/")).length}
          onClose={closeProjectExportDialog}
          onExport={exportProject}
        />
      )}

      {exitState === "failed" && exitError && (
        <ExitSaveFailureDialog
          error={exitError}
          kind={exitFailureKind}
          projectName={projectRecord.name}
          onCancel={() => {
            setExitState("idle");
            setExitError(null);
          }}
          onLeave={() => { void saveAndExitToWelcome(true); }}
          onRetry={() => { void saveAndExitToWelcome(false); }}
        />
      )}
      {cloudConflictOpen && (
        <CloudSyncConflictDialog
          busy={cloudConflictBusy}
          error={cloudConflictError}
          projectName={projectRecord.name}
          onCancel={() => {
            if (cloudConflictBusy) return;
            setCloudConflictOpen(false);
            setCloudConflictError(null);
          }}
          onUseCloud={() => { void handleUseCloudConflictCopy(); }}
          onKeepDevice={() => { void keepDeviceConflictCopy(); }}
        />
      )}
      {workspaceCapabilities.allowNewOpMode && (
        <NewOpModeDialog
          key={newOpModeOpen ? "new-opmode-open" : "new-opmode-closed"}
          open={newOpModeOpen}
          packageName={projectRecord.javaPackage}
          existingPaths={existingProjectPaths}
          returnFocus={newOpModeReturnFocus}
          onClose={() => setNewOpModeOpen(false)}
          onCreate={handleCreateOpMode}
          blocksOnly={projectRecord.starter === "blocks"}
          initialKind={newOpModeKind}
        />
      )}
      {newProjectOpen && <NewProjectDialog onClose={() => setNewProjectOpen(false)} />}
      {gitHubProjectOpen && <GitHubProjectDialog onClose={() => setGitHubProjectOpen(false)} />}
    </main>
    </CadAssetReaderContext.Provider>
  );
}
