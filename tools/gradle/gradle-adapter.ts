import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

import { unzipSync } from "fflate";

import type {
  BuildDiagnostic,
  RepositorySnapshot,
  RepositorySnapshotFile,
} from "@ftc-studio/opmode-protocol";
import { parsePublicJvmClassFile } from "../../scripts/jvm-classfile";
import { isRenderedVisionClass, isRenderedVisionMember } from "../../services/java-runner/src/vision-compatibility";
import { buildResolvedLibraryLanguageIndex, type ResolvedLibraryClass } from "../../src/lib/completions/resolved-library-index";
import type { JvmLanguageIndex } from "../../src/lib/completions/language-index";
import {
  PROJECT_COMPLETION_INDEX_FORMAT,
  type ProjectArtifactCompletionDocument,
} from "../../src/lib/completions/project-artifact-completions";

import type { FtcSdkToolchain } from "../../services/java-runner/src/ftc-sdk-toolchain";
import {
  isolatedProcessEnvironment,
} from "../../services/java-runner/src/java-compiler";
import type {
  ProcessExecutor,
  ProcessRequest,
  ProcessResult,
} from "../../services/java-runner/src/process-executor";
import { UNSUPPORTED_RESOLVED_LIBRARY_POLICIES } from "../../services/java-runner/src/ftc-sdk-toolchain";
import { compileLibraryAdapters } from "../../services/java-runner/src/library-adapters";

// Cold plugin/dependency downloads share this cap with compilation. Leave five minutes
// of the 15-minute build sandbox lifetime for preparation, artifacts, and teardown.
export const GRADLE_BUILD_TIMEOUT_MS = 10 * 60_000;
export const GRADLE_OUTPUT_LIMIT_BYTES = 512 * 1024;
export const REPOSITORY_SNAPSHOT_FILE_LIMIT = 512;
export const REPOSITORY_SNAPSHOT_TOTAL_BYTES = 32 * 1024 * 1024;
export const REPOSITORY_SNAPSHOT_FILE_BYTES = 16 * 1024 * 1024;
export const COMPLETION_INDEX_CLASS_LIMIT = 25_000;
export const COMPLETION_INDEX_MEMBER_LIMIT = 200_000;

export interface DecodedRepositoryFile {
  path: string;
  bytes: Uint8Array;
  text?: string;
}

export interface GradleAdapterConfig {
  executor: ProcessExecutor;
  shimSourceRoot: string;
  ftcSdk: FtcSdkToolchain;
  /** Optional trusted-local Gradle override; projects use their wrapper by default. */
  gradleExecutable?: string;
  gradleUserHome?: string;
  /** Optional test-only destination for a secret-scrubbed failed Gradle process record. */
  failureEvidencePath?: string;
  signal?: AbortSignal;
}

export interface GradleBuildWorkspace {
  workspace: string;
  classesRoot: string;
  runtimeClasspath: string[];
  resolvedDependencies: string[];
  repositorySnapshotHash: string;
  completionIndex?: ProjectArtifactCompletionDocument;
  hotReload?: {
    sourcePaths: string[];
    classFiles: string[];
    fixedSources: Array<{ path: string; content: string }>;
  };
}

export interface GradleBuildResult {
  status: "succeeded" | "failed";
  diagnostics: BuildDiagnostic[];
  timedOut: boolean;
  outputTruncated: boolean;
  durationMs: number;
  workspace?: GradleBuildWorkspace;
  dispose(): Promise<void>;
}

export function hasGradleProject(files: readonly RepositorySnapshotFile[]): boolean {
  return files.some(({ path }) => /^(?:settings|build)\.gradle(?:\.kts)?$/u.test(path));
}

export function decodeRepositorySnapshot(snapshot: RepositorySnapshot): DecodedRepositoryFile[] {
  if (snapshot.format !== "ftc-repository-snapshot-v1") {
    throw new Error("Unsupported repository snapshot format");
  }
  if (!/^[a-f0-9]{64}$/u.test(snapshot.sha256)) {
    throw new Error("Repository snapshot must include a lowercase SHA-256 digest");
  }
  if (!Array.isArray(snapshot.files) || snapshot.files.length < 1
      || snapshot.files.length > REPOSITORY_SNAPSHOT_FILE_LIMIT) {
    throw new Error(`Repository snapshot must contain 1 through ${REPOSITORY_SNAPSHOT_FILE_LIMIT} files`);
  }
  const paths = new Set<string>();
  let totalBytes = 0;
  const decoded = snapshot.files.map((file) => {
    validateSnapshotPath(file.path);
    if (paths.has(file.path)) throw new Error(`Repository snapshot duplicates ${file.path}`);
    paths.add(file.path);
    if (file.encoding !== "utf8" && file.encoding !== "base64") {
      throw new Error(`Repository snapshot has an unsupported encoding for ${file.path}`);
    }
    const bytes = file.encoding === "utf8"
      ? new TextEncoder().encode(file.content)
      : decodeBase64(file.content, file.path);
    if (bytes.byteLength > REPOSITORY_SNAPSHOT_FILE_BYTES) {
      throw new Error(`Repository snapshot file ${file.path} exceeds ${REPOSITORY_SNAPSHOT_FILE_BYTES} bytes`);
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > REPOSITORY_SNAPSHOT_TOTAL_BYTES) {
      throw new Error(`Repository snapshot exceeds ${REPOSITORY_SNAPSHOT_TOTAL_BYTES} bytes`);
    }
    return {
      path: file.path,
      bytes,
      ...(file.encoding === "utf8" ? { text: file.content } : {}),
    };
  }).sort((left, right) => compareText(left.path, right.path));
  const actualHash = hashRepositoryFiles(decoded);
  if (actualHash !== snapshot.sha256) throw new Error("Repository snapshot SHA-256 does not match its files");
  return decoded;
}

