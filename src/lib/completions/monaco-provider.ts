import type { Monaco } from "@monaco-editor/react";
import type { editor, IRange, languages, Position } from "monaco-editor";
import type { JvmCompletionCatalog, JvmMemberSymbol, JvmTypeSymbol } from "./language-index";
import {
  mergeProjectArtifactCompletionCatalog,
  projectArtifactCompletionCatalog,
  type ProjectArtifactCompletionEntry,
} from "./project-artifact-completions";

type SourceLanguage = "java" | "kotlin";

export interface ProjectSourceType {
  name: string;
  qualifiedName: string;
  packageName: string;
  path: string;
  members: ProjectSourceMember[];
}

export interface ProjectSourceMember {
  name: string;
  kind: "field" | "method";
  declaration: string;
  static: boolean;
}

export interface ImportCompletionContext {
  inImport: boolean;
  packagePrefix: string;
  qualifiedPrefix: string;
  query: string;
}

interface SourceImportPlan {
  currentPackage: string;
  importedByLeaf: Map<string, string>;
  importedQualifiedNames: Set<string>;
  insertionLine: number;
}

export interface CompletionProviderScope {
  projectId: string;
}

export function projectModelUri(projectId: string, path: string): string {
  const safeProjectId = encodeURIComponent(projectId);
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  return `ftcsim://${safeProjectId}/${safePath}`;
}

export function modelUriBelongsToProject(
  uri: Pick<editor.ITextModel["uri"], "scheme" | "authority">,
  projectId: string,
): boolean {
  if (uri.scheme !== "ftcsim") return false;
  try {
    return decodeURIComponent(uri.authority) === projectId;
  } catch {
    return false;
  }
}

function packageOf(source: string): string {
  return /\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*[;\n]/u.exec(source)?.[1] ?? "";
}

function maskNonCode(source: string): string {
  const masked = source.split("");
  let index = 0;
  while (index < source.length) {
    if (source.startsWith("//", index)) {
      masked[index] = " ";
      masked[index + 1] = " ";
      index += 2;
      while (index < source.length && source[index] !== "\n") masked[index++] = " ";
      continue;
    }
    if (source.startsWith("/*", index)) {
      masked[index] = " ";
      masked[index + 1] = " ";
      index += 2;
      while (index < source.length && !source.startsWith("*/", index)) {
        if (source[index] !== "\n") masked[index] = " ";
        index += 1;
      }
      if (index < source.length) {
        masked[index] = " ";
        masked[index + 1] = " ";
        index += 2;
      }
      continue;
    }
    const tripleQuoted = source.startsWith('\"\"\"', index);
    if (tripleQuoted || source[index] === '"' || source[index] === "'") {
      const quote = tripleQuoted ? '\"\"\"' : source[index];
      const quoteLength = quote.length;
      for (let offset = 0; offset < quoteLength; offset += 1) masked[index + offset] = " ";
      index += quoteLength;
      while (index < source.length && !source.startsWith(quote, index)) {
        if (source[index] !== "\n") masked[index] = " ";
        if (!tripleQuoted && source[index] === "\\" && index + 1 < source.length) {
          index += 1;
          if (source[index] !== "\n") masked[index] = " ";
        }
        index += 1;
      }
      if (index < source.length) {
        for (let offset = 0; offset < quoteLength; offset += 1) masked[index + offset] = " ";
        index += quoteLength;
      }
      continue;
    }
    index += 1;
  }
  return masked.join("");
}

function matchingBrace(source: string, openingBrace: number): number {
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return source.length;
}

