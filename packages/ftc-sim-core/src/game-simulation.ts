import * as Rules from "./biobuzz-rules.js";
import { SimulationWorld } from "./simulation-world.js";
import { sphereIntersectsRuleVolume } from "./rule-volumes.js";
import type { SimulationSnapshot, WorldContact } from "./simulation-world.js";
import { conjugate, inversePoint3, length3, point3, rotate3, sub3 } from "./world-math.js";
import type { RobotId, SimulationWorldOptions, Vector3, WorldAlliance, WorldObservation } from "./world-types.js";

export type GamePhase = "setup" | "init" | "auto" | "transition" | "teleop-handoff" | "teleop" | "settling" | "results" | "stopped";
type PinRecord = { pinner: RobotId; pinned: RobotId; pinnerStart: Vector3; pinnedStart: Vector3 };
type RuleAction = { tick: number; input: Rules.BiobuzzMatchInput };

// Numerical comparison slack only; G418 has no physical boundary tolerance.
const G418_BOUNDARY_EPSILON_METERS = 1e-9;

export interface GameSnapshot {
  world: SimulationSnapshot;
  rules: Rules.BiobuzzMatchState;
  phase: GamePhase;
  startTick: number;
  settledSinceTick: number | null;
  previous: WorldObservation;
  pins: [string, PinRecord][];
  observedViolations: string[];
  hiveStableSince: [string, number][];
  actions: RuleAction[];
}

/** Full match clock and adjudication using the same physical world as practice and training. */
export class GameSimulation {
  readonly world: SimulationWorld;
  rules: Rules.BiobuzzMatchState;
  phase: GamePhase = "setup";
  private startTick = 0;
  private settledSinceTick: number | null = null;
  private previous: WorldObservation;
  private pins = new Map<string, PinRecord>();
  private observedViolations = new Set<string>();
  private hiveStableSince = new Map<string, number>();
  private actions: RuleAction[] = [];
  private readonly options: SimulationWorldOptions;

  static async create(options: SimulationWorldOptions): Promise<GameSimulation> {
    if (options.field.preset !== "biobuzz-2026-2027") throw new Error("Full matches currently require the BIOBUZZ field.");
    if (options.robots.length !== 4) throw new Error("BIOBUZZ matches require four robots.");
    const ids = options.field.spawns.map((spawn) => spawn.id).sort();
    if (ids.join() !== [...Rules.BIOBUZZ_ELEMENT_IDS].sort().join()) throw new Error("BIOBUZZ requires all 56 official scoring-element identities exactly once.");
    return new GameSimulation(await SimulationWorld.create(options), options);
  }

  private constructor(world: SimulationWorld, options: SimulationWorldOptions) {
    this.world = world; this.options = structuredClone(options);
    this.rules = this.newRules(); this.previous = world.observe(); this.world.setPowered(false);
  }

  get matchTimeMs(): number {
    if (this.phase === "setup" || this.phase === "init") return 0;
    return Math.max(0, (this.world.tick - this.startTick) * 5);
  }
  get remainingMs(): number {
    // The field display counts active play from 2:30, then separately shows
    // 0:08 during the unpowered handoff and resets to 2:00 for TELEOP.
    // The eight transition seconds are never added to the visible match clock.
    const elapsed = this.matchTimeMs;
    if (elapsed < Rules.BIOBUZZ_AUTO_MS) return Rules.BIOBUZZ_ACTIVE_MATCH_MS - elapsed;
    if (elapsed < Rules.BIOBUZZ_TELEOP_START_MS) return Rules.BIOBUZZ_TELEOP_START_MS - elapsed;
    return Math.max(0, Rules.BIOBUZZ_MATCH_END_MS - elapsed);
  }

