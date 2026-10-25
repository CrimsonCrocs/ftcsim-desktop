import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";

import {
  requireFtcSdkToolchain,
  type FtcSdkToolchain,
} from "./ftc-sdk-toolchain";
import type { ProcessExecutor, ProcessResult } from "./process-executor";
import type { CompilePayload } from "./validation";

export const COMPILE_TIMEOUT_MS = 20_000;
export const COMPILER_OUTPUT_LIMIT_BYTES = 128 * 1024;

export interface JavaCompilerConfig {
  executor: ProcessExecutor;
  shimSourceRoot: string;
  ftcSdk?: FtcSdkToolchain;
  ftcSdkHome?: string;
  androidJarPath?: string;
}

export interface JavacDiagnostic {
  kind: "error" | "warning" | "note";
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
}

export interface CompilationResult {
  status: "succeeded" | "failed";
  entryClass: string;
  diagnostics: JavacDiagnostic[];
  timedOut: boolean;
  outputTruncated: boolean;
  durationMs: number;
}

export interface CompiledJavaWorkspace {
  workspace: string;
  classesRoot: string;
  shimSourcePaths: string[];
  runtimeClasspath?: string[];
}

export interface PersistentCompilationResult {
  compilation: CompilationResult;
  workspace?: CompiledJavaWorkspace;
  dispose(): Promise<void>;
}

export interface CompilationUseResult<T> {
  compilation: CompilationResult;
  value?: T;
}

export async function compileJava(
  payload: CompilePayload,
  config: JavaCompilerConfig,
): Promise<CompilationResult> {
  return (await withCompiledJava(payload, config)).compilation;
}

export async function compilePersistentJava(
  payload: CompilePayload,
  config: JavaCompilerConfig,
): Promise<PersistentCompilationResult> {
  const prepared = await prepareJavaCompilation(payload, config);
  if (prepared.compilation.status === "failed") {
    await removeWorkspace(prepared.workspace.workspace);
    return { compilation: prepared.compilation, dispose: async () => {} };
  }
  let disposed = false;
  return {
    compilation: prepared.compilation,
    workspace: prepared.workspace,
    async dispose() {
      if (disposed) return;
      disposed = true;
      await removeWorkspace(prepared.workspace.workspace);
    },
  };
}

export async function withCompiledJava<T>(
  payload: CompilePayload,
  config: JavaCompilerConfig,
  onCompiled?: (compiled: CompiledJavaWorkspace) => Promise<T>,
): Promise<CompilationUseResult<T>> {
  const prepared = await prepareJavaCompilation(payload, config);
  try {
    if (prepared.compilation.status === "failed" || !onCompiled) {
      return { compilation: prepared.compilation };
    }
    return {
      compilation: prepared.compilation,
      value: await onCompiled(prepared.workspace),
    };
  } finally {
    await removeWorkspace(prepared.workspace.workspace);
  }
}

async function prepareJavaCompilation(
  payload: CompilePayload,
  config: JavaCompilerConfig,
): Promise<{ compilation: CompilationResult; workspace: CompiledJavaWorkspace }> {
  const ftcSdk = config.ftcSdk ?? await requireFtcSdkToolchain({
    home: config.ftcSdkHome,
    androidJarPath: config.androidJarPath,
  });
  const workspace = await mkdtemp(join(tmpdir(), "ftc-java-runner-"));
  const sourcesRoot = join(workspace, "sources");
  const classesRoot = join(workspace, "classes");
  const emptyClasspath = join(workspace, "empty-classpath");

  try {
    await Promise.all([mkdir(sourcesRoot), mkdir(classesRoot), mkdir(emptyClasspath)]);
    const userSourcePaths: string[] = [];
    const logicalPaths = new Map<string, string>();
    for (const source of payload.sources) {
      const absolutePath = resolve(sourcesRoot, source.path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source.content, "utf8");
      userSourcePaths.push(absolutePath);
      logicalPaths.set(absolutePath, source.path);
    }

    const shimSourcePaths = await listJavaSources(config.shimSourceRoot);
    for (const path of shimSourcePaths) {
      logicalPaths.set(path, `sdk-shim/${path.slice(config.shimSourceRoot.length + 1)}`);
    }
    const shimResult = await config.executor.run({
      argv: [
        "javac",
        "--release", "8",
        "-g", "-proc:none",
        "-Xlint:all",
        "-classpath", emptyClasspath,
        "-encoding", "UTF-8",
        "-J-Xms16m",
        "-J-Xmx256m",
        "-J-XX:MaxMetaspaceSize=128m",
        "-J-Xss512k",
        "-d", classesRoot,
        ...shimSourcePaths,
      ],
      cwd: workspace,
      env: isolatedProcessEnvironment(workspace, emptyClasspath),
      timeoutMs: COMPILE_TIMEOUT_MS,
      stdoutLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
      stderrLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
    });
    if (shimResult.exitCode !== 0 || shimResult.timedOut) {
      return {
        compilation: compilationResult(payload.entryClass, shimResult, logicalPaths),
        workspace: {
          workspace,
          classesRoot,
          shimSourcePaths,
          runtimeClasspath: [classesRoot, ...ftcSdk.runtimeDependencyJarPaths],
        },
      };
    }

    const teamCodeClasspath = [
      ...ftcSdk.officialJarPaths,
      ...ftcSdk.compileDependencyJarPaths,
      ftcSdk.androidJarPath,
      classesRoot,
    ].join(delimiter);
    const teamCodeResult = await config.executor.run({
      argv: [
        "javac",
        "--release", "8",
        "-g", "-proc:none",
        "-Xlint:all",
        "-classpath", teamCodeClasspath,
        "-encoding", "UTF-8",
        "-J-Xms16m",
        "-J-Xmx256m",
        "-J-XX:MaxMetaspaceSize=128m",
        "-J-Xss512k",
        "-d", classesRoot,
        ...userSourcePaths,
      ],
      cwd: workspace,
      env: isolatedProcessEnvironment(workspace, teamCodeClasspath),
      timeoutMs: COMPILE_TIMEOUT_MS,
      stdoutLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
      stderrLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
    });
    const processResult = mergeCompilationProcesses(shimResult, teamCodeResult);

    return {
      compilation: compilationResult(payload.entryClass, processResult, logicalPaths),
      workspace: {
        workspace,
        classesRoot,
        shimSourcePaths,
        runtimeClasspath: [classesRoot, ...ftcSdk.runtimeDependencyJarPaths],
      },
    };
  } catch (error) {
    await removeWorkspace(workspace);
    throw error;
  }
}

