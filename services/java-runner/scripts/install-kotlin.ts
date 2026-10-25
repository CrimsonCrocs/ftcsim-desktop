import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { KOTLIN_ARTIFACTS, KOTLIN_VERSION } from "../src/kotlin-toolchain";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const target = resolve(Bun.env.JAVA_RUNNER_KOTLIN_HOME ?? join(scriptDir, `../.runtime/kotlin-${KOTLIN_VERSION}`));
await mkdir(target, { recursive: true });

for (const artifact of KOTLIN_ARTIFACTS) {
  const destination = join(target, artifact.file);
  if (await hasChecksum(destination, artifact.sha256)) continue;
  const temporary = `${destination}.${process.pid}.tmp`;
  const response = await fetch(artifact.url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Could not download ${artifact.file}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== artifact.sha256) {
    throw new Error(`Checksum mismatch for ${artifact.file}`);
  }
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

console.log(`Kotlin ${KOTLIN_VERSION} compiler installed at ${target}`);

async function hasChecksum(path: string, expected: string): Promise<boolean> {
  try {
    const bytes = await readFile(path);
    return createHash("sha256").update(bytes).digest("hex") === expected;
  } catch {
    return false;
  }
}
