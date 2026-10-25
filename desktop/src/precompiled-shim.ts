import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { ProcessRequest, ProcessResult } from "../../services/java-runner/src/process-executor";

export const SHIM_OPTIONS = ["--release", "8", "-g", "-proc:none", "-Xlint:all", "-encoding", "UTF-8"];
export type ShimManifest = { version: 1; inputDigest: string; classes: Array<{ path: string; sha256: string }> };
export const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");

export async function shimInputDigest(root: string, paths: string[]): Promise<string> {
  const hash = createHash("sha256").update(JSON.stringify(SHIM_OPTIONS));
  const entries = paths.map(path => ({ path, name: relative(root, path) })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith("../") || entry.name.startsWith("/") || !entry.name.endsWith(".java")) throw new Error("Invalid shim source path");
    hash.update("\0").update(entry.name).update("\0").update(await readFile(entry.path));
  }
  return hash.digest("hex");
}

/** Reuse only the exact, independently compiled shim shipped with this app. */
export async function usePrecompiledShim(request: ProcessRequest, resourceRoot: string): Promise<ProcessResult | undefined> {
  const sourceRoot = resolve(resourceRoot, "runtime/java-sdk-shim/src/main/java");
  const cache = resolve(resourceRoot, "desktop/precompiled-shim");
  const sources: string[] = [], options: string[] = [];
  let output: string | undefined, classpath: string | undefined;
  const args = request.argv.slice(1);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg.startsWith("-J")) continue; // The warm compiler also strips JVM-only flags.
    if (arg === "-d") output = args[++index];
    else if (arg === "-classpath") classpath = args[++index];
    else if (arg.endsWith(".java") && !arg.startsWith("-")) sources.push(resolve(request.cwd, arg));
    else options.push(arg);
  }
  if (!sources.length || !output || !classpath || JSON.stringify(options) !== JSON.stringify(SHIM_OPTIONS)
      || sources.some(path => !path.startsWith(sourceRoot + "/"))) return;
  let manifest: ShimManifest;
  let compiled: Array<{ path: string; bytes: Buffer }>;
  try {
    if ((await readdir(resolve(request.cwd, classpath))).length) return;
    manifest = JSON.parse(await readFile(resolve(cache, "manifest.json"), "utf8")) as ShimManifest;
    if (manifest.version !== 1 || !Array.isArray(manifest.classes) || !manifest.classes.length
        || manifest.inputDigest !== await shimInputDigest(sourceRoot, sources)) return;
    compiled = await Promise.all(manifest.classes.map(async entry => {
      if (!/^(?:[\w$]+\/)*[\w$]+\.class$/.test(entry.path)) throw new Error("Invalid class path");
      const bytes = await readFile(resolve(cache, "classes", entry.path));
      if (sha256(bytes) !== entry.sha256) throw new Error("Invalid precompiled shim");
      return { path: entry.path, bytes };
    }));
  } catch { return; } // Missing, modified, or corrupt inputs always go through javac.
  if (request.signal?.aborted) throw new Error("Operation cancelled");
  const destination = resolve(request.cwd, output);
  await Promise.all(compiled.map(async entry => {
    const target = resolve(destination, entry.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, entry.bytes);
  }));
  return { exitCode: 0, stdout: "", stderr: "", durationMs: 0, timedOut: false, stdoutTruncated: false, stderrTruncated: false };
}
