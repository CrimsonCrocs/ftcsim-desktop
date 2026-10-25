"use client";

import Link from "next/link";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { temporaryAuthClient } from "@/lib/temporary-auth/client";
import { useProjectAccountId } from "@/lib/projects/catalog-context";
import { useTemporaryAuthExit } from "./temporary-live-auth-boundary";
import styles from "./temporary-account-menu.module.css";

export function TemporaryAccountMenu({ placement = "studio" }: { placement?: "studio" | "welcome" }) {
  const { data: session } = temporaryAuthClient.useSession();
  const accountId = useProjectAccountId();
  const accountSession = accountId !== null ? session : null;
  const { completeSignOut, prepareForSignOut } = useTemporaryAuthExit();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuAction = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    window.requestAnimationFrame(() => menuAction.current?.focus());
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const signOut = async () => {
    if (signingOut || !accountSession) return;
    setSigningOut(true);
    setSignOutError(null);

    let decision: Awaited<ReturnType<typeof prepareForSignOut>>;
    try {
      decision = await prepareForSignOut();
    } catch {
      setSignOutError("Your project could not be saved before signing out. Resolve the save or sync problem, then try again.");
      setSigningOut(false);
      return;
    }
    if (decision === "cancelled") {
      setOpen(false);
      setSigningOut(false);
      return;
    }

    try {
      const response = await temporaryAuthClient.signOut();
      if (response.error) {
        throw response.error;
      }
      completeSignOut();
      window.location.replace("/");
    } catch {
      setSignOutError("Could not sign out. Check your connection and session, then try again.");
      setSigningOut(false);
    }
  };

  const label = accountSession?.user.name || accountSession?.user.email || "Guest mode";
  return (
    <div ref={root} className={`${styles.root} ${styles[placement]}`}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={`Account and sync: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={`Account and sync: ${label}`}
      >
        <UserRound aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.menu} role="dialog" aria-label="Account and sync">
          <div className={styles.identity}>
            <span className={styles.avatar}><UserRound aria-hidden="true" /></span>
            <span>
              <strong>{accountSession?.user.name || (accountSession ? "Account" : "Guest mode")}</strong>
              {accountSession?.user.email && <small>{accountSession.user.email}</small>}
            </span>
          </div>
          {signOutError && (
            <p className={styles.error} role="alert">
              {signOutError}
            </p>
          )}
          {accountSession ? (
            <button ref={(node) => { menuAction.current = node; }} type="button" onClick={() => { void signOut(); }} disabled={signingOut}>
              <LogOut aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          ) : (
            <Link ref={(node) => { menuAction.current = node; }} className={styles.menuLink} href="/sign-in">
              <LogIn aria-hidden="true" />
              Sign in to sync projects
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
