import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SHIM_OPTIONS, sha256, shimInputDigest, type ShimManifest } from "../src/precompiled-shim";

export async function filesUnder(directory: string, suffix: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesUnder(resolve(directory, entry.name), suffix)
    : Promise.resolve(entry.name.endsWith(suffix) ? [resolve(directory, entry.name)] : [])))).flat().sort();
}

export async function writeShimManifest(sourceRoot: string, output: string): Promise<void> {
  const manifest: ShimManifest = { version: 1, inputDigest: await shimInputDigest(sourceRoot, await filesUnder(sourceRoot, ".java")),
    classes: await Promise.all((await filesUnder(resolve(output, "classes"), ".class")).map(async path => ({
      path: path.slice(resolve(output, "classes").length + 1), sha256: sha256(await readFile(path)),
    }))) };
  if (!manifest.classes.length) throw new Error("The precompiled shim is empty");
  await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest));
}

export async function precompileShim(javaHome: string, sourceRoot: string, output: string): Promise<void> {
  await rm(output, { recursive: true, force: true });
  await mkdir(resolve(output, "classes"), { recursive: true });
  await mkdir(resolve(output, "empty"), { recursive: true });
  const result = spawnSync(resolve(javaHome, "bin/javac"), [...SHIM_OPTIONS, "-classpath", resolve(output, "empty"),
    "-d", resolve(output, "classes"), ...await filesUnder(sourceRoot, ".java")], { encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) throw new Error(`SDK shim compilation failed: ${result.error?.message ?? result.stderr}`);
  await writeShimManifest(sourceRoot, output);
  await rm(resolve(output, "empty"), { recursive: true });
}
