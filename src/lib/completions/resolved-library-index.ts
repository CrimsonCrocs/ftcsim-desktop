import {
  FTC_SDK_LANGUAGE_INDEX_URL,
  JvmCompletionCatalog,
  JVM_LANGUAGE_INDEX_SCHEMA_VERSION,
  loadFtcSdkCompletionCatalog,
  type CompatibilityClassification,
  type CompatibilityCoverage,
  type CompactJvmMember,
  type CompactJvmType,
  type JvmLanguageIndex,
} from "./language-index";

export const JAVA_8_LANGUAGE_INDEX_URL =
  "/language-index/v1/java-se-8-temurin-8u482-b08.json" as const;
export const KOTLIN_RUNTIME_LANGUAGE_INDEX_URL =
  "/language-index/v1/kotlin-runtime-2.2.10.json" as const;
export const FTC_RESOLVED_DEPENDENCIES_LANGUAGE_INDEX_URL =
  "/language-index/v1/ftc-resolved-dependencies-11.1.0.json" as const;

export interface ResolvedLibraryClass {
  name: string;
  kind: "class" | "interface" | "enum" | "annotation";
  artifact: string;
  classification?: CompatibilityClassification;
  coverage?: CompatibilityCoverage;
  superTypes: string[];
  members: Array<{
    kind: "constructor" | "field" | "method";
    name: string;
    descriptor: string;
    declaration: string;
    classification?: CompatibilityClassification;
  }>;
}

export interface ResolvedLibraryIndexInput {
  id: string;
  version: string;
  sourceSha256: string;
  artifacts: Array<readonly [name: string, sha256: string]>;
  classes: ResolvedLibraryClass[];
}

const TYPE_CODES = {
  class: "c",
  interface: "i",
  enum: "e",
  annotation: "a",
} as const;
const MEMBER_CODES = {
  constructor: "c",
  field: "f",
  method: "m",
} as const;
const CLASSIFICATION_CODES: Record<CompatibilityClassification, "p" | "b" | "c" | "u"> = {
  "physically-modeled": "p",
  "behaviorally-modeled": "b",
  "compile-only-utility": "c",
  unsupported: "u",
};
const COVERAGE_CODES: Record<CompatibilityCoverage, "f" | "p" | "n"> = {
  full: "f",
  partial: "p",
  none: "n",
};

/** Builds the same compact immutable browser format as the FTC surface index. */
export function buildResolvedLibraryLanguageIndex(
  input: ResolvedLibraryIndexInput,
): JvmLanguageIndex {
  if (!input.id || !input.version || !isSha256(input.sourceSha256)) {
    throw new Error("Invalid resolved-library language-index identity");
  }
  const artifacts = [...input.artifacts].sort((left, right) => compareText(left[0], right[0]));
  if (artifacts.some((entry) => !entry[0] || !isSha256(entry[1]))) {
    throw new Error("Invalid resolved-library artifact pin");
  }
  const artifactIndexes = new Map(artifacts.map(([name], index) => [name, index]));
  if (artifactIndexes.size !== artifacts.length) {
    throw new Error("Duplicate resolved-library artifact name");
  }

  const seenTypes = new Set<string>();
  const types: CompactJvmType[] = [];
  const members: CompactJvmMember[] = [];
  let supportedMemberCount = 0;
  let unsupportedMemberCount = 0;
  for (const entry of [...input.classes].sort((left, right) => compareText(left.name, right.name))) {
    if (seenTypes.has(entry.name)) throw new Error(`Duplicate resolved-library type ${entry.name}`);
    seenTypes.add(entry.name);
    const artifactIndex = artifactIndexes.get(entry.artifact);
    if (artifactIndex === undefined) {
      throw new Error(`Resolved-library type ${entry.name} references unknown artifact ${entry.artifact}`);
    }
    const memberOffset = members.length;
    const seenMembers = new Set<string>();
    for (const member of [...entry.members].sort((left, right) => (
      compareText(
        `${left.kind}:${left.name}:${left.descriptor}`,
        `${right.kind}:${right.name}:${right.descriptor}`,
      )
    ))) {
      const key = `${member.kind}:${member.name}:${member.descriptor}`;
      if (seenMembers.has(key)) throw new Error(`Duplicate resolved-library member ${entry.name}.${key}`);
      seenMembers.add(key);
      const classification = member.classification ?? entry.classification ?? "compile-only-utility";
      if (classification === "unsupported") unsupportedMemberCount += 1;
      else supportedMemberCount += 1;
      members.push([
        MEMBER_CODES[member.kind],
        member.name,
        member.descriptor,
        member.declaration.replaceAll("$", "."),
        CLASSIFICATION_CODES[classification],
      ]);
    }
    types.push([
      entry.name,
      TYPE_CODES[entry.kind],
      artifactIndex,
      CLASSIFICATION_CODES[entry.classification ?? "compile-only-utility"],
      COVERAGE_CODES[entry.coverage ?? "full"],
      [...new Set(entry.superTypes)].sort(compareText),
      memberOffset,
      members.length - memberOffset,
    ]);
  }

  return {
    schemaVersion: JVM_LANGUAGE_INDEX_SCHEMA_VERSION,
    id: input.id,
    sdkVersion: input.version,
    sourceSha256: input.sourceSha256,
    artifacts,
    summary: [types.length, members.length, supportedMemberCount, unsupportedMemberCount],
    types,
    members,
  };
}

