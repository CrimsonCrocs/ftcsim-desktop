"use client";

import {
  Check,
  ChevronDown,
  Download,
  FilePlus2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  History,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { GitHubCredentials, GitHubIcon } from "./github-credentials";
import type { GitCredential, GitStatusSnapshot } from "@/lib/browser-git";
import type { ProjectRecord } from "@/lib/projects";

type MenuController = {
  close: (restoreFocus?: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

function useHeaderMenu(): MenuController {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>("[data-menu-autofocus]")?.focus();
    });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [close, open]);

  return { close, menuRef, open, setOpen, triggerRef };
}

function MenuAction({
  children,
  disabled = false,
  icon,
  onClick,
  secondary,
}: {
  children: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  onClick?: () => void;
  secondary?: string;
}) {
  return (
    <button
      type="button"
      className="header-menu__action"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      onClick={onClick}
      title={secondary}
    >
      {icon}
      <span>{children}</span>
      {secondary && <span className="sr-only">{secondary}</span>}
    </button>
  );
}

export function ProjectSwitcher({
  currentProjectId,
  exitDisabled,
  readOnly,
  onNewProject,
  onExitToWelcome,
  onExportProject,
  onDuplicateProject,
  duplicating = false,
  onGitHubProject,
  onPublishGitHub,
  onOpenProject,
  onOpenWelcome,
  projectName,
  projects,
}: {
  currentProjectId: string;
  exitDisabled: boolean;
  readOnly: boolean;
  onNewProject: () => void;
  onExitToWelcome: () => void;
  onExportProject: () => void;
  onDuplicateProject: () => void;
  duplicating?: boolean;
  onGitHubProject: () => void;
  onPublishGitHub?: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenWelcome: () => void;
  projectName: string;
  projects: readonly ProjectRecord[];
}) {
  const { close, menuRef, open, setOpen, triggerRef } = useHeaderMenu();
  const requestedFocusRef = useRef<"first" | "last" | null>(null);

  const menuItems = useCallback(() => Array.from(
    menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)") ?? [],
  ), [menuRef]);

  const focusBoundaryItem = useCallback((boundary: "first" | "last") => {
    const items = menuItems();
    items[boundary === "first" ? 0 : items.length - 1]?.focus();
  }, [menuItems]);

  useEffect(() => {
    if (!open) {
      requestedFocusRef.current = null;
      return;
    }
    const requested = requestedFocusRef.current;
    if (!requested) return;
    requestedFocusRef.current = null;
    const frame = window.requestAnimationFrame(() => focusBoundaryItem(requested));
    return () => window.cancelAnimationFrame(frame);
  }, [focusBoundaryItem, open]);

  const invokeAndClose = (action: () => void) => {
    action();
    close(true);
  };

  const openAtBoundary = (boundary: "first" | "last") => {
    if (open) {
      focusBoundaryItem(boundary);
      return;
    }
    requestedFocusRef.current = boundary;
    setOpen(true);
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems();
    if (items.length === 0) return;
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = activeIndex < 0 ? items.length - 1 : (activeIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return (
    <div
      className="header-menu-anchor header-menu-anchor--project"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        close();
      }}
    >
      <button
        ref={triggerRef}
        data-new-project-trigger
        type="button"
        className={`project-widget${open ? " is-open" : ""}`}
        aria-controls="project-switcher-menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          openAtBoundary(event.key === "ArrowDown" ? "first" : "last");
        }}
      >
        <span className="app-mark" aria-hidden="true">FT</span>
        <span className="project-widget__name">{projectName}</span>
        <ChevronDown aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id="project-switcher-menu"
          className="header-menu project-switcher-menu"
          role="menu"
          aria-label="Project menu"
          onKeyDown={handleMenuKeyDown}
        >
          <div className="header-menu__actions" role="none">
            <MenuAction
              icon={<FilePlus2 aria-hidden="true" />}
              onClick={() => invokeAndClose(onNewProject)}
            >
              New Project…
            </MenuAction>
            <MenuAction
              icon={<FolderOpen aria-hidden="true" />}
              onClick={() => invokeAndClose(onOpenWelcome)}
              secondary="Open an account project or local offline copy"
            >
              Open…
            </MenuAction>
            <MenuAction
              icon={<GitBranch aria-hidden="true" />}
              onClick={() => invokeAndClose(onGitHubProject)}
              secondary="Clone or reconnect a GitHub repository"
            >
              Get from Version Control…
            </MenuAction>
            {onPublishGitHub && <MenuAction icon={<GitHubIcon />} disabled={exitDisabled || readOnly}
              onClick={() => invokeAndClose(onPublishGitHub)}>Publish to GitHub…</MenuAction>}
            <MenuAction
              icon={<Download aria-hidden="true" />}
              onClick={() => invokeAndClose(onExportProject)}
              secondary="Download the current project files as a ZIP archive"
            >
              Export Project…
            </MenuAction>
            <MenuAction
              icon={<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 4h12v12M4 8h12v12H4z" /></svg>}
              disabled={exitDisabled || readOnly || duplicating}
              onClick={() => invokeAndClose(onDuplicateProject)}
              secondary="Create an independent copy of this project"
            >
              {duplicating ? "Duplicating…" : "Duplicate Project"}
            </MenuAction>
          </div>

          <div className="header-menu__section" role="group" aria-labelledby="open-projects-heading">
            <h2 id="open-projects-heading">Open Projects</h2>
            <button
              type="button"
              className="project-entry"
              role="menuitem"
              tabIndex={-1}
              aria-current="page"
              data-menu-autofocus
              onClick={() => invokeAndClose(() => onOpenProject(currentProjectId))}
            >
              <span className="project-entry__mark">FT</span>
              <span>
                <strong>{projectName}</strong>
              </span>
            </button>
          </div>

          <div className="header-menu__section header-menu__section--muted" role="group" aria-labelledby="recent-projects-heading">
            <h2 id="recent-projects-heading">Recent Projects</h2>
            {projects.filter((project) => project.id !== currentProjectId).length > 0 ? (
              projects.filter((project) => project.id !== currentProjectId).slice(0, 5).map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="project-entry"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => invokeAndClose(() => onOpenProject(project.id))}
                >
                  <span className="project-entry__mark">FT</span>
                  <span>
                    <strong>{project.name}</strong>
                    <small>{project.javaPackage} · {project.drivetrain}</small>
                  </span>
                </button>
              ))
            ) : <p role="none">No other projects.</p>}
          </div>

          <div className="header-menu__actions" role="none">
            <MenuAction
              disabled={exitDisabled}
              icon={<LogOut aria-hidden="true" />}
              onClick={() => invokeAndClose(onExitToWelcome)}
              secondary={readOnly
                ? "Close this read-only project and return to Welcome"
                : "Save all project changes and return to Welcome"}
            >
              {readOnly ? "Exit to Welcome" : "Save and Exit to Welcome"}
            </MenuAction>
          </div>
        </div>
      )}
    </div>
  );
}

