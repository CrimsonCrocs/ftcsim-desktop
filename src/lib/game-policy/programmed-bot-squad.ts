import { robotLiftPosition, robotTurretAngle, type GameSimulation, type RobotId, type WorldCommand, type WorldFieldConfiguration, type WorldRobotSetup } from "@ftc-studio/sim-core";
import { decodePolicyAction, type PolicyObservationView } from "./contracts";
import { BotNavigation } from "./bot-navigation";
import { observeRobotViews } from "./game-adapter";

export const PROGRAMMED_BOT_VERSION = "biobuzz-programmed-v1";
export type BotDifficulty = "easy" | "balanced" | "competitive";
/** Skill changes controller behavior, never motor strength, scoring, or available information. */
export const BOT_DIFFICULTIES = Object.freeze({
  easy: { reactionMs: 240, speed: 0.45, acceleration: 1.1, aimError: 0.024, positionError: 0.018, recoveryMs: 2600, collectCycles: 1 },
  balanced: { reactionMs: 120, speed: 0.6, acceleration: 1.6, aimError: 0.008, positionError: 0.004, recoveryMs: 1900, collectCycles: 2 },
  competitive: { reactionMs: 40, speed: 0.7, acceleration: 2, aimError: 0.002, positionError: 0.001, recoveryMs: 1400, collectCycles: 3 },
});
interface Pose { x: number; z: number; heading: number }
type Controls = Partial<Record<"forward" | "strafe" | "yaw" | "intake" | "feeder" | "flywheel" | "lift" | "turret" | "hood" | "release" | "gate", number>>;
type Step = { name: string; target?: Pose; durationMs?: number; untilMs?: number; controls?: Controls; aiming?: boolean; precision?: boolean; timeoutMs?: number; hold?: boolean };
export interface BotStatus { robotId: RobotId; task: string; completedSteps: number; recoveries: number; payload: number }

/** One independent, seeded controller per seat. Commands use the ordinary actuator protocol. */
export class ProgrammedBotSquad {
  private bots: ProgrammedBot[] = [];
  private sequence = 0;
  private lastTick = -1;
  private seed: number;
  private poses = new Map<RobotId, { time: number; x: number; z: number; heading: number }[]>();
  private closed = false;
  constructor(game: GameSimulation, readonly difficulty: BotDifficulty) {
    if (!(difficulty in BOT_DIFFICULTIES)) throw new Error(`Unknown opponent difficulty: ${difficulty}`);
    this.seed = game.world.observe().seed;
    this.reset(game);
  }
  private reset(game: GameSimulation): void {
    this.seed = game.world.observe().seed;
    this.sequence = 0;
    this.lastTick = -1;
    this.poses.clear();
    this.bots = game.world.robotSetups.filter(setup => setup.controller === "policy")
      .map(setup => new ProgrammedBot(setup, game.world.field, this.difficulty, this.seed));
  }
  commands(game: GameSimulation): WorldCommand[] {
    if (this.closed) return [];
    if (game.world.tick < this.lastTick || game.world.observe().seed !== this.seed) this.reset(game);
    if (game.phase !== "auto" && game.phase !== "teleop") return [];
    if (game.world.tick === this.lastTick) return [];
    this.lastTick = game.world.tick;
    const views = observeRobotViews(game);
    const observed = game.world.observe();
    // These are programmed drivers: their own visible chassis pose comes from the
    // public field view, delayed by reaction time. No opponent internals are exposed.
    // FTC OpModes still receive their configured physical sensors, including odometry drift.
    for (const bot of this.bots) {
      const own = observed.robots.find(robot => robot.id === bot.setup.id)!;
      const history = this.poses.get(bot.setup.id) ?? [];
      history.push({ time: observed.simulationTimeMs, x: own.position.x, z: own.position.z, heading: own.sensors.orientation.yawRadians });
      const cutoff = observed.simulationTimeMs - BOT_DIFFICULTIES[this.difficulty].reactionMs;
      while (history.length > 1 && history[1]!.time <= cutoff) history.shift();
      this.poses.set(bot.setup.id, history);
      const visible = history[0]!;
      views[bot.setup.id] = { ...views[bot.setup.id], estimatedPose: { ...views[bot.setup.id].estimatedPose, xMeters: visible.x, zMeters: visible.z, headingRadians: visible.heading, source: "field-view" } };
    }
    return this.bots.map(bot => {
      const view = views[bot.setup.id];
      return decodePolicyAction(bot.setup.id, game.world.tick, ++this.sequence, bot.act(view), bot.setup.configuration, view.ownRobot);
    });
  }
  status(): BotStatus[] { return this.bots.map(bot => bot.status()); }
  close(): void { this.closed = true; this.bots = []; }
}

