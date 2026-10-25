import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const LIBRARY_DIRECTORY_ENV = "JAVA_RUNNER_ARTIFACT_LIBRARY_DIR";

/** Catalog derived from trusted default Java and Kotlin runtime artifact fixtures. */
export const SHARED_ARTIFACT_LIBRARY_CATALOG = Object.freeze({
"01b9d1631e33a24cb5b0530cfe56370d331c1eaf118f0d3a7807277f99a63d17": { name: "051-01b9d1631e33a24cb5b0530cfe56370d331c1eaf118f0d3a7807277f99a63d17.jar", sizeBytes: 33350 },
  "041d65e8566445b97a2ae741227ce05ab6783c783a83e6fb173d8abc9eabd55b": { name: "059-041d65e8566445b97a2ae741227ce05ab6783c783a83e6fb173d8abc9eabd55b.jar", sizeBytes: 7661 },
  "057ab486abf1ed01123d77e79901376ad57001aa7903cca808e3f583e794ed35": { name: "023-lifecycle-livedata-2.0.0-api.jar", sizeBytes: 19899 },
  "06c7fbae824e7df4f2772d4e15016a3393f81cf15094fbf20111669bd724f2aa": { name: "035-06c7fbae824e7df4f2772d4e15016a3393f81cf15094fbf20111669bd724f2aa.jar", sizeBytes: 162565 },
  "0abd3506a9af49752d638c9b5b7eee8a247d43831be7e5d5c62c85848fd8445e": { name: "044-0abd3506a9af49752d638c9b5b7eee8a247d43831be7e5d5c62c85848fd8445e.jar", sizeBytes: 175976 },
  "13522a68c7a8a1acc1761e4f22d2647f510bd8a91f0694c1bbe73782c745c584": { name: "049-13522a68c7a8a1acc1761e4f22d2647f510bd8a91f0694c1bbe73782c745c584.jar", sizeBytes: 13164 },
  "14f7429cff9f2f50421a36b237a1de35d8a2c8deffcbe1e0163c6e51a2defe56": { name: "047-14f7429cff9f2f50421a36b237a1de35d8a2c8deffcbe1e0163c6e51a2defe56.jar", sizeBytes: 55298 },
  "17fd85d4311dc98cc1c81e2832f83f5d91400077ca8d206d6d6584391a6c3958": { name: "040-17fd85d4311dc98cc1c81e2832f83f5d91400077ca8d206d6d6584391a6c3958.jar", sizeBytes: 129870 },
  "1f75b3cb79621362c3b9adba7d3f98eb81ccec3c9e0927bedbb97575c5537751": { name: "048-1f75b3cb79621362c3b9adba7d3f98eb81ccec3c9e0927bedbb97575c5537751.jar", sizeBytes: 35177 },
  "23ab2138b5cce78bf6e93f941197ec150eba39c8ab143b1164ecbbf796157ac6": { name: "055-23ab2138b5cce78bf6e93f941197ec150eba39c8ab143b1164ecbbf796157ac6.jar", sizeBytes: 31906 },
  "26f79536ce15df4079f1d9ee06fe82a758462f78cf4d2e16411c1d712c267c98": { name: "030-threetenabp-1.3.1-api.jar", sizeBytes: 3879 },
  "2b4ee0b3f947a2605babbbf9f6a334db3bcec4a72f811a097ef4fbcd72eb0ce7": { name: "046-2b4ee0b3f947a2605babbbf9f6a334db3bcec4a72f811a097ef4fbcd72eb0ce7.jar", sizeBytes: 31413 },
  "2bf93650f997044f2995680319300a1f9782176b792bf09f8cbad3b845239f9f": { name: "031-threetenbp-1.5.1-no-tzdb.jar", sizeBytes: 456270 },
  "314f13628fe01ba4b0d4f43959f78ac4fb153859325cc5ad5dcca5ed9bf7d6bb": { name: "050-314f13628fe01ba4b0d4f43959f78ac4fb153859325cc5ad5dcca5ed9bf7d6bb.jar", sizeBytes: 34311 },
  "319f904d5ee4b9fa9d4f0755fcc8549a0dd9a576510648e3e31afe10c2cf8fc0": { name: "052-319f904d5ee4b9fa9d4f0755fcc8549a0dd9a576510648e3e31afe10c2cf8fc0.jar", sizeBytes: 33627 },
  "34df06a313c4c5d7d7bddb375d3b1eef7ad1a068654cf5e58381fb165c628504": { name: "033-opencv-repackaged-bundled-dylibs-4.10.0-A-api.jar", sizeBytes: 1183470 },
  "38e44566cb6ace7d0f0b3ed51e209e79e096764417d8c083848b22456c03dad0": { name: "018-lifecycle-runtime-2.1.0-api.jar", sizeBytes: 18552 },
  "40312e65a88d9d2550d9a909680870d4523208c6ebc4a8be13226bc20bda1a77": { name: "057-40312e65a88d9d2550d9a909680870d4523208c6ebc4a8be13226bc20bda1a77.jar", sizeBytes: 9126 },
  "40aeef38a40afe1bc24e87aa1821c53b80132f0d2c0633836f898640312a976d": { name: "004-OnBotJava-11.1.0-api.jar", sizeBytes: 6329590 },
  "410f85bd89ba21b02dd984671cf8ef1491bc51f7a6e060aa1b40143a3a1bb3a1": { name: "034-apriltag-2.1.0-api.jar", sizeBytes: 118864 },
  "41afedcf53756d2b0c05cc3479263a2d00bb981e1a4691be8649855919a199d1": { name: "028-interpolator-1.0.0-api.jar", sizeBytes: 10888 },
  "4733945987ee0a840fafc34080b135259e01678412e07212b23f706334290294": { name: "043-r8-8.5.35.jar", sizeBytes: 16745967 },
  "4a571a2b719bb7e0b884c340985a4c9cd511df38f13cbaab56eb312e25adf55c": { name: "019-versionedparcelable-1.1.0-api.jar", sizeBytes: 70999 },
  "4b278b784d0718a33c677f18e9ff50b044ec0329a2e1d5d9f93a6d8a8f6fc767": { name: "060-4b278b784d0718a33c677f18e9ff50b044ec0329a2e1d5d9f93a6d8a8f6fc767.jar", sizeBytes: 10245 },
  "50a4454f41fc0e23f8c729710eeb0bf48d427fc1bc0c131396ed624140952785": { name: "061-50a4454f41fc0e23f8c729710eeb0bf48d427fc1bc0c131396ed624140952785.jar", sizeBytes: 8645 },
  "5298e9e1a5b56670695311723cdf125753482ba87438386e9825dbf48c0cb4ba": { name: "063-5298e9e1a5b56670695311723cdf125753482ba87438386e9825dbf48c0cb4ba.jar", sizeBytes: 120117 },
  "55ea674a8e45a0a524fd46425a33366579e9d56264edba695d13698c4629bad9": { name: "021-lifecycle-viewmodel-2.1.0-api.jar", sizeBytes: 16924 },
  "577358c9c446cb558bc0b9080415dda07486aead88d652b80e1c9a99d158904d": { name: "022-savedstate-1.0.0-api.jar", sizeBytes: 18633 },
  "5c495b3cd79eac9c62dc5c6a18f4086802aa033af39866fa636ecebc81943dc4": { name: "041-base45-0.0.3.jar", sizeBytes: 6191 },
  "5dbaf9b6e37571a4eaa6b345292ccf98626c770a7548b434d825e2f6d99c5f7e": { name: "009-drawerlayout-1.0.0-api.jar", sizeBytes: 72025 },
  "6042423d03ccab1dfb2114015c4941c0809392f2e75142ac966b8b4d81586ced": { name: "024-lifecycle-livedata-core-2.0.0-api.jar", sizeBytes: 17318 },
  "632a0e5407461de774409352940e292a291037724207a787820c77daf7d33b72": { name: "020-collection-1.1.0.jar", sizeBytes: 42953 },
  "6471fafa4f46fe27a56c818f3a7b7769b0479f8f3afd97d4e809a373054687d1": { name: "064-6471fafa4f46fe27a56c818f3a7b7769b0479f8f3afd97d4e809a373054687d1.jar", sizeBytes: 5200 },
  "6550e11b7631e0c9a567df3f0694e54640fc261eba5bf8e11b437aa725f1b800": { name: "016-core-1.3.0-api.jar", sizeBytes: 1563966 },
  "72d4b7491338e0e192172b48ed43059580f894295d31904609e9104a63da70db": { name: "032-easyopencv-1.7.3-api.jar", sizeBytes: 361953 },
  "76db6be533bd730fb361c2feb12a2c26d9952824746847da82601ef81f082643": { name: "025-lifecycle-common-2.1.0.jar", sizeBytes: 21688 },
  "7b8d130a2134503e4153a9fcf0d6ce4ca7e995c57bafbb12e5f85cd796f2e31e": { name: "011-loader-1.0.0-api.jar", sizeBytes: 84205 },
  "7eb0e0baea91512eff9a75e865d76d2b419bade634dc55bef50c2b12f9445beb": { name: "007-fragment-1.1.0-api.jar", sizeBytes: 402713 },
  "7fb48b12b5cfefd6cab0972eaf5b358a9edd2ed68322e37bbb5ed9dc9f86d3a4": { name: "013-vectordrawable-animated-1.1.0-api.jar", sizeBytes: 88280 },
  "816b5fb63e92c7f8036f8616e2168b53b986e85f8acc469b6625359ed815b57e": { name: "003-RobotServer-11.1.0-api.jar", sizeBytes: 651878 },
  "882b34cf4de9fc5a56615d0ee87d462d7575c4662be13da7d8b113778c15811d": { name: "066-882b34cf4de9fc5a56615d0ee87d462d7575c4662be13da7d8b113778c15811d.jar", sizeBytes: 417087 },
  "8bb9615ba2220f9a2434c3ae75b85e7489efd73dfd0d0d8a51bcec46c78dfbe1": { name: "001-Inspection-11.1.0-api.jar", sizeBytes: 198891 },
  "8ca08c2e371ecd3cfb30bed9c10e87bdb217f7b4b7397dc3fe1b42be268e43d8": { name: "038-8ca08c2e371ecd3cfb30bed9c10e87bdb217f7b4b7397dc3fe1b42be268e43d8.jar", sizeBytes: 135137 },
  "9029262bddce116e6d02be499e4afdba21f24c239087b76b3b57d7e98b490a36": { name: "029-annotation-1.2.0.jar", sizeBytes: 29520 },
  "95de46280b2449c4e3850fae0bbdf145c373f702c634dcb52212dc6cb81ebe86": { name: "045-95de46280b2449c4e3850fae0bbdf145c373f702c634dcb52212dc6cb81ebe86.jar", sizeBytes: 63034 },
  "9acd5a6fbb31730f59723bfd904521e8b9e9625633be196411e8b2c47d0ab44f": { name: "002-Blocks-11.1.0-api.jar", sizeBytes: 1270840 },
  "9c67cc79efd6b9215b49d2a4308f5f3433537376c7c88e89bdd6729bd096e61a": { name: "002-kotlin-stdlib-2.2.10.jar", sizeBytes: 1750374 },
  "9d3a4e227fe92f3b24b308013e4e58227f8a59b9b449c0a5a472df05cd805d4f": { name: "056-9d3a4e227fe92f3b24b308013e4e58227f8a59b9b449c0a5a472df05cd805d4f.jar", sizeBytes: 9050 },
  "9dfeef6fbf10a1e974039348f6f2c60f69ddcc39e7a24a912599bee8a5b74b16": { name: "015-customview-1.0.0-api.jar", sizeBytes: 78535 },
  "ace2a10dc8e2d5fd34925ecac03e4988b2c0f851650c94b8cef49ba1bd111478": { name: "009-annotations-13.0.jar", sizeBytes: 17536 },
  "acfa30338c26267b6cab665509c2251bb96e8350bfcad89d59b949ba77011f8d": { name: "065-core-3.4.1.jar", sizeBytes: 539286 },
  "b177f6fa63518a40f8cd3a365230dc89f86db5777f9eda1413eece766102aefd": { name: "058-b177f6fa63518a40f8cd3a365230dc89f86db5777f9eda1413eece766102aefd.jar", sizeBytes: 9744 },
  "bd7c7650d2b9f2bca0d415848adb902134ef65698f0027b13b2cfa3ae1fae8b0": { name: "005-appcompat-1.2.0-api.jar", sizeBytes: 1560327 },
  "c47d0c2cbf7254fc99cd2f5961b86d93ca2ad0d85f1de46588e5ebe25c505973": { name: "042-c47d0c2cbf7254fc99cd2f5961b86d93ca2ad0d85f1de46588e5ebe25c505973.jar", sizeBytes: 1990 },
  "c6339a1c2cd9cdb25d1c8d5a0019a583450f530717841c9a927e8a76fac367af": { name: "010-viewpager-1.0.0-api.jar", sizeBytes: 113856 },
  "cd0115c75128271920f5dfb50f307ff7a2e224618e1b396048ffa1e2747d7e8d": { name: "039-cd0115c75128271920f5dfb50f307ff7a2e224618e1b396048ffa1e2747d7e8d.jar", sizeBytes: 681103 },
  "cd51036ac1b49da0613a4766e8c870b43da6b61802151449cd7c65663ce497a5": { name: "017-cursoradapter-1.0.0-api.jar", sizeBytes: 23006 },
  "cd893934e0c425986fa774bd879261d460a2c45d259375ce83a42615d4270104": { name: "037-cd893934e0c425986fa774bd879261d460a2c45d259375ce83a42615d4270104.jar", sizeBytes: 38500 },
  "cdb7378ed68dd9635d74d002830b8dadd5d76838ca84071cd0ecef14b5524b2f": { name: "062-cdb7378ed68dd9635d74d002830b8dadd5d76838ca84071cd0ecef14b5524b2f.jar", sizeBytes: 5717 },
  "d4ab4b9fc7a598dd2e8cf60e8517a6234e5cc9b6a0515565dc338885d7564c01": { name: "014-vectordrawable-1.1.0-api.jar", sizeBytes: 87936 },
  "d5390696c382039aadac5e813e9aaae4130f87459da4368fea4ec5034905234d": { name: "012-activity-1.0.0-api.jar", sizeBytes: 36760 },
  "d634e61070049ca128ddd5bc292ce1d6d5441c3c8472edc24159563c9a059ede": { name: "053-d634e61070049ca128ddd5bc292ce1d6d5441c3c8472edc24159563c9a059ede.jar", sizeBytes: 708805 },
  "e71564b30e7ca01fba93559235d5966299c6eb883c2089c72f2e8d978cdc8fc9": { name: "036-e71564b30e7ca01fba93559235d5966299c6eb883c2089c72f2e8d978cdc8fc9.jar", sizeBytes: 450228 },
  "f0404cf634498aec268ad9a3967b5ae8f0005280de0504e264a2a65b8f19745e": { name: "038-core-lambda-stubs.jar", sizeBytes: 15149 },
  "f2bb0c416fd68cc9273e1b4ffd59e1b5003d3601f1a140027dc99f9f4810cccd": { name: "026-core-runtime-2.0.0-api.jar", sizeBytes: 9881 },
  "f99bc7e162bffaa6273973606e4cb89fd21c7cd95fb4f5a33c72ee8939bd7d31": { name: "054-f99bc7e162bffaa6273973606e4cb89fd21c7cd95fb4f5a33c72ee8939bd7d31.jar", sizeBytes: 11504 },
  "fe1237bf029d063e7f29fe39aeaf73ef74c8b0a3658486fc29d3c54326653889": { name: "027-core-common-2.1.0.jar", sizeBytes: 11257 },
  "fec8d517e766ba11b0214a87c4dc18971c356ad62ba200f56f75320cea6fc7e3": { name: "008-appcompat-resources-1.2.0-api.jar", sizeBytes: 155991 },
} as const);

