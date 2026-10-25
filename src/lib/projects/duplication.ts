/** A deterministic, file-safe name that also fits the project's 80-character limit. */
export function nextProjectCopyName(name: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map((value) => value.toLocaleLowerCase()));
  for (let index = 1; ; index++) {
    const suffix = index === 1 ? " (copy)" : ` (copy ${index})`;
    const candidate = `${name.slice(0, 80 - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

/** Preserve source and assets verbatim; change only the new project's own name. */
export function duplicateProjectFiles(
  source: Record<string, string | Uint8Array>,
  name: string,
): Record<string, string | Uint8Array> {
  const files = Object.fromEntries(Object.entries(source)
    .filter(([path]) => path !== ".git" && !path.startsWith(".git/"))
    .map(([path, content]) => [path, typeof content === "string" ? content : content.slice()]));
  if (typeof files["ftcsim.project.json"] === "string") {
    try {
      const manifest: unknown = JSON.parse(files["ftcsim.project.json"]);
      if (manifest && typeof manifest === "object" && !Array.isArray(manifest)) {
        files["ftcsim.project.json"] = `${JSON.stringify({ ...manifest, name }, null, 2)}\n`;
      }
    } catch {
      // A copy must retain a malformed manifest so its author can repair it.
    }
  }
  const gradleName = name.replaceAll("'", "").replace(/[^A-Za-z0-9_.-]+/gu, "_");
  for (const path of ["settings.gradle", "settings.gradle.kts"]) {
    const content = files[path];
    if (typeof content !== "string") continue;
    const quote = path.endsWith(".kts") ? '"' : "'";
    files[path] = content.replace(
      /(^\s*rootProject\.name\s*=\s*)(['"])[^'"\r\n]*\2/gmu,
      (_match, prefix: string) => `${prefix}${quote}${gradleName}${quote}`,
    );
  }
  return files;
}
