import { compileLibraryAdapters } from "./library-adapters";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync, zipSync } from "fflate";

import {
  OPMODE_PROTOCOL_VERSION,
  type BuildJobStage,
  type HotReloadResult,
  type DebugState,
  type ReloadSourcesMessage,
  type ProgramSource,
  type BuildArtifactBundle,
  type BuildProgramMessage,
  type HandoffMessage,
  type BuildDiagnostic,
  type DiscoveredOpMode,
  type InitMessage,
  type LoadArtifact,
  type LoadArtifactProgramMessage,
  type LoadProgramMessage,
  type OpModeClientMessage,
  type OpModePhase,
  type OpModeServerMessage,
  type RepositorySnapshot,
  type SimulationFrame,
  type SimulatedMotorDescriptor,
  type SimulatedSensorDescriptor,
  type SimulatedCameraDescriptor,
  type TickMessage,
  type TransitionMessage,
} from "@ftc-studio/opmode-protocol";

import {
  compilePersistentJava,
  isolatedProcessEnvironment,
  type CompiledJavaWorkspace,
  type JavaCompilerConfig,
  type PersistentCompilationResult,
} from "./java-compiler";
import {
  createBunJvmWorker,
  type JvmWorkerFactory,
  type OpModeJvmWorker,
} from "./jvm-worker";
import type { ProcessExecutor } from "./process-executor";
import { compileHotReload } from "./hot-reload-compiler";
import { isStandardBase64 } from "./base64";
import { scanSdkBytecodeCompatibility } from "./bytecode-compatibility";
import { compilePersistentMixedProgram } from "./mixed-compiler";
import { resolveKotlinToolchain } from "./kotlin-toolchain";
import { normalizeMotorDescriptors } from "./motor-profile";
import { requireFtcSdkToolchain } from "./ftc-sdk-toolchain";
import {
  buildGradleProject,
  decodeRepositorySnapshot,
  hashRepositoryFiles,
  hasGradleProject,
} from "../../../tools/gradle/gradle-adapter";
import {
  PROJECT_COMPLETION_INDEX_FORMAT,
  PROJECT_COMPLETION_INDEX_PATH,
  type ProjectArtifactCompletionDocument,
} from "../../../src/lib/completions/project-artifact-completions";
import {
  SHARED_ARTIFACT_LIBRARY_HASHES,
  readSharedArtifactLibrary,
  resolveSharedArtifactLibraryDirectory,
  seedSharedArtifactLibraries,
  validateSharedArtifactLibraryReferences,
} from "./artifact-libraries";

const DISCOVERY_MAIN_CLASS = "org.firstinspires.ftc.sim.OpModeDiscoveryCli";
const ARTIFACT_BUNDLE_MAX_BYTES = 64 * 1024 * 1024;
const ARTIFACT_BUNDLE_MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const ARTIFACT_BUNDLE_MANIFEST_PATH = "META-INF/ftc-sim/artifact.json";

interface BuildJobUpdate {
  stage: BuildJobStage;
  message: string;
  artifact?: LoadArtifact;
  artifactBundle?: BuildArtifactBundle;
  error?: { code: string; message: string; diagnostics?: BuildDiagnostic[] };
}

export interface LocalOpModeSessionConfig extends JavaCompilerConfig {
  /** Trusted in-process desktop clients retain compiled classes instead of transferring a ZIP. */
  artifactTransport?: "bundle" | "local";
  onCompletionIndex?: (document: ProjectArtifactCompletionDocument) => void;
  workerFactory?: JvmWorkerFactory;
  kotlinHome?: string;
  expectedArtifactHash?: string;
  gradleExecutable?: string;
  gradleUserHome?: string;
  gradleFailureEvidencePath?: string;
  artifactLibraryDirectory?: string;
}

interface HotReloadPlan {
  sourcePaths: string[];
  classFiles: string[];
  fixedSources: ProgramSource[];
}

interface LoadedProgram {
  compilation: PersistentCompilationResult;
  workspace: CompiledJavaWorkspace;
  artifact: LoadArtifact;
  artifactBundle?: BuildArtifactBundle;
  hotReloadPlan?: HotReloadPlan;
  reloadBase?: CompiledJavaWorkspace;
  reloadCompilation?: PersistentCompilationResult;
  runtimeOpModes?: DiscoveredOpMode[];
  hardware: {
    motors: SimulatedMotorDescriptor[];
    servos: string[];
    sensors: SimulatedSensorDescriptor[];
    cameras: SimulatedCameraDescriptor[];
  };
}

export class LocalOpModeSession {
  private readonly workerFactory: JvmWorkerFactory;
  private loaded?: LoadedProgram;
  private worker?: OpModeJvmWorker;
  private activeOpMode?: DiscoveredOpMode;
  private phase: OpModePhase = "closed";
  private frame = neutralFrame("closed");
  private lastSequence = -1;
  private tickInFlight = false;
  private closed = false;
  private epoch = 0;
  onDebugState?: (state: DebugState) => void;
  private debugEpoch = 0;
  private buildAbortController?: AbortController;

  constructor(private readonly config: LocalOpModeSessionConfig) {
    this.workerFactory = config.workerFactory ?? createBunJvmWorker;
  }

  get powered(): boolean {
    return this.phase === "initialized" || this.phase === "running";
  }

  async handle(message: OpModeClientMessage): Promise<OpModeServerMessage> {
    if (this.closed && message.command !== "load" && message.command !== "build"
        && message.command !== "load-artifact") {
      return this.error(message, "SESSION_CLOSED", "The OpMode session is closed");
    }
    try {
      switch (message.command) {
        case "build": return this.error(message, "BUILD_JOB_REQUIRED", "Builds must use the asynchronous build-job transport");
        case "load-artifact": return await this.loadArtifact(message);
        case "reload-sources": return await this.reloadSources(message);
        case "load": return await this.load(message);
        case "init": return await this.init(message);
        case "handoff": return await this.handoff(message);
        case "heartbeat": return this.ok(message, {});
        case "debug": {
          if (!this.worker?.debug) return this.error(message, "DEBUG_NOT_ENABLED", "Enable debugging, then run the OpMode again.");
          try { return this.ok(message, { debug: await this.worker.debug(message) }); }
          catch (error) { return this.error(message, "DEBUG_COMMAND_FAILED", error instanceof Error ? error.message : "Debugger command failed"); }
        }
        case "start": return await this.transition(message, "start");
        case "stop": return await this.transition(message, "stop");
        case "reset": return await this.reset(message);
        case "tick": return await this.tick(message);
        case "close": return await this.close(message);
      }
    } catch (failure) {
      await this.failClosed();
      return this.error(
        message,
        "RUNTIME_ERROR",
        failure instanceof Error ? failure.message : "The OpMode runtime failed",
        this.frame,
      );
    }
  }

