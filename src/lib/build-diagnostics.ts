import type { JavaDiagnostic } from "./java-runner-client";

export function ensureBuildFailureDiagnostics(
  message: string,
  diagnostics: readonly JavaDiagnostic[] = [],
  code = "BUILD_FAILED",
): JavaDiagnostic[] {
  if (diagnostics.length > 0) return [...diagnostics];
  return [{ kind: "error", code, message }];
}

export function formatBuildDiagnostic(diagnostic: JavaDiagnostic): string {
  const location = diagnostic.file
    ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ""}` : ""}`
    : "TeamCode";
  const code = diagnostic.code ? ` [${diagnostic.code}]` : "";
  return `${diagnostic.kind.toUpperCase()} ${location}${code} — ${diagnostic.message}`;
}
