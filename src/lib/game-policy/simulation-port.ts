import type { RobotId, SimulationWorldOptions } from "@ftc-studio/sim-core";
import type { PolicyAction, PolicyObservation, POLICY_CONTRACT_VERSION } from "./contracts";

export type CurriculumStage = "pickup" | "feed" | "aim" | "hives" | "flowers" | "park" | "self-play";

export interface BiobuzzEpisodeRequest {
  seed: number;
  curriculumStage: CurriculumStage;
  /** Keep the physical world configuration explicit and serializable for reproducible runs. */
  worldOptions: SimulationWorldOptions;
  /** Alliance swap used by holdout evaluation; not exposed as a policy observation feature. */
  swapAlliances?: boolean;
}

export interface PolicyRewardStats {
  redScore: number;
  blueScore: number;
  redTips: number;
  blueTips: number;
  redUpwardCellElements: number;
  blueUpwardCellElements: number;
  redOwnedFlowerElements: number;
  blueOwnedFlowerElements: number;
  redBottomNectarBonuses: number;
  blueBottomNectarBonuses: number;
  redGardenElements: number;
  blueGardenElements: number;
  redAutoPark: number;
  blueAutoPark: number;
  redTeleopPark: number;
  blueTeleopPark: number;
  completed: boolean;
}

export interface PolicyWorldFrame {
  physicsVersion: string;
  tick: number;
  phase: string;
  observations: Record<RobotId, PolicyObservation>;
  rewardStats: PolicyRewardStats;
  /** Only aggregate public match facts and measurement diagnostics. Never policy input. */
  publicInfo: Record<string, number | string | boolean>;
}

export interface PolicyStepResult {
  frame: PolicyWorldFrame;
  rewards: Record<RobotId, number>;
  terminated: boolean;
  truncated: boolean;
}

/** Adapter implemented against GameSimulation and the shared SimulationWorld. */
export interface BiobuzzPolicySimulation {
  readonly physicsVersion: string;
  reset(seed: number, curriculumStage: CurriculumStage): Promise<PolicyWorldFrame>;
  /** Advances one 20ms robot-control frame and all 4x4 underlying 200Hz physics ticks. */
  step(actions: Record<RobotId, PolicyAction>): Promise<PolicyStepResult>;
  close(): Promise<void>;
}

export interface BiobuzzPolicyFactoryRequest {
  worldOptions: SimulationWorldOptions;
  seed: number;
  curriculumStage: CurriculumStage;
  contractVersion: typeof POLICY_CONTRACT_VERSION;
  /** Training enables per-episode sampling; browser matches default to the nominal values. */
  randomizeExperimentalParameters?: boolean;
}

export type BiobuzzPolicySimulationFactory = (request: BiobuzzPolicyFactoryRequest) => Promise<BiobuzzPolicySimulation>;

export function allianceReward(stats: PolicyRewardStats, alliance: "red" | "blue"): number {
  const own = alliance === "red" ? stats.redScore : stats.blueScore;
  const other = alliance === "red" ? stats.blueScore : stats.redScore;
  return (own - other) / 20;
}

/**
 * Potential-based task shaping. It rewards state progress, not canned actions or target macros.
 * Official score differential remains the reward signal in every stage.
 */
export function stagePotential(stats: PolicyRewardStats, robotId: RobotId, stage: CurriculumStage, ownPayloadCount = 0): number {
  const alliance = robotId.startsWith("red-") ? "red" : "blue";
  const own = (red: number, blue: number): number => alliance === "red" ? red : blue;
  switch (stage) {
    case "pickup": return ownPayloadCount * 0.05;
    case "feed": return own(stats.redUpwardCellElements, stats.blueUpwardCellElements) * 0.08;
    case "aim": return own(stats.redUpwardCellElements, stats.blueUpwardCellElements) * 0.08 + own(stats.redTips, stats.blueTips) * 0.25;
    case "hives": return own(stats.redTips, stats.blueTips) * 0.25;
    case "flowers": return own(stats.redOwnedFlowerElements, stats.blueOwnedFlowerElements) * 0.1 + own(stats.redBottomNectarBonuses, stats.blueBottomNectarBonuses) * 0.1;
    case "park": return own(stats.redAutoPark + stats.redTeleopPark, stats.blueAutoPark + stats.blueTeleopPark) * 0.1;
    case "self-play": return 0;
  }
}

export function calculatePolicyRewards(previous: PolicyRewardStats, next: PolicyRewardStats, stage: CurriculumStage, previousPayloadCounts: Record<RobotId, number>, nextPayloadCounts: Record<RobotId, number>): Record<RobotId, number> {
  return Object.fromEntries((Object.keys(nextPayloadCounts) as RobotId[]).map((robotId) => {
    const alliance = robotId.startsWith("red-") ? "red" : "blue";
    const scoreDelta = allianceReward(next, alliance) - allianceReward(previous, alliance);
    const shapingDelta = stagePotential(next, robotId, stage, nextPayloadCounts[robotId]) - stagePotential(previous, robotId, stage, previousPayloadCounts[robotId]);
    return [robotId, scoreDelta + shapingDelta];
  })) as Record<RobotId, number>;
}
