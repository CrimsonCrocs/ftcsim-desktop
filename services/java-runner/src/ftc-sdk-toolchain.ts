import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";

export const FTC_SDK_VERSION = "11.1.0";
export const FTC_ANDROID_API_LEVEL = 30;
export const FTC_ANDROID_PLATFORM_ARCHIVE_URL =
  "https://dl.google.com/android/repository/platform-30_r03.zip";
export const FTC_ANDROID_PLATFORM_ARCHIVE_SHA256 =
  "f3f5b75744dbf6ee6ed3e8174a71e513bfee502d0bc3463ea97e517bff68d84e";
export const FTC_ANDROID_PLATFORM_JAR_SHA256 =
  "96ccfdc84d15fad4e22d76cbb8ef38b150a4b56327957067875ca7e18113a424";
export const FTC_ANDROID_PLATFORM_PROPERTIES_SHA256 =
  "2c42e93d52e39aff37dca9deb4e26d16b552f4193a5b3dbc9dd7b6a2a4e3cf40";

export interface FtcSdkArtifact {
  name: "FtcCommon" | "Hardware" | "RobotCore" | "Vision";
  url: string;
  aarSha256: string;
  classesJarSha256: string;
}

export type FtcSdkDependencyDisposition =
  | "runtime-utility"
  | "compile-only-unsupported";

export type FtcSdkDependencySource =
  | {
      kind: "embedded";
      artifact: "RobotCore";
      path: string;
    }
  | {
      kind: "maven-aar" | "maven-jar";
      file: string;
      url: string;
      sha256: string;
    };

/**
 * A deliberately closed dependency graph for libraries Gradle exposes through
 * the official FTC 11.1 artifacts. No POM is evaluated and no transitive
 * dependency is resolved at build time.
 */
export interface FtcSdkResolvedDependency {
  id: string;
  outputFile: string;
  jarSha256: string;
  source: FtcSdkDependencySource;
  disposition: FtcSdkDependencyDisposition;
  packagePrefixes: readonly string[];
}

export interface UnsupportedResolvedLibraryPolicy {
  packagePrefix: string;
  code: "UNSUPPORTED_PLATFORM_API" | "UNSUPPORTED_RESOLVED_LIBRARY";
  label: string;
  reason: string;
}

const MAVEN_ROOT = "https://repo.maven.apache.org/maven2/org/firstinspires/ftc";

/**
 * The official FTC artifacts exposed to TeamCode at compile time. Both the
 * downloaded AAR and its extracted classes.jar are pinned so a damaged local
 * cache cannot silently change the compiler API surface.
 */
export const FTC_SDK_ARTIFACTS: readonly FtcSdkArtifact[] = [
  artifact(
    "FtcCommon",
    "90ea09fe7c00595cc3b7686fe83d0b021a770d15dc284ab203a8b04908f2294f",
    "0917b9447850769f54da33315e1b02b0151f1dd1f993b484feb28b22e9caa4cc",
  ),
  artifact(
    "Hardware",
    "6582f094ca0d5dfe331ba836922c595e67373981cb746efb507418ca28e1c7d7",
    "4568b3dda3dd53d95be5083ef265cd4583fba3293ae5d30d611b32a433df7283",
  ),
  artifact(
    "RobotCore",
    "1e2af88a29dd784fcf85fbc7fc76aad8cb19dd47cfa5be796efeffb38c591343",
    "57ebbeba086a565b8644999df35a4c4052d85972547e20006c9c53595b882c51",
  ),
  artifact(
    "Vision",
    "9506b74e6b00ae1feb796af5f5697192cf6d69341efa78c6f082eabb00c9885d",
    "82f2bafc435f89580c682d97d0a21ec067b8fb6a3dad4962aab1a90135dc79f8",
  ),
] as const;

const MAVEN_CENTRAL = "https://repo.maven.apache.org/maven2";

