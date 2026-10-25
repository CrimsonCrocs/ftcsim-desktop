import type { DebugBreakpoint, DebugConfiguration, DebugMessage, DebugStackFrame, DebugState, DebugVariable } from "@ftc-studio/opmode-protocol";
import type { OpModeSession } from "./opmode-session";

export const EMPTY_DEBUG_STATE: DebugState = { status: "disabled", frames: [], watches: [], breakpoints: [] };
export const VARIABLE_PATH = /^(?:this\.)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d{1,5}\])*$/u;
interface DebuggerSnapshot {
  enabled: boolean;
  breakpoints: DebugBreakpoint[];
  watches: string[];
  state: DebugState;
  fields: DebugVariable[];
  selectedFrame: number;
  busy: boolean;
  error: string;
}

export class DebuggerController {
  private snapshot: DebuggerSnapshot = { enabled: false, breakpoints: [], watches: [], state: EMPTY_DEBUG_STATE, fields: [], selectedFrame: 0, busy: false, error: "" };
  private listeners = new Set<() => void>();
  private session?: OpModeSession;
  private unsubscribe?: () => void;
  private projectId = "";
  private sourcePaths: string[] = [];
  private configurationPending = false;
  private lastStateSignature = "";
  onLocation?: (frame: DebugStackFrame) => void;
  onPause?: (state: DebugState) => void;
  private onVariables?: (state: DebugState, frameId: number) => void;
  private onTerminated?: () => void;
  setHandlers(handlers: { onLocation?: (frame: DebugStackFrame) => void; onPause?: (state: DebugState) => void; onVariables?: (state: DebugState, frameId: number) => void; onTerminated?: () => void }) {
    this.onLocation = handlers.onLocation; this.onPause = handlers.onPause; this.onVariables = handlers.onVariables;
    this.onTerminated = handlers.onTerminated;
    return () => { this.onLocation = undefined; this.onPause = undefined; this.onVariables = undefined; this.onTerminated = undefined; };
  }
  get paused() { return this.snapshot.state.status === "paused"; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  load(projectId: string) {
    this.detach(); this.projectId = projectId;
    let enabled = false, breakpoints: DebugBreakpoint[] = [], watches: string[] = [];
    try {
      const saved = localStorage.getItem(`ftc-debugger:v1:${projectId}`);
      const value = saved && saved.length < 100_000 ? JSON.parse(saved) : null;
      if (value) {
        enabled = value.enabled === true;
        breakpoints = (Array.isArray(value.breakpoints) ? value.breakpoints : []).filter((point: DebugBreakpoint) => point
          && typeof point.id === "string" && /^[\w.-]{1,64}$/u.test(point.id) && typeof point.path === "string"
          && /\.(java|kt)$/u.test(point.path) && point.path.length <= 1024 && Number.isInteger(point.line) && point.line > 0 && typeof point.enabled === "boolean").slice(0, 128);
        watches = (Array.isArray(value.watches) ? value.watches : []).filter((watch: string) => typeof watch === "string" && watch.length <= 256 && VARIABLE_PATH.test(watch)).slice(0, 32);
      }
    } catch { /* Optional local preferences must not prevent opening a project. */ }
    this.set({ enabled, breakpoints, watches, state: EMPTY_DEBUG_STATE, fields: [], selectedFrame: 0, error: "", busy: false });
  }
  setEnabled(enabled: boolean) { this.set({ enabled }); this.persist(); }
  configuration(sourcePaths: string[]): DebugConfiguration | undefined {
    this.sourcePaths = sourcePaths.filter((path) => /\.(java|kt)$/u.test(path)).slice(0, 512);
    return this.snapshot.enabled ? { sourcePaths: this.sourcePaths, breakpoints: this.snapshot.breakpoints, watches: this.snapshot.watches } : undefined;
  }
  attach(session: OpModeSession) {
    this.unsubscribe?.(); this.session = session;
    this.lastStateSignature = ""; this.configurationPending = false;
    this.set({ state: EMPTY_DEBUG_STATE, fields: [], error: "", busy: false });
    this.unsubscribe = session.onDebugState?.((state) => this.accept(state));
  }
  detach() { this.unsubscribe?.(); this.unsubscribe = undefined; this.session = undefined; this.lastStateSignature = ""; this.configurationPending = false; this.set({ state: EMPTY_DEBUG_STATE, busy: false }); }
  updateFields(fields: DebugVariable[]) { this.set({ fields }); }
  addBreakpoint(path: string, line: number) {
    if (!/\.(java|kt)$/u.test(path) || !Number.isInteger(line) || line < 1 || line > 1_000_000) return;
    if (this.snapshot.breakpoints.some((point) => point.path === path && point.line === line)) return;
    if (this.snapshot.breakpoints.length >= 128) { this.set({ error: "A project can have up to 128 breakpoints." }); return; }
    this.set({ breakpoints: [...this.snapshot.breakpoints, { id: crypto.randomUUID(), path, line, enabled: true }] });
    this.changed();
  }
  toggleBreakpoint(path: string, line: number) {
    const point = this.snapshot.breakpoints.find((point) => point.path === path && point.line === line);
    if (point) this.removeBreakpoint(point.id); else this.addBreakpoint(path, line);
  }
  moveBreakpoints(path: string, positions: Array<{ id: string; line: number }>) {
    const lines = new Map(positions.map((position) => [position.id, position.line]));
    if (!this.snapshot.breakpoints.some((point) => point.path === path && lines.has(point.id) && lines.get(point.id) !== point.line)) return;
    this.set({ breakpoints: this.snapshot.breakpoints.map((point) => point.path === path && lines.has(point.id) ? { ...point, line: lines.get(point.id)! } : point) }); this.changed();
  }
  removeBreakpoint(id: string) { this.set({ breakpoints: this.snapshot.breakpoints.filter((point) => point.id !== id) }); this.changed(); }
  enableBreakpoint(id: string, enabled: boolean) { this.set({ breakpoints: this.snapshot.breakpoints.map((point) => point.id === id ? { ...point, enabled } : point) }); this.changed(); }
  addWatch(path: string): boolean {
    if (!VARIABLE_PATH.test(path) || path.length > 256) { this.set({ error: "Use a variable, field, or array path, such as target, this.pid.error, or samples[0]." }); return false; }
    if (this.snapshot.watches.length >= 32) { this.set({ error: "A project can have up to 32 watches." }); return false; }
    if (!this.snapshot.watches.includes(path)) { this.set({ watches: [...this.snapshot.watches, path], error: "" }); this.changed(); }
    return true;
  }
  removeWatch(path: string) { this.set({ watches: this.snapshot.watches.filter((watch) => watch !== path) }); this.changed(); }
  async command(action: DebugMessage["action"], frameId?: number) {
    const session = this.session;
    if (!session?.debug || this.snapshot.busy) return;
    const previousFrame = this.snapshot.selectedFrame;
    this.set({ busy: true, error: "", ...(frameId === undefined ? {} : { selectedFrame: frameId }) });
    try {
      const state = await session.debug({ action, ...(frameId === undefined ? {} : { frameId }),
        ...(action === "configure" ? { configuration: { sourcePaths: this.sourcePaths, breakpoints: this.snapshot.breakpoints, watches: this.snapshot.watches } } : {}) });
      if (this.session !== session) return;
      if (frameId !== undefined) this.set({ selectedFrame: frameId });
      this.accept(state);
      if (frameId !== undefined && state.frames[frameId]) this.onLocation?.(state.frames[frameId]);
    } catch (error) { if (this.session === session) this.set({ error: error instanceof Error ? error.message : "Debugger command failed.", ...(frameId === undefined ? {} : { selectedFrame: previousFrame }) }); }
    finally {
      if (this.session === session) {
        this.set({ busy: false });
        if (this.configurationPending && this.snapshot.state.status !== "disabled") { this.configurationPending = false; void this.command("configure"); }
      }
    }
  }
  private accept(state: DebugState) {
    const signature = JSON.stringify(state);
    if (signature === this.lastStateSignature) return;
    this.lastStateSignature = signature;
    const wasPaused = this.paused;
    this.set({ state, ...(state.status !== "paused" ? { selectedFrame: 0 } : {}) });
    if (state.status === "paused" && !wasPaused) {
      this.onPause?.(state);
      if (state.frames[0]) this.onLocation?.(state.frames[0]);
    }
    if (state.status === "paused") this.onVariables?.(state, this.snapshot.selectedFrame);
    if (state.status === "disabled" && state.reason) { this.set({ error: state.reason }); this.onTerminated?.(); }
  }
  private changed() { this.persist(); if (this.session && this.snapshot.state.status !== "disabled") { if (this.snapshot.busy) this.configurationPending = true; else void this.command("configure"); } }
  private persist() {
    if (!this.projectId) return;
    try { const { enabled, breakpoints, watches } = this.snapshot; localStorage.setItem(`ftc-debugger:v1:${this.projectId}`, JSON.stringify({ enabled, breakpoints, watches })); } catch { this.set({ error: "Debugger preferences could not be saved on this device." }); }
  }
  private set(update: Partial<DebuggerSnapshot>) { this.snapshot = { ...this.snapshot, ...update }; for (const listener of this.listeners) listener(); }
}
