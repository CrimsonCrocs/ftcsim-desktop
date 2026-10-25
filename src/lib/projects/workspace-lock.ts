export interface ProjectWorkspaceLease {
  readonly readOnly: boolean;
  readonly whenWritable: Promise<boolean>;
  release(): void;
}

/** Holds a per-project Web Lock until release; unsupported browsers remain writable. */
export async function acquireProjectWorkspaceLease(
  projectId: string,
  providedLocks?: Pick<LockManager, "request"> | null,
): Promise<ProjectWorkspaceLease> {
  const locks = providedLocks === undefined
    ? typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : null
    : providedLocks;
  if (!locks) {
    return { readOnly: false, whenWritable: Promise.resolve(true), release() {} };
  }

  let released = false;
  let writable = false;
  let releaseLock: (() => void) | null = null;
  let reportAvailability: ((available: boolean) => void) | null = null;
  let reportWritable: ((available: boolean) => void) | null = null;
  const availability = new Promise<boolean>((resolve) => { reportAvailability = resolve; });
  const whenWritable = new Promise<boolean>((resolve) => { reportWritable = resolve; });
  const hold = new Promise<void>((resolve) => { releaseLock = resolve; });
  const promotionAbort = new AbortController();
  const lockName = `ftc-simulator-project-${projectId}`;

  const waitForPromotion = () => {
    void locks.request(
      lockName,
      { mode: "exclusive", signal: promotionAbort.signal },
      async (lock) => {
        if (!lock || released) {
          reportWritable?.(false);
          return;
        }
        writable = true;
        reportWritable?.(true);
        if (!released) await hold;
      },
    ).catch(() => reportWritable?.(false));
  };

  void locks.request(
    lockName,
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      reportAvailability?.(Boolean(lock));
      if (lock) {
        writable = true;
        reportWritable?.(true);
        await hold;
      } else {
        waitForPromotion();
      }
    },
  ).catch(() => {
    reportAvailability?.(false);
    reportWritable?.(false);
  });

  const available = await availability;
  return {
    get readOnly() { return !writable; },
    whenWritable,
    release() {
      if (released) return;
      released = true;
      promotionAbort.abort();
      releaseLock?.();
      releaseLock = null;
      if (!available && !writable) reportWritable?.(false);
    },
  };
}
