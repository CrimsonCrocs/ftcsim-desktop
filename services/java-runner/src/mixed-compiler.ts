import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";

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
import type { KotlinToolchain } from "./kotlin-toolchain";

export async function compilePersistentMixedProgram(
  sources: ProgramSource[],
  config: JavaCompilerConfig,
  kotlin: KotlinToolchain,
): Promise<PersistentCompilationResult> {
  const ftcSdk = config.ftcSdk ?? await requireFtcSdkToolchain({
    home: config.ftcSdkHome,
    androidJarPath: config.androidJarPath,
  });
  const workspace = await mkdtemp(join(tmpdir(), "ftc-mixed-runner-"));
  const sourcesRoot = join(workspace, "sources");
  const classesRoot = join(workspace, "classes");
  const emptyClasspath = join(workspace, "empty-classpath");
  const logicalPaths = new Map<string, string>();
  try {
    await Promise.all([mkdir(sourcesRoot), mkdir(classesRoot), mkdir(emptyClasspath)]);
    const javaSources: string[] = [];
    const kotlinSources: string[] = [];
    for (const source of sources) {
      const path = resolve(sourcesRoot, source.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, source.content, "utf8");
      logicalPaths.set(path, source.path);
      if (source.path.endsWith(".kt")) kotlinSources.push(path);
      else javaSources.push(path);
    }
    const shimSourcePaths = await listJavaSources(config.shimSourceRoot);
    for (const path of shimSourcePaths) {
      logicalPaths.set(path, `sdk-shim/${path.slice(config.shimSourceRoot.length + 1)}`);
    }

    const shim = await config.executor.run({
      argv: javacArgs(emptyClasspath, classesRoot, shimSourcePaths),
      cwd: workspace,
      env: isolatedProcessEnvironment(workspace, emptyClasspath),
      timeoutMs: COMPILE_TIMEOUT_MS,
      stdoutLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
      stderrLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
    });
    if (shim.exitCode !== 0 || shim.timedOut) {
      return await failedResult(workspace, parseJavacDiagnostics(shim.stderr, logicalPaths), shim);
    }

    const teamCodeClasspath = [
      ...ftcSdk.officialJarPaths,
      ...ftcSdk.compileDependencyJarPaths,
      ftcSdk.kotlinAndroidJarPath,
      classesRoot,
      kotlin.stdlibPath,
      kotlin.annotationsPath,
    ].join(delimiter);
    const kotlinResult = await config.executor.run({
      argv: [
        "java", "-Xms32m", "-Xmx384m", "-XX:MaxMetaspaceSize=192m",
        "-cp", kotlin.compilerClasspath,
        "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler",
        "-no-stdlib", "-no-reflect",
        "-jvm-target", "1.8",
        "-Xjdk-release=8",
        "-classpath", teamCodeClasspath,
        `-Xjava-source-roots=${sourcesRoot}`,
        "-d", classesRoot,
        ...kotlinSources,
      ],
      cwd: workspace,
      env: isolatedProcessEnvironment(workspace, teamCodeClasspath),
      timeoutMs: 20_000,
      stdoutLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
      stderrLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
    });
    if (kotlinResult.exitCode !== 0 || kotlinResult.timedOut) {
      return await failedResult(
        workspace,
        parseKotlinDiagnostics(`${kotlinResult.stdout}\n${kotlinResult.stderr}`, logicalPaths),
        kotlinResult,
      );
    }

    let javaDuration = 0;
    let javaTimedOut = false;
    let javaOutputTruncated = false;
    if (javaSources.length > 0) {
      const javaResult = await config.executor.run({
        argv: javacArgs(teamCodeClasspath, classesRoot, javaSources),
        cwd: workspace,
        env: isolatedProcessEnvironment(workspace, teamCodeClasspath),
        timeoutMs: COMPILE_TIMEOUT_MS,
        stdoutLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
        stderrLimitBytes: COMPILER_OUTPUT_LIMIT_BYTES,
      });
      javaDuration = javaResult.durationMs;
      javaTimedOut = javaResult.timedOut;
      javaOutputTruncated = javaResult.stdoutTruncated || javaResult.stderrTruncated;
      if (javaResult.exitCode !== 0 || javaResult.timedOut) {
        return await failedResult(
          workspace,
          parseJavacDiagnostics(javaResult.stderr, logicalPaths),
          javaResult,
        );
      }
    }

    const compiled: CompiledJavaWorkspace = {
      workspace,
      classesRoot,
      shimSourcePaths,
      runtimeClasspath: [
        classesRoot,
        ...ftcSdk.runtimeDependencyJarPaths,
        ...kotlin.runtimeClasspath,
      ],
    };
    let disposed = false;
    return {
      compilation: {
        status: "succeeded",
        entryClass: "org.firstinspires.ftc.teamcode.SessionDiscovery",
        diagnostics: [
          ...parseKotlinDiagnostics(`${kotlinResult.stdout}\n${kotlinResult.stderr}`, logicalPaths)
            .filter((diagnostic) => diagnostic.kind !== "error"),
        ],
        timedOut: javaTimedOut || kotlinResult.timedOut,
        outputTruncated: javaOutputTruncated
          || kotlinResult.stdoutTruncated || kotlinResult.stderrTruncated,
        durationMs: shim.durationMs + kotlinResult.durationMs + javaDuration,
      },
      workspace: compiled,
      async dispose() {
        if (disposed) return;
        disposed = true;
        await removeWorkspace(workspace);
      },
    };
  } catch (error) {
    await removeWorkspace(workspace);
    throw error;
  }
}