function directMemberMatches(
  source: string,
  maskedSource: string,
  pattern: RegExp,
  kind: ProjectSourceMember["kind"],
): ProjectSourceMember[] {
  const depthAt = new Int32Array(maskedSource.length + 1);
  let depth = 0;
  for (let index = 0; index < maskedSource.length; index += 1) {
    depthAt[index] = depth;
    if (maskedSource[index] === "{") depth += 1;
    else if (maskedSource[index] === "}") depth = Math.max(0, depth - 1);
  }
  const members: ProjectSourceMember[] = [];
  for (const match of maskedSource.matchAll(pattern)) {
    if (match.index === undefined || depthAt[match.index] !== 0) continue;
    const declaration = source.slice(match.index, match.index + match[0].length);
    members.push({
      name: match[1],
      kind,
      declaration,
      static: /\bstatic\b/u.test(declaration),
    });
  }
  return members;
}

export function collectProjectSourceTypes(files: Record<string, string>): ProjectSourceType[] {
  const result: ProjectSourceType[] = [];
  for (const [path, source] of Object.entries(files)) {
    if (!/\.(?:java|kt)$/u.test(path)) continue;
    const packageName = packageOf(source);
    const masked = maskNonCode(source);
    const typePattern = /\b(?:class|interface|enum(?:\s+class)?|object)\s+([A-Za-z_$][\w$]*)/gu;
    const declarations = [...masked.matchAll(typePattern)];
    for (let declarationIndex = 0; declarationIndex < declarations.length; declarationIndex += 1) {
      const match = declarations[declarationIndex];
      const name = match[1];
      const nextDeclaration = declarations[declarationIndex + 1]?.index ?? masked.length;
      const openingBrace = masked.indexOf("{", (match.index ?? 0) + match[0].length);
      const hasBody = openingBrace >= 0 && openingBrace < nextDeclaration;
      const closingBrace = hasBody ? matchingBrace(masked, openingBrace) : openingBrace;
      const bodyStart = hasBody ? openingBrace + 1 : (match.index ?? 0) + match[0].length;
      const bodyEnd = hasBody ? closingBrace : nextDeclaration;
      const body = source.slice(bodyStart, bodyEnd);
      const maskedBody = masked.slice(bodyStart, bodyEnd);
      const javaMethod = /\b(?:public|protected)\s+(?:static\s+)?[A-Za-z_$][\w$.<>?\[\], ]*\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gu;
      const kotlinMethod = /\bfun\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gu;
      const kotlinField = /\b(?:val|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=\n]+)?/gu;
      const javaField = /\b(?:public|protected)\s+(?:static\s+)?(?:final\s+)?[A-Za-z_$][\w$.<>?\[\], ]*\s+([A-Za-z_$][\w$]*)\s*(?:[=;])/gu;
      const members = [
        ...directMemberMatches(body, maskedBody, javaMethod, "method"),
        ...directMemberMatches(body, maskedBody, kotlinMethod, "method"),
        ...directMemberMatches(body, maskedBody, javaField, "field"),
        ...directMemberMatches(body, maskedBody, kotlinField, "field"),
      ];
      result.push({
        name,
        qualifiedName: packageName ? `${packageName}.${name}` : name,
        packageName,
        path,
        members,
      });
    }
  }
  return result.sort((left, right) => left.qualifiedName.localeCompare(right.qualifiedName));
}

const projectSourceTypeCache = new WeakMap<Record<string, string>, ProjectSourceType[]>();

function cachedProjectSourceTypes(files: Record<string, string>): ProjectSourceType[] {
  const cached = projectSourceTypeCache.get(files);
  if (cached) return cached;
  const types = collectProjectSourceTypes(files);
  projectSourceTypeCache.set(files, types);
  return types;
}

function importMap(source: string): Map<string, string> {
  const imports = new Map<string, string>();
  for (const match of source.matchAll(/^\s*import\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)(?:\s*;)?\s*$/gmu)) {
    const qualified = match[1];
    imports.set(qualified.split(".").at(-1) ?? qualified, qualified);
  }
  return imports;
}

function sourceImportPlan(source: string): SourceImportPlan {
  const importedByLeaf = importMap(source);
  const lines = source.split("\n");
  let insertionLine = 1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*(?:package|import)\b/u.test(lines[index])) insertionLine = index + 2;
  }
  return {
    currentPackage: packageOf(source),
    importedByLeaf,
    importedQualifiedNames: new Set(importedByLeaf.values()),
    insertionLine,
  };
}

