"use client";

import { Binary, Blocks, ChevronDown, ChevronRight, FileCode2, FileCog, FilePlus2, FileText, Folder, FolderOpen, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SAMPLE_FILES } from "@/lib/sample-project";
import { buildProjectTree } from "@/lib/projects";
import type { ProjectNode } from "@/lib/studio-types";
import type { GitWorktreeEntry } from "@/lib/browser-git";
import type { ProjectOpMode } from "@/lib/project-opmodes";
import { generatedBlocksSourcePath, type OpModeKind } from "@/lib/blocks/documents";

interface ProjectPaneProps {
  activePath: string;
  onOpenFile: (path: string) => void;
  /** The current Git worktree. The sample fallback keeps pre-migration callers functional. */
  files?: Record<string, string>;
  entries?: readonly GitWorktreeEntry[];
  projectName?: string;
  onCreateFile?: () => void;
  blocksOnly?: boolean;
  blocksOpModes?: readonly ProjectOpMode[];
  onCreateBlocksOpMode?: (kind: OpModeKind) => void;
}

function ProjectTreeNode({
  node,
  depth,
  parentPath,
  activePath,
  onOpenFile,
}: {
  node: ProjectNode;
  depth: number;
  parentPath: string;
  activePath: string;
  onOpenFile: (path: string) => void;
}) {
  const isFolder = node.kind === "folder";
  const isActive = node.path === activePath;
  const nodePath = depth === 0
    ? ""
    : parentPath
      ? `${parentPath}/${node.name}`
      : node.name;
  const containsActiveFile = isFolder
    && (nodePath === "" || activePath.startsWith(`${nodePath}/`));
  const [expansion, setExpansion] = useState(() => ({
    activePath,
    expanded: containsActiveFile || depth === 0
      || ["TeamCode", "src", "main", "java", "kotlin", "blocks"].includes(node.name),
  }));
  // Reveal a newly selected file, but keep manual toggles until selection changes.
  if (isFolder && expansion.activePath !== activePath) {
    setExpansion({ activePath, expanded: expansion.expanded || containsActiveFile });
  }
  const shownExpanded = expansion.expanded;

  const Icon = isFolder
    ? shownExpanded
      ? FolderOpen
      : Folder
    : node.tone === "binary"
      ? Binary
      : node.tone === "blocks"
        ? Blocks
      : node.tone === "config"
      ? FileCog
      : node.name.endsWith(".md")
        ? FileText
        : FileCode2;

  const activate = () => {
    if (isFolder) {
      setExpansion((value) => ({ ...value, expanded: !value.expanded }));
    } else if (node.path && node.editable !== false) {
      onOpenFile(node.path);
    }
  };

  return (
    <li>
      <button
        type="button"
        className={`tree-row${isActive ? " is-active" : ""}`}
        style={{ paddingInlineStart: `calc(var(--space-2) + ${depth} * var(--tree-indent))` }}
        onClick={activate}
        aria-expanded={isFolder ? shownExpanded : undefined}
        aria-current={isActive ? "page" : undefined}
        aria-disabled={node.editable === false || undefined}
        title={node.editable === false ? "Binary file preserved in Git; editor preview is unavailable" : undefined}
      >
        <span className="tree-chevron" aria-hidden="true">
          {isFolder ? shownExpanded ? <ChevronDown /> : <ChevronRight /> : null}
        </span>
        <Icon className={`tree-icon tree-icon--${node.tone ?? node.kind}`} aria-hidden="true" />
        <span className="tree-label">{node.name}</span>
      </button>
      {isFolder && shownExpanded && node.children && (
        <ul className="tree-group">
          {node.children.map((child) => (
            <ProjectTreeNode
              key={`${node.name}/${child.name}`}
              node={child}
              depth={depth + 1}
              parentPath={nodePath}
              activePath={activePath}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ProjectPane({
  activePath, onOpenFile, files, entries, projectName, onCreateFile,
  blocksOnly = false, blocksOpModes = [], onCreateBlocksOpMode,
}: ProjectPaneProps) {
  const treeRef = useRef<HTMLElement>(null);
  const blocksMenuRef = useRef<HTMLDetailsElement>(null);
  const projectTree = useMemo(
    () => blocksOnly ? [] : buildProjectTree(files ?? SAMPLE_FILES, projectName, entries),
    [blocksOnly, entries, files, projectName],
  );
  const blocksEntries = useMemo(() => Object.keys(files ?? {})
    .filter((path) => path.endsWith(".blk"))
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({
      path,
      name: path.split("/").at(-1)?.replace(/\.blk$/u, "") ?? path,
      kind: blocksOpModes.find((mode) => mode.blocksPath === path)?.kind
        ?? (/\bflavor=["']AUTONOMOUS["']/u.test(files?.[path] ?? "") ? "autonomous" : "teleop"),
    })), [blocksOpModes, files]);
  const selectedBlocksPath = activePath.endsWith(".java")
    ? generatedBlocksSourcePath(files?.[activePath] ?? "")
    : activePath;
  useEffect(() => {
    if (!blocksOnly) return;
    const menu = blocksMenuRef.current;
    if (!menu) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
        event.preventDefault();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [blocksOnly]);
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;

    const revealSelectedName = () => {
      const label = tree.querySelector<HTMLElement>(".tree-row.is-active .tree-label");
      if (!label) return;
      const viewport = tree.getBoundingClientRect();
      const name = label.getBoundingClientRect();
      const inset = 12;
      const availableWidth = tree.clientWidth - inset * 2;
      // Keep the filename visible without scrolling the editor or moving vertically.
      if (name.width > availableWidth || name.left < viewport.left + inset) {
        tree.scrollLeft += name.left - viewport.left - inset;
      } else if (name.right > viewport.left + tree.clientWidth - inset) {
        tree.scrollLeft += name.right - viewport.left - tree.clientWidth + inset;
      }
    };

    const observer = new ResizeObserver(revealSelectedName);
    observer.observe(tree);
    revealSelectedName();
    return () => observer.disconnect();
  }, [activePath, projectTree]);

  return (
    <aside className="project-pane" id="mobile-files-view" aria-label={blocksOnly ? "Blocks OpModes" : "Project files"}>
      <header className="tool-window-header">
        <span>{blocksOnly ? "OpModes" : "Project"}</span>
        {blocksOnly ? onCreateBlocksOpMode && (
          <details ref={blocksMenuRef} className="blocks-create-menu">
            <summary className="tool-window-header__action" aria-label="New Blocks OpMode" title="New Blocks OpMode">
              <Plus aria-hidden="true" />
            </summary>
            <div className="blocks-create-menu__options">
              {(["teleop", "autonomous"] as const).map((kind) => (
                <button type="button" key={kind} onClick={() => {
                  blocksMenuRef.current?.removeAttribute("open");
                  blocksMenuRef.current?.querySelector("summary")?.focus();
                  onCreateBlocksOpMode(kind);
                }}>
                  {kind === "teleop" ? "TeleOp" : "Autonomous"}
                </button>
              ))}
            </div>
          </details>
        ) : onCreateFile && (
          <button type="button" className="tool-window-header__action" onClick={onCreateFile} aria-label="New TeamCode file" title="New TeamCode file">
            <FilePlus2 aria-hidden="true" />
          </button>
        )}
      </header>
      {blocksOnly ? (
        <nav className="blocks-opmodes" aria-label="Blocks OpModes">
          <ul>
            {blocksEntries.map(({ path, name, kind }) => (
              <li key={path}>
                <button
                  type="button"
                  className={path === selectedBlocksPath ? "is-active" : ""}
                  aria-current={path === selectedBlocksPath ? "page" : undefined}
                  aria-label={`Open ${name} (${kind === "teleop" ? "TeleOp" : "Autonomous"})`}
                  title={`${name} · ${kind === "teleop" ? "TeleOp" : "Autonomous"}`}
                  onClick={() => onOpenFile(path)}
                >{name}</button>
              </li>
            ))}
          </ul>
        </nav>
      ) : <nav ref={treeRef} className="project-tree" aria-label="Project tree">
        <ul className="tree-group tree-group--root">
          {projectTree.map((node) => (
            <ProjectTreeNode
              key={node.name}
              node={node}
              depth={0}
              parentPath=""
              activePath={activePath}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      </nav>}
    </aside>
  );
}
