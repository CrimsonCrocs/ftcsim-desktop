"use client";

import { Blocks, Braces, Coffee, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  opModePaths,
  validateNewOpModeInput,
  type NewOpModeInput,
  type OpModeKind,
  type OpModeLanguage,
} from "@/lib/blocks/documents";
import styles from "./new-opmode-dialog.module.css";

interface NewOpModeDialogProps {
  open: boolean;
  packageName: string;
  existingPaths: ReadonlySet<string>;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  onCreate: (input: NewOpModeInput) => Promise<void>;
  blocksOnly?: boolean;
  initialKind?: OpModeKind;
}

const LANGUAGE_OPTIONS: Array<{
  value: OpModeLanguage;
  label: string;
  detail: string;
  icon: typeof Coffee;
}> = [
  { value: "java", label: "Java", detail: "FTC SDK source", icon: Coffee },
  { value: "kotlin", label: "Kotlin", detail: "JVM 1.8 source", icon: Braces },
  { value: "blocks", label: "Blocks", detail: "Visual FTC editor", icon: Blocks },
];

export function NewOpModeDialog({
  open,
  packageName,
  existingPaths,
  returnFocus,
  onClose,
  onCreate,
  blocksOnly = false,
  initialKind = "teleop",
}: NewOpModeDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [className, setClassName] = useState(initialKind === "autonomous" ? "MyAutonomous" : "MyTeleOp");
  const [language, setLanguage] = useState<OpModeLanguage>(blocksOnly ? "blocks" : "java");
  const [kind, setKind] = useState<OpModeKind>(initialKind);
  const [group, setGroup] = useState("FTC Simulator");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = returnFocus ?? (
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    );
    window.requestAnimationFrame(() => nameRef.current?.select());
    return () => {
      window.requestAnimationFrame(() => {
        const opener = openerRef.current;
        if (opener?.isConnected) opener.focus();
      });
    };
  }, [open, returnFocus]);

  const input = useMemo<NewOpModeInput>(() => ({
    className: className.trim(),
    packageName,
    language,
    kind,
    group: group.trim(),
  }), [className, group, kind, language, packageName]);

  const validationError = useMemo(() => {
    const invalid = validateNewOpModeInput(input);
    if (invalid) return invalid;
    const paths = opModePaths(packageName, input.className, language);
    if (existingPaths.has(paths.sourcePath)
        || (paths.generatedJavaPath && existingPaths.has(paths.generatedJavaPath))) {
      return `${input.className} already exists in this project.`;
    }
    return null;
  }, [existingPaths, input, language, packageName]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (validationError || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onCreate(input);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "The OpMode could not be created.");
      setSubmitting(false);
    }
  };

  const trapKeys = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Enter"
        && !event.shiftKey
        && !validationError
        && !submitting
        && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      void handleSubmit();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
    ));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={`${styles.backdrop} new-opmode-dialog-root`} onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <div
        ref={panelRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-opmode-title"
        onKeyDown={trapKeys}
      >
        <header className={styles.header}>
          <div>
            <h2 id="new-opmode-title">{blocksOnly ? `New Blocks ${kind === "teleop" ? "TeleOp" : "Autonomous"}` : "New OpMode"}</h2>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} disabled={submitting} aria-label="Close New OpMode" title="Close New OpMode">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          <label className={styles.field}>
            <span>Class name</span>
            <input
              ref={nameRef}
              value={className}
              onChange={(event) => setClassName(event.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          {!blocksOnly && <fieldset className={styles.languageFieldset}>
            <legend>Language</legend>
            <div className={styles.languageGrid}>
              {LANGUAGE_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <label key={option.value} className={`${styles.languageOption}${language === option.value ? ` ${styles.selected}` : ""}`}>
                    <input
                      type="radio"
                      name="opmode-language"
                      value={option.value}
                      checked={language === option.value}
                      onChange={() => setLanguage(option.value)}
                    />
                    <Icon aria-hidden="true" />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.detail}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>}

          {!blocksOnly && <div className={styles.twoColumns}>
            <label className={styles.field}>
              <span>OpMode type</span>
              <select value={kind} onChange={(event) => setKind(event.target.value as OpModeKind)}>
                <option value="teleop">TeleOp</option>
                <option value="autonomous">Autonomous</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Driver Station group</span>
              <input value={group} onChange={(event) => setGroup(event.target.value)} maxLength={80} />
            </label>
          </div>}

          {!blocksOnly && <div className={styles.destination}>
            <span>Package</span>
            <code>{packageName}</code>
          </div>}

          {language === "blocks" && !blocksOnly && (
            <p className={styles.blocksNote}>
              Edit Blocks to update the read-only generated Java.
            </p>
          )}
          {(validationError || submitError) && (
            <p className={styles.error} role="alert">{submitError ?? validationError}</p>
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="button" className={styles.primaryButton} onClick={() => void handleSubmit()} disabled={Boolean(validationError) || submitting}>
            {submitting ? "Creating…" : "Create"}
          </button>
        </footer>
      </div>
    </div>
  );
}