export function completionImportContext(linePrefix: string): ImportCompletionContext {
  const match = /^\s*import\s+(?!static\b)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.?)?$/u.exec(linePrefix);
  if (!match) return { inImport: false, packagePrefix: "", qualifiedPrefix: "", query: "" };
  const qualifiedPrefix = match[1] ?? "";
  const trailingDot = qualifiedPrefix.endsWith(".");
  const parts = qualifiedPrefix.replace(/\.$/u, "").split(".").filter(Boolean);
  return {
    inImport: true,
    qualifiedPrefix,
    packagePrefix: trailingDot ? parts.join(".") : parts.slice(0, -1).join("."),
    query: trailingDot ? "" : parts.at(-1) ?? "",
  };
}

function eraseType(typeName: string): string {
  return typeName.replace(/<.*>/u, "").replace(/\[\]$/u, "").trim();
}

export function inferReceiverType(source: string, receiver: string): string | null {
  const escaped = receiver.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const kotlinTyped = new RegExp(`\\b(?:val|var)\\s+${escaped}\\s*:\\s*([A-Za-z_$][\\w$.]*(?:<[^>]+>)?)`, "u").exec(source)?.[1];
  if (kotlinTyped) return eraseType(kotlinTyped);
  const javaTyped = new RegExp(`\\b([A-Z][\\w$.]*(?:<[^>]+>)?(?:\\[\\])?)\\s+${escaped}\\s*(?:[=;,)]|$)`, "mu").exec(source)?.[1];
  if (javaTyped) return eraseType(javaTyped);

  const hardwareGet = new RegExp(`\\b${escaped}\\s*=\\s*hardwareMap\\.get\\(\\s*([A-Za-z_$][\\w$.]*)\\s*(?:\\.class|::class\\.java)`, "u").exec(source)?.[1];
  if (hardwareGet) return eraseType(hardwareGet);

  const inherited: Record<string, string> = {
    gamepad1: "com.qualcomm.robotcore.hardware.Gamepad",
    gamepad2: "com.qualcomm.robotcore.hardware.Gamepad",
    hardwareMap: "com.qualcomm.robotcore.hardware.HardwareMap",
    telemetry: "org.firstinspires.ftc.robotcore.external.Telemetry",
  };
  return inherited[receiver] ?? null;
}

function receiverAt(sourceBeforeCursor: string): string | null {
  return /([A-Za-z_$][\w$]*)\.\s*[A-Za-z_$\w$]*$/u.exec(sourceBeforeCursor)?.[1] ?? null;
}

export function inferHardwareMapExpressionType(sourceBeforeCursor: string): string | null {
  const classLookup = /\bhardwareMap\.get\(\s*([A-Za-z_$][\w$.]*)\s*(?:\.class|::class\.java)[^)]*\)\.\s*[A-Za-z_$\w$]*$/u
    .exec(sourceBeforeCursor)?.[1];
  if (classLookup) return classLookup;
  const deviceMapping = /\bhardwareMap\.(dcMotor|servo|crservo|analogInput|digitalChannel|touchSensor|colorSensor)\.get\([^)]*\)\.\s*[A-Za-z_$\w$]*$/u
    .exec(sourceBeforeCursor)?.[1];
  return ({
    dcMotor: "com.qualcomm.robotcore.hardware.DcMotor",
    servo: "com.qualcomm.robotcore.hardware.Servo",
    crservo: "com.qualcomm.robotcore.hardware.CRServo",
    analogInput: "com.qualcomm.robotcore.hardware.AnalogInput",
    digitalChannel: "com.qualcomm.robotcore.hardware.DigitalChannel",
    touchSensor: "com.qualcomm.robotcore.hardware.TouchSensor",
    colorSensor: "com.qualcomm.robotcore.hardware.ColorSensor",
  } as Record<string, string>)[deviceMapping ?? ""] ?? null;
}

