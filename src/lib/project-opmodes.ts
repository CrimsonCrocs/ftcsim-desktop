export interface ProjectOpMode {
  value: string;
  label: string;
  kind: "autonomous" | "teleop";
  path: string;
  blocksPath: string | null;
}

// Tokenize before reading annotations so examples in comments and strings do
// not become runnable programs. The compiler remains the final authority.
export function discoverProjectOpModes(files: Record<string, string>, blocksSourcePath: (source: string) => string | null = () => null): ProjectOpMode[] {
  const result: ProjectOpMode[] = [];
  for (const [path, source] of Object.entries(files)) {
    if (!/\.(java|kt)$/u.test(path) || /\/(?:test|androidTest|build)\//u.test(path)) continue;
    const tokens = [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_$][\w$]*|[^\s]/gu)]
      .map((match) => match[0]).filter((token) => !token.startsWith("//") && !token.startsWith("/*"));
    let packageName = "";
    let annotation: { kind: ProjectOpMode["kind"]; name?: string } | null = null;
    let disabled = false;
    let depth = 0;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (token === "package" && depth === 0) {
        packageName = tokens[++index] ?? "";
        while (tokens[index + 1] === ".") { index += 2; packageName += `.${tokens[index]}`; }
      } else if (token === "@" && depth === 0) {
        let name = tokens[++index];
        while (tokens[index + 1] === ".") { index += 2; name = tokens[index]; }
        const args: string[] = [];
        if (tokens[index + 1] === "(") {
          index += 2;
          let nesting = 1;
          for (; index < tokens.length && nesting; index++) {
            if (tokens[index] === "(") nesting++;
            if (tokens[index] === ")") nesting--;
            if (nesting) args.push(tokens[index]);
          }
          index--;
        }
        if (name === "Disabled") disabled = true;
        if (name === "TeleOp" || name === "Autonomous") {
          const nameIndex = args.indexOf("name");
          let displayName: string | undefined;
          if (nameIndex >= 0 && args[nameIndex + 1] === "=" && args[nameIndex + 2]?.startsWith('"')) {
            try { displayName = JSON.parse(args[nameIndex + 2]) as string; } catch { /* incomplete source */ }
          }
          annotation = { kind: name === "Autonomous" ? "autonomous" : "teleop", name: displayName };
        }
      } else if (token === "class" && depth === 0) {
        const className = tokens[index + 1];
        if (annotation && !disabled && /^[A-Za-z_$][\w$]*$/u.test(className ?? "")) {
          const blocksPath = blocksSourcePath(source);
          result.push({ value: packageName ? `${packageName}.${className}` : className,
            label: blocksPath ? className : annotation.name || className, kind: annotation.kind, path,
            blocksPath });
        }
        annotation = null;
        disabled = false;
      } else if (token === "{") {
        depth++;
      } else if (token === "}") {
        depth = Math.max(0, depth - 1);
      } else if (token === ";" && depth === 0) {
        annotation = null;
        disabled = false;
      }
    }
  }
  return result.sort((left, right) => left.label.localeCompare(right.label));
}

export function resolveRunOpMode(opModes: readonly ProjectOpMode[], selection: string, activePath: string): string {
  if (selection) return opModes.find((opMode) => opMode.value === selection)?.value ?? "";
  return opModes.find((opMode) => opMode.path === activePath || opMode.blocksPath === activePath)?.value ?? "";
}
