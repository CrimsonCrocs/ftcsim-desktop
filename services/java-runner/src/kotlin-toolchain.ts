import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KOTLIN_VERSION = "2.2.10";

export interface KotlinArtifact {
  file: string;
  sha256: string;
  url: string;
}

export const KOTLIN_ARTIFACTS: readonly KotlinArtifact[] = [
  artifact("kotlin-compiler-embeddable-2.2.10.jar", "79628fd5d64b4692a62f98962baab00e9076a37e2cffd6ace33cd0b7be7d1cdf", "org/jetbrains/kotlin/kotlin-compiler-embeddable/2.2.10"),
  artifact("kotlin-stdlib-2.2.10.jar", "9c67cc79efd6b9215b49d2a4308f5f3433537376c7c88e89bdd6729bd096e61a", "org/jetbrains/kotlin/kotlin-stdlib/2.2.10"),
  artifact("kotlin-script-runtime-2.2.10.jar", "c304a67dba6a61dde560e6310920bed746307c3854f6675c29ac29114731b6b0", "org/jetbrains/kotlin/kotlin-script-runtime/2.2.10"),
  artifact("kotlin-reflect-1.6.10.jar", "3277ac102ae17aad10a55abec75ff5696c8d109790396434b496e75087854203", "org/jetbrains/kotlin/kotlin-reflect/1.6.10"),
  artifact("kotlin-daemon-embeddable-2.2.10.jar", "b31573d418961fa080760fedcfc90d68ad67a85eafa245c73fe3d551476777ba", "org/jetbrains/kotlin/kotlin-daemon-embeddable/2.2.10"),
  artifact("kotlinx-coroutines-core-jvm-1.8.0.jar", "9860906a1937490bf5f3b06d2f0e10ef451e65b95b269f22daf68a3d1f5065c5", "org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/1.8.0"),
  artifact("annotations-13.0.jar", "ace2a10dc8e2d5fd34925ecac03e4988b2c0f851650c94b8cef49ba1bd111478", "org/jetbrains/annotations/13.0"),
] as const;

export interface KotlinToolchain {
  home: string;
  compilerClasspath: string;
  stdlibPath: string;
  annotationsPath: string;
  runtimeClasspath: string[];
}

export async function resolveKotlinToolchain(
  configuredHome = Bun.env.JAVA_RUNNER_KOTLIN_HOME,
): Promise<KotlinToolchain | undefined> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const home = resolve(configuredHome ?? join(moduleDir, "../.runtime/kotlin-2.2.10"));
  for (const artifact of KOTLIN_ARTIFACTS) {
    const path = join(home, artifact.file);
    let bytes: Uint8Array;
    try { bytes = await readFile(path); } catch { return undefined; }
    if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) return undefined;
  }
  const paths = KOTLIN_ARTIFACTS.map((entry) => join(home, entry.file));
  const stdlibPath = join(home, "kotlin-stdlib-2.2.10.jar");
  const annotationsPath = join(home, "annotations-13.0.jar");
  return {
    home,
    compilerClasspath: paths.join(delimiter),
    stdlibPath,
    annotationsPath,
    runtimeClasspath: [stdlibPath, annotationsPath],
  };
}

function artifact(file: string, sha256: string, directory: string): KotlinArtifact {
  return {
    file,
    sha256,
    url: `https://repo1.maven.org/maven2/${directory}/${file}`,
  };
}
