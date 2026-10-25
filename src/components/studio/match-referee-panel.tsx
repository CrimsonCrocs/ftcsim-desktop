"use client";

import { useState, type FormEvent } from "react";
import type { BiobuzzRules } from "@ftc-studio/sim-core";
import styles from "./game-simulation-panel.module.css";

export type MatchRefereeDecision = Omit<BiobuzzRules.RefereeAdjustmentEvent, "type" | "timestampMs">;

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function MatchRefereePanel({ adjustments, onApply }: {
  adjustments: readonly BiobuzzRules.RefereeAdjustment[];
  onApply: (decision: MatchRefereeDecision) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const alliance = data.get("alliance");
    const matchPointsDelta = Number(data.get("points"));
    const rankingPointsDelta = Number(data.get("rankingPoints"));
    const note = String(data.get("note") ?? "").trim();
    const ruleId = String(data.get("ruleId") ?? "").trim();
    const warning = data.get("warning");
    setConfirmation(null);
    if ((alliance !== "red" && alliance !== "blue") || !Number.isSafeInteger(matchPointsDelta) || !Number.isSafeInteger(rankingPointsDelta) || !note) {
      setError("Enter whole-number score changes and a reason for the decision.");
      return;
    }
    try {
      onApply({
        alliance,
        matchPointsDelta,
        rankingPointsDelta,
        note,
        ...(ruleId ? { ruleId } : {}),
        ...(warning === "verbal" || warning === "yellow" || warning === "red" ? { warning } : {}),
      });
      form.reset();
      setError(null);
      setConfirmation(`Decision recorded for ${alliance === "red" ? "Red" : "Blue"}: ${signed(matchPointsDelta)} points, ${signed(rankingPointsDelta)} ranking points.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The decision could not be recorded.");
    }
  }

  return <details className={styles.refereeDetails}>
    <summary>Referee decisions{adjustments.length > 0 ? ` (${adjustments.length})` : ""}</summary>
    <p className={styles.refereeHelp}>Negative values subtract points. Decisions stay in the replay; add a correction to undo one.</p>
    <form className={styles.refereeForm} onSubmit={submit}>
      <label className={styles.field}><span>Alliance to adjust</span><select name="alliance" defaultValue="red"><option value="red">Red</option><option value="blue">Blue</option></select></label>
      <label className={styles.field}><span>Point change</span><input name="points" type="number" step="1" required defaultValue="0" /></label>
      <label className={styles.field}><span>Ranking-point change</span><input name="rankingPoints" type="number" step="1" required defaultValue="0" /></label>
      <label className={styles.field}><span>Rule (optional)</span><input name="ruleId" type="text" maxLength={64} placeholder="e.g. G402" /></label>
      <label className={`${styles.field} ${styles.refereeWide}`}><span>Warning or card (record only)</span><select name="warning" defaultValue="none"><option value="none">None</option><option value="verbal">Verbal warning</option><option value="yellow">Yellow card</option><option value="red">Red card</option></select></label>
      <label className={`${styles.field} ${styles.refereeWide}`}><span>Reason for decision</span><textarea name="note" required maxLength={1000} rows={2} /></label>
      <p className={`${styles.controlHint} ${styles.refereeWide}`}>Cards and warnings require separate score adjustments. Ranking points finalize at match completion.</p>
      <div className={styles.refereeWide}><button type="submit" className={styles.secondaryButton}>Record decision</button></div>
      {error && <p className={`${styles.error} ${styles.refereeWide}`} role="alert">{error}</p>}
      {confirmation && <p className={`${styles.refereeHelp} ${styles.refereeWide}`} role="status">{confirmation}</p>}
    </form>
    {adjustments.length > 0 && <ol className={styles.refereeHistory} aria-label="Recorded referee decisions">{adjustments.map((decision, index) => <li key={index}>
      <strong>{decision.alliance === "red" ? "Red" : "Blue"} · {signed(decision.matchPointsDelta)} points · {signed(decision.rankingPointsDelta)} RP</strong>
      {decision.ruleId && <span>{decision.ruleId}</span>}
      {decision.warning && <span>{decision.warning === "verbal" ? "Verbal warning" : `${decision.warning === "yellow" ? "Yellow" : "Red"} card`}</span>}
      <span>{decision.note}</span>
    </li>)}</ol>}
  </details>;
}