  startBuildJob(
    message: BuildProgramMessage,
    publish: (event: OpModeServerMessage) => void,
  ): { jobId: string; done: Promise<void> } {
    const jobId = randomUUID();
    const report = (progress: BuildJobUpdate) => publish({
      protocolVersion: OPMODE_PROTOCOL_VERSION,
      type: "build-job",
      jobId,
      requestId: message.requestId,
      ...progress,
    });
    queueMicrotask(() => report({ stage: "queued", message: "Build queued" }));
    const sources = sourcesFromSnapshot(message.repositorySnapshot);
    const loadMessage: LoadProgramMessage = {
      protocolVersion: OPMODE_PROTOCOL_VERSION,
      requestId: message.requestId,
      command: "load",
      sources,
      hardware: message.hardware,
    };
    const done = this.load(loadMessage, message.repositorySnapshot, report)
      .then((result) => {
        if (result.type === "response" && result.status === "ok" && result.artifact) {
          report({
            stage: "ready",
            message: "TeamCode compiled and OpModes were discovered",
            artifact: result.artifact,
            artifactBundle: this.loaded?.artifact.artifactId === result.artifact.artifactId
              ? this.loaded.artifactBundle
              : undefined,
          });
          return;
        }
        const error = result.type === "response" && result.status === "error"
          ? result.error
          : { code: "BUILD_FAILED", message: "TeamCode build failed" };
        report({ stage: "failed", message: error.message, error });
      })
      .catch((failure: unknown) => {
        void this.forceClose();
        const error = {
          code: "BUILD_FAILED",
          message: failure instanceof Error ? failure.message : "TeamCode build failed",
        };
        report({ stage: "failed", message: error.message, error });
      });
    return { jobId, done };
  }

  async forceClose(): Promise<SimulationFrame> {
    this.epoch++;
    this.buildAbortController?.abort();
    this.buildAbortController = undefined;
    await this.failClosed();
    await this.loaded?.reloadCompilation?.dispose();
    await this.loaded?.compilation.dispose();
    this.loaded = undefined;
    this.activeOpMode = undefined;
    this.closed = true;
    this.phase = "closed";
    this.frame = neutralizeFrame(this.frame, "closed");
    return this.frame;
  }

