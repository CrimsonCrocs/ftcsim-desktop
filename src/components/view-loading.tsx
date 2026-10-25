import type { CSSProperties } from "react";
import styles from "./view-loading.module.css";

/** Shared, non-blocking loading state for editor, project, and 3D views. */
export function ViewLoading({ label = "Loading view", overlay = false }: { label?: string; overlay?: boolean }) {
  return <div className={`${styles.loading} ${overlay ? styles.overlay : ""}`} role="status" aria-label={label}>
    <span className={styles.spinner} aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => <span key={index} style={{ "--step": index } as CSSProperties} />)}
    </span>
    <span className={styles.reducedLabel} aria-hidden="true">{label}…</span>
  </div>;
}
