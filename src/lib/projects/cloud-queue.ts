export type CloudSyncStatus =
  | "idle"
  | "syncing"
  | "synced"
  | "offline"
  | "conflict"
  | "failed"
  | "paused-size"
  | "paused-runtime"
  | "update-unavailable";

export class CloudSyncError extends Error {
  constructor(
    public readonly code:
      | "SYNC_CONFLICT"
      | "SYNC_TOO_LARGE"
      | "SYNC_OFFLINE"
      | "SYNC_FAILED",
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CloudSyncError";
  }
}

function requiresExplicitRecovery(status: CloudSyncStatus | undefined): boolean {
  return status === "conflict"
    || status === "failed"
    || status === "offline"
    || status === "paused-size"
    || status === "update-unavailable";
}

/**
 * A separate, debounced queue for cloud persistence. Local autosave remains the
 * durability gate; a network failure never turns a successful IndexedDB write
 * into a failed editor save.
 */
export class CloudProjectSyncQueue {
  private pending = false;
  private active: Promise<void> | null = null;
  private activeController: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentStatus: CloudSyncStatus = "idle";
  private currentError: CloudSyncError | null = null;
  private closed = false;
  private paused = false;
  private statusBeforePause: {
    status: CloudSyncStatus;
    error: CloudSyncError | null;
  } | null = null;
  private readonly listeners = new Set<(status: CloudSyncStatus, error: CloudSyncError | null) => void>();

  constructor(
    private readonly sync: (signal: AbortSignal) => Promise<void>,
    private readonly debounceMilliseconds = 1_500,
    initialStatus: CloudSyncStatus = "idle",
    initialError: CloudSyncError | null = null,
  ) {
    this.currentStatus = initialStatus;
    this.currentError = initialError;
  }

  get status(): CloudSyncStatus {
    return this.currentStatus;
  }

  get error(): CloudSyncError | null {
    return this.currentError;
  }

  subscribe(listener: (status: CloudSyncStatus, error: CloudSyncError | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus, this.currentError);
    return () => this.listeners.delete(listener);
  }

  schedule(): void {
    if (this.closed) return;
    const recoveryStatus = this.paused
      ? this.statusBeforePause?.status
      : this.currentStatus;
    if (requiresExplicitRecovery(recoveryStatus)) return;
    this.pending = true;
    if (this.paused) {
      this.setStatus("paused-runtime", null);
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pump();
    }, this.debounceMilliseconds);
  }

  async drain(): Promise<void> {
    if (this.closed) return;
    if (this.paused) {
      throw new CloudSyncError(
        "SYNC_FAILED",
        "Cloud sync is paused while an OpMode is active. Stop the OpMode before leaving this project.",
      );
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending && !this.active) this.pump();
    while (this.active) await this.active;
    if (this.pending && !requiresExplicitRecovery(this.currentStatus)) {
      this.pump();
      return this.drain();
    }
    if (this.currentError) throw this.currentError;
  }

  async retry(): Promise<void> {
    if (this.closed) return;
    this.currentError = null;
    this.pending = true;
    if (this.paused) {
      this.setStatus("paused-runtime", null);
      return;
    }
    this.setStatus("idle", null);
    return this.drain();
  }

  /**
   * Live simulation owns the main thread and repository snapshot reads. Pausing
   * cancels any in-flight upload, retains the newest pending revision, and does
   * not turn that intentional cancellation into an offline error.
   */
  pause(): void {
    if (this.closed || this.paused) return;
    this.statusBeforePause = {
      status: this.currentStatus,
      error: this.currentError,
    };
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.active) {
      this.pending = true;
      this.activeController?.abort();
    }
    this.setStatus("paused-runtime", null);
  }

  resume(): void {
    if (this.closed || !this.paused) return;
    this.paused = false;
    const previous = this.statusBeforePause;
    this.statusBeforePause = null;
    this.setStatus(
      this.pending ? "idle" : previous?.status ?? "synced",
      this.pending ? null : previous?.error ?? null,
    );
    if (this.pending) this.schedule();
  }

  resetAfterResolution(): void {
    if (this.closed) return;
    this.currentError = null;
    this.pending = false;
    if (this.paused) {
      this.statusBeforePause = { status: "synced", error: null };
      this.setStatus("paused-runtime", null);
      return;
    }
    this.setStatus("synced", null);
  }

  close(): void {
    this.closed = true;
    this.pending = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.activeController?.abort();
    this.activeController = null;
    this.statusBeforePause = null;
    this.listeners.clear();
  }

  private setStatus(status: CloudSyncStatus, error: CloudSyncError | null): void {
    this.currentStatus = status;
    this.currentError = error;
    for (const listener of this.listeners) listener(status, error);
  }

  private pump(): void {
    if (
      this.closed
      || this.paused
      || this.active
      || !this.pending
      || requiresExplicitRecovery(this.currentStatus)
    ) return;
    this.pending = false;
    this.setStatus("syncing", null);
    const controller = new AbortController();
    this.activeController = controller;
    this.active = this.sync(controller.signal)
      .then(() => {
        if (this.closed || this.paused) return;
        this.setStatus(this.pending ? "idle" : "synced", null);
      })
      .catch((cause: unknown) => {
        if (this.closed) return;
        if (this.paused && (
          controller.signal.aborted
          || cause instanceof Error && cause.name === "AbortError"
        )) {
          this.setStatus("paused-runtime", null);
          return;
        }
        const error = cause instanceof CloudSyncError
          ? cause
          : new CloudSyncError(
              cause instanceof TypeError ? "SYNC_OFFLINE" : "SYNC_FAILED",
              cause instanceof Error ? cause.message : "Project cloud sync failed.",
              cause,
            );
        const status: CloudSyncStatus = error.code === "SYNC_CONFLICT"
          ? "conflict"
          : error.code === "SYNC_TOO_LARGE"
            ? "paused-size"
            : error.code === "SYNC_OFFLINE"
              ? "offline"
              : "failed";
        this.setStatus(status, error);
      })
      .finally(() => {
        if (this.activeController === controller) this.activeController = null;
        this.active = null;
        if (!this.closed && !this.paused && this.pending && !this.currentError) this.schedule();
      });
  }
}
