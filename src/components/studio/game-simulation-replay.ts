import {
  BiobuzzRules,
  GameSimulation,
  type GamePhase,
  type GameSnapshot,
  type RobotId,
  type SimulationWorld,
  type SimulationWorldOptions,
  type WorldAlliance,
  type WorldCommand,
} from "@ftc-studio/sim-core";
import type { SimulationFrame } from "@ftc-studio/opmode-protocol";
import {
  resolveBiobuzzReplayField,
  type BiobuzzReplayFieldDescriptor,
} from "@/lib/biobuzz-replay-field";

export const MAX_REPLAY_INITIAL_STATE_BYTES = 32 * 1024 * 1024;
const MAX_REPLAY_INITIAL_STATE_JSON_BYTES = 128 * 1024 * 1024;
const BINARY_MARKER = "__ftcReplayUint8ArrayBase64";
const NEGATIVE_ZERO_MARKER = "__ftcReplayNegativeZero";

/** Legacy v2 state retained for importing old replay files. */
export interface ReplayInitialState {
  worldOptions: SimulationWorldOptions;
  gameSnapshot: GameSnapshot;
  configurationHash: string;
}

/** Compact v3 state. The field is reconstructed from its immutable asset pack. */
export interface ReplayV3InitialState {
  format: "ftc-biobuzz-replay-v3";
  compactWorldDescriptor: BiobuzzReplayFieldDescriptor;
  physicsVersion: string;
  configurationHash: string;
  initializedTick: number;
}

export interface CompressedReplayInitialState {
  encoding: "base64";
  compression: "gzip";
  compressedBytes: number;
  uncompressedBytes: number;
  data: string;
}

export type ReplayJournalEntry =
  | { kind: "commands"; tick: number; commands: WorldCommand[] }
  | { kind: "human-nectar-load"; tick: number; alliance: WorldAlliance; elementId: string }
  | { kind: "referee-adjustment"; tick: number; adjustment: Omit<BiobuzzRules.RefereeAdjustmentEvent, "type" | "timestampMs"> }
  | { kind: "teleop-resume"; tick: number }
  | { kind: "world-power"; tick: number; enabled: boolean }
  | { kind: "lifecycle"; tick: number; action: "match-start" }
  | { kind: "lifecycle"; tick: number; action: "match-stop" }
  | { kind: "init-advance"; tick: number; physicsTicks: number };

export type ReplayRuleAction = ReturnType<GameSimulation["replayActions"]>[number];

export type ReplayFieldResolver = (descriptor: BiobuzzReplayFieldDescriptor) => Promise<SimulationWorldOptions>;

export function encodeReplayV3InitialState(initialState: ReplayV3InitialState): string {
  validateReplayV3InitialState(initialState);
  return JSON.stringify(initialState, (_key, value: unknown) => {
    if (typeof value === "number" && Object.is(value, -0)) return { [NEGATIVE_ZERO_MARKER]: true };
    return value;
  });
}

export function decodeReplayV3InitialState(encoded: string): ReplayV3InitialState {
  const initialState = JSON.parse(encoded, (_key, value: unknown) => {
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    return Object.keys(record).length === 1 && record[NEGATIVE_ZERO_MARKER] === true ? -0 : value;
  }) as ReplayV3InitialState;
  validateReplayV3InitialState(initialState);
  return initialState;
}

function validateReplayV3InitialState(initialState: ReplayV3InitialState): void {
  if (initialState.format !== "ftc-biobuzz-replay-v3") throw new Error("Replay initial state uses an unsupported v3 format.");
  if (initialState.compactWorldDescriptor?.schema !== "biobuzz-replay-field-v1") throw new Error("Replay v3 is missing its compact BIOBUZZ field descriptor.");
  if (typeof initialState.physicsVersion !== "string" || initialState.physicsVersion.length === 0) throw new Error("Replay v3 is missing its physics version.");
  if (typeof initialState.configurationHash !== "string" || initialState.configurationHash.length === 0) throw new Error("Replay v3 is missing its configuration fingerprint.");
  if (!Number.isSafeInteger(initialState.initializedTick) || initialState.initializedTick < 0) throw new Error("Replay v3 initialized tick must be a non-negative safe integer.");
}

