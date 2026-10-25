"use client";

import { ViewLoading } from "@/components/view-loading";

import { Blocks } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BLOCKS_GENERATOR_VERSION,
  blocksDocumentIdentity,
  hashBlocksSource,
  markGeneratedBlocksJava,
} from "@/lib/blocks/documents";
import {
  BlocksRegenerationGate,
  type BlocksRegenerationToken,
} from "@/lib/blocks/editor-lifecycle";
import {
  BLOCKS_BRIDGE_VERSION,
  isBlocksFrameMessage,
  type BlocksEditorFlushMessage,
  type BlocksEditorInitMessage,
  type BlocksFrameKeyboardMessage,
  type BlocksFrameSnapshotMessage,
  type BlocksHardwareMotor,
} from "@/lib/blocks/protocol";
import styles from "./blocks-editor-pane.module.css";

interface BlocksEditorPaneProps {
  activePath: string;
  sourceXml: string;
  configurationHash: string;
  motors: BlocksHardwareMotor[];
  readOnly: boolean;
  singleFile?: boolean;
  theme?: "light" | "dark";
  onReadyChange?: (ready: boolean) => void;
  onSelectFile: (path: string) => void;
  onApplySnapshot: (sourcePath: string, sourceXml: string, javaPath: string, generatedJava?: string) => boolean;
  onKeyboardInput: (message: Pick<BlocksFrameKeyboardMessage, "phase" | "code">) => void;
  onRegisterFlush: (flush: ((requireGeneratedJava?: boolean) => Promise<void>) | null) => void;
  openXmlRequest: { id: number; path: string } | null;
  onOpenXmlRequestHandled: (id: number) => void;
}

type EditorStatus = "loading" | "ready" | "saving" | "reloading" | "failed";
type EditorMode = "visual" | "xml";
const BLOCKS_STARTUP_TIMEOUT_MILLIS = 30_000;

interface PendingFlush {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: number;
  requireGeneratedJava: boolean;
}

function validateBlocksXml(source: string): string | null {
  const workspaceEnd = source.indexOf("</xml>");
  const metadataStart = source.indexOf("<Extra");
  if (workspaceEnd < 0 || metadataStart < 0 || metadataStart <= workspaceEnd) {
    return "Blocks source must contain both a Blockly <xml> workspace and FTC <Extra> metadata.";
  }
  const parser = new DOMParser();
  const workspace = parser.parseFromString(source.slice(0, workspaceEnd + 6), "application/xml");
  const metadata = parser.parseFromString(source.slice(metadataStart), "application/xml");
  if (workspace.querySelector("parsererror") || workspace.documentElement.localName !== "xml") {
    return "The Blockly workspace XML is not well formed.";
  }
  if (metadata.querySelector("parsererror") || metadata.documentElement.localName !== "Extra") {
    return "The FTC Blocks metadata XML is not well formed.";
  }
  return null;
}

