import { createHash } from "node:crypto";
import { readFile, readdir } from 'node:fs/promises';
import { dirname, delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import type { ProcessExecutor } from './process-executor';
import { isolatedProcessEnvironment } from './java-compiler';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../runtime/java-library-adapters');
export const LIBRARY_ADAPTER_CLASSES = new Set([
  'com.acmerobotics.dashboard.FtcDashboard',
  'com.acmerobotics.roadrunner.ftc.Actions',
  'com.acmerobotics.roadrunner.ftc.FlightRecorder',
  'com.acmerobotics.roadrunner.simulator.LegacyLogFiles',
]);

const trustedAdapterHashes = new Map<string, string>();
export function isTrustedLibraryAdapter(path: string, bytes: Uint8Array): boolean {
  return trustedAdapterHashes.get(resolve(path)) === createHash('sha256').update(bytes).digest('hex');
}
export const LEGACY_LOG_ADAPTER = 'com.acmerobotics.roadrunner.simulator.LegacyLogFiles';
export const LEGACY_LOG_DESCRIPTOR = '(Lcom/acmerobotics/roadrunner/geometry/Pose2d;Lcom/acmerobotics/roadrunner/geometry/Pose2d;DLjava/util/List;Ljava/util/List;Ljava/util/List;Ljava/util/List;)V';
export function isRedirectedLegacyLog(reference: {owner: string; name: string; descriptor: string}): boolean {
  return reference.owner.endsWith('.util.LogFiles') && reference.name === 'record' && reference.descriptor === LEGACY_LOG_DESCRIPTOR;
}

/** Compile only adapters for libraries actually resolved by the user's unchanged Gradle build. */
export async function compileLibraryAdapters(input: {
  executor: ProcessExecutor;
  workspace: string;
  classesRoot: string;
  runtimeClasspath: string[];
}): Promise<void> {
  const groups = new Set<string>();
  for (const path of input.runtimeClasspath) {
    if (!path.endsWith('.jar')) continue;
    const bytes = await readFile(path);
    if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) continue;
    const classes = unzipSync(bytes, { filter: ({ name }) => [
      'com/acmerobotics/dashboard/FtcDashboard.class',
      'com/acmerobotics/roadrunner/ftc/Actions.class',
      'com/acmerobotics/roadrunner/util/NanoClock.class',
    ].includes(name) });
    if (classes['com/acmerobotics/roadrunner/util/NanoClock.class']) groups.add('roadrunner05');
    if (classes['com/acmerobotics/dashboard/FtcDashboard.class']) groups.add('dashboard');
    if (classes['com/acmerobotics/roadrunner/ftc/Actions.class']) { groups.add('dashboard'); groups.add('roadrunner'); }
  }
  if (!groups.size) return;
  async function sources(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    return (await Promise.all(entries.map(e => e.isDirectory() ? sources(resolve(root,e.name)) : Promise.resolve(e.name.endsWith('.java') ? [resolve(root,e.name)] : [])))).flat();
  }
  const files = (await Promise.all([...groups].map(group => sources(resolve(ROOT, group))))).flat().sort();
  const result = await input.executor.run({
    argv: ['javac', '--release', '8', '-proc:none', '-encoding', 'UTF-8', '-cp', input.runtimeClasspath.join(delimiter), '-d', input.classesRoot, ...files],
    cwd: input.workspace,
    env: isolatedProcessEnvironment(input.workspace, ''),
    timeoutMs: 20000, stdoutLimitBytes: 128*1024, stderrLimitBytes: 128*1024,
  });
  if (result.exitCode !== 0 || result.timedOut) throw new Error(`Pathing library adapter compilation failed: ${result.stderr}`);
  for (const source of files) {
    const relativeClass = source.slice(ROOT.length+1).split('/').slice(1).join('/').replace(/\.java$/u,'.class');
    const path = resolve(input.classesRoot, relativeClass);
    trustedAdapterHashes.set(path, createHash('sha256').update(await readFile(path)).digest('hex'));
  }
  // Eviction fails closed for a workspace that has outlived thousands of later builds.
  while (trustedAdapterHashes.size > 4096) trustedAdapterHashes.delete(trustedAdapterHashes.keys().next().value!);
}
