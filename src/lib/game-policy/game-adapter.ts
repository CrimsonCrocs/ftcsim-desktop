import {
  BiobuzzRules,
  GameSimulation,
  PHYSICS_VERSION,
  WORLD_PHYSICAL_PARAMETERS,
  type Quaternion,
  type RobotId,
  type SimulationWorldOptions,
  type Vector3,
  type WorldObservation,
  type WorldRobotConfiguration,
  type WorldRobotSetup,
} from "@ftc-studio/sim-core";
import {
  POLICY_ACTION_VERSION,
  POLICY_CONTRACT_VERSION,
  POLICY_ROBOT_IDS,
  decodePolicyAction,
  encodePolicyObservation,
  type EstimatedRobotPose,
  type MatchPhase,
  type PolicyAction,
  type PolicyObservation,
  type PolicyObservationView,
  type PublicElementView,
  type PublicFlowerView,
  type PublicGardenView,
  type PublicHiveView,
  type PublicRobotView,
} from "./contracts";
import {
  calculatePolicyRewards,
  type BiobuzzPolicyFactoryRequest,
  type BiobuzzPolicySimulation,
  type CurriculumStage,
  type PolicyRewardStats,
  type PolicyWorldFrame,
} from "./simulation-port";
import { AutomatedHumanPlayer, AUTOMATED_HUMAN_PLAYER_VERSION } from "./human-player";

interface DetectedElement {
  view: PublicElementView;
  worldPosition: Vector3;
  radius: number;
}
interface RobotVisionFrame {
  cameraName: string;
  capturedAtMs: number;
  availableAtMs: number;
  elements: DetectedElement[];
  robots: PublicRobotView[];
  hives: PublicHiveView[];
}
interface CameraVisionState {
  nextCaptureAtMs: number;
  frames: RobotVisionFrame[];
  latest?: RobotVisionFrame;
}
interface RobotVisionState {
  cameras: Map<string, CameraVisionState>;
}
interface ObservationCache {
  seed: number;
  lastTick: number;
  robots: Map<RobotId, RobotVisionState>;
}

const observationCaches = new WeakMap<GameSimulation, ObservationCache>();
const commandSequences = new WeakMap<GameSimulation, Record<RobotId, number>>();
const CAMERA_FRAME_MAX_AGE_MS = 250;
const HIVE_VISION_RADIUS_METERS = 0.55;
export const BIOBUZZ_POLICY_MANIFEST_URL = "/models/policies/biobuzz/manifest.json";
export const POLICY_DIFFICULTY_INTERVAL_MS = Object.freeze({ easy: 100, balanced: 40, competitive: 20 } as const);
export const PHYSICAL_PARAMETER_RANDOMIZATION_VERSION = "experimental-uniform-v1" as const;
export const EXPERIMENTAL_PARAMETER_RANGES = Object.freeze(Object.fromEntries(
  Object.entries(WORLD_PHYSICAL_PARAMETERS)
    .filter(([, parameter]) => parameter.status === "experimental" && parameter.experimentalRange)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, parameter]) => [name, { range: parameter.experimentalRange!, unit: parameter.unit, source: parameter.source }]),
));
export type PolicyDifficulty = keyof typeof POLICY_DIFFICULTY_INTERVAL_MS;

export interface SampledPhysicalParameters {
  parameters: Partial<Record<string, number>>;
  sampled: Partial<Record<string, number>>;
}

/** Independent seeded uniform samples, restricted to core-published experimental ranges. */
export function sampleExperimentalPhysicalParameters(
  base: Partial<Record<string, number>> | undefined,
  seed: number,
  enabled = true,
): SampledPhysicalParameters {
  if (!Number.isSafeInteger(seed)) throw new Error("Physical-parameter randomization requires an integer episode seed.");
  let state = seed >>> 0;
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
  const parameters: Record<string, number> = {};
  for (const [name, value] of Object.entries(base ?? {})) if (value !== undefined) parameters[name] = value;
  const sampled: Record<string, number> = {};
  if (enabled) {
    for (const [name, details] of Object.entries(EXPERIMENTAL_PARAMETER_RANGES)) {
      const [minimum, maximum] = details.range;
      const value = minimum + random() * (maximum - minimum);
      parameters[name] = value;
      sampled[name] = value;
    }
  }
  return {
    parameters: Object.fromEntries(Object.entries(parameters).sort(([left], [right]) => left.localeCompare(right))),
    sampled: Object.fromEntries(Object.entries(sampled).sort(([left], [right]) => left.localeCompare(right))),
  };
}

