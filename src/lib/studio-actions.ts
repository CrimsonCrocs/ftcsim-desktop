import type { OpModeState } from "@/lib/studio-types";
import type { PersistedStarterLanguage } from "@/lib/projects/types";
import { blocksDocumentIdentity } from "@/lib/blocks/documents";

export type StudioBuildStatus = "idle" | "building" | "succeeded" | "failed" | "unavailable";

export interface StudioActionAvailability {
  build: boolean;
  initialize: boolean;
  run: boolean;
  stop: boolean;
}

export interface WorkspaceProjectCapabilities {
  showProjectTree: boolean;
  allowNewOpMode: boolean;
}

export function resolveWorkspaceEditorState(input: {
  starter: PersistedStarterLanguage;
  files: Readonly<Record<string, string>>;
  openTabs: readonly string[];
  activeFile: string | null;
}): { openTabs: string[]; activeFile: string } {
  const availablePaths = Object.keys(input.files);
  if (input.starter === "blocks") {
    const blocksPaths = availablePaths
      .filter((path) => path.endsWith(".blk"))
      .sort((left, right) => left.localeCompare(right));
    const generatedJavaPaths = new Set(blocksPaths
      .map((path) => blocksDocumentIdentity(path)?.generatedJavaPath)
      .filter((path): path is string => Boolean(path)));
    const validPath = (path: string) => path in input.files
      && (path.endsWith(".blk") || generatedJavaPaths.has(path));
    const activeFile = input.activeFile && validPath(input.activeFile)
      ? input.activeFile
      : input.openTabs.find(validPath) ?? blocksPaths[0] ?? "";
    const openTabs = input.openTabs.filter(validPath);
    return {
      openTabs: activeFile && !openTabs.includes(activeFile) ? [...openTabs, activeFile] : openTabs,
      activeFile,
    };
  }
  // An empty tab list is a saved workspace choice, including a new empty project.
  if (input.openTabs.length === 0 && input.activeFile === null) {
    return { openTabs: [], activeFile: "" };
  }
  const fallbackPath = availablePaths.find((path) => /TeamCode\/src\/main\/.+\.(?:java|kt|blk)$/u.test(path))
    ?? availablePaths[0]
    ?? "";
  const openTabs = input.openTabs.filter((path) => path in input.files);
  const activeFile = input.activeFile && input.activeFile in input.files
    ? input.activeFile
    : openTabs[0] ?? fallbackPath;
  return {
    openTabs: openTabs.length > 0 ? openTabs : activeFile ? [activeFile] : [],
    activeFile,
  };
}

export function getWorkspaceProjectCapabilities(
  starter: PersistedStarterLanguage,
): WorkspaceProjectCapabilities {
  void starter;
  return {
    showProjectTree: true,
    allowNewOpMode: true,
  };
}

export type WorkspaceMutationPhase = "idle" | "flushing-blocks" | "mutating";

export function canAcceptBlocksSnapshot(input: {
  readOnly: boolean;
  workspaceLocked: boolean;
  workspacePhase: WorkspaceMutationPhase;
  hostFlushDepth: number;
  runtimeInitializing: boolean;
}): boolean {
  if (input.readOnly) return false;
  const correlatedWorkspaceFlush = (
    input.hostFlushDepth > 0
    && input.workspacePhase === "flushing-blocks"
  );
  if (input.workspaceLocked && !correlatedWorkspaceFlush) return false;
  if (input.runtimeInitializing && input.hostFlushDepth === 0) return false;
  return true;
}

export function getStudioActionAvailability(
  buildStatus: StudioBuildStatus,
  opModeState: OpModeState,
): StudioActionAvailability {
  const runnerBusy = buildStatus === "building" || opModeState === "initializing";
  return {
    build: !runnerBusy && opModeState !== "running",
    initialize: !runnerBusy && opModeState !== "running" && opModeState !== "ready",
    run: !runnerBusy && opModeState !== "running",
    stop: opModeState === "running",
  };
}

export function findSampleImportCollisions(
  currentFiles: Readonly<Record<string, string>>,
  sampleFiles: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(sampleFiles)
    .filter((path) => currentFiles[path] !== undefined && currentFiles[path] !== sampleFiles[path])
    .sort((left, right) => left.localeCompare(right));
}
