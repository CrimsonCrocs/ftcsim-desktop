import { describe, expect, it } from "vitest";

import {
  BIOBUZZ_ACTIVE_MATCH_MS,
  BIOBUZZ_ELEMENT_IDS,
  BIOBUZZ_FLOWER_IDS,
  BIOBUZZ_MATCH_END_MS,
  BIOBUZZ_NECTAR_IDS,
  BIOBUZZ_POLLEN_IDS,
  BIOBUZZ_ROBOT_IDS,
  BIOBUZZ_TELEOP_START_MS,
  applyBiobuzzInput,
  createBiobuzzMatch,
  getBiobuzzPeriod,
  type Alliance,
  type BiobuzzMatchState,
  type BiobuzzObservation,
  type ElementId,
  type ElementObservation,
  type FlowerId,
  type HiveTipEvent,
  type PinObservation,
  type RobotObservation,
} from "./biobuzz-rules";

const robotStarts = [
  { id: "red-1", alliance: "red" },
  { id: "red-2", alliance: "red" },
  { id: "blue-1", alliance: "blue" },
  { id: "blue-2", alliance: "blue" },
] as const;

function newMatch(thresholds?: { swarmPoints: number | null; pollinator1Tips: number | null; pollinator2Tips: number | null }) {
  return createBiobuzzMatch({
    robots: robotStarts,
    hives: {
      red: { stableState: "a", contactingDamperId: "red-damper-a" },
      blue: { stableState: "a", contactingDamperId: "blue-damper-a" },
    },
    ...(thresholds ? { rankingThresholds: thresholds } : {}),
  });
}

function observation(
  state: BiobuzzMatchState,
  timestampMs: number,
  options: {
    robots?: Partial<Record<string, Partial<RobotObservation>>>;
    elements?: Partial<Record<ElementId, Partial<ElementObservation>>>;
    flowerStacks?: Partial<Record<FlowerId, readonly ElementId[]>>;
    activePins?: readonly PinObservation[];
    settled?: boolean;
  } = {},
): BiobuzzObservation {
  const robots = Object.fromEntries(state.robotStarts.map(({ id }) => {
    const current = state.robots[id];
    return [id, { ...current, ...options.robots?.[id] }];
  })) as BiobuzzObservation["robots"];
  const elements = Object.fromEntries(Object.entries(state.elements).map(([id, current]) => [id, {
    fieldStatus: current.fieldStatus,
    gardenMemberships: [...current.gardenMemberships],
    flowerMemberships: [...current.flowerMemberships],
    cellMemberships: current.cellMemberships.map((membership) => ({ ...membership })),
    ...options.elements?.[id],
  }])) as BiobuzzObservation["elements"];
  const flowerStacks = Object.fromEntries(BIOBUZZ_FLOWER_IDS.map((id) => [
    id,
    [...(options.flowerStacks?.[id] ?? state.flowerStacks[id])],
  ])) as unknown as BiobuzzObservation["flowerStacks"];
  return {
    type: "observation",
    timestampMs,
    robots,
    elements,
    flowerStacks,
    activePins: options.activePins ?? [],
    allRobotsAndElementsSettled: options.settled ?? false,
  };
}

function observe(state: BiobuzzMatchState, timestampMs: number, options?: Parameters<typeof observation>[2]) {
  return applyBiobuzzInput(state, observation(state, timestampMs, options));
}

function tip(state: BiobuzzMatchState, alliance: Alliance, timestampMs: number): BiobuzzMatchState {
  const hive = state.hives[alliance];
  const newlyContactingDamperId = hive.contactingDamperId.endsWith("a")
    ? `${alliance}-damper-b`
    : `${alliance}-damper-a`;
  const event: HiveTipEvent = {
    type: "hive-tip",
    timestampMs,
    alliance,
    fromStableState: hive.stableState,
    toStableState: hive.stableState === "a" ? "b" : "a",
    newlyContactingDamperId,
  };
  return applyBiobuzzInput(state, event);
}

