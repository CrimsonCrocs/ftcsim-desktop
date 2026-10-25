"use client";

import { memo, useState, useSyncExternalStore } from "react";
import type { AnalysisStore } from "@/lib/analysis/store";
import type { AdvantageScopePublisher } from "@/lib/analysis/live-publisher";
import type { AdvantageScopeSceneAssets } from "@/lib/analysis/scene-assets";
import { AnalysisPanel } from "./analysis-panel";
import type { OpModeState } from "@/lib/studio-types";
import type { TelemetryViewStore } from "@/lib/telemetry-store";
import styles from "./telemetry-panel.module.css";

interface TelemetryPanelProps {
  store: TelemetryViewStore;
  opModeState: OpModeState;
  drivetrainLabel: string;
  analysisStore?: AnalysisStore;
  advantageScope?: AdvantageScopePublisher;
  advantageScopeAssets?: AdvantageScopeSceneAssets;
  onAnalysisOpen?: () => void;
}

export const TelemetryPanel = memo(function TelemetryPanel({
  store,
  opModeState,
  drivetrainLabel,
  analysisStore,
  advantageScope,
  advantageScopeAssets,
  onAnalysisOpen,
}: TelemetryPanelProps) {
  const [view, setView] = useState<"live" | "analysis">("live");
  const { update, robot } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return <>
    {analysisStore && advantageScope && <div className={styles.modeBar} role="group" aria-label="Telemetry view">
      <button type="button" aria-pressed={view === "live"} onClick={() => setView("live")}>Live values</button>
      <button type="button" aria-pressed={view === "analysis"} onClick={() => { if (view !== "analysis") onAnalysisOpen?.(); setView("analysis"); }}>Analysis</button>
    </div>}
    {view === "analysis" && analysisStore && advantageScope ? <AnalysisPanel store={analysisStore} publisher={advantageScope} assets={advantageScopeAssets} /> : (
    <div className={styles.panel}>
      <section className={styles.teamCode} aria-label="TeamCode telemetry">
        <header className={styles.header}>
          <div>
            <strong>TeamCode telemetry</strong>
            <span>
              {update
                ? `Revision ${update.revision} · ${(update.simulationTimeMillis / 1_000).toFixed(2)} s simulation time`
                : <>Waiting for <span className={styles.inlineCode}>telemetry.update()</span></>}
            </span>
          </div>
          {update && (
            <dl className={styles.transport} aria-label="Telemetry transport settings">
              <div><dt>Format</dt><dd>{update.displayFormat}</dd></div>
              <div><dt>Auto-clear</dt><dd>{update.autoClear ? "On" : "Off"}</dd></div>
              <div><dt>Interval</dt><dd>{update.transmissionIntervalMillis} ms</dd></div>
            </dl>
          )}
        </header>

        {update?.rows.length ? (
          <ol className={styles.rows} aria-label="Published telemetry rows">
            {update.rows.map((row, rowIndex) => (
              <li className={row.kind === "line" ? styles.lineRow : styles.itemRow} key={`${row.kind}-${rowIndex}-${row.caption}`}>
                {row.kind === "line" ? (
                  <>
                    {row.caption && <span className={styles.lineCaption}>{row.caption}</span>}
                    {row.items.length > 0 ? (
                      <span className={styles.lineItems}>
                        {row.items.map((item, itemIndex) => (
                          <span key={`${itemIndex}-${item.caption}`}>
                            {item.caption && <span className={styles.caption}>{item.caption}{update.captionValueSeparator}</span>}
                            <span className={styles.value}>{item.value}</span>
                            {itemIndex < row.items.length - 1 && <span className={styles.separator}>{update.itemSeparator}</span>}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className={styles.value}>{row.composed}</span>
                    )}
                  </>
                ) : (
                  row.items.map((item, itemIndex) => (
                    <span className={styles.item} key={`${itemIndex}-${item.caption}`}>
                      <span className={styles.caption}>{item.caption}</span>
                      <span className={styles.value}>{item.value}</span>
                      {item.retained && <span className={styles.retained}>retained</span>}
                    </span>
                  ))
                )}
              </li>
            ))}
          </ol>
        ) : null}

        {update?.log.length ? (
          <section className={styles.log} aria-label="Telemetry log">
            <h3>Log</h3>
            <ol>{update.log.map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}</ol>
          </section>
        ) : null}
      </section>

      <aside className={styles.robot} aria-label="Simulator telemetry">
        <header><strong>Robot state</strong><span>Physical feedback</span></header>
        <dl>
          <div><dt>OpMode</dt><dd>{opModeState}</dd></div>
          <div><dt>Drive</dt><dd>{drivetrainLabel}</dd></div>
          <div><dt>X</dt><dd>{robot.x.toFixed(2)} m</dd></div>
          <div><dt>Y</dt><dd>{(-robot.z).toFixed(2)} m</dd></div>
          <div><dt>Heading</dt><dd>{robot.heading.toFixed(1)}°</dd></div>
          <div><dt>Velocity</dt><dd>{robot.velocity.toFixed(2)} m/s</dd></div>
          <div><dt>Physics</dt><dd>{robot.loopHz} Hz</dd></div>
        </dl>
      </aside>
    </div>
  )}</>;
});
