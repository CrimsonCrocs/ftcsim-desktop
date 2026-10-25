import { isTrustedLibraryAdapter, isRedirectedLegacyLog, LEGACY_LOG_ADAPTER } from "./library-adapters";
import { isRenderedVisionClass, isRenderedVisionMember } from "./vision-compatibility";
import { isSupportedOpModeInheritedMember } from "./opmode-inherited-surface";
import { PATHING_SDK_CLASSES, PATHING_SDK_VALUE_CLASSES, PATHING_SDK_MEMBERS } from "./pathing-sdk-surface";
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { BuildDiagnostic } from "@ftc-studio/opmode-protocol";

import {
  FTC_SDK_VERSION,
  UNSUPPORTED_RESOLVED_LIBRARY_POLICIES,
} from "./ftc-sdk-toolchain";

type CompatibilityClassification =
  | "physically-modeled"
  | "behaviorally-modeled"
  | "compile-only-utility"
  | "unsupported";

interface SurfaceMember {
  kind: "constructor" | "field" | "method";
  name: string;
  descriptor: string;
  classification: CompatibilityClassification;
}

interface SurfaceClass {
  name: string;
  superTypes: string[];
  classification: CompatibilityClassification;
  members: SurfaceMember[];
}

interface SurfaceManifest {
  sdkVersion: string;
  classes: SurfaceClass[];
}

interface CompatibilityIndex {
  sdkVersion: string;
  classes: Map<string, SurfaceClass>;
}

type ConstantPoolEntry =
  | { tag: 1; value: string }
  | { tag: 7; nameIndex: number }
  | { tag: 9 | 10 | 11; classIndex: number; nameAndTypeIndex: number }
  | { tag: 12; nameIndex: number; descriptorIndex: number }
  | { tag: 16; descriptorIndex: number }
  | { tag: number };

interface BytecodeMemberReference {
  owner: string;
  name: string;
  descriptor: string;
  kind: "constructor" | "field" | "method";
}

interface ParsedClassReferences {
  className: string;
  classes: Set<string>;
  members: BytecodeMemberReference[];
}

export const DEFAULT_SDK_SURFACE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/sdk-surface-11.1.0.json",
);

const manifestCache = new Map<string, Promise<CompatibilityIndex>>();

const RUNNER_SHIM_PREFIXES = [
  "com.qualcomm.",
  "org.firstinspires.ftc.vision.",
  "org.opencv.",
  "org.openftc.easyopencv.",
  "android.",
  "org.firstinspires.ftc.robotcore.",
  "org.firstinspires.ftc.sim.",
] as const;

const SIMULATOR_INTERNAL_PREFIX = "org.firstinspires.ftc.sim.";

// Narrow Vision support backed by world-provided AprilTag observations. Other SDK Vision classes
// and members remain unsupported, including native image processors and portal controls.
const SIMULATOR_SUPPORTED_VISION_CLASSES = new Set([
  "org.firstinspires.ftc.vision.VisionPortal",
  "org.firstinspires.ftc.vision.VisionPortal$Builder",
  "org.firstinspires.ftc.vision.VisionProcessor",
  "org.firstinspires.ftc.vision.apriltag.AprilTagProcessor",
  "org.firstinspires.ftc.vision.apriltag.AprilTagDetection",
  "org.firstinspires.ftc.vision.apriltag.AprilTagMetadata",
  "org.firstinspires.ftc.vision.apriltag.AprilTagPoseFtc",
  "org.firstinspires.ftc.robotcore.external.hardware.camera.CameraName",
  "org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName",
]);