/** Feedback-driven skills and a small strategy planner; no model files or remote inference. */
export class ProgrammedBot {
  private readonly skill;
  private readonly navigation: BotNavigation;
  private route: { x: number; z: number }[] = [];
  private routeStep: Step | undefined;
  private readonly side: number;
  private readonly near: boolean;
  private readonly homeHeading: number;
  private readonly zone;
  private readonly flower;
  private readonly shot: Pose;
  private readonly bias: number;
  private steps: Step[] = [];
  private enteredAt = -1;
  private lastTime = -20;
  private lastPhase = "";
  private completedSteps = 0;
  private recoveries = 0;
  private payload = 0;
  private mode: "opening" | "cycling" | "flower" | "park" = "opening";
  private cycles = 0;
  private previous: Float32Array = new Float32Array(11);
  private stuckSince = 0;
  private progressPosition: { x: number; z: number } | undefined;
  private recoveryUntil = 0;
  private nextDecision = 0;
  private lastHiveAngle = 0;
  private nectarTarget: { id: string; x: number; z: number } | undefined;
  private pickupRetries = 0;
  private transferSawBeam = false;
  private transferStartMotor: number | undefined;
  private nectarStored = false;
  private pickupPayloadBaseline = 0;

  constructor(readonly setup: WorldRobotSetup, private readonly field: WorldFieldConfiguration, readonly difficulty: BotDifficulty, seed: number) {
    this.skill = BOT_DIFFICULTIES[difficulty];
    this.navigation = new BotNavigation(field, setup.configuration);
    this.side = setup.alliance === "red" ? -1 : 1;
    this.near = setup.position.z * -this.side > 0;
    this.homeHeading = setup.alliance === "red" ? Math.PI : 0;
    this.zone = field.loadingZones.find(zone => zone.alliance === setup.alliance)!;
    this.flower = field.flowers.find(flower => flower.position.x * this.side > 0 && flower.position.z * -this.side > 0)!;
    if (!this.zone || !this.flower || !setup.configuration.mechanisms) throw new Error(`${setup.id} requires the BIOBUZZ all-rounder and field geometry.`);
    let value = seed >>> 0;
    for (const char of setup.id) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
    this.bias = ((value % 2001) / 1000 - 1);
    this.shot = { x: this.side * 1.50, z: -this.side * 1.02, heading: setup.heading };
    this.steps = [
      { name: "Collect starting POLLEN", durationMs: 500, controls: { forward: 0.075, intake: 0.3 } },
      { name: "Store POLLEN", durationMs: 3000, controls: { intake: 0.3 } },
      { name: "Settle intake", durationMs: 20 },
    ];
    if (!this.near) this.steps.push(
      this.drive("Clear starting wall", { x: this.side * 1.1, z: setup.position.z, heading: setup.heading }),
      { name: "Yield shooting lane", untilMs: 18_000 },
      this.drive("Approach HIVE lane", { x: this.side * 1.1, z: this.shot.z, heading: this.shot.heading }),
      this.drive("Line up HIVE", this.shot),
    );
    this.steps.push(...this.shootSteps());
  }

  status(): BotStatus { return { robotId: this.setup.id, task: this.steps[0]?.name ?? this.mode, completedSteps: this.completedSteps, recoveries: this.recoveries, payload: this.payload }; }