export const FTC_SDK_RESOLVED_DEPENDENCIES: readonly FtcSdkResolvedDependency[] = [
  {
    id: "gson",
    outputFile: "gson-2.8.0.jar",
    jarSha256: "22bea48ff098e710591dace19b8599facc25da5941cb16fa20482168f5edf6c2",
    source: { kind: "embedded", artifact: "RobotCore", path: "libs/gson-2.8.0.jar" },
    disposition: "runtime-utility",
    packagePrefixes: ["com.google.gson."],
  },
  {
    id: "gson-extras",
    outputFile: "gson-extras-0.2.1.jar",
    jarSha256: "949d26f519f601d25656bffa1257be56631aec34c29cff5c781ad167e98f7789",
    source: { kind: "embedded", artifact: "RobotCore", path: "libs/gson-extras-0.2.1.jar" },
    disposition: "runtime-utility",
    packagePrefixes: ["com.google.gson."],
  },
  {
    id: "slf4j-api",
    outputFile: "slf4j-api-1.7.26.jar",
    jarSha256: "185ff5523811ba0a49734289bce227cd93afbda80396f2025c5a55bad227514c",
    source: { kind: "embedded", artifact: "RobotCore", path: "libs/slf4j-api-1.7.26.jar" },
    disposition: "compile-only-unsupported",
    packagePrefixes: ["org.slf4j."],
  },
  {
    id: "slf4j-handroid",
    outputFile: "slf4j-handroid-1.7.27.jar",
    jarSha256: "e4bb6a5ff50abb8d5299659c4f212875f356962402ae90d35bb81956e98844ed",
    source: { kind: "embedded", artifact: "RobotCore", path: "libs/slf4j-handroid-1.7.27.jar" },
    disposition: "compile-only-unsupported",
    packagePrefixes: ["org.slf4j.impl."],
  },
  {
    id: "threetenabp",
    outputFile: "threetenabp-1.3.1.jar",
    jarSha256: "c47d0c2cbf7254fc99cd2f5961b86d93ca2ad0d85f1de46588e5ebe25c505973",
    source: {
      kind: "maven-aar",
      file: "threetenabp-1.3.1.aar",
      url: `${MAVEN_CENTRAL}/com/jakewharton/threetenabp/threetenabp/1.3.1/threetenabp-1.3.1.aar`,
      sha256: "2e355f52c21e7e3f0eee662189b5fca249ca568dc098f386f1896e7c74c132c5",
    },
    disposition: "compile-only-unsupported",
    packagePrefixes: ["com.jakewharton.threetenabp."],
  },
  {
    id: "threetenbp",
    outputFile: "threetenbp-1.5.1-no-tzdb.jar",
    jarSha256: "2bf93650f997044f2995680319300a1f9782176b792bf09f8cbad3b845239f9f",
    source: {
      kind: "maven-jar",
      file: "threetenbp-1.5.1-no-tzdb.jar",
      url: `${MAVEN_CENTRAL}/org/threeten/threetenbp/1.5.1/threetenbp-1.5.1-no-tzdb.jar`,
      sha256: "2bf93650f997044f2995680319300a1f9782176b792bf09f8cbad3b845239f9f",
    },
    disposition: "compile-only-unsupported",
    packagePrefixes: ["org.threeten.bp."],
  },
  {
    id: "easyopencv",
    outputFile: "easyopencv-1.7.3.jar",
    jarSha256: "5298e9e1a5b56670695311723cdf125753482ba87438386e9825dbf48c0cb4ba",
    source: {
      kind: "maven-aar",
      file: "easyopencv-1.7.3.aar",
      url: `${MAVEN_CENTRAL}/org/openftc/easyopencv/1.7.3/easyopencv-1.7.3.aar`,
      sha256: "e4a434b55e0d6867194e06686bb3717b3d4e64c29369b1450aec3e8d970a0dc2",
    },
    disposition: "compile-only-unsupported",
    packagePrefixes: ["org.openftc.easyopencv."],
  },
  {
    id: "apriltag",
    outputFile: "apriltag-2.1.0.jar",
    jarSha256: "6471fafa4f46fe27a56c818f3a7b7769b0479f8f3afd97d4e809a373054687d1",
    source: {
      kind: "maven-aar",
      file: "apriltag-2.1.0.aar",
      url: `${MAVEN_CENTRAL}/org/openftc/apriltag/2.1.0/apriltag-2.1.0.aar`,
      sha256: "7db88efef0d59b726df45440d7a61c0f52158c9f9f1b92a4e570e3f8c715437e",
    },
    disposition: "compile-only-unsupported",
    packagePrefixes: ["org.openftc.apriltag."],
  },
  {
    id: "opencv",
    outputFile: "opencv-repackaged-bundled-dylibs-4.10.0-A.jar",
    jarSha256: "882b34cf4de9fc5a56615d0ee87d462d7575c4662be13da7d8b113778c15811d",
    source: {
      kind: "maven-aar",
      file: "opencv-repackaged-bundled-dylibs-4.10.0-A.aar",
      url: `${MAVEN_CENTRAL}/org/openftc/opencv-repackaged-bundled-dylibs/4.10.0-A/opencv-repackaged-bundled-dylibs-4.10.0-A.aar`,
      sha256: "81e8b70373cf56b6d3683fd4c56e4d9e0c75e6ed60c33a3053f1d54393af944f",
    },
    disposition: "compile-only-unsupported",
    packagePrefixes: ["org.opencv."],
  },
] as const;