/** Robot seats explicitly assigned to learned policies by the selected game setup. */
export function policyControlledRobotIds(game: GameSimulation): RobotId[] {
  return game.world.robotSetups.filter((robot) => robot.controller === "policy").map((robot) => robot.id);
}

/** Decision frequency changes only how often the same learned actor is queried. */
export function policyDecisionDue(difficulty: PolicyDifficulty, elapsedMatchMs: number): boolean {
  if (!Number.isFinite(elapsedMatchMs) || elapsedMatchMs < 0) return false;
  const interval = POLICY_DIFFICULTY_INTERVAL_MS[difficulty];
  return Math.abs(Math.round(elapsedMatchMs / interval) * interval - elapsedMatchMs) < 1e-5;
}

/**
 * Public policy observation entry point shared by the browser match and local PPO adapter.
 * Each robot receives its own sensor state and only objects its configured camera can see.
 */
export function observePolicies(game: GameSimulation): Record<RobotId, PolicyObservation> {
  return Object.fromEntries(Object.entries(observeRobotViews(game)).map(([id, view]) => [id, encodePolicyObservation(view)])) as Record<RobotId, PolicyObservation>;
}

/** Sensor-limited views shared by programmed controllers and learned-policy experiments. */
export function observeRobotViews(game: GameSimulation): Record<RobotId, PolicyObservationView> {
  const observation = game.world.observe();
  const cache = cameraFrames(game, observation);
  const result = {} as Record<RobotId, PolicyObservationView>;
  for (const robotId of POLICY_ROBOT_IDS) {
    const ownState = observation.robots.find((robot) => robot.id === robotId);
    const setup = game.world.robotSetups.find((robot) => robot.id === robotId);
    if (!ownState || !setup) throw new Error(`GameSimulation is missing configured robot ${robotId}.`);
    const vision = deliveredFrame(cache, robotId, observation.simulationTimeMs);
    const estimatedPose = poseFromOdometry(setup, ownState.sensors.odometry);
    const alliance = setup.alliance;
    const score = game.rules.scores;
    const view: PolicyObservationView = {
      robotId,
      alliance,
      physicsVersion: observation.physicsVersion,
      phase: game.phase as MatchPhase,
      elapsedMatchMs: game.matchTimeMs,
      redScore: score.red,
      blueScore: score.blue,
      fieldHalfSizeMeters: game.world.field.halfSize,
      estimatedPose,
      ownRobot: ownState,
      visibleElements: vision?.elements.map(({ view: element }) => element) ?? [],
      visibleRobots: vision?.robots ?? [],
      visibleHives: vision?.hives ?? [],
      flowers: flowerObservations(game, estimatedPose, vision?.elements ?? []),
      gardens: gardenObservations(game, estimatedPose, vision?.elements ?? []),
    };
    result[robotId] = view;
  }
  return result;
}

/** Browser helper: apply each worker action to that robot's configured hardware. */
export function applyPolicyActions(game: GameSimulation, actions: Readonly<Partial<Record<RobotId, PolicyAction>>>): void {
  if (game.phase === "teleop-handoff") game.resumeTeleop();
  if (!["auto", "teleop"].includes(game.phase)) return;
  let sequences = commandSequences.get(game);
  if (!sequences || game.world.tick === 0) {
    sequences = Object.fromEntries(POLICY_ROBOT_IDS.map((id) => [id, 0])) as Record<RobotId, number>;
    commandSequences.set(game, sequences);
  }
  const robotStates = new Map(game.world.observe().robots.map((robot) => [robot.id, robot]));
  for (const [robotId, action] of Object.entries(actions) as [RobotId, PolicyAction][]) {
    if (!action || action.robotId !== robotId || action.schema !== POLICY_ACTION_VERSION || action.values.length !== 11) throw new Error(`Policy action does not match ${robotId}'s actuator contract.`);
    const setup = game.world.robotSetups.find((robot) => robot.id === robotId);
    if (!setup) throw new Error(`GameSimulation is missing configured robot ${robotId}.`);
    if (setup.controller !== "policy") throw new Error(`${robotId} is not assigned to a policy controller in this match.`);
    const sequence = sequences[robotId] = (sequences[robotId] ?? 0) + 1;
    game.world.enqueue(decodePolicyAction(robotId, game.world.tick, sequence, action.values, setup.configuration, robotStates.get(robotId)));
  }
}

