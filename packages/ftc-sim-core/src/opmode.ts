import { DeterministicClock } from "./clock.js";
import { Gamepad } from "./gamepad.js";
import { HardwareMap } from "./hardware-map.js";
import { Telemetry } from "./telemetry.js";

export enum OpModeState {
  IDLE = "IDLE",
  INIT = "INIT",
  RUNNING = "RUNNING",
  STOPPED = "STOPPED",
}

type MaybePromise = void | Promise<void>;

/**
 * Base class for an iterative FTC-style OpMode. `initLoop()` deliberately uses camel case in
 * TypeScript; `init_loop()` is retained as a compatibility alias.
 */
export abstract class OpMode {
  hardwareMap!: HardwareMap;
  telemetry!: Telemetry;
  gamepad1!: Gamepad;
  gamepad2!: Gamepad;

  private runner: OpModeRunner | undefined;
  private runtimeOriginMs = 0;

  abstract init(): MaybePromise;

  initLoop(): MaybePromise {
    // Optional in the FTC API.
  }

  init_loop(): MaybePromise {
    return this.initLoop();
  }

  start(): MaybePromise {
    // Optional in the FTC API.
  }

  abstract loop(): MaybePromise;

  stop(): MaybePromise {
    // Optional in the FTC API.
  }

  getRuntime(): number {
    return this.runner === undefined ? 0 : (this.runner.clock.nowMs - this.runtimeOriginMs) / 1_000;
  }

  resetRuntime(): void {
    if (this.runner !== undefined) this.runtimeOriginMs = this.runner.clock.nowMs;
  }

  requestOpModeStop(): void {
    this.runner?.requestStop();
  }

  /** @internal Used by OpModeRunner when loading a mode. */
  bindRuntime(runner: OpModeRunner): void {
    this.runner = runner;
    this.hardwareMap = runner.hardwareMap;
    this.telemetry = runner.telemetry;
    this.gamepad1 = runner.gamepad1;
    this.gamepad2 = runner.gamepad2;
    this.runtimeOriginMs = runner.clock.nowMs;
  }

  /** @internal */
  setRuntimeOrigin(nowMs: number): void {
    this.runtimeOriginMs = nowMs;
  }

  /** @internal */
  getRunner(): OpModeRunner | undefined {
    return this.runner;
  }
}

/**
 * Async TypeScript analogue of FTC's LinearOpMode. User code awaits start and simulated sleep
 * instead of blocking the Java OpMode thread.
 */
export abstract class LinearOpMode extends OpMode {
  abstract runOpMode(): Promise<void> | void;

  override init(): void {
    // Linear OpModes do their initialization inside runOpMode.
  }

  override loop(): void {
    // The async runOpMode task owns the lifecycle.
  }

  waitForStart(): Promise<void> {
    const runner = this.getRunner();
    if (runner === undefined) return Promise.reject(new Error("OpMode has not been loaded"));
    return runner.waitForStart();
  }

  sleep(milliseconds: number): Promise<void> {
    const runner = this.getRunner();
    if (runner === undefined) return Promise.reject(new Error("OpMode has not been loaded"));
    return runner.sleep(milliseconds);
  }

  idle(): Promise<void> {
    const runner = this.getRunner();
    if (runner === undefined) return Promise.reject(new Error("OpMode has not been loaded"));
    return runner.sleep(runner.clock.stepMs);
  }

  opModeIsActive(): boolean {
    return this.getRunner()?.state === OpModeState.RUNNING && !this.getRunner()?.isStopRequested;
  }

  opModeInInit(): boolean {
    return this.getRunner()?.state === OpModeState.INIT && !this.getRunner()?.isStopRequested;
  }

  isStarted(): boolean {
    return this.getRunner()?.state === OpModeState.RUNNING;
  }

  isStopRequested(): boolean {
    return this.getRunner()?.isStopRequested ?? true;
  }
}

export interface OpModeRunnerOptions {
  clock: DeterministicClock;
  hardwareMap?: HardwareMap;
  telemetry?: Telemetry;
  gamepad1?: Gamepad;
  gamepad2?: Gamepad;
}

interface Sleeper {
  wakeAtMs: number;
  resolve: () => void;
}

/**
 * Explicit state machine for loading and driving a single OpMode. All visible state changes are
 * performed by the caller, which keeps recordings/replays deterministic.
 */
export class OpModeRunner {
  readonly clock: DeterministicClock;
  readonly hardwareMap: HardwareMap;
  readonly telemetry: Telemetry;
  readonly gamepad1: Gamepad;
  readonly gamepad2: Gamepad;

  private mode: OpMode | undefined;
  private startWaiters: Array<() => void> = [];
  private sleepers: Sleeper[] = [];
  private pendingStop = false;
  private linearTask: Promise<void> | undefined;
  private clockUnsubscribe: () => void;
  private _state = OpModeState.IDLE;
  private _lastError: unknown;

