"use client";

import { useState, useSyncExternalStore } from "react";
import type { DebugVariable } from "@ftc-studio/opmode-protocol";
import type { DebuggerController } from "@/lib/debugger";
import styles from "./debug-panel.module.css";

function Variable({ item }: { item: DebugVariable }) {
  const label = <><span>{item.name}</span><code title={item.type}>{item.error || item.value}{item.truncated ? " …" : ""}</code></>;
  return <li>{item.children?.length ? <details><summary>{label}</summary><ul>{item.children.map((child, index) => <Variable key={`${child.name}-${index}`} item={child} />)}</ul></details> : <div className={item.error ? styles.error : styles.variable}>{label}</div>}</li>;
}

export function DebugPanel({ controller, sourcePaths, activePath, runActive, onOpenFile, onStop }: {
  controller: DebuggerController; sourcePaths: string[]; activePath: string; runActive: boolean;
  onOpenFile(path: string, line?: number): void; onStop(): void;
}) {
  const { enabled, breakpoints, watches, state, fields, selectedFrame, busy, error } = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [path, setPath] = useState(""); const [line, setLine] = useState("1"); const [watch, setWatch] = useState("");
  const paused = state.status === "paused", attached = state.status !== "disabled";
  const frame = state.frames.find((frame) => frame.id === selectedFrame);
  const selectedPath = sourcePaths.includes(path) ? path : sourcePaths.includes(activePath) ? activePath : sourcePaths[0] ?? "";
  return <div className={styles.panel}>
    <div className={styles.toolbar}>
      <label><input type="checkbox" checked={enabled} disabled={runActive} onChange={(event) => controller.setEnabled(event.target.checked)} /> Enable debugging</label>
      <span role="status">{paused ? `Paused at ${frame?.path?.split("/").at(-1) ?? "JVM"}:${frame?.line ?? "?"}` : attached ? "Running with debugger" : enabled ? "Ready for the next run" : "Enable before Play or INIT"}</span>
      <div className={styles.actions}>
        <button type="button" disabled={!attached || busy} onClick={() => void controller.command(paused ? "continue" : "pause")}>{paused ? "Continue" : "Pause"}</button>
        <button type="button" disabled={!paused || busy} onClick={() => void controller.command("step-over")}>Step over</button>
        <button type="button" disabled={!paused || busy} onClick={() => void controller.command("step-in")}>Step in</button>
        <button type="button" disabled={!paused || busy} onClick={() => void controller.command("step-out")}>Step out</button>
        <button type="button" disabled={!runActive} onClick={onStop}>Stop</button>
      </div>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.columns}>
      <section aria-label="Breakpoints"><h3>Breakpoints <small>F9 in the editor</small></h3>
        <form className={styles.add} onSubmit={(event) => { event.preventDefault(); if (selectedPath) controller.addBreakpoint(selectedPath, Number(line)); }}>
          <select aria-label="Breakpoint source" value={selectedPath} onChange={(event) => setPath(event.target.value)} disabled={busy || !sourcePaths.length}>
            {sourcePaths.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
          <input aria-label="Breakpoint line" type="number" min="1" max="1000000" value={line} onChange={(event) => setLine(event.target.value)} required />
          <button type="submit" disabled={busy || !selectedPath}>Add</button>
        </form>
        {!breakpoints.length && <p>Click the editor gutter or add a source line. Blocks use their generated Java.</p>}
        <ul className={styles.points}>{breakpoints.map((point) => {
          const binding = state.breakpoints.find(({ id }) => id === point.id);
          return <li key={point.id}>
            <input type="checkbox" aria-label={`Enable breakpoint ${point.path}:${point.line}`} checked={point.enabled} disabled={busy} onChange={(event) => controller.enableBreakpoint(point.id, event.target.checked)} />
            <button type="button" className={styles.location} title={`${point.path}\n${binding?.verified ? "Verified" : binding?.message ?? "Resolved when its class loads"}`} onClick={() => onOpenFile(point.path, point.line)}>
              <span className={binding?.verified ? styles.verified : styles.pending} aria-label={binding?.verified ? "Verified breakpoint" : "Pending breakpoint"}>●</span> {point.path.split("/").at(-1)}:{point.line}
            </button>
            <button type="button" aria-label={`Remove breakpoint ${point.path}:${point.line}`} disabled={busy} onClick={() => controller.removeBreakpoint(point.id)}>×</button>
          </li>;
        })}</ul>
        {paused && <><h3>Call stack</h3><ol className={styles.stack}>{state.frames.map((entry) => <li key={entry.id}><button type="button" disabled={busy} aria-current={entry.id === selectedFrame ? "location" : undefined} onClick={() => void controller.command("inspect", entry.id)}>{entry.method}<small>{entry.path?.split("/").at(-1) ?? "Library"}:{entry.line}</small></button></li>)}</ol></>}
      </section>
      <section aria-label="Variables"><h3>{paused ? "Variables in selected frame" : "TeamCode fields"}</h3>
        <ul className={styles.variables}>{(paused ? frame?.variables ?? [] : fields).map((item, index) => <Variable key={`${item.name}-${index}`} item={item} />)}</ul>
        {!(paused ? frame?.variables.length : fields.length) && <p>{paused ? "No variables available in this frame." : "Fields appear while a debug run is active. Pause for local variables and the call stack."}</p>}
        {paused && <p>Simulation time is frozen. Pauses can last up to five minutes.</p>}
      </section>
      <section aria-label="Watches"><h3>Watches</h3>
        <form className={styles.add} onSubmit={(event) => { event.preventDefault(); if (controller.addWatch(watch.trim())) setWatch(""); }}>
          <input aria-label="Watch variable path" placeholder="this.target or samples[0]" value={watch} maxLength={256} onChange={(event) => setWatch(event.target.value)} required />
          <button type="submit" disabled={busy}>Add</button>
        </form>
        <p>Read-only variable, field, and array paths. Values resolve in the selected frame while paused.</p>
        <ul className={styles.watches}>{watches.map((name) => <li key={name}><ul className={styles.variables}><Variable item={state.watches.find((item) => item.name === name) ?? { name, type: "pending", value: "Pause to inspect" }} /></ul><button type="button" disabled={busy} aria-label={`Remove watch ${name}`} onClick={() => controller.removeWatch(name)}>×</button></li>)}</ul>
      </section>
    </div>
  </div>;
}
