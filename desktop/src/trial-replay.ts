import { serialize, deserialize } from "node:v8";
import { deflateSync, inflateSync } from "node:zlib";
import type { GameSnapshot } from "../../packages/ftc-sim-core/src/game-simulation";
import type { SimulationFrame, WorldRobotSensorFrame } from "@ftc-studio/opmode-protocol";
import type { WorldRobotState } from "../../packages/ftc-sim-core/src/world-types";

export type TrialSample = {
  time: number; tips: number; position: { x:number;y:number;z:number }; heading: number; payload: string[];
  velocity?: WorldRobotState["linearVelocity"]; angularVelocity?: WorldRobotState["angularVelocity"];
  servos?: WorldRobotState["servos"]; motorCommands?: SimulationFrame["motors"];
  contacts?: Array<{first:string;second:string}>;
  otherRobots?: Array<Pick<WorldRobotState,"id"|"position"|"rotation">>;
  hives?: Array<{id:string;angleRadians:number;angularVelocity:number}>;
  elements?: Array<{id:string;position:{x:number;y:number;z:number};controlledBy:string|null;cells:readonly {hiveAlliance:"red"|"blue";facing:"up"|"down"}[]}>;
};
export type TrialFlight = { time:number; elements:Array<{id:string;position:{x:number;y:number;z:number};velocity:{x:number;y:number;z:number}}> };
export type TrialTick = { sensors: WorldRobotSensorFrame; frame: SimulationFrame; signature: string; payload: string[]; sample?: TrialSample; flight?:TrialFlight };
export type TrialTrace = { key: string; initSensors: WorldRobotSensorFrame; ticks: TrialTick[]; checkpoints: Map<number, Uint8Array> };
export class ReplayMismatch extends Error {}

// Compare every motor/servo output, including state feedback. Being stricter than
// physical-command equality may reduce cache hits; it can never conceal a change.
export function actuatorSignature(frame: SimulationFrame): string {
  return JSON.stringify([frame.phase, frame.motors, frame.servos, frame.cameraFrameRequests ?? []]);
}
export function packSnapshot(snapshot: GameSnapshot): Uint8Array {
  return deflateSync(serialize(snapshot), { level: 1 });
}
export function unpackSnapshot(bytes: Uint8Array): GameSnapshot {
  return deserialize(inflateSync(bytes)) as GameSnapshot;
}
export function equalSensors(a: WorldRobotSensorFrame, b: WorldRobotSensorFrame): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
