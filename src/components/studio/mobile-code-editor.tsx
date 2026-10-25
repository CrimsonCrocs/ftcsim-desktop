"use client";

import { flushSync } from "react-dom";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { mobileSyntax } from "@/lib/mobile-syntax";
import styles from "./mobile-code-editor.module.css";

interface MobileCodeEditorProps {
  activePath: string;
  value: string;
  readOnly: boolean;
  hideToolbar?: boolean;
  theme?: "light" | "dark";
  revealLine?: { line: number; nonce: number } | null;
  onChange: (path: string, value: string) => void;
}

interface EditorPosition {
  selectionStart: number;
  selectionEnd: number;
  selectionDirection: "forward" | "backward" | "none";
  scrollTop: number;
  scrollLeft: number;
}

const INDENT = "    ";

export function MobileCodeEditor({ activePath, value, readOnly, hideToolbar = false, theme = "dark", revealLine, onChange }: MobileCodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const highlightCodeRef = useRef<HTMLElement>(null);
  const tokens = useMemo(() => mobileSyntax(value, activePath), [value, activePath]);
  const positionsRef = useRef(new Map<string, EditorPosition>());
  const activePathRef = useRef(activePath);
  const previousPathRef = useRef(activePath);
  const syncHighlight = useCallback(() => {
    const input = textareaRef.current;
    const layer = highlightRef.current;
    const code = highlightCodeRef.current;
    if (!input || !layer || !code) return;
    layer.style.width = input.clientWidth + "px";
    layer.style.height = input.clientHeight + "px";
    code.style.transform = "translate(" + -input.scrollLeft + "px," + -input.scrollTop + "px)";
  }, []);

  const savePosition = (path: string) => {
    const textarea = textareaRef.current;
    syncHighlight();
    // Ignore delayed select/scroll events delivered by the previous file's
    // render after the active path has already changed.
    if (!textarea || path !== activePathRef.current) return;
    positionsRef.current.set(path, {
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      selectionDirection: textarea.selectionDirection,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
    });
  };

  useLayoutEffect(() => {
    const changedFile = previousPathRef.current !== activePath;
    previousPathRef.current = activePath;
    activePathRef.current = activePath;
    if (!changedFile) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const position = positionsRef.current.get(activePath);
    if (!position) return;
    const start = Math.min(position.selectionStart, value.length);
    const end = Math.min(position.selectionEnd, value.length);
    textarea.setSelectionRange(start, end, position.selectionDirection);
    textarea.scrollTop = position.scrollTop;
    textarea.scrollLeft = position.scrollLeft;
  }, [activePath, value]);

  useLayoutEffect(syncHighlight, [activePath, value, syncHighlight]);
  useLayoutEffect(() => {
    const input = textareaRef.current;
    if (!input || !revealLine) return;
    const lines = input.value.split("\n"), line = Math.min(Math.max(1, revealLine.line), lines.length);
    const start = lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0);
    input.setSelectionRange(start, start + lines[line - 1].length);
    input.scrollTop = Math.max(0, (line - 1) * (parseFloat(getComputedStyle(input).lineHeight) || 22) - input.clientHeight / 2);
    syncHighlight();
  }, [activePath, revealLine, syncHighlight]);
  useLayoutEffect(() => {
    if (!textareaRef.current) return;
    const observer = new ResizeObserver(syncHighlight);
    observer.observe(textareaRef.current);
    return () => observer.disconnect();
  }, [syncHighlight]);

  const commit = (nextValue: string) => {
    flushSync(() => onChange(activePath, nextValue));
    savePosition(activePath);
  };

  const insertIndent = () => {
    if (readOnly) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const position = positionsRef.current.get(activePath);
    const selectionStart = Math.min(position?.selectionStart ?? textarea.selectionStart, value.length);
    const selectionEnd = Math.min(position?.selectionEnd ?? textarea.selectionEnd, value.length);
    const nextValue = `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`;
    flushSync(() => onChange(activePath, nextValue));
    const caret = selectionStart + INDENT.length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    savePosition(activePath);
  };

  return (
    <div className={styles.frame} data-theme={theme} style={hideToolbar ? { gridTemplateRows: "minmax(0, 1fr)" } : undefined}>
      {!hideToolbar && <div className={styles.toolbar}>
        <button
          className={styles.indentButton}
          type="button"
          disabled={readOnly}
          onClick={insertIndent}
        >
          Indent (4 spaces)
        </button>
      </div>}
      <div className={styles.codeArea}>
      <pre ref={highlightRef} className={styles.highlight} aria-hidden="true"><code ref={highlightCodeRef}>
        {tokens.map((token, index) => <span key={index} data-syntax={token.kind}>{token.text}</span>)}
        {value.length === 0 || value.endsWith("\n") ? " " : null}
      </code></pre>
      <textarea
        ref={textareaRef}
        className={styles.editor}
        aria-label={`Source code: ${activePath.split("/").at(-1) ?? activePath}`}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        wrap="off"
        onChange={(event) => commit(event.currentTarget.value)}
        onSelect={() => savePosition(activePath)}
        onScroll={() => savePosition(activePath)}
        onBlur={() => savePosition(activePath)}
      />
      </div>
    </div>
  );
}