const SIMULATOR_SUPPORTED_VISION_MEMBERS = new Set([
  "org.firstinspires.ftc.vision.VisionPortal$Builder|constructor|<init>|()V",
  "org.firstinspires.ftc.vision.VisionPortal$Builder|method|setCamera|(Lorg/firstinspires/ftc/robotcore/external/hardware/camera/CameraName;)Lorg/firstinspires/ftc/vision/VisionPortal$Builder;",
  "org.firstinspires.ftc.vision.VisionPortal$Builder|method|addProcessor|(Lorg/firstinspires/ftc/vision/VisionProcessor;)Lorg/firstinspires/ftc/vision/VisionPortal$Builder;",
  "org.firstinspires.ftc.vision.VisionPortal$Builder|method|build|()Lorg/firstinspires/ftc/vision/VisionPortal;",
  "org.firstinspires.ftc.vision.apriltag.AprilTagProcessor|method|easyCreateWithDefaults|()Lorg/firstinspires/ftc/vision/apriltag/AprilTagProcessor;",
  "org.firstinspires.ftc.vision.apriltag.AprilTagProcessor|method|getDetections|()Ljava/util/ArrayList;",
  "org.firstinspires.ftc.vision.apriltag.AprilTagProcessor|method|getFreshDetections|()Ljava/util/ArrayList;",
  "org.firstinspires.ftc.vision.apriltag.AprilTagProcessor|method|setDecimation|(F)V",
  "org.firstinspires.ftc.vision.apriltag.AprilTagDetection|field|id|I",
  "org.firstinspires.ftc.vision.apriltag.AprilTagDetection|field|metadata|Lorg/firstinspires/ftc/vision/apriltag/AprilTagMetadata;",
  "org.firstinspires.ftc.vision.apriltag.AprilTagDetection|field|ftcPose|Lorg/firstinspires/ftc/vision/apriltag/AprilTagPoseFtc;",
  "org.firstinspires.ftc.vision.apriltag.AprilTagDetection|field|frameAcquisitionNanoTime|J",
  "org.firstinspires.ftc.vision.apriltag.AprilTagMetadata|field|id|I",
  "org.firstinspires.ftc.vision.apriltag.AprilTagMetadata|field|name|Ljava/lang/String;",
  "org.firstinspires.ftc.vision.apriltag.AprilTagMetadata|field|tagsize|D",
  ...["x", "y", "z", "yaw", "pitch", "roll", "range", "bearing", "elevation"].map((name) => (
  `org.firstinspires.ftc.vision.apriltag.AprilTagPoseFtc|field|${name}|D`
  )),
]);

// Pinpoint support is descriptor-scoped because the official class includes raw hardware and
// transport operations that the world-backed shim does not implement. Keep this list aligned
// with the generator's member classifications; admitting the class alone would over-admit it.
const SIMULATOR_SUPPORTED_PINPOINT_CLASS =
  "com.qualcomm.hardware.gobilda.GoBildaPinpointDriver";
const SIMULATOR_SUPPORTED_PINPOINT_CLASSES = new Set([
  SIMULATOR_SUPPORTED_PINPOINT_CLASS,
]);
const SIMULATOR_SUPPORTED_PINPOINT_MEMBERS = new Set([
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getDeviceStatus|()Lcom/qualcomm/hardware/gobilda/GoBildaPinpointDriver$DeviceStatus;`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getHeading|(Lorg/firstinspires/ftc/robotcore/external/navigation/AngleUnit;)D`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getHeading|(Lorg/firstinspires/ftc/robotcore/external/navigation/UnnormalizedAngleUnit;)D`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getHeadingVelocity|(Lorg/firstinspires/ftc/robotcore/external/navigation/UnnormalizedAngleUnit;)D`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getPitch|(Lorg/firstinspires/ftc/robotcore/external/navigation/AngleUnit;)D`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getPosX|(Lorg/firstinspires/ftc/robotcore/external/navigation/DistanceUnit;)D`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getPosY|(Lorg/firstinspires/ftc/robotcore/external/navigation/DistanceUnit;)D`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getPosition|()Lorg/firstinspires/ftc/robotcore/external/navigation/Pose2D;`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getQuaternion|()Lorg/firstinspires/ftc/robotcore/external/navigation/Quaternion;`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getRoll|(Lorg/firstinspires/ftc/robotcore/external/navigation/AngleUnit;)D`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getVelX|(Lorg/firstinspires/ftc/robotcore/external/navigation/DistanceUnit;)D`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getVelY|(Lorg/firstinspires/ftc/robotcore/external/navigation/DistanceUnit;)D`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|getYawScalar|()F`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|resetPosAndIMU|()V`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|setPosition|(Lorg/firstinspires/ftc/robotcore/external/navigation/Pose2D;)V`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|setYawScalar|(D)V`,
  `${SIMULATOR_SUPPORTED_PINPOINT_CLASS}|method|update|()V`,
]);

