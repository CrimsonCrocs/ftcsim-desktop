"use client";

import { ViewLoading } from "@/components/view-loading";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Clock3, FolderOpen, GitBranch, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  DEFAULT_NEW_PROJECT,
  DEFAULT_EXAMPLE_IDS,
  availableExamples,
  exampleById,
  listCloudProjects,
  mergeLocalAndCloudProjects,
  ensureCloudProjectAvailable,
  acquireProjectWorkspaceLease,
  useProjectAccountId,
  useProjectCatalog,
  type NewProjectInput,
  type ProjectRecord,
  type ExampleDescriptor,
} from "@/lib/projects";
import { GitHubCredentials } from "@/components/studio/github-credentials";
import type { GitCredential } from "@/lib/browser-git";
import { normalizeGitHubRepository } from "@/lib/github-repository";
import { projectAbbreviation } from "@/lib/projects/abbreviation";
import { TemporaryAccountMenu } from "@/components/auth/temporary-account-menu";
import styles from "./new-project-dialog.module.css";

type WelcomeScreenProps = { version: string };

function projectAvailabilitySummary(project: ProjectRecord): string {
  if (!project.storageNamespace) return `Cloud project · ${project.javaPackage}`;
  if (!project.cloudSyncEnabled) return `Saved locally · sync off · ${project.javaPackage}`;
  const cloud = project.cloud;
  const newerCloudHead = cloud?.availableRevision !== undefined
    && (
      cloud.availableRevision > cloud.revision
      || cloud.availableManifestSha256 !== cloud.manifestSha256
    );
  if (cloud?.status === "conflict") {
    return `Sync conflict · local work preserved · ${project.javaPackage}`;
  }
  if (newerCloudHead) {
    return cloud?.status === "dirty"
      ? `${cloud.revision === 0 ? "Cloud copy exists" : "Cloud copy also changed"} · local work preserved · ${project.javaPackage}`
      : `Update available · older copy on this device · ${project.javaPackage}`;
  }
  return cloud?.status === "synced"
    ? `Synced · available offline · ${project.javaPackage}`
    : `Saved on this device · ${project.javaPackage}`;
}

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const catalog = useProjectCatalog();
  const [input, setInput] = useState<NewProjectInput>(() => ({
    ...DEFAULT_NEW_PROJECT,
    exampleIds: [...DEFAULT_EXAMPLE_IDS],
  }));
  const [exampleSearch, setExampleSearch] = useState("");
  const [pendingExample, setPendingExample] = useState<ExampleDescriptor | null>(null);
  const pendingExampleRef = useRef<HTMLButtonElement>(null);
  const exampleTriggerRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = backdropRef.current;
    const siblings = root?.parentElement
      ? Array.from(root.parentElement.children).filter((element) => element !== root)
      : [];
    siblings.forEach((element) => element.setAttribute("inert", ""));
    nameInput.current?.select();
    return () => {
      siblings.forEach((element) => element.removeAttribute("inert"));
      window.requestAnimationFrame(() => {
        const stableOpener = opener
          && opener !== document.body
          && opener !== document.documentElement
          && opener.isConnected
          ? opener
          : document.querySelector<HTMLElement>("[data-new-project-trigger]");
        stableOpener?.focus();
      });
    };
  }, []);

  useEffect(() => {
    pendingExampleRef.current?.focus();
  }, [pendingExample]);

  const visibleExamples = availableExamples(input.starter).filter((example) => (
    `${example.name} ${example.kind}`.toLocaleLowerCase().includes(exampleSearch.toLocaleLowerCase().trim())
  ));

  const closeExampleWarning = () => {
    setPendingExample(null);
    window.requestAnimationFrame(() => exampleTriggerRef.current?.focus());
  };

  const toggleExample = (example: ExampleDescriptor, trigger: HTMLInputElement) => {
    const selected = input.exampleIds ?? [];
    if (selected.includes(example.id)) {
      update("exampleIds", selected.filter((id) => id !== example.id));
    } else if (example.changes?.length) {
      exampleTriggerRef.current = trigger;
      setPendingExample(example);
    } else {
      update("exampleIds", [...selected, example.id]);
    }
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (pendingExample) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeExampleWarning();
      } else if (event.key === "Tab") {
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>(
          `.${styles.requirementsActions} button:not(:disabled)`,
        ) ?? []);
        if (buttons.length) {
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.shiftKey
            ? current <= 0 ? buttons.at(-1) : buttons[current - 1]
            : current >= buttons.length - 1 ? buttons[0] : buttons[current + 1];
          event.preventDefault();
          next?.focus();
        }
      }
      return;
    }
    if (event.key === "Escape" && !creating) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1) as HTMLElement;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const update = <K extends keyof NewProjectInput>(key: K, value: NewProjectInput[K]) => {
    setInput((current) => {
      if (key === "starter" && value === "blocks") {
        return {
          ...current,
          starter: "blocks",
          exampleIds: (current.exampleIds ?? []).filter((id) => exampleById(id)?.language !== "java"),
        };
      }
      if (key === "starter" && value !== "blocks") {
        return {
          ...current,
          starter: value as NewProjectInput["starter"],
          exampleIds: (current.exampleIds ?? []).filter((id) => exampleById(id)?.language !== "blocks"),
        };
      }
      return { ...current, [key]: value };
    });
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const project = await catalog.create(input);
      router.push(`/studio/${encodeURIComponent(project.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be created.");
      setCreating(false);
    }
  };

  return (
    <div ref={backdropRef} className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !creating) onClose();
    }}>
      <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="new-project-title" onKeyDown={handleDialogKeyDown}>
        <header className={styles.header} inert={Boolean(pendingExample)}>
          <h2 id="new-project-title">New Project</h2>
          <button className={styles.close} type="button" onClick={onClose} disabled={creating} aria-label="Close New Project" title="Close New Project">×</button>
        </header>
        <form onSubmit={submit} inert={Boolean(pendingExample)}>
          <div className={styles.form}>
            <label className={styles.field}>
              <span>Project name</span>
              <input ref={nameInput} value={input.name} onChange={(event) => update("name", event.target.value)} required maxLength={80} />
            </label>
            <label className={styles.field}>
              <span>Java package</span>
              <input value={input.javaPackage} onChange={(event) => update("javaPackage", event.target.value)} required spellCheck={false} />
            </label>
            <label className={styles.field}>
              <span>Starter language</span>
              <select value={input.starter} onChange={(event) => update("starter", event.target.value as NewProjectInput["starter"])}>
                <option value="java">Java</option>
                <option value="kotlin">Kotlin</option>
                <option value="blocks">Blocks</option>
              </select>
            </label>
            <fieldset className={styles.templateFieldset}>
              <legend>OpModes to include</legend>
              <p className={styles.templateHint}>{input.exampleIds?.length ?? 0} selected · Leave all unchecked for an empty project.</p>
              <input
                className={styles.exampleSearch}
                type="search"
                value={exampleSearch}
                onChange={(event) => setExampleSearch(event.target.value)}
                placeholder="Find an example"
                aria-label="Find an example"
              />
              <div className={styles.exampleList}>
                {(["ftcsim", "official"] as const).map((origin) => {
                  const entries = visibleExamples.filter((example) => example.origin === origin);
                  if (!entries.length) return null;
                  return <div key={origin} className={styles.exampleGroup}>
                    <h3>{origin === "ftcsim" ? "FTCSim Examples" : "Official FTC Examples"}</h3>
                    {entries.map((example) => (
                      <label key={example.id} className={styles.exampleRow}>
                        <input
                          type="checkbox"
                          value={example.id}
                          checked={input.exampleIds?.includes(example.id) ?? false}
                          onChange={(event) => toggleExample(example, event.currentTarget)}
                        />
                        <span className={styles.exampleCopy}>
                          <strong>{example.name}</strong>
                          <small>{example.summary}{example.configurable === false ? " · Not simulated yet" : example.changes?.length ? " · Adds hardware" : ""}</small>
                        </span>
                        <span className={styles.templateCategory}>{example.kind === "teleop" ? "TeleOp" : "Auto"}</span>
                      </label>
                    ))}
                  </div>;
                })}
                {!visibleExamples.length && <p className={styles.noExamples}>No matching examples.</p>}
              </div>
              {input.starter === "kotlin" && <p className={styles.templateHint}>Official SDK examples are supplied as Java files alongside your Kotlin code.</p>}
            </fieldset>
            <label className={styles.field}>
              <span>Drivetrain</span>
              <select value={input.drivetrain} onChange={(event) => update("drivetrain", event.target.value as NewProjectInput["drivetrain"])}>
                <option value="mecanum">Mecanum</option>
                <option value="tank">Tank-style (omni)</option>
                <option value="x-drive">X-drive (omni at 45°)</option>
                <option value="h-drive">H-drive</option>
              </select>
            </label>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </div>
          <footer className={styles.footer}>
            <button className={styles.button} type="button" onClick={onClose} disabled={creating}>Cancel</button>
            <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={creating}>{creating ? "Creating…" : "Create"}</button>
          </footer>
        </form>
        {pendingExample && <div className={styles.requirementsBackdrop}>
          <div className={styles.requirementsDialog} role="alertdialog" aria-modal="true" aria-labelledby="requirements-title" aria-describedby="requirements-detail">
            <h3 id="requirements-title">{pendingExample.name}</h3>
            <p id="requirements-detail">{pendingExample.configurable === false
              ? "This FTC SDK 11.1 example needs hardware or features FTCSim does not simulate yet:"
              : "This example needs a change to the default robot. It will be applied when you create the project:"}</p>
            <ul>{pendingExample.changes?.map((change) => <li key={change}>{change}</li>)}</ul>
            {pendingExample.configurable === false && <p>The example is included in FTC SDK 11.1, but cannot yet run in FTCSim.</p>}
            <div className={styles.requirementsActions}>
              <button ref={pendingExampleRef} type="button" onClick={closeExampleWarning}>Cancel</button>
              <button type="button" disabled={pendingExample.configurable === false} onClick={() => {
                update("exampleIds", [...(input.exampleIds ?? []), pendingExample.id]);
                closeExampleWarning();
              }}>{pendingExample.configurable === false ? "Unavailable in simulator" : "Include example"}</button>
            </div>
          </div>
        </div>}
      </section>
    </div>
  );
}

export function GitHubProjectDialog({
  onClose,
  initialRepository = "",
  initialProjectName = "",
}: {
  onClose: () => void;
  initialRepository?: string;
  initialProjectName?: string;
}) {
  const router = useRouter();
  const catalog = useProjectCatalog();
  const [repository, setRepository] = useState(initialRepository);
  const [localProjectName, setLocalProjectName] = useState(initialProjectName);
  const [nameEdited, setNameEdited] = useState(Boolean(initialProjectName));
  const [credential, setCredential] = useState<GitCredential>();
  const [error, setError] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const repositoryInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = backdropRef.current;
    const siblings = root?.parentElement
      ? Array.from(root.parentElement.children).filter((element) => element !== root)
      : [];
    siblings.forEach((element) => element.setAttribute("inert", ""));
    repositoryInput.current?.focus();
    return () => {
      siblings.forEach((element) => element.removeAttribute("inert"));
      window.requestAnimationFrame(() => {
        const fallback = document.querySelector<HTMLElement>("[data-github-project-trigger]");
        (opener?.isConnected ? opener : fallback)?.focus();
      });
    };
  }, []);

  const updateRepository = (value: string) => {
    setRepository(value);
    setError(null);
    if (nameEdited) return;
    try {
      setLocalProjectName(normalizeGitHubRepository(value).repository);
    } catch {
      setLocalProjectName("");
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !cloning) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1) as HTMLElement;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setCloning(true);
    setError(null);
    try {
      const project = await catalog.importFromGitHub({ repository, localProjectName, credential });
      setCredential(undefined);
      router.push(`/studio/${encodeURIComponent(project.id)}`);
    } catch (cause) {
      setCredential(undefined);
      setError(cause instanceof Error ? cause.message : "The GitHub project could not be cloned.");
      setCloning(false);
    }
  };

  return (
    <div ref={backdropRef} className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !cloning) onClose();
    }}>
      <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="github-project-title" onKeyDown={handleKeyDown}>
        <header className={styles.header}>
          <h2 id="github-project-title">Get from Version Control</h2>
      <button className={styles.close} type="button" onClick={onClose} disabled={cloning} aria-label="Close Get from Version Control" title="Close Get from Version Control">×</button>
        </header>
        <form onSubmit={submit}>
          <div className={styles.form}>
            <label className={styles.field}>
              <span>GitHub repository</span>
              <input
                ref={repositoryInput}
                value={repository}
                onChange={(event) => updateRepository(event.target.value)}
                placeholder="owner/repository"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </label>
            <label className={styles.field}>
              <span>Local project name</span>
              <input
                value={localProjectName}
                onChange={(event) => { setNameEdited(true); setLocalProjectName(event.target.value); setError(null); }}
                required
                maxLength={80}
              />
            </label>
            <GitHubCredentials onChange={setCredential} disabled={cloning} />
            {error && <p className={styles.error} role="alert">{error}</p>}
          </div>
          <footer className={styles.footer}>
            <button className={styles.button} type="button" onClick={onClose} disabled={cloning}>Cancel</button>
            <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={cloning || !repository.trim() || !localProjectName.trim()}>
              {cloning ? "Cloning…" : "Clone"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function OpenProjectDialog({
  onClose,
  onNewProject,
  projects,
}: {
  onClose: () => void;
  onNewProject: () => void;
  projects: ProjectRecord[];
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef(true);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = backdropRef.current;
    const siblings = root?.parentElement
      ? Array.from(root.parentElement.children).filter((element) => element !== root)
      : [];
    siblings.forEach((element) => element.setAttribute("inert", ""));
    searchRef.current?.focus();
    return () => {
      siblings.forEach((element) => element.removeAttribute("inert"));
      if (!restoreFocusRef.current) return;
      window.requestAnimationFrame(() => {
        const stableOpener = opener
          && opener !== document.body
          && opener !== document.documentElement
          && opener.isConnected
          ? opener
          : document.querySelector<HTMLElement>("[data-open-project-trigger]");
        stableOpener?.focus();
      });
    };
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1) as HTMLElement;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = projects.filter((project) => (
    !normalizedQuery
    || project.name.toLocaleLowerCase().includes(normalizedQuery)
    || project.javaPackage.toLocaleLowerCase().includes(normalizedQuery)
  ));

  return (
    <div ref={backdropRef} className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className={`${styles.dialog} ${styles.openDialog}`} role="dialog" aria-modal="true" aria-labelledby="open-project-title" onKeyDown={handleKeyDown}>
        <header className={styles.header}>
          <div>
            <h2 id="open-project-title">Open Project</h2>
          </div>
          <button className={styles.close} type="button" onClick={onClose} aria-label="Close Open Project" title="Close Open Project">×</button>
        </header>
        <div className={styles.openBody}>
          <label className={styles.openSearch}>
            <Search aria-hidden="true" />
            <span className="sr-only">Search projects</span>
            <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" />
          </label>
          {matches.length > 0 ? (
            <ul className={styles.openList}>
              {matches.map((project) => (
                <li key={project.id}>
                  <Link href={`/studio/${encodeURIComponent(project.id)}`} className={styles.openProject}>
                    <span className={styles.openMark} aria-hidden="true">{projectAbbreviation(project.name)}</span>
                    <span className={styles.openCopy}>
                      <strong>{project.name}</strong>
                      <small>{projectAvailabilitySummary(project)} · {project.drivetrain}</small>
                    </span>
                    <ChevronRight aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.openEmpty}>
              <strong>{projects.length ? "No matching projects" : "No projects yet"}</strong>
              <span>{projects.length ? "Try another project name or package." : "Create a project first; it will then appear here."}</span>
            </div>
          )}
        </div>
        <footer className={styles.footer}>
          <button className={styles.button} type="button" onClick={onClose}>Cancel</button>
          <button className={`${styles.button} ${styles.primary}`} type="button" onClick={() => {
            restoreFocusRef.current = false;
            onNewProject();
          }}>New Project</button>
        </footer>
      </section>
    </div>
  );
}

export function WelcomeScreen({ version }: WelcomeScreenProps) {
  const router = useRouter();
  const catalog = useProjectCatalog();
  const accountId = useProjectAccountId();
  const searchInput = useRef<HTMLInputElement>(null);
  const aboutDialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [interrupted, setInterrupted] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [openProjectOpen, setOpenProjectOpen] = useState(false);
  const [gitHubProjectOpen, setGitHubProjectOpen] = useState(false);
  const [gitHubProjectSeed, setGitHubProjectSeed] = useState<{ repository: string; name: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    setSyncNotice(null);
    try {
      const records = await catalog.listAll();
      const localProjects = records.filter((record) => record.state === "ready");
      if (!accountId) {
        setProjects(localProjects.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)));
      } else {
        try {
          setProjects(mergeLocalAndCloudProjects(localProjects, await listCloudProjects()));
        } catch (cause) {
          setProjects(localProjects.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)));
          setSyncNotice(cause instanceof Error
            ? `Cloud projects are temporarily unavailable: ${cause.message}`
            : "Cloud projects are temporarily unavailable. Local projects are still ready.");
        }
      }
      setInterrupted(records.filter((record) => record.state !== "ready"));
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Projects could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void catalog.listAll().then(async (records) => {
      if (!active) return;
      const localProjects = records.filter((record) => record.state === "ready");
      setInterrupted(records.filter((record) => record.state !== "ready"));
      if (!accountId) {
        setProjects(localProjects.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)));
        return;
      }
      try {
        const cloudProjects = await listCloudProjects();
        if (active) setProjects(mergeLocalAndCloudProjects(localProjects, cloudProjects));
      } catch (cause) {
        if (!active) return;
        setProjects(localProjects.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)));
        setSyncNotice(cause instanceof Error
          ? `Cloud projects are temporarily unavailable: ${cause.message}`
          : "Cloud projects are temporarily unavailable. Local projects are still ready.");
      }
    }).catch((cause: unknown) => {
      if (active) setLoadError(cause instanceof Error ? cause.message : "Projects could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [accountId, catalog]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("open") !== "1") return;
    window.history.replaceState(null, "", window.location.pathname);
    const frame = window.requestAnimationFrame(() => setOpenProjectOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const duplicateProject = async (project: ProjectRecord) => {
    if (duplicatingId) return;
    setDuplicatingId(project.id);
    setLoadError(null);
    try {
      if (!project.storageNamespace) {
        const lease = await acquireProjectWorkspaceLease(project.id);
        try {
          if (lease.readOnly) throw new Error("This project is opening in another tab. Try duplicating it there.");
          await ensureCloudProjectAvailable(catalog, project.id);
        } finally {
          lease.release();
        }
      }
      const copy = await catalog.duplicate(project.id);
      router.push(`/studio/${encodeURIComponent(copy.id)}`);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "The project could not be duplicated.");
    } finally {
      setDuplicatingId(null);
    }
  };
  const recentProjects = useMemo(() => projects.filter((project) => (
    !normalizedQuery
    || project.name.toLowerCase().includes(normalizedQuery)
    || project.javaPackage.toLowerCase().includes(normalizedQuery)
    || project.drivetrain.includes(normalizedQuery)
  )), [normalizedQuery, projects]);

  return (
    <main className="welcome-shell">
      <TemporaryAccountMenu placement="welcome" />
      <button
        type="button"
        className="welcome-about-trigger"
        aria-label="About"
        title="About"
        aria-haspopup="dialog"
        aria-controls="welcome-about-dialog"
        onClick={() => aboutDialog.current?.showModal()}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </svg>
      </button>
      <dialog ref={aboutDialog} id="welcome-about-dialog" className="welcome-about-dialog" aria-labelledby="welcome-about-heading">
        <header className="welcome-about-dialog__header">
          <h2 id="welcome-about-heading">About FTC Simulator</h2>
          <form method="dialog">
            <button type="submit" className={styles.close} aria-label="Close About" title="Close About">×</button>
          </form>
        </header>
        <div className="welcome-about">
          <p>FTC Simulator is part of the Crimson Crocs software collection.</p>
          <Image
            className="welcome-about__banner"
            src="/brand/crimson-crocs-collection.png"
            width={2172}
            height={497}
            sizes="(max-width: 512px) calc(100vw - 80px), 432px"
            alt="Crimson Crocs — Crocs Collection"
          />
          <p>Actively maintained by <a href="https://github.com/Upsidedly">Matthew Williams</a> of Crimson Crocs 16075.</p>
        </div>
      </dialog>
      <section className="welcome-main" aria-labelledby="welcome-heading">
        <div className="welcome-content">
          <div className="welcome-brand">
            <Image src="/brand/ftcsim.svg" width={64} height={86} alt="" priority />
            <div><h1 id="welcome-heading">FTC Simulator</h1><p>Version {version}</p></div>
          </div>
          <div className="welcome-actions" aria-label="Project actions">
            <button data-new-project-trigger className="welcome-action welcome-action--primary" type="button" onClick={() => setNewProjectOpen(true)}><Plus aria-hidden="true" />New Project</button>
            <button data-open-project-trigger className="welcome-action" type="button" onClick={() => setOpenProjectOpen(true)}><FolderOpen aria-hidden="true" />Open</button>
            <button data-github-project-trigger className="welcome-action" type="button" onClick={() => setGitHubProjectOpen(true)}><GitBranch aria-hidden="true" />Get from Version Control</button>
          </div>
          <section className="recent-projects" aria-labelledby="recent-projects-heading">
            <header className="recent-projects__header">
              <h2 id="recent-projects-heading">Projects</h2>
              <label className="project-search"><span className="sr-only">Search projects</span><Search aria-hidden="true" /><input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} placeholder="Search projects" /></label>
            </header>
            {syncNotice && <p className="welcome-sync-notice" role="status">{syncNotice}</p>}
            {loadError ? <div className="recent-projects__empty" role="alert"><strong>Projects unavailable</strong><span>{loadError}</span><button type="button" onClick={() => void refresh()}>Retry</button></div>
              : loading ? <div className="recent-projects__empty"><ViewLoading label="Loading projects" /></div>
                : recentProjects.length > 0 ? (
                  <ul className="recent-projects__list">{recentProjects.map((project) => (
                    <li key={project.id} className="recent-projects__item">
                      <Link href={`/studio/${encodeURIComponent(project.id)}`} className="recent-project">
                        <span className="recent-project__mark" aria-hidden="true">{projectAbbreviation(project.name)}</span>
                        <span className="recent-project__identity"><strong>{project.name}</strong><small>{projectAvailabilitySummary(project)}</small></span>
                        <span className="recent-project__meta"><Clock3 aria-hidden="true" />FTC {project.sdkVersion} · {project.drivetrain}</span>
                        <ChevronRight aria-hidden="true" />
                      </Link>
                      <div className="recent-projects__actions">
                        <button type="button" disabled={duplicatingId !== null}
                          aria-label={`Duplicate ${project.name}`} onClick={() => void duplicateProject(project)}>
                          {duplicatingId === project.id ? "Duplicating…" : "Duplicate"}
                        </button>
                      {accountId && project.storageNamespace && !project.cloudSyncEnabled && (
                        <button
                          type="button"
                          className="recent-project__claim"
                          onClick={async () => {
                            setLoadError(null);
                            try {
                              await catalog.enableCloudSync(project.id);
                              router.push(`/studio/${encodeURIComponent(project.id)}`);
                            } catch (cause) {
                              setLoadError(cause instanceof Error ? cause.message : "Project sync could not be enabled.");
                            }
                          }}
                        >
                          Sync to account
                        </button>
                      )}
                      </div>
                    </li>
                  ))}</ul>
                ) : <div className="recent-projects__empty"><strong>{projects.length ? "No matching projects" : "No projects yet"}</strong><span>{projects.length ? "Clear your search." : "Press new project to get started."}</span></div>}
          </section>
          {interrupted.length > 0 && <section className="recent-projects" aria-labelledby="recovery-heading">
            <header className="recent-projects__header"><h2 id="recovery-heading">Creation recovery</h2></header>
            <ul className="recent-projects__list">{interrupted.map((project) => <li key={project.id} className="recent-project">
              <span className="recent-project__mark" aria-hidden="true">!</span>
              <span className="recent-project__identity"><strong>{project.name}</strong><small>{project.failureReason ?? "Project creation was interrupted."}</small></span>
              <button type="button" aria-label={project.remote ? `Clone ${project.name} again` : `Retry creating ${project.name}`} onClick={async () => {
                try {
                  if (project.remote) {
                    await catalog.removeFailed(project.id);
                    setGitHubProjectSeed({ repository: `${project.remote.owner}/${project.remote.repository}`, name: project.name });
                    setGitHubProjectOpen(true);
                    await refresh();
                  } else {
                    await catalog.retryCreation(project.id);
                    await refresh();
                  }
                } catch (cause) { setLoadError(cause instanceof Error ? cause.message : "Creation could not be retried."); }
              }} title={project.remote ? `Clone ${project.name} again` : `Retry creating ${project.name}`}><RotateCcw aria-hidden="true" /></button>
              <button type="button" aria-label={`Remove ${project.name} creation record`} onClick={async () => {
                try { await catalog.removeFailed(project.id); await refresh(); }
                catch (cause) { setLoadError(cause instanceof Error ? cause.message : "Creation record could not be removed."); }
              }} title={`Remove ${project.name} creation record`}><Trash2 aria-hidden="true" /></button>
            </li>)}</ul>
          </section>}
        </div>
      </section>
      {openProjectOpen && <OpenProjectDialog projects={projects} onClose={() => setOpenProjectOpen(false)} onNewProject={() => {
        setOpenProjectOpen(false);
        setNewProjectOpen(true);
      }} />}
      {newProjectOpen && <NewProjectDialog onClose={() => setNewProjectOpen(false)} />}
      {gitHubProjectOpen && <GitHubProjectDialog
        initialRepository={gitHubProjectSeed?.repository}
        initialProjectName={gitHubProjectSeed?.name}
        onClose={() => { setGitHubProjectOpen(false); setGitHubProjectSeed(null); }}
      />}
    </main>
  );
}
