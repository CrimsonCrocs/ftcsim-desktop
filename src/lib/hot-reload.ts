export type HotReloadProgram = {
  entryClass: string;
  startAfterInit: boolean;
  revision: number;
};

export type HotReloadTicket = HotReloadProgram & {
  generation: number;
};

/** Coordinates reload attempts without owning the editor or runtime lifecycle. */
export class HotReloadController {
  private enabled = false;
  private program: HotReloadProgram | null = null;
  private activeTicket: HotReloadTicket | null = null;
  private generation = 0;
  private lastAttemptedRevision: number | null = null;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.activeTicket = null;
  }

  /**
   * Records the program that actually initialized. A changed manual program
   * or revision permits a fresh attempt, but never invalidates an active ticket.
   */
  recordProgram(program: HotReloadProgram): void {
    const changed = !this.program
      || this.program.entryClass !== program.entryClass
      || this.program.startAfterInit !== program.startAfterInit
      || this.program.revision !== program.revision;
    this.program = { ...program };
    if (changed) this.lastAttemptedRevision = null;
  }

  begin(savedRevision: number): HotReloadTicket | null {
    const program = this.program;
    if (!this.enabled || !program || this.activeTicket) return null;
    if (savedRevision <= program.revision || savedRevision <= (this.lastAttemptedRevision ?? -Infinity)) return null;

    const ticket: HotReloadTicket = {
      ...program,
      revision: savedRevision,
      generation: ++this.generation,
    };
    this.lastAttemptedRevision = savedRevision;
    this.activeTicket = ticket;
    return { ...ticket };
  }

  isCurrent(ticket: HotReloadTicket): boolean {
    return this.enabled && this.activeTicket?.generation === ticket.generation;
  }

  finish(ticket: HotReloadTicket, succeeded: boolean): void {
    if (this.activeTicket?.generation !== ticket.generation) return;
    this.activeTicket = null;
    if (succeeded && this.program
      && this.program.entryClass === ticket.entryClass
      && this.program.startAfterInit === ticket.startAfterInit
      && this.program.revision < ticket.revision) {
      this.program = { ...this.program, revision: ticket.revision };
    }
  }

  stop(): void {
    this.program = null;
    this.activeTicket = null;
    this.lastAttemptedRevision = null;
  }

  get armed(): boolean {
    return this.enabled && this.program !== null;
  }

  get active(): boolean {
    return this.activeTicket !== null;
  }
}

/** Full builds remain mandatory for changed dependencies, resources, or source sets. */
export function fastReloadSources(
  baseline: Readonly<Record<string, string | Uint8Array>>,
  current: Readonly<Record<string, string | Uint8Array>>,
  sourcePaths: readonly string[],
): Array<{path: string; content: string}> | null {
  if (!sourcePaths.length) return null;
  const before = Object.keys(baseline).sort();
  const after = Object.keys(current).sort();
  if (before.length !== after.length || before.some((path, index) => path !== after[index])) return null;
  const editable = new Set(sourcePaths);
  for (const path of before) {
    if (editable.has(path)) continue;
    const left = baseline[path];
    const right = current[path];
    if (typeof left === "string" && typeof right === "string") {
      if (left !== right) return null;
    } else {
      const a = typeof left === "string" ? new TextEncoder().encode(left) : left;
      const b = typeof right === "string" ? new TextEncoder().encode(right) : right;
      if (a.length !== b.length || a.some((value, index) => value !== b[index])) return null;
    }
  }
  const sources: Array<{path: string; content: string}> = [];
  for (const path of sourcePaths) {
    const content = current[path];
    if (typeof content !== "string") return null;
    sources.push({path, content});
  }
  return sources;
}