  act(view: PolicyObservationView): Float32Array {
    if (view.robotId !== this.setup.id) throw new Error("A programmed opponent received another robot's observations.");
    const now = view.elapsedMatchMs;
    if (view.phase !== "auto" && view.phase !== "teleop") { this.previous = neutral(view, this.setup.configuration); return this.previous; }
    const dt = Math.max(0.005, Math.min(0.04, (now - this.lastTime) / 1000));
    // Match handoff pauses task timers and discards the last powered movement.
    if (this.lastPhase === "auto" && view.phase === "teleop") {
      if (this.enteredAt >= 0) this.enteredAt += Math.max(0, now - this.lastTime - 20);
      this.previous = neutral(view, this.setup.configuration);
    }
    this.lastPhase = view.phase;
    this.lastTime = now;
    this.payload = view.ownRobot.payload.length;
    const hive = view.visibleHives.find(hive => hive.alliance === this.setup.alliance);
    if (hive) this.lastHiveAngle = hive.angleRadians;
    // Leave sufficient time for a controlled retreat and PARK, including slower drivers.
    if (now >= (this.near ? 146_000 : 141_000) && this.mode !== "park") this.planPark(view);
    if (this.near && now >= 79_000 && this.mode === "cycling") this.planFlower(view);
    if (!this.steps.length) this.plan(view);
    let step = this.steps[0];
    if (!step) return neutral(view, this.setup.configuration);
    if (this.enteredAt < 0) { this.enteredAt = now; this.stuckSince = now; this.progressPosition = undefined; }
    const elapsed = now - this.enteredAt;
    if ((step.name === "Collect NECTAR" || step.name === "Store NECTAR") && view.ownRobot.sensors.digital.beam_break === false) this.nectarStored = true;
    if (step.name === "Collect NECTAR" && this.payload <= this.pickupPayloadBaseline) {
      const visible = view.visibleElements.filter(element => element.kind === "nectar" && element.alliance === this.setup.alliance)
        .map(element => ({ id: element.id, ...toField(element.relativePosition, view) }))
        .filter(point => Math.abs(point.x - this.zone.center.x) < 0.3 && Math.abs(point.z - this.zone.center.z) < 0.5)
        .sort((a, b) => Math.hypot(a.x - view.estimatedPose.xMeters, a.z - view.estimatedPose.zMeters) - Math.hypot(b.x - view.estimatedPose.xMeters, b.z - view.estimatedPose.zMeters));
      const observed = visible.find(element => element.id === this.nectarTarget?.id) ?? visible[0];
      if (observed) {
        this.nectarTarget = observed;
        const target = { x: observed.x - this.side * 0.25, z: observed.z - this.side * 0.012, heading: this.homeHeading };
        if (Math.hypot(target.x - step.target!.x, target.z - step.target!.z) > 0.01 && this.navigation.clear(target)) {
          step.target = target; this.routeStep = undefined;
        }
      }
    }
    if (step.name === "Store NECTAR" && elapsed >= 2500 && this.payload <= this.pickupPayloadBaseline && this.pickupRetries < 2 && now < 115_000) {
      this.pickupRetries++;
      this.steps.unshift(this.drive("Collect NECTAR", { x: this.zone.center.x - this.side * 0.25, z: this.zone.center.z - this.side * 0.012, heading: this.homeHeading }, { intake: 0.4 }, true));
      this.enteredAt = -1; return this.smooth(action({ intake: 0.4 }), dt);
    }
    let transferReady = false;
    if (step.name === "Transfer to lift") {
      const mechanism = this.setup.configuration.mechanisms!;
      const motor = this.setup.configuration.motors.find(motor => motor.name === mechanism.feeder.motor);
      const shaft = motor ? view.ownRobot.motors[motor.name]?.positionRadians : undefined;
      // The physical digital input is active-low: false means a ball interrupts the storage beam.
      if (view.ownRobot.sensors.digital.beam_break === false) {
        this.transferSawBeam = true;
      }
      if (motor && this.transferSawBeam && view.ownRobot.sensors.digital.beam_break === true && shaft !== undefined) {
        this.transferStartMotor ??= shaft;
        const beltTravel = this.transferStartMotor === undefined ? 0 : Math.abs(shaft - this.transferStartMotor) / (motor.reduction * (mechanism.feeder.reduction ?? 1)) * mechanism.feeder.speedMetersPerSecond / (2 * Math.PI * 5.2);
        // Measure from the beam clearing, rather than its first interruption:
        // the latter varies with the pickup depth. Carry the ball onto the lip,
        // then brake the coupled rollers and raise immediately.
        transferReady = beltTravel >= 0.025;
      }
    }
    const pose = view.estimatedPose;
    const reached = !step.hold && step.target && Math.hypot(step.target.x - pose.xMeters, step.target.z - pose.zMeters) < (step.precision ? 0.006 : 0.035)
      && Math.abs(wrap(step.target.heading - pose.headingRadians)) < (step.precision ? 0.008 : 0.035);
    const transferTimedOut = step.name === "Transfer to lift" && elapsed >= (step.durationMs ?? 5000) && !transferReady;
    if (transferTimedOut) {
      this.recoveries++;
      this.planPark(view);
      return this.smooth(neutral(view, this.setup.configuration), dt);
    }
    const complete = (step.name === "Transfer to lift" ? transferReady : ((step.name === "Collect NECTAR" || step.name === "Recover floor element") ? reached && this.payload > this.pickupPayloadBaseline && elapsed >= 500 : reached) || (step.durationMs !== undefined && elapsed >= step.durationMs))
      || (step.untilMs !== undefined && now >= step.untilMs);
    if (complete) {
      if ((step.name === "Store NECTAR" && !this.nectarStored) || (step.name === "Raise lift" && this.payload === 0)) { this.planPark(view); return this.smooth(neutral(view, this.setup.configuration), dt); }
      this.steps.shift(); this.completedSteps++; this.enteredAt = -1;
      this.progressPosition = undefined;
      if (!this.steps.length) this.plan(view);
      step = this.steps[0];
      if (!step) return neutral(view, this.setup.configuration);
      this.enteredAt = now;
    }
    // A failed approach abandons its goal and replans; never advances a scoring macro at a wrong pose.
    if (step.target && !step.hold && now - this.enteredAt > (step.timeoutMs ?? 18_000)) {
      this.recoveries++;
      this.steps = []; this.enteredAt = -1;
      if (this.mode === "flower" || this.mode === "park") this.planPark(view); else this.plan(view);
      return this.smooth(neutral(view, this.setup.configuration), dt);
    }
    let controls: Controls = { ...step.controls };
    // Payload begins at the intake mouth. Keep feeding gently until the storage
    // beam confirms the ball is inside before reversing it onto the lift.
    if (step.name === "Store NECTAR" || (step.name === "Collect NECTAR" && (this.payload > this.pickupPayloadBaseline || this.nectarStored))) {
      controls.intake = this.nectarStored ? 0 : 0.15;
      controls.feeder = this.nectarStored ? 0 : 0.15;
    }
    if (step.name === "Recover floor element" && this.payload > this.pickupPayloadBaseline) {
      controls.intake = 0;
      controls.feeder = 0;
    }
    if (this.mode === "park" && step.name !== "Retreat to parking corridor") controls.lift = view.ownRobot.mechanism.liftHeight > 0.003 ? -0.8 : 0;
    if (step.aiming) controls = { ...controls, ...this.aim(view) };
    if (step.name === "Release NECTAR") {
      const lift = this.setup.configuration.mechanisms!.lift;
      controls.lift = clamp((lift.maximumTravel * (lift.axis?.y ?? 1) - view.ownRobot.mechanism.liftHeight) * 8, -0.8, 0.8);
    }
    if (step.target) controls = { ...controls, ...this.driveControls(view, step, now) };
    // Briefly reverse a jammed feeder using the actual mechanism, then retry.
    if (step.name === "Feed HIVE" && view.ownRobot.mechanism.jammed && (controls.feeder ?? 0) > 0 && Math.floor(now / 500) % 3 === 0) controls.feeder = -0.2;
    return this.smooth(action(controls), dt);
  }

