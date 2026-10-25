import {
  LEGACY_SIMULATED_MOTOR_PROFILE,
  type SimulatedMotorDescriptor,
} from "@ftc-studio/opmode-protocol";

export const LIMITS = {
  requestBytes: 16 * 1024 * 1024,
  sourceFiles: 256,
  sourceFileBytes: 512 * 1024,
  sourceTotalBytes: 8 * 1024 * 1024,
  sourcePathCharacters: 240,
  entryClassCharacters: 255,
} as const;

export interface JavaSource {
  path: string;
  content: string;
}

export interface CompilePayload {
  sources: JavaSource[];
  entryClass: string;
}

export type GamepadValue = number | boolean;

export interface RunPayload extends CompilePayload {
  cycles?: number;
  cycleMillis?: number;
  hardware: { motors: SimulatedMotorDescriptor[]; servos: string[] };
  gamepad1: Record<string, GamepadValue>;
  gamepad2: Record<string, GamepadValue>;
}

export class PayloadValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super("Request payload is invalid");
    this.name = "PayloadValidationError";
    this.issues = issues;
  }
}

const JAVA_PATH_PATTERN = /^(?:[A-Za-z_$][A-Za-z0-9_$-]*\/)*[A-Za-z_$][A-Za-z0-9_$-]*\.java$/;
const JAVA_CLASS_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const COMPILE_KEYS = new Set(["protocolVersion", "sources", "entryClass"]);
const RUN_KEYS = new Set([
  ...COMPILE_KEYS,
  "cycles", "cycleMillis", "hardware", "gamepad1", "gamepad2",
]);
const SOURCE_KEYS = new Set(["path", "content"]);
const HARDWARE_KEYS = new Set(["motors", "servos"]);
const MOTOR_DESCRIPTOR_KEYS = new Set([
  "name",
  "modelId",
  "ticksPerRevolution",
  "maxRpm",
  "achievableMaxRpmFraction",
]);
const MOTOR_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "false", "final", "finally", "float", "for", "goto", "if",
  "implements", "import", "instanceof", "int", "interface", "long", "native",
  "new", "null", "package", "private", "protected", "public", "return", "short",
  "static", "strictfp", "super", "switch", "synchronized", "this", "throw",
  "throws", "transient", "true", "try", "void", "volatile", "while",
]);
const RESERVED_PACKAGES = [
  "android", "org.firstinspires.ftc.vision", "org.opencv", "org.openftc.easyopencv",
  "java",
  "javax",
  "jdk",
  "sun",
  "com.qualcomm",
  "org.firstinspires.ftc.robotcore",
  "org.firstinspires.ftc.sim",
];
const GAMEPAD_AXES = new Set([
  "left_stick_x", "left_stick_y", "right_stick_x", "right_stick_y",
]);
const GAMEPAD_TRIGGERS = new Set(["left_trigger", "right_trigger"]);
const GAMEPAD_BUTTONS = new Set([
  "a", "b", "x", "y",
  "dpad_up", "dpad_down", "dpad_left", "dpad_right",
  "left_bumper", "right_bumper", "left_stick_button", "right_stick_button",
  "start", "back", "guide",
]);