export function GitBranchMenu({
  busy,
  error,
  onCheckout,
  onCommit,
  onCreateBranch,
  onDiscard,
  onFetch,
  onPull,
  onPush,
  onRefresh,
  onPublish,
  snapshot,
  remote,
}: {
  busy: boolean;
  error: string | null;
  onCheckout: (branch: string) => Promise<void>;
  onCommit: (message: string) => Promise<void>;
  onCreateBranch: (name: string) => Promise<void>;
  onDiscard: () => Promise<void>;
  onFetch: (credential?: GitCredential) => Promise<void>;
  onPull: (credential?: GitCredential) => Promise<void>;
  onPush: (credential?: GitCredential) => Promise<void>;
  onRefresh: () => Promise<void>;
  onPublish: () => void;
  snapshot: GitStatusSnapshot | null;
  remote?: ProjectRecord["remote"];
}) {
  const { menuRef, open, setOpen, triggerRef } = useHeaderMenu();
  const [commitMessage, setCommitMessage] = useState("");
  const [branchName, setBranchName] = useState("");
  const [credential, setCredential] = useState<GitCredential>();

  const submitCommit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = commitMessage.trim();
    if (!message) return;
    try {
      await onCommit(message);
      setCommitMessage("");
    } catch {
      // The parent exposes the actionable Git error inside this menu.
    }
  };

  const submitBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = branchName.trim();
    if (!name) return;
    try {
      await onCreateBranch(name);
      setBranchName("");
    } catch {
      // Keep the proposed name in place so the user can correct it.
    }
  };

  const branch = snapshot?.branch ?? "main";
  const changes = snapshot?.changes ?? [];

  return (
    <div className="header-menu-anchor header-menu-anchor--git">
      <button
        ref={triggerRef}
        type="button"
        className={`branch-widget${open ? " is-open" : ""}`}
        aria-label={`Git branches and changes — ${branch}`}
        title={`Git branches and changes — ${branch}`}
        aria-controls="git-branch-menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <GitBranch aria-hidden="true" />
        <span>{branch}</span>
        {snapshot?.dirty && <span className="git-dirty-dot" aria-label={`${changes.length} uncommitted change${changes.length === 1 ? "" : "s"}`} />}
        <ChevronDown aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id="git-branch-menu"
          className="header-menu git-branch-menu"
          role="dialog"
          aria-label="Git branches and changes"
        >
          <header className="git-menu__header">
            <span>
              <GitBranch aria-hidden="true" />
              <strong>{branch}</strong>
              <small>{snapshot?.headOid?.slice(0, 7) ?? "initializing"}</small>
            </span>
            <button type="button" onClick={() => { void onRefresh().catch(() => undefined); }} disabled={busy} aria-label="Refresh Git status" title="Refresh Git status">
              <RefreshCw className={busy ? "is-spinning" : undefined} aria-hidden="true" />
            </button>
          </header>

          {error && <p className="git-menu__error" role="alert">{error}</p>}

          {!remote && (
            <section className="git-menu__section git-menu__publish">
              <button className="header-menu__action" type="button" disabled={busy} onClick={() => { setOpen(false); onPublish(); }}>
                <GitHubIcon />
                <span>Publish to GitHub…</span>
              </button>
            </section>
          )}
          {remote && (
            <section className="git-menu__section git-menu__remote" aria-labelledby="git-remote-heading">
              <div className="git-menu__section-heading">
                <h2 id="git-remote-heading">GitHub</h2>
                <span title={`${remote.owner}/${remote.repository}`}>{remote.owner}/{remote.repository}</span>
              </div>
              <GitHubCredentials onChange={setCredential} disabled={busy} />
              <div className="git-menu__remote-actions" role="group" aria-label="GitHub synchronization">
                <button type="button" disabled={busy || (remote.private && !credential)} onClick={() => { void onFetch(credential).catch(() => undefined); }}>
                  <RefreshCw aria-hidden="true" /> Fetch
                </button>
                <button type="button" disabled={busy || snapshot?.dirty || (remote.private && !credential)} onClick={() => { void onPull(credential).catch(() => undefined); }}>
                  <Download aria-hidden="true" /> Pull
                </button>
                <button type="button" disabled={busy || !credential} onClick={() => { void onPush(credential).catch(() => undefined); }}>
                  <Upload aria-hidden="true" /> Push
                </button>
              </div>

            </section>
          )}

          <section className="git-menu__section" aria-labelledby="git-changes-heading">
            <div className="git-menu__section-heading">
              <h2 id="git-changes-heading">Changes</h2>
              <span>{changes.length}</span>
            </div>
            {changes.length > 0 ? (
              <ul className="git-change-list">
                {changes.slice(0, 8).map((change) => (
                  <li key={change.path} title={change.path}>
                    <code>{change.shortStatus}</code>
                    <span>{change.path}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="git-menu__empty">Working tree clean</p>
            )}
            {changes.length > 8 && <p className="git-menu__more">+ {changes.length - 8} more</p>}
          </section>

          <form className="git-menu__form" onSubmit={submitCommit}>
            <label htmlFor="git-commit-message">Commit message</label>
            <div>
              <input
                id="git-commit-message"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="Describe your changes"
                disabled={busy || !snapshot?.dirty}
              />
              <button type="submit" disabled={busy || !snapshot?.dirty || !commitMessage.trim()} title="Stage all changes and commit">
                {busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <GitCommitHorizontal aria-hidden="true" />}
                Commit
              </button>
            </div>
          </form>

          <section className="git-menu__section" aria-labelledby="git-branches-heading">
            <div className="git-menu__section-heading">
              <h2 id="git-branches-heading">Branches</h2>
              <span>{snapshot?.branches.length ?? 0}</span>
            </div>
            <div className="git-branch-list">
              {(snapshot?.branches ?? []).map((name) => (
                <button
                  type="button"
                  key={name}
                  data-menu-autofocus={name === branch ? "true" : undefined}
                  disabled={busy || name === branch}
                  onClick={() => { void onCheckout(name).catch(() => undefined); }}
                >
                  {name === branch ? <Check aria-hidden="true" /> : <GitBranch aria-hidden="true" />}
                  <span>{name}</span>
                </button>
              ))}
            </div>
            <form className="git-menu__new-branch" onSubmit={submitBranch}>
              <Plus aria-hidden="true" />
              <input
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                placeholder="New branch name"
                aria-label="New branch name"
                disabled={busy}
              />
              <button type="submit" disabled={busy || !branchName.trim()}>Create</button>
            </form>
          </section>

          <section className="git-menu__section" aria-labelledby="git-history-heading">
            <div className="git-menu__section-heading">
              <h2 id="git-history-heading"><History aria-hidden="true" /> Recent Commits</h2>
            </div>
            <ol className="git-log-list">
              {(snapshot?.commits ?? []).slice(0, 4).map((entry) => (
                <li key={entry.oid}>
                  <code>{entry.shortOid}</code>
                  <span title={entry.message}>{entry.message.split("\n", 1)[0]}</span>
                </li>
              ))}
            </ol>
          </section>

          <footer className="git-menu__footer">
            {remote && <span>origin · {remote.branch}</span>}
            <button
              type="button"
              onClick={() => { void onDiscard().catch(() => undefined); }}
              disabled={busy || !snapshot?.dirty}
              title="Restore every file to the current commit"
            >
              <RotateCcw aria-hidden="true" />
              Discard all…
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