  private drive(name: string, target: Pose, controls?: Controls, precision = false): Step { return { name, target, controls, precision }; }
  private shootSteps(): Step[] { return [
    // On v4 hardware intake and feeder share a shaft; keep it stopped until
    // flywheel speed and turret aim have settled, then feed deliberately.
    { name: "Spin up shooter", durationMs: 3000 + this.skill.reactionMs, controls: { flywheel: 0.4 }, aiming: true },
    { name: "Feed HIVE", durationMs: 5000, controls: { flywheel: 0.4, feeder: 0.4 }, aiming: true },
    { name: "Observe HIVE settling", durationMs: 4000 },
  ]; }

  private plan(view: PolicyObservationView): void {
    const now = view.elapsedMatchMs;
    this.enteredAt = -1;
    if (this.mode === "park") {
      this.steps = [{ name: "Hold PARK", untilMs: 158_000 }]; return;
    }
    if (this.mode === "flower") { this.planPark(view); return; }
    if (this.mode === "opening") {
      this.mode = "cycling";
      // Clear the shared shooting position before the partner arrives.
      this.steps = [this.drive("Clear HIVE lane", { x: this.side * (this.near ? 0.45 : 1.1), z: this.near ? -this.side * 1.25 : this.shot.z, heading: this.setup.heading })];
      if (this.near) this.steps.push({ name: "Yield to partner scoring run", untilMs: 42_000 });
      return;
    }
    if (this.near) {
      // The opening near-side shooter has just cleared the lane. Keep it there
      // until the scheduled Flower window so it cannot collide with its partner
      // while that robot exits the HIVE shooting corridor.
      if (now < 79_000) {
        this.steps = [{ name: "Wait for FLOWER play window", untilMs: 79_000 }];
        return;
      }
      this.planFlower(view);
      return;
    }
    if (!this.near && now >= 55_000 && now < 141_000) {
      // Hold on the outer edge of the starting side. Crossing the field to
      // clear the lane sends the partner through this robot's route instead.
      this.steps = [this.drive("Keep partner FLOWER lane clear", { x: this.side * 1.4, z: -this.side * 1.4, heading: this.setup.heading }), { name: "Watch for floor recovery", durationMs: 1200 }];
      return;
    }
    if (now >= 141_000) { this.planPark(view); return; }
    if (now < this.nextDecision) { this.steps = [{ name: "Assess field", durationMs: this.skill.reactionMs }]; return; }
    this.nextDecision = now + this.skill.reactionMs;
    if (this.payload > 0 && this.cycles < this.skill.collectCycles) {
      if (this.near && now < 58_000) {
        this.steps = [this.drive("Give partner the HIVE lane", { x: this.side * 0.6, z: this.shot.z, heading: this.setup.heading }), { name: "Wait for partner scoring cycle", untilMs: 58_000 }]; return;
      }
      this.cycles++;
      this.steps = [
        this.drive("Return to HIVE corridor", { x: this.side * 1.1, z: view.estimatedPose.zMeters, heading: this.setup.heading }),
        this.drive("Approach HIVE", { x: this.side * 1.1, z: this.shot.z, heading: this.shot.heading }),
        this.drive("Aim from shooting position", this.shot), ...this.shootSteps(),
        this.drive("Clear scoring lane", { x: this.side * 1.1, z: this.shot.z, heading: this.shot.heading }),
      ]; return;
    }
    // Only camera-visible, floor-level POLLEN or matching NECTAR may be selected.
    const candidates = view.visibleElements.filter(element => element.relativePosition.y < 0.16 && (element.kind === "pollen" || element.alliance === this.setup.alliance))
      .map(element => ({ element, point: toField(element.relativePosition, view) }))
      .filter(({ point }) => this.navigation.clear(point) && point.x * this.side > 0.25 && Math.abs(point.x) < 1.57 && Math.abs(point.z) < 1.55)
      .sort((a, b) => Math.hypot(a.element.relativePosition.x, a.element.relativePosition.z) - Math.hypot(b.element.relativePosition.x, b.element.relativePosition.z));
    const candidate = candidates[0];
    if (candidate && this.payload < 4 && this.cycles < this.skill.collectCycles) {
      const dx = candidate.point.x - view.estimatedPose.xMeters, dz = candidate.point.z - view.estimatedPose.zMeters;
      const heading = Math.atan2(-dz, dx);
      const target = { x: candidate.point.x - Math.cos(heading) * 0.17, z: candidate.point.z + Math.sin(heading) * 0.17, heading };
      this.pickupPayloadBaseline = this.payload;
      this.steps = [this.drive("Recover floor element", target, { intake: 0.3 }, false), { name: "Settle recovered element", durationMs: 2000 }]; return;
    }
    // Scan along an open interior lane. Goal changes are infrequent; steering remains continuous.
    const scan = Math.floor(now / 12_000) % 2;
    this.steps = [this.drive("Search for floor elements", { x: this.side * (this.near ? 1.06 : 1.1), z: this.side * (this.near ? (scan ? 1.3 : 0.95) : (scan ? -1.3 : -0.95)), heading: this.setup.heading + (scan ? 0.45 : -0.45) }), { name: "Scan field", durationMs: 1200 + this.skill.reactionMs }];
  }

