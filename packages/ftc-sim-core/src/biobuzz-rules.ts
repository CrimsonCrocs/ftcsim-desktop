/** Pure BIOBUZZ match rules and scoring. Physics supplies timestamped observations. */

export type Alliance = "red" | "blue";
export type RobotId = (typeof BIOBUZZ_ROBOT_IDS)[number];
export type ElementId = string;
export type FlowerId = (typeof BIOBUZZ_FLOWER_IDS)[number];
export type ElementKind = "pollen" | "nectar";
export type MatchPeriod = "auto" | "transition" | "teleop" | "settling" | "complete";
export type ElementFieldStatus = "field" | "alliance-area" | "out-of-field";

export const BIOBUZZ_AUTO_MS = 30_000;
export const BIOBUZZ_TRANSITION_MS = 8_000;
export const BIOBUZZ_TELEOP_MS = 120_000;
export const BIOBUZZ_TELEOP_START_MS = BIOBUZZ_AUTO_MS + BIOBUZZ_TRANSITION_MS;
export const BIOBUZZ_MATCH_END_MS = BIOBUZZ_TELEOP_START_MS + BIOBUZZ_TELEOP_MS;
export const BIOBUZZ_ACTIVE_MATCH_MS = BIOBUZZ_AUTO_MS + BIOBUZZ_TELEOP_MS;
export const BIOBUZZ_FINAL_MINUTE_START_MS = BIOBUZZ_MATCH_END_MS - 60_000;
export const BIOBUZZ_FLOWER_IDS = Object.freeze(["flower-1", "flower-2", "flower-3", "flower-4"] as const);
export const BIOBUZZ_ALLIANCES = Object.freeze(["red", "blue"] as const);
export const BIOBUZZ_PIN_LIMIT_MS = 3_000;
export const BIOBUZZ_PIN_RESET_DWELL_MS = 3_000;
export const BIOBUZZ_MAX_CONTROLLED_ELEMENTS = 4;

export const BIOBUZZ_ROBOT_IDS = Object.freeze(["red-1", "red-2", "blue-1", "blue-2"] as const);
export const BIOBUZZ_POLLEN_IDS = Object.freeze(Array.from({ length: 40 }, (_, index) => `pollen-${String(index + 1).padStart(2, "0")}`));
export const BIOBUZZ_NECTAR_IDS = Object.freeze(BIOBUZZ_ALLIANCES.flatMap((alliance) =>
  Array.from({ length: 8 }, (_, index) => `nectar-${alliance}-${String(index + 1).padStart(2, "0")}`),
));
export const BIOBUZZ_ELEMENT_IDS = Object.freeze([...BIOBUZZ_POLLEN_IDS, ...BIOBUZZ_NECTAR_IDS]);

export interface RobotStart {
  id: RobotId;
  alliance: Alliance;
}

export interface HiveStartState {
  stableState: string;
  contactingDamperId: string;
}

export interface RankingThresholds {
  /** `null` means the event has not published a threshold (e.g. V1 Regionals). */
  swarmPoints: number | null;
  pollinator1Tips: number | null;
  pollinator2Tips: number | null;
}

export interface CreateBiobuzzMatchOptions {
  /** BIOBUZZ has two robots per alliance. Order determines the preload IDs. */
  robots: readonly RobotStart[];
  hives: Record<Alliance, HiveStartState>;
  /** Defaults to V1 All Other Events; pass null thresholds for an event with TBA values. */
  rankingThresholds?: RankingThresholds;
}

export type ElementStartLocation =
  | { kind: "flower"; flowerId: FlowerId }
  | { kind: "garden"; alliance: Alliance }
  | { kind: "robot-preload"; robotId: RobotId }
  | { kind: "upward-cell"; hiveAlliance: Alliance }
  | { kind: "alliance-area"; alliance: Alliance };

export interface ElementState {
  readonly id: ElementId;
  readonly kind: ElementKind;
  /** Alliance color for NECTAR; null for POLLEN. */
  readonly alliance: Alliance | null;
  readonly startLocation: ElementStartLocation;
  readonly fieldStatus: ElementFieldStatus;
  readonly gardenMemberships: readonly Alliance[];
  readonly flowerMemberships: readonly FlowerId[];
  readonly cellMemberships: readonly CellMembership[];
  /** Number of observed FIELD exits and subsequent returns. */
  readonly outs: number;
  readonly reentries: number;
  readonly humanEntryCount: number;
}

export interface CellMembership {
  hiveAlliance: Alliance;
  facing: "up" | "down";
}

export interface RobotObservation {
  /** Contact with the FIELD perimeter wall. */
  wallContact: boolean;
  /** At least part of the ROBOT overlaps its LOADING ZONE. */
  loadingZoneOverlap: boolean;
  /** Only scoring elements meeting the manual's CONTROL definition belong here. Include held,
   * supported, stuck, and intentionally herded elements; exclude incidental contact/deflection. */
  controlledElementIds: readonly ElementId[];
}

export interface ElementObservation {
  fieldStatus: ElementFieldStatus;
  /** Each GARDEN in which the element is at least partly present. */
  gardenMemberships: readonly Alliance[];
  /** Each FLOWER scoring volume in which the element is at least partly present. */
  flowerMemberships: readonly FlowerId[];
  /** Up/down CELL memberships; scoring uses only upward-facing CELLS at final settle. */
  cellMemberships: readonly CellMembership[];
}