  private async loadArtifact(message: LoadArtifactProgramMessage): Promise<OpModeServerMessage> {
    if (this.config.expectedArtifactHash
        && message.artifact.artifactHash !== this.config.expectedArtifactHash) {
      throw new Error("The artifact hash does not match the runtime session ticket");
    }
    await this.forceClose();
    this.closed = false;
    const workspace = await mkdtemp(join(tmpdir(), "ftc-runtime-artifact-"));
    try {
      const bundle = message.artifactBundle;
      if (bundle.format !== "ftc-teamcode-artifact-v1"
          || bundle.encoding !== "base64"
          || !/^[a-f0-9]{64}$/u.test(bundle.sha256)
          || bundle.sha256 !== message.artifact.artifactHash
          || bundle.runtimeClasspath[0] !== "teamcode/classes") {
        throw new Error("The build artifact bundle metadata is invalid");
      }
      const archiveBytes = decodeArtifactBase64(bundle.content);
      if (createHash("sha256").update(archiveBytes).digest("hex") !== bundle.sha256) {
        throw new Error("The build artifact bundle hash does not match its content");
      }
      if (archiveBytes.byteLength > ARTIFACT_BUNDLE_MAX_BYTES) {
        throw new Error("The build artifact bundle exceeds the 64 MiB compressed size limit");
      }
      const archive = unzipSync(archiveBytes);
      const archivePaths = Object.keys(archive).sort();
      if (archivePaths.length > 20_000) throw new Error("The build artifact contains too many files");
      let uncompressedBytes = 0;
      for (const [path, bytes] of Object.entries(archive)) {
        validateArtifactPath(path);
        uncompressedBytes += bytes.byteLength;
        if (uncompressedBytes > ARTIFACT_BUNDLE_MAX_UNCOMPRESSED_BYTES) {
          throw new Error("The build artifact expands beyond the 128 MiB limit");
        }
        const output = resolve(workspace, path);
        if (!isPathInside(workspace, output)) throw new Error("The build artifact contains a path outside its root");
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, bytes, { mode: 0o600 });
      }
      const manifestPath = join(workspace, ARTIFACT_BUNDLE_MANIFEST_PATH);
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ArtifactBundleManifest;
      const metadataMismatches: string[] = [];
      if (!isDeepStrictEqual(manifest.hotReload && {sourcePaths: manifest.hotReload.sourcePaths}, message.artifact.hotReload)) metadataMismatches.push("hotReload");
      if (manifest.hotReload) validateHotReloadPlan(manifest.hotReload);
      if (manifest.format !== "ftc-teamcode-artifact-v1") metadataMismatches.push("format");
      if (!isDeepStrictEqual(manifest.runtimeClasspath, bundle.runtimeClasspath)) metadataMismatches.push("runtimeClasspath");
      if (manifest.repositorySnapshotHash !== message.artifact.repositorySnapshotHash) metadataMismatches.push("repositorySnapshotHash");
      if (manifest.artifactId !== message.artifact.artifactId) metadataMismatches.push("artifactId");
      if (manifest.sourceHash !== message.artifact.sourceHash) metadataMismatches.push("sourceHash");
      if (!isDeepStrictEqual(manifest.resolvedDependencies, message.artifact.resolvedDependencies)) metadataMismatches.push("resolvedDependencies");
      if (!isDeepStrictEqual(manifest.diagnostics, message.artifact.diagnostics)) metadataMismatches.push("diagnostics");
      if (!isDeepStrictEqual(manifest.opModes, message.artifact.opModes)) metadataMismatches.push("opModes");
      if (metadataMismatches.length > 0) {
        throw new Error(`The build artifact manifest does not match its metadata (${metadataMismatches.join(", ")})`);
      }
      if (manifest.completionIndexPath !== undefined) {
        const completionIndexBytes = archive[manifest.completionIndexPath];
        if (manifest.completionIndexPath !== PROJECT_COMPLETION_INDEX_PATH
            || !completionIndexBytes
            || !/^[a-f0-9]{64}$/u.test(manifest.completionIndexSha256 ?? "")
            || manifest.completionIndexFormat !== PROJECT_COMPLETION_INDEX_FORMAT
            || createHash("sha256").update(completionIndexBytes).digest("hex") !== manifest.completionIndexSha256) {
          throw new Error("The build artifact completion index does not match its manifest");
        }
      } else if (manifest.completionIndexSha256 !== undefined || manifest.completionIndexFormat !== undefined) {
        throw new Error("The build artifact completion index manifest is incomplete");
      }
      const sharedLibraries = validateSharedArtifactLibraryReferences(
        manifest.sharedLibraries,
        bundle.runtimeClasspath,
        new Set(archivePaths),
      );
      for (const [path, hash] of Object.entries(sharedLibraries)) {
        const bytes = await readSharedArtifactLibrary(hash, this.config.artifactLibraryDirectory);
        uncompressedBytes += bytes.byteLength;
        if (uncompressedBytes > ARTIFACT_BUNDLE_MAX_UNCOMPRESSED_BYTES) {
          throw new Error("The build artifact expands beyond the 128 MiB limit");
        }
        const output = resolve(workspace, path);
        if (!isPathInside(workspace, output)) throw new Error("Artifact classpath escaped its workspace");
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, bytes, { mode: 0o600 });
      }
      const classesRoot = resolve(workspace, "teamcode/classes");
      const runtimeClasspath = bundle.runtimeClasspath.map((entry) => {
        validateArtifactPath(entry);
        const output = resolve(workspace, entry);
        if (!isPathInside(workspace, output)) throw new Error("Artifact classpath escaped its workspace");
        return output;
      });
      if (runtimeClasspath.length === 0) throw new Error("The build artifact has no runtime classpath");
      const workspaceInfo: CompiledJavaWorkspace = {
        workspace,
        classesRoot,
        shimSourcePaths: [],
        runtimeClasspath,
      };
      await compileLibraryAdapters({executor: this.config.executor, ...workspaceInfo, runtimeClasspath});
      const discovered = await discoverOpModes(workspaceInfo, this.config.executor);
      const opModes: DiscoveredOpMode[] = await Promise.all(discovered.map(async (mode) => {
        const runtimeDiagnostics = await scanSdkBytecodeCompatibility(classesRoot, undefined, [mode.className]);
        return {
          ...mode,
          runtimeSupported: runtimeDiagnostics.every(({ kind }) => kind !== "error"),
          runtimeDiagnostics,
        };
      }));
      if (!isDeepStrictEqual(opModes, manifest.opModes)) {
        throw new Error("The imported bytecode does not match the artifact OpMode manifest");
      }
      const artifact = { ...message.artifact };
      delete artifact.artifactBundle;
      const compilation: PersistentCompilationResult = {
        compilation: {
          status: "succeeded",
          entryClass: "org.firstinspires.ftc.teamcode.SessionDiscovery",
          diagnostics: artifact.diagnostics,
          timedOut: false,
          outputTruncated: false,
          durationMs: 0,
        },
        workspace: workspaceInfo,
        dispose: async () => rm(workspace, { force: true, recursive: true, maxRetries: 2, retryDelay: 20 }),
      };
      this.loaded = {
        compilation,
        workspace: workspaceInfo,
        artifact,
        hotReloadPlan: manifest.hotReload,
        reloadBase: workspaceInfo,
        hardware: {
          motors: normalizeMotorDescriptors(message.hardware.motors),
          servos: [...(message.hardware.servos ?? [])],
          sensors: [...(message.hardware.sensors ?? [])],
          cameras: [...(message.hardware.cameras ?? [])],
        },
      };
      this.phase = "loaded";
      this.frame = neutralFrame("loaded");
      return this.ok(message, { artifact, frame: this.frame });
    } catch (error) {
      await rm(workspace, { force: true, recursive: true, maxRetries: 2, retryDelay: 20 });
      this.closed = true;
      throw error;
    }
  }

  private async load(
    message: LoadProgramMessage,
    repositorySnapshot?: RepositorySnapshot,
    report?: (progress: BuildJobUpdate) => void,
  ): Promise<OpModeServerMessage> {
    const expectedEpoch = this.epoch + 1;
    await this.forceClose();
    if (this.epoch !== expectedEpoch) {
      return this.error(message, "SESSION_CLOSED", "The session closed before the build started");
    }
    this.closed = false;
    const loadEpoch = this.epoch;
    const buildAbortController = repositorySnapshot ? new AbortController() : undefined;
    this.buildAbortController = buildAbortController;
    const kotlin = message.sources.filter((source) => source.path.endsWith(".kt"));
    const useGradle = repositorySnapshot !== undefined
      && hasGradleProject(repositorySnapshot.files);
    const kotlinToolchain = !useGradle && kotlin.length > 0
      ? await resolveKotlinToolchain(this.config.kotlinHome)
      : undefined;
    if (!useGradle && kotlin.length > 0 && !kotlinToolchain) {
      this.buildAbortController = undefined;
      const diagnostics: BuildDiagnostic[] = kotlin.map((source) => ({
        kind: "error",
        file: source.path,
        code: "KOTLIN_COMPILER_NOT_INSTALLED",
        message: "Kotlin 2.2.10 is pinned but its compiler bundle is not installed in the local runner yet",
      }));
      return this.error(
        message,
        "KOTLIN_COMPILER_NOT_INSTALLED",
        "This local runner cannot compile Kotlin until the pinned 2.2.10 compiler bundle is installed",
        undefined,
        diagnostics,
      );
    }
    const decodedSnapshot = repositorySnapshot
      ? decodeRepositorySnapshot(repositorySnapshot)
      : message.sources.map((source) => ({
        path: source.path,
        bytes: new TextEncoder().encode(source.content),
      }));
    const snapshotHash = hashRepositoryFiles(decodedSnapshot);
    const sourceHash = createHash("sha256")
      .update(snapshotHash)
      .update("\0hardware\0")
      .update(message.hardware.configurationHash ?? JSON.stringify(message.hardware))
      .digest("hex");
    report?.({ stage: "resolving", message: useGradle ? "Resolving Gradle plugins and project dependencies" : "Preparing the Java toolchain" });
    let compilation: PersistentCompilationResult;
    let resolvedDependencies: string[] = [];
    let completionIndex: ProjectArtifactCompletionDocument | undefined;
    let hotReloadPlan: HotReloadPlan | undefined;
    if (useGradle && repositorySnapshot) {
      report?.({ stage: "compiling", message: "Gradle is compiling TeamCode sources and generated sources" });
      const gradle = await buildGradleProject(repositorySnapshot, {
        executor: this.config.executor,
        shimSourceRoot: this.config.shimSourceRoot,
        ftcSdk: this.config.ftcSdk ?? await requireFtcSdkToolchain({
          home: this.config.ftcSdkHome,
          androidJarPath: this.config.androidJarPath,
        }),
        ...(this.config.gradleExecutable ? { gradleExecutable: this.config.gradleExecutable } : {}),
        ...(this.config.gradleUserHome ? { gradleUserHome: this.config.gradleUserHome } : {}),
        ...(this.config.gradleFailureEvidencePath
          ? { failureEvidencePath: this.config.gradleFailureEvidencePath }
          : {}),
        signal: buildAbortController?.signal,
      });
      resolvedDependencies = gradle.workspace?.resolvedDependencies ?? [];
      completionIndex = gradle.workspace?.completionIndex;
      hotReloadPlan = gradle.workspace?.hotReload;
      compilation = {
        compilation: {
          status: gradle.status,
          entryClass: "org.firstinspires.ftc.teamcode.SessionDiscovery",
          diagnostics: gradle.diagnostics,
          timedOut: gradle.timedOut,
          outputTruncated: gradle.outputTruncated,
          durationMs: gradle.durationMs,
        },
        ...(gradle.workspace ? { workspace: {
          workspace: gradle.workspace.workspace,
          classesRoot: gradle.workspace.classesRoot,
          shimSourcePaths: [],
          runtimeClasspath: gradle.workspace.runtimeClasspath,
        } } : {}),
        dispose: gradle.dispose,
      };
    } else {
      report?.({ stage: "compiling", message: "Compiling TeamCode sources against the pinned FTC SDK" });
      compilation = kotlinToolchain
        ? await compilePersistentMixedProgram(message.sources, this.config, kotlinToolchain)
        : await compilePersistentJava({
          entryClass: "org.firstinspires.ftc.teamcode.SessionDiscovery",
          sources: message.sources,
        }, this.config);
      resolvedDependencies = (compilation.workspace?.runtimeClasspath ?? []).slice(1)
        .map((path) => path.split(/[\\/]/u).at(-1) ?? path);
    }
    if (this.closed || this.epoch !== loadEpoch) {
      await compilation.dispose();
      return this.error(message, "SESSION_CLOSED", "The session closed while TeamCode was compiling");
    }
    if (this.buildAbortController === buildAbortController) this.buildAbortController = undefined;
    if (!compilation.workspace || compilation.compilation.status === "failed") {
      return this.error(
        message,
        "COMPILATION_FAILED",
        "TeamCode did not compile",
        undefined,
        compilation.compilation.diagnostics,
      );
    }
    report?.({ stage: "discovering", message: "Discovering enabled OpModes without running their static initializers" });
    let opModes: DiscoveredOpMode[];
    let artifactBundle: BuildArtifactBundle | undefined;
    const artifactId = randomUUID();
    try {
      const discovered = await discoverOpModes(compilation.workspace, this.config.executor);
      opModes = await Promise.all(discovered.map(async (mode) => {
        const runtimeDiagnostics = await scanSdkBytecodeCompatibility(
          compilation.workspace!.classesRoot,
          undefined,
          [mode.className],
        );
        return {
          ...mode,
          runtimeSupported: runtimeDiagnostics.every(({ kind }) => kind !== "error"),
          runtimeDiagnostics,
        };
      }));
      if (this.config.artifactTransport !== "local") artifactBundle = await createArtifactBundle({
        workspace: compilation.workspace,
        artifactId,
        repositorySnapshotHash: snapshotHash,
        sourceHash,
        resolvedDependencies,
        completionIndex,
        hotReload: hotReloadPlan,
        opModes,
        diagnostics: compilation.compilation.diagnostics,
        artifactLibraryDirectory: this.config.artifactLibraryDirectory,
      });
    } catch (error) {
      await compilation.dispose();
      throw error;
    }
    if (this.closed || this.epoch !== loadEpoch) {
      await compilation.dispose();
      return this.error(message, "SESSION_CLOSED", "The session closed while OpModes were being discovered");
    }
    const artifact: LoadArtifact = {
      artifactId,
      artifactHash: artifactBundle?.sha256 ?? await hashLocalWorkspace(compilation.workspace, sourceHash),
      repositorySnapshotHash: snapshotHash,
      resolvedDependencies,
      sourceHash,
      sdkVersion: "11.1.0",
      javaTarget: "8",
      kotlinVersion: "2.2.10",
      opModes,
      diagnostics: compilation.compilation.diagnostics,
      ...(hotReloadPlan ? {hotReload: {sourcePaths: hotReloadPlan.sourcePaths}} : {}),
    };
    this.loaded = {
      compilation,
      workspace: compilation.workspace,
      artifact,
      artifactBundle,
      hotReloadPlan,
      reloadBase: compilation.workspace,
      hardware: {
        motors: normalizeMotorDescriptors(message.hardware.motors),
        servos: [...(message.hardware.servos ?? [])],
        sensors: [...(message.hardware.sensors ?? [])],
        cameras: [...(message.hardware.cameras ?? [])],
      },
    };
    this.phase = "loaded";
    this.frame = neutralFrame("loaded");
    if (completionIndex) this.config.onCompletionIndex?.(completionIndex);
    // Source-only LOAD needs the same transferable result as a Gradle build.
    // Build jobs deliver the bundle separately in their ready event.
    return this.ok(message, { artifact: repositorySnapshot || !artifactBundle ? artifact : { ...artifact, artifactBundle }, frame: this.frame });
  }

  private async reloadSources(message: ReloadSourcesMessage): Promise<OpModeServerMessage> {
    const loaded = this.loaded;
    const plan = loaded?.hotReloadPlan;
    if (!loaded || !plan || !loaded.reloadBase) {
      return this.error(message, "FULL_BUILD_REQUIRED", "This build requires Gradle to compile saved changes.");
    }
    const paths = message.sources.map(({path}) => path).sort();
    if (!isDeepStrictEqual(paths, [...plan.sourcePaths].sort())) {
      return this.error(message, "FULL_BUILD_REQUIRED", "The compiled source set changed. Build the project again.");
    }
    const started = performance.now();
    const epoch = this.epoch;
    const controller = new AbortController();
    this.buildAbortController = controller;
    await this.failClosed();
    this.lastSequence = -1;
    let compilation: PersistentCompilationResult | undefined;
    try {
      compilation = await compileHotReload([...message.sources, ...plan.fixedSources], loaded.reloadBase,
        plan.classFiles, this.config, controller.signal);
      if (this.closed || this.epoch !== epoch) {
        await compilation.dispose();
        return this.error(message, "SESSION_CLOSED", "Hot Reload was cancelled.");
      }
      if (!compilation.workspace || compilation.compilation.status === "failed") {
        await compilation.dispose();
        return this.error(message, "COMPILATION_FAILED", "Saved changes did not compile. Fix the error and save again.",
          this.frame, compilation.compilation.diagnostics);
      }
      const workspace = compilation.workspace;
      await compileLibraryAdapters({executor: this.config.executor, ...workspace, runtimeClasspath: workspace.runtimeClasspath ?? [workspace.classesRoot]});
      const discovered = await discoverOpModes(workspace, this.config.executor);
      const opModes = await Promise.all(discovered.map(async (mode) => {
        const runtimeDiagnostics = await scanSdkBytecodeCompatibility(workspace.classesRoot, undefined, [mode.className]);
        return {...mode, runtimeSupported: runtimeDiagnostics.every(({kind}) => kind !== "error"), runtimeDiagnostics};
      }));
      if (this.closed || this.epoch !== epoch) {
        await compilation.dispose();
        return this.error(message, "SESSION_CLOSED", "Hot Reload was cancelled.");
      }
      await loaded.reloadCompilation?.dispose();
      loaded.reloadCompilation = compilation;
      loaded.workspace = workspace;
      loaded.runtimeOpModes = opModes;
      this.phase = "loaded";
      this.frame = neutralizeFrame(this.frame, "loaded");
      const sourceHash = createHash("sha256").update(loaded.artifact.artifactHash)
        .update(hashRepositoryFiles(message.sources.map(({path, content}) => ({path, bytes: new TextEncoder().encode(content)}))))
        .digest("hex");
      return this.ok(message, {frame: this.frame, reload: {
        sourceHash, opModes, diagnostics: compilation.compilation.diagnostics,
        durationMs: Math.round(performance.now() - started),
      }});
    } catch (error) {
      await compilation?.dispose();
      throw error;
    } finally {
      if (this.buildAbortController === controller) this.buildAbortController = undefined;
    }
  }

  private async init(message: InitMessage): Promise<OpModeServerMessage> {
    if (this.phase !== "loaded" || !this.loaded) {
      return this.error(message, "INVALID_TRANSITION", "INIT requires a loaded build artifact");
    }
    const entryClass = message.entryClass;
    if (!entryClass || !(this.loaded.runtimeOpModes ?? this.loaded.artifact.opModes).some((mode) => mode.className === entryClass)) {
      return this.error(
        message,
        "OPMODE_NOT_DISCOVERED",
        `${entryClass ?? "The selected class"} is not an enabled @TeleOp or @Autonomous OpMode`,
      );
    }
    const selectedOpMode = (this.loaded.runtimeOpModes ?? this.loaded.artifact.opModes).find((mode) => mode.className === entryClass);
    if (selectedOpMode?.runtimeSupported === false) {
      return this.error(
        message,
        selectedOpMode.runtimeDiagnostics?.find(({ kind }) => kind === "error")?.code ?? "OPMODE_RUNTIME_UNSUPPORTED",
        `${selectedOpMode.displayName} compiled successfully but uses APIs unavailable to the simulator runtime`,
        undefined,
        selectedOpMode.runtimeDiagnostics,
      );
    }
    if ((this.loaded.hardware.sensors.length > 0 || this.loaded.hardware.cameras.length > 0)
        && !message.sensors) {
      return this.error(
        message,
        "WORLD_SENSOR_FRAME_REQUIRED",
        "INIT requires the current WorldSensorFrame when physical sensors or cameras are configured",
      );
    }
    const worldSensors = message.sensors;
    if (message.debug) {
      const classPath = this.loaded.workspace.runtimeClasspath ?? [this.loaded.workspace.classesRoot];
      const debugRuntime = await Promise.all(classPath.filter((path) => !path.endsWith(".jar")).map((root) =>
        stat(join(root, "org/firstinspires/ftc/sim/SimulatorVariables.class")).then((value) => value.isFile()).catch(() => false)));
      if (!debugRuntime.some(Boolean)) return this.error(message, "DEBUG_REBUILD_REQUIRED", "This saved build predates debugger support. Build the project again, then start the debug run.");
    }
    const debugEpoch = ++this.debugEpoch;
    this.worker = this.workerFactory({
      ...(message.debug ? { debug: message.debug, onDebugState: (state: DebugState) => {
        if (this.debugEpoch === debugEpoch) this.onDebugState?.(state);
      } } : {}),
      classesRoot: this.loaded.workspace.classesRoot,
      runtimeClasspath: this.loaded.workspace.runtimeClasspath,
      workspace: this.loaded.workspace.workspace,
      entryClass,
      ...(worldSensors ? { robotId: worldSensors.robotId } : {}),
      motors: this.loaded.hardware.motors,
      servos: this.loaded.hardware.servos,
      sensors: this.loaded.hardware.sensors,
      cameras: this.loaded.hardware.cameras,
    });
    this.frame = await this.worker.request({
      requestId: message.requestId,
      command: "init",
      ...(worldSensors ? {
        robotId: worldSensors.robotId,
        tick: worldSensors.tick,
        simulationTimeMillis: worldSensors.simulationTimeMs,
        sensors: worldSensors,
      } : {}),
    });
    this.phase = "initialized";
    this.activeOpMode = selectedOpMode;
    return this.ok(message, { frame: this.frame });
  }

  private async handoff(message: HandoffMessage): Promise<OpModeServerMessage> {
    if (!this.worker || !this.loaded || !["initialized", "running", "stopped"].includes(this.phase)) {
      return this.error(message, "INVALID_TRANSITION", "HANDOFF requires an initialized, running, or stopped OpMode");
    }
    if (this.activeOpMode?.kind !== "autonomous") {
      return this.error(message, "INVALID_TRANSITION", "HANDOFF is only valid from an Autonomous OpMode");
    }
    const nextOpMode = (this.loaded.runtimeOpModes ?? this.loaded.artifact.opModes).find(({ className }) => className === message.entryClass);
    if (!nextOpMode) {
      return this.error(
        message,
        "OPMODE_NOT_DISCOVERED",
        `${message.entryClass} is not an enabled @TeleOp or @Autonomous OpMode`,
      );
    }
    if (nextOpMode.kind !== "teleop") {
      return this.error(message, "INVALID_HANDOFF_TARGET", "HANDOFF target must be a TeleOp OpMode");
    }
    if (nextOpMode.runtimeSupported === false) {
      return this.error(
        message,
        nextOpMode.runtimeDiagnostics?.find(({ kind }) => kind === "error")?.code ?? "OPMODE_RUNTIME_UNSUPPORTED",
        `${nextOpMode.displayName} compiled successfully but uses APIs unavailable to the simulator runtime`,
        undefined,
        nextOpMode.runtimeDiagnostics,
      );
    }
    this.frame = await this.worker.request({
      requestId: message.requestId,
      command: "handoff",
      entryClass: message.entryClass,
      robotId: message.sensors.robotId,
      tick: message.sensors.tick,
      simulationTimeMillis: message.sensors.simulationTimeMs,
      sensors: message.sensors,
    });
    this.phase = "initialized";
    this.activeOpMode = nextOpMode;
    return this.ok(message, { frame: this.frame });
  }

  private async transition(
    message: TransitionMessage,
    command: "start" | "stop",
  ): Promise<OpModeServerMessage> {
    if (!this.worker) {
      return this.error(message, "INVALID_TRANSITION", `${command.toUpperCase()} requires INIT`);
    }
    if (command === "start" && this.phase !== "initialized") {
      return this.error(message, "INVALID_TRANSITION", "START requires an initialized OpMode");
    }
    if (command === "stop" && this.phase !== "initialized" && this.phase !== "running") {
      return this.error(message, "INVALID_TRANSITION", "STOP requires an active OpMode");
    }
    this.frame = await this.worker.request({ requestId: message.requestId, command });
    this.phase = command === "start" ? "running" : "stopped";
    if (command === "stop") this.frame = neutralizeFrame(this.frame, "stopped");
    return this.ok(message, { frame: this.frame });
  }

  private async tick(message: TickMessage): Promise<OpModeServerMessage> {
    if (!this.worker || (this.phase !== "initialized" && this.phase !== "running")) {
      return this.error(message, "INVALID_TRANSITION", "TICK requires an initialized OpMode");
    }
    if (this.tickInFlight) {
      return this.error(message, "TICK_IN_FLIGHT", "Only one control tick may be in flight");
    }
    if (message.sequence <= this.lastSequence) {
      return this.error(message, "OUT_OF_ORDER_TICK", "Tick sequence must increase monotonically");
    }
    const expectedMotors = this.loaded?.hardware.motors ?? [];
    const missing = expectedMotors
      .map((motor) => motor.name)
      .filter((name) => message.motors[name] === undefined);
    if (missing.length > 0) {
      return this.error(
        message,
        "MISSING_MOTOR_FEEDBACK",
        `Tick is missing shaft feedback for: ${missing.join(", ")}`,
      );
    }
    this.tickInFlight = true;
    try {
      this.frame = await this.worker.request({
        requestId: message.requestId,
        command: "tick",
        sequence: message.sequence,
        deltaMillis: message.deltaMillis,
        gamepad1: message.gamepad1,
        gamepad2: message.gamepad2,
        motors: message.motors,
        sensors: message.sensors,
      });
      this.lastSequence = message.sequence;
      this.phase = this.frame.phase;
      return this.ok(message, { frame: this.frame });
    } finally {
      this.tickInFlight = false;
    }
  }

  private async reset(message: TransitionMessage): Promise<OpModeServerMessage> {
    if (!this.loaded) return this.error(message, "INVALID_TRANSITION", "RESET requires a loaded artifact");
    await this.worker?.terminate();
    this.clearDebug();
    this.worker = undefined;
    this.activeOpMode = undefined;
    this.phase = "loaded";
    this.lastSequence = -1;
    this.frame = neutralFrame("loaded");
    return this.ok(message, { frame: this.frame });
  }

  private async close(message: TransitionMessage): Promise<OpModeServerMessage> {
    this.clearDebug();
    if (this.worker) {
      try {
        this.frame = await this.worker.request({ requestId: message.requestId, command: "close" });
      } finally {
        await this.worker.terminate();
        this.worker = undefined;
      }
    }
    await this.loaded?.reloadCompilation?.dispose();
    await this.loaded?.compilation.dispose();
    this.loaded = undefined;
    this.closed = true;
    this.phase = "closed";
    this.frame = neutralizeFrame(this.frame, "closed");
    return this.ok(message, { frame: this.frame });
  }

  private async failClosed(): Promise<void> {
    this.clearDebug();
    await this.worker?.terminate();
    this.worker = undefined;
    this.activeOpMode = undefined;
    this.phase = "stopped";
    this.frame = neutralizeFrame(this.frame, "stopped");
  }

  private clearDebug() {
    this.debugEpoch++;
    this.onDebugState?.({ status: "disabled", frames: [], watches: [], breakpoints: [] });
  }

  private ok(
    message: OpModeClientMessage,
    values: { artifact?: LoadArtifact; frame?: SimulationFrame; reload?: HotReloadResult; debug?: DebugState },
  ): OpModeServerMessage {
    return {
      protocolVersion: OPMODE_PROTOCOL_VERSION,
      type: "response",
      requestId: message.requestId,
      command: message.command,
      status: "ok",
      ...values,
    };
  }

  private error(
    message: OpModeClientMessage,
    code: string,
    text: string,
    frame?: SimulationFrame,
    diagnostics?: BuildDiagnostic[],
  ): OpModeServerMessage {
    return {
      protocolVersion: OPMODE_PROTOCOL_VERSION,
      type: "response",
      requestId: message.requestId,
      command: message.command,
      status: "error",
      error: { code, message: text, ...(diagnostics ? { diagnostics } : {}) },
      ...(frame ? { frame } : {}),
    };
  }
}