function isSimulatorSupportedVisionClass(name: string): boolean {
  return SIMULATOR_SUPPORTED_VISION_CLASSES.has(name) || isRenderedVisionClass(name)
    || name === "org.firstinspires.ftc.robotcore.internal.camera.calibration.CameraCalibration";
}

function isSimulatorSupportedVisionMember(reference: BytecodeMemberReference): boolean {
  return isRenderedVisionMember(reference) || SIMULATOR_SUPPORTED_VISION_MEMBERS.has(
    `${reference.owner}|${reference.kind}|${reference.name}|${reference.descriptor}`,
  );
}

function isSimulatorSupportedPinpointClass(name: string): boolean {
  return SIMULATOR_SUPPORTED_PINPOINT_CLASSES.has(name) || PATHING_SDK_CLASSES.has(name) || PATHING_SDK_VALUE_CLASSES.has(name);
}

function isSimulatorSupportedPinpointMember(reference: BytecodeMemberReference): boolean {
  const key = `${reference.owner}|${reference.kind}|${reference.name}|${reference.descriptor}`;
  return SIMULATOR_SUPPORTED_PINPOINT_MEMBERS.has(key) || PATHING_SDK_MEMBERS.has(key);
}

const UNSUPPORTED_JVM_CLASS_POLICIES = [
  { match: (name: string) => name.startsWith("java.net."), label: "network access" },
  { match: (name: string) => name.startsWith("javax.net."), label: "network access" },
  { match: (name: string) => name.startsWith("java.nio.file."), label: "host filesystem access" },
  { match: (name: string) => name.startsWith("java.nio.channels."), label: "host I/O access" },
  { match: (name: string) => name.startsWith("java.lang.reflect."), label: "runtime reflection" },
  { match: (name: string) => name.startsWith("java.lang.management."), label: "JVM management access" },
  { match: (name: string) => name.startsWith("javax.management."), label: "JVM management access" },
  { match: (name: string) => name.startsWith("javax.script."), label: "dynamic code execution" },
  { match: (name: string) => name.startsWith("java.rmi."), label: "remote execution" },
  { match: (name: string) => name.startsWith("sun."), label: "JVM internals" },
  { match: (name: string) => name.startsWith("jdk."), label: "JVM internals" },
  {
    match: (name: string) => [
      "java.io.File",
      "java.io.FileInputStream",
      "java.io.FileOutputStream",
      "java.io.FileReader",
      "java.io.FileWriter",
      "java.io.RandomAccessFile",
      "java.io.ObjectInputStream",
      "java.io.ObjectOutputStream",
      "java.lang.ClassLoader",
      "java.lang.Process",
      "java.lang.ProcessBuilder",
      "java.lang.Runtime",
    ].includes(name),
    label: "host process or filesystem access",
  },
] as const;

const UNSUPPORTED_JVM_MEMBERS = [
  {
    owner: "java.lang.System",
    names: new Set([
      "exit",
      "getenv",
      "getProperties",
      "getProperty",
      "load",
      "loadLibrary",
      "setProperties",
      "setProperty",
      "setSecurityManager",
    ]),
    label: "host environment access",
  },
  {
    owner: "java.lang.Class",
    names: new Set([
      "forName",
      "getClassLoader",
      "getDeclaredConstructor",
      "getDeclaredConstructors",
      "getDeclaredField",
      "getDeclaredFields",
      "getDeclaredMethod",
      "getDeclaredMethods",
    ]),
    label: "runtime reflection",
  },
] as const;