/** Geometry summary for a possible G421 PIN. Distances are measured from PIN start. */
export interface PinObservation {
  pinningRobotId: RobotId;
  pinnedRobotId: RobotId;
  separationFeet: number;
  pinningRobotDisplacementFeet: number;
  pinnedRobotDisplacementFeet: number;
  /** True when the pinning robot itself is pinned, which ends this PIN count immediately. */
  pinningRobotIsPinned: boolean;
}

/** Complete physics snapshot at one wall-clock match timestamp. */
export interface BiobuzzObservation {
  type: "observation";
  timestampMs: number;
  /** Full snapshot keyed by every robot configured at match creation. */
  robots: Record<RobotId, RobotObservation>;
  /** Full snapshot keyed by all 56 stable scoring-element IDs. */
  elements: Record<ElementId, ElementObservation>;
  /** For each FLOWER, qualifying scoring elements ordered bottom-to-top. */
  flowerStacks: Record<FlowerId, readonly ElementId[]>;
  /** Full set of opponent PINs currently in progress; use [] when none. */
  activePins: readonly PinObservation[];
  /** True only when every robot and scoring element has come to rest. */
  allRobotsAndElementsSettled: boolean;
}

/** Parent emits this only after the HIVE changed stable state and its opposite damper contacts frame. */
export interface HiveTipEvent {
  type: "hive-tip";
  timestampMs: number;
  alliance: Alliance;
  fromStableState: string;
  toStableState: string;
  newlyContactingDamperId: string;
}

export interface HumanNectarEntryEvent {
  type: "human-nectar-entry";
  timestampMs: number;
  actorAlliance: Alliance;
  nectarId: ElementId;
  usedTool: boolean;
  /** First thing the NECTAR contacts after release. */
  firstContact: "tile-in-alliance-loading-zone" | "tile-outside-loading-zone" | "robot" | "field-element" | "other";
}

/** Referee decisions are explicit inputs; the engine does not infer STRATEGIC intent or cards. */
export interface RefereeAdjustmentEvent {
  type: "referee-adjustment";
  timestampMs: number;
  alliance: Alliance;
  /** Signed match-point correction applied to this alliance. */
  matchPointsDelta: number;
  /** Signed RP correction applied when the match is finalized. */
  rankingPointsDelta?: number;
  ruleId?: string;
  warning?: "verbal" | "yellow" | "red";
  note: string;
}

export interface ObservedViolationEvent {
  type: "observed-violation";
  timestampMs: number;
  robotId: RobotId;
  ruleId: "G402" | "G409" | "G417" | "G418" | "G428";
  elementId?: ElementId;
  detail: string;
}

export type BiobuzzMatchInput =
  | BiobuzzObservation
  | HiveTipEvent
  | HumanNectarEntryEvent
  | ObservedViolationEvent
  | RefereeAdjustmentEvent;

export interface ScoreBreakdown {
  leave: number;
  autoPark: number;
  teleopPark: number;
  hiveTips: number;
  upwardCellElements: number;
  ownedFlowerElements: number;
  bottomNectarBonuses: number;
  gardenElements: number;
  foulsReceived: number;
  refereeAdjustments: number;
}

export interface MatchFoul {
  timestampMs: number;
  ruleId: "G402" | "G410" | "G421" | "G426" | "G427" | "G428";
  offendingAlliance: Alliance;
  creditedAlliance: Alliance;
  points: number;
  elementId: ElementId | null;
  detail: string;
}

export interface RuleWarning {
  timestampMs: number;
  ruleId: "G407" | "G408" | "G409" | "G417" | "G418";
  alliance: Alliance;
  robotId: RobotId;
  detail: string;
}

export interface RefereeReviewRequest {
  timestampMs: number;
  ruleId: "G402" | "G407" | "G408" | "G409" | "G417" | "G418";
  alliance: Alliance;
  robotId: RobotId;
  detail: string;
  /** Manual-dependent outcomes are deliberately left to the REFEREE. */
  strategicAssessmentRequired: true;
}

export interface RefereeAdjustment {
  timestampMs: number;
  alliance: Alliance;
  matchPointsDelta: number;
  rankingPointsDelta: number;
  ruleId: string | null;
  warning: "verbal" | "yellow" | "red" | null;
  note: string;
}

export interface RankingPointBreakdown {
  win: number;
  tie: number;
  swarm: number;
  pollinator1: number;
  pollinator2: number;
  refereeAdjustment: number;
}

interface PinProgress {
  startedAtMs: number;
  lastAdvancedAtMs: number;
  activeDurationMs: number;
  clearConditionSinceMs: number | null;
}

export interface BiobuzzMatchState {
  timestampMs: number;
  completed: boolean;
  robotStarts: readonly RobotStart[];
  rankingThresholds: RankingThresholds;
  hives: Record<Alliance, HiveStartState>;
  robots: Record<RobotId, RobotObservation>;
  elements: Record<ElementId, ElementState>;
  flowerStacks: Record<FlowerId, readonly ElementId[]>;
  scores: Record<Alliance, number>;
  scoreBreakdown: Record<Alliance, ScoreBreakdown>;
  tips: Record<Alliance, number>;
  tipsByPeriod: Record<Alliance, { auto: number; teleop: number }>;
  humanEntries: Record<Alliance, number>;
  autoAchievementsAssessed: boolean;
  teleopParkAssessed: boolean;
  finalScoringAssessed: boolean;
  fouls: readonly MatchFoul[];
  warnings: readonly RuleWarning[];
  refereeReviews: readonly RefereeReviewRequest[];
  refereeAdjustments: readonly RefereeAdjustment[];
  rankingPoints: Record<Alliance, number>;
  rankingPointBreakdown: Record<Alliance, RankingPointBreakdown>;
  pins: Record<string, PinProgress>;
  suppressedPinPairs: readonly string[];
  activeControlReviewKeys: readonly string[];
  activeOpponentNectarReviewKeys: readonly string[];
}