async function discoverOpModes(
  workspace: CompiledJavaWorkspace,
  executor: ProcessExecutor,
): Promise<DiscoveredOpMode[]> {
  const result = await executor.run({
    argv: [
      "java", "-Xms16m", "-Xmx64m", "-Djava.awt.headless=true",
      "-cp", (workspace.runtimeClasspath ?? [workspace.classesRoot]).join(process.platform === "win32" ? ";" : ":"),
      DISCOVERY_MAIN_CLASS,
      workspace.classesRoot,
    ],
    cwd: workspace.workspace,
    env: isolatedProcessEnvironment(workspace.workspace, workspace.classesRoot),
    timeoutMs: 2_500,
    stdoutLimitBytes: 128 * 1024,
    stderrLimitBytes: 64 * 1024,
  });
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error("Compiled OpMode annotation discovery failed");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(result.stdout.trim()); } catch {
    throw new Error("OpMode discovery returned invalid JSON");
  }
  if (!isDiscoveryResult(parsed)) throw new Error("OpMode discovery returned an invalid result");
  return [...parsed.opModes].sort((left, right) => (
    left.className < right.className ? -1 : left.className > right.className ? 1 : 0
  ));
}

function isDiscoveryResult(value: unknown): value is { ok: true; opModes: DiscoveredOpMode[] } {
  if (typeof value !== "object" || value === null || !("opModes" in value)) return false;
  return Array.isArray(value.opModes) && value.opModes.every((mode) => {
    if (typeof mode !== "object" || mode === null) return false;
    const candidate = mode as Record<string, unknown>;
    return typeof candidate.className === "string"
      && typeof candidate.displayName === "string"
      && typeof candidate.group === "string"
      && (candidate.kind === "teleop" || candidate.kind === "autonomous");
  });
}