export const UNSUPPORTED_RESOLVED_LIBRARY_POLICIES: readonly UnsupportedResolvedLibraryPolicy[] = [
  {
    packagePrefix: "android.",
    code: "UNSUPPORTED_PLATFORM_API",
    label: "Android platform",
    reason: "Android framework services are compile-time stubs and do not exist in the simulator JVM",
  },
  {
    packagePrefix: "androidx.",
    code: "UNSUPPORTED_PLATFORM_API",
    label: "AndroidX",
    reason: "AndroidX is not an allowed runner dependency",
  },
  {
    packagePrefix: "dalvik.",
    code: "UNSUPPORTED_PLATFORM_API",
    label: "Dalvik runtime",
    reason: "Dalvik classes do not exist in the simulator JVM",
  },
  {
    packagePrefix: "org.apache.http.",
    code: "UNSUPPORTED_PLATFORM_API",
    label: "Android Apache HTTP",
    reason: "networking is unavailable and Android's legacy HTTP classes do not exist in the simulator JVM",
  },
  {
    packagePrefix: "org.json.",
    code: "UNSUPPORTED_PLATFORM_API",
    label: "Android JSON",
    reason: "the Android implementation does not exist in the simulator JVM; use the pinned Gson utility",
  },
  {
    packagePrefix: "org.xmlpull.",
    code: "UNSUPPORTED_PLATFORM_API",
    label: "Android XML pull parser",
    reason: "the Android implementation does not exist in the simulator JVM",
  },
  {
    packagePrefix: "org.slf4j.",
    code: "UNSUPPORTED_RESOLVED_LIBRARY",
    label: "SLF4J Android logging",
    reason: "the FTC artifact's Handroid backend requires android.util.Log",
  },
  {
    packagePrefix: "com.jakewharton.threetenabp.",
    code: "UNSUPPORTED_RESOLVED_LIBRARY",
    label: "ThreeTenABP Android time",
    reason: "its initialization and timezone data are Android asset-backed",
  },
  {
    packagePrefix: "org.threeten.bp.",
    code: "UNSUPPORTED_RESOLVED_LIBRARY",
    label: "ThreeTenABP Android time",
    reason: "the FTC-resolved backport depends on Android timezone initialization",
  },
  {
    packagePrefix: "org.openftc.easyopencv.",
    code: "UNSUPPORTED_RESOLVED_LIBRARY",
    label: "EasyOpenCV",
    reason: "camera execution requires Android services and native libraries",
  },
  {
    packagePrefix: "org.openftc.apriltag.",
    code: "UNSUPPORTED_RESOLVED_LIBRARY",
    label: "OpenFTC AprilTag",
    reason: "AprilTag execution requires Android native libraries",
  },
  {
    packagePrefix: "org.opencv.",
    code: "UNSUPPORTED_RESOLVED_LIBRARY",
    label: "OpenCV Android",
    reason: "OpenCV execution requires Android native libraries",
  },
] as const;

export interface FtcSdkToolchain {
  home: string;
  version: typeof FTC_SDK_VERSION;
  officialJarPaths: string[];
  compileDependencyJarPaths: string[];
  runtimeDependencyJarPaths: string[];
  androidJarPath: string;
  kotlinAndroidJarPath: string;
  compileClasspathHash: string;
}

export interface FtcSdkToolchainOptions {
  home?: string;
  androidJarPath?: string;
}

export class FtcSdkToolchainError extends Error {
  constructor(
    readonly code: "FTC_SDK_NOT_INSTALLED" | "FTC_SDK_CHECKSUM_MISMATCH" | "ANDROID_API_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "FtcSdkToolchainError";
  }
}

