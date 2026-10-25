type ConstantPoolEntry =
  | { tag: 1; value: string }
  | { tag: 7; nameIndex: number }
  | { tag: number };

export interface ParsedPublicJvmMember {
  kind: "constructor" | "field" | "method";
  name: string;
  descriptor: string;
  declaration: string;
}

export interface ParsedPublicJvmClass {
  name: string;
  publicType: boolean;
  kind: "class" | "interface" | "enum" | "annotation";
  superTypes: string[];
  members: ParsedPublicJvmMember[];
}

const ACC_PUBLIC = 0x0001;
const ACC_STATIC = 0x0008;
const ACC_BRIDGE = 0x0040;
const ACC_INTERFACE = 0x0200;
const ACC_SYNTHETIC = 0x1000;
const ACC_ANNOTATION = 0x2000;
const ACC_ENUM = 0x4000;

class ClassReader {
  offset = 0;

  constructor(readonly bytes: Uint8Array) {}

  u1(): number {
    this.require(1);
    return this.bytes[this.offset++];
  }

  u2(): number {
    this.require(2);
    const value = (this.bytes[this.offset] << 8) | this.bytes[this.offset + 1];
    this.offset += 2;
    return value;
  }

  u4(): number {
    this.require(4);
    const value = (
      this.bytes[this.offset] * 0x1000000
      + (this.bytes[this.offset + 1] << 16)
      + (this.bytes[this.offset + 2] << 8)
      + this.bytes[this.offset + 3]
    ) >>> 0;
    this.offset += 4;
    return value;
  }