export const BIOBUZZ_DEFAULT_RANKING_THRESHOLDS: RankingThresholds = {
  swarmPoints: 16,
  pollinator1Tips: 4,
  pollinator2Tips: 7,
};

export function getBiobuzzPeriod(timestampMs: number): MatchPeriod {
  assertTimestamp(timestampMs);
  if (timestampMs < BIOBUZZ_AUTO_MS) return "auto";
  if (timestampMs < BIOBUZZ_TELEOP_START_MS) return "transition";
  if (timestampMs < BIOBUZZ_MATCH_END_MS) return "teleop";
  return "settling";
}

export function createBiobuzzMatch(options: CreateBiobuzzMatchOptions): BiobuzzMatchState {
  validateStarts(options);
  const robotStarts = options.robots.map((robot) => ({ ...robot }));
  const robots = Object.fromEntries(robotStarts.map(({ id }) => [id, {
    wallContact: true,
    loadingZoneOverlap: false,
    controlledElementIds: [] as readonly ElementId[],
  }])) as Record<RobotId, RobotObservation>;
  const elements: Record<ElementId, ElementState> = {};

  BIOBUZZ_FLOWER_IDS.forEach((flowerId, flowerIndex) => {
    for (const pollenIndex of range(flowerIndex * 4 + 1, flowerIndex * 4 + 4)) {
      addElement(elements, `pollen-${pad2(pollenIndex)}`, "pollen", null,
        { kind: "flower", flowerId }, "field", [], [], []);
    }
  });
  for (const pollenIndex of range(17, 20)) {
    addElement(elements, `pollen-${pad2(pollenIndex)}`, "pollen", null,
      { kind: "garden", alliance: "red" }, "field", ["red"], [], []);
  }
  for (const pollenIndex of range(21, 24)) {
    addElement(elements, `pollen-${pad2(pollenIndex)}`, "pollen", null,
      { kind: "garden", alliance: "blue" }, "field", ["blue"], [], []);
  }
  let nextPreload = 25;
  for (const alliance of BIOBUZZ_ALLIANCES) {
    for (const robot of robotStarts.filter((candidate) => candidate.alliance === alliance)) {
      for (const pollenIndex of range(nextPreload, nextPreload + 3)) {
        addElement(elements, `pollen-${pad2(pollenIndex)}`, "pollen", null,
          { kind: "robot-preload", robotId: robot.id }, "field", [], [], []);
      }
      nextPreload += 4;
    }
  }
  for (const alliance of BIOBUZZ_ALLIANCES) {
    for (let nectarIndex = 1; nectarIndex <= 8; nectarIndex += 1) {
      const id = `nectar-${alliance}-${pad2(nectarIndex)}`;
      const inCell = nectarIndex <= 3;
      addElement(elements, id, "nectar", alliance,
        inCell ? { kind: "upward-cell", hiveAlliance: alliance } : { kind: "alliance-area", alliance },
        inCell ? "field" : "alliance-area", [], [], inCell ? [{ hiveAlliance: alliance, facing: "up" }] : []);
    }
  }

  const rankingThresholds = { ...(options.rankingThresholds ?? BIOBUZZ_DEFAULT_RANKING_THRESHOLDS) };
  validateThresholds(rankingThresholds);
  const blankBreakdown = (): ScoreBreakdown => ({
    leave: 0,
    autoPark: 0,
    teleopPark: 0,
    hiveTips: 0,
    upwardCellElements: 0,
    ownedFlowerElements: 0,
    bottomNectarBonuses: 0,
    gardenElements: 0,
    foulsReceived: 0,
    refereeAdjustments: 0,
  });
  const blankRpBreakdown = (): RankingPointBreakdown => ({
    win: 0, tie: 0, swarm: 0, pollinator1: 0, pollinator2: 0, refereeAdjustment: 0,
  });

  return {
    timestampMs: 0,
    completed: false,
    robotStarts,
    rankingThresholds,
    hives: { red: { ...options.hives.red }, blue: { ...options.hives.blue } },
    robots,
    elements,
    flowerStacks: Object.fromEntries(BIOBUZZ_FLOWER_IDS.map((id) => [id, []])) as unknown as Record<FlowerId, readonly ElementId[]>,
    scores: { red: 0, blue: 0 },
    scoreBreakdown: { red: blankBreakdown(), blue: blankBreakdown() },
    tips: { red: 0, blue: 0 },
    tipsByPeriod: { red: { auto: 0, teleop: 0 }, blue: { auto: 0, teleop: 0 } },
    humanEntries: { red: 0, blue: 0 },
    autoAchievementsAssessed: false,
    teleopParkAssessed: false,
    finalScoringAssessed: false,
    fouls: [],
    warnings: [],
    refereeReviews: [],
    refereeAdjustments: [],
    rankingPoints: { red: 0, blue: 0 },
    rankingPointBreakdown: { red: blankRpBreakdown(), blue: blankRpBreakdown() },
    pins: {},
    suppressedPinPairs: [],
    activeControlReviewKeys: [],
    activeOpponentNectarReviewKeys: [],
  };
}

/** Applies one timestamped input and returns a new state without mutating `state`. Inputs must
 * arrive in nondecreasing timestamp order. At equal timestamps, submit HIVE TIPs and human-entry
 * events before the corresponding physics observation. */