async function loadCompatibilityIndex(path: string): Promise<CompatibilityIndex> {
  let pending = manifestCache.get(path);
  if (!pending) {
    pending = readFile(path, "utf8").then((source) => {
      const manifest = JSON.parse(source) as SurfaceManifest;
      if (!manifest.sdkVersion || !Array.isArray(manifest.classes)) {
        throw new Error(`Invalid FTC SDK compatibility manifest at ${path}`);
      }
      return {
        sdkVersion: manifest.sdkVersion,
        classes: new Map(manifest.classes.map((entry) => [entry.name, entry])),
      };
    });
    manifestCache.set(path, pending);
  }
  return pending;
}

function readU1(buffer: Buffer, cursor: { offset: number }): number {
  const value = buffer.readUInt8(cursor.offset);
  cursor.offset += 1;
  return value;
}

function readU2(buffer: Buffer, cursor: { offset: number }): number {
  const value = buffer.readUInt16BE(cursor.offset);
  cursor.offset += 2;
  return value;
}

function readU4(buffer: Buffer, cursor: { offset: number }): number {
  const value = buffer.readUInt32BE(cursor.offset);
  cursor.offset += 4;
  return value;
}

function skip(buffer: Buffer, cursor: { offset: number }, bytes: number): void {
  if (cursor.offset + bytes > buffer.length) throw new Error("Truncated JVM class file");
  cursor.offset += bytes;
}

function utf8(pool: Array<ConstantPoolEntry | undefined>, index: number): string {
  const entry = pool[index];
  if (!entry || entry.tag !== 1 || !("value" in entry)) {
    throw new Error(`Invalid JVM UTF-8 constant #${index}`);
  }
  return entry.value;
}