describe("BIOBUZZ match setup and clock", () => {
  it("creates all 40 POLLEN and 16 NECTAR with stable IDs and V1 starting placements", () => {
    const state = newMatch();

    expect(BIOBUZZ_ROBOT_IDS).toEqual(["red-1", "red-2", "blue-1", "blue-2"]);
    expect(BIOBUZZ_POLLEN_IDS).toHaveLength(40);
    expect(BIOBUZZ_NECTAR_IDS).toHaveLength(16);
    expect(BIOBUZZ_ELEMENT_IDS).toHaveLength(56);
    expect(Object.keys(state.elements)).toHaveLength(56);
    expect(Object.values(state.elements).filter((element) => element.kind === "pollen")).toHaveLength(40);
    expect(Object.values(state.elements).filter((element) => element.kind === "nectar")).toHaveLength(16);
    expect(Object.values(state.elements).filter((element) => element.startLocation.kind === "flower")).toHaveLength(16);
    expect(Object.values(state.elements).filter((element) => element.startLocation.kind === "garden")).toHaveLength(8);
    expect(Object.values(state.elements).filter((element) => element.startLocation.kind === "robot-preload")).toHaveLength(16);
    expect(Object.values(state.elements).filter((element) => element.startLocation.kind === "upward-cell")).toHaveLength(6);
    expect(Object.values(state.elements).filter((element) => element.startLocation.kind === "alliance-area")).toHaveLength(10);
    expect(state.elements["pollen-17"]?.gardenMemberships).toEqual(["red"]);
    expect(state.elements["nectar-red-01"]?.cellMemberships).toEqual([{ hiveAlliance: "red", facing: "up" }]);
  });

  it("uses a 30s AUTO, 8s transition, 120s TELEOP and 150s active clock", () => {
    expect(BIOBUZZ_ACTIVE_MATCH_MS).toBe(150_000);
    expect(BIOBUZZ_MATCH_END_MS).toBe(158_000);
    expect(getBiobuzzPeriod(29_999)).toBe("auto");
    expect(getBiobuzzPeriod(30_000)).toBe("transition");
    expect(getBiobuzzPeriod(37_999)).toBe("transition");
    expect(getBiobuzzPeriod(38_000)).toBe("teleop");
    expect(getBiobuzzPeriod(157_999)).toBe("teleop");
    expect(getBiobuzzPeriod(158_000)).toBe("settling");
    expect(BIOBUZZ_TELEOP_START_MS).toBe(38_000);
  });
});

describe("BIOBUZZ scoring", () => {
  it("counts a transition-period TIP as AUTO and scores only a completed stable-state/damper change", () => {
    let state = newMatch();
    state = tip(state, "red", 30_000);
    expect(state.tips.red).toBe(1);
    expect(state.tipsByPeriod.red).toEqual({ auto: 1, teleop: 0 });
    expect(state.scores.red).toBe(20);
    expect(() => applyBiobuzzInput(state, {
      type: "hive-tip",
      timestampMs: 30_001,
      alliance: "red",
      fromStableState: "b",
      toStableState: "a",
      newlyContactingDamperId: "red-damper-b",
    })).toThrow(/previously non-contacting damper/);
  });

  it("assesses LEAVE and AUTO PARK at 30 seconds and TELEOP PARK after final settle", () => {
    let state = newMatch();
    state = observe(state, 29_999, { robots: { "red-1": { wallContact: false, loadingZoneOverlap: true } } });
    state = observe(state, 30_000);
    expect(state.scoreBreakdown.red.leave).toBe(3);
    expect(state.scoreBreakdown.red.autoPark).toBe(5);

    state = observe(state, BIOBUZZ_MATCH_END_MS, {
      robots: {
        "red-1": { loadingZoneOverlap: true },
        "red-2": { loadingZoneOverlap: true },
        "blue-1": { loadingZoneOverlap: true },
      },
      settled: true,
    });
    expect(state.completed).toBe(true);
    expect(state.scoreBreakdown.red.teleopPark).toBe(10);
    expect(state.scoreBreakdown.blue.teleopPark).toBe(5);
    expect(state.rankingPointBreakdown.red.swarm).toBe(1);
    expect(state.rankingPointBreakdown.blue.swarm).toBe(0);
  });

  it("scores top nectar ownership, bottom nectar bonus, every qualifying FLOWER element, gardens and upward CELL contents at settle", () => {
    let state = newMatch({ swarmPoints: null, pollinator1Tips: null, pollinator2Tips: null });
    const flowerElements = ["pollen-01", "nectar-red-04", "pollen-02", "nectar-blue-04"] as const;
    const elements: Partial<Record<ElementId, Partial<ElementObservation>>> = {};
    for (const id of flowerElements) elements[id] = { flowerMemberships: ["flower-1"] };
    state = observe(state, 0, {
      elements,
      flowerStacks: { "flower-1": flowerElements },
    });
    state = observe(state, BIOBUZZ_MATCH_END_MS, { settled: true });

    expect(state.scoreBreakdown.blue.ownedFlowerElements).toBe(8);
    expect(state.scoreBreakdown.red.ownedFlowerElements).toBe(0);
    expect(state.scoreBreakdown.red.bottomNectarBonuses).toBe(5);
    expect(state.scoreBreakdown.red.gardenElements).toBe(4);
    expect(state.scoreBreakdown.blue.gardenElements).toBe(4);
    expect(state.scoreBreakdown.red.upwardCellElements).toBe(6);
    expect(state.scoreBreakdown.blue.upwardCellElements).toBe(6);
  });

  it("awards ordinary win/tie RPs and uses optional published achievement thresholds", () => {
    let state = newMatch({ swarmPoints: 16, pollinator1Tips: 4, pollinator2Tips: 7 });
    state = observe(state, 0, {
      robots: {
        "red-1": { wallContact: false, loadingZoneOverlap: true },
        "red-2": { wallContact: false, loadingZoneOverlap: true },
      },
    });
    for (let index = 0; index < 7; index += 1) state = tip(state, "red", 38_000 + index);
    state = observe(state, 40_000, {
      robots: {
        "red-1": { wallContact: false, loadingZoneOverlap: true },
        "red-2": { wallContact: false, loadingZoneOverlap: true },
      },
    });
    state = observe(state, BIOBUZZ_MATCH_END_MS, { settled: true });

    expect(state.rankingPointBreakdown.red).toMatchObject({ win: 3, swarm: 1, pollinator1: 1, pollinator2: 1 });
    expect(state.rankingPoints.red).toBe(6);

    let regional = newMatch({ swarmPoints: null, pollinator1Tips: null, pollinator2Tips: null });
    regional = observe(regional, BIOBUZZ_MATCH_END_MS, { settled: true });
    expect(regional.rankingPointBreakdown.red).toMatchObject({ swarm: 0, pollinator1: 0, pollinator2: 0 });
    expect(regional.rankingPointBreakdown.red.tie).toBe(1);
    expect(regional.rankingPointBreakdown.blue.tie).toBe(1);
  });
});