function mergeCompilationProcesses(
  shim: ProcessResult,
  teamCode: ProcessResult,
): ProcessResult {
  return {
    ...teamCode,
    stdout: [shim.stdout, teamCode.stdout].filter(Boolean).join("\n"),
    stderr: [shim.stderr, teamCode.stderr].filter(Boolean).join("\n"),
    timedOut: shim.timedOut || teamCode.timedOut,
    stdoutTruncated: shim.stdoutTruncated || teamCode.stdoutTruncated,
    stderrTruncated: shim.stderrTruncated || teamCode.stderrTruncated,
    durationMs: shim.durationMs + teamCode.durationMs,
  };
}

async function removeWorkspace(workspace: string): Promise<void> {
  await rm(workspace, {
    force: true,
    recursive: true,
    maxRetries: 2,
    retryDelay: 20,
  });
}

function compilationResult(
  entryClass: string,
  result: ProcessResult,
  logicalPaths: Map<string, string>,
): CompilationResult {
  return {
    status: result.exitCode === 0 && !result.timedOut ? "succeeded" : "failed",
    entryClass,
    diagnostics: parseJavacDiagnostics(result.stderr, logicalPaths),
    timedOut: result.timedOut,
    outputTruncated: result.stdoutTruncated || result.stderrTruncated,
    durationMs: result.durationMs,
  };
}

export function parseJavacDiagnostics(
  stderr: string,
  logicalPaths: Map<string, string>,
): JavacDiagnostic[] {
  if (!stderr.trim()) return [];
  const redacted = redactWorkspacePaths(stderr, logicalPaths);
  const lines = redacted.split(/\r?\n/);
  const diagnostics: JavacDiagnostic[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const sourceMatch = line.match(/^(.*\.java):(\d+): (error|warning): (.*)$/);
    if (sourceMatch) {
      const [, file, rawLine, rawKind, rawMessage] = sourceMatch;
      const messageParts = rawMessage.match(/^\[([^\]]+)]\s*(.*)$/);
      const caretLine = lines[index + 2];
      const caretOffset = caretLine?.indexOf("^") ?? -1;
      diagnostics.push({
        kind: rawKind as "error" | "warning",
        file,
        line: Number(rawLine),
        ...(caretOffset >= 0 ? { column: caretOffset + 1 } : {}),
        ...(messageParts ? { code: messageParts[1] } : {}),
        message: messageParts ? messageParts[2] : rawMessage,
      });
      if (caretOffset >= 0) index += 2;
      continue;
    }

    const globalMatch = line.match(/^(error|warning): (.*)$/);
    if (globalMatch) {
      diagnostics.push({ kind: globalMatch[1] as "error" | "warning", message: globalMatch[2] });
      continue;
    }
    const noteMatch = line.match(/^Note: (.*)$/);
    if (noteMatch) diagnostics.push({ kind: "note", message: noteMatch[1] });
  }

  if (diagnostics.length > 0) return diagnostics;
  return [{ kind: "error", message: redacted.trim() }];
}

function redactWorkspacePaths(value: string, logicalPaths: Map<string, string>): string {
  let redacted = value;
  for (const [absolute, logical] of logicalPaths) redacted = redacted.replaceAll(absolute, logical);
  return redacted.replace(/\/[^\s:]*ftc-java-runner-[^\s:]*/g, "<workspace>");
}

async function listJavaSources(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await listJavaSources(path));
    else if (entry.isFile() && entry.name.endsWith(".java")) paths.push(path);
  }
  return paths.sort();
}

export function isolatedProcessEnvironment(
  workspace: string,
  classpath = "",
): Record<string, string> {
  return {
    CLASSPATH: classpath,
    HOME: workspace,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    PATH: Bun.env.PATH ?? "/usr/bin:/bin",
    TMPDIR: workspace,
  };
}
