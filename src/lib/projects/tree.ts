import type { ProjectNode } from "@/lib/studio-types";
import type { GitWorktreeEntry } from "@/lib/browser-git";

function fileTone(name: string): ProjectNode["tone"] {
  if (name.endsWith(".blk")) return "blocks";
  if (/\.(?:java|kt)$/u.test(name)) return "source";
  if (/\.(?:gradle|properties|json|xml|toml)$/u.test(name)) return "config";
  return "plain";
}

function sortNodes(nodes: ProjectNode[]): ProjectNode[] {
  return nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export function buildProjectTree(
  files: Record<string, string>,
  projectName?: string,
  entries?: readonly GitWorktreeEntry[],
): ProjectNode[] {
  const root: ProjectNode = {
    name: projectName ?? "Project",
    kind: "folder",
    children: [],
  };

  const entryByPath = new Map(entries?.map((entry) => [entry.path, entry]));
  // Text contents update immediately as the editor creates and autosaves files,
  // while the binary-aware worktree inventory refreshes after Git operations.
  // Union both views so a temporarily empty/stale inventory cannot hide files.
  const paths = [
    ...Object.keys(files),
    ...(entries?.map((entry) => entry.path) ?? []),
  ];
  for (const path of [...new Set(paths)].sort((left, right) => left.localeCompare(right))) {
    const segments = path.split("/").filter(Boolean);
    let parent = root;
    segments.forEach((name, index) => {
      const isFile = index === segments.length - 1;
      parent.children ??= [];
      let child = parent.children.find((node) => node.name === name);
      if (!child) {
        child = isFile
          ? {
              name,
              kind: "file",
              path,
              tone: entryByPath.get(path)?.kind === "binary" ? "binary" : fileTone(name),
              editable: entryByPath.get(path)?.kind !== "binary",
            }
          : { name, kind: "folder", children: [] };
        parent.children.push(child);
      }
      parent = child;
    });
  }

  function sortRecursively(node: ProjectNode): void {
    if (!node.children) return;
    sortNodes(node.children);
    node.children.forEach(sortRecursively);
  }
  sortRecursively(root);
  return [root];
}