describe("objective fouls and referee-dependent decisions", () => {
  it("applies G410 at 20 points per early NECTAR entry and permits entry at exactly the final-minute boundary", () => {
    let state = newMatch();
    state = observe(state, 0);
    state = observe(state, 97_999, {
      elements: { "nectar-red-04": { flowerMemberships: ["flower-1"] } },
      flowerStacks: { "flower-1": ["nectar-red-04"] },
    });
    expect(state.fouls).toHaveLength(1);
    expect(state.fouls[0]).toMatchObject({ ruleId: "G410", points: 20, creditedAlliance: "blue", elementId: "nectar-red-04" });

    let boundary = newMatch();
    boundary = observe(boundary, 0);
    boundary = observe(boundary, 98_000, {
      elements: { "nectar-red-04": { flowerMemberships: ["flower-1"] } },
      flowerStacks: { "flower-1": ["nectar-red-04"] },
    });
    expect(boundary.fouls).toHaveLength(0);
  });

  it("applies G426 and G427 as separate five-point minor fouls and tracks outs/reentries", () => {
    let state = newMatch();
    state = applyBiobuzzInput(state, {
      type: "human-nectar-entry",
      timestampMs: 10_000,
      actorAlliance: "red",
      nectarId: "nectar-red-04",
      usedTool: true,
      firstContact: "robot",
    });
    expect(state.fouls.map(({ ruleId, points }) => [ruleId, points])).toEqual([["G426", 5], ["G427", 5]]);
    expect(state.scores.blue).toBe(10);
    expect(state.elements["nectar-red-04"]?.humanEntryCount).toBe(1);

    state = observe(state, 11_000, {
      elements: { "nectar-red-04": { fieldStatus: "out-of-field" } },
    });
    expect(state.elements["nectar-red-04"]?.outs).toBe(1);
    state = applyBiobuzzInput(state, {
      type: "human-nectar-entry",
      timestampMs: 98_000,
      actorAlliance: "red",
      nectarId: "nectar-red-04",
      usedTool: false,
      firstContact: "tile-in-alliance-loading-zone",
    });
    expect(state.fouls).toHaveLength(2);
    expect(state.elements["nectar-red-04"]?.reentries).toBe(1);
    expect(state.elements["nectar-red-04"]?.humanEntryCount).toBe(2);
  });

  it("flags CONTROL over four without treating incidental contact as CONTROL or deciding strategy", () => {
    let state = newMatch();
    state = observe(state, 0, {
      robots: { "red-1": { controlledElementIds: ["pollen-01", "pollen-02", "pollen-03", "pollen-04", "pollen-05"] } },
    });
    expect(state.warnings).toHaveLength(1);
    expect(state.refereeReviews).toMatchObject([{ ruleId: "G407", strategicAssessmentRequired: true }]);
    expect(state.fouls).toHaveLength(0);
    state = observe(state, 20);
    expect(state.warnings).toHaveLength(1);
  });

  it("calls G421 only after three seconds, pauses at two feet, and resets after more than three seconds clear", () => {
    let state = newMatch();
    const pin: PinObservation = {
      pinningRobotId: "red-1",
      pinnedRobotId: "blue-1",
      separationFeet: 1,
      pinningRobotDisplacementFeet: 0,
      pinnedRobotDisplacementFeet: 0,
      pinningRobotIsPinned: false,
    };
    state = observe(state, 0, { activePins: [pin] });
    state = observe(state, 2_999, { activePins: [pin] });
    expect(state.fouls).toHaveLength(0);
    state = observe(state, 3_000, { activePins: [pin] });
    expect(state.fouls).toHaveLength(0);
    state = observe(state, 3_001, { activePins: [pin] });
    expect(state.fouls).toMatchObject([{ ruleId: "G421", points: 20, offendingAlliance: "red" }]);

    const separated = { ...pin, separationFeet: 2 };
    state = observe(state, 4_001, { activePins: [separated] });
    state = observe(state, 6_999, { activePins: [separated] });
    expect(state.fouls).toHaveLength(1);
    state = observe(state, 7_001, { activePins: [separated] });
    expect(state.suppressedPinPairs).toHaveLength(0);
    state = observe(state, 7_002, { activePins: [separated] });
    expect(state.suppressedPinPairs).toHaveLength(1);

    state = observe(state, 10_000, { activePins: [pin] });
    state = observe(state, 13_000, { activePins: [pin] });
    expect(state.fouls).toHaveLength(1);
    state = observe(state, 13_001, { activePins: [pin] });
    expect(state.fouls).toHaveLength(2);
    expect(state.scores.blue).toBe(40);
  });

  it("does not mutate its input state and produces the same result from the same event", () => {
    const initial = newMatch();
    const input: HiveTipEvent = {
      type: "hive-tip",
      timestampMs: 30_000,
      alliance: "red",
      fromStableState: "a",
      toStableState: "b",
      newlyContactingDamperId: "red-damper-b",
    };
    const first = applyBiobuzzInput(initial, input);
    const replay = applyBiobuzzInput(initial, input);

    expect(initial.scores.red).toBe(0);
    expect(initial.hives.red.stableState).toBe("a");
    expect(first).toEqual(replay);
  });

  it("accepts explicit referee adjustments for subjective rulings and TBA threshold cases", () => {
    let state = newMatch({ swarmPoints: null, pollinator1Tips: null, pollinator2Tips: null });
    state = applyBiobuzzInput(state, {
      type: "referee-adjustment",
      timestampMs: 50_000,
      alliance: "red",
      matchPointsDelta: -20,
      rankingPointsDelta: 1,
      ruleId: "G408",
      warning: "yellow",
      note: "Head referee ruling after review",
    });
    state = observe(state, BIOBUZZ_MATCH_END_MS, { settled: true });
    expect(state.scores.red).toBe(-10);
    expect(state.scoreBreakdown.red.refereeAdjustments).toBe(-20);
    expect(state.refereeAdjustments[0]).toMatchObject({ ruleId: "G408", warning: "yellow" });
    expect(state.rankingPointBreakdown.red.refereeAdjustment).toBe(1);
    expect(state.rankingPoints.red).toBe(1);
  });

  it("recalculates winner ranking points after final-result corrections and their reversal", () => {
    const finalized = observe(newMatch({ swarmPoints: null, pollinator1Tips: null, pollinator2Tips: null }), BIOBUZZ_MATCH_END_MS, { settled: true });
    expect(finalized.completed).toBe(true);
    expect(finalized.scores.red).toBe(finalized.scores.blue);
    expect(finalized.rankingPoints).toEqual({ red: 1, blue: 1 });
    const corrected = applyBiobuzzInput(finalized, {
      type: "referee-adjustment", timestampMs: BIOBUZZ_MATCH_END_MS,
      alliance: "blue", matchPointsDelta: 5, rankingPointsDelta: 1,
      warning: "yellow", ruleId: "G402", note: "Reviewed contact after match",
    });
    expect(corrected.scores.blue).toBe(finalized.scores.blue + 5);
    expect(corrected.rankingPoints).toEqual({ red: 0, blue: 4 });
    expect(finalized.refereeAdjustments).toHaveLength(0);
    const reversed = applyBiobuzzInput(corrected, {
      type: "referee-adjustment", timestampMs: BIOBUZZ_MATCH_END_MS,
      alliance: "blue", matchPointsDelta: -5, rankingPointsDelta: -1,
      note: "Reverse previous correction",
    });
    expect(reversed.scores).toEqual(finalized.scores);
    expect(reversed.rankingPoints).toEqual(finalized.rankingPoints);
    expect(reversed.refereeAdjustments).toHaveLength(2);
    expect(reversed.completed).toBe(true);
  });
});