  private planFlower(view: PolicyObservationView): void {
    this.mode = "flower";
    this.pickupPayloadBaseline = view.ownRobot.payload.length;
    this.transferSawBeam = false; this.transferStartMotor = undefined;
    this.nectarStored = false;
    const z = this.zone.center.z - this.side * 0.012;
    const lift = this.setup.configuration.mechanisms!.lift;
    const offset = robotLiftPosition(this.setup.configuration, lift.maximumTravel * (lift.axis?.y ?? 1));
    const target = { x: this.flower.position.x - this.side * offset.x - this.side * 0.09, z: this.flower.position.z, heading: this.homeHeading };
    const approachX = target.x - this.side * 0.35;
    this.steps = [
      // Move into the center-side approach first. The far bot holds at the
      // outer opposite lane, so driving along the wall here creates a deadlock.
      this.drive("Approach loading corridor", { x: this.side * 0.55, z: view.estimatedPose.zMeters, heading: this.setup.heading }),
      this.drive("Reach loading lane", { x: this.side * 1.1, z, heading: this.setup.heading }),
      this.drive("Face loading zone", { x: this.side * 1.1, z, heading: this.homeHeading }, undefined, true),
      { name: "Wait for final-minute FLOWER play", untilMs: 98_000 },
      this.drive("Collect NECTAR", { x: this.zone.center.x - this.side * 0.25, z, heading: this.homeHeading }, { intake: 0.4 }, true),
      { name: "Store NECTAR", durationMs: 2500 },
      { name: "Settle NECTAR", durationMs: 20 },
      { name: "Transfer to lift", durationMs: 5000, controls: { feeder: -0.15 } },
      { name: "Raise lift", durationMs: 4200, controls: { lift: 0.8 } },
      this.drive("Clear loading area", { x: approachX, z: this.zone.center.z, heading: this.homeHeading }, { lift: 0.03 }, true),
      this.drive("Approach FLOWER", { x: approachX, z: target.z, heading: this.homeHeading }, { lift: 0.03 }, true),
      this.drive("Align lift", target, { lift: 0.03 }, true),
      { name: "Release NECTAR", durationMs: 3000, controls: { release: 0.2732 } },
    ];
    this.enteredAt = -1;
  }