/** Adapter used by PPO/evaluation; all action paths enqueue into GameSimulation's real world. */
export async function createPolicySimulation(request: BiobuzzPolicyFactoryRequest): Promise<BiobuzzPolicySimulation> {
  if (request.contractVersion !== POLICY_CONTRACT_VERSION) throw new Error("Training adapter policy contract version is incompatible.");
  const worldOptions: SimulationWorldOptions = {
    ...request.worldOptions,
    robots: request.worldOptions.robots.map((robot) => ({ ...robot, controller: "policy" })),
  };
  return BiobuzzGameSimulation.create(worldOptions, request.seed, request.curriculumStage, request.randomizeExperimentalParameters ?? false);
}

class BiobuzzGameSimulation implements BiobuzzPolicySimulation {
  readonly physicsVersion = PHYSICS_VERSION;
  private readonly sequence: Record<RobotId, number> = { "red-1": 0, "red-2": 0, "blue-1": 0, "blue-2": 0 };
  private previousStats!: PolicyRewardStats;
  private previousPayloadCounts!: Record<RobotId, number>;
  private stage: CurriculumStage;
  private closed = false;
  private hasStarted = false;
  private readonly randomizePhysicalParameters: boolean;
  private game!: GameSimulation;
  private humanPlayer!: AutomatedHumanPlayer;
  private episodeSeed = 0;
  private parameters: Partial<Record<string, number>> = {};
  private sampledParameters: Partial<Record<string, number>> = {};
  private configurationHash = "";

  static async create(options: SimulationWorldOptions, seed: number, stage: CurriculumStage, randomizePhysicalParameters: boolean): Promise<BiobuzzGameSimulation> {
    const simulation = new BiobuzzGameSimulation(options, stage, randomizePhysicalParameters);
    await simulation.createEpisodeWorld(seed);
    return simulation;
  }

  private constructor(private readonly baseOptions: SimulationWorldOptions, stage: CurriculumStage, randomizePhysicalParameters: boolean) {
    this.stage = stage;
    this.randomizePhysicalParameters = randomizePhysicalParameters;
  }

  async reset(seed: number, curriculumStage: CurriculumStage): Promise<PolicyWorldFrame> {
    this.assertOpen();
    this.stage = curriculumStage;
    const canUseConstructedWorld = !this.hasStarted && this.game.phase === "setup"
      && this.game.world.tick === 0 && this.episodeSeed === seed;
    if (!canUseConstructedWorld) {
      observationCaches.delete(this.game);
      this.game.dispose();
      await this.createEpisodeWorld(seed);
    }
    this.hasStarted = true;
    for (const robotId of POLICY_ROBOT_IDS) this.sequence[robotId] = 0;
    observationCaches.delete(this.game);
    commandSequences.delete(this.game);
    this.game.initialize();
    this.game.start();
    const frame = this.currentFrame();
    this.previousStats = frame.rewardStats;
    this.previousPayloadCounts = this.payloadCounts();
    return frame;
  }

  async step(actions: Record<RobotId, PolicyAction>): Promise<{
    frame: PolicyWorldFrame;
    rewards: Record<RobotId, number>;
    terminated: boolean;
    truncated: boolean;
  }> {
    this.assertOpen();
    if (this.game.phase === "teleop-handoff") this.game.resumeTeleop();
    this.humanPlayer.step(this.game);
    if (["auto", "teleop"].includes(this.game.phase)) {
      const robotStates = new Map(this.game.world.observe().robots.map((robot) => [robot.id, robot]));
      for (const robotId of POLICY_ROBOT_IDS) {
        const action = actions[robotId];
        if (!action || action.robotId !== robotId || action.schema !== POLICY_ACTION_VERSION || action.values.length !== 11) throw new Error(`Missing or incompatible policy action for ${robotId}.`);
        const setup = this.game.world.robotSetups.find((robot) => robot.id === robotId);
        if (!setup) throw new Error(`GameSimulation is missing configured robot ${robotId}.`);
        this.game.world.enqueue(decodePolicyAction(robotId, this.game.world.tick, ++this.sequence[robotId], action.values, setup.configuration, robotStates.get(robotId)));
      }
    }

    this.game.step(4);
    // Do not spend simulation time at the handoff boundary. Initialize the selected
    // TELEOP policy at the exact 38-second mark, retaining world and robot state.
    if (this.game.phase === "teleop-handoff") this.game.resumeTeleop();
    const frame = this.currentFrame();
    const payloadCounts = this.payloadCounts();
    const rewards = calculatePolicyRewards(this.previousStats, frame.rewardStats, this.stage, this.previousPayloadCounts, payloadCounts);
    this.previousStats = frame.rewardStats;
    this.previousPayloadCounts = payloadCounts;
    return { frame, rewards, terminated: this.game.rules.completed, truncated: false };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    observationCaches.delete(this.game);
    this.game.dispose();
  }

