"use client";

import dynamic from "next/dynamic";
import monacoPackage from "monaco-editor/package.json";
import { Blocks, Coffee, FileText, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { loader, type EditorProps, type Monaco, type OnMount } from "@monaco-editor/react";
import type { JavaDiagnostic } from "@/lib/java-runner-client";
import type { editor as MonacoTypes } from "monaco-editor";
import type { DebuggerController } from "@/lib/debugger";
import { JVM_TOOLCHAIN_CONTRACT_ID } from "@ftc-studio/opmode-protocol";
import {
  createFtcCompletionProvider,
  loadWorkspaceCompletionCatalog,
  modelUriBelongsToProject,
  projectModelUri,
} from "@/lib/completions";
import { generatedBlocksSourcePath } from "@/lib/blocks/documents";
import { ViewLoading } from "@/components/view-loading";
import { languageForPath, registerProjectLanguages } from "@/lib/editor-languages";
import { MobileCodeEditor } from "./mobile-code-editor";

loader.config({
  paths: { vs: `/vendor/monaco/${monacoPackage.version}/vs` },
});

const MonacoEditor = dynamic<EditorProps>(() => import("@monaco-editor/react").then((module) => module.default), {
  ssr: false,
  loading: () => <ViewLoading label="Loading editor" />,
});

interface EditorPaneProps {
  activePath: string;
  projectId: string;
  openPaths: string[];
  fileContents: Record<string, string>;
  diagnostics: JavaDiagnostic[];
  debuggerController?: DebuggerController;
  editorLocation?: { path: string; line: number; nonce: number } | null;
  projectCompletionTypeCount?: number;
  readOnly?: boolean;
  mobile?: boolean;
  blocksOnly?: boolean;
  singleFile?: boolean;
  hideTabs?: boolean;
  autoFocus?: boolean;
  theme?: "light" | "dark";
  onSelectFile: (path: string) => void;
  onCloseFile: (path: string) => void;
  onChange: (path: string, value: string) => void;
  onOpenCommand: () => void;
}

const DIAGNOSTIC_OWNER = "ftc-java-runner";
type RunnerContractStatus = "checking" | "matched" | "configured" | "legacy" | "offline" | "mismatch";

async function verifyRunnerToolchainContract(): Promise<RunnerContractStatus> {
  try {
    const response = await fetch("/api/java-runner/health", { cache: "no-store" });
    if (!response.ok) return "offline";
    const body = await response.json() as Record<string, unknown>;
    const classpathHash = body.sdkCompileClasspathHash;
    const contractMatches = body.toolchainContractId === JVM_TOOLCHAIN_CONTRACT_ID
      && body.sdkVersion === "11.1.0"
      && body.javaTarget === "8"
      && body.kotlinVersion === "2.2.10";
    if (body.runnerMode === "sandbox-v3") {
      return contractMatches
        && body.runnerAvailability === "on-demand"
        && classpathHash === null
        ? "configured"
        : "mismatch";
    }
    if (body.runnerMode === "local-v3") {
      return contractMatches
        && typeof classpathHash === "string"
        && /^[a-f0-9]{64}$/u.test(classpathHash)
        ? "matched"
        : "mismatch";
    }
    if (body.runnerMode === "cloud-run-v2") return "legacy";
    return "mismatch";
  } catch {
    return "offline";
  }
}

function applyCompilerDiagnostics(monaco: Monaco, projectId: string, diagnostics: JavaDiagnostic[]) {
  const byPath = new Map<string, JavaDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.file) continue;
    const normalizedPath = diagnostic.file.replace(/^file:\/\/\//, "").replace(/^\/+/, "");
    byPath.set(normalizedPath, [...(byPath.get(normalizedPath) ?? []), diagnostic]);
  }

  for (const model of monaco.editor.getModels()) {
    if (!modelUriBelongsToProject(model.uri, projectId)) continue;
    const modelPath = decodeURIComponent(model.uri.path).replace(/^\/+/, "");
    const markers = (byPath.get(modelPath) ?? []).map((diagnostic) => {
      const line = Math.min(Math.max(diagnostic.line ?? 1, 1), model.getLineCount());
      const maxColumn = model.getLineMaxColumn(line);
      const column = Math.min(Math.max(diagnostic.column ?? 1, 1), maxColumn);
      const severity = {
        error: monaco.MarkerSeverity.Error,
        warning: monaco.MarkerSeverity.Warning,
        note: monaco.MarkerSeverity.Info,
      }[diagnostic.kind];
      return {
        severity,
        message: diagnostic.message,
        source: "javac",
        code: diagnostic.code,
        startLineNumber: line,
        startColumn: column,
        endLineNumber: line,
        endColumn: Math.min(column + 1, maxColumn),
      };
    });
    monaco.editor.setModelMarkers(model, DIAGNOSTIC_OWNER, markers);
  }
}