export const SHARED_ARTIFACT_LIBRARY_HASHES: ReadonlySet<string> = new Set(
  Object.keys(SHARED_ARTIFACT_LIBRARY_CATALOG),
);

export const DEFAULT_SHARED_ARTIFACT_LIBRARY_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.runtime/artifact-libraries",
);

export function resolveSharedArtifactLibraryDirectory(configured?: string): string {
  const value = configured ?? process.env[LIBRARY_DIRECTORY_ENV] ?? DEFAULT_SHARED_ARTIFACT_LIBRARY_DIR;
  if (!isAbsolute(value)) {
    throw new Error(`${LIBRARY_DIRECTORY_ENV} must be an absolute trusted runner path`);
  }
  return resolve(value);
}

/**
 * Seeds only catalogued JAR bytes, addressed by content hash. Non-JAR paths and
 * untrusted/custom JARs are left alone and remain part of the portable bundle.
 */
export async function seedSharedArtifactLibraries(
  paths: string[],
  cacheDirectory = resolveSharedArtifactLibraryDirectory(),
): Promise<string[]> {
  const cacheRoot = resolveSharedArtifactLibraryDirectory(cacheDirectory);
  const seeded = new Set<string>();
  for (const sourcePath of paths) {
    const info = await stat(sourcePath);
    if (!info.isFile() || extname(sourcePath).toLowerCase() !== ".jar") continue;
    const bytes = await readFile(sourcePath);
    const hash = sha256(bytes);
    if (!SHARED_ARTIFACT_LIBRARY_HASHES.has(hash)) continue;
    await writeVerifiedCacheEntry(cacheRoot, hash, bytes);
    seeded.add(hash);
  }
  return [...seeded].sort();
}

