import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export type OpModeLanguage = "java" | "kotlin" | "blocks";
export type OpModeKind = "teleop" | "autonomous";

export interface NewOpModeInput {
  className: string;
  packageName: string;
  language: OpModeLanguage;
  kind: OpModeKind;
  group: string;
}

export interface OpModePaths {
  sourcePath: string;
  generatedJavaPath?: string;
}

export const BLOCKS_GENERATOR_VERSION = "ftc-offline-2026-sanitized-v2";
export const BLOCKS_SOURCE_MAX_BYTES = 2_000_000;
export const GENERATED_BLOCKS_JAVA_MAX_BYTES = 2_000_000;
export const GENERATED_BLOCKS_MARKER = "@ftcsim-generated-from-blocks";

const JAVA_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const JAVA_PACKAGE = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u;
const GENERATED_SOURCE_PATTERN = new RegExp(
  String.raw`^// ${GENERATED_BLOCKS_MARKER} source=(\S+) sha256=([a-f0-9]{64}) outputSha256=([a-f0-9]{64}) generator=(\S+) configuration=(\S+)$`,
  "mu",
);
const LEGACY_GENERATED_SOURCE_PATTERN = new RegExp(
  String.raw`^// ${GENERATED_BLOCKS_MARKER} source=(\S+)`,
  "mu",
);

export interface GeneratedBlocksMetadata {
  sourcePath: string;
  sourceHash: string;
  outputHash: string;
  generatorVersion: string;
  configurationHash: string;
}

export interface BlocksDocumentIdentity {
  className: string;
  packageName: string;
  generatedJavaPath: string;
}

export interface BlocksBuildDiagnostic {
  kind: "error";
  file: string;
  code: string;
  message: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeJava(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}

export function validateNewOpModeInput(input: NewOpModeInput): string | null {
  if (!JAVA_IDENTIFIER.test(input.className)) return "Class name must be a valid Java identifier.";
  if (!JAVA_PACKAGE.test(input.packageName)) return "Package must be a valid Java package name.";
  if (input.group.length > 80) return "Group must be 80 characters or fewer.";
  if (/[\r\n]/u.test(input.group)) return "Group must stay on one line.";
  return null;
}

export function opModePaths(
  packageName: string,
  className: string,
  language: OpModeLanguage,
): OpModePaths {
  const packagePath = packageName.replaceAll(".", "/");
  if (language === "blocks") {
    return {
      sourcePath: `TeamCode/src/main/blocks/${packagePath}/${className}.blk`,
      generatedJavaPath: `TeamCode/src/main/java/${packagePath}/${className}.java`,
    };
  }
  return {
    sourcePath: `TeamCode/src/main/${language}/${packagePath}/${className}.${language === "java" ? "java" : "kt"}`,
  };
}

export function blocksDocumentIdentity(sourcePath: string): BlocksDocumentIdentity | null {
  const match = /^TeamCode\/src\/main\/blocks\/(.+)\/([A-Za-z_$][A-Za-z0-9_$]*)\.blk$/u.exec(sourcePath);
  if (!match) return null;
  const packageName = match[1].split("/").join(".");
  if (!JAVA_PACKAGE.test(packageName)) return null;
  return {
    className: match[2],
    packageName,
    generatedJavaPath: `TeamCode/src/main/java/${match[1]}/${match[2]}.java`,
  };
}

export function createStarterBlocksXml(input: Pick<NewOpModeInput, "kind" | "group">): string {
  const flavor = input.kind === "autonomous" ? "AUTONOMOUS" : "TELEOP";
  return [
    '<xml xmlns="https://developers.google.com/blockly/xml">',
    '<block type="procedures_defnoreturn" id="ftcsim_run_op_mode" deletable="false" x="32" y="32">',
    '<field name="NAME">runOpMode</field>',
    '<statement name="STACK">',
    '<block type="telemetry_addTextData_All" id="ftcsim_status">',
    '<value name="KEY"><shadow type="text" id="ftcsim_status_key"><field name="TEXT">Status</field></shadow></value>',
    '<value name="TEXT"><shadow type="text" id="ftcsim_status_value"><field name="TEXT">Initialized</field></shadow></value>',
    '<next><block type="telemetry_update" id="ftcsim_telemetry_update">',
    '<next><block type="linearOpMode_waitForStart" id="ftcsim_wait_for_start">',
    '<next><block type="controls_whileUntil" id="ftcsim_active_loop">',
    '<field name="MODE">WHILE</field>',
    '<value name="BOOL"><block type="linearOpMode_opModeIsActive" id="ftcsim_is_active"/></value>',
    '<statement name="DO"><block type="linearOpMode_idle" id="ftcsim_idle"/></statement>',
    "</block></next></block></next></block></next></block>",
    "</statement></block></xml>",
    "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>",
    `<Extra><OpModeMeta flavor="${flavor}" group="${escapeXml(input.group)}" autoTransition="" /><Enabled value="true" /></Extra>`,
  ].join("");
}

function annotation(input: Pick<NewOpModeInput, "className" | "kind" | "group">): string {
  const type = input.kind === "autonomous" ? "Autonomous" : "TeleOp";
  return `@${type}(name = "${escapeJava(input.className)}", group = "${escapeJava(input.group)}")`;
}

export function createStarterJava(input: NewOpModeInput): string {
  const annotationType = input.kind === "autonomous" ? "Autonomous" : "TeleOp";
  return `package ${input.packageName};

import com.qualcomm.robotcore.eventloop.opmode.${annotationType};
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

${annotation(input)}
public class ${input.className} extends LinearOpMode {
    @Override
    public void runOpMode() throws InterruptedException {
        telemetry.addData("Status", "Initialized");
        telemetry.update();
        waitForStart();

        while (opModeIsActive()) {
            idle();
        }
    }
}
`;
}

export function createStarterKotlin(input: NewOpModeInput): string {
  const annotationType = input.kind === "autonomous" ? "Autonomous" : "TeleOp";
  return `package ${input.packageName}

import com.qualcomm.robotcore.eventloop.opmode.${annotationType}
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode

${annotation(input)}
class ${input.className} : LinearOpMode() {
    override fun runOpMode() {
        telemetry.addData("Status", "Initialized")
        telemetry.update()
        waitForStart()

        while (opModeIsActive()) {
            idle()
        }
    }
}
`;
}

function hashTextSync(source: string, maximumBytes: number, label: string): string {
  const bytes = new TextEncoder().encode(source);
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`${label} exceeds the ${Math.round(maximumBytes / 1_000_000)} MB project limit.`);
  }
  return bytesToHex(sha256(bytes));
}