export function applyBiobuzzInput(state: BiobuzzMatchState, input: BiobuzzMatchInput): BiobuzzMatchState {
  assertTimestamp(input.timestampMs);
  if (input.timestampMs < state.timestampMs) throw new RangeError("BIOBUZZ inputs must be timestamp ordered");
  if (state.completed && input.type !== "referee-adjustment") throw new Error("Cannot apply match inputs after final settle");

  const next = cloneState(state);
  if (state.completed && input.type === "referee-adjustment") {
    applyRefereeAdjustment(next, input);
    awardRankingPoints(next);
    next.timestampMs = input.timestampMs;
    return next;
  }
  advancePinTimers(next, input.timestampMs);

  const isExactAutoBoundaryObservation = input.type === "observation" && input.timestampMs === BIOBUZZ_AUTO_MS;
  if (!next.autoAchievementsAssessed && input.timestampMs >= BIOBUZZ_AUTO_MS && !isExactAutoBoundaryObservation) {
    assessAutoAchievements(next);
  }

  switch (input.type) {
    case "observation":
      applyObservation(next, input);
      if (input.timestampMs === BIOBUZZ_AUTO_MS && !next.autoAchievementsAssessed) assessAutoAchievements(next);
      if (input.allRobotsAndElementsSettled) {
        if (input.timestampMs < BIOBUZZ_MATCH_END_MS) {
          throw new RangeError("A match cannot be settled before TELEOP ends");
        }
        finalizeMatch(next);
      }
      break;
    case "hive-tip":
      applyHiveTip(next, input);
      break;
    case "human-nectar-entry":
      applyHumanNectarEntry(next, input);
      break;
    case "referee-adjustment":
      applyRefereeAdjustment(next, input);
      break;
    case "observed-violation": {
      const robot = next.robotStarts.find((robot) => robot.id === input.robotId);
      if (!robot) throw new Error(`Unknown robot: ${input.robotId}`);
      if (input.elementId) assertElement(next, input.elementId);
      if (input.ruleId === "G402") {
        if (input.timestampMs >= BIOBUZZ_AUTO_MS) throw new Error("AUTO interference must occur during AUTO.");
        if (!next.fouls.some((foul) => foul.ruleId === "G402" && foul.offendingAlliance === robot.alliance)) addFoul(next, input.timestampMs, "G402", robot.alliance, 20, input.elementId ?? null, input.detail);
      } else if (input.ruleId === "G428") {
        addFoul(next, input.timestampMs, "G428", robot.alliance, 5, input.elementId ?? null, input.detail);
      } else next.warnings = [...next.warnings, { timestampMs: input.timestampMs, ruleId: input.ruleId, alliance: robot.alliance, robotId: robot.id, detail: input.detail }];
      if (input.ruleId !== "G428") next.refereeReviews = [...next.refereeReviews, { timestampMs: input.timestampMs, ruleId: input.ruleId, alliance: robot.alliance, robotId: robot.id, detail: input.detail, strategicAssessmentRequired: true }];
      break;
    }
  }

  next.timestampMs = input.timestampMs;
  return next;
}

function applyObservation(state: BiobuzzMatchState, observation: BiobuzzObservation): void {
  assertExactKeys(observation.robots, Object.keys(state.robots), "robot observations");
  assertExactKeys(observation.elements, Object.keys(state.elements), "element observations");
  assertExactKeys(observation.flowerStacks, [...BIOBUZZ_FLOWER_IDS], "FLOWER stacks");

  const nextRobots = {} as Record<RobotId, RobotObservation>;
  for (const robot of state.robotStarts) {
    const value = observation.robots[robot.id];
    if (!value) throw new Error(`Missing observation for robot ${robot.id}`);
    assertUnique(value.controlledElementIds, `CONTROL list for ${robot.id}`);
    for (const elementId of value.controlledElementIds) assertElement(state, elementId);
    nextRobots[robot.id] = {
      wallContact: value.wallContact,
      loadingZoneOverlap: value.loadingZoneOverlap,
      controlledElementIds: [...value.controlledElementIds],
    };
  }

  for (const elementId of Object.keys(state.elements)) {
    const observed = observation.elements[elementId];
    if (!observed) throw new Error(`Missing observation for element ${elementId}`);
    assertUnique(observed.gardenMemberships, `GARDEN memberships for ${elementId}`);
    assertUnique(observed.flowerMemberships, `FLOWER memberships for ${elementId}`);
    for (const alliance of observed.gardenMemberships) assertAlliance(alliance);
    for (const flowerId of observed.flowerMemberships) assertFlower(flowerId);
    assertUnique(observed.cellMemberships.map(({ hiveAlliance, facing }) => `${hiveAlliance}:${facing}`), `CELL memberships for ${elementId}`);
    for (const membership of observed.cellMemberships) {
      assertAlliance(membership.hiveAlliance);
      if (membership.facing !== "up" && membership.facing !== "down") throw new Error(`Invalid CELL facing for ${elementId}`);
    }
    const prior = state.elements[elementId];
    if (!prior) throw new Error(`Unknown element ${elementId}`);
    const nextStatus = observed.fieldStatus;
    if (!["field", "alliance-area", "out-of-field"].includes(nextStatus)) {
      throw new Error(`Invalid FIELD status for ${elementId}`);
    }
    const exited = prior.fieldStatus === "field" && nextStatus !== "field";
    const returned = prior.fieldStatus !== "field" && nextStatus === "field";
    state.elements[elementId] = {
      ...prior,
      fieldStatus: nextStatus,
      gardenMemberships: [...observed.gardenMemberships],
      flowerMemberships: [...observed.flowerMemberships],
      cellMemberships: observed.cellMemberships.map((membership) => ({ ...membership })),
      outs: prior.outs + (exited ? 1 : 0),
      reentries: prior.reentries + (returned && prior.outs > 0 ? 1 : 0),
    };
    if (prior.kind === "nectar" && observation.timestampMs < BIOBUZZ_FINAL_MINUTE_START_MS) {
      for (const flowerId of observed.flowerMemberships) {
        if (!prior.flowerMemberships.includes(flowerId)) {
          addFoul(state, observation.timestampMs, "G410", allianceOfNectar(prior), 20, elementId,
            "NECTAR entered a FLOWER scoring volume before the final 60 seconds");
        }
      }
    }
  }

  for (const flowerId of BIOBUZZ_FLOWER_IDS) {
    const stack = observation.flowerStacks[flowerId];
    assertUnique(stack, `stack for ${flowerId}`);
    for (const elementId of stack) {
      const element = assertElement(state, elementId);
      if (!element.flowerMemberships.includes(flowerId)) {
        throw new Error(`${elementId} is in ${flowerId}'s stack but not its scoring volume`);
      }
    }
    for (const element of Object.values(state.elements)) {
      if (element.flowerMemberships.includes(flowerId) && !stack.includes(element.id)) {
        throw new Error(`${element.id} is in ${flowerId}'s scoring volume but absent from its ordered stack`);
      }
    }
    state.flowerStacks[flowerId] = [...stack];
  }

  state.robots = nextRobots;
  updateRuleReviews(state, observation.timestampMs);
  updatePins(state, observation.timestampMs, observation.activePins);
  if (observation.allRobotsAndElementsSettled) {
    if (observation.activePins.length > 0) throw new Error("A settled match cannot contain active PIN observations");
  }
}