/** Hashes paths and bytes with length framing so concatenation cannot be ambiguous. */
export function hashRepositoryFiles(files: readonly Pick<DecodedRepositoryFile, "path" | "bytes">[]): string {
  const hash = createHash("sha256").update("ftc-repository-snapshot-v1\0");
  for (const file of [...files].sort((left, right) => compareText(left.path, right.path))) {
    const pathBytes = new TextEncoder().encode(file.path);
    const pathLength = Buffer.alloc(4);
    pathLength.writeUInt32BE(pathBytes.byteLength);
    const contentLength = Buffer.alloc(8);
    contentLength.writeBigUInt64BE(BigInt(file.bytes.byteLength));
    hash.update(pathLength).update(pathBytes).update(contentLength).update(file.bytes);
  }
  return hash.digest("hex");
}

export async function buildGradleProject(
  snapshot: RepositorySnapshot,
  config: GradleAdapterConfig,
): Promise<GradleBuildResult> {
  const files = decodeRepositorySnapshot(snapshot);
  if (!hasGradleProject(snapshot.files)) throw new Error("Repository snapshot has no Gradle build configuration");

  const workspace = await mkdtemp(join(tmpdir(), "ftc-gradle-build-"));
  const classesRoot = join(workspace, "teamcode-classes");
  const shimClassesRoot = join(workspace, "shim-classes");
  const gradleHome = resolve(config.gradleUserHome ?? join(tmpdir(), "ftc-java-runner-gradle-cache"));
  const metadataPath = join(workspace, "gradle-metadata.json");
  const initScriptPath = join(workspace, "ftc-runner.init.gradle");
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await rm(workspace, { force: true, recursive: true, maxRetries: 2, retryDelay: 25 });
  };

  try {
    await Promise.all([mkdir(classesRoot), mkdir(shimClassesRoot)]);
    for (const file of files) {
      const target = resolve(workspace, file.path);
      if (!isInside(workspace, target)) throw new Error(`Repository path escapes build root: ${file.path}`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.bytes, { mode: 0o600 });
      if (file.path === "gradlew") await chmod(target, 0o700);
    }
    await compileSimulatorShim(config, workspace, shimClassesRoot);
    const initScript = createGradleInitScript({
      shimClassesRoot,
      metadataPath,
      originalSourcePaths: files.filter(({ path }) => /\.(?:java|kt)$/u.test(path)).map(({ path }) => path),
    });
    await writeFile(initScriptPath, initScript, "utf8");

    const wrapperPath = join(workspace, "gradlew");
    const wrapperAvailable = files.some((file) => file.path === "gradlew");
    const command = config.gradleExecutable ?? (wrapperAvailable ? "bash" : "gradle");
    const commandArgs = config.gradleExecutable ? [] : wrapperAvailable ? [wrapperPath] : [];
    const androidHome = dirname(dirname(dirname(config.ftcSdk.androidJarPath)));
    const localProperties = join(workspace, "local.properties");
    if (!files.some((file) => file.path === "local.properties")) {
      await writeFile(localProperties, `sdk.dir=${androidHome.replaceAll("\\", "\\\\")}\n`, "utf8");
    }
    const gradleRequest: ProcessRequest = {
      argv: [
        command,
        ...commandArgs,
        "--init-script", initScriptPath,
        "--no-daemon",
        "--console=plain",
        "--stacktrace",
        "--max-workers=2",
        "ftcRunnerCompileTeamCode",
      ],
      cwd: workspace,
      env: {
        ...isolatedProcessEnvironment(workspace, ""),
        ANDROID_HOME: androidHome,
        ANDROID_SDK_ROOT: androidHome,
        GRADLE_USER_HOME: gradleHome,
        JAVA_TOOL_OPTIONS: "-Xms64m -Xmx1536m -XX:MaxMetaspaceSize=768m -Xss1m",
        FTC_RUNNER_CLASSES_ROOT: classesRoot,
        FTC_RUNNER_METADATA_PATH: metadataPath,
      },
      timeoutMs: GRADLE_BUILD_TIMEOUT_MS,
      stdoutLimitBytes: GRADLE_OUTPUT_LIMIT_BYTES,
      stderrLimitBytes: GRADLE_OUTPUT_LIMIT_BYTES,
      signal: config.signal,
    };
    const gradleResult = await config.executor.run(gradleRequest);
    const buildOutput = [gradleResult.stdout, gradleResult.stderr].filter(Boolean).join("\n");
    if (gradleResult.exitCode !== 0 || gradleResult.timedOut || gradleResult.cancelled) {
      if (config.failureEvidencePath) {
        try {
          await writeGradleFailureEvidence(config.failureEvidencePath, gradleRequest, gradleResult);
        } catch (error) {
          process.stderr.write(JSON.stringify({
            step: "gradle-failure-evidence-write-failed",
            message: error instanceof Error ? error.message : "unknown write error",
          }) + "\n");
        }
      }
      await dispose();
      return {
        status: "failed",
        diagnostics: gradleResult.cancelled
          ? [{ kind: "error", code: "BUILD_CANCELLED", message: "Gradle build was cancelled because the session closed" }]
          : parseGradleDiagnostics(buildOutput, workspace),
        timedOut: gradleResult.timedOut,
        outputTruncated: gradleResult.stdoutTruncated || gradleResult.stderrTruncated,
        durationMs: gradleResult.durationMs,
        dispose: async () => {},
      };
    }

    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as GradleMetadata;
    if (!Array.isArray(metadata.classDirectories) || metadata.classDirectories.length === 0) {
      throw new Error("Gradle completed without reporting TeamCode class output directories");
    }
    const canonicalWorkspace = await realpath(workspace);
    const hotReload = validateHotReloadMetadata(metadata.hotReload, files, canonicalWorkspace, workspace, classesRoot);
    for (const output of metadata.classDirectories) {
      const classDirectory = resolve(workspace, output);
      const canonicalClassDirectory = await realpath(classDirectory);
      if (!isInside(canonicalWorkspace, canonicalClassDirectory)) {
        throw new Error(`Gradle reported a TeamCode output directory outside the repository snapshot: ${output}`);
      }
      await copyClassFiles(canonicalClassDirectory, classesRoot);
    }
    await copyClassFiles(shimClassesRoot, classesRoot);

    const runtimeClasspath: string[] = [classesRoot];
    const resourceClasspath: string[] = [];
    const resolvedDependencies: string[] = [];
    const completionInputs: Array<{ path: string; coordinate: string }> = [];
    for (const resource of metadata.resourceOutputs ?? []) {
      const resourcePath = resource.startsWith("/")
        ? resource
        : resolve(workspace, resource);
      const canonicalResource = await realpath(resourcePath).catch(() => undefined);
      if (!canonicalResource || !isInside(canonicalWorkspace, canonicalResource)) {
        throw new Error(`Gradle reported a resource output outside the repository snapshot: ${resource}`);
      }
      const resourceInfo = await stat(canonicalResource);
      if (!resourceInfo.isDirectory() && !resourceInfo.isFile()) {
        throw new Error(`Gradle reported an invalid resource output: ${resource}`);
      }
      if (!resourceClasspath.includes(canonicalResource)) resourceClasspath.push(canonicalResource);
    }
    runtimeClasspath.push(...resourceClasspath);
    for (const dependency of metadata.runtimeFiles ?? []) {
      // Resolved artifacts normally live in GRADLE_USER_HOME, outside the disposable project.
      const path = dependency.path.startsWith("/")
        ? dependency.path
        : resolve(workspace, dependency.path);
      if (isFtcOrAndroidApi(path)) continue;
      const resolved = await normalizeRuntimeArtifact(path, workspace);
      if (!resolved) continue;
      if (!runtimeClasspath.includes(resolved.path)) {
        if (!hotReload?.teamCodeOutputDirectories.has(resolve(dependency.path))) {
          runtimeClasspath.push(resolved.path);
        }
        completionInputs.push({ path: resolved.path, coordinate: dependency.coordinate });
      }
      resolvedDependencies.push(dependency.coordinate || relative(workspace, path).split(sep).join("/"));
    }
    const completionIndex = await buildProjectCompletionIndex(completionInputs, snapshot.sha256);
    await compileLibraryAdapters({ executor: config.executor, workspace, classesRoot, runtimeClasspath });

    return {
      status: "succeeded",
      diagnostics: parseGradleDiagnostics(buildOutput, workspace).filter(({ kind }) => kind !== "error"),
      timedOut: false,
      outputTruncated: gradleResult.stdoutTruncated || gradleResult.stderrTruncated,
      durationMs: gradleResult.durationMs,
      workspace: {
        workspace,
        classesRoot,
        runtimeClasspath,
        resolvedDependencies: [...new Set(resolvedDependencies)].sort(compareText),
        repositorySnapshotHash: snapshot.sha256,
        ...(completionIndex ? { completionIndex } : {}),
        ...(hotReload ? { hotReload: hotReload.plan } : {}),
      },
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

const HOT_RELOAD_SOURCE_LIMIT = 512;
const HOT_RELOAD_SOURCE_BYTES_LIMIT = 8 * 1024 * 1024;

function validateHotReloadMetadata(
  candidate: GradleMetadata["hotReload"],
  snapshotFiles: readonly DecodedRepositoryFile[],
  canonicalWorkspace: string,
  workspace: string,
  classesRoot: string,
): { plan: NonNullable<GradleBuildWorkspace["hotReload"]>; teamCodeOutputDirectories: Set<string> } | undefined {
  if (!candidate || candidate.unsupported || !Array.isArray(candidate.sourceFiles)
      || !Array.isArray(candidate.classFiles) || !Array.isArray(candidate.classDirectories)
      || !Array.isArray(candidate.generatedSources)) return undefined;
  if (candidate.sourceFiles.length < 1 || candidate.sourceFiles.length + candidate.generatedSources.length > HOT_RELOAD_SOURCE_LIMIT
      || candidate.classFiles.length < 1 || candidate.classFiles.length > 20_000) return undefined;
  const snapshotByPath = new Map(snapshotFiles.map((file) => [file.path, file]));
  const sourcePaths = new Set<string>();
  for (const entry of candidate.sourceFiles) {
    if (!isValidWorkspaceRelativePath(entry.path) || !/\.(?:java|kt)$/u.test(entry.path) || sourcePaths.has(entry.path)) return undefined;
    const fullPath = resolve(canonicalWorkspace, entry.path);
    if (!isInside(canonicalWorkspace, fullPath) || !snapshotByPath.has(entry.path)) return undefined;
    sourcePaths.add(entry.path);
  }
  const fixedSources: Array<{ path: string; content: string }> = [];
  const allSourcePaths = new Set(sourcePaths);
  let fixedBytes = 0;
  for (const entry of candidate.generatedSources) {
    if (!isValidWorkspaceRelativePath(entry.path) || !/\.(?:java|kt)$/u.test(entry.path)
        || typeof entry.content !== "string" || allSourcePaths.has(entry.path)) return undefined;
    const fullPath = resolve(canonicalWorkspace, entry.path);
    if (!isInside(canonicalWorkspace, fullPath) || snapshotByPath.has(entry.path)) return undefined;
    fixedBytes += Buffer.byteLength(entry.content, "utf8");
    if (fixedBytes > HOT_RELOAD_SOURCE_BYTES_LIMIT) return undefined;
    fixedSources.push({ path: entry.path, content: entry.content });
    allSourcePaths.add(entry.path);
  }
  let sourceBytes = fixedBytes;
  for (const path of sourcePaths) sourceBytes += snapshotByPath.get(path)!.bytes.byteLength;
  if (sourceBytes > HOT_RELOAD_SOURCE_BYTES_LIMIT) return undefined;

  const classFiles = new Set<string>();
  for (const file of candidate.classFiles) {
    if (!isValidWorkspaceRelativePath(file) || !file.endsWith(".class")) return undefined;
    classFiles.add(file);
  }
  const teamCodeOutputDirectories = new Set<string>();
  for (const directory of candidate.classDirectories) {
    if (typeof directory !== "string") return undefined;
    const absolute = resolve(canonicalWorkspace, directory);
    if (!isInside(canonicalWorkspace, absolute)) return undefined;
    teamCodeOutputDirectories.add(resolve(workspace, directory));
  }
  const requiredOutputRoot = resolve(classesRoot);
  for (const file of classFiles) {
    const output = resolve(requiredOutputRoot, file);
    if (!isInside(requiredOutputRoot, output)) return undefined;
  }
  return {
    plan: { sourcePaths: [...sourcePaths].sort(compareText), classFiles: [...classFiles].sort(compareText), fixedSources },
    teamCodeOutputDirectories,
  };
}

function isValidWorkspaceRelativePath(path: string): boolean {
  return typeof path === "string" && path.length > 0 && !path.includes("\\") && !path.includes("\0")
    && !path.startsWith("/") && !/^[A-Za-z]:/u.test(path)
    && path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

async function buildProjectCompletionIndex(
  inputs: readonly { path: string; coordinate: string }[],
  repositorySnapshotHash: string,
): Promise<ProjectArtifactCompletionDocument | undefined> {
  const artifacts: Array<readonly [string, string]> = [];
  const classes: ResolvedLibraryClass[] = [];
  const usedArtifactNames = new Set<string>();
  const seenTypes = new Set<string>();
  let memberCount = 0;
  let omittedClassFiles = 0;
  let truncated = false;

  for (const input of inputs) {
    if (extname(input.path).toLowerCase() !== ".jar" || artifacts.length >= 1_024) continue;
    const bytes = new Uint8Array(await readFile(input.path));
    const digest = createHash("sha256").update(bytes).digest("hex");
    const baseName = input.coordinate || basename(input.path);
    const artifactName = usedArtifactNames.has(baseName)
      ? `${baseName} [${digest.slice(0, 8)}]`
      : baseName;
    usedArtifactNames.add(artifactName);
    artifacts.push([artifactName, digest]);

    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes, {
        filter: ({ name }) => name.endsWith(".class")
          && !name.endsWith("module-info.class")
          && !name.endsWith("package-info.class")
          && !name.startsWith("META-INF/versions/"),
      });
    } catch {
      truncated = true;
      omittedClassFiles += 1;
      continue;
    }
    for (const classBytes of Object.values(entries)) {
      if (classes.length >= COMPLETION_INDEX_CLASS_LIMIT
          || memberCount >= COMPLETION_INDEX_MEMBER_LIMIT) {
        truncated = true;
        omittedClassFiles += 1;
        continue;
      }
      let parsed;
      try {
        parsed = parsePublicJvmClassFile(classBytes);
      } catch {
        truncated = true;
        omittedClassFiles += 1;
        continue;
      }
      if (!parsed?.publicType || isPlatformCompletionNamespace(parsed.name)) continue;
      if (seenTypes.has(parsed.name)) continue;
      if (memberCount + parsed.members.length > COMPLETION_INDEX_MEMBER_LIMIT) {
        truncated = true;
        omittedClassFiles += 1;
        continue;
      }
      seenTypes.add(parsed.name);
      memberCount += parsed.members.length;
      const unsupported = UNSUPPORTED_RESOLVED_LIBRARY_POLICIES.some(({ packagePrefix }) => (
        parsed.name.startsWith(packagePrefix)
      ));
      const classification = unsupported ? "unsupported" : "compile-only-utility";
      classes.push({
        name: parsed.name,
        kind: parsed.kind,
        artifact: artifactName,
        classification: isRenderedVisionClass(parsed.name) ? "behaviorally-modeled" : classification,
        coverage: unsupported ? isRenderedVisionClass(parsed.name) ? "partial" : "none" : "full",
        superTypes: parsed.superTypes,
        members: parsed.members.map((member) => ({ ...member, classification: isRenderedVisionMember({ owner: parsed.name, ...member }) ? "behaviorally-modeled" : classification })),
      });
    }
  }

  if (artifacts.length === 0 || classes.length === 0) return undefined;
  const sourceSha256 = createHash("sha256")
    .update(`ftc-project-resolved-completions-v1\0${repositorySnapshotHash}\0`)
    .update(artifacts.map(([name, digest]) => `${name}\0${digest}\n`).join(""))
    .digest("hex");
  const index: JvmLanguageIndex = buildResolvedLibraryLanguageIndex({
    id: "ftc-project-resolved-dependencies",
    version: "gradle-resolved",
    sourceSha256,
    artifacts,
    classes,
  });
  return {
    format: PROJECT_COMPLETION_INDEX_FORMAT,
    repositorySnapshotHash,
    index,
    truncated,
    omittedClassFiles,
  };
}

function isPlatformCompletionNamespace(name: string): boolean {
  return [
    "java.", "javax.", "android.", "kotlin.", "org.jetbrains.annotations.",
    "com.qualcomm.", "org.firstinspires.ftc.",
  ].some((prefix) => name.startsWith(prefix));
}

async function compileSimulatorShim(
  config: GradleAdapterConfig,
  workspace: string,
  output: string,
): Promise<void> {
  const sources = await listJavaSources(config.shimSourceRoot);
  const result = await config.executor.run({
    argv: [
      "javac", "--release", "8", "-proc:none", "-encoding", "UTF-8",
      "-J-Xms16m", "-J-Xmx256m", "-J-XX:MaxMetaspaceSize=128m", "-J-Xss512k",
      "-d", output, ...sources,
    ],
    cwd: workspace,
    env: isolatedProcessEnvironment(workspace, ""),
    timeoutMs: 20_000,
    stdoutLimitBytes: 128 * 1024,
    stderrLimitBytes: 128 * 1024,
  });
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error("Simulator FTC shim compilation failed before Gradle TeamCode compilation");
  }
}

