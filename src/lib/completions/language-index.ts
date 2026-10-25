export const JVM_LANGUAGE_INDEX_SCHEMA_VERSION = 1 as const;
export const FTC_SDK_LANGUAGE_INDEX_URL =
  "/language-index/v1/ftc-sdk-11.1.0.json" as const;

export type CompatibilityClassification =
  | "physically-modeled"
  | "behaviorally-modeled"
  | "compile-only-utility"
  | "unsupported";

export type CompatibilityCoverage = "full" | "partial" | "none";
export type JvmTypeKind = "class" | "interface" | "enum" | "annotation";
export type JvmMemberKind = "constructor" | "field" | "method";

type ClassificationCode = "p" | "b" | "c" | "u";
type CoverageCode = "f" | "p" | "n";
type TypeKindCode = "c" | "i" | "e" | "a";
type MemberKindCode = "c" | "f" | "m";

export type CompactJvmType = readonly [
  binaryName: string,
  kind: TypeKindCode,
  artifactIndex: number,
  classification: ClassificationCode,
  coverage: CoverageCode,
  superTypes: readonly string[],
  memberOffset: number,
  memberCount: number,
];

export type CompactJvmMember = readonly [
  kind: MemberKindCode,
  name: string,
  descriptor: string,
  declaration: string,
  classification: ClassificationCode,
];

export interface JvmLanguageIndex {
  schemaVersion: typeof JVM_LANGUAGE_INDEX_SCHEMA_VERSION;
  id: string;
  sdkVersion: string;
  sourceSha256: string;
  artifacts: Array<readonly [name: string, sha256: string]>;
  /** [type count, member count, modeled member count, unsupported member count] */
  summary: readonly [number, number, number, number];
  types: CompactJvmType[];
  members: CompactJvmMember[];
}

interface SurfaceArtifact {
  name: string;
  sha256: string;
}

interface SurfaceMember {
  kind: JvmMemberKind;
  name: string;
  descriptor: string;
  declaration: string;
  classification: CompatibilityClassification;
}

interface SurfaceClass {
  name: string;
  artifact?: string;
  kind: "class" | "interface";
  superTypes: string[];
  classification: CompatibilityClassification;
  coverage: CompatibilityCoverage;
  members: SurfaceMember[];
}

interface SurfaceManifest {
  sdkVersion: string;
  artifacts: SurfaceArtifact[];
  classes: SurfaceClass[];
}

export interface JvmTypeSymbol {
  binaryName: string;
  sourceName: string;
  packageName: string;
  simpleName: string;
  kind: JvmTypeKind;
  artifact: string | null;
  classification: CompatibilityClassification;
  coverage: CompatibilityCoverage;
  superTypes: readonly string[];
}

export interface JvmMemberSymbol {
  declaringType: string;
  inherited: boolean;
  kind: JvmMemberKind;
  name: string;
  descriptor: string;
  declaration: string;
  classification: CompatibilityClassification;
}

export interface MemberQueryOptions {
  includeInherited?: boolean;
  includeConstructors?: boolean;
  includeUnsupported?: boolean;
  limit?: number;
  query?: string;
}

const CLASSIFICATION_TO_CODE: Record<CompatibilityClassification, ClassificationCode> = {
  "physically-modeled": "p",
  "behaviorally-modeled": "b",
  "compile-only-utility": "c",
  unsupported: "u",
};

const CODE_TO_CLASSIFICATION: Record<ClassificationCode, CompatibilityClassification> = {
  p: "physically-modeled",
  b: "behaviorally-modeled",
  c: "compile-only-utility",
  u: "unsupported",
};

const COVERAGE_TO_CODE: Record<CompatibilityCoverage, CoverageCode> = {
  full: "f",
  partial: "p",
  none: "n",
};

const CODE_TO_COVERAGE: Record<CoverageCode, CompatibilityCoverage> = {
  f: "full",
  p: "partial",
  n: "none",
};

const MEMBER_KIND_TO_CODE: Record<JvmMemberKind, MemberKindCode> = {
  constructor: "c",
  field: "f",
  method: "m",
};