/** Verifies every trusted catalog entry is present in the selected cache. */
export async function verifySharedArtifactLibraryCache(
  cacheDirectory = resolveSharedArtifactLibraryDirectory(),
): Promise<string[]> {
  const cacheRoot = resolveSharedArtifactLibraryDirectory(cacheDirectory);
  for (const hash of Object.keys(SHARED_ARTIFACT_LIBRARY_CATALOG)) {
    await readSharedArtifactLibrary(hash, cacheRoot);
  }
  return Object.keys(SHARED_ARTIFACT_LIBRARY_CATALOG);
}

/** Returns verified bytes only for an allowlisted hash and its fixed cache path. */
export async function readSharedArtifactLibrary(
  hash: string,
  cacheDirectory = resolveSharedArtifactLibraryDirectory(),
): Promise<Uint8Array> {
  if (!SHA256_PATTERN.test(hash) || !SHARED_ARTIFACT_LIBRARY_HASHES.has(hash)) {
    throw new Error("Artifact manifest references an untrusted shared library hash");
  }
  const cachePath = join(resolveSharedArtifactLibraryDirectory(cacheDirectory), `${hash}.jar`);
  const info = await lstat(cachePath).catch(() => undefined);
  if (!info?.isFile() || info.isSymbolicLink()) {
    throw new Error(`Trusted shared artifact library is missing: ${hash}`);
  }
  const bytes = await readFile(cachePath);
  if (sha256(bytes) !== hash) {
    throw new Error(`Trusted shared artifact library failed its content hash check: ${hash}`);
  }
  return bytes;
}