async function listJavaSources(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listJavaSources(path);
    return entry.isFile() && entry.name.endsWith(".java") ? [path] : [];
  }));
  return nested.flat().sort(compareText);
}

function createGradleInitScript(input: { shimClassesRoot: string; metadataPath: string; originalSourcePaths: string[] }): string {
  const shim = groovyString(input.shimClassesRoot);
  const metadata = groovyString(input.metadataPath);
  const originalSourcePaths = input.originalSourcePaths.map((path) => `'${groovyString(path)}'`).join(", ");
  return `
import groovy.json.JsonOutput
import org.gradle.api.artifacts.component.ModuleComponentIdentifier
import org.gradle.api.artifacts.ProjectDependency
import org.gradle.api.tasks.compile.JavaCompile
import org.gradle.api.file.FileCollection

def shimClasses = new File('${shim}')
def metadataFile = new File('${metadata}')
def originalSourcePaths = [${originalSourcePaths}] as Set

gradle.projectsEvaluated {
  def allProjects = rootProject.allprojects.toList()
  def target = allProjects.find { it.path.toLowerCase().contains('teamcode') }
  if (target == null) target = allProjects.find { it == rootProject }
  if (target == null) target = allProjects.first()

  // A file dependency keeps the simulator SDK shim on Java and Kotlin compile classpaths
  // without eagerly realizing Android variant tasks.
  target.configurations.findAll { configuration ->
    configuration.name.toLowerCase().endsWith('compileonly')
  }.each { configuration ->
    configuration.dependencies.add(target.dependencies.create(target.files(shimClasses)))
  }

  // Inspect task names without realizing Android variant TaskProviders during projectsEvaluated.
  def taskNames = target.tasks.names
  def javaTaskNames = taskNames.findAll { name ->
    name == 'compileJava' || name == 'compileDebugJavaWithJavac' || name == 'compileReleaseJavaWithJavac'
  }.toList()
  def kotlinTaskNames = taskNames.findAll { name ->
    name == 'compileKotlin' || name == 'compileDebugKotlin' || name == 'compileReleaseKotlin'
  }.toList()
  def preferredJava = javaTaskNames.findAll { it.toLowerCase().contains('debug') }
  if (!preferredJava.isEmpty()) javaTaskNames = preferredJava
  def preferredKotlin = kotlinTaskNames.findAll { it.toLowerCase().contains('debug') }
  if (!preferredKotlin.isEmpty()) kotlinTaskNames = preferredKotlin
  def selectedNames = (javaTaskNames + kotlinTaskNames).unique()
  if (selectedNames.isEmpty()) throw new GradleException('No TeamCode Java or Kotlin compile task was found')
  target.tasks.withType(JavaCompile).configureEach { options.debug = true; options.debugOptions.debugLevel = 'source,lines,vars' }
  def runtimeConfigurationFor = { project ->
    ['debugRuntimeClasspath', 'releaseRuntimeClasspath', 'runtimeClasspath']
      .collect { project.configurations.findByName(it) }.find { it != null }
  }
  def runtimeConfiguration = runtimeConfigurationFor(target)
  def runtimeProjectPaths = [target.path] as Set
  def visitRuntimeProjects
  visitRuntimeProjects = { project ->
    def projectRuntimeConfiguration = runtimeConfigurationFor(project)
    if (projectRuntimeConfiguration != null) {
      projectRuntimeConfiguration.hierarchy.each { sourceConfiguration ->
        sourceConfiguration.dependencies.withType(ProjectDependency).each { dependency ->
          // Gradle 9 removed dependencyProject. getPath() is available from 8.11;
          // keep the older accessor only for wrappers predating that API.
          def dependencyPath = dependency.hasProperty('path')
            ? dependency.path : dependency.dependencyProject.path
          if (runtimeProjectPaths.add(dependencyPath)) {
            visitRuntimeProjects(rootProject.project(dependencyPath))
          }
        }
      }
    }
  }
  visitRuntimeProjects(target)
  // Only JVM SourceSet resources are classloader resources. Android's process*Resources
  // tasks produce APK resources and must stay out of this returned runtime classpath.
  def preferredResourceVariant = selectedNames.any { it.toLowerCase().contains('debug') }
    ? 'Debug'
    : selectedNames.any { it.toLowerCase().contains('release') } ? 'Release' : null
  def runtimeCompileTaskPaths = [] as Set
  def resourceTaskPaths = [] as Set
  runtimeProjectPaths.each { projectPath ->
    def project = rootProject.project(projectPath)
    def compileTaskNames = project.tasks.names.findAll { name ->
      name == 'compileJava' || name == 'compileKotlin'
        || name == 'compileDebugJavaWithJavac' || name == 'compileReleaseJavaWithJavac'
        || name == 'compileDebugKotlin' || name == 'compileReleaseKotlin'
    }.toList()
    if (preferredResourceVariant != null) {
      def preferredCompileTasks = compileTaskNames.findAll { name ->
        name.toLowerCase().contains(preferredResourceVariant.toLowerCase())
      }
      if (!preferredCompileTasks.isEmpty()) compileTaskNames = preferredCompileTasks
    }
    compileTaskNames.unique().each { taskName ->
      runtimeCompileTaskPaths.add(project.tasks.named(taskName))
    }
    def sourceSets = project.extensions.findByType(org.gradle.api.tasks.SourceSetContainer)
    def mainSourceSet = sourceSets?.findByName('main')
    def resourceTaskNames = []
    if (mainSourceSet != null && project.tasks.findByName('processResources') != null) {
      resourceTaskNames.add('processResources')
    }
    if (preferredResourceVariant != null) {
      def variantJavaResources = "process\${preferredResourceVariant}JavaRes"
      if (project.tasks.findByName(variantJavaResources) != null) resourceTaskNames.add(variantJavaResources)
    }
    if (project.tasks.findByName('processJavaRes') != null) resourceTaskNames.add('processJavaRes')
    resourceTaskNames.unique().each { taskName ->
      resourceTaskPaths.add(project.tasks.named(taskName))
    }
  }

  rootProject.tasks.register('ftcRunnerCompileTeamCode') {
    group = 'build'
    description = 'Compiles TeamCode bytecode for the FTC simulator without packaging an APK.'
    dependsOn(selectedNames.collect { target.tasks.named(it) } + runtimeCompileTaskPaths + resourceTaskPaths)
    doLast {
      def classDirectories = [] as Set
      def teamCodeOutputDirectories = [] as Set
      def sourceFiles = new LinkedHashMap<String, String>()
      def generatedSources = new LinkedHashMap<String, String>()
      def hotReloadUnsupported = false
      def hotReloadReasons = [] as Set
      def runtimeFiles = new LinkedHashMap<String, String>()
      def resourceOutputs = [] as Set
      selectedNames.each { taskName ->
        def task = target.tasks.named(taskName).get()
        // KotlinCompile exposes its source property as write-only on current
        // Kotlin Gradle plugins. Task inputs are the resolved source set for
        // both JavaCompile and KotlinCompile and exclude source-root globs.
        task.inputs.files.files.findAll { it.isFile() && (it.name.endsWith('.java') || it.name.endsWith('.kt')) }.each { source ->
          def path = rootProject.projectDir.toPath().relativize(source.toPath()).toString().replace('\\\\', '/')
          if (originalSourcePaths.contains(path) && new File(rootProject.projectDir, path).isFile()) sourceFiles[path] = ''
          else if (!path.startsWith('..')) generatedSources[path] = source.getText('UTF-8')
          else { hotReloadUnsupported = true; hotReloadReasons.add('source outside workspace') }
        }
        if (task instanceof JavaCompile) {
          def output = task.destinationDirectory.get().asFile
          teamCodeOutputDirectories.add(output.absolutePath)
          if (output.exists()) output.eachFileRecurse { f -> if (f.isFile() && f.name.endsWith('.class')) classDirectories.add(output.absolutePath) }
          def semanticJavacArgs = task.options.compilerArgs.findAll { arg ->
            !(arg == '-nowarn' || arg.startsWith('-Xlint:') || arg == '-Xlint')
          }
          if (!semanticJavacArgs.isEmpty()) { hotReloadUnsupported = true; hotReloadReasons.add('semantic javac arguments') }
          if (task.options.annotationProcessorPath != null && !task.options.annotationProcessorPath.files.isEmpty()) {
            hotReloadUnsupported = true; hotReloadReasons.add('custom annotation processor')
          }
          if (!(task.sourceCompatibility in ['1.8', '8']) || !(task.targetCompatibility in ['1.8', '8'])) {
            hotReloadUnsupported = true; hotReloadReasons.add('Java source or target level differs from 8')
          }
          try {
            if (task.options.release.present && task.options.release.get() != 8) {
              hotReloadUnsupported = true; hotReloadReasons.add('Java release level differs from 8')
            }
          } catch (ignored) {}
          task.classpath.files.each { f -> if (f.exists()) runtimeFiles[f.absolutePath] = '' }
        } else {
          ['destinationDirectory', 'destinationDir', 'destination'].each { property ->
            if (task.hasProperty(property)) {
              try {
                def value = task.property(property)
                def dir = value instanceof org.gradle.api.file.DirectoryProperty ? value.get().asFile : value instanceof File ? value : null
                if (dir != null && dir.exists()) { classDirectories.add(dir.absolutePath); teamCodeOutputDirectories.add(dir.absolutePath) }
              } catch (ignored) {}
            }
          }
          try {
            def freeArgs = task.compilerOptions.freeCompilerArgs.getOrElse([])
            def semanticFreeArgs = freeArgs.findAll { arg ->
              !(arg == '-nowarn' || arg.startsWith('-Xwarning-level='))
            }
            if (!semanticFreeArgs.isEmpty()) { hotReloadUnsupported = true; hotReloadReasons.add('semantic Kotlin free compiler arguments') }
          } catch (ignored) {}
          try {
            def jvmTarget = task.compilerOptions.jvmTarget.orNull?.toString()
            def normalizedJvmTarget = jvmTarget?.replace('JVM_', '')?.replace('_', '.')
            if (normalizedJvmTarget != null && !(normalizedJvmTarget in ['1.8', '8'])) {
              hotReloadUnsupported = true; hotReloadReasons.add('Kotlin JVM target differs from 8: ' + jvmTarget)
            }
          } catch (ignored) {}
          try {
            if (task.hasProperty('pluginClasspath') && !task.pluginClasspath.files.isEmpty()) { hotReloadUnsupported = true; hotReloadReasons.add('Kotlin compiler plugin') }
          } catch (ignored) {}
          if (task.hasProperty('libraries')) task.libraries.files.each { f -> if (f.exists()) runtimeFiles[f.absolutePath] = '' }
        }
      }
      if (target.plugins.hasPlugin('org.jetbrains.kotlin.kapt') || target.plugins.hasPlugin('com.google.devtools.ksp')) {
        hotReloadUnsupported = true; hotReloadReasons.add('kapt or ksp plugin')
      }
      if (target.tasks.names.any { it.toLowerCase().startsWith('kapt') || it.toLowerCase().startsWith('ksp') }) {
        hotReloadUnsupported = true; hotReloadReasons.add('kapt or ksp task')
      }
      // The TeamCode output is rebuilt from source during hot reload. Keep its compile
      // classpath entries out of runtime files so deleted classes cannot reappear.
      runtimeFiles.keySet().removeAll(teamCodeOutputDirectories)
      runtimeProjectPaths.each { projectPath ->
        def project = rootProject.project(projectPath)
        def sourceSets = project.extensions.findByType(org.gradle.api.tasks.SourceSetContainer)
        def mainSourceSet = sourceSets?.findByName('main')
        if (mainSourceSet != null) {
          if (projectPath != target.path) mainSourceSet.output.classesDirs.files.each { classesDir ->
            if (classesDir.exists()) runtimeFiles[classesDir.absolutePath] = ''
          }
        }
      }
      if (runtimeConfiguration != null) {
        // Mirror the runtime dependency graph without project edges. Resolving
        // an Android subproject's whole debugRuntimeClasspath as an ArtifactSet
        // is ambiguous because AGP exposes multiple transformed artifacts from
        // each project variant. The Java/Kotlin compile task classpaths above
        // retain selected project outputs and local file dependencies; this
        // mirror adds the exact transitive module artifacts and constraints.
        def externalRuntime = target.configurations.create('ftcRunnerExternalRuntimeClasspath')
        externalRuntime.canBeResolved = true
        externalRuntime.canBeConsumed = false
        runtimeConfiguration.attributes.keySet().each { attribute ->
          externalRuntime.attributes.attribute(attribute, runtimeConfiguration.attributes.getAttribute(attribute))
        }
        runtimeProjectPaths.each { projectPath ->
          def project = rootProject.project(projectPath)
          def projectRuntimeConfiguration = runtimeConfigurationFor(project)
          projectRuntimeConfiguration?.hierarchy.each { sourceConfiguration ->
            sourceConfiguration.dependencies.each { dependency ->
              if (!(dependency instanceof ProjectDependency)) {
                externalRuntime.dependencies.add(dependency.copy())
              }
            }
            sourceConfiguration.dependencyConstraints.each { constraint ->
              externalRuntime.dependencyConstraints.add(constraint.copy())
            }
            sourceConfiguration.excludeRules.each { rule -> externalRuntime.exclude(rule.args) }
          }
        }
        def runtimeArtifacts = externalRuntime.incoming.artifacts.artifacts
        runtimeArtifacts.each { artifact ->
          def file = artifact.file
          def component = artifact.id.componentIdentifier
          def coordinate = component instanceof ModuleComponentIdentifier
            ? "\${component.group}:\${component.module}:\${component.version}"
            : ''
          if (file.exists()) runtimeFiles[file.absolutePath] = coordinate
        }
      }
      runtimeProjectPaths.each { projectPath ->
        def project = rootProject.project(projectPath)
        def sourceSets = project.extensions.findByType(org.gradle.api.tasks.SourceSetContainer)
        def mainSourceSet = sourceSets?.findByName('main')
        if (mainSourceSet != null) {
          def resourcesDir = mainSourceSet.output.resourcesDir
          if (resourcesDir != null && resourcesDir.exists()) resourceOutputs.add(resourcesDir.absolutePath)
        }
      }
      resourceTaskPaths.each { resourceTaskProvider ->
        resourceTaskProvider.get().outputs.files.files.each { output ->
          if (output.exists()) resourceOutputs.add(output.absolutePath)
        }
      }
      def result = [
        projectPath: target.path,
        compileTasks: selectedNames.collect { "\${target.path}:\${it}" },
        classDirectories: classDirectories.toList(),
        runtimeFiles: runtimeFiles.collect { path, coordinate -> [path: path, coordinate: coordinate] },
        resourceOutputs: resourceOutputs.toList(),
        hotReload: [
          unsupported: hotReloadUnsupported,
          unsupportedReasons: hotReloadReasons.toList(),
          sourceFiles: sourceFiles.collect { path, ignored -> [path: path] },
          generatedSources: generatedSources.collect { path, content -> [path: path, content: content] },
          classFiles: classDirectories.collectMany { directory ->
            def root = new File(directory)
            def emitted = []
            if (root.exists()) root.eachFileRecurse { file ->
              if (file.isFile() && file.name.endsWith('.class')) emitted.add(root.toPath().relativize(file.toPath()).toString().replace('\\\\', '/'))
            }
            emitted
          }.unique(),
          classDirectories: teamCodeOutputDirectories.collect { directory -> rootProject.projectDir.toPath().relativize(new File(directory).toPath()).toString().replace('\\\\', '/') },
        ],
      ]
      metadataFile.parentFile.mkdirs()
      metadataFile.text = JsonOutput.toJson(result)
    }
  }
}
`;
}

