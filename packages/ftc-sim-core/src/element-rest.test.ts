import RAPIER from "@dimforge/rapier3d-compat";
import { expect, it } from "vitest";
import { SimulationWorld } from "./simulation-world.js";

it("lets rolling pollen sleep after settling and wakes it on a real collision", async () => {
  const world = await SimulationWorld.create({
    seed: 42, robots: [],
    field: { preset: "empty", halfSize: 5, floorHeight: 0, colliders: [], hives: [], tags: [], flowers: [], gardens: [], loadingZones: [],
      spawns: [
        { id: "rolling", kind: "pollen", alliance: null, location: "field", position: { x: 0, y: 0.03556, z: 0 } },
        { id: "incoming", kind: "pollen", alliance: null, location: "field", position: { x: 2, y: 0.03556, z: 0 } },
      ],
    },
  });
  try {
    world.step();
    const initial = world.snapshot();
    const initialPhysics = RAPIER.World.restoreSnapshot(initial.physics);
    const rolling = initialPhysics.getRigidBody(initial.elements.find(element => element.id === "rolling")!.handle);
    rolling.setLinvel({ x: 0.3, y: 0, z: 0 }, true);
    rolling.setAngvel({ x: 0, y: 0, z: -10 }, true);
    initial.physics = initialPhysics.takeSnapshot();
    initialPhysics.free();
    world.restore(initial);
    world.step(800);

    const settled = world.snapshot();
    const restingPhysics = RAPIER.World.restoreSnapshot(settled.physics);
    try {
      expect(restingPhysics.getRigidBody(settled.elements.find(element => element.id === "rolling")!.handle).isSleeping()).toBe(true);
    } finally { restingPhysics.free(); }
    const position = world.observe().elements.find(element => element.id === "rolling")!.position;
    expect(position.x).toBeGreaterThan(0.01);

    world.placeElement("incoming", { x: position.x + 0.03, y: position.y + 0.3, z: position.z });
    let peakSpeed = 0;
    for (let tick = 0; tick < 100; tick++) {
      world.step();
      const velocity = world.observe().elements.find(element => element.id === "rolling")!.linearVelocity;
      peakSpeed = Math.max(peakSpeed, Math.hypot(velocity.x, velocity.y, velocity.z));
    }
    expect(peakSpeed).toBeGreaterThan(0.1);
    const struck = world.snapshot();
    const activePhysics = RAPIER.World.restoreSnapshot(struck.physics);
    try {
      expect(activePhysics.getRigidBody(struck.elements.find(element => element.id === "rolling")!.handle).isSleeping()).toBe(false);
    } finally { activePhysics.free(); }
  } finally { world.dispose(); }
});