function applyHiveTip(state: BiobuzzMatchState, event: HiveTipEvent): void {
  assertAlliance(event.alliance);
  const hive = state.hives[event.alliance];
  if (event.fromStableState !== hive.stableState) {
    throw new Error(`HIVE TIP starts at ${event.fromStableState}; expected ${hive.stableState}`);
  }
  if (!event.toStableState || event.toStableState === event.fromStableState) {
    throw new Error("A HIVE TIP must reach the other stable state");
  }
  if (!event.newlyContactingDamperId || event.newlyContactingDamperId === hive.contactingDamperId) {
    throw new Error("A HIVE TIP requires the previously non-contacting damper to contact the frame");
  }
  state.hives[event.alliance] = {
    stableState: event.toStableState,
    contactingDamperId: event.newlyContactingDamperId,
  };
  state.tips[event.alliance] += 1;
  const period = event.timestampMs < BIOBUZZ_TELEOP_START_MS ? "auto" : "teleop";
  state.tipsByPeriod[event.alliance][period] += 1;
  addScore(state, event.alliance, "hiveTips", 20);
}

function applyHumanNectarEntry(state: BiobuzzMatchState, event: HumanNectarEntryEvent): void {
  assertAlliance(event.actorAlliance);
  if (event.timestampMs > BIOBUZZ_MATCH_END_MS) throw new RangeError("Human NECTAR entries cannot occur after match time");
  const element = assertElement(state, event.nectarId);
  if (element.kind !== "nectar") throw new Error(`${event.nectarId} is not NECTAR`);
  if (element.fieldStatus === "field") throw new Error(`${event.nectarId} must be outside the FIELD before a human entry`);

  const hadTipUnlock = state.humanEntries[event.actorAlliance] < state.tips[event.actorAlliance];
  if (event.timestampMs < BIOBUZZ_FINAL_MINUTE_START_MS && !hadTipUnlock) {
    addFoul(state, event.timestampMs, "G426", event.actorAlliance, 5, event.nectarId,
      "Human introduced NECTAR before a HIVE TIP unlocked another entry");
  }
  const legalRoute = !event.usedTool
    && event.firstContact === "tile-in-alliance-loading-zone"
    && element.alliance === event.actorAlliance;
  if (!legalRoute) {
    addFoul(state, event.timestampMs, "G427", event.actorAlliance, 5, event.nectarId,
      "Human NECTAR entry did not satisfy the alliance, no-tool, and loading-zone tile-contact requirements");
  }

  state.humanEntries[event.actorAlliance] += 1;
  const returned = element.outs > 0;
  state.elements[event.nectarId] = {
    ...element,
    fieldStatus: "field",
    gardenMemberships: [],
    flowerMemberships: [],
    cellMemberships: [],
    reentries: element.reentries + (returned ? 1 : 0),
    humanEntryCount: element.humanEntryCount + 1,
  };
}

function applyRefereeAdjustment(state: BiobuzzMatchState, event: RefereeAdjustmentEvent): void {
  assertAlliance(event.alliance);
  if (!Number.isSafeInteger(event.matchPointsDelta)) throw new RangeError("Referee match-point adjustment must be an integer");
  const rankingPointsDelta = event.rankingPointsDelta ?? 0;
  if (!Number.isSafeInteger(rankingPointsDelta)) throw new RangeError("Referee RP adjustment must be an integer");
  if (!event.note.trim()) throw new Error("A referee adjustment requires a note");
  state.scores[event.alliance] += event.matchPointsDelta;
  state.scoreBreakdown[event.alliance].refereeAdjustments += event.matchPointsDelta;
  state.rankingPointBreakdown[event.alliance].refereeAdjustment += rankingPointsDelta;
  state.refereeAdjustments = [...state.refereeAdjustments, {
    timestampMs: event.timestampMs,
    alliance: event.alliance,
    matchPointsDelta: event.matchPointsDelta,
    rankingPointsDelta,
    ruleId: event.ruleId ?? null,
    warning: event.warning ?? null,
    note: event.note,
  }];
}