function className(pool: Array<ConstantPoolEntry | undefined>, index: number): string {
  const entry = pool[index];
  if (!entry || entry.tag !== 7 || !("nameIndex" in entry)) {
    throw new Error(`Invalid JVM class constant #${index}`);
  }
  const internalName = utf8(pool, entry.nameIndex);
  const arrayMatch = /^\[*L([^;]+);$/u.exec(internalName);
  return (arrayMatch?.[1] ?? internalName).replaceAll("/", ".");
}

/** Reads only the JVM constant-pool structures needed for exact class/member references. */
export function parseClassReferences(buffer: Buffer): ParsedClassReferences {
  if (buffer.length < 10 || buffer.readUInt32BE(0) !== 0xcafebabe) {
    throw new Error("Invalid JVM class file magic");
  }
  const cursor = { offset: 8 };
  const constantPoolCount = readU2(buffer, cursor);
  const pool: Array<ConstantPoolEntry | undefined> = new Array(constantPoolCount);

  for (let index = 1; index < constantPoolCount; index += 1) {
    const tag = readU1(buffer, cursor);
    switch (tag) {
      case 1: {
        const length = readU2(buffer, cursor);
        if (cursor.offset + length > buffer.length) throw new Error("Truncated JVM UTF-8 constant");
        pool[index] = { tag, value: buffer.toString("utf8", cursor.offset, cursor.offset + length) };
        cursor.offset += length;
        break;
      }
      case 3:
      case 4:
        pool[index] = { tag };
        skip(buffer, cursor, 4);
        break;
      case 5:
      case 6:
        pool[index] = { tag };
        skip(buffer, cursor, 8);
        index += 1;
        break;
      case 7:
        pool[index] = { tag, nameIndex: readU2(buffer, cursor) };
        break;
      case 8:
      case 19:
      case 20:
        pool[index] = { tag };
        skip(buffer, cursor, 2);
        break;
      case 16:
        pool[index] = { tag, descriptorIndex: readU2(buffer, cursor) };
        break;
      case 9:
      case 10:
      case 11:
        pool[index] = {
          tag,
          classIndex: readU2(buffer, cursor),
          nameAndTypeIndex: readU2(buffer, cursor),
        };
        break;
      case 12:
        pool[index] = {
          tag,
          nameIndex: readU2(buffer, cursor),
          descriptorIndex: readU2(buffer, cursor),
        };
        break;
      case 15:
        pool[index] = { tag };
        skip(buffer, cursor, 3);
        break;
      case 17:
      case 18:
        pool[index] = { tag };
        skip(buffer, cursor, 4);
        break;
      default:
        throw new Error(`Unsupported JVM constant-pool tag ${tag}`);
    }
  }

  skip(buffer, cursor, 2); // access_flags
  const thisClassIndex = readU2(buffer, cursor);
  const referencedClasses = new Set<string>();
  const memberReferences: BytecodeMemberReference[] = [];

  const addDescriptorClasses = (descriptor: string) => {
    for (const match of descriptor.matchAll(/L([^;]+);/gu)) {
      referencedClasses.add(match[1].replaceAll("/", "."));
    }
  };

  const superClassIndex = readU2(buffer, cursor);
  if (superClassIndex !== 0) referencedClasses.add(className(pool, superClassIndex));
  const interfacesCount = readU2(buffer, cursor);
  for (let index = 0; index < interfacesCount; index += 1) {
    referencedClasses.add(className(pool, readU2(buffer, cursor)));
  }

  const readDeclaredMembers = () => {
    const memberCount = readU2(buffer, cursor);
    for (let index = 0; index < memberCount; index += 1) {
      skip(buffer, cursor, 2); // access_flags
      skip(buffer, cursor, 2); // name_index
      addDescriptorClasses(utf8(pool, readU2(buffer, cursor)));
      const attributeCount = readU2(buffer, cursor);
      for (let attribute = 0; attribute < attributeCount; attribute += 1) {
        skip(buffer, cursor, 2); // attribute_name_index
        skip(buffer, cursor, readU4(buffer, cursor));
      }
    }
  };
  readDeclaredMembers(); // fields
  readDeclaredMembers(); // methods

  for (let index = 1; index < pool.length; index += 1) {
    const entry = pool[index];
    if (!entry) continue;
    if (entry.tag === 7) referencedClasses.add(className(pool, index));
    if (entry.tag === 12 && "descriptorIndex" in entry) {
      addDescriptorClasses(utf8(pool, entry.descriptorIndex));
    }
    if (entry.tag === 16 && "descriptorIndex" in entry) {
      addDescriptorClasses(utf8(pool, entry.descriptorIndex));
    }
    if ((entry.tag !== 9 && entry.tag !== 10 && entry.tag !== 11)
        || !("nameAndTypeIndex" in entry) || !("classIndex" in entry)) continue;
    const nameAndType = pool[entry.nameAndTypeIndex];
    if (!nameAndType || nameAndType.tag !== 12
        || !("nameIndex" in nameAndType) || !("descriptorIndex" in nameAndType)) {
      throw new Error(`Invalid JVM name-and-type constant #${entry.nameAndTypeIndex}`);
    }
    const name = utf8(pool, nameAndType.nameIndex);
    memberReferences.push({
      owner: className(pool, entry.classIndex),
      name,
      descriptor: utf8(pool, nameAndType.descriptorIndex),
      kind: entry.tag === 9 ? "field" : name === "<init>" ? "constructor" : "method",
    });
  }

  return {
    className: className(pool, thisClassIndex),
    classes: referencedClasses,
    members: memberReferences,
  };
}

function findSurfaceMember(
  index: CompatibilityIndex,
  owner: string,
  reference: BytecodeMemberReference,
  visited = new Set<string>(),
): SurfaceMember | undefined {
  if (visited.has(owner)) return undefined;
  visited.add(owner);
  const entry = index.classes.get(owner);
  if (!entry) return undefined;
  const direct = entry.members.find((member) => (
    member.kind === reference.kind
    && member.name === reference.name
    && member.descriptor === reference.descriptor
  ));
  if (direct || reference.kind === "constructor") return direct;
  for (const superType of entry.superTypes) {
    const inherited = findSurfaceMember(index, superType, reference, visited);
    if (inherited) return inherited;
  }
  return undefined;
}

async function listClassFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) return listClassFiles(root, path);
    return entry.isFile() && entry.name.endsWith(".class") ? [path] : [];
  }));
  return nested.flat();
}