const resolutionCache = new Map<string, Promise<FtcSdkToolchain>>();
const ANDROID_JDK_FILTER_VERSION = 1;
const ANDROID_JDK_ROOTS = [
  "java",
  "javax",
  "jdk",
  "sun",
  join("org", "ietf", "jgss"),
  join("org", "omg"),
  join("org", "w3c"),
  join("org", "xml", "sax"),
] as const;

export function defaultFtcSdkHome(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(join(moduleDirectory, `../.runtime/ftc-sdk-${FTC_SDK_VERSION}`));
}

export function defaultAndroidSdkHome(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(join(moduleDirectory, "../.runtime/android-sdk"));
}

export function defaultAndroidJarPath(): string {
  return join(
    defaultAndroidSdkHome(),
    "platforms",
    `android-${FTC_ANDROID_API_LEVEL}`,
    "android.jar",
  );
}

export function artifactAarPath(home: string, entry: FtcSdkArtifact): string {
  return join(home, `${entry.name}-${FTC_SDK_VERSION}.aar`);
}

export function artifactClassesJarPath(home: string, entry: FtcSdkArtifact): string {
  return join(home, `${entry.name}-${FTC_SDK_VERSION}.jar`);
}

export function dependencyJarPath(home: string, entry: FtcSdkResolvedDependency): string {
  return join(home, "dependencies", entry.outputFile);
}

export function dependencySourcePath(
  home: string,
  entry: FtcSdkResolvedDependency,
): string | undefined {
  return entry.source.kind === "embedded"
    ? undefined
    : join(home, "dependencies", entry.source.file);
}

export async function resolveFtcSdkToolchain(
  options: FtcSdkToolchainOptions = {},
): Promise<FtcSdkToolchain | undefined> {
  try {
    return await requireFtcSdkToolchain(options);
  } catch (error) {
    if (error instanceof FtcSdkToolchainError) return undefined;
    throw error;
  }
}

export function requireFtcSdkToolchain(
  options: FtcSdkToolchainOptions = {},
): Promise<FtcSdkToolchain> {
  const home = resolve(options.home ?? Bun.env.JAVA_RUNNER_FTC_SDK_HOME ?? defaultFtcSdkHome());
  const configuredAndroidJar = options.androidJarPath ?? Bun.env.JAVA_RUNNER_ANDROID_JAR;
  const cacheKey = JSON.stringify([
    home,
    configuredAndroidJar ?? "",
    Bun.env.ANDROID_HOME ?? "",
    Bun.env.ANDROID_SDK_ROOT ?? "",
  ]);
  const cached = resolutionCache.get(cacheKey);
  if (cached) return cached;

  const resolution = inspectToolchain(home, configuredAndroidJar).catch((error) => {
    resolutionCache.delete(cacheKey);
    throw error;
  });
  resolutionCache.set(cacheKey, resolution);
  return resolution;
}