export function mergeJvmLanguageIndexes(
  id: string,
  indexes: readonly JvmLanguageIndex[],
  options: { duplicateTypes?: "error" | "prefer-first" | "prefer-last" } = {},
): JvmLanguageIndex {
  if (!id || indexes.length === 0) throw new Error("A merged JVM language index needs an id and sources");
  const duplicateTypes = options.duplicateTypes ?? "error";
  const artifacts: Array<readonly [string, string]> = [];
  const artifactIndexes = new Map<string, number>();
  const selectedTypes = new Map<string, {
    type: CompactJvmType;
    members: CompactJvmMember[];
    artifactIndex: number;
  }>();

  for (const index of indexes) {
    // Construction validates every source before its offsets are rebased.
    void new JvmCompletionCatalog(index);
    const remappedArtifacts = index.artifacts.map(([name, sha256]) => {
      const identity = `${name}:${sha256}`;
      const existing = artifactIndexes.get(identity);
      if (existing !== undefined) return existing;
      const next = artifacts.length;
      artifacts.push([name, sha256]);
      artifactIndexes.set(identity, next);
      return next;
    });
    for (const type of index.types) {
      if (selectedTypes.has(type[0])) {
        if (duplicateTypes === "error") throw new Error(`Duplicate merged JVM type ${type[0]}`);
        if (duplicateTypes === "prefer-first") continue;
      }
      selectedTypes.set(type[0], {
        type,
        members: index.members.slice(type[6], type[6] + type[7]),
        artifactIndex: type[2] < 0 ? -1 : remappedArtifacts[type[2]],
      });
    }
  }

  const types: CompactJvmType[] = [];
  const members: CompactJvmMember[] = [];
  let unsupported = 0;
  for (const [name, selected] of [...selectedTypes].sort(([left], [right]) => compareText(left, right))) {
    const type = selected.type;
    const offset = members.length;
    for (const member of selected.members) members.push(member);
    types.push([
      name,
      type[1],
      selected.artifactIndex,
      type[3],
      type[4],
      type[5],
      offset,
      selected.members.length,
    ]);
    unsupported += selected.members.filter((member) => member[4] === "u").length;
  }

  const sourceSha256 = sha256Text(
    indexes.map((index) => `${index.id}\0${index.sourceSha256}\n`).join(""),
  );
  return {
    schemaVersion: JVM_LANGUAGE_INDEX_SCHEMA_VERSION,
    id,
    sdkVersion: indexes.map((index) => index.sdkVersion).join(" + "),
    sourceSha256,
    artifacts,
    summary: [types.length, members.length, members.length - unsupported, unsupported],
    types,
    members,
  };
}

export async function loadResolvedLibraryCompletionCatalog(
  fetcher: typeof fetch = fetch,
): Promise<JvmCompletionCatalog> {
  const indexes = await Promise.all([
    loadIndex(JAVA_8_LANGUAGE_INDEX_URL, fetcher),
    loadIndex(KOTLIN_RUNTIME_LANGUAGE_INDEX_URL, fetcher),
    loadIndex(FTC_RESOLVED_DEPENDENCIES_LANGUAGE_INDEX_URL, fetcher),
  ]);
  return new JvmCompletionCatalog(mergeJvmLanguageIndexes("resolved-runner-libraries", indexes));
}

/** FTC SDK + every exact, pinned library resolved by the local runner. */
export async function loadWorkspaceCompletionCatalog(
  fetcher: typeof fetch = fetch,
): Promise<JvmCompletionCatalog> {
  const [ftc, java, kotlin, dependencies] = await Promise.all([
    loadFtcSdkCompletionCatalog(FTC_SDK_LANGUAGE_INDEX_URL, fetcher),
    loadIndex(JAVA_8_LANGUAGE_INDEX_URL, fetcher),
    loadIndex(KOTLIN_RUNTIME_LANGUAGE_INDEX_URL, fetcher),
    loadIndex(FTC_RESOLVED_DEPENDENCIES_LANGUAGE_INDEX_URL, fetcher),
  ]);
  return new JvmCompletionCatalog(mergeJvmLanguageIndexes("ftc-runner-workspace", [
    ftc.index,
    java,
    kotlin,
    dependencies,
  ]));
}

async function loadIndex(url: string, fetcher: typeof fetch): Promise<JvmLanguageIndex> {
  const response = await fetcher(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Unable to load JVM language index ${url}: HTTP ${response.status}`);
  const catalog = JvmCompletionCatalog.fromJson(await response.text());
  return catalog.index;
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// Synchronous and browser-safe because catalog merging happens while Monaco is
// being configured, before an async completion request can be served.
export function sha256Text(source: string): string {
  const bytes = new TextEncoder().encode(source);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const schedule = new Uint32Array(64);
  for (let block = 0; block < paddedLength; block += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(block + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(schedule[index - 15], 7)
        ^ rotateRight(schedule[index - 15], 18)
        ^ (schedule[index - 15] >>> 3);
      const s1 = rotateRight(schedule[index - 2], 17)
        ^ rotateRight(schedule[index - 2], 19)
        ^ (schedule[index - 2] >>> 10);
      schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + SHA256_CONSTANTS[index] + schedule[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  return [...state].map((value) => value.toString(16).padStart(8, "0")).join("");
}

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