function javacArgs(classpath: string, output: string, sources: string[]): string[] {
  return [
    "javac", "--release", "8", "-g", "-proc:none", "-Xlint:all",
    "-classpath", classpath, "-encoding", "UTF-8",
    "-J-Xms16m", "-J-Xmx256m", "-J-XX:MaxMetaspaceSize=128m", "-J-Xss512k",
    "-d", output,
    ...sources,
  ];
}

async function failedResult(
  workspace: string,
  diagnostics: CompilationResult["diagnostics"],
  process: { timedOut: boolean; stdoutTruncated: boolean; stderrTruncated: boolean; durationMs: number },
): Promise<PersistentCompilationResult> {
  await removeWorkspace(workspace);
  return {
    compilation: {
      status: "failed",
      entryClass: "org.firstinspires.ftc.teamcode.SessionDiscovery",
      diagnostics: diagnostics.length ? diagnostics : [{ kind: "error", message: "Compilation failed" }],
      timedOut: process.timedOut,
      outputTruncated: process.stdoutTruncated || process.stderrTruncated,
      durationMs: process.durationMs,
    },
    dispose: async () => {},
  };
}

function parseKotlinDiagnostics(
  stderr: string,
  logicalPaths: Map<string, string>,
): CompilationResult["diagnostics"] {
  const diagnostics: CompilationResult["diagnostics"] = [];
  for (const line of stderr.split(/\r?\n/)) {
    const match = line.match(/^(.*\.(?:kt|java)):(\d+):(\d+): (error|warning): (.*)$/);
    if (match) {
      diagnostics.push({
        file: logicalPaths.get(match[1]) ?? match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        kind: match[4] as "error" | "warning",
        message: match[5],
      });
    } else if (/^(?:error|warning): /.test(line)) {
      const separator = line.indexOf(":");
      diagnostics.push({
        kind: line.slice(0, separator) as "error" | "warning",
        message: line.slice(separator + 1).trim(),
      });
    }
  }
  return diagnostics;
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

async function removeWorkspace(workspace: string): Promise<void> {
  await rm(workspace, { recursive: true, force: true, maxRetries: 2, retryDelay: 20 });
}