async function inspectToolchain(
  home: string,
  configuredAndroidJar: string | undefined,
): Promise<FtcSdkToolchain> {
  const officialJarPaths: string[] = [];
  const compileDependencyJarPaths: string[] = [];
  const runtimeDependencyJarPaths: string[] = [];
  const classpathHash = createHash("sha256").update(`FTC SDK ${FTC_SDK_VERSION}\0`);
  for (const entry of FTC_SDK_ARTIFACTS) {
    const aarPath = artifactAarPath(home, entry);
    const classesJarPath = artifactClassesJarPath(home, entry);
    await requirePinnedFile(aarPath, entry.aarSha256, entry.name, "AAR");
    await requirePinnedFile(
      classesJarPath,
      entry.classesJarSha256,
      entry.name,
      "classes.jar",
    );
    officialJarPaths.push(classesJarPath);
    classpathHash.update(`${entry.name}\0${entry.classesJarSha256}\0`);
  }

  for (const entry of FTC_SDK_RESOLVED_DEPENDENCIES) {
    const sourcePath = dependencySourcePath(home, entry);
    if (sourcePath && sourcePath !== dependencyJarPath(home, entry)) {
      await requirePinnedFile(
        sourcePath,
        entry.source.kind === "embedded" ? entry.jarSha256 : entry.source.sha256,
        entry.id,
        entry.source.kind === "maven-aar" ? "AAR" : "source JAR",
      );
    }
    const jarPath = dependencyJarPath(home, entry);
    await requirePinnedFile(jarPath, entry.jarSha256, entry.id, "resolved JAR");
    compileDependencyJarPaths.push(jarPath);
    if (entry.disposition === "runtime-utility") runtimeDependencyJarPaths.push(jarPath);
    classpathHash.update(
      `dependency\0${entry.id}\0${entry.jarSha256}\0${entry.disposition}\0`,
    );
  }

  const androidJarPath = await resolveAndroidJar(configuredAndroidJar);
  const androidBytes = await readFile(androidJarPath);
  if (!isZipFile(androidBytes)) {
    throw new FtcSdkToolchainError(
      "ANDROID_API_NOT_FOUND",
      `${androidJarPath} is not a readable Android API ${FTC_ANDROID_API_LEVEL} JAR`,
    );
  }
  classpathHash.update(
    `android-${FTC_ANDROID_API_LEVEL}\0${createHash("sha256").update(androidBytes).digest("hex")}\0`,
  );
  const kotlinAndroidJarPath = await ensureKotlinAndroidJar(
    home,
    androidJarPath,
    createHash("sha256").update(androidBytes).digest("hex"),
  );
  const kotlinAndroidBytes = await readFile(kotlinAndroidJarPath);
  classpathHash.update(
    `kotlin-android-${FTC_ANDROID_API_LEVEL}-without-jdk\0`
    + `${createHash("sha256").update(kotlinAndroidBytes).digest("hex")}\0`,
  );

  return {
    home,
    version: FTC_SDK_VERSION,
    officialJarPaths,
    compileDependencyJarPaths,
    runtimeDependencyJarPaths,
    androidJarPath,
    kotlinAndroidJarPath,
    compileClasspathHash: classpathHash.digest("hex"),
  };
}

async function requirePinnedFile(
  path: string,
  expectedSha256: string,
  artifactName: string,
  kind: string,
): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch {
    throw new FtcSdkToolchainError(
      "FTC_SDK_NOT_INSTALLED",
      `FTC SDK ${FTC_SDK_VERSION} ${artifactName} ${kind} is missing. Run \`bun run runner:install\`.`,
    );
  }
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new FtcSdkToolchainError(
      "FTC_SDK_CHECKSUM_MISMATCH",
      `FTC SDK ${FTC_SDK_VERSION} ${artifactName} ${kind} failed checksum verification. Run \`bun run runner:install\` to repair it.`,
    );
  }
}

async function resolveAndroidJar(configuredPath: string | undefined): Promise<string> {
  const candidates = configuredPath
    ? [resolve(configuredPath)]
    : androidJarCandidates();
  for (const candidate of candidates) {
    try {
      const canonical = await realpath(candidate);
      const details = await stat(canonical);
      if (details.isFile()
          && basename(canonical) === "android.jar"
          && await isExpectedAndroidPlatform(canonical)) {
        return canonical;
      }
    } catch {
      // Continue through the fixed, local candidate list.
    }
  }
  const configuredMessage = configuredPath
    ? `JAVA_RUNNER_ANDROID_JAR points to ${resolve(configuredPath)}, but it is not a verifiable Android SDK Platform ${FTC_ANDROID_API_LEVEL} android.jar.`
    : `Install Android SDK Platform ${FTC_ANDROID_API_LEVEL}, or set JAVA_RUNNER_ANDROID_JAR to that platform's android.jar.`;
  throw new FtcSdkToolchainError("ANDROID_API_NOT_FOUND", configuredMessage);
}

/**
 * Android's API stub contains its own java.* and javax.* classes. Kotlin treats
 * explicit classpath entries as higher priority than `-Xjdk-release=8`, which
 * otherwise leaks APIs such as Java 9's List.of(). Keep Android types while
 * removing only namespaces supplied by the Java 8 release surface.
 */
