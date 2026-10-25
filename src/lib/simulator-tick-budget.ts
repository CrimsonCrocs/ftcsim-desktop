/**
 * Acknowledges remote runtime frames after browser-local physics reaches its
 * next control boundary, without putting high-frequency state in React.
 */
export class SimulatorTickBudget {
  private readonly pending: number[] = [];
  private readonly acknowledgements = new Map<number, (completed: boolean) => void>();
  private readonly waiters = new Set<() => void>();
  private lastSequence = Number.NEGATIVE_INFINITY;

  grant(sequence: number): Promise<boolean> {
    if (!Number.isSafeInteger(sequence) || sequence <= this.lastSequence) {
      return Promise.resolve(false);
    }
    this.lastSequence = sequence;
    this.pending.push(sequence);
    const acknowledged = new Promise<boolean>((resolve) => {
      this.acknowledgements.set(sequence, resolve);
    });
    for (const wake of this.waiters) wake();
    return acknowledged;
  }

  /** Wake physics when a runner frame arrives instead of polling at 20 ms. */
  waitForGrant(timeoutMs: number): Promise<void> {
    if (this.pending.length) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timeout);
        this.waiters.delete(wake);
        resolve();
      };
      const timeout = setTimeout(wake, timeoutMs);
      this.waiters.add(wake);
    });
  }

  consumeSequences(maximum = Number.POSITIVE_INFINITY): number[] {
    const count = Math.min(this.pending.length, Math.max(0, Math.floor(maximum)));
    return this.pending.splice(0, count);
  }

  acknowledge(sequence: number): boolean {
    const resolve = this.acknowledgements.get(sequence);
    if (!resolve) return false;
    this.acknowledgements.delete(sequence);
    resolve(true);
    return true;
  }

  size(): number {
    return this.pending.length;
  }

  reset(): void {
    this.pending.length = 0;
    for (const resolve of this.acknowledgements.values()) resolve(false);
    this.acknowledgements.clear();
    this.lastSequence = Number.NEGATIVE_INFINITY;
    for (const wake of this.waiters) wake();
  }
}
