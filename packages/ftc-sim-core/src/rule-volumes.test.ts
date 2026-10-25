import { describe, expect, test } from "vitest";
import { sphereIntersectsRuleVolume } from "./rule-volumes.js";
import type { ConvexRuleVolume } from "./world-types.js";
const cube: ConvexRuleVolume = { planes: [
  { normal: { x: 1, y: 0, z: 0 }, offset: 1 }, { normal: { x: -1, y: 0, z: 0 }, offset: 1 },
  { normal: { x: 0, y: 1, z: 0 }, offset: 1 }, { normal: { x: 0, y: -1, z: 0 }, offset: 1 },
  { normal: { x: 0, y: 0, z: 1 }, offset: 1 }, { normal: { x: 0, y: 0, z: -1 }, offset: 1 },
] };
describe("partial scoring volume intersection", () => {
  test("includes interior and exact face contact but excludes separated spheres", () => {
    expect(sphereIntersectsRuleVolume({ x: 0, y: 0, z: 0 }, 0.1, cube)).toBe(true);
    expect(sphereIntersectsRuleVolume({ x: 1.1, y: 0, z: 0 }, 0.1, cube)).toBe(true);
    expect(sphereIntersectsRuleVolume({ x: 1.101, y: 0, z: 0 }, 0.1, cube)).toBe(false);
  });
  test("uses Euclidean distance at edges and corners", () => {
    expect(sphereIntersectsRuleVolume({ x: 1.08, y: 1.08, z: 0 }, 0.1, cube)).toBe(false);
    expect(sphereIntersectsRuleVolume({ x: 1.06, y: 1.06, z: 0 }, 0.1, cube)).toBe(true);
    expect(sphereIntersectsRuleVolume({ x: 1.06, y: 1.06, z: 1.06 }, 0.1, cube)).toBe(false);
    expect(sphereIntersectsRuleVolume({ x: 1.05, y: 1.05, z: 1.05 }, 0.1, cube)).toBe(true);
  });
});
