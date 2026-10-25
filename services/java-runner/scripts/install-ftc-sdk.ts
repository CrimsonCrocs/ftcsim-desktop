import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  FTC_SDK_ARTIFACTS,
  FTC_SDK_RESOLVED_DEPENDENCIES,
  FTC_SDK_VERSION,
  artifactAarPath,
  artifactClassesJarPath,
  defaultFtcSdkHome,
  dependencyJarPath,
  dependencySourcePath,
} from "../src/ftc-sdk-toolchain";

const target = resolve(Bun.env.JAVA_RUNNER_FTC_SDK_HOME ?? defaultFtcSdkHome());
await mkdir(target, { recursive: true, mode: 0o700 });
await mkdir(join(target, "dependencies"), { recursive: true, mode: 0o700 });

for (const entry of FTC_SDK_ARTIFACTS) {
  const aarPath = artifactAarPath(target, entry);
  if (!await hasChecksum(aarPath, entry.aarSha256)) {
    await downloadPinned(
      entry.url,
      aarPath,
      entry.aarSha256,
      `${entry.name} ${FTC_SDK_VERSION} AAR`,
    );
  }

  const classesJarPath = artifactClassesJarPath(target, entry);
  if (!await hasChecksum(classesJarPath, entry.classesJarSha256)) {
    const bytes = await extractArchiveEntry(aarPath, "classes.jar", entry.name);
    requireChecksum(bytes, entry.classesJarSha256, `${entry.name} classes.jar`);
    await atomicWrite(classesJarPath, bytes);
  }
}

for (const entry of FTC_SDK_RESOLVED_DEPENDENCIES) {
  const jarPath = dependencyJarPath(target, entry);
  if (entry.source.kind === "embedded") {
    const source = entry.source;
    if (!await hasChecksum(jarPath, entry.jarSha256)) {
      const sourceArtifact = FTC_SDK_ARTIFACTS.find(({ name }) => name === source.artifact);
      if (!sourceArtifact) throw new Error(`Unknown embedded dependency source ${source.artifact}`);
      const bytes = await extractArchiveEntry(
        artifactAarPath(target, sourceArtifact),
        source.path,
        entry.id,
      );
      requireChecksum(bytes, entry.jarSha256, `${entry.id} embedded JAR`);
      await atomicWrite(jarPath, bytes);
    }
    continue;
  }

  const sourcePath = dependencySourcePath(target, entry);
  if (!sourcePath) throw new Error(`Missing source path for ${entry.id}`);
  if (!await hasChecksum(sourcePath, entry.source.sha256)) {
    await downloadPinned(
      entry.source.url,
      sourcePath,
      entry.source.sha256,
      `${entry.id} ${entry.source.kind === "maven-aar" ? "AAR" : "JAR"}`,
    );
  }
  if (entry.source.kind === "maven-aar" && !await hasChecksum(jarPath, entry.jarSha256)) {
    const bytes = await extractArchiveEntry(sourcePath, "classes.jar", entry.id);
    requireChecksum(bytes, entry.jarSha256, `${entry.id} classes.jar`);
    await atomicWrite(jarPath, bytes);
  }
}

console.log(
  `FTC SDK ${FTC_SDK_VERSION} compile classpath installed at ${target} `
  + `(${FTC_SDK_ARTIFACTS.length} SDK artifacts, `
  + `${FTC_SDK_RESOLVED_DEPENDENCIES.length} pinned resolved dependencies)`,
);

async function downloadPinned(
  url: string,
  path: string,
  sha256: string,
  label: string,
): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Could not download ${label}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  requireChecksum(bytes, sha256, label);
  await atomicWrite(path, bytes);
}

async function extractArchiveEntry(
  archivePath: string,
  entryPath: string,
  label: string,
): Promise<Uint8Array> {
  const extractionDirectory = await mkdtemp(join(target, `.extract-${label}-`));
  try {
    await runProcess(["jar", "xf", archivePath, entryPath], extractionDirectory, label);
    return new Uint8Array(await readFile(join(extractionDirectory, entryPath)));
  } finally {
    await rm(extractionDirectory, { force: true, recursive: true });
  }
}

async function runProcess(argv: string[], cwd: string, label: string): Promise<void> {
  const subprocess = Bun.spawn(argv, {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `Could not process ${label}: ${stderr.trim() || stdout.trim() || `${argv[0]} exited ${exitCode}`}`,
    );
  }
}

async function atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
    await chmod(path, 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function hasChecksum(path: string, expected: string): Promise<boolean> {
  try {
    const bytes = await readFile(path);
    return createHash("sha256").update(bytes).digest("hex") === expected;
  } catch {
    return false;
  }
}

function requireChecksum(bytes: Uint8Array, expected: string, label: string): void {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${label}: expected ${expected}, received ${actual}`);
  }
}
