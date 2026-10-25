"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bot, UserRound, ZoomIn, ZoomOut, RotateCcw, RotateCw } from "lucide-react";
import { SimulationWorld, type SimulationWorldOptions, type WorldObservation } from "@ftc-studio/sim-core";
import { createLegacyWorldOptions } from "@/lib/legacy-world-field";
import { createBiobuzzWorldOptions } from "@/lib/biobuzz-world-field";
import { toRunnerWorldSensorFrame } from "@/lib/world-sensor-runner-frame";
import type { SimulatorActuatorFrame, SimulatorHardwareFrame } from "@/lib/runtime-types";
import { advanceBrowserPhysics } from "@/lib/browser-physics-stepper";
import { createBrowserLoopPacer } from "@/lib/browser-loop-scheduler";
import { RealtimePhysicsClock } from "@/lib/realtime-physics-clock";
import { PHYSICS_SUBSTEPS_PER_CONTROL_TICK } from "@/lib/runtime-cadence";
import type { RobotSimulatorProps } from "./robot-simulator";
import { SharedWorldScene } from "./shared-world-scene";
import { preloadFieldVisuals } from "./world-visual-assets";
import { ViewLoading } from "@/components/view-loading";
import { GamepadControlsHelp } from "./gamepad-controls-guide";
import { useSimulatorFullscreen } from "./use-simulator-fullscreen";
import styles from "./world-simulator.module.css";
import { SimulatorCameraFrames, type SimulatorCameraCapture } from "@/lib/simulator-camera";
import { SimulatorCameraPreview } from "./simulator-camera-preview";

function applyFrame(world: SimulationWorld, frame: SimulatorActuatorFrame, sequence: number, robotId: "red-1" | "blue-1") {
  world.enqueue({ robotId, tick: world.tick, sequence,
    motors: Object.fromEntries(Object.entries(frame.motors).map(([name, motor]) => [name, { ...motor, ...(motor.velocitySetpointTicksPerSecond == null ? {} : { velocitySetpoint: motor.velocitySetpointTicksPerSecond }) }])),
    servos: frame.servos ?? {}, source: "opmode",
  });
}