  private planPark(view: PolicyObservationView): void {
    this.mode = "park"; this.enteredAt = -1;
    // Adjacent parking slots allow both chassis to overlap the loading rectangle without overlapping each other.
    const z = this.zone.center.z + this.side * (this.near ? -0.025 : 0.475);
    this.steps = [
      this.drive("Retreat to parking corridor", { x: this.side * 1.1, z: view.estimatedPose.zMeters, heading: this.homeHeading }, { lift: 0.03 }),
      this.drive("Lower lift and approach PARK", { x: this.side * 1.1, z, heading: this.homeHeading }, { lift: -0.8 }),
      this.drive("PARK", { x: this.side * 1.51, z, heading: this.homeHeading }),
      { name: "Hold PARK", target: { x: this.side * 1.51, z, heading: this.homeHeading }, hold: true, untilMs: 158_000 },
    ];
  }

  private aim(view: PolicyObservationView): Controls {
    const hive = this.field.hives.find(hive => hive.alliance === this.setup.alliance)!;
    const angle = this.lastHiveAngle;
    const rotate = (v: { x: number; y: number; z: number }) => {
      const c = Math.cos(angle), s = Math.sin(angle), a = hive.axis;
      const dot = a.x * v.x + a.y * v.y + a.z * v.z;
      return { x: v.x * c + (a.y * v.z - a.z * v.y) * s + a.x * dot * (1 - c), y: v.y * c + (a.z * v.x - a.x * v.z) * s + a.y * dot * (1 - c), z: v.z * c + (a.x * v.y - a.y * v.x) * s + a.z * dot * (1 - c) };
    };
    const cell = hive.cells.find(cell => rotate(cell.openingNormal ?? { x: 0, y: 1, z: 0 }).y > 0.2) ?? hive.cells[0]!;
    const offset = rotate(cell.center);
    const pose = view.estimatedPose;
    const dx = hive.pivot.x + offset.x - pose.xMeters, dz = hive.pivot.z + offset.z - pose.zMeters;
    const localX = Math.cos(pose.headingRadians) * dx - Math.sin(pose.headingRadians) * dz + 0.15;
    const localZ = Math.sin(pose.headingRadians) * dx + Math.cos(pose.headingRadians) * dz - this.setup.configuration.mechanisms!.shooter.mount.z;
    const angleToServo = (name: string, angle: number) => { const servo = this.setup.configuration.servos.find(servo => servo.name === name)!; return clamp(2 * (angle - servo.minRadians) / (servo.maxRadians - servo.minRadians) - 1, -1, 1); };
    const shooter = this.setup.configuration.mechanisms!.shooter;
    const turretAngle = Math.atan2(-localZ, localX) - 0.04 + this.bias * this.skill.aimError;
    const turret = shooter.turretMotor
      ? wrap(turretAngle) / Math.PI
      : angleToServo(shooter.turretServo!, turretAngle);
    return { turret, hood: angleToServo(shooter.hoodServo, 1.2) };
  }