export function EditorPane({
  activePath,
  projectId,
  openPaths,
  fileContents,
  diagnostics,
  debuggerController,
  editorLocation,
  readOnly = false,
  mobile = false,
  blocksOnly = false,
  singleFile = false,
  hideTabs = false,
  autoFocus = true,
  theme = "dark",
  onSelectFile,
  onCloseFile,
  onChange,
  onOpenCommand,
}: EditorPaneProps) {
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoTypes.IStandaloneCodeEditor | null>(null);
  const debuggerRef = useRef(debuggerController);
  const activePathRef = useRef(activePath);
  const pointDecorations = useRef<Array<{ id: string; decoration: string }>>([]);
  const decorations = useRef<string[]>([]);
  const [editorMount, setEditorMount] = useState(0);
  const [debugRevision, setDebugRevision] = useState(0);
  useEffect(() => { debuggerRef.current = debuggerController; activePathRef.current = activePath; }, [debuggerController, activePath]);
  useEffect(() => {
    if (!debuggerController) return;
    let previous = debuggerController.getSnapshot();
    return debuggerController.subscribe(() => {
      const current = debuggerController.getSnapshot();
      if (current.breakpoints !== previous.breakpoints || current.state !== previous.state || current.selectedFrame !== previous.selectedFrame) setDebugRevision((revision) => revision + 1);
      previous = current;
    });
  }, [debuggerController]);
  useEffect(() => {
    const editor = editorRef.current, monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !monaco) return;
    const snapshot = debuggerController?.getSnapshot();
    const points = snapshot?.breakpoints.filter((point) => point.path === activePath && point.line <= model.getLineCount()) ?? [];
    const pausedFrame = snapshot?.state.status === "paused" ? snapshot.state.frames.find((frame) => frame.id === snapshot.selectedFrame) : undefined;
    const next: MonacoTypes.IModelDeltaDecoration[] = points.map((point) => ({ range: new monaco.Range(Math.min(point.line, model.getLineCount()), 1, Math.min(point.line, model.getLineCount()), 1),
      options: { glyphMarginClassName: point.enabled ? "debug-breakpoint" : "debug-breakpoint debug-breakpoint--disabled",
        glyphMarginHoverMessage: { value: `Breakpoint · line ${point.line}${point.enabled ? "" : " (disabled)"}` },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } }));
    if (pausedFrame?.path === activePath) next.push({ range: new monaco.Range(Math.min(pausedFrame.line, model.getLineCount()), 1, Math.min(pausedFrame.line, model.getLineCount()), 1), options: { isWholeLine: true, className: "debug-paused-line", glyphMarginClassName: "debug-paused-glyph" } });
    decorations.current = editor.deltaDecorations(decorations.current, next);
    pointDecorations.current = points.map((point, index) => ({ id: point.id, decoration: decorations.current[index] }));
  }, [activePath, debuggerController, debugRevision, editorMount]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !editorLocation || editorLocation.path !== activePath) return;
    const line = Math.min(Math.max(1, editorLocation.line), editor.getModel()?.getLineCount() ?? 1);
    editor.revealLineInCenterIfOutsideViewport(line);
    editor.setPosition({ lineNumber: line, column: 1 });
  }, [activePath, editorLocation, editorMount]);
  const fileContentsRef = useRef(fileContents);
  const completionGenerationRef = useRef(0);
  const installedCompletionProjectRef = useRef<string | null>(null);
  const completionDisposablesRef = useRef<Array<{ dispose(): void }>>([]);
  const [completionStatus, setCompletionStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [runnerContractStatus, setRunnerContractStatus] = useState<RunnerContractStatus>("checking");
  const generatedSourcePath = generatedBlocksSourcePath(fileContents[activePath] ?? "");
  const activeReadOnly = readOnly || generatedSourcePath !== null;
  const completionError = completionStatus === "failed"
    ? "Autocomplete unavailable."
    : runnerContractStatus === "mismatch"
      ? "Runner version mismatch."
      : runnerContractStatus === "legacy"
        ? "Runner update required."
        : runnerContractStatus === "offline"
          ? "Runner unavailable."
          : null;

  useEffect(() => {
    fileContentsRef.current = fileContents;
  }, [fileContents]);

  useEffect(() => {
    if (monacoRef.current) applyCompilerDiagnostics(monacoRef.current, projectId, diagnostics);
  }, [activePath, diagnostics, projectId]);

  const installCompletionProviders = useCallback((monaco: Monaco) => {
    installedCompletionProjectRef.current = projectId;
    const generation = ++completionGenerationRef.current;
    completionDisposablesRef.current.forEach((disposable) => disposable.dispose());
    completionDisposablesRef.current = [];
    setCompletionStatus("loading");
    setRunnerContractStatus("checking");
    void loadWorkspaceCompletionCatalog().then((catalog) => {
      if (completionGenerationRef.current !== generation) return;
      completionDisposablesRef.current = [
        monaco.languages.registerCompletionItemProvider(
          "java",
          createFtcCompletionProvider(
            monaco,
            "java",
            catalog,
            () => fileContentsRef.current,
            { projectId },
          ),
        ),
        monaco.languages.registerCompletionItemProvider(
          "kotlin",
          createFtcCompletionProvider(
            monaco,
            "kotlin",
            catalog,
            () => fileContentsRef.current,
            { projectId },
          ),
        ),
      ];
      setCompletionStatus("ready");
      void verifyRunnerToolchainContract().then((status) => {
        if (completionGenerationRef.current === generation) setRunnerContractStatus(status);
      });
    }).catch(() => {
      if (completionGenerationRef.current === generation) {
        setCompletionStatus("failed");
        setRunnerContractStatus("offline");
      }
    });
  }, [projectId]);

  useEffect(() => {
    if (monacoRef.current && installedCompletionProjectRef.current !== projectId) {
      installCompletionProviders(monacoRef.current);
    }
  }, [installCompletionProviders, projectId]);

  useEffect(() => () => {
    completionGenerationRef.current++;
    installedCompletionProjectRef.current = null;
    completionDisposablesRef.current.forEach((disposable) => disposable.dispose());
    completionDisposablesRef.current = [];
  }, []);

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;
    setEditorMount((mount) => mount + 1);
    editor.addAction({ id: "ftc-toggle-breakpoint", label: "Toggle Breakpoint", keybindings: [monaco.KeyCode.F9], run: () => {
      const line = editor.getPosition()?.lineNumber;
      if (line) debuggerRef.current?.toggleBreakpoint(activePathRef.current, line);
    } });
    const click = editor.onMouseDown((event) => {
      if (event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && event.target.position && event.event.leftButton) {
        debuggerRef.current?.toggleBreakpoint(activePathRef.current, event.target.position.lineNumber);
      }
    });
    const content = editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      if (!model) return;
      debuggerRef.current?.moveBreakpoints(activePathRef.current, pointDecorations.current.flatMap(({ id, decoration }) => {
        const range = model.getDecorationRange(decoration); return range ? [{ id, line: range.startLineNumber }] : [];
      }));
    });
    const modelChange = editor.onDidChangeModel((event) => {
      if (event.oldModelUrl) monaco.editor.getModel(event.oldModelUrl)?.deltaDecorations(decorations.current, []);
      decorations.current = []; pointDecorations.current = [];
    });
    editor.onDidDispose(() => { click.dispose(); content.dispose(); modelChange.dispose(); editorRef.current = null; decorations.current = []; pointDecorations.current = []; });
    monaco.editor.defineTheme("ftc-studio-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6A9B7B", fontStyle: "italic" },
        { token: "keyword", foreground: "D89065" },
        { token: "number", foreground: "2BC3D3" },
        { token: "string", foreground: "B8C88B" },
        { token: "annotation", foreground: "D6C37A" },
        { token: "key", foreground: "88B8E8" },
      ],
      colors: {
        "editor.background": "#1d1f22",
        "editor.foreground": "#c7c9cd",
        "editorLineNumber.foreground": "#5e636c",
        "editorLineNumber.activeForeground": "#9da2aa",
        "editor.lineHighlightBackground": "#24272c",
        "editor.selectionBackground": "#2d4f78aa",
        "editorCursor.foreground": "#d7d9dd",
        "editorIndentGuide.background1": "#30343a",
        "editorIndentGuide.activeBackground1": "#454b54",
      },
    });
    monaco.editor.setTheme(theme === "light" ? "vs" : "ftc-studio-dark");
    applyCompilerDiagnostics(monaco, projectId, diagnostics);
    installCompletionProviders(monaco);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, onOpenCommand);
    // Monaco loads asynchronously. Keep any control the user focused while
    // waiting, rather than redirecting their next keystroke into the editor.
    const editorNode = editor.getDomNode();
    const activeElement = editorNode?.ownerDocument.activeElement;
    if (autoFocus && (
      !activeElement
      || activeElement === editorNode?.ownerDocument.body
      || editorNode?.contains(activeElement)
    )) {
      editor.focus();
    }
  };

  return (
    <section className={`editor-pane${blocksOnly ? " editor-pane--blocks" : ""}`} aria-label="Code editor"
      style={hideTabs ? { gridTemplateRows: !blocksOnly && (completionError || generatedSourcePath) ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)" } : undefined}>
      {!blocksOnly && !hideTabs && <div className="editor-tabs" role="tablist" aria-label="Open files">
        {openPaths.map((path) => {
          const fileName = path.split("/").at(-1) ?? path;
          const isActive = path === activePath;
          return (
            <div className={`editor-tab${isActive ? " is-active" : ""}`} key={path}>
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="editor-tab__select"
                onClick={() => onSelectFile(path)}
              >
                {path.endsWith(".blk")
                  ? <Blocks aria-hidden="true" />
                  : path.endsWith(".java")
                    ? <Coffee aria-hidden="true" />
                    : <FileText aria-hidden="true" />}
                <span>{fileName}</span>
              </button>
              {!singleFile && <button
                type="button"
                className="editor-tab__close"
                onClick={() => onCloseFile(path)}
                aria-label={`Close ${fileName}`}
                title={`Close ${fileName}`}
              >
                <X aria-hidden="true" />
              </button>}
            </div>
          );
        })}
      </div>}
      {!blocksOnly && (completionError || generatedSourcePath) && (
        <div className="compatibility-banner" role="status" aria-live="polite">
          {completionError && (
            <>
              <span className="compatibility-banner__detail">{completionError}</span>
              <button
                type="button"
                aria-label={completionStatus === "failed" ? "Retry autocomplete" : "Recheck runner"}
                onClick={() => monacoRef.current && installCompletionProviders(monacoRef.current)}
              >
                Retry
              </button>
            </>
          )}
          {generatedSourcePath && (
            <>
              <span>Generated from Blocks</span>
              <button
                type="button"
                aria-label="Open editable Blocks source"
                onClick={() => onSelectFile(generatedSourcePath)}
              >
                Edit Blocks
              </button>
            </>
          )}
        </div>
      )}
      <div className="monaco-frame">
        {blocksOnly && generatedSourcePath && (
          <button
            type="button"
            className="generated-java-return"
            onClick={() => onSelectFile(generatedSourcePath)}
          >
            Edit Blocks
          </button>
        )}
        {activePath ? mobile ? (
          <MobileCodeEditor
            activePath={activePath}
            value={fileContents[activePath] ?? ""}
            readOnly={activeReadOnly}
            hideToolbar={hideTabs}
            theme={theme}
            revealLine={editorLocation?.path === activePath ? editorLocation : null}
            onChange={onChange}
          />
        ) : (
          <MonacoEditor
            theme={theme === "light" ? "vs" : "ftc-studio-dark"}
            loading={<ViewLoading label="Loading editor" />}
            height="100%"
            keepCurrentModel={blocksOnly}
            path={projectModelUri(projectId, activePath)}
            value={fileContents[activePath] ?? ""}
            language={languageForPath(activePath)}
            beforeMount={registerProjectLanguages}
            onMount={handleMount}
            onChange={(value) => {
              // Monaco changes its model before notifying React. Commit that
              // value before the next edit so the controlled wrapper cannot
              // replay an older value and move the caret to the document end.
              if (!activeReadOnly) flushSync(() => onChange(activePath, value ?? ""));
            }}
            options={{
              automaticLayout: true,
              glyphMargin: Boolean(debuggerController),
              minimap: { enabled: false },
              fontFamily: "var(--font-code)",
              fontSize: 14,
              lineHeight: 22,
              fontLigatures: true,
              smoothScrolling: true,
              cursorBlinking: "smooth",
              renderWhitespace: "selection",
              padding: { top: 12, bottom: 24 },
              scrollBeyondLastLine: false,
              tabSize: 4,
              wordWrap: "off",
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true, indentation: true },
              quickSuggestions: { other: true, comments: false, strings: false },
              suggestOnTriggerCharacters: true,
              snippetSuggestions: "inline",
              readOnly: activeReadOnly,
              readOnlyMessage: {
                value: generatedSourcePath
                  ? "Generated Java is read-only. Open the paired Blocks OpMode to make changes."
                  : "This project is open read-only in this tab.",
              },
            }}
          />
        ) : (
          <div className="editor-empty">
            <p>No file selected</p>
            <span>Choose a file in the Project tool window.</span>
          </div>
        )}
      </div>
    </section>
  );
}