  utf8(length: number): string {
    this.require(length);
    const value = new TextDecoder().decode(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }

  skip(length: number): void {
    this.require(length);
    this.offset += length;
  }

  private require(length: number): void {
    if (this.offset + length > this.bytes.length) {
      throw new Error("Truncated JVM class file");
    }
  }
}

/**
 * Reads exactly the public, source-addressable JVM surface used by the browser
 * completion catalogs. The parser intentionally ignores bytecode and generic
 * attributes: exact erased descriptors are the runner's compatibility truth.
 */
export function parsePublicJvmClassFile(
  bytes: Uint8Array,
  options: { includeNonPublicType?: boolean } = {},
): ParsedPublicJvmClass | undefined {
  const reader = new ClassReader(bytes);
  if (reader.u4() !== 0xcafebabe) throw new Error("Invalid JVM class file magic");
  reader.u2();
  reader.u2();

  const poolCount = reader.u2();
  const pool: Array<ConstantPoolEntry | undefined> = new Array(poolCount);
  for (let index = 1; index < poolCount; index += 1) {
    const tag = reader.u1();
    switch (tag) {
      case 1: {
        const length = reader.u2();
        pool[index] = { tag, value: reader.utf8(length) };
        break;
      }
      case 3:
      case 4:
        reader.skip(4);
        pool[index] = { tag };
        break;
      case 5:
      case 6:
        reader.skip(8);
        pool[index] = { tag };
        index += 1;
        break;
      case 7:
        pool[index] = { tag, nameIndex: reader.u2() };
        break;
      case 8:
      case 16:
      case 19:
      case 20:
        reader.skip(2);
        pool[index] = { tag };
        break;
      case 9:
      case 10:
      case 11:
      case 12:
      case 17:
      case 18:
        reader.skip(4);
        pool[index] = { tag };
        break;
      case 15:
        reader.skip(3);
        pool[index] = { tag };
        break;
      default:
        throw new Error(`Unsupported JVM constant-pool tag ${tag}`);
    }
  }

  const utf8 = (index: number): string => {
    const entry = pool[index];
    if (entry?.tag !== 1 || !("value" in entry)) {
      throw new Error(`Expected UTF-8 constant at JVM pool index ${index}`);
    }
    return entry.value;
  };
  const className = (index: number): string => {
    const entry = pool[index];
    if (entry?.tag !== 7 || !("nameIndex" in entry)) {
      throw new Error(`Expected class constant at JVM pool index ${index}`);
    }
    return utf8(entry.nameIndex).replaceAll("/", ".");
  };

  const access = reader.u2();
  const thisClass = className(reader.u2());
  const superClassIndex = reader.u2();
  const interfaces = Array.from({ length: reader.u2() }, () => className(reader.u2()));
  const publicType = (access & ACC_PUBLIC) !== 0;
  if ((!publicType && !options.includeNonPublicType) || (access & ACC_SYNTHETIC) !== 0) {
    return undefined;
  }

  const superTypes = [
    ...(superClassIndex === 0 ? [] : [className(superClassIndex)]),
    ...interfaces,
  ].filter((name) => name !== "java.lang.Object");

  const members: ParsedPublicJvmMember[] = [];
  const readMemberTable = (kind: "field" | "method"): void => {
    const count = reader.u2();
    for (let memberIndex = 0; memberIndex < count; memberIndex += 1) {
      const memberAccess = reader.u2();
      const name = utf8(reader.u2());
      const descriptor = utf8(reader.u2());
      const attributeCount = reader.u2();
      for (let attributeIndex = 0; attributeIndex < attributeCount; attributeIndex += 1) {
        reader.u2();
        reader.skip(reader.u4());
      }
      if ((memberAccess & ACC_PUBLIC) === 0
          || (memberAccess & ACC_SYNTHETIC) !== 0
          || (kind === "method" && (memberAccess & ACC_BRIDGE) !== 0)
          || name === "<clinit>") continue;
      const memberKind = kind === "method" && name === "<init>" ? "constructor" : kind;
      members.push({
        kind: memberKind,
        name,
        descriptor,
        declaration: declarationFor(
          thisClass,
          memberKind,
          name,
          descriptor,
          (memberAccess & ACC_STATIC) !== 0,
        ),
      });
    }
  };

  readMemberTable("field");
  readMemberTable("method");
  return {
    name: thisClass,
    publicType,
    kind: (access & ACC_ANNOTATION) !== 0
      ? "annotation"
      : (access & ACC_ENUM) !== 0
        ? "enum"
        : (access & ACC_INTERFACE) !== 0
          ? "interface"
          : "class",
    superTypes: [...new Set(superTypes)].sort(compareText),
    members: members.sort((left, right) => compareText(memberKey(left), memberKey(right))),
  };
}

function declarationFor(
  declaringType: string,
  kind: ParsedPublicJvmMember["kind"],
  name: string,
  descriptor: string,
  staticMember: boolean,
): string {
  const modifier = staticMember ? " static" : "";
  if (kind === "field") return `public${modifier} ${decodeFieldDescriptor(descriptor)} ${name};`;
  const method = decodeMethodDescriptor(descriptor);
  if (kind === "constructor") {
    const simpleName = sourceTypeName(declaringType).split(".").at(-1) ?? declaringType;
    return `public ${simpleName}(${method.parameters.join(", ")})`;
  }
  return `public${modifier} ${method.returnType} ${name}(${method.parameters.join(", ")})`;
}

export function decodeFieldDescriptor(descriptor: string): string {
  const parsed = decodeType(descriptor, 0);
  if (parsed.offset !== descriptor.length) throw new Error(`Invalid JVM field descriptor ${descriptor}`);
  return parsed.type;
}

export function decodeMethodDescriptor(
  descriptor: string,
): { parameters: string[]; returnType: string } {
  if (!descriptor.startsWith("(")) throw new Error(`Invalid JVM method descriptor ${descriptor}`);
  let offset = 1;
  const parameters: string[] = [];
  while (descriptor[offset] !== ")") {
    if (offset >= descriptor.length) throw new Error(`Invalid JVM method descriptor ${descriptor}`);
    const parsed = decodeType(descriptor, offset);
    parameters.push(parsed.type);
    offset = parsed.offset;
  }
  const returned = decodeType(descriptor, offset + 1);
  if (returned.offset !== descriptor.length) throw new Error(`Invalid JVM method descriptor ${descriptor}`);
  return { parameters, returnType: returned.type };
}

function decodeType(descriptor: string, start: number): { type: string; offset: number } {
  let offset = start;
  let dimensions = 0;
  while (descriptor[offset] === "[") {
    dimensions += 1;
    offset += 1;
  }
  const primitive: Record<string, string> = {
    B: "byte",
    C: "char",
    D: "double",
    F: "float",
    I: "int",
    J: "long",
    S: "short",
    V: "void",
    Z: "boolean",
  };
  const code = descriptor[offset];
  let type: string;
  if (code === "L") {
    const end = descriptor.indexOf(";", offset);
    if (end < 0) throw new Error(`Invalid JVM object descriptor ${descriptor}`);
    type = sourceTypeName(descriptor.slice(offset + 1, end).replaceAll("/", "."));
    offset = end + 1;
  } else if (primitive[code]) {
    type = primitive[code];
    offset += 1;
  } else {
    throw new Error(`Invalid JVM type descriptor ${descriptor}`);
  }
  return { type: `${type}${"[]".repeat(dimensions)}`, offset };
}

function sourceTypeName(binaryName: string): string {
  return binaryName.replaceAll("$", ".");
}

function memberKey(member: ParsedPublicJvmMember): string {
  return `${member.kind}:${member.name}:${member.descriptor}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