interface GradleMetadata {
  classDirectories?: string[];
  runtimeFiles?: Array<{ path: string; coordinate: string }>;
  resourceOutputs?: string[];
  hotReload?: {
    unsupported?: boolean;
    unsupportedReasons?: string[];
    sourceFiles?: Array<{ path: string }>;
    generatedSources?: Array<{ path: string; content: string }>;
    classFiles?: string[];
    classDirectories?: string[];
  };
}

function groovyString(value: string): string {
  return value.replaceAll("\\\\", "\\\\\\\\").replaceAll("'", "\\\\'");
}

function validateSnapshotPath(path: string): void {
  if (!path || path.length > 1024 || path.includes("\\") || path.includes("\0")
      || path.startsWith("/") || /^[A-Za-z]:/u.test(path)
      || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`Repository snapshot path is not normalized: ${path}`);
  }
}

function decodeBase64(content: string, path: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(content)) {
    throw new Error(`Repository snapshot file ${path} has invalid base64 data`);
  }
  return new Uint8Array(Buffer.from(content, "base64"));
}

function isInside(root: string, path: string): boolean {
  const relativePath = relative(root, path);
  return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== "..");
}

async function normalizeRuntimeArtifact(
  path: string,
  workspace: string,
): Promise<{ path: string } | undefined> {
  let info;
  try { info = await stat(path); } catch { return undefined; }
  if (info.isDirectory()) return { path };
  if (extname(path).toLowerCase() === ".jar") return { path };
  if (extname(path).toLowerCase() !== ".aar") return undefined;
  const archive = await readFile(path);
  const entries = unzipSync(archive, { filter: ({ name }) => name === "classes.jar" });
  const classes = entries["classes.jar"];
  if (!classes) return undefined;
  const hash = createHash("sha256").update(classes).digest("hex");
  const extracted = join(workspace, "gradle-runtime", `${hash}.jar`);
  await mkdir(dirname(extracted), { recursive: true });
  await writeFile(extracted, classes, { mode: 0o600 });
  return { path: extracted };
}