function sourcesFromSnapshot(snapshot: RepositorySnapshot): LoadProgramMessage["sources"] {
  return decodeRepositorySnapshot(snapshot).flatMap((file) => {
    if (!/\.(?:java|kt)$/u.test(file.path)) return [];
    const content = file.text ?? new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    return [{ path: file.path, content }];
  });
}

interface ArtifactBundleManifest {
  format: "ftc-teamcode-artifact-v1";
  artifactId: string;
  repositorySnapshotHash: string;
  sourceHash: string;
  resolvedDependencies: string[];
  sdkVersion: "11.1.0";
  javaTarget: "8";
  kotlinVersion: "2.2.10";
  opModes: DiscoveredOpMode[];
  diagnostics: BuildDiagnostic[];
  runtimeClasspath: string[];
  sharedLibraries?: Record<string, string>;
  hotReload?: HotReloadPlan;
  completionIndexPath?: string;
  completionIndexSha256?: string;
  completionIndexFormat?: typeof PROJECT_COMPLETION_INDEX_FORMAT;
}

async function hashLocalWorkspace(workspace: CompiledJavaWorkspace, sourceHash: string): Promise<string> {
  const hash = createHash("sha256").update(sourceHash).update("\0");
  const visit = async (path: string, label: string): Promise<void> => {
    const info = await stat(path);
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await visit(join(path, name), `${label}/${name}`);
    } else {
      hash.update(label).update("\0").update(String(info.size)).update("\0");
      hash.update(await readFile(path));
    }
  };
  for (const [index, path] of (workspace.runtimeClasspath ?? [workspace.classesRoot]).entries()) await visit(path, `classpath-${index}`);
  return hash.digest("hex");
}