function assessAutoAchievements(state: BiobuzzMatchState): void {
  for (const robot of state.robotStarts) {
    const observation = state.robots[robot.id];
    if (!observation) continue;
    if (!observation.wallContact) addScore(state, robot.alliance, "leave", 3);
    if (observation.loadingZoneOverlap) addScore(state, robot.alliance, "autoPark", 5);
  }
  state.autoAchievementsAssessed = true;
}

function finalizeMatch(state: BiobuzzMatchState): void {
  if (state.finalScoringAssessed) return;

  for (const robot of state.robotStarts) {
    const observation = state.robots[robot.id];
    if (observation?.loadingZoneOverlap) addScore(state, robot.alliance, "teleopPark", 5);
  }

  for (const element of Object.values(state.elements)) {
    for (const membership of element.cellMemberships) {
      if (membership.facing === "up") addScore(state, membership.hiveAlliance, "upwardCellElements", 2);
    }
    for (const garden of element.gardenMemberships) addScore(state, garden, "gardenElements", 1);
  }

  for (const flowerId of BIOBUZZ_FLOWER_IDS) {
    const stack = state.flowerStacks[flowerId] ?? [];
    const scoringElements = stack.map((id) => assertElement(state, id));
    const nectarAtLevels = scoringElements.filter((element) => element.kind === "nectar");
    const topNectar = nectarAtLevels.at(-1);
    if (!topNectar) continue;
    const owner = allianceOfNectar(topNectar);
    addScore(state, owner, "ownedFlowerElements", scoringElements.length * 2);
    const bottomNectar = nectarAtLevels[0];
    if (bottomNectar) addScore(state, allianceOfNectar(bottomNectar), "bottomNectarBonuses", 5);
  }

  state.teleopParkAssessed = true;
  state.finalScoringAssessed = true;
  awardRankingPoints(state);
  state.completed = true;
}

function awardRankingPoints(state: BiobuzzMatchState): void {
  const winner = state.scores.red === state.scores.blue ? null : state.scores.red > state.scores.blue ? "red" : "blue";
  for (const alliance of BIOBUZZ_ALLIANCES) {
    const breakdown = state.rankingPointBreakdown[alliance];
    breakdown.win = 0;
    breakdown.tie = 0;
    if (winner === null) breakdown.tie = 1;
    else if (winner === alliance) breakdown.win = 3;

    const swarmThreshold = state.rankingThresholds.swarmPoints;
    if (swarmThreshold !== null &&
      state.scoreBreakdown[alliance].leave + state.scoreBreakdown[alliance].autoPark + state.scoreBreakdown[alliance].teleopPark >= swarmThreshold) {
      breakdown.swarm = 1;
    }
    if (state.rankingThresholds.pollinator1Tips !== null && state.tips[alliance] >= state.rankingThresholds.pollinator1Tips) {
      breakdown.pollinator1 = 1;
    }
    if (state.rankingThresholds.pollinator2Tips !== null && state.tips[alliance] >= state.rankingThresholds.pollinator2Tips) {
      breakdown.pollinator2 = 1;
    }
    state.rankingPoints[alliance] = breakdown.win + breakdown.tie + breakdown.swarm
      + breakdown.pollinator1 + breakdown.pollinator2 + breakdown.refereeAdjustment;
  }
}

function updateRuleReviews(state: BiobuzzMatchState, timestampMs: number): void {
  const controlKeys = new Set<string>();
  const nectarKeys = new Set<string>();
  for (const robot of state.robotStarts) {
    const observation = state.robots[robot.id];
    if (!observation) continue;
    if (observation.controlledElementIds.length > BIOBUZZ_MAX_CONTROLLED_ELEMENTS) {
      const key = robot.id;
      controlKeys.add(key);
      if (!state.activeControlReviewKeys.includes(key)) {
        const detail = `Robot controls ${observation.controlledElementIds.length} scoring elements; G407 allows at most four.`;
        state.warnings = [...state.warnings, { timestampMs, ruleId: "G407", alliance: robot.alliance, robotId: robot.id, detail }];
        state.refereeReviews = [...state.refereeReviews, {
          timestampMs, ruleId: "G407", alliance: robot.alliance, robotId: robot.id, detail, strategicAssessmentRequired: true,
        }];
      }
    }
    for (const elementId of observation.controlledElementIds) {
      const element = state.elements[elementId];
      if (element?.kind === "nectar" && element.alliance !== robot.alliance) {
        const key = `${robot.id}\u0000${elementId}`;
        nectarKeys.add(key);
        if (!state.activeOpponentNectarReviewKeys.includes(key)) {
          const detail = `Robot controls opposing-alliance NECTAR ${elementId}; G408 prohibits this.`;
          state.warnings = [...state.warnings, { timestampMs, ruleId: "G408", alliance: robot.alliance, robotId: robot.id, detail }];
          state.refereeReviews = [...state.refereeReviews, {
            timestampMs, ruleId: "G408", alliance: robot.alliance, robotId: robot.id, detail, strategicAssessmentRequired: true,
          }];
        }
      }
    }
  }
  state.activeControlReviewKeys = [...controlKeys];
  state.activeOpponentNectarReviewKeys = [...nectarKeys];
}

