import type {
  BuildJobProgress,
  LoadArtifact,
  SimulationFrame,
  WorldRobotSensorFrame,
} from "@ftc-studio/opmode-protocol";
import type { OpModeSession } from "@/lib/opmode-session";
import { shouldIssueRuntimeTick } from "@/lib/runtime-cadence";

type ProgramSelection = { autonomous: string; teleop: string };
type PrepareProgram = (options?: {
  onBuildProgress?: (progress: BuildJobProgress) => void;
  onStatus?: (message: string) => void;
}) => Promise<{ session: OpModeSession; artifact: LoadArtifact }>;
type HandoffProgram = (
  session: OpModeSession,
  entryClass: string,
  sensors: WorldRobotSensorFrame,
) => Promise<SimulationFrame>;

/** Owns the optional player program; the match clock and bots run independently. */
export class GameSimulationProgram {
  private session: OpModeSession | null = null;
  private activePhase: "auto" | "teleop" | null = null;
  private closed = false;
  private readonly pendingTicks = new Set<Promise<void>>();
  private latestFrame: SimulationFrame | null = null;
  private tickFailure: unknown = null;
  private tickGeneration = 0;
  private lastSensorTime = -1;
  private keepAlivePending = false;
  private lastKeepAliveAt = -Infinity;

  constructor(
    private readonly selection: ProgramSelection,
    private readonly prepareProgram: PrepareProgram,
    private readonly handoffProgram?: HandoffProgram,
  ) {}

  async initialize(
    sensors: WorldRobotSensorFrame,
    onBuildProgress?: (progress: BuildJobProgress) => void,
    onStatus?: (message: string) => void,
  ): Promise<void> {
    if (this.closed || (!this.selection.autonomous && !this.selection.teleop)) return;
    const prepared = await this.prepareProgram({ onBuildProgress, onStatus });
    if (this.closed) {
      await prepared.session.close();
      return;
    }
    this.session = prepared.session;
    for (const entryClass of [this.selection.autonomous, this.selection.teleop].filter(Boolean)) {
      const mode = prepared.artifact.opModes.find((mode) => mode.className === entryClass);
      if (!mode) throw new Error("The selected OpMode is not present in the current build. Build the project, then select an available entry.");
      if (mode.runtimeSupported === false) {
        const detail = mode.runtimeDiagnostics?.find((diagnostic) => diagnostic.kind === "error")?.message;
        throw new Error(`${mode.displayName} compiled, but the simulator cannot run it${detail ? `: ${detail}` : "."}`);
      }
    }
    // A TELEOP-only session stays loaded without constructing its OpMode until
    // the handoff boundary, so its init cannot act on the autonomous field.
    if (this.selection.autonomous) {
      await this.session.init(this.selection.autonomous, sensors);
      this.lastSensorTime = sensors.simulationTimeMs;
      this.activePhase = "auto";
    }
  }

  async startAutonomous(): Promise<SimulationFrame | null> {
    await this.pauseTicks();
    return this.selection.autonomous ? this.requireSession().transition("start") : null;
  }

  async startTeleop(sensors: WorldRobotSensorFrame): Promise<SimulationFrame | null> {
    if (!this.selection.teleop) return null;
    await this.pauseTicks();
    const session = this.requireSession();
    if (this.selection.autonomous) {
      if (this.handoffProgram) await this.handoffProgram(session, this.selection.teleop, sensors);
      else await session.handoff({ entryClass: this.selection.teleop, sensors });
    } else {
      await session.init(this.selection.teleop, sensors);
    }
    this.activePhase = "teleop";
    this.lastSensorTime = sensors.simulationTimeMs;
    return session.transition("start");
  }

  async tick(
    mode: "init" | "auto" | "teleop",
    input: Parameters<OpModeSession["tick"]>[0],
  ): Promise<SimulationFrame | null> {
    const entryClass = mode === "teleop" ? this.selection.teleop : this.selection.autonomous;
    if (!entryClass) {
      await this.keepAlive();
      return null;
    }
    return this.requireSession().tick(input);
  }

  async stop(): Promise<void> {
    await this.pauseTicks();
    if (!this.activePhase) return;
    await this.requireSession().transition("stop");
    this.activePhase = null;
  }

  async keepAlive(): Promise<void> {
    await this.session?.keepAlive();
  }

  pollKeepAlive(): void {
    if (this.tickFailure) throw this.tickFailure;
    if (this.keepAlivePending || performance.now() - this.lastKeepAliveAt < 1000) return;
    const generation = this.tickGeneration;
    this.lastKeepAliveAt = performance.now();
    this.keepAlivePending = true;
    void this.keepAlive().catch((error) => {
      if (!this.closed && this.tickGeneration === generation) this.tickFailure = error;
    }).finally(() => { this.keepAlivePending = false; });
  }

  /** Sample completed commands without making the field wait for the network. */
  poll(mode: "init" | "auto" | "teleop", input: Parameters<OpModeSession["tick"]>[0]): SimulationFrame | null {
    if (this.tickFailure) throw this.tickFailure;
    const entryClass = mode === "teleop" ? this.selection.teleop : this.selection.autonomous;
    const generation = this.tickGeneration;
    if (!entryClass) {
      this.pollKeepAlive();
      return null;
    }
    const frame = this.latestFrame;
    this.latestFrame = null;
    const sensorTime = input.sensors && "simulationTimeMs" in input.sensors ? input.sensors.simulationTimeMs : input.sequence * 20;
    if (shouldIssueRuntimeTick(this.pendingTicks.size) && sensorTime > this.lastSensorTime) {
      this.lastSensorTime = sensorTime;
      const request = this.requireSession().tick(input).then((next) => {
        if (!this.closed && this.tickGeneration === generation) this.latestFrame = next;
      }).catch((error) => {
        if (!this.closed && this.tickGeneration === generation) this.tickFailure = error;
      }).finally(() => { this.pendingTicks.delete(request); });
      this.pendingTicks.add(request);
    }
    return frame;
  }

  async pauseTicks(): Promise<void> {
    this.tickGeneration++;
    this.latestFrame = null;
    await Promise.all(this.pendingTicks);
    if (this.tickFailure) throw this.tickFailure;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.tickGeneration++;
    this.latestFrame = null;
    this.activePhase = null;
    const session = this.session;
    this.session = null;
    await session?.close();
  }

  private requireSession(): OpModeSession {
    if (!this.session || this.closed) throw new Error("The match lost its active JVM session.");
    return this.session;
  }
}
