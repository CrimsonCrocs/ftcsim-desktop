"use client";
import type { GitCredential } from "@/lib/browser-git";

export interface GitHubAccount { configured: boolean; connected: boolean; login: string | null }
export interface PublishedRepository { owner: string; repository: string; private: boolean }

function headers(credential?: GitCredential): HeadersInit {
  return credential && "token" in credential ? { Authorization: `Bearer ${credential.token.trim()}` } : {};
}

export async function githubAccount(credential?: GitCredential): Promise<GitHubAccount> {
  const response = await fetch("/api/github/account", { headers: headers(credential), cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not connect to GitHub.");
  return body;
}

export async function createGitHubRepository(name: string, isPrivate: boolean, credential: GitCredential): Promise<PublishedRepository> {
  const response = await fetch("/api/github/repositories", {
    method: "POST", headers: { ...headers(credential), "Content-Type": "application/json" },
    body: JSON.stringify({ name, private: isPrivate }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not publish the project.");
  return body;
}

/** Open synchronously from a click so browsers do not block the sign-in window. */
export async function connectGitHub(signal?: AbortSignal): Promise<GitHubAccount> {
  const popup = window.open("about:blank", "ftcsim-github", "popup,width=600,height=720");
  if (!popup) throw new Error("Allow the GitHub sign-in popup, then try again.");
  try {
    const response = await fetch("/api/github/connect", { method: "POST", signal });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || "GitHub sign-in could not be started.");
    if (signal?.aborted) throw new Error("GitHub sign-in cancelled.");
    popup.location.href = result.url;
    return await new Promise<GitHubAccount>((resolve, reject) => {
      let checking = false;
      const started = Date.now();
      const cleanup = () => { clearInterval(timer); window.removeEventListener("message", receive); signal?.removeEventListener("abort", cancel); };
      const cancel = () => { cleanup(); reject(new Error("GitHub sign-in cancelled.")); };
      const finish = async (failed = false) => {
        if (checking) return;
        checking = true;
        cleanup();
        try {
          if (failed) throw new Error("GitHub sign-in was cancelled or denied.");
          const account = await githubAccount();
          if (!account.connected) throw new Error("GitHub sign-in was cancelled. Try again or use a token.");
          resolve(account);
        } catch (error) { reject(error); }
      };
      const receive = (event: MessageEvent) => {
        if (event.origin === window.location.origin && event.source === popup && event.data?.type === "ftcsim-github-connected") {
          void finish(event.data.error === true);
        }
      };
      const timer = window.setInterval(() => {
        if (popup.closed) void finish();
        else if (Date.now() - started > 5 * 60_000) { cleanup(); reject(new Error("GitHub sign-in timed out. Try again.")); }
      }, 500);
      window.addEventListener("message", receive);
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  } finally { popup.close(); }
}