  private currentFrame(): PolicyWorldFrame {
    const world = this.game.world.observe();
    return {
      physicsVersion: world.physicsVersion,
      tick: world.tick,
      phase: this.game.phase,
      observations: observePolicies(this.game),
      rewardStats: policyRewardStatsFromRules(this.game.rules),
      publicInfo: {
        redScore: this.game.rules.scores.red,
        blueScore: this.game.rules.scores.blue,
        redTips: this.game.rules.tips.red,
        blueTips: this.game.rules.tips.blue,
        redFouls: this.game.rules.fouls.filter((foul) => foul.creditedAlliance === "blue").length,
        blueFouls: this.game.rules.fouls.filter((foul) => foul.creditedAlliance === "red").length,
        completed: this.game.rules.completed,
        configurationHash: this.configurationHash,
        episodeSeed: this.episodeSeed,
        physicalParameterRandomization: this.randomizePhysicalParameters ? PHYSICAL_PARAMETER_RANDOMIZATION_VERSION : "disabled",
        physicalParameterRanges: JSON.stringify(this.randomizePhysicalParameters ? EXPERIMENTAL_PARAMETER_RANGES : {}),
        physicalParameters: JSON.stringify(this.parameters),
        sampledPhysicalParameters: JSON.stringify(this.sampledParameters),
        automatedHumanPlayer: AUTOMATED_HUMAN_PLAYER_VERSION,
        rewardVersion: "biobuzz-live-scoring-potential-v2",
      },
    };
  }

  private async createEpisodeWorld(seed: number): Promise<void> {
    const randomization = sampleExperimentalPhysicalParameters(this.baseOptions.parameters, seed, this.randomizePhysicalParameters);
    const options: SimulationWorldOptions = {
      ...this.baseOptions,
      seed,
      robots: this.baseOptions.robots.map((robot) => ({ ...robot, controller: "policy" })),
      parameters: randomization.parameters,
    };
    this.game = await GameSimulation.create(options);
    this.humanPlayer = new AutomatedHumanPlayer(["red", "blue"]);
    this.configurationHash = this.game.world.configurationFingerprint;
    this.episodeSeed = seed;
    this.parameters = randomization.parameters;
    this.sampledParameters = randomization.sampled;
  }

  private payloadCounts(): Record<RobotId, number> {
    const observation = this.game.world.observe();
    return Object.fromEntries(POLICY_ROBOT_IDS.map((robotId) => [robotId, observation.robots.find((robot) => robot.id === robotId)?.payload.length ?? 0])) as Record<RobotId, number>;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("BIOBUZZ policy simulation has been closed.");
  }
}