export function enqueueActuatorFrame(
  world: SimulationWorld,
  frame: SimulationFrame,
  robotId: RobotId,
  mode: GamePhase,
  sequence: number,
): WorldCommand | null {
  if (mode === "init" && world.isPowered) throw new Error("INIT actuator frames must be queued while match power is off.");
  if ((mode !== "init" && mode !== "auto" && mode !== "teleop") || ((mode === "auto" || mode === "teleop") && !world.isPowered)) return null;

  const motors = Object.fromEntries(Object.entries(frame.motors).map(([name, motor]) => [name, {
    power: motor.power,
    direction: motor.direction,
    mode: motor.mode,
    zeroPowerBehavior: motor.zeroPowerBehavior,
    enabled: motor.enabled,
    targetPosition: motor.targetPosition,
    targetPositionTolerance: motor.targetPositionTolerance,
    ...(motor.velocitySetpointTicksPerSecond === null
      ? {}
      : { velocitySetpoint: motor.velocitySetpointTicksPerSecond }),
  }]));
  const servos = Object.fromEntries(Object.entries(frame.servos).map(([name, servo]) => [
    name,
    servo.direction === "REVERSE" ? 1 - servo.position : servo.position,
  ]));
  const command: WorldCommand = { robotId, tick: world.tick, sequence, motors, servos, source: "opmode" };
  world.enqueue(command);
  return command;
}

export async function encodeReplayInitialState(initialState: ReplayInitialState): Promise<CompressedReplayInitialState> {
  if (initialState.configurationHash !== initialState.gameSnapshot.world.configurationHash) {
    throw new Error("Replay initial configuration hash does not match its world snapshot.");
  }
  const json = JSON.stringify(initialState, (_key, value: unknown) => {
    if (typeof value === "number" && Object.is(value, -0)) return { [NEGATIVE_ZERO_MARKER]: true };
    if (value instanceof Uint8Array) return { [BINARY_MARKER]: encodeBase64(value) };
    return value;
  });
  const raw = new TextEncoder().encode(json);
  if (raw.byteLength > MAX_REPLAY_INITIAL_STATE_JSON_BYTES) throw new Error("Replay initial state exceeds the 128 MiB uncompressed limit.");
  const compressed = await transformBytes(raw, "gzip", "compress");
  if (compressed.byteLength > MAX_REPLAY_INITIAL_STATE_BYTES) throw new Error("Replay initial state exceeds the 32 MiB compressed limit.");
  return {
    encoding: "base64",
    compression: "gzip",
    compressedBytes: compressed.byteLength,
    uncompressedBytes: raw.byteLength,
    data: encodeBase64(compressed),
  };
}

export async function decodeReplayInitialState(encoded: CompressedReplayInitialState): Promise<ReplayInitialState> {
  if (encoded.encoding !== "base64" || encoded.compression !== "gzip") throw new Error("Replay initial state uses an unsupported encoding.");
  if (encoded.compressedBytes > MAX_REPLAY_INITIAL_STATE_BYTES || encoded.uncompressedBytes > MAX_REPLAY_INITIAL_STATE_JSON_BYTES) {
    throw new Error("Replay initial state exceeds the supported size limits.");
  }
  const compressed = decodeBase64(encoded.data);
  if (compressed.byteLength !== encoded.compressedBytes) throw new Error("Replay initial state is truncated or corrupted.");
  const raw = await transformBytes(compressed, "gzip", "decompress");
  if (raw.byteLength !== encoded.uncompressedBytes) throw new Error("Replay initial state has an invalid uncompressed length.");
  const initialState = JSON.parse(new TextDecoder().decode(raw), (_key, value: unknown) => {
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length === 1 && record[NEGATIVE_ZERO_MARKER] === true) return -0;
    if (Object.keys(record).length === 1 && typeof record[BINARY_MARKER] === "string") {
      return decodeBase64(record[BINARY_MARKER]);
    }
    return value;
  }) as ReplayInitialState;
  if (!(initialState.gameSnapshot.world.physics instanceof Uint8Array)) throw new Error("Replay initial state is missing its binary physics snapshot.");
  if (initialState.configurationHash !== initialState.gameSnapshot.world.configurationHash) throw new Error("Replay initial configuration hash does not match its world snapshot.");
  return initialState;
}

export async function replayGameToTick(
  initialState: ReplayInitialState | ReplayV3InitialState,
  journal: readonly ReplayJournalEntry[],
  endTick: number,
  options: { journalStartIndex?: number; ruleActions?: readonly ReplayRuleAction[]; resolveField?: ReplayFieldResolver } = {},
): Promise<GameSimulation> {
  if ("compactWorldDescriptor" in initialState) {
    return replayV3GameToTick(initialState, journal, endTick, options);
  }
  return replayLegacyGameToTick(initialState, journal, endTick, options);
}

