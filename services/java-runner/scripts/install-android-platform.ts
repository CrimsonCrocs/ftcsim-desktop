import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { unzipSync } from "fflate";

import {
  defaultAndroidJarPath,
  FTC_ANDROID_API_LEVEL,
  FTC_ANDROID_PLATFORM_ARCHIVE_SHA256,
  FTC_ANDROID_PLATFORM_ARCHIVE_URL,
  FTC_ANDROID_PLATFORM_JAR_SHA256,
  FTC_ANDROID_PLATFORM_PROPERTIES_SHA256,
} from "../src/ftc-sdk-toolchain";

const archiveRoot = "android-11";
const archiveJarPath = `${archiveRoot}/android.jar`;
const archivePropertiesPath = `${archiveRoot}/source.properties`;
const androidJarPath = resolve(
  Bun.env.JAVA_RUNNER_ANDROID_JAR ?? defaultAndroidJarPath(),
);
const platformDirectory = dirname(androidJarPath);
const propertiesPath = join(platformDirectory, "source.properties");

await mkdir(platformDirectory, { recursive: true, mode: 0o700 });

if (!await isInstalled()) {
  const response = await fetch(FTC_ANDROID_PLATFORM_ARCHIVE_URL, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Could not download Android SDK Platform ${FTC_ANDROID_API_LEVEL}: HTTP ${response.status}`);
  }
  const archive = new Uint8Array(await response.arrayBuffer());
  requireChecksum(
    archive,
    FTC_ANDROID_PLATFORM_ARCHIVE_SHA256,
    `Android SDK Platform ${FTC_ANDROID_API_LEVEL} archive`,
  );

  const extracted = unzipSync(archive, {
    filter: ({ name }) => name === archiveJarPath || name === archivePropertiesPath,
  });
  const androidJar = extracted[archiveJarPath];
  const sourceProperties = extracted[archivePropertiesPath];
  if (!androidJar || !sourceProperties) {
    throw new Error(
      `Android SDK Platform ${FTC_ANDROID_API_LEVEL} archive is missing its compiler files.`,
    );
  }
  requireChecksum(androidJar, FTC_ANDROID_PLATFORM_JAR_SHA256, "android.jar");
  requireChecksum(
    sourceProperties,
    FTC_ANDROID_PLATFORM_PROPERTIES_SHA256,
    "source.properties",
  );

  await atomicWrite(androidJarPath, androidJar);
  await atomicWrite(propertiesPath, sourceProperties);
}

console.log(`Android SDK Platform ${FTC_ANDROID_API_LEVEL} installed at ${platformDirectory}`);

async function isInstalled(): Promise<boolean> {
  return await hasChecksum(androidJarPath, FTC_ANDROID_PLATFORM_JAR_SHA256)
    && await hasChecksum(propertiesPath, FTC_ANDROID_PLATFORM_PROPERTIES_SHA256);
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
