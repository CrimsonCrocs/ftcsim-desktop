"use client";

import {
  AlertTriangle,
  Download,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  GameSimulation,
  type GamePhase,
  type RobotId,
  type SimulationWorldOptions,
  type WorldAlliance,
  type WorldCommand,
  type WorldRobotConfiguration,
  type WorldObservation,
  type WorldSensorFrame,
} from "@ftc-studio/sim-core";
import type {
  BuildJobProgress,
  GamepadSnapshot,
  LoadArtifact,
  SimulationFrame,
  WorldRobotSensorFrame,
} from "@ftc-studio/opmode-protocol";
import { describeOpModeFailure, type OpModeSession } from "@/lib/opmode-session";
import { toRunnerWorldSensorFrame } from "@/lib/world-sensor-runner-frame";
import { advanceFirstPoweredFrame, advanceInitializationFrame } from "./game-simulation-clock";
import { advanceBrowserPhysics } from "@/lib/browser-physics-stepper";
import { createBrowserLoopPacer } from "@/lib/browser-loop-scheduler";
import { describeBiobuzzReplayField } from "@/lib/biobuzz-replay-field";
import {
  encodeReplayV3InitialState,
  enqueueActuatorFrame,
  type ReplayV3InitialState,
  type ReplayJournalEntry,
  type ReplayRuleAction,
} from "./game-simulation-replay";
import { GameSimulationProgram } from "./game-simulation-program";
import { SharedWorldScene } from "./shared-world-scene";
import { SimulatorCameraPreview } from "./simulator-camera-preview";
import { SimulatorCameraFrames, type SimulatorCameraCapture } from "@/lib/simulator-camera";
import { preloadFieldVisuals } from "./world-visual-assets";
import { ViewLoading } from "@/components/view-loading";
import { MatchRefereePanel, type MatchRefereeDecision } from "./match-referee-panel";
import styles from "./game-simulation-panel.module.css";
import { useSimulatorFullscreen } from "./use-simulator-fullscreen";
import { TouchGamepad } from "./touch-gamepad";
import type { GamepadRegistry } from "@/lib/gamepad";

const MATCH_CAMERA = { azimuth: 0.9, elevation: 1.0, distance: 6.4 };
const ROBOT_CAMERA = { azimuth: 0.9, elevation: 0.65, distance: 2.4 };

