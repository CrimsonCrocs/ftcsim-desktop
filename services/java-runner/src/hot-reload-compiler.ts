import { cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";

import type { ProgramSource } from "@ftc-studio/opmode-protocol";

import {
  COMPILE_TIMEOUT_MS,
  COMPILER_OUTPUT_LIMIT_BYTES,
  isolatedProcessEnvironment,
  parseJavacDiagnostics,
  type CompilationResult,
  type CompiledJavaWorkspace,
  type JavaCompilerConfig,
  type PersistentCompilationResult,
} from "./java-compiler";
import { requireFtcSdkToolchain } from "./ftc-sdk-toolchain";
import { resolveKotlinToolchain } from "./kotlin-toolchain";
import type { ProcessResult } from "./process-executor";

type HotReloadCompilerConfig = JavaCompilerConfig & { kotlinHome?: string };

const ENTRY_CLASS = "org.firstinspires.ftc.teamcode.SessionDiscovery";

export async function compileHotReload(
  sources: ProgramSource[],
  base: CompiledJavaWorkspace,
  ownedClassFiles: string[],
  config: HotReloadCompilerConfig,
  signal?: AbortSignal,
): Promise<PersistentCompilationResult> {
  const invalidPath = [...sources.map(({ path }) => path), ...ownedClassFiles]
    .find((path) => !isSafeRelativePath(path));
  if (invalidPath !== undefined) return failure(`Unsafe source or class path: ${invalidPath}`);
  if (signal?.aborted) return failure("Compilation cancelled");

  const started = performance.now();
  let workspace: string | undefined;
  try {
    const ftcSdk = config.ftcSdk ?? await requireFtcSdkToolchain({
      home: config.ftcSdkHome,
      androidJarPath: config.androidJarPath,
    });
    const kotlinSources = sources.filter((source) => source.path.endsWith(".kt"));
    if (sources.some((source) => !source.path.endsWith(".java") && !source.path.endsWith(".kt"))) {
      return failure("Hot Reload accepts only Java and Kotlin sources");
    }
    const kotlin = kotlinSources.length > 0
      ? await resolveKotlinToolchain(config.kotlinHome)
      : undefined;
    if (kotlinSources.length > 0 && !kotlin) {
      return failure("The pinned Kotlin 2.2.10 compiler bundle is not installed in the local runner yet");
    }

    workspace = await mkdtemp(join(tmpdir(), "ftc-hot-reload-"));
    const classesRoot = join(workspace, "classes");
    const sourcesRoot = join(workspace, "sources");
    await mkdir(classesRoot);
    await mkdir(sourcesRoot);
    await copyBaseClasses(base.classesRoot, classesRoot, new Set(ownedClassFiles.map(normalizeRelativePath)));

    const logicalPaths = new Map<string, string>();
    const javaPaths: string[] = [];
    const kotlinPaths: string[] = [];
    for (const source of sources) {
      const path = resolve(sourcesRoot, ...source.path.split(/[\\/]/u));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, source.content, "utf8");
      logicalPaths.set(path, source.path);
      (source.path.endsWith(".kt") ? kotlinPaths : javaPaths).push(path);
    }

    const baseRuntimeDependencies = (base.runtimeClasspath ?? [base.classesRoot])
      .filter((entry) => resolve(entry) !== resolve(base.classesRoot));
    const runtimeClasspath = [classesRoot, ...baseRuntimeDependencies];
    const compileClasspath = [
      ...ftcSdk.officialJarPaths,
      ...ftcSdk.compileDependencyJarPaths,
      ftcSdk.androidJarPath,
      classesRoot,
      ...baseRuntimeDependencies,
      ...(kotlin ? [kotlin.stdlibPath, kotlin.annotationsPath] : []),
    ];
    const diagnostics: CompilationResult["diagnostics"] = [];
    let durationMs = 0;
    let outputTruncated = false;

    if (kotlin && kotlinPaths.length > 0) {
      const kotlinClasspath = [
        ...ftcSdk.officialJarPaths,
        ...ftcSdk.compileDependencyJarPaths,
        ftcSdk.kotlinAndroidJarPath,
        classesRoot,
        ...baseRuntimeDependencies,
        kotlin.stdlibPath,
        kotlin.annotationsPath,
      ].join(delimiter);
      const result = await runBounded([
        "java", "-Xms32m", "-Xmx384m", "-XX:MaxMetaspaceSize=192m",
        "-cp", kotlin.compilerClasspath,
        "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler",
        "-no-stdlib", "-no-reflect", "-jvm-target", "1.8", "-Xjdk-release=8",
        "-classpath", kotlinClasspath,
        `-Xjava-source-roots=${sourcesRoot}`,
        "-d", classesRoot,
        ...kotlinPaths,
      ], workspace, kotlinClasspath, config, signal, started);
      durationMs += result.durationMs;
      outputTruncated ||= result.stdoutTruncated || result.stderrTruncated;
      diagnostics.push(...parseKotlinDiagnostics(`${result.stdout}\n${result.stderr}`, logicalPaths));
      if (!processSucceeded(result)) {
        await removeWorkspace(workspace);
        return failedCompilation(diagnostics, result, durationMs, outputTruncated);
      }
      if (signal?.aborted) {
        await removeWorkspace(workspace);
        return failedCompilation([], emptyProcess(true, false), durationMs, outputTruncated);
      }
    }

    if (javaPaths.length > 0) {
      const result = await runBounded([
        "javac", "--release", "8", "-g", "-proc:none", "-Xlint:all",
        "-classpath", compileClasspath.join(delimiter), "-encoding", "UTF-8",
        "-J-Xms16m", "-J-Xmx256m", "-J-XX:MaxMetaspaceSize=128m", "-J-Xss512k",
        "-d", classesRoot,
        ...javaPaths,
      ], workspace, compileClasspath.join(delimiter), config, signal, started);
      durationMs += result.durationMs;
      outputTruncated ||= result.stdoutTruncated || result.stderrTruncated;
      diagnostics.push(...parseJavacDiagnostics(result.stderr, logicalPaths));
      if (!processSucceeded(result)) {
        await removeWorkspace(workspace);
        return failedCompilation(diagnostics, result, durationMs, outputTruncated);
      }
      if (signal?.aborted) {
        await removeWorkspace(workspace);
        return failedCompilation([], emptyProcess(true, false), durationMs, outputTruncated);
      }
    }

    const compiledWorkspace: CompiledJavaWorkspace = {
      workspace,
      classesRoot,
      shimSourcePaths: base.shimSourcePaths,
      runtimeClasspath,
    };
    let disposed = false;
    return {
      compilation: {
        status: "succeeded",
        entryClass: ENTRY_CLASS,
        diagnostics: diagnostics.filter((diagnostic) => diagnostic.kind !== "error"),
        timedOut: false,
        outputTruncated,
        durationMs: Math.round(performance.now() - started),
      },
      workspace: compiledWorkspace,
      async dispose() {
        if (disposed) return;
        disposed = true;
        await removeWorkspace(workspace!);
      },
    };
  } catch (error) {
    if (workspace) await removeWorkspace(workspace);
    throw error;
  }
}