export function hashBlocksSource(source: string): Promise<string> {
  return Promise.resolve(hashBlocksSourceSync(source));
}

export function hashBlocksSourceSync(source: string): string {
  return hashTextSync(source, BLOCKS_SOURCE_MAX_BYTES, "Blocks source");
}

function generatedJavaBody(java: string): string {
  return java
    .replace(new RegExp(String.raw`^// ${GENERATED_BLOCKS_MARKER}[^\n]*\n?`, "mu"), "")
    .replace(/^\/\/ Read-only derived source\. Edit the paired \.blk OpMode instead\.\n?/mu, "")
    .trimStart();
}

export async function markGeneratedBlocksJava(
  java: string,
  sourcePath: string,
  sourceHash: string,
  packageName: string,
  configurationHash = "pending",
): Promise<string> {
  return markGeneratedBlocksJavaSync(
    java,
    sourcePath,
    sourceHash,
    packageName,
    configurationHash,
  );
}

export function markGeneratedBlocksJavaSync(
  java: string,
  sourcePath: string,
  sourceHash: string,
  packageName: string,
  configurationHash = "pending",
): string {
  const normalizedPackage = java.match(/^\s*package\s+[\w$.]+\s*;/mu)
    ? java.replace(/^\s*package\s+[\w$.]+\s*;/mu, `package ${packageName};`)
    : `package ${packageName};\n\n${java}`;
  const body = generatedJavaBody(normalizedPackage);
  const outputHash = hashTextSync(
    body,
    GENERATED_BLOCKS_JAVA_MAX_BYTES,
    "Generated Java",
  );
  return `// ${GENERATED_BLOCKS_MARKER} source=${sourcePath} sha256=${sourceHash} outputSha256=${outputHash} generator=${BLOCKS_GENERATOR_VERSION} configuration=${configurationHash}\n`
    + "// Read-only derived source. Edit the paired .blk OpMode instead.\n"
    + body;
}

export async function createNewOpModeFiles(input: NewOpModeInput): Promise<{
  paths: OpModePaths;
  files: Record<string, string>;
}> {
  const validationError = validateNewOpModeInput(input);
  if (validationError) throw new Error(validationError);
  const paths = opModePaths(input.packageName, input.className, input.language);
  if (input.language === "java") {
    return { paths, files: { [paths.sourcePath]: createStarterJava(input) } };
  }
  if (input.language === "kotlin") {
    return { paths, files: { [paths.sourcePath]: createStarterKotlin(input) } };
  }
  const sourceXml = createStarterBlocksXml(input);
  const sourceHash = await hashBlocksSource(sourceXml);
  const generatedJavaPath = paths.generatedJavaPath as string;
  return {
    paths,
    files: {
      [paths.sourcePath]: sourceXml,
      [generatedJavaPath]: await markGeneratedBlocksJava(
        createStarterJava(input),
        paths.sourcePath,
        sourceHash,
        input.packageName,
      ),
    },
  };
}