  constructor(options: OpModeRunnerOptions) {
    this.clock = options.clock;
    this.hardwareMap = options.hardwareMap ?? new HardwareMap();
    this.telemetry = options.telemetry ?? new Telemetry(this.clock);
    this.gamepad1 = options.gamepad1 ?? new Gamepad();
    this.gamepad2 = options.gamepad2 ?? new Gamepad();
    this.clockUnsubscribe = this.clock.onTick(() => this.resolveDueSleepers());
  }

  get state(): OpModeState {
    return this._state;
  }

  get isStopRequested(): boolean {
    return this.pendingStop || this._state === OpModeState.STOPPED;
  }

  get lastError(): unknown {
    return this._lastError;
  }

  get activeOpMode(): OpMode | undefined {
    return this.mode;
  }

  load(mode: OpMode): void {
    if (this._state === OpModeState.INIT || this._state === OpModeState.RUNNING) {
      throw new Error("Stop the active OpMode before loading another one");
    }
    this.mode = mode;
    this.mode.bindRuntime(this);
    this.pendingStop = false;
    this._lastError = undefined;
    this._state = OpModeState.IDLE;
  }

  async init(): Promise<void> {
    const mode = this.requireMode();
    if (this._state !== OpModeState.IDLE && this._state !== OpModeState.STOPPED) {
      throw new Error(`Cannot initialize an OpMode in ${this._state}`);
    }

    this.pendingStop = false;
    this._lastError = undefined;
    this.gamepad1.resetEdgeDetection();
    this.gamepad2.resetEdgeDetection();
    this.hardwareMap.resetDevicesForOpMode();
    mode.setRuntimeOrigin(this.clock.nowMs);
    this._state = OpModeState.INIT;
    await mode.init();
    this.telemetry.update();

    if (mode instanceof LinearOpMode) this.startLinearTask(mode);
  }

  async start(): Promise<void> {
    const mode = this.requireMode();
    if (this._state !== OpModeState.INIT) {
      throw new Error(`Cannot start an OpMode in ${this._state}`);
    }

    this.gamepad1.resetEdgeDetection();
    this.gamepad2.resetEdgeDetection();
    mode.setRuntimeOrigin(this.clock.nowMs);
    this._state = OpModeState.RUNNING;
    for (const resolve of this.startWaiters.splice(0)) resolve();
    if (!(mode instanceof LinearOpMode)) await mode.start();
    this.telemetry.update();
  }

  /** Advances the fixed-step clock and invokes the correct iterative callback at each step. */
  async tick(steps = 1): Promise<void> {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new RangeError("steps must be a non-negative integer");
    }

    for (let index = 0; index < steps; index += 1) {
      this.clock.step();
      if (this.pendingStop) {
        await this.stop();
        continue;
      }

      const mode = this.mode;
      if (mode === undefined || mode instanceof LinearOpMode) {
        this.telemetry.update();
        continue;
      }
      if (this._state === OpModeState.INIT) await mode.init_loop();
      if (this._state === OpModeState.RUNNING) await mode.loop();
      this.telemetry.update();
    }
  }

  async stop(): Promise<void> {
    if (this._state === OpModeState.STOPPED) return;

    const mode = this.mode;
    this.pendingStop = true;
    this._state = OpModeState.STOPPED;
    for (const resolve of this.startWaiters.splice(0)) resolve();
    for (const sleeper of this.sleepers.splice(0)) sleeper.resolve();
    if (mode !== undefined) await mode.stop();
    this.telemetry.update();
    this.hardwareMap.stopDevicesForOpMode();
  }

  requestStop(): void {
    this.pendingStop = true;
  }

  waitForStart(): Promise<void> {
    if (this._state === OpModeState.RUNNING || this._state === OpModeState.STOPPED) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.startWaiters.push(resolve));
  }

  sleep(milliseconds: number): Promise<void> {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      return Promise.reject(new RangeError("sleep duration must be a finite non-negative number"));
    }
    if (this._state === OpModeState.STOPPED) return Promise.resolve();
    if (milliseconds === 0) return Promise.resolve();

    const wakeAtMs = this.clock.nowMs + milliseconds;
    return new Promise((resolve) => this.sleepers.push({ wakeAtMs, resolve }));
  }

  close(): void {
    this.clockUnsubscribe();
  }

  private requireMode(): OpMode {
    if (this.mode === undefined) throw new Error("No OpMode has been loaded");
    return this.mode;
  }

  private resolveDueSleepers(): void {
    const remaining: Sleeper[] = [];
    for (const sleeper of this.sleepers) {
      if (sleeper.wakeAtMs <= this.clock.nowMs) sleeper.resolve();
      else remaining.push(sleeper);
    }
    this.sleepers = remaining;
  }

  private startLinearTask(mode: LinearOpMode): void {
    this.linearTask = Promise.resolve()
      .then(() => mode.runOpMode())
      .then(() => {
        if (this._state === OpModeState.INIT || this._state === OpModeState.RUNNING) this.requestStop();
      })
      .catch((error: unknown) => {
        this._lastError = error;
        this.requestStop();
      });
  }
}
