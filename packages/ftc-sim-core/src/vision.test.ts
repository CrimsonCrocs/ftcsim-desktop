import { expect, it } from "vitest";
import { createBiobuzzAllRounder } from "./robot-presets.js";
import { SimulationWorld } from "./simulation-world.js";

it("delivers only the newest camera frame after latency, including empty occluded frames", async () => {
  const configuration = createBiobuzzAllRounder(); delete configuration.mechanisms; configuration.sensors = [];
  configuration.cameras = [{ name: "camera", mount: { position: { x: 0, y: 0.3, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, horizontalFovRadians: Math.PI / 2, verticalFovRadians: Math.PI / 2, maximumRange: 4, latencyMs: 80, framesPerSecond: 30, positionNoiseMeters: 0, angleNoiseRadians: 0 }];
  const world = await SimulationWorld.create({ seed: 1, robots: [{ id: "red-1", alliance: "red", configuration, position: { x: 0, y: 0.105, z: 0 }, heading: 0 }], field: { preset: "empty", halfSize: 5, floorHeight: 0, colliders: [], hives: [], flowers: [], gardens: [], loadingZones: [], tags: [{ id: 30, sizeMeters: 0.08255, transform: { position: { x: 1, y: 0.4, z: 0 }, rotation: { x: 0, y: 1, z: 0, w: 0 } } }], spawns: [{ id: "occluder", kind: "pollen", alliance: null, radius: 0.3, position: { x: -4, y: 0.3, z: 0 }, location: "field" }] } });
  try {
    expect(world.sensorFrame("red-1").aprilTags).toEqual([]);
    world.step(80);
    const detections = world.sensorFrame("red-1").aprilTags;
    expect(detections).toHaveLength(1);
    expect(detections[0]!.availableTimeMs - detections[0]!.captureTimeMs).toBe(80);
    world.placeElement("occluder", { x: 0.5, y: 0.4, z: 0 });
    world.step(8); expect(world.sensorFrame("red-1").aprilTags).toHaveLength(1);
    world.step(24); expect(world.sensorFrame("red-1").aprilTags).toEqual([]);
  } finally { world.dispose(); }
});

it("uses the default intake camera for nearby floor POLLEN outside the raised webcam view", async () => {
  const configuration = createBiobuzzAllRounder();
  const world = await SimulationWorld.create({
    seed: 3,
    robots: [{
      id: "red-1",
      alliance: "red",
      configuration,
      position: { x: 0, y: 0.105, z: 0 },
      heading: 0,
    }],
    field: {
      preset: "empty",
      halfSize: 5,
      floorHeight: 0,
      colliders: [],
      hives: [],
      flowers: [],
      gardens: [],
      loadingZones: [],
      tags: [],
      spawns: [],
    },
  });
  try {
    const nearbyPollen = { x: 0.29, y: 0.03556, z: 0 };
    expect(world.visibleFromRobot("red-1", nearbyPollen, 0.03556, "Intake camera")).toBe(true);
    expect(world.visibleFromRobot("red-1", nearbyPollen, 0.03556, "Webcam 1")).toBe(false);
  } finally {
    world.dispose();
  }
});

it("keeps a 30 FPS camera near its requested cadence at 200 Hz physics and 50 Hz sensor updates", async () => {
  const configuration = createBiobuzzAllRounder(); delete configuration.mechanisms; configuration.sensors = [];
  configuration.cameras = [{ name: "camera", mount: { position: { x: 0, y: 0.3, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, horizontalFovRadians: Math.PI / 2, verticalFovRadians: Math.PI / 2, maximumRange: 4, latencyMs: 0, framesPerSecond: 30, positionNoiseMeters: 0, angleNoiseRadians: 0 }];
  const world = await SimulationWorld.create({ seed: 2, robots: [{ id: "red-1", alliance: "red", configuration, position: { x: 0, y: 0.105, z: 0 }, heading: 0 }], field: { preset: "empty", halfSize: 5, floorHeight: 0, colliders: [], hives: [], flowers: [], gardens: [], loadingZones: [], tags: [{ id: 30, sizeMeters: 0.08255, transform: { position: { x: 1, y: 0.4, z: 0 }, rotation: { x: 0, y: 1, z: 0, w: 0 } } }], spawns: [] } });
  try {
    const captureTimes = new Set<number>();
    for (let tick = 0; tick < 200; tick++) {
      world.step(1);
      const detection = world.sensorFrame("red-1").aprilTags[0];
      if (detection) captureTimes.add(detection.captureTimeMs);
    }
    const times = [...captureTimes].sort((a, b) => a - b);
    expect(times.length).toBeGreaterThanOrEqual(29);
    expect(times.length).toBeLessThanOrEqual(31);
    for (let index = 1; index < times.length; index++) {
      expect(times[index]! - times[index - 1]!).toBeGreaterThanOrEqual(30);
      expect(times[index]! - times[index - 1]!).toBeLessThanOrEqual(35 + 1e-6);
    }
  } finally { world.dispose(); }
});
