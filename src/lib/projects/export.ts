import { strToU8, zipSync } from "fflate";

export type ProjectExportFile = string | Uint8Array;

export type ProjectExportScope = "full-project" | "teamcode-sources";

export interface ProjectExportOptions {
  projectName: string;
  scope: ProjectExportScope;
  includeSimulatorConfiguration: boolean;
  fileName?: string;
}

export interface ProjectExportArchive {
  bytes: Uint8Array;
  fileCount: number;
  fileName: string;
  rootDirectory: string;
}

function safeName(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");
  return normalized || fallback;
}

export function normalizeProjectExportFileName(value: string, projectName: string): string {
  const withoutExtension = value.trim().replace(/\.zip$/iu, "");
  return `${safeName(withoutExtension || projectName, "FTC-Project")}.zip`;
}

export function selectProjectExportFiles(
  files: Readonly<Record<string, ProjectExportFile>>,
  options: Pick<ProjectExportOptions, "scope" | "includeSimulatorConfiguration">,
): Record<string, ProjectExportFile> {
  return Object.fromEntries(Object.entries(files)
    .filter(([path]) => options.scope === "full-project" || path.startsWith("TeamCode/"))
    .filter(([path]) => options.includeSimulatorConfiguration || path !== "ftcsim.project.json")
    .sort(([left], [right]) => left.localeCompare(right)));
}

export function createProjectExportArchive(
  files: Readonly<Record<string, ProjectExportFile>>,
  options: ProjectExportOptions,
): ProjectExportArchive {
  const selected = selectProjectExportFiles(files, options);
  const entries = Object.entries(selected);
  if (entries.length === 0) {
    throw new Error(options.scope === "teamcode-sources"
      ? "This project does not contain any TeamCode files to export."
      : "This project does not contain any files to export.");
  }

  const rootDirectory = safeName(options.projectName, "FTC-Project");
  const archiveEntries = Object.fromEntries(entries.map(([path, content]) => [
    `${rootDirectory}/${path}`,
    typeof content === "string" ? strToU8(content) : content,
  ]));
  return {
    bytes: zipSync(archiveEntries, { level: 6 }),
    fileCount: entries.length,
    fileName: normalizeProjectExportFileName(options.fileName ?? options.projectName, options.projectName),
    rootDirectory,
  };
}
