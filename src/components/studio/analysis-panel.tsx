"use client";

import { useState, useSyncExternalStore } from "react";
import { encodeAnalysisCsv, encodeWpilog, type AnalysisSample } from "@/lib/analysis/wpilog";
import type { AnalysisStore } from "@/lib/analysis/store";
import type { AdvantageScopePublisher } from "@/lib/analysis/live-publisher";
import type { AdvantageScopeSceneAssets } from "@/lib/analysis/scene-assets";
import styles from "./analysis-panel.module.css";

function download(bytes: Uint8Array | string, extension: string, mime: string, filename?: string) {
  const data = typeof bytes === "string" ? bytes : new Uint8Array(bytes);
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const anchor = document.createElement("a"); anchor.href = url;
  anchor.download = filename ?? `ftc-simulation-${new Date().toISOString().replace(/[:.]/gu, "-")}.${extension}`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
const number = (value: number) => Number.isInteger(value) ? String(value) : Number(value.toPrecision(5)).toString();

function Trace({ samples, channel, start, end, cursor }: { samples: readonly AnalysisSample[]; channel: string; start: number; end: number; cursor: number }) {
  const points = samples.flatMap((sample) => {
    const value = sample.values[channel];
    return sample.time >= start && sample.time <= end && (typeof value === "number" || typeof value === "boolean") ? [{ time: sample.time, value: Number(value) }] : [];
  });
  const selected = points.findLast((point) => point.time <= cursor);
  const valueAtCursor = samples.findLast((sample) => sample.time <= cursor && channel in sample.values)?.values[channel];
  let min = Infinity, max = -Infinity, sum = 0;
  for (const point of points) { min = Math.min(min, point.value); max = Math.max(max, point.value); sum += point.value; }
  const stride = Math.max(1, Math.ceil(points.length / 800));
  const plotted = points.filter((_, index) => index % stride === 0 || index === points.length - 1);
  const x = (time: number) => 40 + (time - start) / Math.max(1, end - start) * 680;
  const y = (value: number) => 112 - (value - min) / (max === min ? 1 : max - min) * 92;
  return <section className={styles.trace} aria-label={`Analysis of ${channel}`}>
    <header><strong>{channel}</strong><output>{typeof valueAtCursor === "number" ? number(valueAtCursor) : valueAtCursor === undefined ? "—" : Array.isArray(valueAtCursor) ? JSON.stringify(valueAtCursor) : String(valueAtCursor)}</output></header>
    {points.length ? <>
      <svg viewBox="0 0 744 140" role="img" aria-label={`${channel}, ${points.length} samples, minimum ${number(min)}, maximum ${number(max)}`}>
        <path d="M40 16v100h682" className={styles.axis} />
        <text x="1" y="24">{number(max)}</text><text x="1" y="114">{number(min)}</text>
        <text x="40" y="135">{(start / 1000).toFixed(2)} s</text><text x="720" y="135" textAnchor="end">{(end / 1000).toFixed(2)} s</text>
        <polyline points={plotted.map((point) => `${x(point.time)},${max === min ? 66 : y(point.value)}`).join(" ")} className={styles.line} />
        <path d={`M${x(cursor)} 16v100`} className={styles.cursor} />
        {selected && <circle cx={x(selected.time)} cy={max === min ? 66 : y(selected.value)} r="3" className={styles.dot} />}
      </svg>
      <dl className={styles.stats}>
        <div><dt>Min</dt><dd>{number(min)}</dd></div><div><dt>Max</dt><dd>{number(max)}</dd></div>
        <div><dt>Mean</dt><dd>{number(sum / points.length)}</dd></div>
        <div><dt>Change</dt><dd>{number(points.at(-1)!.value - points[0].value)}</dd></div><div><dt>Samples</dt><dd>{points.length}</dd></div>
      </dl>
    </> : <p>No numeric or boolean samples for this signal in the selected time range. Text and arrays are available in recorded values.</p>}
  </section>;
}

function AdvantageScopeModels({ assets }: { assets: AdvantageScopeSceneAssets }) {
  const { ready } = useSyncExternalStore(assets.subscribe, assets.getSnapshot, assets.getSnapshot);
  const [exporting, setExporting] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const exportModels = async () => {
    setExporting(true); setError(""); setMessage("");
    try {
      const pack = await assets.export();
      download(pack.bytes, "zip", "application/zip", pack.filename);
      setMessage(`Downloaded ${pack.fieldName} and your robot model. Extract the ZIP and follow its README to load the assets and layout in AdvantageScope.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The 3D models could not be exported."); }
    finally { setExporting(false); }
  };
  return <div className={styles.models}>
    <button type="button" disabled={!ready || exporting} onClick={() => void exportModels()}>{exporting ? "Exporting 3D models…" : "Download robot + field models"}</button>
    <p>{ready ? "Includes the configured robot, field, and layouts for live streaming or recorded logs. The robot follows the same pose in AdvantageScope’s 3D Field view." : "Open the Robot Simulator and wait for its models to load to export the 3D assets."}</p>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <details><summary>3D view setup</summary><ol>
      <li>Extract the model ZIP. In AdvantageScope, choose <strong>AdvantageScope/App → Show Assets Folder</strong>, then copy the <code>Robot_</code> and <code>Field3d_</code> folders there.</li>
      <li>Choose <strong>File → Import Layout</strong> and select <code>layout-live.json</code> or <code>layout-recorded.json</code>. This replaces the current window layout; export it first if you want to keep it.</li>
      <li>Connect live or open your <code>.wpilog</code>. Keep the coordinate system on Automatic or Center/Red.</li>
    </ol><p>The model includes imported CAD. Mechanism positions are captured when the field loads; individual joints and moving field objects are not streamed separately.</p></details>
  </div>;
}

export function AnalysisPanel({ store, publisher, assets }: { store: AnalysisStore; publisher: AdvantageScopePublisher; assets?: AdvantageScopeSceneAssets }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const live = useSyncExternalStore(publisher.subscribe, publisher.getSnapshot, publisher.getSnapshot);
  const [channel, setChannel] = useState(""); const [comparison, setComparison] = useState("");
  const [search, setSearch] = useState(""); const [windowSeconds, setWindowSeconds] = useState(30);
  const [cursor, setCursor] = useState<number | null>(null); const [bridgeUrl, setBridgeUrl] = useState(""); const [error, setError] = useState("");
  const samples = store.getSamples();
  const selected = snapshot.channels.includes(channel) ? channel : snapshot.channels.find((name) => name.endsWith("/Power")) ?? snapshot.channels[0] ?? "";
  const channels = snapshot.channels.filter((name) => name.toLowerCase().includes(search.toLowerCase()));
  const end = snapshot.end, start = windowSeconds ? Math.max(snapshot.start, end - windowSeconds * 1000) : snapshot.start;
  const time = cursor === null ? end : Math.max(start, Math.min(end, cursor));
  const selectedSample = samples.findLast((sample) => sample.time <= time);
  const exportLog = (csv: boolean) => {
    try {
      setError("");
      if (csv) download(encodeAnalysisCsv(samples), "csv", "text/csv;charset=utf-8");
      else download(encodeWpilog(samples, { truncated: snapshot.truncated, coordinateFrame: "center-red", exportedAt: new Date().toISOString() }), "wpilog", "application/octet-stream");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The recording could not be exported."); }
  };
  return <div className={styles.panel}>
    <div className={styles.toolbar}>
      <span role="status">{snapshot.recording ? "Recording" : "Recording paused"} · {snapshot.count.toLocaleString()} frames · {((end - snapshot.start) / 1000).toFixed(1)} s</span>
      <div><button type="button" onClick={() => store.setRecording(!snapshot.recording)}>{snapshot.recording ? "Pause recording" : "Resume recording"}</button>
        <button type="button" disabled={!samples.length} onClick={() => { store.clear(); setCursor(null); }}>Clear</button>
        <button type="button" disabled={!samples.length} onClick={() => exportLog(false)}>Download .wpilog</button>
        <button type="button" disabled={!samples.length} onClick={() => exportLog(true)}>CSV</button></div>
    </div>
    {snapshot.truncated && <p role="status">Showing the newest part of this run. Older frames were removed at the recording limit of 24 MiB or 30,000 frames.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <details className={styles.bridge}><summary>AdvantageScope <span>{live.status === "connected" ? "Connected" : "Desktop streaming"}</span></summary>
      <ol><li><a href="/tools/ftc-advantagescope-bridge.js" download>Download the bridge</a>, then run <code>bun ftc-advantagescope-bridge.js</code> in its folder. Requires <a href="https://bun.sh" target="_blank" rel="noreferrer">Bun</a>.</li>
        <li>Paste the private bridge URL below and connect.</li>
        <li>In AdvantageScope, choose <strong>File → Connect to Simulator → FTC Dashboard</strong>.</li></ol>
      <form onSubmit={(event) => { event.preventDefault(); publisher.connect(bridgeUrl.trim(), store); }}>
        <label>Local bridge URL<input type="text" autoComplete="off" spellCheck={false} placeholder="ws://127.0.0.1:8000/publish/…" value={bridgeUrl} onChange={(event) => setBridgeUrl(event.target.value)} disabled={live.status === "connected"} required /></label>
        {live.status === "connected" ? <button type="button" onClick={() => publisher.disconnect()}>Disconnect</button> : <button type="submit" disabled={!bridgeUrl.trim() || live.status === "connecting"}>{live.status === "connecting" ? "Connecting…" : "Connect"}</button>}
      </form>
      <p role={live.status === "error" ? "alert" : "status"} className={live.status === "error" ? styles.error : undefined}>{live.message || "Use the simulator and AdvantageScope on the same computer. Recorded logs open directly in AdvantageScope without a bridge."}</p>
      {assets && <AdvantageScopeModels assets={assets} />}
    </details>
    {!samples.length ? <p className={styles.empty}>Run an OpMode to record telemetry, motors, sensors, and robot pose. Enable debugging to include TeamCode fields; paused locals and watches are recorded when a breakpoint hits.</p> : <>
      <div className={styles.controls}>
        <label>Find signals<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Motor, telemetry, variable…" /></label>
        <label>Signal<select value={selected} onChange={(event) => setChannel(event.target.value)}>
          {!channels.includes(selected) && selected && <option value={selected}>{selected}</option>}
          {channels.map((name) => <option value={name} key={name}>{name}</option>)}
        </select></label>
        <label>Compare<select value={comparison} onChange={(event) => setComparison(event.target.value)}><option value="">None</option>{channels.filter((name) => name !== selected).map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>Time range<select value={windowSeconds} onChange={(event) => setWindowSeconds(Number(event.target.value))}><option value={10}>Last 10 s</option><option value={30}>Last 30 s</option><option value={60}>Last 60 s</option><option value={0}>Whole recording</option></select></label>
      </div>
      <div className={styles.scrubber}><label>Time cursor <output>{(time / 1000).toFixed(3)} s</output><input type="range" aria-label="Analysis time cursor" min={start} max={Math.max(start + 1, end)} step={1} value={time} onChange={(event) => setCursor(Number(event.target.value))} /></label><label><input type="checkbox" checked={cursor === null} onChange={(event) => setCursor(event.target.checked ? null : time)} /> Follow live</label></div>
      <div className={styles.traces}><Trace samples={samples} channel={selected} start={start} end={end} cursor={time} />{comparison && comparison !== selected && <Trace samples={samples} channel={comparison} start={start} end={end} cursor={time} />}</div>
      {comparison && <p>Traces share simulation time and use independent vertical scales.</p>}
      <details className={styles.values}><summary>Recorded values at cursor</summary><table><thead><tr><th scope="col">Signal</th><th scope="col">Value</th></tr></thead><tbody>{Object.entries(selectedSample?.values ?? {}).filter(([name]) => name.toLowerCase().includes(search.toLowerCase())).map(([name, value]) => <tr key={name}><th scope="row">{name}</th><td>{Array.isArray(value) ? JSON.stringify(value) : String(value)}</td></tr>)}</tbody></table></details>
    </>}
  </div>;
}
