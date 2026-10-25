import { describe, expect, it } from "vitest";
import { compliantNormalForce, compliantTractionForce } from "./compliant-contact.js";

describe("compliant roller contact", () => {
  it("supports a stationary contact and yields further under a larger applied load", () => {
    const stiffness = 600;
    const force = (compression: number) => compliantNormalForce(compression, 0, stiffness, 0, 0, 0.005);
    expect(force(0.003)).toBeCloseTo(1.8);
    expect(force(0.009)).toBeCloseTo(5.4);
    expect(force(0)).toBe(0);
  });

  it("allows softer tread to deform further for the same supported force", () => {
    const soft = compliantNormalForce(0.008, 0, 300, 0, 0, 0.005);
    const hard = compliantNormalForce(0.004, 0, 600, 0, 0, 0.005);
    expect(soft).toBeCloseTo(hard);
  });

  it("damps compression, never attracts a separating ball, and has no force outside contact", () => {
    const contact = (compression: number, velocity: number) => compliantNormalForce(compression, velocity, 600, 4, 40, 0.005);
    expect(contact(0.004, -0.5)).toBeGreaterThan(contact(0.004, 0));
    expect(contact(0.004, 2)).toBe(0);
    expect(contact(-0.001, -1)).toBe(0);
    expect(compliantNormalForce(0.01, 0, 0, 4, 40, 0.005)).toBe(0);
  });

  it("bounds light-ball acceleration instead of using the fixed-ground contact response", () => {
    const light = compliantNormalForce(0.02, 0, 100000, 20, 1000, 0.005);
    const fixed = compliantNormalForce(0.02, 0, 100000, 20, 0, 0.005);
    expect(light).toBeLessThan(fixed / 1000);
    expect(light * 1000 * 0.005).toBeLessThan(4);
  });

  it("limits traction by compression and friction, preserves slip direction, and cannot overshoot no-slip", () => {
    expect(compliantTractionForce(3, 2, 0.8, 40, 0.005)).toBeCloseTo(1.6);
    expect(compliantTractionForce(-3, 2, 0.8, 40, 0.005)).toBeCloseTo(-1.6);
    expect(compliantTractionForce(3, 0, 0.8, 40, 0.005)).toBe(0);
    expect(compliantTractionForce(3, 2, 0, 40, 0.005)).toBe(0);
    expect(compliantTractionForce(0.02, 10, 1, 40, 0.005) * 40 * 0.005).toBeCloseTo(0.02);
  });
});