export function policyRewardStatsFromRules(rules: BiobuzzRules.BiobuzzMatchState): PolicyRewardStats {
  const red = rules.scoreBreakdown.red;
  const blue = rules.scoreBreakdown.blue;
  const upwardCellElements = { red: 0, blue: 0 };
  const gardenElements = { red: 0, blue: 0 };
  const ownedFlowerElements = { red: 0, blue: 0 };
  const bottomNectarBonuses = { red: 0, blue: 0 };

  for (const element of Object.values(rules.elements)) {
    for (const membership of element.cellMemberships) {
      if (membership.facing === "up") upwardCellElements[membership.hiveAlliance] += 1;
    }
    for (const alliance of element.gardenMemberships) gardenElements[alliance] += 1;
  }

  for (const flowerId of BiobuzzRules.BIOBUZZ_FLOWER_IDS) {
    const scoringElements = (rules.flowerStacks[flowerId] ?? []).map((elementId) => {
      const element = rules.elements[elementId];
      if (!element) throw new Error(`Unknown scoring element ${elementId} in ${flowerId}`);
      return element;
    });
    const nectarAtLevels = scoringElements.filter((element) => element.kind === "nectar");
    const topNectar = nectarAtLevels.at(-1);
    if (!topNectar || topNectar.alliance === null) continue;
    ownedFlowerElements[topNectar.alliance] += scoringElements.length;
    const bottomNectar = nectarAtLevels[0];
    if (bottomNectar && bottomNectar.alliance !== null) bottomNectarBonuses[bottomNectar.alliance] += 1;
  }

  return {
    redScore: rules.scores.red,
    blueScore: rules.scores.blue,
    redTips: rules.tips.red,
    blueTips: rules.tips.blue,
    redUpwardCellElements: upwardCellElements.red,
    blueUpwardCellElements: upwardCellElements.blue,
    redOwnedFlowerElements: ownedFlowerElements.red,
    blueOwnedFlowerElements: ownedFlowerElements.blue,
    redBottomNectarBonuses: bottomNectarBonuses.red,
    blueBottomNectarBonuses: bottomNectarBonuses.blue,
    redGardenElements: gardenElements.red,
    blueGardenElements: gardenElements.blue,
    redAutoPark: red.autoPark / 5,
    blueAutoPark: blue.autoPark / 5,
    redTeleopPark: red.teleopPark / 5,
    blueTeleopPark: blue.teleopPark / 5,
    completed: rules.completed,
  };
}

function cameraFrames(game: GameSimulation, observation: WorldObservation): ObservationCache {
  let cache = observationCaches.get(game);
  if (!cache || observation.seed !== cache.seed || observation.tick < cache.lastTick) {
    cache = {
      seed: observation.seed,
      lastTick: -1,
      robots: new Map(POLICY_ROBOT_IDS.map((id) => [id, { cameras: new Map() }])),
    };
    observationCaches.set(game, cache);
  }
  cache.lastTick = observation.tick;
  for (const robotId of POLICY_ROBOT_IDS) {
    const state = cache.robots.get(robotId)!;
    const setup = game.world.robotSetups.find((robot) => robot.id === robotId)!;
    for (const camera of setup.configuration.cameras) {
      let cameraState = state.cameras.get(camera.name);
      if (!cameraState) {
        cameraState = { nextCaptureAtMs: 0, frames: [] };
        state.cameras.set(camera.name, cameraState);
      }
      if (observation.simulationTimeMs + 1e-6 < cameraState.nextCaptureAtMs) continue;
      const interval = 1_000 / Math.max(1, camera.framesPerSecond);
      const dueIntervals = Math.floor((observation.simulationTimeMs - cameraState.nextCaptureAtMs) / interval) + 1;
      const capturedAtMs = cameraState.nextCaptureAtMs + (dueIntervals - 1) * interval;
      // Do not synthesize a burst of stale images after a suspended tab. Timestamp the newest
      // due exposure on the camera's own cadence and sample the current public world frame once.
      cameraState.nextCaptureAtMs += dueIntervals * interval;
      const frame = captureVision(game, observation, setup, camera, capturedAtMs);
      cameraState.frames.push(frame);
      for (const available of cameraState.frames.filter((candidate) => candidate.availableAtMs <= observation.simulationTimeMs)) cameraState.latest = available;
      cameraState.frames = cameraState.frames.filter((candidate) => observation.simulationTimeMs - candidate.capturedAtMs <= CAMERA_FRAME_MAX_AGE_MS);
    }
  }
  return cache;
}