function updatePins(state: BiobuzzMatchState, timestampMs: number, observations: readonly PinObservation[]): void {
  const current = new Map<string, PinObservation>();
  for (const observation of observations) {
    if (observation.pinningRobotId === observation.pinnedRobotId) throw new Error("A robot cannot PIN itself");
    const pinning = state.robotStarts.find((robot) => robot.id === observation.pinningRobotId);
    const pinned = state.robotStarts.find((robot) => robot.id === observation.pinnedRobotId);
    if (!pinning || !pinned) throw new Error("PIN observation references an unknown robot");
    if (pinning.alliance === pinned.alliance) continue;
    for (const [name, value] of Object.entries({
      separationFeet: observation.separationFeet,
      pinningRobotDisplacementFeet: observation.pinningRobotDisplacementFeet,
      pinnedRobotDisplacementFeet: observation.pinnedRobotDisplacementFeet,
    })) {
      if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`);
    }
    const key = pinKey(observation.pinningRobotId, observation.pinnedRobotId);
    if (current.has(key)) throw new Error("Duplicate PIN pair in one observation");
    current.set(key, observation);
  }

  for (const key of Object.keys(state.pins)) {
    if (!current.has(key)) delete state.pins[key];
  }
  const suppressed = new Set(state.suppressedPinPairs);
  for (const [key, observation] of current) {
    if (observation.pinningRobotIsPinned) {
      delete state.pins[key];
      suppressed.delete(key);
      continue;
    }
    const resetCondition = observation.separationFeet >= 2
      || observation.pinningRobotDisplacementFeet >= 2
      || observation.pinnedRobotDisplacementFeet >= 2;
    if (suppressed.has(key)) {
      if (resetCondition) continue;
      suppressed.delete(key);
    }
    const progress = state.pins[key];
    if (!progress) {
      state.pins[key] = {
        startedAtMs: timestampMs,
        lastAdvancedAtMs: timestampMs,
        activeDurationMs: 0,
        clearConditionSinceMs: resetCondition ? timestampMs : null,
      };
    } else {
      progress.clearConditionSinceMs = resetCondition ? (progress.clearConditionSinceMs ?? timestampMs) : null;
      progress.lastAdvancedAtMs = timestampMs;
    }
  }
  state.suppressedPinPairs = [...suppressed];
}

function advancePinTimers(state: BiobuzzMatchState, timestampMs: number): void {
  const suppressed = new Set(state.suppressedPinPairs);
  for (const [key, progress] of Object.entries(state.pins)) {
    if (progress.clearConditionSinceMs !== null) {
      if (timestampMs - progress.clearConditionSinceMs > BIOBUZZ_PIN_RESET_DWELL_MS) {
        delete state.pins[key];
        suppressed.add(key);
      } else {
        progress.lastAdvancedAtMs = timestampMs;
      }
      continue;
    }
    const deltaMs = timestampMs - progress.lastAdvancedAtMs;
    if (deltaMs <= 0) continue;
    const priorDuration = progress.activeDurationMs;
    const nextDuration = priorDuration + deltaMs;
    // G421 applies only after its three-second allowance is exceeded.
    for (let threshold = BIOBUZZ_PIN_LIMIT_MS + 1; threshold <= nextDuration; threshold += BIOBUZZ_PIN_LIMIT_MS) {
      if (threshold > priorDuration) {
        const [pinningRobotId] = parsePinKey(key);
        const pinningRobot = state.robotStarts.find((robot) => robot.id === pinningRobotId);
        if (pinningRobot) {
          addFoul(state, timestampMs - (nextDuration - threshold), "G421", pinningRobot.alliance, 20, null,
            threshold === 3_000 ? "Opponent PIN exceeded three seconds" : "Opponent PIN continued for another three seconds");
        }
      }
    }
    progress.activeDurationMs = nextDuration;
    progress.lastAdvancedAtMs = timestampMs;
  }
  state.suppressedPinPairs = [...suppressed];
}

function addFoul(
  state: BiobuzzMatchState,
  timestampMs: number,
  ruleId: MatchFoul["ruleId"],
  offendingAlliance: Alliance,
  points: number,
  elementId: ElementId | null,
  detail: string,
): void {
  const creditedAlliance = otherAlliance(offendingAlliance);
  state.scores[creditedAlliance] += points;
  state.scoreBreakdown[creditedAlliance].foulsReceived += points;
  state.fouls = [...state.fouls, { timestampMs, ruleId, offendingAlliance, creditedAlliance, points, elementId, detail }];
}

function addScore(state: BiobuzzMatchState, alliance: Alliance, category: keyof ScoreBreakdown, points: number): void {
  state.scores[alliance] += points;
  state.scoreBreakdown[alliance][category] += points;
}

function cloneState(state: BiobuzzMatchState): BiobuzzMatchState {
  return {
    ...state,
    robotStarts: state.robotStarts.map((robot) => ({ ...robot })),
    rankingThresholds: { ...state.rankingThresholds },
    hives: { red: { ...state.hives.red }, blue: { ...state.hives.blue } },
    robots: Object.fromEntries(Object.entries(state.robots).map(([id, robot]) => [id, {
      ...robot, controlledElementIds: [...robot.controlledElementIds],
    }])) as unknown as Record<RobotId, RobotObservation>,
    elements: Object.fromEntries(Object.entries(state.elements).map(([id, element]) => [id, {
      ...element,
      startLocation: { ...element.startLocation },
      gardenMemberships: [...element.gardenMemberships],
      flowerMemberships: [...element.flowerMemberships],
      cellMemberships: element.cellMemberships.map((membership) => ({ ...membership })),
    }])),
    flowerStacks: Object.fromEntries(BIOBUZZ_FLOWER_IDS.map((id) => [id, [...state.flowerStacks[id]]])) as unknown as Record<FlowerId, readonly ElementId[]>,
    scores: { ...state.scores },
    scoreBreakdown: { red: { ...state.scoreBreakdown.red }, blue: { ...state.scoreBreakdown.blue } },
    tips: { ...state.tips },
    tipsByPeriod: { red: { ...state.tipsByPeriod.red }, blue: { ...state.tipsByPeriod.blue } },
    humanEntries: { ...state.humanEntries },
    fouls: state.fouls.map((foul) => ({ ...foul })),
    warnings: state.warnings.map((warning) => ({ ...warning })),
    refereeReviews: state.refereeReviews.map((review) => ({ ...review })),
    refereeAdjustments: state.refereeAdjustments.map((adjustment) => ({ ...adjustment })),
    rankingPoints: { ...state.rankingPoints },
    rankingPointBreakdown: { red: { ...state.rankingPointBreakdown.red }, blue: { ...state.rankingPointBreakdown.blue } },
    pins: Object.fromEntries(Object.entries(state.pins).map(([key, progress]) => [key, { ...progress }])),
    suppressedPinPairs: [...state.suppressedPinPairs],
    activeControlReviewKeys: [...state.activeControlReviewKeys],
    activeOpponentNectarReviewKeys: [...state.activeOpponentNectarReviewKeys],
  };
}

function addElement(
  elements: Record<ElementId, ElementState>, id: ElementId, kind: ElementKind, alliance: Alliance | null,
  startLocation: ElementStartLocation, fieldStatus: ElementFieldStatus, gardenMemberships: readonly Alliance[],
  flowerMemberships: readonly FlowerId[], cellMemberships: readonly CellMembership[],
): void {
  elements[id] = {
    id, kind, alliance, startLocation, fieldStatus, gardenMemberships, flowerMemberships, cellMemberships,
    outs: 0, reentries: 0, humanEntryCount: 0,
  };
}

function validateStarts(options: CreateBiobuzzMatchOptions): void {
  if (!Array.isArray(options.robots) || options.robots.length !== BIOBUZZ_ROBOT_IDS.length) throw new Error("BIOBUZZ requires exactly four robot starts");
  assertUnique(options.robots.map((robot) => robot.id), "robot IDs");
  for (const robot of options.robots) {
    if (!robot.id.trim()) throw new Error("Robot IDs must be non-empty");
    if (!(BIOBUZZ_ROBOT_IDS as readonly string[]).includes(robot.id)) {
      throw new Error(`Robot ID must be one of ${BIOBUZZ_ROBOT_IDS.join(", ")}`);
    }
    assertAlliance(robot.alliance);
  }
  for (const alliance of BIOBUZZ_ALLIANCES) {
    if (options.robots.filter((robot) => robot.alliance === alliance).length !== 2) {
      throw new Error(`BIOBUZZ requires two ${alliance} robot starts`);
    }
    const hive = options.hives?.[alliance];
    if (!hive?.stableState.trim() || !hive.contactingDamperId.trim()) {
      throw new Error(`Initial ${alliance} HIVE stable state and contacting damper are required`);
    }
  }
}

function validateThresholds(thresholds: RankingThresholds): void {
  for (const [name, threshold] of Object.entries(thresholds)) {
    if (threshold !== null && (!Number.isSafeInteger(threshold) || threshold < 0)) {
      throw new RangeError(`${name} threshold must be null or a non-negative integer`);
    }
  }
}

function assertTimestamp(timestampMs: number): void {
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) throw new RangeError("timestampMs must be a non-negative safe integer");
}

function assertExactKeys(value: object, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${label} must contain exactly: ${sortedExpected.join(", ")}`);
  }
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must not contain duplicates`);
}

function assertElement(state: BiobuzzMatchState, id: ElementId): ElementState {
  const element = state.elements[id];
  if (!element) throw new Error(`Unknown scoring element ${id}`);
  return element;
}

function assertFlower(flowerId: string): asserts flowerId is FlowerId {
  if (!(BIOBUZZ_FLOWER_IDS as readonly string[]).includes(flowerId)) throw new Error(`Unknown FLOWER ${flowerId}`);
}

function assertAlliance(alliance: string): asserts alliance is Alliance {
  if (alliance !== "red" && alliance !== "blue") throw new Error(`Unknown alliance ${alliance}`);
}

function allianceOfNectar(element: ElementState): Alliance {
  if (element.kind !== "nectar" || element.alliance === null) throw new Error(`${element.id} is not alliance-colored NECTAR`);
  return element.alliance;
}

function otherAlliance(alliance: Alliance): Alliance {
  return alliance === "red" ? "blue" : "red";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function range(start: number, endInclusive: number): number[] {
  return Array.from({ length: endInclusive - start + 1 }, (_, index) => start + index);
}

function pinKey(pinningRobotId: string, pinnedRobotId: string): string {
  return JSON.stringify([pinningRobotId, pinnedRobotId]);
}

function parsePinKey(key: string): [string, string] {
  const value: unknown = JSON.parse(key);
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "string" || typeof value[1] !== "string") {
    throw new Error("Corrupt PIN state");
  }
  return [value[0], value[1]];
}
