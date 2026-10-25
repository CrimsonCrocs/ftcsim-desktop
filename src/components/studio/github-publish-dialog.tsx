"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { GitCredential } from "@/lib/browser-git";
import { GitHubCredentials } from "./github-credentials";
import styles from "./github-publish-dialog.module.css";

export interface GitHubPublishSelection { name: string; private: boolean; credential: GitCredential }

export function GitHubPublishDialog({ projectName, dirty, remote, onClose, onPublish }: {
  projectName: string; dirty: boolean; remote?: { repository: string; private: boolean };
  onClose: () => void; onPublish: (selection: GitHubPublishSelection) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(remote?.repository ?? (projectName.replace(/[^A-Za-z0-9_.-]+/gu, "-").replace(/^[.-]+|[.-]+$/gu, "").slice(0, 100) || "ftc-robot"));
  const [isPrivate, setPrivate] = useState(remote?.private ?? true);
  const [credential, setCredential] = useState<GitCredential>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { previous?.focus(); };
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!credential || submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(null);
    try { await onPublish({ name: name.trim(), private: isPrivate, credential }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not publish the project."); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="github-publish-title"
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]") ?? []);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit}>
      <h2 id="github-publish-title">Publish to GitHub</h2>
      <fieldset disabled={busy}>
        <label><span>Repository name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)}
          required maxLength={100} pattern="[A-Za-z0-9_.\-]+" disabled={!!remote} spellCheck={false} /></label>
        <label><span>Visibility</span><select value={isPrivate ? "private" : "public"} disabled={!!remote} onChange={(event) => setPrivate(event.target.value === "private")}>
          <option value="private">Private</option><option value="public">Public</option>
        </select></label>
        <GitHubCredentials onChange={setCredential} disabled={busy} />
      </fieldset>
      {dirty && <p className={styles.hint}>Uncommitted changes will be committed before publishing.</p>}
      {remote && error && <p className={styles.hint}>Repository connected. Retry to finish uploading.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {busy && <p role="status">Publishing…</p>}
      <footer><button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className={styles.primary} disabled={busy || !credential || !name.trim()}>{busy ? "Publishing…" : remote ? "Retry push" : "Publish"}</button></footer>
    </form>
  </dialog>;
}