function deliveredFrame(cache: ObservationCache, robotId: RobotId, nowMs: number): RobotVisionFrame | undefined {
  const state = cache.robots.get(robotId)!;
  const latestByElement = new Map<string, { value: DetectedElement; capturedAtMs: number }>();
  const latestByRobot = new Map<RobotId, { value: PublicRobotView; capturedAtMs: number }>();
  const latestByHive = new Map<string, { value: PublicHiveView; capturedAtMs: number }>();
  let capturedAtMs = -Infinity;
  let availableAtMs = -Infinity;
  for (const camera of state.cameras.values()) {
    for (const frame of camera.frames) if (frame.availableAtMs <= nowMs) camera.latest = frame;
    const frame = camera.latest;
    if (!frame || nowMs - frame.availableAtMs > CAMERA_FRAME_MAX_AGE_MS) continue;
    capturedAtMs = Math.max(capturedAtMs, frame.capturedAtMs);
    availableAtMs = Math.max(availableAtMs, frame.availableAtMs);
    for (const element of frame.elements) {
      const previous = latestByElement.get(element.view.id);
      if (!previous || frame.capturedAtMs >= previous.capturedAtMs) latestByElement.set(element.view.id, { value: element, capturedAtMs: frame.capturedAtMs });
    }
    for (const robot of frame.robots) {
      const previous = latestByRobot.get(robot.id);
      if (!previous || frame.capturedAtMs >= previous.capturedAtMs) latestByRobot.set(robot.id, { value: robot, capturedAtMs: frame.capturedAtMs });
    }
    for (const hive of frame.hives) {
      const previous = latestByHive.get(hive.id);
      if (!previous || frame.capturedAtMs >= previous.capturedAtMs) latestByHive.set(hive.id, { value: hive, capturedAtMs: frame.capturedAtMs });
    }
  }
  if (!Number.isFinite(capturedAtMs)) return undefined;
  return {
    cameraName: "merged-visible-camera-frames",
    capturedAtMs,
    availableAtMs,
    elements: [...latestByElement.values()].map(({ value }) => value),
    robots: [...latestByRobot.values()].map(({ value }) => value),
    hives: [...latestByHive.values()].map(({ value }) => value),
  };
}

function captureVision(game: GameSimulation, observation: WorldObservation, setup: WorldRobotSetup, camera: WorldRobotConfiguration["cameras"][number], capturedAtMs: number): RobotVisionFrame {
  const own = observation.robots.find((robot) => robot.id === setup.id)!;
  const elements: DetectedElement[] = [];
  for (const element of observation.elements) {
    if ((element.kind !== "pollen" && element.kind !== "nectar") || element.location !== "field" || !cameraFrustumContains(own, camera, element.position, element.radius) || !game.world.visibleFromRobot(setup.id, element.position, element.radius, camera.name)) continue;
    const local = cameraRelativeMeasurement(own, camera, element.position, observation.seed, observation.tick, element.id);
    elements.push({
      worldPosition: element.position,
      radius: element.radius,
      view: {
        id: element.id,
        kind: element.kind,
        alliance: element.alliance,
        relativePosition: local.relativePosition,
        relativeVelocity: relativeVector(sub(element.linearVelocity, own.linearVelocity), own.rotation),
      },
    });
  }

  const robots: PublicRobotView[] = [];
  for (const opponent of observation.robots) {
    if (opponent.id === setup.id) continue;
    const opponentSetup = game.world.robotSetups.find((robot) => robot.id === opponent.id)!;
    const robotRadius = Math.hypot(opponentSetup.configuration.chassis.size.x, opponentSetup.configuration.chassis.size.z) / 2;
    if (!cameraFrustumContains(own, camera, opponent.position, robotRadius) || !game.world.visibleFromRobot(setup.id, opponent.position, robotRadius, camera.name)) continue;
    const local = cameraRelativeMeasurement(own, camera, opponent.position, observation.seed, observation.tick, opponent.id);
    const headingNoise = camera.angleNoiseRadians * deterministicNormal(observation.seed, observation.tick, setup.id, `${camera.name}/${opponent.id}`, "heading");
    robots.push({
      id: opponent.id,
      alliance: opponent.alliance,
      relativePosition: local.relativePosition,
      relativeHeadingRadians: wrapRadians(yaw(opponent.rotation) - yaw(own.rotation) + headingNoise),
      relativeVelocity: relativeVector(sub(opponent.linearVelocity, own.linearVelocity), own.rotation),
    });
  }

  const hives: PublicHiveView[] = [];
  for (const hive of game.world.field.hives) {
    const state = observation.hives.find((candidate) => candidate.id === hive.id);
    if (!state || !cameraFrustumContains(own, camera, state.position, HIVE_VISION_RADIUS_METERS) || !game.world.visibleFromRobot(setup.id, state.position, HIVE_VISION_RADIUS_METERS, camera.name)) continue;
    const local = cameraRelativeMeasurement(own, camera, state.position, observation.seed, observation.tick, hive.id);
    hives.push({
      id: hive.id,
      alliance: hive.alliance,
      relativePosition: local.relativePosition,
      angleRadians: signedAxisAngle(state.rotation, hive.axis) + camera.angleNoiseRadians * deterministicNormal(observation.seed, observation.tick, setup.id, `${camera.name}/${hive.id}`, "angle"),
      angularVelocityRadiansPerSecond: dot(state.angularVelocity, hive.axis),
    });
  }

  return { cameraName: camera.name, capturedAtMs, availableAtMs: capturedAtMs + camera.latencyMs, elements, robots, hives };
}