function FullscreenCorners({ expanded }: { expanded: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {expanded ? <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" /> : <path d="M4 8V4h4m8 0h4v4M8 20H4v-4m16 0v4h-4" />}
  </svg>;
}

export type GameSimulationDifficulty = "easy" | "balanced" | "competitive";
export type GameSimulationStartPosition = "near" | "far";

export interface GameSimulationOpMode {
  className: string;
  displayName: string;
  kind: "teleop" | "autonomous";
  runtimeSupported?: boolean;
}

export interface GameSimulationPanelProps {
  /** Desktop rehearsals retain the evaluator's initial seed across resets. */
  rehearsalSeed?: number;
  open: boolean;
  onClose: () => void;
  onConfigureRobot?: () => void;
  robotConfiguration: WorldRobotConfiguration;
  opModes: readonly GameSimulationOpMode[];
  loadWorldOptions(options: {
    seed: number;
    alliance: WorldAlliance;
    startPosition: GameSimulationStartPosition;
    robotConfiguration: WorldRobotConfiguration;
  }): Promise<SimulationWorldOptions>;
  /** Opens/builds the current working-tree project and returns its loaded JVM artifact. */
  prepareProgram(options?: {
    onBuildProgress?: (progress: BuildJobProgress) => void;
    onStatus?: (message: string) => void;
  }): Promise<{ session: OpModeSession; artifact: LoadArtifact }>;
  readGamepads(): { gamepad1: GamepadSnapshot; gamepad2: GamepadSnapshot };
  createPolicies(
    game: GameSimulation,
    options: { difficulty: GameSimulationDifficulty },
  ): Promise<{
    commands(game: GameSimulation): Promise<WorldCommand[]>;
    close(): void;
  }>;
  /** Optional host adapter for session.handoff; resolves after TELEOP has initialized. */
  handoffProgram?(
    session: OpModeSession,
    entryClass: string,
    sensors: WorldRobotSensorFrame,
  ): Promise<SimulationFrame>;
  /** If omitted, the panel detects loss only after a browser gamepad has connected once. */
  isControllerConnected?: () => boolean;
  returnFocus?: HTMLElement | null;
  touchRegistry?: GamepadRegistry;
}

type Lifecycle = "setup" | "preparing" | "init" | "countdown" | "running" | "paused" | "replay" | "results" | "stopped" | "failed";
type VisualReplayFrame = {
  tick: number;
  phase: GamePhase;
  matchTimeMs: number;
  remainingMs: number;
  scores: { red: number; blue: number };
  observation: WorldObservation;
};
type EncodedRecord = { tick: number; bytes: Uint8Array };
type PreparedMatchWorld = { options: SimulationWorldOptions; match: GameSimulation; claimed: boolean };
const MAX_REPLAY_MEMORY_BYTES = 64 * 1024 * 1024;
const MAX_VISUAL_REPLAY_BYTES = 16 * 1024 * 1024;
const MAX_COMMAND_JOURNAL_BYTES = MAX_REPLAY_MEMORY_BYTES - MAX_VISUAL_REPLAY_BYTES;
const VISUAL_SAMPLE_TICKS = 20;
const CONTROL_FRAME_MS = 20;
const ZERO_GAMEPAD: GamepadSnapshot = Object.freeze({});
const replayEncoder = new TextEncoder();
const replayDecoder = new TextDecoder();

function decodeVisualFrame(record: EncodedRecord): VisualReplayFrame {
  return JSON.parse(replayDecoder.decode(record.bytes)) as VisualReplayFrame;
}

function motorFeedback(frame: WorldSensorFrame["motors"]) {
  return Object.fromEntries(Object.entries(frame).map(([name, motor]) => [name, {
    positionTicks: motor.positionTicks,
    velocityTicksPerSecond: motor.velocityTicksPerSecond,
    currentAmps: motor.currentAmps,
    enabled: motor.enabled,
  }]));
}

function phaseLabel(phase: GamePhase | null): string {
  switch (phase) {
    case "init": return "INIT";
    case "auto": return "AUTO";
    case "transition": return "Transition · 8 seconds";
    case "teleop-handoff": return "Preparing TELEOP";
    case "teleop": return "TELEOP";
    case "settling": return "Settling";
    case "results": return "Results";
    case "stopped": return "Stopped";
    default: return "Setup";
  }
}

function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function describeError(error: unknown): string {
  return describeOpModeFailure(error, "The match could not continue.");
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** Keep the canonical CAD field shared; only replay metadata and robot inputs need isolation. */
function retainCanonicalFieldReference(options: SimulationWorldOptions): SimulationWorldOptions {
  return {
    ...options,
    robots: structuredClone(options.robots),
    ...(options.parameters === undefined ? {} : { parameters: structuredClone(options.parameters) }),
  };
}

export function GameSimulationPanel({
  rehearsalSeed,
  open,
  onClose,
  onConfigureRobot,
  robotConfiguration,
  opModes,
  loadWorldOptions,
  prepareProgram,
  readGamepads,
  createPolicies,
  handoffProgram,
  isControllerConnected,
  returnFocus,
  touchRegistry,
}: GameSimulationPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useSimulatorFullscreen(dialogRef);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousLifecycleRef = useRef<Lifecycle>("setup");
  const openerRef = useRef<HTMLElement | null>(null);
  const gameRef = useRef<GameSimulation | null>(null);
  const previewPromiseRef = useRef<Promise<PreparedMatchWorld | null> | null>(null);
  const previewObservationRef = useRef<WorldObservation | null>(null);
  const worldOptionsRef = useRef<SimulationWorldOptions | null>(null);
  const replayInitialStateRef = useRef<ReplayV3InitialState | null>(null);
  const replayStartRuleActionIndexRef = useRef(0);
  const programRef = useRef<GameSimulationProgram | null>(null);
  const policiesRef = useRef<Awaited<ReturnType<GameSimulationPanelProps["createPolicies"]>> | null>(null);
  const playerRobotRef = useRef<RobotId>("red-1");
  const observationRef = useRef<WorldObservation | null>(null);
  const [cameraFrames] = useState(() => new SimulatorCameraFrames());
  const captureCamera = useCallback<SimulatorCameraCapture>((id, frame, latency) => cameraFrames.accept(id, frame, latency), [cameraFrames]);
  const cameraRequestsRef = useRef<readonly string[] | undefined>(undefined);
  const cameraFrameRequested = useCallback((robotId: string, camera: string) => cameraFrames.needsCapture(
    robotId, camera, cameraRequestsRef.current,
  ), [cameraFrames]);
  const runnerSensorFrame = useCallback((frame: WorldSensorFrame): WorldRobotSensorFrame => ({
    ...toRunnerWorldSensorFrame(frame), cameraFrames: cameraFrames.read(frame.robotId, frame.simulationTimeMs),
  }), [cameraFrames]);
  const loopWantedRef = useRef(false);
  const loopPromiseRef = useRef<Promise<void> | null>(null);
  const pauseRequestedRef = useRef(false);
  const pendingTeleopResumeRef = useRef(false);
  const pendingTeleopStartFrameRef = useRef<SimulationFrame | null>(null);
  const autoStopIssuedRef = useRef(false);
  const disposePromiseRef = useRef<Promise<void> | null>(null);
  const replayTimerRef = useRef<number | null>(null);
  const dialogActiveRef = useRef(false);
  const countdownGenerationRef = useRef(0);
  const startPendingRef = useRef(false);
  const visualReplayRef = useRef<EncodedRecord[]>([]);
  const commandJournalRef = useRef<EncodedRecord[]>([]);
  const visualReplayBytesRef = useRef(0);
  const commandJournalBytesRef = useRef(0);
  const replaySampleStrideRef = useRef(1);
  const journalTruncatedRef = useRef(false);
  const lastVisualPhaseRef = useRef<GamePhase | null>(null);
  const lastUiPublishAtRef = useRef(0);
  const lastSlowFactorPublishAtRef = useRef(0);
  const slowFactorValueRef = useRef(1);
  const lastPublishedPhaseRef = useRef<GamePhase | null>(null);
  const controlSequenceRef = useRef(0);
  const commandSequenceRef = useRef(0);
  const hadControllerRef = useRef(false);
  const [lifecycle, setLifecycle] = useState<Lifecycle>("setup");
  const [countdown, setCountdown] = useState<3 | 2 | 1 | "GO" | null>(null);
  const [phase, setPhase] = useState<GamePhase | null>(null);
  const [game, setGame] = useState<GameSimulation | null>(null);
  const [previewGame, setPreviewGame] = useState<GameSimulation | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [cameraView, setCameraView] = useState<"field" | "driver" | "follow">("driver");
  const [menuOpen, setMenuOpen] = useState(false);
  const [preparationStatus, setPreparationStatus] = useState("Preparing field…");
  const [playerRobotId, setPlayerRobotId] = useState<RobotId>("red-1");
  const [worldObservation, setWorldObservation] = useState<WorldObservation | null>(null);
  const [alliance, setAlliance] = useState<WorldAlliance>("red");
  const [startPosition, setStartPosition] = useState<GameSimulationStartPosition>("near");
  const [autoClass, setAutoClass] = useState<string | null>(null);
  const [teleopClass, setTeleopClass] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<GameSimulationDifficulty>("balanced");
  const [loadingEarly, setLoadingEarly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"setup" | "policy" | "runner" | "controller" | null>(null);
  const [buildProgress, setBuildProgress] = useState<BuildJobProgress | null>(null);
  const [slowFactor, setSlowFactor] = useState(1);
  const [revision, setRevision] = useState(0);
  const [replayFrames, setReplayFrames] = useState(0);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayVisual, setReplayVisual] = useState<VisualReplayFrame | null>(null);
  const [replaySampleHz, setReplaySampleHz] = useState(10);
  const [journalBytes, setJournalBytes] = useState(0);
  const [journalTruncated, setJournalTruncated] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [requestedPauseReason, setRequestedPauseReason] = useState<string | null>(null);
  const allianceOpModes = useMemo(
    () => opModes.filter((mode) => mode.kind === "autonomous" && mode.runtimeSupported !== false),
    [opModes],
  );
  const teleopOpModes = useMemo(
    () => opModes.filter((mode) => mode.kind === "teleop" && mode.runtimeSupported !== false),
    [opModes],
  );
  const selectedAutoClass = useMemo(
    () => autoClass === null ? allianceOpModes[0]?.className ?? ""
      : allianceOpModes.some((mode) => mode.className === autoClass) ? autoClass : "",
    [allianceOpModes, autoClass],
  );
  const selectedTeleopClass = useMemo(
    () => teleopClass === null ? teleopOpModes[0]?.className ?? ""
      : teleopOpModes.some((mode) => mode.className === teleopClass) ? teleopClass : "",
    [teleopOpModes, teleopClass],
  );
  const rules = game?.rules;
  const playerState = worldObservation?.robots.find((robot) => robot.id === playerRobotId);
  const nectarAvailability = game && lifecycle === "running" ? game.availableNectar(alliance) : null;

  // Prepare the physical field while the driver chooses settings. Ownership
  // transfers to the match on INIT; abandoned previews free their own world.
  useEffect(() => {
    if (!open || gameRef.current) return;
    preloadFieldVisuals("biobuzz-2026-2027");
    let cancelled = false;
    let prepared: PreparedMatchWorld | null = null;
    const pending = (async () => {
      try {
        const options = await loadWorldOptions({ seed: rehearsalSeed??Math.floor(Math.random() * 0x7fffffff), alliance, startPosition, robotConfiguration });
        if (cancelled) return null;
        const match = await GameSimulation.create(options);
        if (cancelled) { match.dispose(); return null; }
        prepared = { options, match, claimed: false };
        previewObservationRef.current = match.world.observe();
        setPreviewError(null);
        setPreviewGame(match);
        return prepared;
      } catch (cause) {
        if (!cancelled) setPreviewError(describeError(cause));
        return null;
      }
    })();
    previewPromiseRef.current = pending;
    return () => {
      cancelled = true;
      if (prepared && !prepared.claimed) prepared.match.dispose();
      if (previewPromiseRef.current === pending) previewPromiseRef.current = null;
    };
  }, [alliance, loadWorldOptions, open, robotConfiguration, startPosition,rehearsalSeed]);

  const publish = useCallback((options: { force?: boolean; observation?: WorldObservation | null } = {}) => {
    const active = gameRef.current;
    const observation = options.observation ?? active?.world.observe() ?? null;
    observationRef.current = observation;
    const nextPhase = active?.phase ?? null;
    const now = performance.now();
    const phaseChanged = nextPhase !== lastPublishedPhaseRef.current;
    if (!options.force && !phaseChanged && now - lastUiPublishAtRef.current < 100) return;
    lastUiPublishAtRef.current = now;
    lastPublishedPhaseRef.current = nextPhase;
    setWorldObservation(observation);
    setPhase(nextPhase);
    setRevision((value) => value + 1);
    setJournalBytes(commandJournalBytesRef.current);
    setJournalTruncated(journalTruncatedRef.current);
  }, []);

  const closePolicies = useCallback(() => {
    policiesRef.current?.close();
    policiesRef.current = null;
  }, []);

  const stopLoop = useCallback(async () => {
    loopWantedRef.current = false;
    await loopPromiseRef.current?.catch(() => undefined);
    loopPromiseRef.current = null;
    await programRef.current?.pauseTicks().catch(() => undefined);
  }, []);

  const shutdown = useCallback(async () => {
    if (disposePromiseRef.current) return disposePromiseRef.current;
    countdownGenerationRef.current++;
    startPendingRef.current = false;
    pauseRequestedRef.current = true;
    gameRef.current?.world.setPowered(false);
    disposePromiseRef.current = (async () => {
      await stopLoop();
      closePolicies();
      const program = programRef.current;
      programRef.current = null;
      if (program) await program.close().catch(() => undefined);
      gameRef.current?.dispose();
      gameRef.current = null;
      worldOptionsRef.current = null;
      replayInitialStateRef.current = null;
      replayStartRuleActionIndexRef.current = 0;
      observationRef.current = null;
      cameraFrames.clear();
      cameraRequestsRef.current = undefined;
      lastPublishedPhaseRef.current = null;
      lastUiPublishAtRef.current = 0;
      setGame(null);
      setWorldObservation(null);
      setPhase(null);
      setReplayVisual(null);
      visualReplayRef.current = [];
      commandJournalRef.current = [];
      visualReplayBytesRef.current = 0;
      commandJournalBytesRef.current = 0;
      pendingTeleopResumeRef.current = false;
      pendingTeleopStartFrameRef.current = null;
    })();
    await disposePromiseRef.current;
    disposePromiseRef.current = null;
  }, [closePolicies, stopLoop, cameraFrames]);

  useEffect(() => {
    if (!open) return;
    dialogActiveRef.current = true;
    openerRef.current = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      dialogActiveRef.current = false;
      if (replayTimerRef.current !== null) window.clearTimeout(replayTimerRef.current);
      void shutdown();
      window.requestAnimationFrame(() => {
        if (openerRef.current?.isConnected) openerRef.current.focus();
      });
    };
  }, [open, returnFocus, shutdown]);

  useEffect(() => {
    if (!open) {
      previousLifecycleRef.current = lifecycle;
      return;
    }
    if (previousLifecycleRef.current === lifecycle) return;
    previousLifecycleRef.current = lifecycle;

    const dialog = dialogRef.current;
    if (!dialog || (document.activeElement && dialog.contains(document.activeElement))) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [lifecycle, open]);

  const enterFailure = useCallback(async (cause: unknown, kind: "setup" | "policy" | "runner") => {
    if (kind === "policy") console.error("Game Simulation programmed opponents failed:", cause);
    setError(describeError(cause));
    setErrorKind(kind);
    setLifecycle("failed");
    loopWantedRef.current = false;
    gameRef.current?.stop();
    closePolicies();
    const program = programRef.current;
    programRef.current = null;
    if (program) await program.close().catch(() => undefined);
    publish({ force: true });
  }, [closePolicies, publish]);

  const clearReplay = useCallback(() => {
    visualReplayRef.current = [];
    commandJournalRef.current = [];
    visualReplayBytesRef.current = 0;
    commandJournalBytesRef.current = 0;
    replaySampleStrideRef.current = 1;
    journalTruncatedRef.current = false;
    replayInitialStateRef.current = null;
    replayStartRuleActionIndexRef.current = 0;
    lastVisualPhaseRef.current = null;
    setReplayFrames(0);
    setReplayIndex(0);
    setReplayVisual(null);
    setReplaySampleHz(10);
    setJournalBytes(0);
    setJournalTruncated(false);
  }, []);

  const recordJournalEvent = useCallback((entry: ReplayJournalEntry) => {
    if (journalTruncatedRef.current) return;
    const bytes = replayEncoder.encode(JSON.stringify(entry));
    if (commandJournalBytesRef.current + bytes.byteLength > MAX_COMMAND_JOURNAL_BYTES) {
      journalTruncatedRef.current = true;
      setJournalTruncated(true);
      return;
    }
    commandJournalRef.current.push({ tick: entry.tick, bytes });
    commandJournalBytesRef.current += bytes.byteLength;
  }, []);

  const recordVisualFrame = useCallback((force = false, observation?: WorldObservation) => {
    const active = gameRef.current;
    if (!active) return;
    if (!force && active.world.tick % (VISUAL_SAMPLE_TICKS * replaySampleStrideRef.current) !== 0
        && lastVisualPhaseRef.current === active.phase) return;
    const frame: VisualReplayFrame = {
      tick: active.world.tick,
      phase: active.phase,
      matchTimeMs: active.matchTimeMs,
      remainingMs: active.remainingMs,
      scores: { red: active.rules.scores.red, blue: active.rules.scores.blue },
      observation: observation ?? active.world.observe(),
    };
    const bytes = replayEncoder.encode(JSON.stringify(frame));
    const frames = visualReplayRef.current;
    while (visualReplayBytesRef.current + bytes.byteLength > MAX_VISUAL_REPLAY_BYTES && frames.length > 2) {
      const retained: EncodedRecord[] = [];
      let retainedBytes = 0;
      for (let index = 0; index < frames.length; index += 1) {
        if (index === 0 || index === frames.length - 1 || index % 2 === 0) {
          retained.push(frames[index]!);
          retainedBytes += frames[index]!.bytes.byteLength;
        }
      }
      frames.splice(0, frames.length, ...retained);
      visualReplayBytesRef.current = retainedBytes;
      replaySampleStrideRef.current *= 2;
    }
    if (bytes.byteLength > MAX_VISUAL_REPLAY_BYTES) return;
    while (visualReplayBytesRef.current + bytes.byteLength > MAX_VISUAL_REPLAY_BYTES && frames.length > 1) {
      visualReplayBytesRef.current -= frames[1]!.bytes.byteLength;
      frames.splice(1, 1);
      replaySampleStrideRef.current *= 2;
    }
    if (visualReplayBytesRef.current + bytes.byteLength > MAX_VISUAL_REPLAY_BYTES && frames.length === 1) {
      visualReplayBytesRef.current -= frames[0]!.bytes.byteLength;
      frames.splice(0, 1);
      replaySampleStrideRef.current *= 2;
    }
    if (visualReplayBytesRef.current + bytes.byteLength > MAX_VISUAL_REPLAY_BYTES) return;
    frames.push({ tick: frame.tick, bytes });
    visualReplayBytesRef.current += bytes.byteLength;
    lastVisualPhaseRef.current = active.phase;
    setReplayFrames(frames.length);
    setReplaySampleHz(10 / replaySampleStrideRef.current);
  }, []);

  const recordAppliedFrame = useCallback((frame: SimulationFrame, mode: GamePhase) => {
    const active = gameRef.current;
    if (!active) return null;
    cameraRequestsRef.current = frame.cameraFrameRequests;
    const sequence = commandSequenceRef.current + 1;
    const command = enqueueActuatorFrame(active.world, frame, playerRobotRef.current, mode, sequence);
    if (command) commandSequenceRef.current = sequence;
    return command;
  }, []);

  const performHandoff = useCallback(async (deferPublish = false) => {
    const active = gameRef.current;
    const program = programRef.current;
    if (!active || !program) throw new Error("The match is no longer available.");
    if (pauseRequestedRef.current) return;
    const sensorFrame = active.world.sensorFrame(playerRobotRef.current);
    const startFrame = await program.startTeleop(runnerSensorFrame(sensorFrame));
    if (pauseRequestedRef.current) {
      pendingTeleopResumeRef.current = true;
      pendingTeleopStartFrameRef.current = startFrame;
      return;
    }
    active.resumeTeleop();
    if (startFrame) {
      const command = recordAppliedFrame(startFrame, "teleop");
      if (command) recordJournalEvent({ kind: "commands", tick: active.world.tick, commands: [command] });
    }
    recordJournalEvent({ kind: "teleop-resume", tick: active.world.tick });
    advanceFirstPoweredFrame(active);
    if (!deferPublish) publish({ force: true });
  }, [publish, recordAppliedFrame, recordJournalEvent, runnerSensorFrame]);

  const runControlCycle = useCallback(async (mode: "init" | "auto" | "transition" | "teleop" | "settling") => {
    const active = gameRef.current;
    if (!active) throw new Error("The match lost its active simulation world.");
    if (mode === "transition") {
      // AUTO is stopped, but its JVM/static state must survive the eight-second
      // passive interval (which can take longer on a slow simulation host).
      programRef.current?.pollKeepAlive();
      await advanceBrowserPhysics(4, () => { active.step(1); });
      if (active.phase === "teleop-handoff") await performHandoff(true);
      if (active.phase === "results") {
        loopWantedRef.current = false;
        closePolicies();
        setLifecycle("results");
      }
      const observation = active.world.observe();
      recordVisualFrame(false, observation);
      publish({ observation });
      return;
    }
    if (mode === "settling") {
      await advanceBrowserPhysics(4, () => { active.step(1); });
      if (active.phase === "results") {
        loopWantedRef.current = false;
        closePolicies();
        setLifecycle("results");
      }
      const observation = active.world.observe();
      recordVisualFrame(false, observation);
      publish({ observation });
      return;
    }
    const program = programRef.current;
    if (!program) throw new Error("The match lost its program configuration.");
    if (mode === "init") {
      recordJournalEvent({ kind: "init-advance", tick: active.world.tick, physicsTicks: 4 });
      const observation = await advanceInitializationFrame(active.world);
      publish({ observation });
    }
    const playerId = playerRobotRef.current;
    const worldSensors = active.world.sensorFrame(playerId);
    const teleop = mode === "teleop";
    const pads = teleop ? readGamepads() : { gamepad1: ZERO_GAMEPAD, gamepad2: ZERO_GAMEPAD };
    const policy = policiesRef.current;
    const shouldControlBots = mode === "auto" || mode === "teleop";
    const frame = program.poll(mode, {
      sequence: ++controlSequenceRef.current,
      gamepad1: pads.gamepad1,
      gamepad2: pads.gamepad2,
      motors: motorFeedback(worldSensors.motors),
      sensors: runnerSensorFrame(worldSensors),
    });
    if (shouldControlBots && !policy) throw new Error("The programmed BIOBUZZ opponents are unavailable.");
    const policyCommands = shouldControlBots ? await policy!.commands(active) : [] as WorldCommand[];
    // Finish an acknowledged in-flight frame even when pause was requested.
    // The world is already unpowered; retaining the step avoids sending the same
    // accepted sensor timestamp again when the user resumes.
    const recordedCommands: WorldCommand[] = [];
    const playerCommand = frame ? recordAppliedFrame(frame, mode) : null;
    if (playerCommand) recordedCommands.push(playerCommand);
    if (shouldControlBots) {
      for (const command of policyCommands) {
        if (command.robotId === playerId) throw new Error("An automated teammate attempted to overwrite the selected robot.");
        const applied = { ...command, tick: active.world.tick, sequence: ++commandSequenceRef.current, source: "policy" as const };
        active.world.enqueue(applied);
        recordedCommands.push(applied);
      }
    }
    if (mode === "init") {
      if (playerCommand) recordJournalEvent({ kind: "commands", tick: playerCommand.tick, commands: [playerCommand] });
      recordVisualFrame(false, observationRef.current ?? undefined);
      return;
    }
    if (recordedCommands.length > 0) recordJournalEvent({ kind: "commands", tick: active.world.tick, commands: recordedCommands });
    if (mode === "auto") {
      await advanceBrowserPhysics(4, async () => {
        active.step(1);
        if (active.phase === "transition" && !autoStopIssuedRef.current) {
          autoStopIssuedRef.current = true;
          await program.stop();
        }
      });
    } else {
      await advanceBrowserPhysics(4, () => { active.step(1); });
    }
    if (active.phase === "settling") {
      await program.stop();
    }
    if (active.phase === "teleop-handoff") await performHandoff(true);
    if (active.phase === "results") {
      loopWantedRef.current = false;
      closePolicies();
      setLifecycle("results");
    }
    const observation = active.world.observe();
    recordVisualFrame(false, observation);
    publish({ observation });
  }, [closePolicies, performHandoff, publish, readGamepads, recordAppliedFrame, recordJournalEvent, recordVisualFrame, runnerSensorFrame]);

  const startControlLoop = useCallback(() => {
    if (loopPromiseRef.current) return;
    loopWantedRef.current = true;
    const pace = createBrowserLoopPacer(CONTROL_FRAME_MS);
    const loop = async () => {
      while (loopWantedRef.current) {
        const beganAt = performance.now();
        const active = gameRef.current;
        if (!active) break;
        const mode = active.phase;
        if (mode === "results" || mode === "stopped" || mode === "setup") break;
        if (mode === "teleop" && selectedTeleopClass) {
          const nativeConnected = typeof navigator !== "undefined"
            && typeof navigator.getGamepads === "function"
            && Array.from(navigator.getGamepads()).some((pad) => pad?.connected);
          const connected = isControllerConnected?.() ?? nativeConnected;
          if (connected) hadControllerRef.current = true;
          if (!connected && hadControllerRef.current) {
            pauseRequestedRef.current = true;
            if (active.world.isPowered) {
              active.world.setPowered(false);
              recordJournalEvent({ kind: "world-power", tick: active.world.tick, enabled: false });
            }
            loopWantedRef.current = false;
            setRequestedPauseReason("Paused because the game controller disconnected.");
            setErrorKind("controller");
            setLifecycle("paused");
            publish({ force: true });
            break;
          }
        }
        try {
          if (mode === "init" || mode === "auto" || mode === "transition" || mode === "teleop" || mode === "settling") {
            await runControlCycle(mode);
          } else if (mode === "teleop-handoff") {
            await performHandoff();
          } else {
            break;
          }
        } catch (cause) {
          const message = describeError(cause).toLowerCase();
          const kind = message.includes("policy")
            ? "policy"
            : mode === "init" || mode === "auto" || mode === "transition" || mode === "teleop" || mode === "teleop-handoff"
              ? "runner"
              : "setup";
          await enterFailure(cause, kind);
          break;
        }
        if (active.phase === "results" || !loopWantedRef.current) break;
        const elapsed = performance.now() - beganAt;
        const ratio = elapsed <= CONTROL_FRAME_MS ? 1 : CONTROL_FRAME_MS / elapsed;
        slowFactorValueRef.current = slowFactorValueRef.current * 0.8 + ratio * 0.2;
        const statusAt = performance.now();
        if (statusAt - lastSlowFactorPublishAtRef.current >= 500) {
          lastSlowFactorPublishAtRef.current = statusAt;
          setSlowFactor(slowFactorValueRef.current);
        }
        // Passive phases have no network await. Always yield a browser task so
        // slow physics cannot starve painting, Stop, or visibility changes.
        await pace();
      }
    };
    const promise = loop();
    loopPromiseRef.current = promise;
    void promise.finally(() => {
      if (loopPromiseRef.current === promise) loopPromiseRef.current = null;
    });
  }, [enterFailure, isControllerConnected, performHandoff, publish, recordJournalEvent, runControlCycle, selectedTeleopClass]);

  const pauseForSafety = useCallback(async (reason: string) => {
    const active = gameRef.current;
    if (!active || !["running", "init"].includes(lifecycle)) return;
    pauseRequestedRef.current = true;
    if (active.world.isPowered) {
      active.world.setPowered(false);
      recordJournalEvent({ kind: "world-power", tick: active.world.tick, enabled: false });
    }
    await stopLoop();
    setRequestedPauseReason(reason);
    setLifecycle("paused");
    setErrorKind(reason.includes("controller") ? "controller" : null);
    publish({ force: true });
  }, [lifecycle, publish, recordJournalEvent, stopLoop]);

  useEffect(() => {
    if (lifecycle !== "paused") return;
    let disposed = false;
    let pending = false;
    const timer = window.setInterval(() => {
      const program = programRef.current;
      if (!program || pending) return;
      pending = true;
      void program.keepAlive().catch((cause) => {
        if (!disposed) void enterFailure(cause, "runner");
      }).finally(() => { pending = false; });
    }, 1_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [enterFailure, lifecycle]);

  useEffect(() => {
    if (!open) return;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") void pauseForSafety("Paused because this tab is hidden.");
    };
    const handleGamepadConnect = () => { hadControllerRef.current = true; };
    const handleGamepadDisconnect = () => {
      if (selectedTeleopClass && gameRef.current?.phase === "teleop" && hadControllerRef.current) void pauseForSafety("Paused because the game controller disconnected.");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("gamepadconnected", handleGamepadConnect);
    window.addEventListener("gamepaddisconnected", handleGamepadDisconnect);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("gamepadconnected", handleGamepadConnect);
      window.removeEventListener("gamepaddisconnected", handleGamepadDisconnect);
    };
  }, [open, pauseForSafety, selectedTeleopClass]);

  const initialize = useCallback(async () => {
    if (lifecycle === "preparing") return;
    setLifecycle("preparing");
    setError(null);
    setErrorKind(null);
    setBuildProgress(null);
    setPreparationStatus("Preparing field…");
    setMenuOpen(false);
    setRequestedPauseReason(null);
    pauseRequestedRef.current = false;
    autoStopIssuedRef.current = false;
    hadControllerRef.current = false;
    controlSequenceRef.current = 0;
    commandSequenceRef.current = 0;
    slowFactorValueRef.current = 1;
    setSlowFactor(1);
    disposePromiseRef.current = null;
    try {
      const preview = await previewPromiseRef.current;
      const reusable = preview && !preview.claimed ? preview : null;
      const options = reusable?.options ?? await loadWorldOptions({
        seed: rehearsalSeed??Math.floor(Math.random() * 0x7fffffff),
        alliance,
        startPosition,
        robotConfiguration,
      });
      if (!dialogActiveRef.current) return;
      worldOptionsRef.current = retainCanonicalFieldReference(options);
      const match = reusable?.match ?? await GameSimulation.create(options);
      if (reusable) reusable.claimed = true;
      if (!dialogActiveRef.current) {
        match.dispose();
        return;
      }
      gameRef.current?.dispose();
      gameRef.current = match;
      setGame(match);
      setPreviewGame(null);
      const selectedPlayer = `${alliance}-1` as RobotId;
      playerRobotRef.current = selectedPlayer;
      setPlayerRobotId(selectedPlayer);
      match.initialize();
      cameraFrames.clear();
      cameraRequestsRef.current = undefined;
      const replayInitialState: ReplayV3InitialState = {
        format: "ftc-biobuzz-replay-v3",
        compactWorldDescriptor: await describeBiobuzzReplayField(options),
        physicsVersion: match.world.observe().physicsVersion,
        configurationHash: match.world.configurationFingerprint,
        initializedTick: match.world.tick,
      };
      observationRef.current = match.world.observe();
      setWorldObservation(observationRef.current);
      const policy = await createPolicies(match, { difficulty });
      if (!dialogActiveRef.current) {
        policy.close();
        return;
      }
      policiesRef.current = policy;
      // Build the CAD world before opening the short-lived runtime session.
      const program = new GameSimulationProgram(
        { autonomous: selectedAutoClass, teleop: selectedTeleopClass }, prepareProgram, handoffProgram,
      );
      programRef.current = program;
      await program.initialize(runnerSensorFrame(match.world.sensorFrame(playerRobotRef.current)), setBuildProgress, setPreparationStatus);
      if (!dialogActiveRef.current) { await program.close().catch(() => undefined); return; }
      clearReplay();
      replayInitialStateRef.current = replayInitialState;
      pendingTeleopResumeRef.current = false;
      pendingTeleopStartFrameRef.current = null;
      publish({ force: true, observation: observationRef.current });
      setLifecycle("init");
      startControlLoop();
    } catch (cause) {
      await enterFailure(cause, String(cause).toLowerCase().includes("policy") ? "policy" : "setup");
    }
  }, [alliance, clearReplay, createPolicies, difficulty, enterFailure, handoffProgram, lifecycle, loadWorldOptions, prepareProgram, publish, robotConfiguration, selectedAutoClass, selectedTeleopClass, startControlLoop, startPosition, runnerSensorFrame, cameraFrames,rehearsalSeed]);

  const startMatch = useCallback(async () => {
    const active = gameRef.current;
    const program = programRef.current;
    if (!active || !program || lifecycle !== "init" || startPendingRef.current) return;
    startPendingRef.current = true;
    const generation = ++countdownGenerationRef.current;
    await stopLoop();
    try {
      const worldOptions = worldOptionsRef.current;
      if (!worldOptions) throw new Error("The match is missing its exact simulation configuration.");
      if (!replayInitialStateRef.current) throw new Error("The match is missing its compact replay configuration.");
      replayStartRuleActionIndexRef.current = 0;

      setLifecycle("countdown");
      for (const number of [3, 2, 1] as const) {
        setCountdown(number);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1_000));
        if (!dialogActiveRef.current || gameRef.current !== active || generation !== countdownGenerationRef.current) return;
      }
      setCountdown("GO");

      const startFrame = await program.startAutonomous();
      if (!dialogActiveRef.current || gameRef.current !== active || generation !== countdownGenerationRef.current) return;
      if (startFrame) {
        const command = recordAppliedFrame(startFrame, "init");
        if (command) recordJournalEvent({ kind: "commands", tick: active.world.tick, commands: [command] });
      }
      active.start();
      setMenuOpen(false);
      recordJournalEvent({ kind: "lifecycle", action: "match-start", tick: active.world.tick });
      advanceFirstPoweredFrame(active);
      setLifecycle("running");
      window.setTimeout(() => { if (countdownGenerationRef.current === generation) setCountdown(null); }, 700);
      const observation = active.world.observe();
      recordVisualFrame(true, observation);
      publish({ force: true, observation });
      startControlLoop();
    } catch (cause) {
      setCountdown(null);
      await enterFailure(cause, "runner");
    } finally {
      startPendingRef.current = false;
    }
  }, [enterFailure, lifecycle, publish, recordAppliedFrame, recordJournalEvent, recordVisualFrame, startControlLoop, stopLoop]);

  const stopMatch = useCallback(async () => {
    // Stop power at the input event, then drain the accepted control frame so
    // sensor time and replay remain contiguous. Do not start TELEOP meanwhile.
    pauseRequestedRef.current = true;
    const stopping = gameRef.current;
    if (stopping?.world.isPowered) {
      stopping.world.setPowered(false);
      recordJournalEvent({ kind: "world-power", tick: stopping.world.tick, enabled: false });
    }
    await stopLoop();
    const active = gameRef.current;
    if (active) recordJournalEvent({ kind: "lifecycle", action: "match-stop", tick: active.world.tick });
    active?.stop();
    const observation = active?.world.observe() ?? null;
    if (observation) recordVisualFrame(true, observation);
    closePolicies();
    const program = programRef.current;
    if (program && lifecycle !== "failed" && lifecycle !== "setup") {
      try { await program.stop(); } catch { /* Match power is already off. */ }
    }
    setLifecycle("stopped");
    setRequestedPauseReason(null);
    publish({ force: true, observation });
  }, [closePolicies, lifecycle, publish, recordJournalEvent, recordVisualFrame, stopLoop]);

  const restart = useCallback(async () => {
    if (lifecycle === "preparing") return;
    setLifecycle("preparing");
    setBuildProgress(null);
    setPreparationStatus("Resetting match…");
    setMenuOpen(false);
    await stopLoop();
    closePolicies();
    const oldProgram = programRef.current;
    programRef.current = null;
    if (oldProgram) await oldProgram.close().catch(() => undefined);
    const active = gameRef.current;
    if (!active) {
      setLifecycle("setup");
      await initialize();
      return;
    }
    try {
      clearReplay();
      const resetSeed = rehearsalSeed??Math.floor(Math.random() * 0x7fffffff);
      active.reset(resetSeed);
      if (worldOptionsRef.current) worldOptionsRef.current = { ...worldOptionsRef.current, seed: resetSeed };
      pauseRequestedRef.current = false;
      autoStopIssuedRef.current = false;
      pendingTeleopResumeRef.current = false;
      pendingTeleopStartFrameRef.current = null;
      hadControllerRef.current = false;
      controlSequenceRef.current = 0;
      commandSequenceRef.current = 0;
      const policy = await createPolicies(active, { difficulty });
      if (!dialogActiveRef.current) {
        policy.close();
        return;
      }
      policiesRef.current = policy;
      active.initialize();
      const replayWorldOptions = worldOptionsRef.current;
      if (!replayWorldOptions) throw new Error("The restarted match is missing its compact replay configuration.");
      const replayInitialState: ReplayV3InitialState = {
        format: "ftc-biobuzz-replay-v3",
        compactWorldDescriptor: await describeBiobuzzReplayField(replayWorldOptions),
        physicsVersion: active.world.observe().physicsVersion,
        configurationHash: active.world.configurationFingerprint,
        initializedTick: active.world.tick,
      };
      const observation = active.world.observe();
      observationRef.current = observation;
      const program = new GameSimulationProgram(
        { autonomous: selectedAutoClass, teleop: selectedTeleopClass }, prepareProgram, handoffProgram,
      );
      programRef.current = program;
      await program.initialize(runnerSensorFrame(active.world.sensorFrame(playerRobotRef.current)), setBuildProgress, setPreparationStatus);
      if (!dialogActiveRef.current) { await program.close().catch(() => undefined); return; }
      replayInitialStateRef.current = replayInitialState;
      setError(null);
      setErrorKind(null);
      setRequestedPauseReason(null);
      setLifecycle("init");
      publish({ force: true, observation });
      startControlLoop();
    } catch (cause) {
      await enterFailure(cause, "runner");
    }
  }, [clearReplay, closePolicies, createPolicies, difficulty, enterFailure, handoffProgram, initialize, lifecycle, prepareProgram, publish, selectedAutoClass, selectedTeleopClass, startControlLoop, stopLoop, runnerSensorFrame,rehearsalSeed]);

  const resume = useCallback(() => {
    const active = gameRef.current;
    if (!active || lifecycle !== "paused") return;
    const nativeConnected = typeof navigator !== "undefined"
      && typeof navigator.getGamepads === "function"
      && Array.from(navigator.getGamepads()).some((pad) => pad?.connected);
    if (requestedPauseReason?.includes("controller") && !(isControllerConnected?.() ?? nativeConnected)) {
      setError("Reconnect the game controller before resuming.");
      setErrorKind("controller");
      return;
    }
    if (active.phase === "teleop-handoff") {
      if (!pendingTeleopResumeRef.current) {
        pauseRequestedRef.current = false;
        setError(null);
        setErrorKind(null);
        setRequestedPauseReason(null);
        setLifecycle("running");
        publish({ force: true });
        startControlLoop();
        return;
      }
      active.resumeTeleop();
      pendingTeleopResumeRef.current = false;
      const startFrame = pendingTeleopStartFrameRef.current;
      pendingTeleopStartFrameRef.current = null;
      if (startFrame) {
        const command = recordAppliedFrame(startFrame, "teleop");
        if (command) recordJournalEvent({ kind: "commands", tick: active.world.tick, commands: [command] });
      }
      recordJournalEvent({ kind: "teleop-resume", tick: active.world.tick });
      advanceFirstPoweredFrame(active);
    }
    pauseRequestedRef.current = false;
    const shouldPowerWorld = active.phase === "auto" || active.phase === "teleop";
    if (active.world.isPowered !== shouldPowerWorld) {
      active.world.setPowered(shouldPowerWorld);
      recordJournalEvent({ kind: "world-power", tick: active.world.tick, enabled: shouldPowerWorld });
    }
    setError(null);
    setErrorKind(null);
    setRequestedPauseReason(null);
    setLifecycle(active.phase === "init" ? "init" : "running");
    startControlLoop();
    publish({ force: true });
  }, [isControllerConnected, lifecycle, publish, recordAppliedFrame, recordJournalEvent, requestedPauseReason, startControlLoop]);

  const scrubTo = useCallback((index: number) => {
    const frames = visualReplayRef.current;
    if (frames.length === 0) return;
    const safeIndex = Math.max(0, Math.min(frames.length - 1, Math.floor(index)));
    const frame = decodeVisualFrame(frames[safeIndex]!);
    observationRef.current = frame.observation;
    setReplayVisual(frame);
    setPhase(frame.phase);
    setReplayIndex(safeIndex);
    setRevision((value) => value + 1);
  }, []);

  const exportReplay = useCallback(async () => {
    const visualFrames = visualReplayRef.current;
    const journal = commandJournalRef.current;
    const active = gameRef.current;
    const initialState = replayInitialStateRef.current;
    if (visualFrames.length === 0) return;
    if (!active || !initialState) {
      setError("Start the match before downloading a reproducible replay.");
      return;
    }
    try {
      const firstObservation = decodeVisualFrame(visualFrames[0]!).observation;
      const ruleActions: ReplayRuleAction[] = active.replayActions().slice(replayStartRuleActionIndexRef.current);
      const metadata = {
        physicsVersion: firstObservation.physicsVersion,
        seed: initialState.compactWorldDescriptor.seed,
        configurationHash: initialState.configurationHash,
        initializedTick: initialState.initializedTick,
        endTick: active.world.tick,
        visualReplay: "sampled-observations",
        nominalSampleHz: 10 / replaySampleStrideRef.current,
        journalTruncated: journalTruncatedRef.current,
        commandJournalLimitBytes: MAX_COMMAND_JOURNAL_BYTES,
      };
      const chunks: BlobPart[] = [
        `{"format":"ftc-biobuzz-replay-v3","metadata":${JSON.stringify(metadata)},"initialState":${encodeReplayV3InitialState(initialState)},"visualFrames":[`,
      ];
      visualFrames.forEach((record, index) => {
        if (index > 0) chunks.push(",");
        chunks.push(asArrayBuffer(record.bytes));
      });
      chunks.push("],\"commandJournal\":[");
      journal.forEach((record, index) => {
        if (index > 0) chunks.push(",");
        chunks.push(asArrayBuffer(record.bytes));
      });
      chunks.push("],\"ruleActions\":");
      chunks.push(JSON.stringify(ruleActions));
      chunks.push("}");
      const blob = new Blob(chunks, { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ftc-biobuzz-replay-${metadata.seed}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (cause) {
      setError(`Could not package the reproducible replay: ${describeError(cause)}`);
    }
  }, []);

  const exitReplay = useCallback(() => {
    setReplayPlaying(false);
    setReplayVisual(null);
    publish({ force: true });
    setLifecycle(rules?.completed ? "results" : "stopped");
  }, [publish, rules?.completed]);

  const beginReplay = useCallback(() => {
    const active = gameRef.current;
    if (!active || visualReplayRef.current.length < 2) return;
    void stopLoop().then(() => {
      active.world.setPowered(false);
      setReplayPlaying(false);
      setLifecycle("replay");
      scrubTo(0);
    });
  }, [scrubTo, stopLoop]);

  useEffect(() => {
    if (lifecycle !== "replay" || !replayPlaying) return;
    const currentFrame = visualReplayRef.current[replayIndex];
    const nextFrame = visualReplayRef.current[replayIndex + 1];
    if (!currentFrame || !nextFrame) {
      setReplayPlaying(false);
      return;
    }
    const delayMs = Math.max(20, (nextFrame.tick - currentFrame.tick) * 5);
    replayTimerRef.current = window.setTimeout(() => {
      const next = replayIndex + 1;
      if (next >= visualReplayRef.current.length) {
        setReplayPlaying(false);
        return;
      }
      scrubTo(next);
    }, delayMs);
    return () => {
      if (replayTimerRef.current !== null) window.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    };
  }, [lifecycle, replayIndex, replayPlaying, scrubTo]);

  const humanLoad = useCallback((allowEarly: boolean) => {
    const active = gameRef.current;
    if (!active || !nectarAvailability) return;
    if (nectarAvailability.legalNow === 0 && !allowEarly) return;
    try {
      const elementId = active.loadNectar(alliance);
      recordJournalEvent({ kind: "human-nectar-load", tick: active.world.tick, alliance, elementId });
      setError(null);
      publish({ force: true });
    } catch (cause) {
      setError(describeError(cause));
    }
  }, [alliance, nectarAvailability, publish, recordJournalEvent]);

  const closeDialog = useCallback(() => {
    void shutdown();
    onClose();
  }, [onClose, shutdown]);

  const recordRefereeDecision = useCallback((adjustment: MatchRefereeDecision) => {
    const active = gameRef.current;
    if (!active || (lifecycle !== "results" && lifecycle !== "stopped")) {
      throw new Error("Stop or finish the match before recording a referee decision.");
    }
    active.adjustReferee(adjustment);
    recordJournalEvent({ kind: "referee-adjustment", tick: active.world.tick, adjustment });
    const observation = active.world.observe();
    recordVisualFrame(true, observation);
    publish({ force: true, observation });
  }, [lifecycle, publish, recordJournalEvent, recordVisualFrame]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (isFullscreen || document.fullscreenElement === dialogRef.current) {
        if (document.fullscreenElement) void document.exitFullscreen();
        return;
      }
      if (menuOpen) { setMenuOpen(false); return; }
      closeDialog();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex='-1'])",
    )).filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  if (!open) return null;

  const sceneGame = game ?? previewGame;
  const setupVisible = !game;
  const panelVisible = lifecycle !== "running" || menuOpen;
  const centeredPanel = setupVisible || ["preparing", "failed", "results", "stopped", "paused"].includes(lifecycle);

  return (
    <div className={styles.backdrop}>
      <section
        ref={dialogRef}
        className={styles.dialog}
        data-revision={revision}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-simulation-title"
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 ref={headingRef} id="game-simulation-title" tabIndex={-1}>Game Simulation</h2>
          </div>
          {game && <div className={styles.sceneReadout} aria-label="Match score and time">
            <span className={styles.phasePill}>{lifecycle === "countdown" ? "Starting" : phaseLabel(phase)}</span>
            <span className={styles.allianceText} data-alliance="red">Red <b>{replayVisual?.scores.red ?? rules?.scores.red ?? 0}</b></span>
            <span className={styles.allianceText} data-alliance="blue">Blue <b>{replayVisual?.scores.blue ?? rules?.scores.blue ?? 0}</b></span>
            <span className={styles.clock}>{formatClock(replayVisual?.remainingMs ?? game.remainingMs)}</span>
          </div>}
          <div className={styles.headerActions}>
            {lifecycle === "running" && <button type="button" className={styles.secondaryButton} aria-expanded={menuOpen} aria-controls="match-menu" onClick={() => setMenuOpen((value) => !value)}>Match menu</button>}
            <button ref={closeButtonRef} type="button" className={styles.iconButton} onClick={closeDialog} aria-label="Close Game Simulation" title="Exit match">
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={styles.scene} role="region" aria-label="BIOBUZZ match field" tabIndex={0}>
          <SimulatorCameraPreview frames={cameraFrames} robotId={game ? playerRobotId : `${alliance}-1`} cameras={robotConfiguration.cameras} />
          {sceneGame ? <SharedWorldScene
            observation={game ? observationRef : previewObservationRef}
            onCameraFrame={captureCamera}
            cameraFrameRequested={cameraFrameRequested}
            robots={sceneGame.world.robotSetups}
            playerRobot={game ? playerRobotId : `${alliance}-1` as RobotId}
            view={cameraView}
            driverAlliance={alliance}
            cameraSettings={cameraView === "follow" ? ROBOT_CAMERA : MATCH_CAMERA}
          /> : previewError ? <div className={styles.sceneLoading} role="alert">{previewError}</div> : <ViewLoading label="Loading field" />}
          {countdown !== null && <div className={styles.matchCountdown} role="status" aria-label="Match countdown" aria-live="assertive">{countdown}</div>}
          <button className={styles.fullscreenButton} type="button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <FullscreenCorners expanded={!isFullscreen} />
          </button>
        </div>

        <div id="match-menu" hidden={!panelVisible} className={`${styles.content} ${centeredPanel ? styles.centeredPanel : lifecycle === "running" ? styles.sidePanel : styles.bottomPanel}`}>
          {!game && <div className={styles.setupGrid}>
            <section className={styles.robotSummary} aria-label="Selected robot configuration">
              <div className={styles.robotSummaryCopy}>
                <strong className={styles.robotSummaryName}>{robotConfiguration.label || "Robot configuration"}</strong>
                <span className={styles.robotSummaryDetails}>
                  {robotConfiguration.motors.length} motors · {robotConfiguration.servos.length} servos · {robotConfiguration.sensors.length} sensors · {robotConfiguration.cameras.length} cameras
                </span>
              </div>
              {onConfigureRobot && <button type="button" className={styles.secondaryButton} onClick={onConfigureRobot} disabled={lifecycle === "preparing"}>
                Change robot
              </button>}
            </section>
            <label className={styles.field}>
              <span>Alliance</span>
              <select className={styles.allianceSelect} data-alliance={alliance} aria-label="Starting alliance" value={alliance} disabled={lifecycle === "preparing"} onChange={(event) => setAlliance(event.target.value as WorldAlliance)}>
                <option value="red">Red</option>
                <option value="blue">Blue</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Starting position</span>
              <select aria-label="Legal starting position" value={startPosition} disabled={lifecycle === "preparing"} onChange={(event) => setStartPosition(event.target.value as GameSimulationStartPosition)}>
                <option value="near">Near</option>
                <option value="far">Far</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Opponent difficulty</span>
              <select aria-label="Opponent difficulty" value={difficulty} disabled={lifecycle === "preparing"} onChange={(event) => setDifficulty(event.target.value as GameSimulationDifficulty)}>
                <option value="easy">Easy</option>
                <option value="balanced">Balanced</option>
                <option value="competitive">Competitive</option>
              </select>
            </label>
            <label className={`${styles.field} ${styles.opModeField}`}>
              <span>Autonomous OpMode</span>
              <select aria-label="AUTO OpMode" value={selectedAutoClass} disabled={lifecycle === "preparing"} onChange={(event) => setAutoClass(event.target.value)}>
                <option value="">None</option>
                {allianceOpModes.map((mode) => <option key={mode.className} value={mode.className}>{mode.displayName}</option>)}
              </select>
            </label>
            <label className={`${styles.field} ${styles.opModeField}`}>
              <span>TeleOp OpMode</span>
              <select aria-label="TELEOP OpMode" value={selectedTeleopClass} disabled={lifecycle === "preparing"} onChange={(event) => setTeleopClass(event.target.value)}>
                <option value="">None</option>
                {teleopOpModes.map((mode) => <option key={mode.className} value={mode.className}>{mode.displayName}</option>)}
              </select>
            </label>
          </div>}

          {game && lifecycle !== "preparing" && <div className={styles.matchBar}>
            <span className={`${styles.robotLabel} ${styles.allianceText}`} data-alliance={playerState?.alliance}><Gamepad2 aria-hidden="true" /> {playerState?.alliance === "red" ? "Red" : "Blue"}-1 · {robotConfiguration.label}</span>
            <span className={styles.rate} aria-live="polite">Simulation rate {slowFactor >= 0.98 ? "1.00×" : `${slowFactor.toFixed(2)}×`}</span>
            {lifecycle === "init" && <span className={styles.status}>INIT ready</span>}
            {lifecycle === "paused" && <span className={styles.paused}>{requestedPauseReason}</span>}
          </div>}

          {lifecycle === "preparing" && <div className={styles.preparing} role="status">
            <span className={styles.preparingIndicator} aria-hidden="true" />
            <div><strong>{preparationStatus}</strong>{buildProgress && preparationStatus === "Compiling project…" && <p className={styles.progress}>{buildProgress.message}</p>}</div>
          </div>}
          {error && <p className={`${styles.error} ${errorKind === "policy" ? styles.policyError : ""}`} role="alert"><AlertTriangle aria-hidden="true" /> <span tabIndex={0} role="region" aria-label="Match error details">{errorKind === "policy" ? "The programmed opponents are unavailable. Try again or close Game Simulation to return to your project." : error}</span></p>}

          {lifecycle === "init" && <div className={styles.initControls}>
            <p>Ready to start</p>
            <button type="button" className={styles.primaryButton} onClick={() => void startMatch()}><Play aria-hidden="true" /> Start match</button>
          </div>}

          {lifecycle === "running" && game && <div className={styles.liveControls}>
            <div className={styles.loadControl}>
              <span className={styles.controlTitle}>Human loading · <span className={styles.allianceText} data-alliance={alliance}>{alliance === "red" ? "Red" : "Blue"} NECTAR</span></span>
              <span className={styles.controlHint}>{nectarAvailability?.legalNow ?? 0} legal now · {nectarAvailability?.total ?? 0} available</span>
              <div className={styles.buttonRow}>
                <button type="button" className={styles.secondaryButton} onClick={() => humanLoad(false)} disabled={!nectarAvailability || nectarAvailability.total === 0 || nectarAvailability.legalNow === 0}>
                  Load legal NECTAR
                </button>
                {nectarAvailability && nectarAvailability.legalNow === 0 && nectarAvailability.total > 0 && <button type="button" className={styles.penaltyButton} disabled={!loadingEarly} onClick={() => humanLoad(true)}>
                  Load early · 5-point penalty
                </button>}
              </div>
              <label className={styles.checkboxLabel}><input type="checkbox" checked={loadingEarly} onChange={(event) => setLoadingEarly(event.target.checked)} /> Confirm early load that may incur the listed foul</label>
            </div>
          </div>}

          {lifecycle === "paused" && <div className={styles.initControls}>
            <p>Match paused</p>
            <button type="button" className={styles.primaryButton} onClick={resume}><Play aria-hidden="true" /> Resume safely</button>
          </div>}

          {lifecycle === "replay" && <div className={styles.replayControls}>
            <div className={styles.replayActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setReplayPlaying((value) => !value)} aria-label={replayPlaying ? "Pause replay" : "Play replay"}>
                {replayPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />} {replayPlaying ? "Pause" : "Play replay"}
              </button>
              <span>Recorded match · {replayIndex + 1} / {replayFrames}</span>
            </div>
            <label className={styles.srOnly} htmlFor="game-simulation-replay">Replay timeline</label>
            <input id="game-simulation-replay" className={styles.timeline} type="range" min={0} max={Math.max(0, replayFrames - 1)} value={replayIndex} onChange={(event) => scrubTo(Number(event.target.value))} aria-valuetext={`Recorded frame ${replayIndex + 1} of ${replayFrames}`} />
            <p className={styles.controlHint}>
              Sampled visual replay · nominally {replaySampleHz.toFixed(Number.isInteger(replaySampleHz) ? 0 : 2)} Hz · seed {replayVisual?.observation.seed ?? "—"}.
              {" "}{(journalBytes / (1024 * 1024)).toFixed(1)} MiB command/action journal{journalTruncated ? " (journal reached its 48 MiB limit)" : ""}. OpModes are not rerun.
            </p>
            <button type="button" className={styles.secondaryButton} onClick={exportReplay}>
              <Download aria-hidden="true" /> Download replay data
            </button>
          </div>}

          {(lifecycle === "results" || lifecycle === "stopped") && rules && <section className={styles.results} aria-labelledby="match-results-title">
            <div className={styles.resultHeading}>
              <div><span className={styles.resultStatus}>{lifecycle === "results" ? "Match complete" : "Match stopped"}</span><h3 id="match-results-title"><span className={styles.allianceText} data-alliance="red">Red {rules.scores.red}</span> — <span className={styles.allianceText} data-alliance="blue">{rules.scores.blue} Blue</span></h3></div>
              <span className={styles.rpSummary}>RP · <span className={styles.allianceText} data-alliance="red">Red {rules.rankingPoints.red}</span> / <span className={styles.allianceText} data-alliance="blue">Blue {rules.rankingPoints.blue}</span></span>
            </div>
            <div className={styles.scoreColumns}>
              {(["red", "blue"] as const).map((side) => <div className={styles.scoreCard} data-alliance={side} key={side}>
                <h4>{side === "red" ? "Red" : "Blue"} alliance</h4>
                {Object.entries(rules.scoreBreakdown[side]).map(([name, points]) => <div className={styles.scoreLine} key={name}><span>{name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</span><b>{points}</b></div>)}
                <div className={styles.scoreTotal}><span>Total</span><b>{rules.scores[side]}</b></div>
                <div className={styles.scoreTotal}><span>Ranking points</span><b>{rules.rankingPoints[side]}</b></div>
              </div>)}
            </div>
            {(rules.fouls.length > 0 || rules.refereeReviews.length > 0) && <details className={styles.refereeDetails}><summary>Fouls and referee review ({rules.fouls.length + rules.refereeReviews.length})</summary>
              <ul>{rules.fouls.map((foul, index) => <li key={`${foul.timestampMs}-${foul.ruleId}-${index}`}>{foul.ruleId} · {foul.points} points · {foul.detail}</li>)}{rules.refereeReviews.map((review, index) => <li key={`${review.timestampMs}-${review.ruleId}-${index}`}>{review.ruleId} · referee review · {review.detail}</li>)}</ul>
            </details>}
            <MatchRefereePanel adjustments={rules.refereeAdjustments} onApply={recordRefereeDecision} />
          </section>}
          {(lifecycle === "setup" || lifecycle === "failed") && <div className={styles.setupActions}>
            <button type="button" className={styles.primaryButton} onClick={() => void initialize()}><Play aria-hidden="true" /> {lifecycle === "failed" ? "Try again" : "Initialize match"}</button>
          </div>}
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerLeft}>
            <div className={styles.cameraViews} role="group" aria-label="Camera view">
              {(["field", "driver", "follow"] as const).map((view) => <button key={view} type="button" aria-pressed={cameraView === view} onClick={() => setCameraView(view)}>{view === "follow" ? "Robot" : view === "driver" ? "Driver" : "Field"}</button>)}
            </div>
            <span className={styles.cameraHint}>{cameraView === "driver" ? `${alliance === "red" ? "Red" : "Blue"} driver station` : cameraView === "follow" ? "Following your robot" : "Drag to orbit · Scroll to zoom"}</span>
          </div>
          <div className={styles.footerRight}>
            {lifecycle === "running" && <>
              <button type="button" className={styles.secondaryButton} onClick={() => humanLoad(false)} disabled={!nectarAvailability || nectarAvailability.total === 0 || nectarAvailability.legalNow === 0}>Load NECTAR{nectarAvailability ? ` · ${nectarAvailability.legalNow}` : ""}</button>
              <button type="button" className={styles.secondaryButton} onClick={() => void pauseForSafety("Paused by the driver.")}><Pause aria-hidden="true" /> Pause</button>
            </>}
            {game && replayFrames > 1 && (lifecycle === "results" || lifecycle === "stopped") && <button type="button" className={styles.secondaryButton} onClick={beginReplay} aria-label="Review match replay"><Play aria-hidden="true" /> Replay</button>}
            {(lifecycle === "stopped" || lifecycle === "results") && <button type="button" className={styles.secondaryButton} onClick={() => void restart()}><RotateCcw aria-hidden="true" /> Restart</button>}
            {lifecycle === "init" && <button type="button" className={styles.secondaryButton} onClick={() => void stopMatch()}><Square aria-hidden="true" /> Cancel</button>}
            {(lifecycle === "running" || lifecycle === "paused") && <button type="button" className={styles.stopButton} onClick={() => void stopMatch()}><Square aria-hidden="true" /> Stop</button>}
            {lifecycle === "replay" && <button type="button" className={styles.secondaryButton} onClick={exitReplay}><X aria-hidden="true" /> Exit replay</button>}
          </div>
        </footer>
        {touchRegistry && lifecycle === "running" && !menuOpen && <div className={styles.touchControls}>
          <TouchGamepad registry={touchRegistry} active={lifecycle === "running" && !menuOpen} />
        </div>}
        <span className={styles.calibration}>Physics unvalidated{game && lifecycle === "running" && slowFactor < 0.98 ? ` · ${slowFactor.toFixed(2)}× speed` : ""}</span>
      </section>
    </div>
  );
}