const CODE_TO_MEMBER_KIND: Record<MemberKindCode, JvmMemberKind> = {
  c: "constructor",
  f: "field",
  m: "method",
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sourceName(binaryName: string): string {
  return binaryName.replaceAll("$", ".");
}

function packageName(binaryName: string): string {
  const separator = binaryName.lastIndexOf(".");
  return separator < 0 ? "" : binaryName.slice(0, separator);
}

function simpleName(binaryName: string): string {
  const packagePrefix = packageName(binaryName);
  return sourceName(binaryName).slice(packagePrefix ? packagePrefix.length + 1 : 0);
}

function leafName(binaryName: string): string {
  return sourceName(binaryName).split(".").at(-1) ?? binaryName;
}

function typeKind(entry: SurfaceClass): TypeKindCode {
  if (entry.superTypes.includes("java.lang.annotation.Annotation")) return "a";
  if (entry.superTypes.includes("java.lang.Enum")) return "e";
  return entry.kind === "interface" ? "i" : "c";
}

function decodeTypeKind(code: TypeKindCode): JvmTypeKind {
  const kinds: Record<TypeKindCode, JvmTypeKind> = {
    c: "class",
    i: "interface",
    e: "enum",
    a: "annotation",
  };
  return kinds[code];
}

function normalizeDeclaration(declaration: string): string {
  return declaration.replaceAll("$", ".");
}

function memberKey(member: SurfaceMember): string {
  return `${MEMBER_KIND_TO_CODE[member.kind]}:${member.name}:${member.descriptor}`;
}

/**
 * Produces the checked-in browser index from the verbose compatibility manifest.
 * Sorting and duplicate validation make the result independent of source JSON order.
 */
export function buildFtcSdkLanguageIndex(
  source: unknown,
  sourceSha256: string,
): JvmLanguageIndex {
  const manifest = parseSurfaceManifest(source);
  if (!/^[a-f0-9]{64}$/u.test(sourceSha256)) {
    throw new Error("The SDK surface SHA-256 must contain 64 lowercase hexadecimal characters");
  }

  const artifacts = [...manifest.artifacts]
    .sort((left, right) => compareText(left.name, right.name))
    .map((artifact) => [artifact.name, artifact.sha256] as const);
  const artifactIndexes = new Map(artifacts.map(([name], index) => [name, index]));
  if (artifactIndexes.size !== artifacts.length) {
    throw new Error("The SDK surface contains duplicate artifact names");
  }
  const seenTypes = new Set<string>();
  const types: CompactJvmType[] = [];
  const members: CompactJvmMember[] = [];
  let modeledMembers = 0;
  let unsupportedMembers = 0;

  for (const entry of [...manifest.classes].sort((left, right) => compareText(left.name, right.name))) {
    if (seenTypes.has(entry.name)) throw new Error(`Duplicate SDK type ${entry.name}`);
    seenTypes.add(entry.name);
    const offset = members.length;
    const seenMembers = new Set<string>();
    const sortedMembers = [...entry.members].sort((left, right) => compareText(memberKey(left), memberKey(right)));
    for (const member of sortedMembers) {
      const key = memberKey(member);
      if (seenMembers.has(key)) throw new Error(`Duplicate SDK member ${entry.name}.${key}`);
      seenMembers.add(key);
      if (member.classification === "unsupported") unsupportedMembers += 1;
      else modeledMembers += 1;
      members.push([
        MEMBER_KIND_TO_CODE[member.kind],
        member.name,
        member.descriptor,
        normalizeDeclaration(member.declaration),
        CLASSIFICATION_TO_CODE[member.classification],
      ]);
    }
    const artifactIndex = entry.artifact === undefined
      ? -1
      : artifactIndexes.get(entry.artifact);
    if (artifactIndex === undefined) {
      throw new Error(`SDK type ${entry.name} references unknown artifact ${entry.artifact}`);
    }
    types.push([
      entry.name,
      typeKind(entry),
      artifactIndex,
      CLASSIFICATION_TO_CODE[entry.classification],
      COVERAGE_TO_CODE[entry.coverage],
      [...entry.superTypes].sort(compareText),
      offset,
      sortedMembers.length,
    ]);
  }

  return {
    schemaVersion: JVM_LANGUAGE_INDEX_SCHEMA_VERSION,
    id: `ftc-sdk-${manifest.sdkVersion}`,
    sdkVersion: manifest.sdkVersion,
    sourceSha256,
    artifacts,
    summary: [types.length, members.length, modeledMembers, unsupportedMembers],
    types,
    members,
  };
}

export function assertJvmLanguageIndex(value: unknown): asserts value is JvmLanguageIndex {
  if (!isRecord(value)
      || value.schemaVersion !== JVM_LANGUAGE_INDEX_SCHEMA_VERSION
      || typeof value.id !== "string"
      || typeof value.sdkVersion !== "string"
      || typeof value.sourceSha256 !== "string"
      || !/^[a-f0-9]{64}$/u.test(value.sourceSha256)
      || !Array.isArray(value.artifacts)
      || !Array.isArray(value.summary)
      || !Array.isArray(value.types)
      || !Array.isArray(value.members)) {
    throw new Error("Invalid JVM language index envelope");
  }
  if (value.summary.length !== 4
      || value.summary.some((count) => !Number.isSafeInteger(count) || count < 0)
      || value.summary[0] !== value.types.length
      || value.summary[1] !== value.members.length
      || value.summary[2] + value.summary[3] !== value.members.length) {
    throw new Error("Invalid JVM language index summary");
  }
  if (!value.artifacts.every((entry) => (
    Array.isArray(entry)
    && entry.length === 2
    && typeof entry[0] === "string"
    && typeof entry[1] === "string"
    && /^[a-f0-9]{64}$/u.test(entry[1])
  ))) {
    throw new Error("Invalid JVM language index artifacts");
  }

  let expectedOffset = 0;
  for (const entry of value.types) {
    if (!Array.isArray(entry)
        || entry.length !== 8
        || typeof entry[0] !== "string"
        || !(["c", "i", "e", "a"] as unknown[]).includes(entry[1])
        || !Number.isInteger(entry[2])
        || entry[2] < -1
        || entry[2] >= value.artifacts.length
        || !(["p", "b", "c", "u"] as unknown[]).includes(entry[3])
        || !(["f", "p", "n"] as unknown[]).includes(entry[4])
        || !Array.isArray(entry[5])
        || !entry[5].every((name) => typeof name === "string")
        || entry[6] !== expectedOffset
        || !Number.isInteger(entry[7])
        || entry[7] < 0
        || entry[6] + entry[7] > value.members.length) {
      throw new Error("Invalid JVM language index type table");
    }
    expectedOffset += entry[7];
  }
  if (expectedOffset !== value.members.length) {
    throw new Error("JVM language index member ranges are not contiguous");
  }
  if (!value.members.every((entry) => (
    Array.isArray(entry)
    && entry.length === 5
    && (["c", "f", "m"] as unknown[]).includes(entry[0])
    && typeof entry[1] === "string"
    && typeof entry[2] === "string"
    && typeof entry[3] === "string"
    && (["p", "b", "c", "u"] as unknown[]).includes(entry[4])
  ))) {
    throw new Error("Invalid JVM language index member table");
  }
}

/** Browser-safe searchable view over the compact immutable artifact. */
export class JvmCompletionCatalog {
  private readonly typeIndexes = new Map<string, number>();
  private readonly uniqueSimpleNames = new Map<string, number | null>();

  constructor(readonly index: JvmLanguageIndex) {
    assertJvmLanguageIndex(index);
    index.types.forEach((entry, typeIndex) => {
      const binary = entry[0];
      const source = sourceName(binary);
      this.typeIndexes.set(binary, typeIndex);
      this.typeIndexes.set(source, typeIndex);
      const simple = simpleName(binary);
      const leaf = leafName(binary);
      this.recordSimpleName(simple, typeIndex);
      this.recordSimpleName(leaf, typeIndex);
    });
  }

  static fromJson(source: string): JvmCompletionCatalog {
    return new JvmCompletionCatalog(JSON.parse(source) as unknown as JvmLanguageIndex);
  }

  getType(name: string): JvmTypeSymbol | undefined {
    const direct = this.typeIndexes.get(name);
    const simple = this.uniqueSimpleNames.get(name);
    const index = direct ?? (simple === null ? undefined : simple);
    return index === undefined ? undefined : this.decodeType(index);
  }

  allTypes(limit = 1_000): JvmTypeSymbol[] {
    assertLimit(limit);
    return this.index.types.slice(0, limit).map((_entry, index) => this.decodeType(index));
  }

  searchTypes(query: string, limit = 100): JvmTypeSymbol[] {
    assertLimit(limit);
    const normalized = query.trim().toLocaleLowerCase("en-US");
    if (!normalized) return [];
    return this.index.types
      .map((entry, index) => ({ index, score: typeMatchScore(entry[0], normalized) }))
      .filter((candidate) => candidate.score < Number.POSITIVE_INFINITY)
      .sort((left, right) => (
        left.score - right.score
        || supportRank(this.index.types[left.index][3]) - supportRank(this.index.types[right.index][3])
        || compareText(sourceName(this.index.types[left.index][0]), sourceName(this.index.types[right.index][0]))
      ))
      .slice(0, limit)
      .map(({ index }) => this.decodeType(index));
  }

  membersOf(typeName: string, options: MemberQueryOptions = {}): JvmMemberSymbol[] {
    const rootIndex = this.resolveTypeIndex(typeName);
    if (rootIndex === undefined) return [];
    const limit = options.limit ?? 200;
    assertLimit(limit);
    const query = options.query?.trim().toLocaleLowerCase("en-US") ?? "";
    const includeInherited = options.includeInherited ?? true;
    const includeConstructors = options.includeConstructors ?? false;
    const includeUnsupported = options.includeUnsupported ?? true;
    const results: Array<JvmMemberSymbol & { depth: number; score: number }> = [];
    const seenTypes = new Set<number>();
    const seenMembers = new Set<string>();

    const visit = (typeIndex: number, depth: number): void => {
      if (seenTypes.has(typeIndex)) return;
      seenTypes.add(typeIndex);
      const type = this.index.types[typeIndex];
      const [binary, , , , , supers, offset, count] = type;
      for (let memberIndex = offset; memberIndex < offset + count; memberIndex += 1) {
        const member = this.index.members[memberIndex];
        const kind = CODE_TO_MEMBER_KIND[member[0]];
        if ((!includeConstructors && kind === "constructor")
            || (depth > 0 && kind === "constructor")
            || (!includeUnsupported && member[4] === "u")) continue;
        const score = memberMatchScore(member[1], query);
        if (score === Number.POSITIVE_INFINITY) continue;
        const identity = `${member[0]}:${member[1]}:${member[2]}`;
        if (seenMembers.has(identity)) continue;
        seenMembers.add(identity);
        results.push({
          declaringType: sourceName(binary),
          inherited: depth > 0,
          kind,
          name: member[1],
          descriptor: member[2],
          declaration: member[3],
          classification: CODE_TO_CLASSIFICATION[member[4]],
          depth,
          score,
        });
      }
      if (!includeInherited) return;
      for (const superType of supers) {
        const superIndex = this.resolveTypeIndex(superType);
        if (superIndex !== undefined) visit(superIndex, depth + 1);
      }
    };

    visit(rootIndex, 0);
    return results
      .sort((left, right) => (
        left.score - right.score
        || left.depth - right.depth
        || supportRank(CLASSIFICATION_TO_CODE[left.classification]) - supportRank(CLASSIFICATION_TO_CODE[right.classification])
        || compareText(left.name, right.name)
        || compareText(left.descriptor, right.descriptor)
      ))
      .slice(0, limit)
      .map((member) => ({
        declaringType: member.declaringType,
        inherited: member.inherited,
        kind: member.kind,
        name: member.name,
        descriptor: member.descriptor,
        declaration: member.declaration,
        classification: member.classification,
      }));
  }

  private recordSimpleName(name: string, typeIndex: number): void {
    const previous = this.uniqueSimpleNames.get(name);
    if (previous === undefined) this.uniqueSimpleNames.set(name, typeIndex);
    else if (previous !== typeIndex) this.uniqueSimpleNames.set(name, null);
  }

  private resolveTypeIndex(name: string): number | undefined {
    const direct = this.typeIndexes.get(name);
    if (direct !== undefined) return direct;
    const simple = this.uniqueSimpleNames.get(name);
    return simple === null ? undefined : simple;
  }

  private decodeType(typeIndex: number): JvmTypeSymbol {
    const [binary, kind, artifactIndex, classification, coverage, superTypes] = this.index.types[typeIndex];
    return {
      binaryName: binary,
      sourceName: sourceName(binary),
      packageName: packageName(binary),
      simpleName: simpleName(binary),
      kind: decodeTypeKind(kind),
      artifact: artifactIndex < 0 ? null : this.index.artifacts[artifactIndex]?.[0] ?? null,
      classification: CODE_TO_CLASSIFICATION[classification],
      coverage: CODE_TO_COVERAGE[coverage],
      superTypes,
    };
  }
}

export async function loadFtcSdkCompletionCatalog(
  url: string = FTC_SDK_LANGUAGE_INDEX_URL,
  fetcher: typeof fetch = fetch,
): Promise<JvmCompletionCatalog> {
  const response = await fetcher(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Unable to load FTC SDK language index: HTTP ${response.status}`);
  return JvmCompletionCatalog.fromJson(await response.text());
}

function typeMatchScore(binaryName: string, query: string): number {
  const source = sourceName(binaryName).toLocaleLowerCase("en-US");
  const simple = simpleName(binaryName).toLocaleLowerCase("en-US");
  const leaf = leafName(binaryName).toLocaleLowerCase("en-US");
  if (leaf === query || simple === query || source === query) return 0;
  if (leaf.startsWith(query)) return 1;
  if (simple.startsWith(query)) return 2;
  if (source.startsWith(query)) return 3;
  if (source.includes(query)) return 4;
  return Number.POSITIVE_INFINITY;
}

function memberMatchScore(name: string, query: string): number {
  if (!query) return 0;
  const normalized = name.toLocaleLowerCase("en-US");
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  if (normalized.includes(query)) return 2;
  return Number.POSITIVE_INFINITY;
}

function supportRank(code: ClassificationCode): number {
  return code === "u" ? 1 : 0;
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
    throw new Error("Completion result limit must be an integer from 1 through 1000");
  }
}

function parseSurfaceManifest(value: unknown): SurfaceManifest {
  if (!isRecord(value)
      || typeof value.sdkVersion !== "string"
      || !Array.isArray(value.artifacts)
      || !Array.isArray(value.classes)) {
    throw new Error("Invalid FTC SDK surface manifest");
  }
  const artifacts = value.artifacts.map((artifact): SurfaceArtifact => {
    if (!isRecord(artifact)
        || typeof artifact.name !== "string"
        || typeof artifact.sha256 !== "string"
        || !/^[a-f0-9]{64}$/u.test(artifact.sha256)) {
      throw new Error("Invalid FTC SDK surface artifact");
    }
    return { name: artifact.name, sha256: artifact.sha256 };
  });
  const classes = value.classes.map((entry): SurfaceClass => {
    if (!isRecord(entry)
        || typeof entry.name !== "string"
        || (entry.artifact !== undefined && typeof entry.artifact !== "string")
        || (entry.kind !== "class" && entry.kind !== "interface")
        || !Array.isArray(entry.superTypes)
        || !entry.superTypes.every((item) => typeof item === "string")
        || !isClassification(entry.classification)
        || !isCoverage(entry.coverage)
        || !Array.isArray(entry.members)) {
      throw new Error("Invalid FTC SDK surface class");
    }
    const members = entry.members.map((member): SurfaceMember => {
      if (!isRecord(member)
          || !isMemberKind(member.kind)
          || typeof member.name !== "string"
          || typeof member.descriptor !== "string"
          || typeof member.declaration !== "string"
          || !isClassification(member.classification)) {
        throw new Error(`Invalid FTC SDK surface member in ${entry.name}`);
      }
      return {
        kind: member.kind,
        name: member.name,
        descriptor: member.descriptor,
        declaration: member.declaration,
        classification: member.classification,
      };
    });
    return {
      name: entry.name,
      ...(entry.artifact === undefined ? {} : { artifact: entry.artifact }),
      kind: entry.kind,
      superTypes: [...entry.superTypes],
      classification: entry.classification,
      coverage: entry.coverage,
      members,
    };
  });
  return { sdkVersion: value.sdkVersion, artifacts, classes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClassification(value: unknown): value is CompatibilityClassification {
  return value === "physically-modeled"
    || value === "behaviorally-modeled"
    || value === "compile-only-utility"
    || value === "unsupported";
}

function isCoverage(value: unknown): value is CompatibilityCoverage {
  return value === "full" || value === "partial" || value === "none";
}

function isMemberKind(value: unknown): value is JvmMemberKind {
  return value === "constructor" || value === "field" || value === "method";
}