function returnTypeFromDescriptor(descriptor: string): string | null {
  const returnDescriptor = descriptor.slice(descriptor.lastIndexOf(")") + 1).replace(/^\[+/u, "");
  const object = /^L([^;]+);$/u.exec(returnDescriptor)?.[1];
  return object?.replaceAll("/", ".").replaceAll("$", ".") ?? null;
}

function chainedCallBeforeCursor(sourceBeforeCursor: string): { receiver: string; method: string } | null {
  const masked = maskNonCode(sourceBeforeCursor);
  const trailingMember = /\.\s*[A-Za-z_$\w$]*$/u.exec(masked);
  if (!trailingMember || trailingMember.index === undefined) return null;
  let closingParenthesis = trailingMember.index - 1;
  while (closingParenthesis >= 0 && /\s/u.test(masked[closingParenthesis])) closingParenthesis -= 1;
  if (masked[closingParenthesis] !== ")") return null;
  let depth = 0;
  let openingParenthesis = -1;
  for (let index = closingParenthesis; index >= 0; index -= 1) {
    if (masked[index] === ")") depth += 1;
    else if (masked[index] === "(") {
      depth -= 1;
      if (depth === 0) {
        openingParenthesis = index;
        break;
      }
    }
  }
  if (openingParenthesis < 0) return null;
  const methodMatch = /([A-Za-z_$][\w$]*)\s*$/u.exec(masked.slice(0, openingParenthesis));
  if (!methodMatch || methodMatch.index === undefined) return null;
  const methodStart = methodMatch.index;
  let receiverDot = methodStart - 1;
  while (receiverDot >= 0 && /\s/u.test(masked[receiverDot])) receiverDot -= 1;
  if (masked[receiverDot] !== ".") return null;
  const receiverMatch = /([A-Za-z_$][\w$]*)\s*$/u.exec(masked.slice(0, receiverDot));
  return receiverMatch ? { receiver: receiverMatch[1], method: methodMatch[1] } : null;
}

export function inferChainedSdkExpressionType(
  source: string,
  sourceBeforeCursor: string,
  catalog: JvmCompletionCatalog,
): string | null {
  const call = chainedCallBeforeCursor(sourceBeforeCursor);
  if (!call) return null;
  const imports = sourceImportPlan(source);
  const declaredType = inferReceiverType(source, call.receiver);
  const receiverType = resolveTypeName(imports, declaredType ?? call.receiver, catalog);
  for (const member of catalog.membersOf(receiverType, { query: call.method, limit: 100 })) {
    if (member.kind !== "method" || member.name !== call.method) continue;
    const returnType = returnTypeFromDescriptor(member.descriptor);
    if (returnType && catalog.getType(returnType)) return returnType;
  }
  return null;
}

export function kotlinSyntheticProperties(members: readonly JvmMemberSymbol[]): JvmMemberSymbol[] {
  const properties = new Map<string, JvmMemberSymbol>();
  for (const member of members) {
    if (member.kind !== "method" || !member.descriptor.startsWith("()")) continue;
    const match = /^(get|is)([A-Z].*)$/u.exec(member.name);
    if (!match) continue;
    const name = match[1] === "is"
      ? member.name
      : `${match[2][0].toLocaleLowerCase("en-US")}${match[2].slice(1)}`;
    const current = properties.get(name);
    if (!current || (current.classification === "unsupported" && member.classification !== "unsupported")) {
      properties.set(name, { ...member, kind: "field", name, declaration: `Kotlin property for ${member.declaration}` });
    }
  }
  return [...properties.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function resolveTypeName(imports: SourceImportPlan, typeName: string, catalog: JvmCompletionCatalog): string {
  if (typeName.includes(".")) return typeName;
  return imports.importedByLeaf.get(typeName) ?? catalog.getType(typeName)?.sourceName ?? typeName;
}

function compatibilityLabel(classification: JvmTypeSymbol["classification"] | JvmMemberSymbol["classification"]): string {
  return classification === "unsupported"
    ? "Unsupported by FTC Simulator"
    : classification.replaceAll("-", " ");
}

const FTC_SDK_ARTIFACTS = new Set(["FtcCommon", "Hardware", "RobotCore", "Vision"]);

function isFtcSdkType(type: JvmTypeSymbol | undefined): boolean {
  return Boolean(type?.artifact && FTC_SDK_ARTIFACTS.has(type.artifact));
}

function libraryLabel(type: JvmTypeSymbol): string {
  if (isFtcSdkType(type)) return "FTC SDK 11.1";
  if (type.artifact === "Java SE 8 runtime API") return "Java SE 8";
  if (type.artifact === "kotlin-stdlib") return "Kotlin stdlib 2.2.10";
  if (type.artifact === "JetBrains annotations") return "JetBrains annotations 13.0";
  return type.artifact ?? "resolved library";
}

function isDefaultImportedPackage(packageName: string, language: SourceLanguage): boolean {
  if (packageName === "java.lang") return true;
  if (language === "java") return false;
  return packageName === "java.util"
    || packageName === "kotlin"
    || packageName === "kotlin.annotation"
    || packageName === "kotlin.collections"
    || packageName === "kotlin.comparisons"
    || packageName === "kotlin.io"
    || packageName === "kotlin.jvm"
    || packageName === "kotlin.ranges"
    || packageName === "kotlin.sequences"
    || packageName === "kotlin.text";
}

function importEdit(
  monaco: Monaco,
  plan: SourceImportPlan,
  qualified: string,
  packageName: string,
  language: SourceLanguage,
): languages.TextEdit[] | undefined {
  if (!packageName
      || packageName === plan.currentPackage
      || isDefaultImportedPackage(packageName, language)
      || plan.importedQualifiedNames.has(qualified)) return undefined;
  const leaf = qualified.split(".").at(-1) ?? qualified;
  const conflict = plan.importedByLeaf.get(leaf);
  if (conflict && conflict !== qualified) return undefined;
  return [{
    range: new monaco.Range(plan.insertionLine, 1, plan.insertionLine, 1),
    text: `import ${qualified}${language === "java" ? ";" : ""}\n`,
  }];
}

function insertionName(plan: SourceImportPlan, qualified: string, leaf: string): string {
  const conflict = plan.importedByLeaf.get(leaf);
  return conflict && conflict !== qualified ? qualified : leaf;
}

function isStaticMember(member: JvmMemberSymbol | ProjectSourceMember): boolean {
  return "static" in member ? member.static : /\bstatic\b/u.test(member.declaration);
}

function coverageLabel(type: JvmTypeSymbol): string {
  return type.coverage === "full" ? "full coverage" : type.coverage === "partial" ? "partial coverage" : "no runtime coverage";
}

function memberInsertText(member: JvmMemberSymbol | ProjectSourceMember): string {
  return member.kind === "method" ? `${member.name}($0)` : member.name;
}

function memberKind(monaco: Monaco, member: JvmMemberSymbol | ProjectSourceMember): languages.CompletionItemKind {
  return member.kind === "field" ? monaco.languages.CompletionItemKind.Field : monaco.languages.CompletionItemKind.Method;
}

function typeKind(monaco: Monaco, type: JvmTypeSymbol): languages.CompletionItemKind {
  if (type.kind === "interface") return monaco.languages.CompletionItemKind.Interface;
  if (type.kind === "enum") return monaco.languages.CompletionItemKind.Enum;
  return monaco.languages.CompletionItemKind.Class;
}

function wordRange(model: editor.ITextModel, position: Position): IRange {
  const word = model.getWordUntilPosition(position);
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}

export function createFtcCompletionProvider(
  monaco: Monaco,
  language: SourceLanguage,
  catalog: JvmCompletionCatalog,
  getProjectFiles: () => Record<string, string>,
  scope: CompletionProviderScope,
): languages.CompletionItemProvider {
  let lastProjectCompletion: ProjectArtifactCompletionEntry | undefined;
  let activeCatalog = catalog;
  const catalogForProject = (): JvmCompletionCatalog => {
    const projectCompletion = projectArtifactCompletionCatalog(scope.projectId);
    if (projectCompletion !== lastProjectCompletion) {
      lastProjectCompletion = projectCompletion;
      activeCatalog = mergeProjectArtifactCompletionCatalog(catalog, projectCompletion);
    }
    return activeCatalog;
  };

  return {
    triggerCharacters: [".", "@"],
    provideCompletionItems(model, position) {
      if (!modelUriBelongsToProject(model.uri, scope.projectId)) return { suggestions: [] };
      const completionCatalog = catalogForProject();
      const source = model.getValue();
      const beforeCursor = source.slice(0, model.getOffsetAt(position));
      const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const importCompletion = completionImportContext(linePrefix);
      const receiver = importCompletion.inImport ? null : receiverAt(beforeCursor);
      const hardwareMapExpressionType = inferHardwareMapExpressionType(beforeCursor);
      const chainedExpressionType = importCompletion.inImport
        ? null
        : inferChainedSdkExpressionType(source, beforeCursor, completionCatalog);
      const expressionType = hardwareMapExpressionType ?? chainedExpressionType;
      const range = wordRange(model, position);
      const projectTypes = cachedProjectSourceTypes(getProjectFiles());
      const imports = sourceImportPlan(source);

      if (receiver || expressionType) {
        const declaredReceiverType = expressionType ?? inferReceiverType(source, receiver as string);
        const inferred = declaredReceiverType ?? receiver as string;
        const resolvedType = resolveTypeName(imports, inferred, completionCatalog);
        const projectType = projectTypes.find((type) => (
          type.qualifiedName === inferred
          || type.qualifiedName === imports.importedByLeaf.get(inferred)
          || type.name === inferred
        ));
        const staticReceiver = !expressionType && !declaredReceiverType
          && Boolean(completionCatalog.getType(resolvedType) || projectType);
        const sdkMembers = completionCatalog.membersOf(resolvedType, { limit: 500 }).filter((member) => (
          staticReceiver ? isStaticMember(member) : language === "java" || !isStaticMember(member)
        ));
        const languageMembers = language === "kotlin"
          ? [...sdkMembers, ...kotlinSyntheticProperties(sdkMembers)]
          : sdkMembers;
        const projectMembers = (projectType?.members ?? []).filter((member) => (
          staticReceiver ? member.static : language === "java" || !member.static
        ));
        return {
          suggestions: [
            ...languageMembers.map((member, index): languages.CompletionItem => {
              const declaringType = completionCatalog.getType(member.declaringType);
              const resolvedLibrary = declaringType ? libraryLabel(declaringType) : "Resolved runner library";
              return {
              label: member.name,
              kind: memberKind(monaco, member),
              detail: isFtcSdkType(declaringType)
                ? `${member.declaration} · ${compatibilityLabel(member.classification)}`
                : `${member.declaration} · ${resolvedLibrary}${member.classification === "unsupported" ? ` · ${compatibilityLabel(member.classification)}` : ""}`,
              documentation: member.classification === "unsupported"
                ? { value: `${resolvedLibrary} member. **Run will reject this reference because its runtime is unavailable in the simulator.**\n\nDeclared by \`${member.declaringType}\`.` }
                : { value: isFtcSdkType(declaringType)
                    ? `FTC SDK 11.1 · ${compatibilityLabel(member.classification)}${member.inherited ? ` · inherited from \`${member.declaringType}\`` : ""}.`
                    : `${resolvedLibrary}${member.inherited ? ` · inherited from \`${member.declaringType}\`` : ""}.` },
              insertText: memberInsertText(member),
              insertTextRules: member.kind === "method" ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
              range,
              sortText: `${member.classification === "unsupported" ? "9" : "0"}-${member.name}-${String(index).padStart(4, "0")}`,
            };
            }),
            ...projectMembers.map((member): languages.CompletionItem => ({
              label: member.name,
              kind: memberKind(monaco, member),
              detail: `${member.declaration} · project source`,
              insertText: memberInsertText(member),
              insertTextRules: member.kind === "method" ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
              range,
              sortText: `0-${member.name}`,
            })),
          ],
        };
      }

      const query = importCompletion.inImport
        ? importCompletion.query
        : model.getWordUntilPosition(position).word;
      // An empty invocation stays responsive and intentionally shows a representative first page;
      // typing immediately searches the complete 6k+ pinned workspace catalog.
      const sdkTypePool = query ? completionCatalog.searchTypes(query, 250) : completionCatalog.allTypes(1_000);
      const qualifiedPrefix = importCompletion.qualifiedPrefix.toLocaleLowerCase("en-US");
      const sdkTypes = importCompletion.inImport
        ? sdkTypePool.filter((type) => (
          importCompletion.packagePrefix
            ? type.sourceName.toLocaleLowerCase("en-US").startsWith(qualifiedPrefix)
            : type.simpleName.toLocaleLowerCase("en-US").startsWith(qualifiedPrefix)
        ))
        : sdkTypePool;
      return {
        suggestions: [
          ...sdkTypes.map((type): languages.CompletionItem => {
            const leaf = type.sourceName.split(".").at(-1) ?? type.simpleName;
            const insertText = importCompletion.inImport
              ? leaf
              : insertionName(imports, type.sourceName, leaf);
            return {
              label: type.simpleName,
              kind: typeKind(monaco, type),
              detail: isFtcSdkType(type)
                ? `${type.sourceName} · ${libraryLabel(type)} · ${compatibilityLabel(type.classification)} · ${coverageLabel(type)}`
                : `${type.sourceName} · ${libraryLabel(type)}${type.classification === "unsupported" ? ` · ${compatibilityLabel(type.classification)} · ${coverageLabel(type)}` : ""}`,
              documentation: type.classification === "unsupported"
                ? { value: `${libraryLabel(type)} is available to compile, but **Run will reject references to it because its runtime is unavailable in the simulator**.` }
                : { value: isFtcSdkType(type)
                    ? `FTC SDK 11.1 · ${compatibilityLabel(type.classification)} · **${coverageLabel(type)}**.`
                    : `${libraryLabel(type)} · resolved by the pinned local runner toolchain.` },
              insertText,
              range,
              additionalTextEdits: importCompletion.inImport || insertText === type.sourceName
                ? undefined
                : importEdit(monaco, imports, type.sourceName, type.packageName, language),
              sortText: `${type.classification === "unsupported" ? "9" : "0"}-${type.simpleName}`,
              filterText: `${type.simpleName} ${type.sourceName}`,
            };
          }),
          ...projectTypes
            .filter((type) => {
              if (importCompletion.inImport && importCompletion.packagePrefix) {
                return type.qualifiedName.toLocaleLowerCase("en-US").startsWith(qualifiedPrefix);
              }
              return !query || type.name.toLocaleLowerCase("en-US").includes(query.toLocaleLowerCase("en-US"));
            })
            .map((type): languages.CompletionItem => {
              const insertText = importCompletion.inImport
                ? type.name
                : insertionName(imports, type.qualifiedName, type.name);
              return {
                label: type.name,
                kind: monaco.languages.CompletionItemKind.Class,
                detail: `${type.qualifiedName} · project source`,
                insertText,
                range,
                additionalTextEdits: importCompletion.inImport || insertText === type.qualifiedName
                  ? undefined
                  : importEdit(monaco, imports, type.qualifiedName, type.packageName, language),
                sortText: `0-${type.name}`,
              };
            }),
        ],
      };
    },
  };
}