async function createArtifactBundle(input: {
  workspace: CompiledJavaWorkspace;
  artifactId: string;
  repositorySnapshotHash: string;
  sourceHash: string;
  resolvedDependencies: string[];
  completionIndex?: ProjectArtifactCompletionDocument;
  hotReload?: HotReloadPlan;
  opModes: DiscoveredOpMode[];
  diagnostics: BuildDiagnostic[];
  artifactLibraryDirectory?: string;
}): Promise<BuildArtifactBundle> {
  const files: Record<string, Uint8Array> = {};
  const sharedLibraries: Record<string, string> = {};
  let totalBytes = 0;
  const countBytes = (byteLength: number, label: string) => {
    totalBytes += byteLength;
    if (totalBytes > ARTIFACT_BUNDLE_MAX_UNCOMPRESSED_BYTES) {
      throw new Error(`${label} exceeds the 128 MiB uncompressed size limit`);
    }
  };
  const addFile = async (target: string, source: string) => {
    validateArtifactPath(target);
    const bytes = new Uint8Array(await readFile(source));
    countBytes(bytes.byteLength, "The compiled artifact");
    files[target] = bytes;
  };
  const addDirectory = async (sourceRoot: string, archiveRoot: string, current = sourceRoot): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = join(current, entry.name);
      if (entry.isDirectory()) {
        await addDirectory(sourceRoot, archiveRoot, sourcePath);
      } else if (entry.isFile()) {
        const target = `${archiveRoot}/${relative(sourceRoot, sourcePath).replaceAll("\\", "/")}`;
        await addFile(target, sourcePath);
      }
    }
  };

  await addDirectory(input.workspace.classesRoot, "teamcode/classes");
  const notices = new Uint8Array(await readFile(new URL("../../../runtime/java-sdk-shim/THIRD_PARTY_NOTICES.md", import.meta.url)));
  countBytes(notices.byteLength, "The compiled artifact and third-party notices");
  files["META-INF/ftc-sim/THIRD_PARTY_NOTICES.md"] = notices;
  const runtimeClasspath = ["teamcode/classes"];
  const artifactLibraryDirectory = resolveSharedArtifactLibraryDirectory(input.artifactLibraryDirectory);
  const runtimeJarPaths: string[] = [];
  for (const entry of input.workspace.runtimeClasspath ?? []) {
    if (entry === input.workspace.classesRoot) continue;
    const info = await stat(entry);
    if (info.isFile() && extname(entry).toLowerCase() === ".jar") runtimeJarPaths.push(entry);
  }
  await seedSharedArtifactLibraries(runtimeJarPaths, artifactLibraryDirectory);
  let runtimeIndex = 0;
  for (const entry of input.workspace.runtimeClasspath ?? []) {
    if (entry === input.workspace.classesRoot) continue;
    const info = await stat(entry);
    const destination = `runtime/${runtimeIndex.toString().padStart(3, "0")}`;
    if (info.isDirectory()) {
      await addDirectory(entry, destination);
      runtimeClasspath.push(destination);
    } else if (info.isFile()) {
      const path = `${destination}-${safeArtifactName(basename(entry))}`;
      validateArtifactPath(path);
      const bytes = new Uint8Array(await readFile(entry));
      countBytes(bytes.byteLength, "The compiled artifact");
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (extname(entry).toLowerCase() === ".jar" && SHARED_ARTIFACT_LIBRARY_HASHES.has(hash)) {
        sharedLibraries[path] = hash;
      } else {
        files[path] = bytes;
      }
      runtimeClasspath.push(path);
    }
    runtimeIndex += 1;
  }
  let completionIndexSha256: string | undefined;
  if (input.completionIndex) {
    const bytes = new TextEncoder().encode(JSON.stringify(input.completionIndex));
    countBytes(bytes.byteLength, "The compiled artifact and completion metadata");
    files[PROJECT_COMPLETION_INDEX_PATH] = bytes;
    completionIndexSha256 = createHash("sha256").update(bytes).digest("hex");
  }
  const manifest: ArtifactBundleManifest = {
    format: "ftc-teamcode-artifact-v1",
    artifactId: input.artifactId,
    repositorySnapshotHash: input.repositorySnapshotHash,
    sourceHash: input.sourceHash,
    resolvedDependencies: input.resolvedDependencies,
    sdkVersion: "11.1.0",
    javaTarget: "8",
    kotlinVersion: "2.2.10",
    opModes: input.opModes,
    diagnostics: input.diagnostics,
    runtimeClasspath,
    ...(Object.keys(sharedLibraries).length > 0 ? { sharedLibraries } : {}),
    ...(input.hotReload ? {hotReload: input.hotReload} : {}),
    ...(completionIndexSha256 ? {
      completionIndexPath: PROJECT_COMPLETION_INDEX_PATH,
      completionIndexSha256,
      completionIndexFormat: PROJECT_COMPLETION_INDEX_FORMAT,
    } : {}),
  };
  files[ARTIFACT_BUNDLE_MANIFEST_PATH] = new TextEncoder().encode(JSON.stringify(manifest));
  // fflate writes local calendar fields into ZIP headers. Construct local midnight
  // so west-of-UTC hosts do not roll back into 1979 (before ZIP's DOS epoch).
  const archive = zipSync(files, { level: 6, mtime: new Date(1980, 0, 1, 0, 0, 0) });
  if (archive.byteLength > ARTIFACT_BUNDLE_MAX_BYTES) {
    throw new Error("The compiled artifact bundle exceeds the 64 MiB compressed size limit");
  }
  return {
    format: "ftc-teamcode-artifact-v1",
    sha256: createHash("sha256").update(archive).digest("hex"),
    encoding: "base64",
    content: Buffer.from(archive).toString("base64"),
    runtimeClasspath,
  };
}