export function validateCompilePayload(
  value: unknown,
  allowedKeys: ReadonlySet<string> = COMPILE_KEYS,
): CompilePayload {
  const issues: string[] = [];
  if (!isRecord(value)) throw new PayloadValidationError(["body must be a JSON object"]);
  rejectUnknownKeys(value, allowedKeys, "body", issues);
  if (value.protocolVersion !== undefined && value.protocolVersion !== 1) {
    issues.push("protocolVersion must be 1 when provided");
  }

  const entryClass = value.entryClass;
  if (typeof entryClass !== "string"
      || entryClass.length > LIMITS.entryClassCharacters
      || !entryClass.includes(".")
      || !JAVA_CLASS_PATTERN.test(entryClass)
      || hasJavaKeywordSegment(entryClass)
      || isReservedEntryClass(entryClass)) {
    issues.push("entryClass must be a valid fully qualified Java class name");
  }

  const rawSources = value.sources;
  if (!Array.isArray(rawSources) || rawSources.length < 1) {
    issues.push("sources must contain at least one Java source");
  } else if (rawSources.length > LIMITS.sourceFiles) {
    issues.push(`sources cannot contain more than ${LIMITS.sourceFiles} files`);
  }

  const sources: JavaSource[] = [];
  const paths = new Set<string>();
  let totalBytes = 0;
  if (Array.isArray(rawSources)) {
    rawSources.slice(0, LIMITS.sourceFiles + 1).forEach((rawSource, index) => {
      if (!isRecord(rawSource)) {
        issues.push(`sources[${index}] must be an object`);
        return;
      }
      rejectUnknownKeys(rawSource, SOURCE_KEYS, `sources[${index}]`, issues);
      const path = rawSource.path;
      const content = rawSource.content;
      if (typeof path !== "string"
          || path.length > LIMITS.sourcePathCharacters
          || path.includes("\\")
          || !JAVA_PATH_PATTERN.test(path)) {
        issues.push(`sources[${index}].path must be a normalized relative .java path`);
      } else if (paths.has(path)) {
        issues.push(`sources[${index}].path duplicates ${path}`);
      } else {
        paths.add(path);
      }

      if (typeof content !== "string") {
        issues.push(`sources[${index}].content must be a string`);
      } else {
        const byteLength = new TextEncoder().encode(content).byteLength;
        totalBytes += byteLength;
        if (byteLength > LIMITS.sourceFileBytes) {
          issues.push(`sources[${index}].content exceeds ${LIMITS.sourceFileBytes} bytes`);
        }
        if (content.includes("\0")) issues.push(`sources[${index}].content cannot contain NUL`);
        if (/\\u+[0-9a-fA-F]{4}/.test(content)) {
          issues.push(`sources[${index}].content cannot contain Java Unicode escapes`);
        }
        const packageName = findPackageName(content);
        if (packageName && isReservedPackage(packageName)) {
          issues.push(`sources[${index}] cannot declare reserved package ${packageName}`);
        }
      }

      if (typeof path === "string" && typeof content === "string") sources.push({ path, content });
    });
  }
  if (totalBytes > LIMITS.sourceTotalBytes) {
    issues.push(`combined source content exceeds ${LIMITS.sourceTotalBytes} bytes`);
  }

  if (issues.length > 0 || typeof entryClass !== "string") {
    throw new PayloadValidationError(issues);
  }
  return { sources, entryClass };
}

export function validateRunPayload(value: unknown): RunPayload {
  const compile = validateCompilePayload(value, RUN_KEYS);
  const record = value as Record<string, unknown>;
  const issues: string[] = [];
  const cycles = optionalInteger(record.cycles, "cycles", 1, 10_000, issues);
  const cycleMillis = optionalInteger(record.cycleMillis, "cycleMillis", 1, 1_000, issues);
  if ((cycles ?? 50) * (cycleMillis ?? 20) > 30_000) {
    issues.push("cycles multiplied by cycleMillis cannot exceed 30000 milliseconds");
  }

  const hardware = validateHardware(record.hardware, issues);
  const gamepad1 = validateGamepad(record.gamepad1, "gamepad1", issues);
  const gamepad2 = validateGamepad(record.gamepad2, "gamepad2", issues);
  if (issues.length > 0) throw new PayloadValidationError(issues);

  return {
    ...compile,
    ...(cycles === undefined ? {} : { cycles }),
    ...(cycleMillis === undefined ? {} : { cycleMillis }),
    hardware,
    gamepad1,
    gamepad2,
  };
}

function optionalInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  issues: string[],
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    issues.push(`${field} must be an integer from ${minimum} through ${maximum}`);
    return undefined;
  }
  return value as number;
}

function validateHardware(
  value: unknown,
  issues: string[],
): { motors: SimulatedMotorDescriptor[]; servos: string[] } {
  if (value === undefined) return { motors: [], servos: [] };
  if (!isRecord(value)) {
    issues.push("hardware must be an object");
    return { motors: [], servos: [] };
  }
  rejectUnknownKeys(value, HARDWARE_KEYS, "hardware", issues);
  const motors = validateMotorDescriptors(value.motors, "hardware.motors", issues);
  const servos = validateDeviceNames(value.servos, "hardware.servos", issues);
  const allNames = [...motors.map((motor) => motor.name), ...servos];
  if (allNames.length > 128) issues.push("hardware cannot contain more than 128 devices");
  if (new Set(allNames).size !== allNames.length) {
    issues.push("hardware device names must be unique across motors and servos");
  }
  return { motors, servos };
}

