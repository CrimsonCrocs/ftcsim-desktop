import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { BuildDiagnostic, BuildProgramMessage, LoadArtifact, OpModeClientMessage, OpModeServerMessage } from "@ftc-studio/opmode-protocol";
import { LocalOpModeSession } from "../../services/java-runner/src/opmode-session";
import { requireFtcSdkToolchain } from "../../services/java-runner/src/ftc-sdk-toolchain";
import { FastExecutor } from "./fast-executor";
import { createDesktopWorkerFactory } from "./runtime-worker";
import type { ProjectArtifactCompletionDocument } from "../../src/lib/completions/project-artifact-completions";

type Entry = { session: LocalOpModeSession; tail: Promise<unknown>; artifact?: LoadArtifact; completionIndex?: ProjectArtifactCompletionDocument; stage: "build" | "runtime"; disposeWorker():void };
export class DesktopBuildError extends Error {
  constructor(message: string, readonly code: string, readonly diagnostics: BuildDiagnostic[] = []) { super(message); }
}

export class DesktopSessions {
  readonly executor = new FastExecutor();
  private entries = new Map<string, Entry>();
  private artifacts = new Map<string, Entry>();
  private sdk = requireFtcSdkToolchain();
  constructor(private readonly root: string) {}
  async classpathHash(): Promise<string> { return (await this.sdk).compileClasspathHash; }

  async open(options: { stage?: "build" | "runtime"; artifactHash?: string }): Promise<{ sessionId: string; artifact?: LoadArtifact }> {
    const id = randomUUID();
    const cached = options.artifactHash ? this.artifacts.get(options.artifactHash) : undefined;
    if (options.stage === "runtime") {
      if (!cached) throw new Error("The desktop build is no longer loaded. Build the project once.");
      // Build and run share real compiled classes. Nothing is archived, uploaded, or unpacked here.
      const entry: Entry = { ...cached, stage: "runtime" };
      this.entries.set(id, entry);
      return { sessionId: id, artifact: entry.artifact };
    }
    const factory=createDesktopWorkerFactory();
    const entry: Entry = { session: new LocalOpModeSession({ executor: this.executor,
      artifactTransport: "local", onCompletionIndex: document => { entry.completionIndex = document; },
      shimSourceRoot: resolve(this.root, "runtime/java-sdk-shim/src/main/java"), ftcSdk: await this.sdk,
      gradleUserHome: process.env.GRADLE_USER_HOME ?? resolve(process.env.HOME ?? "", ".gradle"),
      ...(process.env.FTC_DESKTOP_GRADLE ? { gradleExecutable: process.env.FTC_DESKTOP_GRADLE } : {}),
      workerFactory: factory }), disposeWorker:()=>factory.close(), tail: Promise.resolve(), stage: "build" };
    this.entries.set(id, entry);
    return { sessionId: id };
  }

  async build(id: string, message: BuildProgramMessage): Promise<LoadArtifact> {
    const entry = this.get(id);
    let artifact: LoadArtifact | undefined;
    let failure: Error | undefined;
    await entry.session.startBuildJob(message, event => {
      if (event.type !== "build-job") return;
      if (event.stage === "ready" && event.artifact) artifact = { ...event.artifact, ...(event.artifactBundle ? { artifactBundle: event.artifactBundle } : {}) };
      if (event.stage === "failed") failure = new DesktopBuildError(event.error?.message ?? event.message,
        event.error?.code ?? "BUILD_FAILED", event.error?.diagnostics);
    }).done;
    if (failure) throw failure;
    if (!artifact) throw new Error("Build completed without an artifact");
    entry.artifact = artifact;
    this.artifacts.set(artifact.artifactHash, entry);
    for (const [hash, previous] of this.artifacts) {
      if (this.artifacts.size <= 2) break;
      if ([...this.entries.values()].some(active => active.session === previous.session)) continue;
      await previous.session.forceClose();previous.disposeWorker();this.artifacts.delete(hash);
    }
    return artifact;
  }

  async command(id: string, message: OpModeClientMessage): Promise<OpModeServerMessage> {
    return this.commandEntry(this.get(id), message);
  }

  artifact(id: string): LoadArtifact | undefined { return this.get(id).artifact; }
  completionIndex(id: string): ProjectArtifactCompletionDocument | undefined { return this.get(id).completionIndex; }

  async close(id: string, discard = false): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    // Close a generation while retaining its real compiled classes for the next Run.
    if (!discard && entry.artifact) {
      if (entry.stage === "runtime") {
        const result = await this.commandEntry(entry, { protocolVersion: 3, requestId: randomUUID(), command: "reset" });
        if (result.type !== "response" || result.status !== "ok") throw new Error("Could not reset the local runtime");
      }
      return;
    }
    await entry.session.forceClose();
    entry.disposeWorker();
    if (entry.artifact && this.artifacts.get(entry.artifact.artifactHash)?.session === entry.session) this.artifacts.delete(entry.artifact.artifactHash);
  }
  async dispose(): Promise<void> {
    await Promise.allSettled([...new Set([...this.entries.values(), ...this.artifacts.values()].map(e => e.session))].map(s => s.forceClose()));
    for(const entry of [...this.entries.values(),...this.artifacts.values()])entry.disposeWorker();
    this.entries.clear(); this.artifacts.clear(); this.executor.close();
  }
  private get(id: string): Entry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error("Desktop session closed");
    return entry;
  }
  private commandEntry(entry: Entry, message: OpModeClientMessage): Promise<OpModeServerMessage> {
    const result = entry.tail.then(() => entry.session.handle(message));
    entry.tail = result.catch(() => undefined);
    return result;
  }
}
