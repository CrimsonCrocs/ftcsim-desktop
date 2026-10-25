export type AutosaveStatus = "saved" | "saving" | "failed";

export class AutosaveError extends Error {
  constructor(message: string, public readonly cause: unknown) {
    super(message);
    this.name = "AutosaveError";
  }
}

/** Immediate, serialized autosave that keeps only the newest queued value. */
export class CoalescingAutosave<T> {
  private pending: T | undefined;
  private failedValue: T | undefined;
  private active: Promise<void> | null = null;
  private lastError: AutosaveError | null = null;
  private currentStatus: AutosaveStatus = "saved";
  private readonly listeners = new Set<(status: AutosaveStatus, error: AutosaveError | null) => void>();

  constructor(private readonly write: (value: T) => Promise<void>) {}

  get status(): AutosaveStatus {
    return this.currentStatus;
  }

  get error(): AutosaveError | null {
    return this.lastError;
  }

  subscribe(listener: (status: AutosaveStatus, error: AutosaveError | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus, this.lastError);
    return () => this.listeners.delete(listener);
  }

  schedule(value: T): void {
    this.pending = value;
    if (this.currentStatus !== "failed") this.pump();
  }

  async drain(): Promise<void> {
    while (this.active) await this.active;
    if (this.currentStatus === "failed") throw this.lastError;
    if (this.pending !== undefined) {
      this.pump();
      return this.drain();
    }
  }

  async retry(): Promise<void> {
    if (this.currentStatus !== "failed") return this.drain();
    if (this.pending === undefined) this.pending = this.failedValue;
    this.failedValue = undefined;
    this.lastError = null;
    this.setStatus("saving");
    this.pump();
    return this.drain();
  }

  private setStatus(status: AutosaveStatus, error: AutosaveError | null = this.lastError): void {
    this.currentStatus = status;
    for (const listener of this.listeners) listener(status, error);
  }

  private pump(): void {
    if (this.active || this.pending === undefined || this.currentStatus === "failed") return;
    const value = this.pending;
    this.pending = undefined;
    this.setStatus("saving", null);
    this.active = this.write(value)
      .then(() => {
        this.failedValue = undefined;
        this.lastError = null;
        this.setStatus(this.pending === undefined ? "saved" : "saving", null);
      })
      .catch((cause: unknown) => {
        this.failedValue = value;
        this.lastError = new AutosaveError("Project changes could not be saved.", cause);
        this.setStatus("failed", this.lastError);
      })
      .finally(() => {
        this.active = null;
        if (this.currentStatus !== "failed") this.pump();
      });
  }
}

