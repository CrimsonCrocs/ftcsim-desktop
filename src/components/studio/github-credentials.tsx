"use client";
import { useEffect, useRef, useState } from "react";
import { connectGitHub, githubAccount, type GitHubAccount } from "@/lib/github/client";
import type { GitCredential } from "@/lib/browser-git";

export function GitHubIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6a4.7 4.7 0 0 1 1.2-3.2 4.3 4.3 0 0 1 .1-3.2s1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2a4.7 4.7 0 0 1 1.2 3.2c0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" /></svg>;
}

export function GitHubCredentials({ onChange, disabled = false }: {
  onChange: (credential: GitCredential | undefined) => void;
  disabled?: boolean;
}) {
  const [token, setToken] = useState("");
  const [account, setAccount] = useState<GitHubAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const connectButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true;
    const initialGeneration = generation.current;
    void githubAccount().then((value) => { if (active && initialGeneration === generation.current) setAccount(value); }).catch(() => {
      if (active && initialGeneration === generation.current) setError("Could not check GitHub sign-in. You can still use a token.");
    });
    return () => { active = false; attempt.current?.abort(); };
  }, []);
  useEffect(() => {
    onChange(token.trim() ? { token: token.trim() } : account?.connected ? { session: true } : undefined);
  }, [token, account, onChange]);

  const signIn = async () => {
    if (connecting) return;
    generation.current++;
    const controller = new AbortController();
    attempt.current = controller;
    setConnecting(true);
    setError(null);
    try { setAccount(await connectGitHub(controller.signal)); }
    catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not sign in to GitHub."); }
    finally { if (!controller.signal.aborted) setConnecting(false); }
  };

  const disconnect = async () => {
    if (disconnecting) return;
    generation.current++;
    setDisconnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/github/connect", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not disconnect GitHub. Try again.");
      setAccount(previous => previous ? { ...previous, connected: false, login: null } : null);
      window.requestAnimationFrame(() => connectButton.current?.focus());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not disconnect GitHub."); }
    finally { setDisconnecting(false); }
  };

  return <div className="github-credentials">
    {account?.connected && <p role="status">GitHub: <strong>{account.login}</strong></p>}
    <button ref={connectButton} className="github-credentials__connect" type="button" onClick={() => { void signIn(); }} disabled={disabled || connecting || disconnecting || account?.configured === false}
      title={account?.configured === false ? "GitHub sign-in is not configured on this server" : undefined}>
      <GitHubIcon />
      <span>{connecting ? "Connecting…" : account?.connected ? "Reconnect GitHub" : "Sign in with GitHub"}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
    </button>
    {account?.connected && <button type="button" disabled={disabled || connecting || disconnecting} onClick={() => { void disconnect(); }}>{disconnecting ? "Disconnecting…" : "Disconnect GitHub"}</button>}
    {account?.configured === false && <small>GitHub sign-in isn’t configured yet. Use a token.</small>}
    <label><span>GitHub token{account?.connected ? " (optional)" : ""}</span>
      <input type="password" autoComplete="off" spellCheck={false} value={token} disabled={disabled || connecting}
        placeholder={account?.connected ? "Use a different account" : "Or paste a token"} onChange={(event) => setToken(event.target.value)} />
    </label>
    {token && <button type="button" disabled={disabled} onClick={() => setToken("")}>Forget token</button>}
    {error && <p role="alert" className="git-menu__error">{error}</p>}
  </div>;
}
