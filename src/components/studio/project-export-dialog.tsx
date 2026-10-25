"use client";

import { Archive, Code2, Download, FolderTree, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { ProjectExportScope } from "@/lib/projects";

export interface ProjectExportSelection {
  scope: ProjectExportScope;
  includeSimulatorConfiguration: boolean;
  fileName: string;
}

const FOCUSABLE_SELECTOR = "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])";

export function ProjectExportDialog({
  fullFileCount,
  projectName,
  teamCodeFileCount,
  onClose,
  onExport,
}: {
  fullFileCount: number;
  projectName: string;
  teamCodeFileCount: number;
  onClose: () => void;
  onExport: (selection: ProjectExportSelection) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [scope, setScope] = useState<ProjectExportScope>("full-project");
  const [includeSimulatorConfiguration, setIncludeSimulatorConfiguration] = useState(true);
  const [fileName, setFileName] = useState(`${projectName}.zip`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCount = scope === "full-project" ? fullFileCount : teamCodeFileCount;

  useEffect(() => {
    window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLInputElement>("input[name='export-file-name']")?.focus());
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && (globalThis.document.activeElement === first || !dialogRef.current?.contains(globalThis.document.activeElement))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || selectedCount === 0 || !fileName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onExport({ scope, includeSimulatorConfiguration, fileName });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be exported.");
      setBusy(false);
    }
  };

  return (
    <div className="project-export-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="project-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-export-title"
        onKeyDown={handleKeyDown}
      >
        <header>
          <div>
            <Archive aria-hidden="true" />
            <span>
              <h2 id="project-export-title">Export Project</h2>
            </span>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close Export Project dialog" title="Close Export Project dialog"><X aria-hidden="true" /></button>
        </header>

        <form onSubmit={submit}>
          <label className="project-export-dialog__filename">
            <span>File name</span>
            <input
              name="export-file-name"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              disabled={busy}
              required
              spellCheck={false}
            />
          </label>

          <fieldset className="project-export-dialog__scope">
            <legend>Contents</legend>
            <label className={scope === "full-project" ? "is-selected" : ""}>
              <input type="radio" name="export-scope" value="full-project" checked={scope === "full-project"} onChange={() => setScope("full-project")} disabled={busy} />
              <FolderTree aria-hidden="true" />
              <span><strong>Full FTC project</strong><small>Gradle files, TeamCode, and project resources · {fullFileCount} files</small></span>
              <em>Recommended</em>
            </label>
            <label className={scope === "teamcode-sources" ? "is-selected" : ""}>
              <input type="radio" name="export-scope" value="teamcode-sources" checked={scope === "teamcode-sources"} onChange={() => setScope("teamcode-sources")} disabled={busy || teamCodeFileCount === 0} />
              <Code2 aria-hidden="true" />
              <span><strong>TeamCode only</strong><small>No root project files · {teamCodeFileCount} files</small></span>
            </label>
          </fieldset>

          <label className="project-export-dialog__checkbox">
            <input
              type="checkbox"
              checked={includeSimulatorConfiguration}
              onChange={(event) => setIncludeSimulatorConfiguration(event.target.checked)}
              disabled={busy || scope === "teamcode-sources"}
            />
            <span><strong>Include FTC Simulator configuration</strong><small>Robot setup · ftcsim.project.json</small></span>
          </label>

          <p className="project-export-dialog__notice">
            Saved files only. Git history and editor state are excluded.
          </p>
          {error && <p className="project-export-dialog__error" role="alert">{error}</p>}

          <footer>
            <span>{selectedCount} file{selectedCount === 1 ? "" : "s"} selected</span>
            <div>
              <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="project-export-dialog__primary" disabled={busy || selectedCount === 0 || !fileName.trim()}>
                <Download aria-hidden="true" /> {busy ? "Preparing…" : "Export ZIP"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