async function ensureKotlinAndroidJar(
  home: string,
  androidJarPath: string,
  sourceSha256: string,
): Promise<string> {
  const directory = join(home, "android-api");
  const output = join(
    directory,
    `android-${FTC_ANDROID_API_LEVEL}-without-jdk-v${ANDROID_JDK_FILTER_VERSION}-${sourceSha256.slice(0, 16)}.jar`,
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (await isFilteredAndroidJar(output)) return output;

  const workspace = await mkdtemp(join(directory, ".filter-"));
  const temporaryOutput = `${output}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await runJar(["xf", androidJarPath], workspace, "extract Android API stubs");
    await Promise.all(ANDROID_JDK_ROOTS.map((root) => rm(join(workspace, root), {
      force: true,
      recursive: true,
    })));
    await runJar(
      ["--create", "--file", temporaryOutput, "--no-manifest", "-C", workspace, "."],
      directory,
      "create the Kotlin Android API stub JAR",
    );
    if (!await isFilteredAndroidJar(temporaryOutput)) {
      throw new Error("filtered archive still contains a Java platform namespace");
    }
    await rename(temporaryOutput, output);
    return output;
  } catch (error) {
    throw new FtcSdkToolchainError(
      "ANDROID_API_NOT_FOUND",
      `Could not prepare Android API ${FTC_ANDROID_API_LEVEL} for Kotlin Java 8 compilation: ${(error as Error).message}`,
    );
  } finally {
    await Promise.all([
      rm(workspace, { force: true, recursive: true }),
      rm(temporaryOutput, { force: true }),
    ]);
  }
}

async function isFilteredAndroidJar(path: string): Promise<boolean> {
  try {
    const bytes = await readFile(path);
    if (!isZipFile(bytes)) return false;
    let containsJavaPlatformNamespace = false;
    unzipSync(bytes, {
      filter: ({ name }) => {
        if (ANDROID_JDK_ROOTS.some((root) => {
          const normalizedRoot = root.replaceAll("\\", "/");
          return name === normalizedRoot || name.startsWith(`${normalizedRoot}/`);
        })) containsJavaPlatformNamespace = true;
        // Central-directory inspection is enough; do not inflate 20 MB of API
        // stubs just to validate the filtered cache.
        return false;
      },
    });
    return !containsJavaPlatformNamespace;
  } catch {
    return false;
  }
}

async function runJar(argv: string[], cwd: string, operation: string): Promise<string> {
  // `jar` inherits the host JVM's ergonomically selected maximum heap. On a
  // memory-constrained development machine that can make this small archive
  // operation a target for the OS OOM killer before the runner opens its port.
  const subprocess = Bun.spawn(["jar", "-J-Xmx384m", ...argv], {
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
    throw new Error(`${operation} failed: ${stderr.trim() || stdout.trim() || `jar exited ${exitCode}`}`);
  }
  return stdout;
}

async function isExpectedAndroidPlatform(androidJarPath: string): Promise<boolean> {
  try {
    const properties = await readFile(join(dirname(androidJarPath), "source.properties"), "utf8");
    const apiLevel = /^AndroidVersion\.ApiLevel=(\d+)$/mu.exec(properties)?.[1];
    return Number(apiLevel) === FTC_ANDROID_API_LEVEL;
  } catch {
    return false;
  }
}

function androidJarCandidates(): string[] {
  const suffix = join("platforms", `android-${FTC_ANDROID_API_LEVEL}`, "android.jar");
  const roots = [
    Bun.env.ANDROID_HOME,
    Bun.env.ANDROID_SDK_ROOT,
    defaultAndroidSdkHome(),
    join(homedir(), "Library", "Android", "sdk"),
    join(homedir(), "Android", "Sdk"),
    Bun.env.LOCALAPPDATA ? join(Bun.env.LOCALAPPDATA, "Android", "Sdk") : undefined,
  ];
  return [...new Set(roots.filter((root): root is string => Boolean(root)).map((root) => (
    resolve(root, suffix)
  )))];
}

function isZipFile(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && ((bytes[2] === 0x03 && bytes[3] === 0x04)
      || (bytes[2] === 0x05 && bytes[3] === 0x06)
      || (bytes[2] === 0x07 && bytes[3] === 0x08));
}

function artifact(
  name: FtcSdkArtifact["name"],
  aarSha256: string,
  classesJarSha256: string,
): FtcSdkArtifact {
  return {
    name,
    url: `${MAVEN_ROOT}/${name}/${FTC_SDK_VERSION}/${name}-${FTC_SDK_VERSION}.aar`,
    aarSha256,
    classesJarSha256,
  };
}