  initialize(): void {
    if (this.phase !== "setup" && this.phase !== "stopped" && this.phase !== "results") throw new Error("Stop or reset the current match before INIT.");
    this.phase = "init"; this.world.setPowered(false);
    // Sensors need real capture/latency time before the JVM receives its first frame.
    const latency = Math.max(0, ...this.options.robots.flatMap((robot) => [...robot.configuration.sensors, ...robot.configuration.cameras].map((sensor) => sensor.latencyMs)));
    if (this.world.tick === 0 && latency > 0) this.world.step(Math.ceil(latency / 20) * 4 + 4);
    this.previous = this.world.observe();
  }

  start(): void {
    if (this.phase === "setup") this.initialize();
    if (this.phase !== "init") throw new Error("A match must be initialized before it starts.");
    this.startTick = this.world.tick; this.phase = "auto"; this.world.setPowered(true);
    this.previous = this.world.observe(); this.applyObservation(this.previous);
  }

  /** Host holds simulation time while the selected TELEOP program initializes in its existing JVM. */
  resumeTeleop(): void {
    if (this.phase !== "teleop-handoff") throw new Error("TELEOP handoff is not pending.");
    this.phase = "teleop"; this.world.setPowered(true);
  }

  stop(): void {
    if (this.phase === "setup" || this.phase === "init") this.startTick = this.world.tick;
    this.world.setPowered(false); this.phase = "stopped";
  }
  reset(seed = this.options.seed): void {
    this.options.seed = seed; this.world.reset(seed); this.world.setPowered(false);
    this.rules = this.newRules(); this.phase = "setup"; this.startTick = 0;
    this.previous = this.world.observe(); this.pins.clear(); this.observedViolations.clear(); this.hiveStableSince.clear(); this.actions = []; this.settledSinceTick = null;
  }