export function generatedBlocksSourcePath(java: string): string | null {
  return readGeneratedBlocksMetadata(java)?.sourcePath
    ?? LEGACY_GENERATED_SOURCE_PATTERN.exec(java)?.[1]
    ?? null;
}

export function isGeneratedBlocksJava(java: string): boolean {
  return generatedBlocksSourcePath(java) !== null;
}

export function readGeneratedBlocksMetadata(java: string): GeneratedBlocksMetadata | null {
  const match = GENERATED_SOURCE_PATTERN.exec(java);
  if (!match) return null;
  return {
    sourcePath: match[1],
    sourceHash: match[2],
    outputHash: match[3],
    generatorVersion: match[4],
    configurationHash: match[5],
  };
}

function generatedJavaPathForBlocksSource(sourcePath: string): string | null {
  return blocksDocumentIdentity(sourcePath)?.generatedJavaPath ?? null;
}

export async function validateBlocksGeneratedSources(
  files: Readonly<Record<string, string>>,
  configurationHash: string,
): Promise<BlocksBuildDiagnostic[]> {
  const diagnostics: BlocksBuildDiagnostic[] = [];
  const generatedJavaEntries = Object.entries(files)
    .filter(([path, source]) => (
      path.endsWith(".java") && source.includes(GENERATED_BLOCKS_MARKER)
    ))
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [javaPath, java] of generatedJavaEntries) {
    const sourcePath = generatedBlocksSourcePath(java);
    if (!sourcePath) {
      diagnostics.push({
        kind: "error",
        file: javaPath,
        code: "BLOCKS_JAVA_METADATA_INVALID",
        message: "This generated Blocks Java marker is incomplete. Regenerate it from the authoritative .blk source.",
      });
      continue;
    }
    const expectedJavaPath = generatedJavaPathForBlocksSource(sourcePath);
    if (files[sourcePath] === undefined) {
      diagnostics.push({
        kind: "error",
        file: javaPath,
        code: "BLOCKS_SOURCE_MISSING",
        message: "This generated Blocks Java file has no authoritative .blk source. Restore the paired Blocks file or remove the generated Java.",
      });
      continue;
    }
    if (expectedJavaPath !== javaPath) {
      diagnostics.push({
        kind: "error",
        file: javaPath,
        code: "BLOCKS_JAVA_UNEXPECTED_PATH",
        message: "Generated Blocks Java must stay at the deterministic Java path paired with its authoritative .blk source.",
      });
    }
  }
  const blocksPaths = Object.keys(files).filter((path) => path.endsWith(".blk")).sort();
  for (const sourcePath of blocksPaths) {
    const javaPath = generatedJavaPathForBlocksSource(sourcePath);
    if (!javaPath) {
      diagnostics.push({
        kind: "error",
        file: sourcePath,
        code: "BLOCKS_PATH_UNSUPPORTED",
        message: "Blocks OpModes must live under TeamCode/src/main/blocks so generated Java has a deterministic destination.",
      });
      continue;
    }
    const java = files[javaPath];
    if (java === undefined) {
      diagnostics.push({
        kind: "error",
        file: sourcePath,
        code: "BLOCKS_JAVA_MISSING",
        message: `Generated Java is missing. Open ${sourcePath.split("/").at(-1)} and save before Build.`,
      });
      continue;
    }
    const metadata = readGeneratedBlocksMetadata(java);
    if (!metadata) {
      diagnostics.push({
        kind: "error",
        file: javaPath,
        code: "BLOCKS_JAVA_UNMARKED",
        message: "The paired Java file is not recognized as FTC Simulator Blocks output.",
      });
      continue;
    }
    const sourceHash = await hashBlocksSource(files[sourcePath]);
    const outputHash = hashTextSync(
      generatedJavaBody(java),
      GENERATED_BLOCKS_JAVA_MAX_BYTES,
      "Generated Java",
    );
    if (metadata.sourcePath !== sourcePath
        || metadata.sourceHash !== sourceHash
        || metadata.outputHash !== outputHash
        || metadata.generatorVersion !== BLOCKS_GENERATOR_VERSION
        || metadata.configurationHash !== configurationHash) {
      diagnostics.push({
        kind: "error",
        file: sourcePath,
        code: "BLOCKS_JAVA_STALE",
        message: `Generated Java is stale for this Blocks source or robot configuration. Open ${sourcePath.split("/").at(-1)} and save before Build.`,
      });
    }
  }
  return diagnostics;
}