export function BlocksEditorPane({
  activePath,
  sourceXml,
  configurationHash,
  motors,
  readOnly,
  singleFile = false,
  theme = "dark",
  onReadyChange,
  onSelectFile,
  onApplySnapshot,
  onKeyboardInput,
  onRegisterFlush,
  openXmlRequest,
  onOpenXmlRequestHandled,
}: BlocksEditorPaneProps) {
  const identity = useMemo(() => blocksDocumentIdentity(activePath), [activePath]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const xmlTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handledXmlRequestRef = useRef(0);
  const sourceXmlRef = useRef(sourceXml);
  const readyRef = useRef(false);
  const startupTimeoutRef = useRef<number | null>(null);
  const flushInFlightRef = useRef<Promise<void> | null>(null);
  const lastRevisionRef = useRef(-1);
  const frameConfigurationHashRef = useRef<string | null>(null);
  const loadedHardwareSignatureRef = useRef<string | null>(null);
  const regenerateAfterReadyRef = useRef(false);
  const pendingFlushesRef = useRef(new Map<string, PendingFlush>());
  const [regenerationGate] = useState(() => new BlocksRegenerationGate());
  const [nonce] = useState(() => crypto.randomUUID());
  const [frameGeneration, setFrameGeneration] = useState(0);
  const [readyEpoch, setReadyEpoch] = useState(0);
  const [status, setStatus] = useState<EditorStatus>(identity ? "loading" : "failed");
  const [statusDetail, setStatusDetail] = useState(
    identity
      ? "Loading the FTC Blocks toolbox…"
      : "This .blk file is outside a valid TeamCode package path.",
  );
  const [mode, setMode] = useState<EditorMode>("visual");
  const [xmlDraft, setXmlDraft] = useState(sourceXml);
  const [xmlDirty, setXmlDirty] = useState(false);
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [regenerationError, setRegenerationError] = useState<string | null>(null);
  useEffect(() => {
    onReadyChange?.(status === "ready");
  }, [onReadyChange, status]);
  useEffect(() => {
    if (mode === "xml") xmlTextareaRef.current?.focus();
  }, [mode]);
  const hardwareSignature = useMemo(() => JSON.stringify({
    configurationHash,
    motors: [...motors].sort((left, right) => (
      left.id.localeCompare(right.id) || left.name.localeCompare(right.name)
    )),
  }), [configurationHash, motors]);
  const className = identity?.className ?? "BlocksOpMode";
  const packageName = identity?.packageName ?? "";
  const generatedJavaPath = identity?.generatedJavaPath ?? "";

  const rejectPendingFlushes = useCallback((message: string) => {
    for (const pending of pendingFlushesRef.current.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    pendingFlushesRef.current.clear();
    flushInFlightRef.current = null;
  }, []);

  const clearStartupTimeout = useCallback(() => {
    if (startupTimeoutRef.current === null) return;
    window.clearTimeout(startupTimeoutRef.current);
    startupTimeoutRef.current = null;
  }, []);

  const beginRegeneration = useCallback(() => {
    const existing = regenerationGate.current();
    const token = regenerationGate.begin();
    if (existing?.id === token.id) return token;
    setRegenerationError(null);
    void token.promise.catch(() => {
      const failure = regenerationGate.failureFor(token);
      if (!failure) return;
      setRegenerationError(failure.message);
      setStatus("failed");
      setStatusDetail(failure.message);
    });
    return token;
  }, [regenerationGate]);

  const finishRegeneration = useCallback((
    pending: BlocksRegenerationToken | null,
    error?: Error,
  ) => {
    if (error) {
      if (!regenerationGate.reject(pending, error)) return;
      setRegenerationError(error.message);
      setStatus("failed");
      setStatusDetail(error.message);
      return;
    }
    if (!regenerationGate.resolve(pending)) return;
    setRegenerationError(null);
  }, [regenerationGate]);

  const reloadFrame = useCallback((detail: string, regenerate: boolean) => {
    if (regenerate) beginRegeneration();
    rejectPendingFlushes("The Blocks editor reloaded before saving finished.");
    clearStartupTimeout();
    readyRef.current = false;
    frameConfigurationHashRef.current = null;
    loadedHardwareSignatureRef.current = null;
    regenerateAfterReadyRef.current = regenerate;
    lastRevisionRef.current = -1;
    setStatus("reloading");
    setStatusDetail(detail);
    setFrameGeneration((generation) => generation + 1);
  }, [beginRegeneration, clearStartupTimeout, rejectPendingFlushes]);

  useEffect(() => {
    if (sourceXml === sourceXmlRef.current) return;
    sourceXmlRef.current = sourceXml;
    const frame = window.requestAnimationFrame(() => {
      if (!xmlDirty) setXmlDraft(sourceXml);
      reloadFrame("Reloading Blocks from the updated project worktree…", false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reloadFrame, sourceXml, xmlDirty]);

  const applySource = useCallback(async (
    message: Pick<BlocksFrameSnapshotMessage, "revision" | "sourceXml" | "sourceHash">,
    generatedJava?: string,
  ) => {
    const verifiedHash = await hashBlocksSource(message.sourceXml);
    if (verifiedHash !== message.sourceHash) {
      throw new Error("The Blocks editor returned source with an invalid integrity hash.");
    }
    if (message.revision <= lastRevisionRef.current) return false;
    if (!onApplySnapshot(activePath, message.sourceXml, generatedJavaPath, generatedJava)) {
      throw new Error("The project changed before the Blocks snapshot could be accepted. Retry the action.");
    }
    lastRevisionRef.current = message.revision;
    sourceXmlRef.current = message.sourceXml;
    if (!xmlDirty) setXmlDraft(message.sourceXml);
    return true;
  }, [activePath, generatedJavaPath, onApplySnapshot, xmlDirty]);

  const applySnapshot = useCallback(async (message: BlocksFrameSnapshotMessage) => {
    const generatedJava = await markGeneratedBlocksJava(
      message.generatedJava,
      activePath,
      message.sourceHash,
      packageName,
      message.configurationHash,
    );
    const applied = await applySource(message, generatedJava);
    if (!applied) return;
    setStatus("ready");
    setStatusDetail(`FTC Blocks · ${BLOCKS_GENERATOR_VERSION}`);
  }, [activePath, applySource, packageName]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const frameConfigurationHash = frameConfigurationHashRef.current;
      if (
        !frameConfigurationHash
        || event.source !== iframeRef.current?.contentWindow
        || !isBlocksFrameMessage(event.data, {
          nonce,
          documentId: activePath,
          configurationHash: frameConfigurationHash,
        })
      ) {
        return;
      }
      const message = event.data;
      if (message.type === "ftcsim.blocks.keyboard") {
        onKeyboardInput(message);
        return;
      }
      if (message.type === "ftcsim.blocks.ready") {
        clearStartupTimeout();
        readyRef.current = true;
        setReadyEpoch((epoch) => epoch + 1);
        setStatus("ready");
        setStatusDetail(`FTC Blocks · ${BLOCKS_GENERATOR_VERSION}`);
        return;
      }
      if (message.type === "ftcsim.blocks.snapshot") {
        void applySnapshot(message).then(() => {
          if (!message.requestId) return;
          const pending = pendingFlushesRef.current.get(message.requestId);
          if (!pending) return;
          window.clearTimeout(pending.timeout);
          pendingFlushesRef.current.delete(message.requestId);
          pending.resolve();
        }).catch((error) => {
          const pending = message.requestId
            ? pendingFlushesRef.current.get(message.requestId)
            : undefined;
          if (pending) {
            window.clearTimeout(pending.timeout);
            pendingFlushesRef.current.delete(message.requestId as string);
            pending.reject(error instanceof Error ? error : new Error("Blocks source validation failed."));
          }
          setStatus("failed");
          setStatusDetail(error instanceof Error ? error.message : "Blocks source validation failed.");
        });
        return;
      }
      clearStartupTimeout();
      void (async () => {
        let sourcePersisted = false;
        if (
          message.sourceXml !== undefined
          && message.sourceHash !== undefined
          && message.revision !== undefined
        ) {
          await applySource({
            revision: message.revision,
            sourceXml: message.sourceXml,
            sourceHash: message.sourceHash,
          });
          sourcePersisted = true;
        }
        const pending = message.requestId
          ? pendingFlushesRef.current.get(message.requestId)
          : undefined;
        if (pending) {
          window.clearTimeout(pending.timeout);
          pendingFlushesRef.current.delete(message.requestId as string);
          if (
            message.code === "BLOCKS_GENERATION_FAILED"
            && sourcePersisted
            && !pending.requireGeneratedJava
          ) pending.resolve();
          else pending.reject(new Error(message.message));
        }
        const recoverable = message.code === "FTC_BLOCKS_NOTICE"
          || message.code === "BLOCKS_GENERATION_FAILED"
          || message.code === "BLOCKS_SOURCE_INVALID";
        setStatus(recoverable ? "ready" : "failed");
        setStatusDetail(message.message);
        if (!recoverable && !readyRef.current) {
          finishRegeneration(regenerationGate.current(), new Error(message.message));
        }
      })().catch((error) => {
        const pending = message.requestId
          ? pendingFlushesRef.current.get(message.requestId)
          : undefined;
        if (pending) {
          window.clearTimeout(pending.timeout);
          pendingFlushesRef.current.delete(message.requestId as string);
          pending.reject(error instanceof Error ? error : new Error("Blocks source validation failed."));
        }
        const failure = error instanceof Error ? error : new Error("Blocks source validation failed.");
        setStatus("failed");
        setStatusDetail(failure.message);
        if (!readyRef.current) finishRegeneration(regenerationGate.current(), failure);
      });
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [
    activePath,
    applySnapshot,
    applySource,
    clearStartupTimeout,
    finishRegeneration,
    nonce,
    onKeyboardInput,
    regenerationGate,
  ]);

  useEffect(() => () => {
    onKeyboardInput({ phase: "reset" });
    clearStartupTimeout();
    rejectPendingFlushes("The Blocks editor closed before saving finished.");
    regenerationGate.cancel(new Error("The Blocks editor closed before Java regeneration finished."));
  }, [clearStartupTimeout, onKeyboardInput, regenerationGate, rejectPendingFlushes]);

  const postInit = useCallback(() => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame || !identity) return;
    const validationError = validateBlocksXml(sourceXmlRef.current);
    if (validationError) {
      clearStartupTimeout();
      readyRef.current = false;
      setStatus("failed");
      setStatusDetail(validationError);
      return;
    }
    readyRef.current = false;
    frameConfigurationHashRef.current = configurationHash;
    loadedHardwareSignatureRef.current = hardwareSignature;
    setStatus((current) => current === "reloading" ? current : "loading");
    clearStartupTimeout();
    startupTimeoutRef.current = window.setTimeout(() => {
      if (readyRef.current) return;
      startupTimeoutRef.current = null;
      const message = "The FTC Blocks toolbox did not start. Check the connection, then retry.";
      setStatus("failed");
      setStatusDetail(message);
      finishRegeneration(regenerationGate.current(), new Error(message));
    }, BLOCKS_STARTUP_TIMEOUT_MILLIS);
    const message: BlocksEditorInitMessage = {
      type: "ftcsim.blocks.init",
      version: BLOCKS_BRIDGE_VERSION,
      nonce,
      documentId: activePath,
      className,
      packageName,
      sourcePath: activePath,
      sourceXml: sourceXmlRef.current,
      readOnly,
      hardware: { configurationHash, motors },
    };
    frame.postMessage(message, "*");
  }, [
    activePath,
    className,
    clearStartupTimeout,
    configurationHash,
    finishRegeneration,
    hardwareSignature,
    identity,
    motors,
    nonce,
    packageName,
    readOnly,
    regenerationGate,
  ]);

  const flushVisual = useCallback(async (requireGeneratedJava = false) => {
    if (flushInFlightRef.current) return flushInFlightRef.current;
    const frame = iframeRef.current?.contentWindow;
    if (!frame) throw new Error("The Blocks editor is not available.");
    if (!readyRef.current) throw new Error("The Blocks editor is still loading.");
    setStatus("saving");
    setStatusDetail("Generating Java and saving both files…");
    const requestId = `blocks-${Date.now().toString(36)}-${crypto.randomUUID()}`;
    const message: BlocksEditorFlushMessage = {
      type: "ftcsim.blocks.flush",
      version: BLOCKS_BRIDGE_VERSION,
      nonce,
      documentId: activePath,
      requestId,
    };
    const operation = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pendingFlushesRef.current.delete(requestId);
        reject(new Error("The Blocks editor did not finish generating Java in time."));
      }, 5_000);
      pendingFlushesRef.current.set(requestId, {
        resolve,
        reject,
        timeout,
        requireGeneratedJava,
      });
      frame.postMessage(message, "*");
    });
    const tracked = operation.finally(() => {
      if (flushInFlightRef.current === tracked) flushInFlightRef.current = null;
    });
    flushInFlightRef.current = tracked;
    return tracked;
  }, [activePath, nonce]);

  const flushForHost = useCallback(async (requireGeneratedJava = false) => {
    if (xmlDirty) {
      throw new Error("Apply or discard the XML source changes before continuing.");
    }
    await regenerationGate.wait();
    if (mode === "xml") {
      return;
    }
    // A loading frame cannot have unsaved user edits. The current XML already
    // lives in the project, so switching OpModes is safe before Blockly starts.
    if (!readyRef.current) {
      if (requireGeneratedJava) throw new Error("The Blocks editor is still loading.");
      return;
    }
    return flushVisual(requireGeneratedJava);
  }, [flushVisual, mode, regenerationGate, xmlDirty]);

  useEffect(() => {
    onRegisterFlush(flushForHost);
    return () => onRegisterFlush(null);
  }, [flushForHost, onRegisterFlush]);

  useEffect(() => {
    if (readyEpoch === 0 || !regenerateAfterReadyRef.current) return;
    regenerateAfterReadyRef.current = false;
    const pending = regenerationGate.current();
    void flushVisual(true).then(() => {
      finishRegeneration(pending);
    }).catch((error) => {
      const failure = error instanceof Error
        ? error
        : new Error("Generated Java could not be refreshed for this robot configuration.");
      finishRegeneration(pending, failure);
      setStatus("failed");
      setStatusDetail(failure.message);
    });
  }, [finishRegeneration, flushVisual, readyEpoch, regenerationGate]);

  useEffect(() => {
    const loadedSignature = loadedHardwareSignatureRef.current;
    if (!loadedSignature || loadedSignature === hardwareSignature) return;
    const pending = beginRegeneration();
    let cancelled = false;
    const reload = async () => {
      if (readyRef.current) {
        try {
          await flushVisual();
        } catch (error) {
          if (!cancelled) {
            const failure = error instanceof Error
              ? new Error(`Configuration reload paused: ${error.message}`)
              : new Error("Configuration reload paused until Blocks can be saved.");
            finishRegeneration(pending, failure);
          }
          return;
        }
      }
      if (!cancelled) {
        reloadFrame("Reloading the toolbox for the updated robot configuration…", true);
      }
    };
    void reload();
    return () => { cancelled = true; };
  }, [
    beginRegeneration,
    finishRegeneration,
    flushVisual,
    hardwareSignature,
    readyEpoch,
    reloadFrame,
  ]);

  const switchToXml = useCallback(async () => {
    if (mode === "xml") { xmlTextareaRef.current?.focus(); return; }
    try {
      if (readyRef.current) await flushVisual();
      setXmlDraft(sourceXmlRef.current);
      setXmlDirty(false);
      setXmlError(null);
      setMode("xml");
    } catch (error) {
      setStatus("failed");
      setStatusDetail(error instanceof Error ? error.message : "Blocks could not be prepared for XML editing.");
    }
  }, [flushVisual, mode]);

  useEffect(() => {
    if (!openXmlRequest || openXmlRequest.path !== activePath
        || handledXmlRequestRef.current === openXmlRequest.id) return;
    handledXmlRequestRef.current = openXmlRequest.id;
    onOpenXmlRequestHandled(openXmlRequest.id);
    void switchToXml();
  }, [activePath, onOpenXmlRequestHandled, openXmlRequest, switchToXml]);

  const switchToVisual = () => {
    if (xmlDirty) {
      setXmlError("Apply or discard the XML source changes before returning to Visual Blocks.");
      return;
    }
    setMode("visual");
    window.requestAnimationFrame(() => iframeRef.current?.focus());
  };

  const applyXml = async () => {
    const validationError = validateBlocksXml(xmlDraft);
    if (validationError) {
      setXmlError(validationError);
      return;
    }
    try {
      await hashBlocksSource(xmlDraft);
      if (!onApplySnapshot(activePath, xmlDraft, generatedJavaPath)) {
        throw new Error("The project is busy. Retry Apply XML after the current action finishes.");
      }
      sourceXmlRef.current = xmlDraft;
      setXmlDirty(false);
      setXmlError(null);
      reloadFrame("Applying XML and regenerating Java…", true);
    } catch (error) {
      setXmlError(error instanceof Error ? error.message : "Blocks XML could not be applied.");
    }
  };

  const discardXml = () => {
    setXmlDraft(sourceXmlRef.current);
    setXmlDirty(false);
    setXmlError(null);
  };

  const retryXmlRegeneration = () => {
    reloadFrame("Retrying Java generation from Blocks XML…", true);
  };

  const selectFile = (path: string) => {
    if (path === activePath) return;
    if (xmlDirty) {
      setXmlError("Apply or discard the XML source changes before opening another file.");
      return;
    }
    onSelectFile(path);
  };

  return (
    <section className={`editor-pane ${styles.pane}`} aria-label="Blocks editor">
      <div className={`${styles.frame}${readOnly || status === "saving" ? ` ${styles.locked}` : ""}`}>
        {mode === "visual" && !singleFile && (
          <button
            type="button"
            className={styles.javaButton}
            disabled={!generatedJavaPath}
            onClick={() => selectFile(generatedJavaPath)}
          >
            See Generated Java
          </button>
        )}
        <iframe
          key={`${activePath}:${frameGeneration}`}
          ref={iframeRef}
          className={mode === "xml" ? styles.visualHidden : undefined}
          src={`/vendor/ftc-blocks/2026-offline-v1/embed.html?project=${encodeURIComponent(className)}&instance=${frameGeneration}&bridge=5&theme=${theme}`}
          title={`${className} FTC Blocks editor`}
          sandbox="allow-scripts allow-same-origin"
          onLoad={postInit}
          aria-hidden={mode === "xml" ? true : undefined}
          inert={mode === "xml" ? true : undefined}
        />
        {mode === "xml" && (
          <div className={styles.xmlEditor}>
            <div className={styles.xmlHeader}>
              <div>
                <label htmlFor="blocks-xml-source">Blocks source XML</label>
                <p id="blocks-xml-help">
                  Apply validates and regenerates Java; Discard restores saved Blocks source.
                </p>
              </div>
              <div className={styles.xmlActions}>
                <button type="button" onClick={switchToVisual}>
                  Return to Visual Blocks
                </button>
                <button
                  type="button"
                  onClick={discardXml}
                  disabled={!xmlDirty}
                >
                  Discard changes
                </button>
                {regenerationError && (
                  <button type="button" onClick={retryXmlRegeneration}>
                    Retry Java generation
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { void applyXml(); }}
                  disabled={readOnly || !xmlDirty || status === "reloading" || status === "saving"}
                >
                  Apply XML
                </button>
              </div>
            </div>
            <textarea
              ref={xmlTextareaRef}
              id="blocks-xml-source"
              aria-describedby={`blocks-xml-help${xmlError || regenerationError ? " blocks-xml-error" : ""}`}
              value={xmlDraft}
              readOnly={readOnly}
              spellCheck={false}
              onChange={(event) => {
                setXmlDraft(event.target.value);
                setXmlDirty(event.target.value !== sourceXmlRef.current);
                setXmlError(null);
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !readOnly && xmlDirty) {
                  event.preventDefault();
                  void applyXml();
                }
              }}
            />
            {(xmlError || regenerationError) && (
              <p id="blocks-xml-error" className={styles.xmlError} role="alert">
                {xmlError ?? regenerationError}
              </p>
            )}
          </div>
        )}
        {mode === "visual" && !regenerationError && (status === "loading" || status === "reloading") && (
          <ViewLoading label="Loading Blocks editor" overlay />
        )}
        {mode === "visual" && (status === "failed" || regenerationError) && (
          <div className={styles.failure} role="alert">
            <Blocks aria-hidden="true" />
            <strong>{regenerationError ? "Generated Java could not be refreshed" : "Blocks editor could not start"}</strong>
            <span>{regenerationError ?? statusDetail}</span>
            <button type="button" onClick={() => {
              if (regenerationError) {
                retryXmlRegeneration();
                return;
              }
              reloadFrame("Retrying the FTC Blocks toolbox…", false);
            }}>Retry</button>
            {singleFile && <a href="/embed?language=blocks">Open default Blocks playground</a>}
          </div>
        )}
      </div>
    </section>
  );
}
