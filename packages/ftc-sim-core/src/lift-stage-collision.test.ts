import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { readGlbColliders } from "./glb-collision.js";
import { robotLiftStageGeometry } from "./robot-geometry.js";
import { createBiobuzzAllRounder } from "./robot-presets.js";
import { SimulationWorld } from "./simulation-world.js";
import type { WorldFieldConfiguration } from "./world-types.js";

const FLOWER_PIPE_NODE = "flowers/am-5855: Flower Assembly <1>/am-5862: Flower HIPS Pipe#7";
const ROBOT_POSITION = { x: -0.766, y: 0.105, z: -1.728256957165 };
let flowerPipe: ReturnType<typeof readGlbColliders>[number];

beforeAll(async () => {
  await RAPIER.init();
  const asset = new Uint8Array(await readFile(resolve(import.meta.dirname, "../../../public/models/biobuzz/collision/field-flowers.glb")));
  const view = new DataView(asset.buffer, asset.byteOffset, asset.byteLength);
  let document: { nodes: { name?: string }[] } | undefined;
  for (let offset = 12; offset < asset.byteLength;) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    if (type === 0x4e4f534a) document = JSON.parse(new TextDecoder().decode(asset.subarray(offset, offset + length)).trim()) as typeof document;
    offset += length;
  }
  const nodeIndex = document?.nodes.findIndex(({ name }) => name === FLOWER_PIPE_NODE) ?? -1;
  expect(nodeIndex, `official collision GLB node ${FLOWER_PIPE_NODE}`).toBeGreaterThanOrEqual(0);
  flowerPipe = readGlbColliders(asset, "flowers").find(({ id }) => id.endsWith(`/${nodeIndex}/0`))!;
  expect(flowerPipe).toBeDefined();
});

describe("AllRounder lift-stage flower clearance geometry", () => {
  it.each([0, 0.15])("includes a stage-2 rail collider against the official HIPS pipe at lift height %fm", (liftHeight) => {
    const rapier = new RAPIER.World({ x: 0, y: 0, z: 0 });
    try {
      const fixed = rapier.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const target = rapier.createCollider(RAPIER.ColliderDesc.trimesh(
        new Float32Array(flowerPipe.shape.kind === "mesh" ? flowerPipe.shape.vertices : []),
        new Uint32Array(flowerPipe.shape.kind === "mesh" ? flowerPipe.shape.indices : []),
      ), fixed);
      const config = createBiobuzzAllRounder();
      const rail = robotLiftStageGeometry(config, liftHeight).find(({ id }) => id === "lift-stage-2-rail-1")!;
      expect(rail).toBeDefined();
      const candidate = rapier.createCollider(RAPIER.ColliderDesc.cuboid(
        rail.shape.kind === "box" ? rail.shape.halfExtents.x : 0,
        rail.shape.kind === "box" ? rail.shape.halfExtents.y : 0,
        rail.shape.kind === "box" ? rail.shape.halfExtents.z : 0,
      ).setTranslation(rail.position.x + ROBOT_POSITION.x, rail.position.y + ROBOT_POSITION.y, rail.position.z + ROBOT_POSITION.z)
        .setRotation(rail.rotation!), fixed);
      const contact = candidate.contactCollider(target, 1);
      expect(contact?.distance, `stage 2 positive-Z rail should intersect ${FLOWER_PIPE_NODE}`).toBeLessThanOrEqual(0);
    } finally {
      rapier.free();
    }
  });

  it("moves all stage boxes with their rendered telescoping stage offsets", () => {
    const config = createBiobuzzAllRounder();
    const lowered = robotLiftStageGeometry(config, 0);
    const raised = robotLiftStageGeometry(config, 0.15);
    const lowerRail = lowered.find(({ id }) => id === "lift-stage-2-rail-1")!;
    const raisedRail = raised.find(({ id }) => id === "lift-stage-2-rail-1")!;
    const axis = config.mechanisms!.lift.axis!;
    expect(raisedRail.position.x - lowerRail.position.x).toBeCloseTo(axis.x / axis.y * 0.1, 8);
    expect(raisedRail.position.y - lowerRail.position.y).toBeCloseTo(0.1, 8);
    expect(raisedRail.position.z - lowerRail.position.z).toBeCloseTo(0, 8);
  });

  it("resolves the registered mast against the official flower pipe", async () => {
    const world = await SimulationWorld.create({ seed: 42, field: {
      preset: "biobuzz-2026-2027", halfSize: 5, floorHeight: 0,
      colliders: [flowerPipe], hives: [], tags: [], flowers: [], gardens: [], loadingZones: [], spawns: [],
    }, robots: [{ id: "red-1", alliance: "red", configuration: createBiobuzzAllRounder(), position: ROBOT_POSITION, heading: 0 }] });
    try {
      world.step();
      expect(world.contacts()).toContainEqual({ first: flowerPipe.id, second: "red-1" });
    } finally { world.dispose(); }
  });

  it("moves registered mast colliders in clear space and preserves their handles in snapshots", async () => {
    const config = createBiobuzzAllRounder();
    const field: WorldFieldConfiguration = {
      preset: "empty", halfSize: 5, floorHeight: 0,
      colliders: [], hives: [], tags: [], flowers: [], gardens: [], loadingZones: [], spawns: [],
    };
    const world = await SimulationWorld.create({ seed: 42, field, robots: [{
      id: "red-1", alliance: "red", configuration: config, position: { x: 0, y: 0.105, z: 0 }, heading: 0,
    }] });
    try {
      world.enqueue({ robotId: "red-1", tick: world.tick, sequence: 1, motors: { lift: { power: 1 } }, servos: {}, source: "opmode" });
      world.step(700);
      const raisedHeight = world.observe().robots[0]!.mechanism.liftHeight;
      expect(raisedHeight).toBeGreaterThan(0.5);
      const raisedSnapshot = world.snapshot();
      world.step(8);
      world.restore(raisedSnapshot);
      world.step(1);
      expect(world.observe().robots[0]!.mechanism.liftHeight).toBeCloseTo(raisedHeight, 3);
    } finally {
      world.dispose();
    }
  });
});
