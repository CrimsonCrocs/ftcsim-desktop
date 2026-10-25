export interface BlocksRegenerationToken {
  readonly id: number;
  readonly promise: Promise<void>;
}

interface ActiveRegeneration {
  token: BlocksRegenerationToken;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class BlocksRegenerationGate {
  private generation = 0;
  private active: ActiveRegeneration | null = null;
  private failure: Error | null = null;
  private failureTokenId: number | null = null;

  constructor(private readonly timeoutMillis = 8_000) {}

  begin(): BlocksRegenerationToken {
    if (this.active) return this.active.token;
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    // Build/Run will await the original promise. This handler also keeps an
    // early generation failure from becoming an unhandled rejection.
    void promise.catch(() => undefined);
    const token = { id: ++this.generation, promise };
    this.failure = null;
    this.failureTokenId = null;
    const timeout = setTimeout(() => {
      this.reject(
        token,
        new Error("The Blocks editor did not become ready in time. Retry Java regeneration."),
      );
    }, this.timeoutMillis);
    this.active = { token, resolve, reject, timeout };
    return token;
  }

  current(): BlocksRegenerationToken | null {
    return this.active?.token ?? null;
  }

  wait(): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    return this.active?.token.promise ?? Promise.resolve();
  }

  failureFor(token: BlocksRegenerationToken): Error | null {
    return this.failureTokenId === token.id ? this.failure : null;
  }

  resolve(token: BlocksRegenerationToken | null): boolean {
    if (!token || this.active?.token.id !== token.id) return false;
    const active = this.active;
    this.active = null;
    this.failure = null;
    this.failureTokenId = null;
    clearTimeout(active.timeout);
    active.resolve();
    return true;
  }

  reject(token: BlocksRegenerationToken | null, error: Error): boolean {
    if (!token || this.active?.token.id !== token.id) return false;
    const active = this.active;
    this.active = null;
    this.failure = error;
    this.failureTokenId = token.id;
    clearTimeout(active.timeout);
    active.reject(error);
    return true;
  }

  cancel(error: Error): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    this.failure = error;
    this.failureTokenId = active.token.id;
    clearTimeout(active.timeout);
    active.reject(error);
  }
}