/**
 * Fail-closed compatibility gate for compiled TeamCode. Unlike source regexes, this compares
 * the owner, member kind, name, and JVM descriptor recorded in each emitted class file.
 */
export async function scanSdkBytecodeCompatibility(
  classesRoot: string,
  manifestPath = DEFAULT_SDK_SURFACE_PATH,
  entryClasses?: readonly string[],
): Promise<BuildDiagnostic[]> {
  const index = await loadCompatibilityIndex(manifestPath);
  const files = await listClassFiles(classesRoot);
  const diagnostics: BuildDiagnostic[] = [];
  const emitted = new Set<string>();
  const parsedFiles = await Promise.all(files.map(async (path) => ({
    path,
    bytes: await readFile(path),
  })));
  const referencedFiles = parsedFiles.map(entry => ({...entry, parsed: parseClassReferences(entry.bytes)}));
  const parsedByName = new Map(referencedFiles.map((entry) => [entry.parsed.className, entry]));
  const selectedNames = entryClasses ? reachableTeamCodeClasses(entryClasses, parsedByName, referencedFiles.some(entry => entry.parsed.className === LEGACY_LOG_ADAPTER && isTrustedLibraryAdapter(entry.path, entry.bytes))) : undefined;

  for (const { path, parsed, bytes } of referencedFiles) {
    if (selectedNames && !selectedNames.has(parsed.className)) continue;
    // The compiler output also contains the trusted simulator shim. Its private fields, synthetic
    // enum members, and simulator-only lifecycle hooks are intentionally absent from the official
    // public SDK manifest. Only emitted TeamCode bytecode belongs at this compatibility gate.
    if (RUNNER_SHIM_PREFIXES.some((prefix) => parsed.className.startsWith(prefix)) || isTrustedLibraryAdapter(path, bytes)) continue;
    const displayFile = relative(classesRoot, path).replaceAll("\\", "/");

    for (const owner of parsed.classes) {
      const jvmPolicy = UNSUPPORTED_JVM_CLASS_POLICIES.find((policy) => policy.match(owner));
      if (jvmPolicy) {
        const key = `${displayFile}:jvm-class:${owner}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        diagnostics.push({
          kind: "error",
          file: displayFile,
          code: "UNSUPPORTED_JVM_API",
          message: `JVM ${jvmPolicy.label} through ${owner} is unavailable to hosted TeamCode`,
        });
        continue;
      }
      if (owner.startsWith(SIMULATOR_INTERNAL_PREFIX)) {
        const key = `${displayFile}:internal:${owner}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        diagnostics.push({
          kind: "error",
          file: displayFile,
          code: "UNSUPPORTED_SIMULATOR_INTERNAL",
          message: `Simulator-internal class ${owner} cannot be referenced by TeamCode`,
        });
        continue;
      }
      const resolvedLibraryPolicy = UNSUPPORTED_RESOLVED_LIBRARY_POLICIES.find((policy) => (
        owner.startsWith(policy.packagePrefix)
      ));
      if (resolvedLibraryPolicy) {
        if (isSimulatorSupportedVisionClass(owner)) continue;
        const key = `${displayFile}:resolved-library:${owner}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        diagnostics.push({
          kind: "error",
          file: displayFile,
          code: resolvedLibraryPolicy.code,
          message: `${resolvedLibraryPolicy.label} class ${owner} is unavailable to the simulator JVM for FTC SDK ${FTC_SDK_VERSION}; ${resolvedLibraryPolicy.reason}.`,
        });
        continue;
      }
      const surfaceClass = index.classes.get(owner);
      if (owner === "org.firstinspires.ftc.robotcore.internal.system.Misc") continue;
      if (!surfaceClass && RUNNER_SHIM_PREFIXES.some((prefix) => owner.startsWith(prefix)) && !isSimulatorSupportedVisionClass(owner)) {
        const key = `${displayFile}:non-sdk:${owner}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        diagnostics.push({
          kind: "error",
          file: displayFile,
          code: "UNSUPPORTED_SDK_CLASS",
          message: `${owner} is not part of the official FTC SDK ${index.sdkVersion} TeamCode surface`,
        });
        continue;
      }
      if (!surfaceClass || surfaceClass.classification !== "unsupported"
          || isSimulatorSupportedVisionClass(owner)
          || isSimulatorSupportedPinpointClass(owner)) continue;
      const key = `${displayFile}:class:${owner}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      diagnostics.push({
        kind: "error",
        file: displayFile,
        code: "UNSUPPORTED_SDK_CLASS",
        message: `FTC SDK ${index.sdkVersion} class ${owner} is classified unsupported by this simulator runtime`,
      });
    }

    for (const reference of parsed.members) {
      const jvmMemberPolicy = UNSUPPORTED_JVM_MEMBERS.find((policy) => (
        policy.owner === reference.owner && policy.names.has(reference.name)
      ));
      if (jvmMemberPolicy) {
        const signature = `${reference.owner}.${reference.name}${reference.descriptor}`;
        const key = `${displayFile}:jvm-member:${signature}`;
        if (!emitted.has(key)) {
          emitted.add(key);
          diagnostics.push({
            kind: "error",
            file: displayFile,
            code: "UNSUPPORTED_JVM_API",
            message: `JVM ${jvmMemberPolicy.label} through ${signature} is unavailable to hosted TeamCode`,
          });
        }
        continue;
      }
      if (reference.owner.startsWith(SIMULATOR_INTERNAL_PREFIX)) continue;
      if (reference.owner === "org.firstinspires.ftc.robotcore.internal.system.Misc") {
        if (reference.kind === "method" && ["formatInvariant", "formatForUser"].includes(reference.name)
            && reference.descriptor === "(Ljava/lang/String;[Ljava/lang/Object;)Ljava/lang/String;") continue;
        diagnostics.push({kind:"error",file:displayFile,code:"UNSUPPORTED_SDK_MEMBER",message:`SDK utility ${reference.owner}.${reference.name}${reference.descriptor} is not implemented`});
        continue;
      }
      if (isRenderedVisionMember(reference) || isSupportedOpModeInheritedMember(reference)) continue;
      if (!index.classes.has(reference.owner) && !isRenderedVisionClass(reference.owner)) continue;
      const member = findSurfaceMember(index, reference.owner, reference);
      if ((member && member.classification !== "unsupported")
          || isSimulatorSupportedVisionMember(reference)
          || isSimulatorSupportedPinpointMember(reference)) continue;
      const signature = `${reference.owner}.${reference.name}${reference.descriptor}`;
      const key = `${displayFile}:member:${signature}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      diagnostics.push({
        kind: "error",
        file: displayFile,
        code: "UNSUPPORTED_SDK_MEMBER",
        message: `FTC SDK ${index.sdkVersion} member ${signature} is not available in this simulator runtime`,
      });
    }
  }

  return diagnostics;
}

function reachableTeamCodeClasses(
  entryClasses: readonly string[],
  classes: ReadonlyMap<string, { parsed: ParsedClassReferences }>,
  hasLegacyLogAdapter = false,
): Set<string> {
  const reachable = new Set<string>();
  const pending = [...entryClasses];
  while (pending.length > 0) {
    const name = pending.pop();
    if (!name || reachable.has(name)) continue;
    reachable.add(name);
    for (const reference of classes.get(name)?.parsed.classes ?? []) {
      const calls = classes.get(name)?.parsed.members.filter(member => member.owner === reference) ?? [];
      if (hasLegacyLogAdapter && calls.length > 0 && calls.every(isRedirectedLegacyLog)) continue;
      if (classes.has(reference) && !reachable.has(reference)) pending.push(reference);
    }
  }
  return reachable;
}