function cameraRelativeMeasurement(
  own: WorldObservation["robots"][number],
  camera: WorldRobotConfiguration["cameras"][number],
  target: Vector3,
  seed: number,
  tick: number,
  targetId: string,
): { relativePosition: Vector3; range: number } {
  const cameraPosition = add(own.position, rotate(camera.mount.position, own.rotation));
  const cameraRotation = multiply(own.rotation, camera.mount.rotation);
  const trueCameraLocal = inverseRotate(sub(target, cameraPosition), cameraRotation);
  const range = Math.hypot(trueCameraLocal.x, trueCameraLocal.y, trueCameraLocal.z);
  const noise = camera.positionNoiseMeters * (1 + range ** 2);
  const noiseTargetId = `${camera.name}/${targetId}`;
  const noisyCameraLocal = add(trueCameraLocal, {
    x: noise * deterministicNormal(seed, tick, own.id, noiseTargetId, "x"),
    y: noise * deterministicNormal(seed, tick, own.id, noiseTargetId, "y"),
    z: noise * deterministicNormal(seed, tick, own.id, noiseTargetId, "z"),
  });
  const relativePosition = add(camera.mount.position, rotate(noisyCameraLocal, camera.mount.rotation));
  return { relativePosition, range };
}

/** Camera-specific projection; visibleFromRobot then supplies the world's collision/occlusion test. */
function cameraFrustumContains(
  own: WorldObservation["robots"][number],
  camera: WorldRobotConfiguration["cameras"][number],
  target: Vector3,
  radius: number,
): boolean {
  const cameraPosition = add(own.position, rotate(camera.mount.position, own.rotation));
  const cameraRotation = multiply(own.rotation, camera.mount.rotation);
  const local = inverseRotate(sub(target, cameraPosition), cameraRotation);
  const range = Math.hypot(local.x, local.y, local.z);
  if (local.x <= 0 || range > camera.maximumRange + radius) return false;
  const margin = Math.asin(Math.min(1, radius / Math.max(radius, range)));
  return Math.abs(Math.atan2(-local.z, local.x)) <= camera.horizontalFovRadians / 2 + margin
    && Math.abs(Math.atan2(local.y, Math.hypot(local.x, local.z))) <= camera.verticalFovRadians / 2 + margin;
}

function poseFromOdometry(setup: WorldRobotSetup, odometry: WorldObservation["robots"][number]["sensors"]["odometry"]): EstimatedRobotPose {
  const sensor = setup.configuration.sensors.find((candidate) => candidate.kind === "pinpoint" || candidate.kind === "odometry");
  const reading = sensor ? odometry[sensor.name] : undefined;
  if (!reading) throw new Error(`${setup.id} policy observation requires a configured Pinpoint or odometry sensor with a current reading.`);
  const x = setup.position.x + reading.xMeters;
  const z = setup.position.z - reading.yMeters;
  const heading = setup.heading + reading.headingRadians;
  const fieldVz = -reading.yVelocity;
  const cosine = Math.cos(heading);
  const sine = Math.sin(heading);
  return {
    xMeters: x,
    zMeters: z,
    headingRadians: heading,
    forwardVelocityMetersPerSecond: reading.xVelocity * cosine - fieldVz * sine,
    leftVelocityMetersPerSecond: -(reading.xVelocity * sine + fieldVz * cosine),
    yawRateRadiansPerSecond: reading.angularVelocity,
    source: "odometry",
  };
}