  private driveControls(view: PolicyObservationView, step: Step, now: number): Controls {
    const p = view.estimatedPose;
    const finalTarget = step.target!;
    const origin = { x: p.xMeters, z: p.zMeters };
    if (this.routeStep !== step) {
      this.routeStep = step; this.route = this.navigation.route(origin, finalTarget);
    }
    if (!this.route.length) return { forward: 0, strafe: 0, yaw: 0 };
    while (this.route.length > 1 && Math.hypot(this.route[0]!.x - p.xMeters, this.route[0]!.z - p.zMeters) < 0.1) this.route.shift();
    const target = { ...(this.route[0] ?? finalTarget), heading: finalTarget.heading };
    const error = step.precision ? 0 : this.bias * this.skill.positionError;
    const dx = target.x + error - p.xMeters, dz = target.z + error - p.zMeters;
    let vx = clamp(1.4 * dx, -this.skill.speed, this.skill.speed), vz = clamp(1.4 * dz, -this.skill.speed, this.skill.speed);
    // Predict near-term intersections from visible robot positions/velocities only.
    for (const robot of view.visibleRobots) {
      if (step.hold) continue;
      const other = toField(robot.relativePosition, view);
      const rx = other.x - p.xMeters, rz = other.z - p.zMeters, d = Math.hypot(rx, rz);
      const safeDistance = Math.abs(wrap(robot.relativeHeadingRadians)) < 0.15 ? 0.47 : 0.62;
      const closestAt = clamp((rx * vx + rz * vz) / Math.max(0.001, vx * vx + vz * vz), 0, 0.8);
      const predictedDistance = Math.hypot(rx - vx * closestAt, rz - vz * closestAt);
      if (d < safeDistance + 0.25 && d > 0.01 && vx * rx + vz * rz > 0 && predictedDistance < safeDistance) {
        const outward = Math.max(0, (safeDistance + 0.1 - d) / 0.2);
        vx -= rx / d * outward * 0.55; vz -= rz / d * outward * 0.55;
        // Stable side preference breaks head-on symmetry without frame-by-frame jitter.
        const yieldSign = this.setup.id.endsWith("2") ? 1 : -1;
        vx += -rz / d * 0.12 * yieldSign; vz += rx / d * 0.12 * yieldSign;
      }
    }
    const distance = Math.hypot(dx, dz);
    if (!this.progressPosition || Math.hypot(p.xMeters - this.progressPosition.x, p.zMeters - this.progressPosition.z) > 0.045) {
      this.progressPosition = { x: p.xMeters, z: p.zMeters }; this.stuckSince = now;
    }
    if (distance > 0.12 && now - this.stuckSince > this.skill.recoveryMs && now > this.recoveryUntil) {
      this.recoveryUntil = now + 650; this.stuckSince = now + 650; this.recoveries++;
    }
    if (now < this.recoveryUntil) {
      const rx = -Math.cos(p.headingRadians) * 0.18, rz = Math.sin(p.headingRadians) * 0.18 + this.side * 0.16;
      if (this.navigation.segmentClear(origin, { x: origin.x + rx, z: origin.z + rz })) { vx = rx; vz = rz; }
      else { vx = 0; vz = 0; }
    }
    const c = Math.cos(p.headingRadians), s = Math.sin(p.headingRadians);
    const heading = !step.precision && view.ownRobot.mechanism.liftHeight < 0.05 && distance > 0.45 ? Math.atan2(-dz, dx) : target.heading;
    return { forward: clamp((c * vx - s * vz) / 2, -0.5, 0.5), strafe: clamp((-s * vx - c * vz) / 2, -0.5, 0.5), yaw: clamp(2.2 * wrap(heading - p.headingRadians) / 3, -0.5, 0.5) };
  }
  private smooth(values: Float32Array, dt: number): Float32Array {
    for (let i = 0; i < 3; i++) {
      const maximumDelta = this.skill.acceleration * dt / (i === 2 ? 3 : 2);
      values[i] = this.previous[i]! + clamp(values[i]! - this.previous[i]!, -maximumDelta, maximumDelta);
    }
    this.previous = values;
    return values;
  }
}
function neutral(view: PolicyObservationView, configuration: WorldRobotSetup["configuration"]): Float32Array {
  const controls = action({});
  if (configuration.mechanisms?.shooter.turretMotor) {
    controls[7] = wrap(robotTurretAngle(configuration, view.ownRobot)) / Math.PI;
  }
  return controls;
}
function action(input: Controls): Float32Array { return Float32Array.from([input.forward ?? 0, input.strafe ?? 0, input.yaw ?? 0, input.intake ?? 0, input.feeder ?? 0, input.flywheel ?? 0, input.lift ?? 0, input.turret ?? 0, input.hood ?? 0, input.release ?? -1, input.gate ?? -1].map(v => clamp(v, -1, 1))); }
function clamp(v: number, low: number, high: number): number { return Math.max(low, Math.min(high, v)); }
function wrap(v: number): number { return Math.atan2(Math.sin(v), Math.cos(v)); }
function toField(point: { x: number; z: number }, view: PolicyObservationView): { x: number; z: number } {
  const p = view.estimatedPose, c = Math.cos(p.headingRadians), s = Math.sin(p.headingRadians);
  return { x: p.xMeters + c * point.x + s * point.z, z: p.zMeters - s * point.x + c * point.z };
}