function decodeArtifactBase64(content: string): Uint8Array {
  if (content.length > ARTIFACT_BUNDLE_MAX_BYTES * 4 / 3 + 8
      || !isStandardBase64(content)) {
    throw new Error("The build artifact bundle contains invalid base64 data");
  }
  return new Uint8Array(Buffer.from(content, "base64"));
}

function validateArtifactPath(path: string): void {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0")
      || /^[A-Za-z]:/u.test(path)
      || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Build artifact contains an invalid path: ${path}`);
  }
}

function isPathInside(root: string, path: string): boolean {
  const relativePath = relative(root, path);
  return relativePath === "" || (!relativePath.startsWith("../") && relativePath !== "..");
}

function safeArtifactName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/gu, "_");
}

function neutralFrame(
  phase: OpModePhase,
  sequence = -1,
  simulationTimeMillis = 0,
): SimulationFrame {
  return {
    sequence,
    phase,
    simulationTimeMillis,
    motors: {},
    servos: {},
    telemetry: {},
    telemetryRevision: 0,
    capturedStdout: "",
    capturedStdoutTruncated: false,
  };
}

function neutralizeFrame(frame: SimulationFrame, phase: OpModePhase): SimulationFrame {
  return {
    ...frame,
    phase,
    motors: Object.fromEntries(Object.entries(frame.motors).map(([name, motor]) => [name, {
      ...motor,
      power: 0,
      velocitySetpointTicksPerSecond: null,
    }])),
  };
}

function validateHotReloadPlan(plan: HotReloadPlan): void {
  if (!Array.isArray(plan.sourcePaths) || plan.sourcePaths.length < 1 || plan.sourcePaths.length > 512
      || !Array.isArray(plan.classFiles) || plan.classFiles.length > 20_000
      || !Array.isArray(plan.fixedSources) || plan.fixedSources.length > 512) {
    throw new Error("Invalid artifact Hot Reload plan");
  }
  for (const path of [...plan.sourcePaths, ...plan.classFiles]) {
    if (typeof path !== "string") throw new Error("Invalid Hot Reload path");
    validateArtifactPath(path);
  }
  let bytes = 0;
  for (const source of plan.fixedSources) {
    validateArtifactPath(source.path);
    if (typeof source.content !== "string") throw new Error("Invalid fixed Hot Reload source");
    bytes += Buffer.byteLength(source.content);
  }
  if (bytes > 8 * 1024 * 1024 || new Set(plan.sourcePaths).size !== plan.sourcePaths.length) {
    throw new Error("Invalid artifact Hot Reload sources");
  }
}