async function replayV3GameToTick(
  initialState: ReplayV3InitialState,
  journal: readonly ReplayJournalEntry[],
  endTick: number,
  options: { ruleActions?: readonly ReplayRuleAction[]; resolveField?: ReplayFieldResolver },
): Promise<GameSimulation> {
  validateReplayV3InitialState(initialState);
  if (!Number.isSafeInteger(endTick) || endTick < initialState.initializedTick) throw new RangeError("Replay end tick must be at or after the initialized world tick.");
  const resolveField = options.resolveField ?? ((descriptor) => resolveBiobuzzReplayField(descriptor));
  const worldOptions = await resolveField(initialState.compactWorldDescriptor);
  if (worldOptions.seed !== initialState.compactWorldDescriptor.seed) throw new Error("Replay field resolver changed the recorded seed.");
  const game = await GameSimulation.create(worldOptions);
  try {
    if (game.world.configurationFingerprint !== initialState.configurationHash) throw new Error("Replay field assets or robot configuration do not match the recorded configuration fingerprint.");
    if (game.world.observe().physicsVersion !== initialState.physicsVersion) throw new Error("Replay physics version does not match the recorded simulation.");
    game.initialize();
    if (game.world.tick !== initialState.initializedTick) throw new Error("Replay initialization did not reproduce the recorded initialized tick.");

    const entries = replayEntriesWithRuleActions(journal, options.ruleActions);
    let cursor = 0;
    let steps = 0;
    while (game.world.tick <= endTick) {
      if (++steps > 10_000_000) throw new Error("Replay exceeded its bounded tick limit.");
      const tick = game.world.tick;
      if (cursor < entries.length && entries[cursor]!.tick < tick) throw new Error("Replay journal contains an event before the initialized world tick.");
      const beforeEvents = cursor;
      while (cursor < entries.length && entries[cursor]!.tick === tick) {
        applyReplayEvent(game, entries[cursor]!, endTick - tick);
        cursor += 1;
      }
      if (tick >= endTick) break;
      if (game.phase === "init") {
        if (beforeEvents === cursor || (cursor < entries.length && entries[cursor]!.tick > game.world.tick)) {
          throw new Error(`Replay is missing an INIT advance at tick ${game.world.tick}.`);
        }
        continue;
      }
      if (["setup", "stopped", "results"].includes(game.phase)) break;
      if (game.step(1) !== 1) throw new Error(`Replay is missing a lifecycle event at tick ${game.world.tick}.`);
    }
    if (game.world.tick !== endTick) throw new Error(`Replay stopped at tick ${game.world.tick} before requested end tick ${endTick}.`);
    if (cursor < entries.length && entries[cursor]!.tick <= endTick) throw new Error("Replay ended before applying every journal event.");
    return game;
  } catch (error) {
    game.dispose();
    throw error;
  }
}

function replayEntriesWithRuleActions(journal: readonly ReplayJournalEntry[], ruleActions: readonly ReplayRuleAction[] | undefined): ReplayJournalEntry[] {
  const entries = [...journal];
  const journaledHumanLoads = new Set(entries.filter((entry) => entry.kind === "human-nectar-load").map((entry) => `${entry.tick}:${entry.alliance}:${entry.elementId}`));
  // Property order is not decision identity. Count occurrences so an identical second
  // decision survives even when it falls beyond the bounded command journal.
  const adjustmentKey = (tick: number, adjustment: Omit<BiobuzzRules.RefereeAdjustmentEvent, "type" | "timestampMs">) => JSON.stringify([
    tick, adjustment.alliance, adjustment.matchPointsDelta, adjustment.rankingPointsDelta ?? 0,
    adjustment.ruleId ?? null, adjustment.warning ?? null, adjustment.note,
  ]);
  const journaledRefereeAdjustments = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind !== "referee-adjustment") continue;
    const key = adjustmentKey(entry.tick, entry.adjustment);
    journaledRefereeAdjustments.set(key, (journaledRefereeAdjustments.get(key) ?? 0) + 1);
  }
  for (const action of ruleActions ?? []) {
    if (action.input.type === "human-nectar-entry") {
      const key = `${action.tick}:${action.input.actorAlliance}:${action.input.nectarId}`;
      if (!journaledHumanLoads.has(key)) entries.push({ kind: "human-nectar-load", tick: action.tick, alliance: action.input.actorAlliance, elementId: action.input.nectarId });
    } else if (action.input.type === "referee-adjustment") {
      const input = action.input;
      const adjustment = {
        alliance: input.alliance,
        matchPointsDelta: input.matchPointsDelta,
        ...(input.rankingPointsDelta === undefined ? {} : { rankingPointsDelta: input.rankingPointsDelta }),
        ...(input.ruleId === undefined ? {} : { ruleId: input.ruleId }),
        ...(input.warning === undefined ? {} : { warning: input.warning }),
        note: input.note,
      };
      const key = adjustmentKey(action.tick, adjustment);
      const journaledCount = journaledRefereeAdjustments.get(key) ?? 0;
      if (journaledCount > 0) journaledRefereeAdjustments.set(key, journaledCount - 1);
      else entries.push({ kind: "referee-adjustment", tick: action.tick, adjustment });
    }
  }
  entries.sort((first, second) => first.tick - second.tick);
  return entries;
}