export function validateMotorDescriptors(
  value: unknown,
  field: string,
  issues: string[],
): SimulatedMotorDescriptor[] {
  if (!Array.isArray(value)) {
    issues.push(`${field} must be an array`);
    return [];
  }
  const motors: SimulatedMotorDescriptor[] = [];
  value.forEach((raw, index) => {
    const entryField = `${field}[${index}]`;
    if (typeof raw === "string") {
      if (isValidDeviceName(raw)) {
        motors.push({ name: raw, ...LEGACY_SIMULATED_MOTOR_PROFILE });
      } else {
        issues.push(`${entryField} must be a trimmed device name of 1 through 128 characters`);
      }
      return;
    }
    if (!isRecord(raw)) {
      issues.push(`${entryField} must be a motor descriptor or legacy device name`);
      return;
    }
    rejectUnknownKeys(raw, MOTOR_DESCRIPTOR_KEYS, entryField, issues);
    const name = raw.name;
    const modelId = raw.modelId;
    const ticksPerRevolution = raw.ticksPerRevolution;
    const maxRpm = raw.maxRpm;
    const achievableMaxRpmFraction = raw.achievableMaxRpmFraction;
    let valid = true;
    if (!isValidDeviceName(name)) {
      issues.push(`${entryField}.name must be a trimmed device name of 1 through 128 characters`);
      valid = false;
    }
    if (typeof modelId !== "string" || !MOTOR_MODEL_ID.test(modelId)) {
      issues.push(`${entryField}.modelId must be a safe identifier of 1 through 128 characters`);
      valid = false;
    }
    if (!isPositiveFinite(ticksPerRevolution)) {
      issues.push(`${entryField}.ticksPerRevolution must be finite and greater than 0`);
      valid = false;
    }
    if (!isPositiveFinite(maxRpm)) {
      issues.push(`${entryField}.maxRpm must be finite and greater than 0`);
      valid = false;
    }
    if (!isPositiveFinite(achievableMaxRpmFraction) || achievableMaxRpmFraction > 1) {
      issues.push(`${entryField}.achievableMaxRpmFraction must be greater than 0 and at most 1`);
      valid = false;
    }
    if (valid) {
      motors.push({
        name: name as string,
        modelId: modelId as string,
        ticksPerRevolution: ticksPerRevolution as number,
        maxRpm: maxRpm as number,
        achievableMaxRpmFraction: achievableMaxRpmFraction as number,
      });
    }
  });
  return motors;
}

function validateDeviceNames(value: unknown, field: string, issues: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push(`${field} must be an array`);
    return [];
  }
  const names: string[] = [];
  value.forEach((name, index) => {
    if (!isValidDeviceName(name)) {
      issues.push(`${field}[${index}] must be a trimmed device name of 1 through 128 characters`);
    } else {
      names.push(name);
    }
  });
  return names;
}

function isValidDeviceName(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 128
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateGamepad(
  value: unknown,
  field: string,
  issues: string[],
): Record<string, GamepadValue> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    issues.push(`${field} must be an object`);
    return {};
  }
  const result: Record<string, GamepadValue> = {};
  for (const [control, controlValue] of Object.entries(value)) {
    if (GAMEPAD_BUTTONS.has(control)) {
      if (typeof controlValue !== "boolean") issues.push(`${field}.${control} must be boolean`);
      else result[control] = controlValue;
      continue;
    }
    const minimum = GAMEPAD_TRIGGERS.has(control) ? 0 : -1;
    if (GAMEPAD_AXES.has(control) || GAMEPAD_TRIGGERS.has(control)) {
      if (typeof controlValue !== "number"
          || !Number.isFinite(controlValue)
          || controlValue < minimum
          || controlValue > 1) {
        issues.push(`${field}.${control} must be a finite number from ${minimum} through 1`);
      } else {
        result[control] = controlValue;
      }
      continue;
    }
    issues.push(`${field}.${control} is not a supported gamepad control`);
  }
  return result;
}

function findPackageName(source: string): string | undefined {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\r\n]*/g, "");
  return withoutComments.match(/(?:^|\n)\s*package\s+([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*;/)?.[1];
}

function isReservedPackage(packageName: string): boolean {
  return RESERVED_PACKAGES.some((reserved) => packageName === reserved || packageName.startsWith(`${reserved}.`));
}

function isReservedEntryClass(entryClass: string): boolean {
  const separator = entryClass.lastIndexOf(".");
  return separator > 0 && isReservedPackage(entryClass.slice(0, separator));
}

function hasJavaKeywordSegment(className: string): boolean {
  return className.split(".").some((segment) => JAVA_KEYWORDS.has(segment));
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  field: string,
  issues: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`${field}.${key} is not supported`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
