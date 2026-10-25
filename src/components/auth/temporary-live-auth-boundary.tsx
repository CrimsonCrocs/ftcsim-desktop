"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  TemporaryAuthExitCoordinator,
  type TemporaryAuthExitDecision,
  type TemporaryAuthExitHandler,
} from "@/lib/temporary-auth/exit-coordinator";
import {
  TEMPORARY_AUTH_BROADCAST_CHANNEL,
  isTemporaryAuthSignOutMessage,
  temporaryAuthSessionRequiresExit,
  type TemporaryAuthSignOutMessage,
} from "@/lib/temporary-auth/lifecycle";
import { temporaryAuthClient } from "@/lib/temporary-auth/client";
import styles from "./temporary-live-auth-boundary.module.css";

interface TemporaryAuthExitContextValue {
  completeSignOut(): void;
  prepareForSignOut(): Promise<TemporaryAuthExitDecision>;
  register(handler: TemporaryAuthExitHandler): () => void;
}

const TemporaryAuthExitContext = createContext<TemporaryAuthExitContextValue | null>(null);

function openBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(TEMPORARY_AUTH_BROADCAST_CHANNEL);
  } catch {
    return null;
  }
}

export function useTemporaryAuthExitHandler(handler: TemporaryAuthExitHandler | null): void {
  const context = useContext(TemporaryAuthExitContext);
  if (!context) {
    throw new Error("useTemporaryAuthExitHandler must be used inside LiveAuthBoundary.");
  }

  useEffect(() => {
    if (!handler) return;
    return context.register(handler);
  }, [context, handler]);
}

export function useTemporaryAuthExit(): Pick<
  TemporaryAuthExitContextValue,
  "completeSignOut" | "prepareForSignOut"
> {
  const context = useContext(TemporaryAuthExitContext);
  if (!context) {
    throw new Error("useTemporaryAuthExit must be used inside LiveAuthBoundary.");
  }
  return context;
}

export function LiveAuthBoundary({
  children,
  expectedUserId,
}: {
  children: ReactNode;
  expectedUserId: string | null;
}) {
  const { data: session, isPending } = temporaryAuthClient.useSession();
  const [explicitlyRevoked, setExplicitlyRevoked] = useState(false);
  const [revocationAttempt, setRevocationAttempt] = useState(0);
  const [revocationState, setRevocationState] = useState<"saving" | "failed">("saving");
  const coordinator = useRef(new TemporaryAuthExitCoordinator());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);

  const shouldExit = temporaryAuthSessionRequiresExit({
    expectedUserId,
    sessionUserId: session?.user.id ?? null,
    isPending,
    explicitlyRevoked,
  });

  useEffect(() => {
    const channel = openBroadcastChannel();
    channelRef.current = channel;
    if (!channel) return;

    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isTemporaryAuthSignOutMessage(event.data)) setExplicitlyRevoked(true);
    };
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, []);

  useEffect(() => {
    if (!shouldExit) return;
    let cancelled = false;
    void coordinator.current.prepare("revoked").then(
      (decision) => {
        if (cancelled) return;
        if (decision === "ready") {
          window.location.reload();
          return;
        }
        setRevocationState("failed");
      },
      () => {
        if (!cancelled) setRevocationState("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revocationAttempt, shouldExit]);

  useEffect(() => {
    if (shouldExit && revocationState === "failed") retryButtonRef.current?.focus();
  }, [revocationState, shouldExit]);

  const register = useCallback((handler: TemporaryAuthExitHandler) => (
    coordinator.current.register(handler)
  ), []);
  const prepareForSignOut = useCallback(() => coordinator.current.prepare("sign-out"), []);
  const completeSignOut = useCallback(() => {
    setExplicitlyRevoked(true);
    const message: TemporaryAuthSignOutMessage = { type: "signed-out", version: 1 };
    const existingChannel = channelRef.current;
    if (existingChannel) {
      existingChannel.postMessage(message);
      return;
    }
    const channel = openBroadcastChannel();
    channel?.postMessage(message);
    channel?.close();
  }, []);
  const context = useMemo<TemporaryAuthExitContextValue>(() => ({
    completeSignOut,
    prepareForSignOut,
    register,
  }), [completeSignOut, prepareForSignOut, register]);

  return (
    <TemporaryAuthExitContext.Provider value={context}>
      <div
        className={`${styles.content}${shouldExit ? ` ${styles.contentExiting}` : ""}`}
        inert={shouldExit ? true : undefined}
        aria-hidden={shouldExit ? true : undefined}
      >
        {children}
      </div>
      {shouldExit && (
        <main className={styles.screen}>
          {revocationState === "saving" ? (
            <span className={styles.status} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              Securing your local work…
            </span>
          ) : (
            <section className={styles.recovery} role="alertdialog" aria-modal="true" aria-labelledby="revocation-title">
              <h1 id="revocation-title">Your session ended</h1>
              <p>
                FTC Simulator could not save the latest local edit. Retry before continuing, or leave
                this account and continue in guest mode without that unsaved change.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryAction}
                  onClick={() => window.location.reload()}
                >
                  Continue as a guest
                </button>
                <button
                  ref={retryButtonRef}
                  type="button"
                  className={styles.primaryAction}
                  onClick={() => {
                    setRevocationState("saving");
                    setRevocationAttempt((attempt) => attempt + 1);
                  }}
                >
                  Retry local save
                </button>
              </div>
            </section>
          )}
        </main>
      )}
    </TemporaryAuthExitContext.Provider>
  );
}