  /** Returns the number of actual ticks advanced; no time is consumed during a pending handoff. */
  step(ticks = 4): number {
    if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > 20000) throw new RangeError("Invalid match step count.");
    let advanced = 0;
    while (advanced < ticks && ["auto", "transition", "teleop", "settling"].includes(this.phase)) {
      this.world.step(1); advanced++;
      const time = this.matchTimeMs;
      if (time === Rules.BIOBUZZ_AUTO_MS) { this.phase = "transition"; this.world.setPowered(false); }
      if (time === Rules.BIOBUZZ_TELEOP_START_MS) { this.phase = "teleop-handoff"; this.world.setPowered(false); }
      if (time === Rules.BIOBUZZ_MATCH_END_MS) { this.phase = "settling"; this.world.setPowered(false); }
      if (this.world.tick % 4 === 0) {
        const observation = this.world.observe();
        const contacts = this.world.contacts({ robotsOnly: true });
        this.processHives(observation);
        this.processViolations(observation, contacts);
        this.applyObservation(observation, contacts);
        this.returnOutOfBounds(observation);
        this.previous = observation;
        if (this.rules.completed) { this.phase = "results"; break; }
      }
    }
    return advanced;
  }

  /** One human loading action. Illegal timing produces its penalty while the ball still enters. */
  loadNectar(alliance: WorldAlliance, id?: string): string {
    const loaded = this.tryLoadNectar(alliance, id);
    if (!loaded) throw new Error("The LOADING ZONE is occupied. Clear space for the ball to contact the tile first.");
    return loaded;
  }

  /** Human-player controllers may wait for a clear tile without consuming a supply ball. */
  tryLoadNectar(alliance: WorldAlliance, id?: string): string | null {
    if (!["auto", "transition", "teleop"].includes(this.phase)) throw new Error("Human loading is available during the match.");
    const element = this.world.observe().elements.find((element) => element.kind === "nectar" && element.alliance === alliance && element.location !== "field" && (!id || element.id === id));
    if (!element) throw new Error(`No ${alliance} NECTAR is available in the ALLIANCE AREA.`);
    const zone = this.world.field.loadingZones.find((zone) => zone.alliance === alliance);
    if (!zone) throw new Error("The field has no matching LOADING ZONE.");
    const axis = zone.halfExtents.x > zone.halfExtents.z ? "x" : "z";
    const availableHalf = zone.halfExtents[axis] - element.radius - 0.005;
    const candidates = [0, -0.5, 0.5, -1, 1].map((fraction) => ({ x: zone.center.x, y: this.world.field.floorHeight + element.radius + 0.001, z: zone.center.z, [axis]: zone.center[axis] + fraction * availableHalf }));
    const observation = this.world.observe();
    const position = candidates.find((candidate) => observation.robots.every((robot) => Math.hypot(robot.position.x - candidate.x, robot.position.z - candidate.z) > 0.38) && observation.elements.every((other) => other.location !== "field" || length3(sub3(other.position, candidate)) > other.radius + element.radius + 0.01));
    if (!position) return null;
    this.apply({ type: "human-nectar-entry", timestampMs: this.matchTimeMs, actorAlliance: alliance, nectarId: element.id, usedTool: false, firstContact: "tile-in-alliance-loading-zone" });
    this.world.placeElement(element.id, position);
    return element.id;
  }

  availableNectar(alliance: WorldAlliance): { total: number; legalNow: number } {
    const total = this.world.observe().elements.filter((element) => element.kind === "nectar" && element.alliance === alliance && element.location !== "field").length;
    return { total, legalNow: this.matchTimeMs >= Rules.BIOBUZZ_FINAL_MINUTE_START_MS ? total : Math.min(total, Math.max(0, this.rules.tips[alliance] - this.rules.humanEntries[alliance])) };
  }

  adjustReferee(input: Omit<Rules.RefereeAdjustmentEvent, "type" | "timestampMs">): void {
    this.apply({ ...input, type: "referee-adjustment", timestampMs: this.matchTimeMs });
  }

  snapshot(): GameSnapshot { return { world: this.world.snapshot(), rules: structuredClone(this.rules), phase: this.phase, startTick: this.startTick, settledSinceTick: this.settledSinceTick, previous: structuredClone(this.previous), pins: structuredClone([...this.pins]), observedViolations: [...this.observedViolations], hiveStableSince: [...this.hiveStableSince], actions: structuredClone(this.actions) }; }
  restore(snapshot: GameSnapshot): void {
    this.world.restore(snapshot.world); this.rules = structuredClone(snapshot.rules); this.phase = snapshot.phase; this.startTick = snapshot.startTick; this.settledSinceTick = snapshot.settledSinceTick; this.previous = structuredClone(snapshot.previous); this.pins = new Map(structuredClone(snapshot.pins)); this.observedViolations = new Set(snapshot.observedViolations); this.hiveStableSince = new Map(snapshot.hiveStableSince); this.actions = structuredClone(snapshot.actions);
  }
  replayActions(): readonly RuleAction[] { return structuredClone(this.actions); }
  dispose(): void { this.world.dispose(); }

  private newRules(): Rules.BiobuzzMatchState {
    const hive = (alliance: WorldAlliance): Rules.HiveStartState => {
      const config = this.options.field.hives.find((hive) => hive.alliance === alliance);
      if (!config || config.dampers.length < 2) throw new Error(`${alliance} HIVE requires two physical damper contacts.`);
      const stable = Math.abs(config.initialAngle - config.lowerLimit) < Math.abs(config.initialAngle - config.upperLimit) ? "a" : "b";
      return { stableState: stable, contactingDamperId: `${config.id}-damper-${stable}` };
    };
    return Rules.createBiobuzzMatch({ robots: this.options.robots.map((robot) => ({ id: robot.id, alliance: robot.alliance })), hives: { red: hive("red"), blue: hive("blue") } });
  }

  private apply(input: Rules.BiobuzzMatchInput): void {
    this.rules = Rules.applyBiobuzzInput(this.rules, input);
    if (input.type !== "observation") this.actions.push({ tick: this.world.tick, input: structuredClone(input) });
  }

  private processHives(observation: WorldObservation): void {
    for (const hive of this.world.field.hives) {
      const state = observation.hives.find((state) => state.id === hive.id)!;
      const angle = 2 * Math.atan2(state.rotation.x * hive.axis.x + state.rotation.y * hive.axis.y + state.rotation.z * hive.axis.z, state.rotation.w);
      const stable = Math.abs(angle - hive.lowerLimit) < 0.035 ? "a" : Math.abs(angle - hive.upperLimit) < 0.035 ? "b" : null;
      const damper = stable ? hive.dampers[stable === "a" ? 0 : 1] : undefined;
      const contact = damper && length3(sub3(point3(damper.local, state.position, state.rotation), damper.frame)) <= damper.contactDistance;
      const stableContact = stable && contact && length3(state.angularVelocity) < 0.25;
      if (!stableContact) { this.hiveStableSince.delete(hive.id); continue; }
      if (!this.hiveStableSince.has(hive.id)) this.hiveStableSince.set(hive.id, this.world.tick);
      if (this.world.tick - this.hiveStableSince.get(hive.id)! < 10 || stable === this.rules.hives[hive.alliance].stableState) continue;
      this.apply({ type: "hive-tip", timestampMs: this.matchTimeMs, alliance: hive.alliance, fromStableState: this.rules.hives[hive.alliance].stableState, toStableState: stable, newlyContactingDamperId: `${hive.id}-damper-${stable}` });
    }
  }

  private applyObservation(observation: WorldObservation, contacts = this.world.contacts({ robotsOnly: true })): void {
    const elements: Record<string, Rules.ElementObservation> = {};
    const flowerStacks = Object.fromEntries(Rules.BIOBUZZ_FLOWER_IDS.map((id) => [id, [] as string[]])) as Record<Rules.FlowerId, string[]>;
    for (const element of observation.elements) {
      const flowers = element.location === "field" ? this.world.field.flowers.filter((flower) => sphereInCylinder(element.position, element.radius, flower.position, flower.scoringRadius, flower.bottom, flower.top)).map((flower) => flower.id as Rules.FlowerId) : [];
      for (const flower of flowers) flowerStacks[flower]!.push(element.id);
      const cells: Rules.CellMembership[] = [];
      for (const hive of this.world.field.hives) {
        const state = observation.hives.find((state) => state.id === hive.id)!;
        const local = inversePoint3(element.position, state.position, state.rotation);
        for (const cell of hive.cells) {
          const centered = sub3(local, cell.center);
          const cellPoint = cell.rotation ? rotate3(centered, conjugate(cell.rotation)) : centered;
          const normal = rotate3(cell.openingNormal ?? { x: 0, y: 1, z: 0 }, state.rotation);
          const intersects = cell.volume ? sphereIntersectsRuleVolume(local, element.radius, cell.volume) : sphereInBox(cellPoint, element.radius, { x: 0, y: 0, z: 0 }, cell.halfExtents);
          if (element.location === "field" && intersects) cells.push({ hiveAlliance: hive.alliance, facing: normal.y >= 0 ? "up" : "down" });
        }
      }
      elements[element.id] = {
        fieldStatus: element.location === "field" ? "field" : element.location === "supply" ? "alliance-area" : "out-of-field",
        gardenMemberships: element.location === "field" ? this.world.field.gardens.filter((garden) => sphereInBox(element.position, element.radius, garden.center, garden.halfExtents)).map((garden) => garden.alliance) : [],
        flowerMemberships: flowers, cellMemberships: cells,
      };
    }
    for (const stack of Object.values(flowerStacks)) stack.sort((a, b) => observation.elements.find((element) => element.id === a)!.position.y - observation.elements.find((element) => element.id === b)!.position.y || a.localeCompare(b));
    const robots = Object.fromEntries(observation.robots.map((robot) => {
      const zone = this.world.field.loadingZones.find((zone) => zone.alliance === robot.alliance);
      return [robot.id, { wallContact: contacts.some((contact) => (contact.first === robot.id && contact.second.startsWith("wall")) || (contact.second === robot.id && contact.first.startsWith("wall"))), loadingZoneOverlap: Boolean(zone && this.world.robotOverlapsBox(robot.id, zone.center, zone.halfExtents)), controlledElementIds: observation.elements.filter((element) => element.controlledBy === robot.id).map((element) => element.id) }];
    })) as unknown as Rules.BiobuzzObservation["robots"];
    const motion = [...observation.robots, ...observation.elements.filter((element) => element.location === "field")];
    const settled = this.matchTimeMs >= Rules.BIOBUZZ_MATCH_END_MS && motion.every((body) => length3(body.linearVelocity) < 0.025 && length3(body.angularVelocity) < 0.12);
    if (!settled) this.settledSinceTick = null;
    else this.settledSinceTick ??= this.world.tick;
    this.apply({ type: "observation", timestampMs: this.matchTimeMs, robots, elements, flowerStacks, activePins: this.pinObservations(observation, contacts), allRobotsAndElementsSettled: this.settledSinceTick !== null && this.world.tick - this.settledSinceTick >= 400 });
  }

  private pinObservations(observation: WorldObservation, contacts: WorldContact[]): Rules.PinObservation[] {
    if (this.matchTimeMs >= Rules.BIOBUZZ_MATCH_END_MS) { this.pins.clear(); return []; }
    const contactingPairs = new Set<string>();
    for (const contact of contacts) {
      const first = observation.robots.find((robot) => robot.id === contact.first);
      const second = observation.robots.find((robot) => robot.id === contact.second);
      if (!first || !second || first.alliance === second.alliance) continue;
      for (const [pinner, pinned] of [[first, second], [second, first]] as const) {
        const constrained = contacts.some((contact) => {
          const other = contact.first === pinned.id ? contact.second : contact.second === pinned.id ? contact.first : null;
          return other !== null && other !== pinner.id && other !== "floor" && !observation.elements.some((element) => element.id === other);
        });
        if (!constrained || Math.hypot(pinned.linearVelocity.x, pinned.linearVelocity.z) > 0.1) continue;
        const key = `${pinner.id}/${pinned.id}`;
        contactingPairs.add(key);
        if (!this.pins.has(key)) this.pins.set(key, { pinner: pinner.id, pinned: pinned.id, pinnerStart: pinner.position, pinnedStart: pinned.position });
      }
    }
    for (const [key, pin] of this.pins) {
      if (this.rules.suppressedPinPairs.includes(JSON.stringify([pin.pinner, pin.pinned])) && !contactingPairs.has(key)) this.pins.delete(key);
    }
    return [...this.pins.values()].map((pin) => {
      const pinner = observation.robots.find((robot) => robot.id === pin.pinner)!;
      const pinned = observation.robots.find((robot) => robot.id === pin.pinned)!;
      return { pinningRobotId: pin.pinner, pinnedRobotId: pin.pinned, separationFeet: this.world.robotSeparationMeters(pin.pinner, pin.pinned) / 0.3048, pinningRobotDisplacementFeet: length3(sub3(pinner.position, pin.pinnerStart)) / 0.3048, pinnedRobotDisplacementFeet: length3(sub3(pinned.position, pin.pinnedStart)) / 0.3048, pinningRobotIsPinned: [...this.pins.values()].some((other) => other.pinned === pin.pinner) };
    });
  }

  private processViolations(observation: WorldObservation, contacts: WorldContact[]): void {
    const active = new Set<string>();
    const report = (key: string, input: Omit<Rules.ObservedViolationEvent, "type" | "timestampMs">) => {
      active.add(key);
      if (!this.observedViolations.has(key)) this.apply({ ...input, type: "observed-violation", timestampMs: this.matchTimeMs });
    };
    for (const contact of contacts) {
      const robot = observation.robots.find((robot) => robot.id === contact.first || robot.id === contact.second);
      if (!robot) continue;
      const otherId = contact.first === robot.id ? contact.second : contact.first;
      const other = observation.robots.find((other) => other.id === otherId);
      if (other && other.alliance !== robot.alliance && this.matchTimeMs < Rules.BIOBUZZ_AUTO_MS) {
        const intruder = (robot.alliance === "red" && robot.position.x > 0) || (robot.alliance === "blue" && robot.position.x < 0) ? robot : other;
        report(`auto/${robot.id}/${other.id}`, { robotId: intruder.id, ruleId: "G402", detail: "Robot contacted an opponent on the opponent's side during AUTO; strategic intent requires referee review." });
      }
      if (this.world.field.hives.some((hive) => hive.id === otherId)) report(`hive/${robot.id}/${otherId}`, { robotId: robot.id, ruleId: "G417", detail: "Robot contact with the moving HIVE requires review for manipulation of its motion." });
      const element = observation.elements.find((element) => element.id === otherId);
      if (element?.dischargedUntilFloorContact) report(`catch/${robot.id}/${element.id}`, { robotId: robot.id, ruleId: "G409", elementId: element.id, detail: "HIVE discharge contacted a robot before another surface; review accidental versus strategic catching." });
    }
    for (const element of observation.elements) {
      const previous = this.previous.elements.find((previous) => previous.id === element.id);
      if (!previous) continue;
      for (const flower of this.world.field.flowers) {
        const before = sphereInCylinder(previous.position, element.radius, flower.position, flower.scoringRadius, flower.bottom, flower.top);
        const after = sphereInCylinder(element.position, element.radius, flower.position, flower.scoringRadius, flower.bottom, flower.top);
        if (before === after) continue;
        const robotId = element.controlledBy ?? previous.controlledBy;
        if (!robotId) continue;
        const legalEntry = !before && previous.position.y - element.radius >= flower.top - G418_BOUNDARY_EPSILON_METERS;
        const legalRemoval = before && element.kind === "pollen" && element.position.y + element.radius <= flower.bottom + G418_BOUNDARY_EPSILON_METERS;
        if (!legalEntry && !legalRemoval) report(`flower/${robotId}/${element.id}/${before}`, { robotId, ruleId: "G418", elementId: element.id, detail: "Element crossed a FLOWER boundary outside top entry or bottom POLLEN removal; review the interaction." });
      }
    }
    this.observedViolations = active;
  }

  private returnOutOfBounds(observation: WorldObservation): void {
    for (const element of observation.elements.filter((element) => element.location === "out-of-bounds")) {
      if (element.kind === "nectar") {
        this.world.placeElement(element.id, { x: element.alliance === "red" ? -2.2 : 2.2, y: 0, z: 0 }, "supply");
      } else {
        const bound = this.world.field.halfSize - element.radius - 0.03;
        const position = { x: Math.max(-bound, Math.min(bound, element.position.x)), y: this.world.field.floorHeight + element.radius + 0.001, z: Math.max(-bound, Math.min(bound, element.position.z)) };
        if (observation.robots.every((robot) => length3(sub3(robot.position, position)) > 0.5)) this.world.placeElement(element.id, position);
      }
    }
  }
}

function sphereInBox(point: Vector3, radius: number, center: Vector3, half: Vector3): boolean {
  const dx = Math.max(0, Math.abs(point.x - center.x) - half.x);
  const dy = Math.max(0, Math.abs(point.y - center.y) - half.y);
  const dz = Math.max(0, Math.abs(point.z - center.z) - half.z);
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

function sphereInCylinder(point: Vector3, radius: number, center: Vector3, cylinderRadius: number, bottom: number, top: number): boolean {
  const radial = Math.max(0, Math.hypot(point.x - center.x, point.z - center.z) - cylinderRadius);
  const vertical = Math.max(0, bottom - point.y, point.y - top);
  return radial * radial + vertical * vertical <= radius * radius;
}