function isFtcOrAndroidApi(path: string): boolean {
  const name = path.split(/[\\/]/u).at(-1)?.toLowerCase() ?? "";
  return /^(?:ftccommon|hardware|robotcore|vision)(?:-|\.)/u.test(name)
    || name === "android.jar"
    || name === "kotlin-android.jar";
}

async function copyClassFiles(source: string, destination: string): Promise<void> {
  let entries;
  try { entries = await readdir(source, { withFileTypes: true }); } catch { return; }
  await Promise.all(entries.map(async (entry) => {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyClassFiles(from, to);
    } else if (entry.isFile() && entry.name.endsWith(".class")) {
      await mkdir(dirname(to), { recursive: true });
      await copyFile(from, to);
    }
  }));
}

async function writeGradleFailureEvidence(
  path: string,
  request: ProcessRequest,
  result: ProcessResult,
): Promise<void> {
  const environment = Object.fromEntries(Object.entries(request.env ?? {})
    .sort(([left], [right]) => compareText(left, right))
    .map(([name, value]) => [
      name,
      /(?:token|secret|password|credential|private|authorization|api[_-]?key)/iu.test(name)
        ? "[REDACTED]"
        : value,
    ]));
  const output = (text: string, truncated: boolean) => {
    const redacted = redactGradleOutput(text);
    return {
      text: redacted.text,
      sha256: createHash("sha256").update(text, "utf8").digest("hex"),
      byteLength: Buffer.byteLength(text, "utf8"),
      truncated,
      redactionCount: redacted.count,
    };
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    schemaVersion: 1,
    argv: request.argv,
    cwd: request.cwd,
    environment,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    cancelled: Boolean(result.cancelled),
    stdout: output(result.stdout, result.stdoutTruncated),
    stderr: output(result.stderr, result.stderrTruncated),
    outputWasSecretScrubbed: true,
  }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
}