async function copyBaseClasses(sourceRoot: string, outputRoot: string, owned: Set<string>): Promise<void> {
  async function copyDirectory(from: string, to: string, prefix: string): Promise<void> {
    const entries = await readdir(from, { withFileTypes: true });
    for (const entry of entries) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (owned.has(name)) continue;
      const source = join(from, entry.name);
      const destination = join(to, entry.name);
      if (entry.isDirectory()) {
        await mkdir(destination, { recursive: true });
        await copyDirectory(source, destination, name);
      } else if (entry.isFile()) {
        await cp(source, destination);
      }
    }
  }
  await stat(sourceRoot);
  await copyDirectory(sourceRoot, outputRoot, "");
}

async function removeWorkspace(workspace: string): Promise<void> {
  await rm(workspace, { recursive: true, force: true, maxRetries: 2, retryDelay: 20 });
}

async function runBounded(
  argv: string[],
  cwd: string,
  classpath: string,
  config: JavaCompilerConfig,
  signal: AbortSignal | undefined,
  started: number,
): Promise<ProcessResult> {
  const remaining = COMPILE_TIMEOUT_MS - (performance.now() - started);
  if (signal?.aborted || remaining <= 0) return emptyProcess(signal?.aborted ?? false, remaining <= 0);
  return config.executor.run({
    argv,
    cwd,
    env: isolatedProcessEnvironment(cwd, classpath),
    timeoutMs: Math.max(1, Math.floor(remaining)),
    stdoutLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
    stderrLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
    signal,
  });
}

function isSafeRelativePath(path: string): boolean {
  if (!path || path.includes("\0") || isAbsolute(path)) return false;
  const parts = path.split(/[\\/]/u);
  return parts.every((part) => part !== "" && part !== "." && part !== "..")
    && !path.startsWith("/")
    && !/^[A-Za-z]:/u.test(path);
}

function normalizeRelativePath(path: string): string {
  return path.split(/[\\/]/u).join("/");
}

function processSucceeded(result: ProcessResult): boolean {
  return result.exitCode === 0 && !result.timedOut && !result.cancelled;
}

function emptyProcess(cancelled: boolean, timedOut: boolean): ProcessResult {
  return {
    exitCode: null,
    stdout: "",
    stderr: "",
    timedOut,
    stdoutTruncated: false,
    stderrTruncated: false,
    durationMs: 0,
    cancelled,
  };
}

function failedCompilation(
  diagnostics: CompilationResult["diagnostics"],
  process: ProcessResult,
  durationMs: number,
  outputTruncated = process.stdoutTruncated || process.stderrTruncated,
): PersistentCompilationResult {
  return {
    compilation: {
      status: "failed",
      entryClass: ENTRY_CLASS,
      diagnostics: diagnostics.length ? diagnostics : [{
        kind: "error",
        message: process.cancelled ? "Compilation cancelled" : process.timedOut ? "Compilation timed out" : "Compilation failed",
      }],
      timedOut: process.timedOut,
      outputTruncated,
      durationMs: Math.round(durationMs),
    },
    dispose: async () => {},
  };
}

function failure(message: string): PersistentCompilationResult {
  return {
    compilation: {
      status: "failed",
      entryClass: ENTRY_CLASS,
      diagnostics: [{ kind: "error", message }],
      timedOut: false,
      outputTruncated: false,
      durationMs: 0,
    },
    dispose: async () => {},
  };
}

function parseKotlinDiagnostics(
  output: string,
  logicalPaths: Map<string, string>,
): CompilationResult["diagnostics"] {
  const diagnostics: CompilationResult["diagnostics"] = [];
  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(/^(.*\.(?:kt|java)):(\d+):(\d+): (error|warning): (.*)$/u);
    if (match) {
      diagnostics.push({
        file: logicalPaths.get(match[1]) ?? match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        kind: match[4] as "error" | "warning",
        message: match[5],
      });
    } else if (/^(?:error|warning): /u.test(line)) {
      const separator = line.indexOf(":");
      diagnostics.push({ kind: line.slice(0, separator) as "error" | "warning", message: line.slice(separator + 1).trim() });
    }
  }
  return diagnostics;
}