/** Validates manifest references without accepting archive-controlled filesystem paths. */
export function validateSharedArtifactLibraryReferences(
  value: unknown,
  runtimeClasspath: string[],
  archivePaths: ReadonlySet<string>,
): Record<string, string> {
  if (new Set(runtimeClasspath).size !== runtimeClasspath.length) {
    throw new Error("Artifact runtime classpath contains a duplicate path");
  }
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Artifact manifest sharedLibraries must be an object");
  }
  const references: Record<string, string> = {};
  for (const [path, hash] of Object.entries(value)) {
    if (!path.startsWith("runtime/") || !path.toLowerCase().endsWith(".jar")) {
      throw new Error("Artifact shared library path is outside the runtime JAR namespace");
    }
    validateLibraryArchivePath(path);
    if (!runtimeClasspath.includes(path)) {
      throw new Error("Artifact shared library path is absent from the runtime classpath");
    }
    if (archivePaths.has(path)) {
      throw new Error("Artifact shared library path duplicates an archived file");
    }
    if (typeof hash !== "string" || !SHA256_PATTERN.test(hash)
        || !SHARED_ARTIFACT_LIBRARY_HASHES.has(hash)) {
      throw new Error("Artifact manifest references an untrusted shared library hash");
    }
    references[path] = hash;
  }
  return references;
}

async function writeVerifiedCacheEntry(cacheRoot: string, hash: string, bytes: Uint8Array): Promise<void> {
  if (!SHARED_ARTIFACT_LIBRARY_HASHES.has(hash) || sha256(bytes) !== hash) {
    throw new Error("Refusing to seed an untrusted shared artifact library");
  }
  await mkdir(cacheRoot, { recursive: true });
  const destination = join(cacheRoot, `${hash}.jar`);
  const existing = await lstat(destination).catch(() => undefined);
  if (existing?.isFile() && !existing.isSymbolicLink()) {
    const cachedBytes = await readFile(destination);
    if (sha256(cachedBytes) === hash) return;
  }
  const temporary = join(cacheRoot, `.${hash}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateLibraryArchivePath(path: string): void {
  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")
      || /^[A-Za-z]:/u.test(path)
      || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Artifact shared library path is invalid");
  }
}