function redactGradleOutput(value: string): { text: string; count: number } {
  let count = 0;
  let text = value;
  const replace = (pattern: RegExp, replacement: string) => {
    text = text.replace(pattern, (...parts: string[]) => {
      count++;
      return replacement.replace("$1", parts[1] ?? "");
    });
  };
  replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, "$1[REDACTED]@");
  replace(/(\b(?:proxy-)?authorization\s*[:=]\s*)(?:basic|bearer)\s+[^\s,;]+/giu, "$1[REDACTED]");
  replace(/(\bbearer\s+)[A-Za-z0-9._~+\/-]+=*/giu, "$1[REDACTED]");
  replace(/(\b(?:password|passwd|secret|token|api[_-]?key|client[_-]?secret)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/giu, "$1[REDACTED]");
  return { text, count };
}

function parseGradleDiagnostics(output: string, workspace: string): BuildDiagnostic[] {
  const redacted = output.replaceAll(workspace, "<workspace>");
  const diagnostics: BuildDiagnostic[] = [];
  const seen = new Set<string>();
  for (const line of redacted.split(/\r?\n/u)) {
    const java = line.match(/^(.*?\.java):(\d+):\s*(error|warning):\s*(.*)$/u);
    const kotlin = line.match(/^e:\s*(?:file:\/\/)?(.*?\.kt):(\d+):(\d+):\s*(.*)$/u);
    const match = java ?? kotlin;
    if (match) {
      const diagnostic: BuildDiagnostic = {
        kind: java ? java[3] as "error" | "warning" : "error",
        file: match[1].replace(/^.*?<workspace>\//u, ""),
        line: Number(match[2]),
        ...(kotlin ? { column: Number(match[3]) } : {}),
        message: match[4],
      };
      const identity = `${diagnostic.file}:${diagnostic.line}:${diagnostic.kind}:${diagnostic.message}`;
      if (!seen.has(identity)) { diagnostics.push(diagnostic); seen.add(identity); }
    }
  }
  if (diagnostics.length) return diagnostics;
  const lines = redacted.split(/\r?\n/u);
  const failureStart = lines.findIndex((line) => line.startsWith("FAILURE: Build failed"));
  const failure = failureStart >= 0
    ? lines.slice(failureStart).join("\n").trim()
    : "";
  const interesting = lines
    .filter((line) => /(^FAILURE:|What went wrong:|Could not resolve|Could not find|error:| e: )/iu.test(line))
    .slice(-16);
  return [{
    kind: "error",
    code: "GRADLE_BUILD_FAILED",
    message: (failure || interesting.join("\n")).slice(0, 8_000)
      || "Gradle could not compile the TeamCode sources",
  }];
}

function compareText(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