function flowerObservations(game: GameSimulation, pose: EstimatedRobotPose, visible: readonly DetectedElement[]): PublicFlowerView[] {
  return game.world.field.flowers.map((flower) => {
    const scored = visible.filter(({ worldPosition, radius }) =>
      insideFlowerVolume(worldPosition, radius, flower.position, flower.scoringRadius, flower.bottom, flower.top));
    const nectars = scored.filter(({ view }) => view.kind === "nectar").sort((a, b) => a.worldPosition.y - b.worldPosition.y);
    return {
      id: flower.id,
      relativePosition: fieldPointToRobot(flower.position, pose),
      qualifyingNectarCount: nectars.length,
      topAlliance: nectars.at(-1)?.view.alliance ?? null,
      bottomBonusAlliance: nectars[0]?.view.alliance ?? null,
    };
  });
}

function gardenObservations(game: GameSimulation, pose: EstimatedRobotPose, visible: readonly DetectedElement[]): PublicGardenView[] {
  return game.world.field.gardens.map((garden) => ({
    id: `${garden.alliance}-garden`,
    relativePosition: fieldPointToRobot(garden.center, pose),
    owningAlliance: garden.alliance,
    pollenCount: visible.filter(({ view, worldPosition, radius }) => view.kind === "pollen" && sphereInBox(worldPosition, radius, garden.center, garden.halfExtents)).length,
  }));
}

function insideFlowerVolume(point: Vector3, radius: number, center: Vector3, scoringRadius: number, bottom: number, top: number): boolean {
  return point.y + radius >= bottom && point.y - radius <= top && Math.hypot(point.x - center.x, point.z - center.z) <= scoringRadius + radius;
}

function sphereInBox(point: Vector3, radius: number, center: Vector3, half: Vector3): boolean {
  return Math.abs(point.x - center.x) <= half.x + radius && Math.abs(point.y - center.y) <= half.y + radius && Math.abs(point.z - center.z) <= half.z + radius;
}

function fieldPointToRobot(point: Vector3, pose: EstimatedRobotPose): Vector3 {
  const dx = point.x - pose.xMeters;
  const dz = point.z - pose.zMeters;
  const cosine = Math.cos(pose.headingRadians);
  const sine = Math.sin(pose.headingRadians);
  return { x: cosine * dx - sine * dz, y: point.y, z: sine * dx + cosine * dz };
}

function relativeVector(vector: Vector3, robotRotation: Quaternion): Vector3 {
  return inverseRotate(vector, robotRotation);
}

function yaw(rotation: Quaternion): number {
  const forward = rotate({ x: 1, y: 0, z: 0 }, rotation);
  return Math.atan2(-forward.z, forward.x);
}

function signedAxisAngle(rotation: Quaternion, axis: Vector3): number {
  return 2 * Math.atan2(rotation.x * axis.x + rotation.y * axis.y + rotation.z * axis.z, rotation.w);
}

function deterministicNormal(seed: number, tick: number, robotId: string, targetId: string, component: string): number {
  const base = `${seed}/${tick}/${robotId}/${targetId}/${component}`;
  const first = Math.max(hashUnit(`${base}/a`), Number.EPSILON);
  const second = hashUnit(`${base}/b`);
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function hashUnit(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return (hash >>> 0) / 0x1_0000_0000;
}

function wrapRadians(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function add(a: Vector3, b: Vector3): Vector3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function sub(a: Vector3, b: Vector3): Vector3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function dot(a: Vector3, b: Vector3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function multiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
function conjugate(q: Quaternion): Quaternion { return { x: -q.x, y: -q.y, z: -q.z, w: q.w }; }
function rotate(vector: Vector3, rotation: Quaternion): Vector3 {
  const qv = { x: rotation.x, y: rotation.y, z: rotation.z };
  const uv = { x: qv.y * vector.z - qv.z * vector.y, y: qv.z * vector.x - qv.x * vector.z, z: qv.x * vector.y - qv.y * vector.x };
  const uuv = { x: qv.y * uv.z - qv.z * uv.y, y: qv.z * uv.x - qv.x * uv.z, z: qv.x * uv.y - qv.y * uv.x };
  return { x: vector.x + 2 * (rotation.w * uv.x + uuv.x), y: vector.y + 2 * (rotation.w * uv.y + uuv.y), z: vector.z + 2 * (rotation.w * uv.z + uuv.z) };
}
function inverseRotate(vector: Vector3, rotation: Quaternion): Vector3 { return rotate(vector, conjugate(rotation)); }