async function replayLegacyGameToTick(
  initialState: ReplayInitialState,
  journal: readonly ReplayJournalEntry[],
  endTick: number,
  options: { journalStartIndex?: number; ruleActions?: readonly ReplayRuleAction[] } = {},
): Promise<GameSimulation> {
  if (!Number.isSafeInteger(endTick) || endTick < initialState.gameSnapshot.world.tick) throw new RangeError("Replay end tick must be at or after the initial snapshot.");
  const entries = replayEntriesWithRuleActions(journal.slice(options.journalStartIndex ?? 0), options.ruleActions);
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index]!.tick < entries[index - 1]!.tick) throw new Error("Replay journal entries must be ordered by tick.");
  }

  const game = await GameSimulation.create(initialState.worldOptions);
  try {
    game.restore(initialState.gameSnapshot);
    let cursor = 0;
    let steps = 0;
    while (game.world.tick <= endTick) {
      if (++steps > 10_000_000) throw new Error("Replay exceeded its bounded tick limit.");
      const tick = game.world.tick;
      if (cursor < entries.length && entries[cursor]!.tick < tick) throw new Error("Replay journal contains an event before the restored world tick.");
      while (cursor < entries.length && entries[cursor]!.tick === game.world.tick) {
        applyReplayEvent(game, entries[cursor]!);
        cursor += 1;
      }
      if (game.world.tick >= endTick) break;
      if (game.step(1) !== 1) throw new Error(`Replay is missing a lifecycle event at tick ${game.world.tick}.`);
    }
    if (cursor < entries.length && entries[cursor]!.tick <= endTick) throw new Error("Replay ended before applying every journal event.");
    return game;
  } catch (error) {
    game.dispose();
    throw error;
  }
}

function applyReplayEvent(game: GameSimulation, event: ReplayJournalEntry, maximumPhysicsTicks?: number): void {
  switch (event.kind) {
    case "commands":
      for (const command of event.commands) game.world.enqueue(command);
      break;
    case "human-nectar-load":
      game.loadNectar(event.alliance, event.elementId);
      break;
    case "referee-adjustment":
      game.adjustReferee(event.adjustment);
      break;
    case "teleop-resume":
      game.resumeTeleop();
      break;
    case "world-power":
      game.world.setPowered(event.enabled);
      break;
    case "lifecycle":
      if (event.action === "match-start") {
        game.start();
      } else game.stop();
      break;
    case "init-advance":
      if (game.phase !== "init" || game.world.isPowered) throw new Error("Passive INIT replay steps require an unpowered INIT world.");
      if (!Number.isSafeInteger(event.physicsTicks) || event.physicsTicks <= 0) throw new Error("INIT replay step count must be a positive integer.");
      game.world.step(Math.min(event.physicsTicks, Math.max(0, maximumPhysicsTicks ?? event.physicsTicks)));
      break;
  }
}

async function transformBytes(bytes: Uint8Array, format: "gzip", direction: "compress" | "decompress"): Promise<Uint8Array> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const stream = new Blob([input.buffer]).stream();
  const transformed = direction === "compress"
    ? stream.pipeThrough(new CompressionStream(format))
    : stream.pipeThrough(new DecompressionStream(format));
  return collectBounded(transformed, direction === "compress" ? MAX_REPLAY_INITIAL_STATE_BYTES : MAX_REPLAY_INITIAL_STATE_JSON_BYTES);
}

async function collectBounded(stream: ReadableStream<Uint8Array>, maximumBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new Error("Replay snapshot exceeds the supported streaming size limit.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.byteLength)));
  }
  return btoa(binary);
}

function decodeBase64(encoded: string): Uint8Array {
  if (encoded.length > Math.ceil(MAX_REPLAY_INITIAL_STATE_BYTES * 4 / 3) + 4) throw new Error("Replay snapshot base64 data exceeds the 32 MiB compressed limit.");
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