export function WorldSimulator(props: RobotSimulatorProps) {
  const { state, resetSignal, actuatorStore, tickBudget, robotConfiguration, fieldPreset, fieldParameters } = props;
  const seed = props.worldSetup?.seed ?? 2026;
  const alliance = props.worldSetup?.alliance ?? "red";
  const startPosition = props.worldSetup?.startPosition ?? "near";
  const playerRobot = fieldPreset === "biobuzz-2026-2027" && alliance === "blue" ? "blue-1" : "red-1";
  const worldRef = useRef<SimulationWorld | null>(null);
  const observation = useRef<WorldObservation | null>(null);
  const [cameraFrames] = useState(() => new SimulatorCameraFrames());
  const captureCamera = useCallback<SimulatorCameraCapture>((id, frame, latency) => cameraFrames.accept(id, frame, latency), [cameraFrames]);
  const cameraFrameRequested = useCallback((robotId: string, camera: string) => cameraFrames.needsCapture(
    robotId, camera, actuatorStore.getSnapshot()?.cameraFrameRequests,
  ), [cameraFrames, actuatorStore]);
  const latestProps = useRef(props);
  useLayoutEffect(() => { latestProps.current = props; }, [props]);
  const [options, setOptions] = useState<SimulationWorldOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [cameraMode, setCameraMode] = useState<"field" | "follow" | "driver">(props.initialCamera ?? "field");
  const [cameraSettings, setCameraSettings] = useState({ azimuth: Math.PI / 4, elevation: 0.7, distance: 7.5 });
  const [parameterRevision, setParameterRevision] = useState(0);
  const passiveRemainder = useRef(0);
  const reportAt = useRef(0);
  const speedWindow = useRef({ wall: 0, simulation: 0 });
  const focused = useRef<HTMLDivElement>(null);
  const simulator = useRef<HTMLElement>(null);
  const { isFullscreen, toggleFullscreen } = useSimulatorFullscreen(simulator);

  const publish = useCallback((world: SimulationWorld, sequence: number) => {
    const next = world.observe(); observation.current = next;
    const robot = next.robots.find((robot) => robot.id === playerRobot)!;
    const sensors = robot.sensors;
    const hardware: SimulatorHardwareFrame = {
      sequence, simulationTimeMs: world.simulationTimeMs,
      pose: { xMeters: robot.position.x, yMeters: -robot.position.z, headingRadians: sensors.orientation.yawRadians },
      chassisVelocity: { xMetersPerSecond: robot.linearVelocity.x, yMetersPerSecond: -robot.linearVelocity.z, angularRadiansPerSecond: robot.angularVelocity.y },
      motors: Object.fromEntries(Object.entries(sensors.motors).map(([name, motor]) => [name, { currentPosition: motor.positionTicks, velocityTicksPerSecond: motor.velocityTicksPerSecond, currentAmps: motor.currentAmps, enabled: motor.enabled }])),
      sensors: { ...toRunnerWorldSensorFrame(sensors), cameraFrames: cameraFrames.read(playerRobot, world.simulationTimeMs) },
    };
    latestProps.current.onHardwareFrame(hardware);
    if (world.tick - reportAt.current >= 20 || reportAt.current === 0) {
      reportAt.current = world.tick;
      latestProps.current.onTelemetry({ x: robot.position.x, z: robot.position.z, heading: sensors.orientation.yawRadians * 180 / Math.PI, velocity: Math.hypot(robot.linearVelocity.x, robot.linearVelocity.z), loopHz: 200 });
    }
  }, [playerRobot, cameraFrames]);

  useEffect(() => {
    let cancelled = false;
    observation.current = null; tickBudget.reset(); passiveRemainder.current = 0; reportAt.current = 0;
    cameraFrames.clear();
    preloadFieldVisuals(fieldPreset);
    speedWindow.current = { wall: performance.now(), simulation: 0 };
    const create = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true); setError(null); setOptions(null);
      const [next] = await Promise.all([
        fieldPreset === "biobuzz-2026-2027"
          ? createBiobuzzWorldOptions({ seed, alliance, startPosition, robotConfiguration: robotConfiguration.physical })
          : createLegacyWorldOptions(fieldPreset, robotConfiguration.physical),
        SimulationWorld.preload(),
      ]);
      next.parameters = fieldParameters;
      const world = await SimulationWorld.create(next);
      if (cancelled) { world.dispose(); return; }
      worldRef.current = world; world.setPowered(false);
      const latency = Math.max(0, ...next.robots.flatMap((robot) => [...robot.configuration.sensors, ...robot.configuration.cameras].map((sensor) => sensor.latencyMs)));
      await advanceBrowserPhysics(Math.ceil(latency / 20) * 4 + 4, () => { world.step(1); }, { isCurrent: () => !cancelled });
      if (cancelled) return;
      publish(world, -1); setOptions(next); setLoading(false);
    };
    void create().catch((failure: unknown) => {
      if (cancelled) return;
      const message = failure instanceof Error ? failure.message : "The field could not load.";
      setError(message); setLoading(false);
      latestProps.current.onFieldError?.(message);
    });
    return () => { cancelled = true; tickBudget.reset(); worldRef.current?.dispose(); worldRef.current = null; };
  // Recreate the world when manifest-backed physical settings change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldPreset, fieldParameters, resetSignal, robotConfiguration.configurationHash, parameterRevision, publish, tickBudget, seed, alliance, startPosition]);

  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    world.setPowered(state === "ready" || state === "running");
  }, [state, options]);

  useEffect(() => {
    const world = worldRef.current;
    if (!world || !options) return;
    let cancelled = false;
    let lastFrameAt = performance.now();
    const clock = new RealtimePhysicsClock();
    const pace = createBrowserLoopPacer(20);
    let commandSequence = 0;
    const isCurrent = () => !cancelled && worldRef.current === world;
    const run = async () => {
      while (isCurrent()) {
        const beganAt = performance.now();
        const delta = (beganAt - lastFrameAt) / 1000;
        lastFrameAt = beganAt;
        const current = latestProps.current;
        if (!current.paused && (!document.hidden || current.runInBackground) && (current.visible !== false || current.simulateWhileHidden) && current.state !== "idle") {
          const running = current.state === "ready" || current.state === "running";
          if (running) {
            // Physics owns its clock; remote commands update demand. Waiting
            // for a network round trip here turns 120 ms latency into 16% speed.
            const ticksDue = current.controlDriven ? Math.min(1, tickBudget.size()) : clock.consume(delta);
            for (let ticks = ticksDue; ticks > 0; ticks--) {
              const sequences = tickBudget.consumeSequences(current.controlDriven ? 1 : Infinity);
              const frame = actuatorStore.getSnapshot();
              if (frame) applyFrame(world, frame, ++commandSequence, playerRobot);
              await advanceBrowserPhysics(PHYSICS_SUBSTEPS_PER_CONTROL_TICK, () => { world.step(1); }, { isCurrent });
              if (!isCurrent()) return;
              publish(world, sequences.at(-1) ?? -1);
              for (const sequence of sequences) tickBudget.acknowledge(sequence);
            }
          } else {
            clock.reset();
            passiveRemainder.current += delta;
            // Retain elapsed time while bounding each browser task. Rendering
            // never grants or discards physical simulation steps.
            const ticks = Math.min(4, Math.floor(passiveRemainder.current * 200));
            if (ticks) {
              passiveRemainder.current -= ticks / 200;
              await advanceBrowserPhysics(ticks, () => { world.step(1); }, { isCurrent });
              if (!isCurrent()) return;
              publish(world, -1);
            }
          }
          const now = performance.now();
          if (now - speedWindow.current.wall >= 1000) {
            setSpeed((world.simulationTimeMs - speedWindow.current.simulation) / (now - speedWindow.current.wall));
            speedWindow.current = { wall: now, simulation: world.simulationTimeMs };
          }
        } else {
          clock.reset();
          // An idle preview and an explicitly hidden view consume no simulation time.
          speedWindow.current = { wall: beganAt, simulation: world.simulationTimeMs };
        }
        await pace();
      }
    };
    void run().catch((failure: unknown) => {
      if (!isCurrent()) return;
      tickBudget.reset();
      const message = failure instanceof Error ? failure.message : "The simulation could not advance.";
      setError(message);
      latestProps.current.onFieldError?.(message);
    });
    return () => { cancelled = true; };
  }, [actuatorStore, options, publish, tickBudget, playerRobot]);

  return <section ref={simulator} className={`simulator${isFullscreen ? " is-fullscreen" : ""}${props.touchControls ? " has-touch-controls" : ""}`} aria-label="Robot Simulator">
    <div ref={focused} className="simulator__canvas" tabIndex={0} aria-label="Robot field. Focus here for keyboard gamepad controls." onPointerDown={(event) => { if (!(event.target instanceof Element) || !event.target.closest("input, button, select, textarea, summary, a[href]")) event.currentTarget.focus(); }}>
      {loading && <ViewLoading label="Loading field" overlay />}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setParameterRevision((value) => value + 1)}>Retry field</button></div>}
      <SimulatorCameraPreview frames={cameraFrames} robotId={playerRobot} cameras={robotConfiguration.physical.cameras} />
      {options && (props.visible !== false || (props.simulateWhileHidden && robotConfiguration.physical.cameras.length > 0)) && <SharedWorldScene key={`${fieldPreset}-${resetSignal}-${parameterRevision}-${robotConfiguration.configurationHash}`} observation={observation} robots={options.robots} onCameraFrame={captureCamera} cameraFrameRequested={cameraFrameRequested} playerRobot={playerRobot} view={cameraMode} cameraSettings={cameraSettings} fieldPreset={fieldPreset} animate={state !== "idle"} theme={props.theme} assetExport={props.assetExport} />}
      {props.showControls !== false && <button className="simulator__fullscreen-toggle" type="button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
        <FullscreenCorners expanded={!isFullscreen} />
      </button>}
      {isFullscreen && props.fullscreenControls && <div className="simulator__run-controls">
        {props.fullscreenControls}
      </div>}
      {props.showControls !== false && props.compactControls && <details className={styles.viewControls}>
        <summary>View</summary>
        <div className={styles.viewPanel}>
          <label>Camera<select aria-label="Camera view" value={cameraMode} onChange={(event) => setCameraMode(event.target.value as "field" | "follow" | "driver")}>
            <option value="field">Field</option><option value="follow">Robot</option><option value="driver">Driver</option>
          </select></label>
          {cameraMode === "field" && <div className={styles.cameraActions} role="group" aria-label="Camera controls">
            <button type="button" onClick={() => setCameraSettings((value) => ({ ...value, azimuth: value.azimuth - Math.PI / 8 }))}>Orbit left</button>
            <button type="button" onClick={() => setCameraSettings((value) => ({ ...value, azimuth: value.azimuth + Math.PI / 8 }))}>Orbit right</button>
            <button type="button" onClick={() => setCameraSettings((value) => ({ ...value, distance: Math.max(0.6, value.distance - 0.5) }))}>Zoom in</button>
            <button type="button" onClick={() => setCameraSettings((value) => ({ ...value, distance: Math.min(8, value.distance + 0.5) }))}>Zoom out</button>
            <button type="button" onClick={() => setCameraSettings((value) => ({ ...value, elevation: value.elevation > 1 ? 0.45 : 1.3 }))}>Raise / lower view</button>
          </div>}
          <GamepadControlsHelp bindings={props.keyboardBindings} />
        </div>
      </details>}
      {props.showControls !== false && !props.compactControls && <div className="simulator__camera-views" role="group" aria-label="Camera view">
        <button className="simulator__camera-toggle" type="button" aria-label="Driver View" title="Driver View" aria-pressed={cameraMode === "driver"} onClick={() => setCameraMode((mode) => mode === "driver" ? "field" : "driver")}><UserRound aria-hidden="true" /></button>
        <button className="simulator__camera-toggle" type="button" aria-label="Robot View" title="Robot View" aria-pressed={cameraMode === "follow"} onClick={() => setCameraMode((mode) => mode === "follow" ? "field" : "follow")}><Bot aria-hidden="true" /></button>
      </div>}
      {props.touchControls && <div className={styles.touchOverlay}>{props.touchControls}</div>}
    </div>
    {props.showControls !== false && !props.compactControls && <div className="simulator__actions simulator__camera-controls" role="group" aria-label="Camera controls">
      {cameraMode === "field" && <>
      <button type="button" aria-label="Orbit left" title="Orbit left" onClick={() => setCameraSettings((value) => ({ ...value, azimuth: value.azimuth - Math.PI / 8 }))}><RotateCcw aria-hidden="true" /></button>
      <button type="button" aria-label="Orbit right" title="Orbit right" onClick={() => setCameraSettings((value) => ({ ...value, azimuth: value.azimuth + Math.PI / 8 }))}><RotateCw aria-hidden="true" /></button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => setCameraSettings((value) => ({ ...value, distance: Math.max(0.6, value.distance - 0.5) }))}><ZoomIn aria-hidden="true" /></button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => setCameraSettings((value) => ({ ...value, distance: Math.min(8, value.distance + 0.5) }))}><ZoomOut aria-hidden="true" /></button>
      <button type="button" onClick={() => setCameraSettings((value) => ({ ...value, elevation: value.elevation > 1 ? 0.45 : 1.3 }))} className="simulator__view-height">Raise / lower view</button>
      </>}
      <GamepadControlsHelp bindings={props.keyboardBindings} />
      {speed < 0.85 && (state === "running" || state === "ready") && <span>Simulation running at {Math.round(speed * 100)}% speed</span>}
    </div>}
  </section>;
}

function FullscreenCorners({ expanded }: { expanded: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {expanded ? <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" /> : <path d="M4 8V4h4m8 0h4v4M8 20H4v-4m16 0v4h-4" />}
  </svg>;
}
