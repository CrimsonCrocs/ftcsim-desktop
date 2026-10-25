import { describe, expect, it } from "vitest";
import { advanceMotor, advanceServo, createMotorState, motorElectricalOutput } from "./electromechanics.js";
import { createBiobuzzAllRounder, YELLOW_JACKET_312 } from "./robot-presets.js";
import type { WorldMotorConfiguration } from "./world-types.js";

const motor: WorldMotorConfiguration = {
  name: "published-312-rpm-motor",
  profile: YELLOW_JACKET_312,
  reduction: 1,
  efficiency: 1,
  inverted: false,
};

describe("electromechanical acceptance", () => {
  it("tracks the published 12 V stall, no-load, and mid-curve operating points", () => {
    // goBILDA 5203-2402-0019 spec: https://www.gobilda.com/content/spec_sheets/5203-2402-0019_spec_sheet.pdf
    // It lists 312 rpm free speed, 24.3 kg·cm stall torque, 0.25 A free current, and 9.2 A stall current at 12 V.
    // The torque-speed midpoint is an independent linear-DC-motor expectation, not a code formula.
    const stallTorqueNm = 24.3 * 0.0980665;
    const freeSpeedRadiansPerSecond = 312 * (2 * Math.PI / 60);

    const stall = motorElectricalOutput(YELLOW_JACKET_312, 1, 0, 12, true);
    const midpoint = motorElectricalOutput(YELLOW_JACKET_312, 1, freeSpeedRadiansPerSecond / 2, 12, true);
    const free = motorElectricalOutput(YELLOW_JACKET_312, 1, freeSpeedRadiansPerSecond, 12, true);

    expect(stall.currentAmps).toBeCloseTo(9.2, 1);
    expect(stall.torqueNm).toBeCloseTo(stallTorqueNm, 2);
    expect(midpoint.currentAmps).toBeCloseTo((9.2 + 0.25) / 2, 1);
    expect(midpoint.torqueNm).toBeGreaterThan(stallTorqueNm * 0.45);
    expect(midpoint.torqueNm).toBeLessThan(stallTorqueNm * 0.55);
    expect(free.currentAmps).toBeCloseTo(0.25, 1);
    expect(Math.abs(free.torqueNm)).toBeLessThan(stallTorqueNm * 0.01);
  });

  it("spins slower and draws more current when a shaft carries mechanical load", () => {
    const unloaded = createMotorState();
    const loaded = createMotorState();
    for (let step = 0; step < 200; step += 1) {
      advanceMotor(motor, unloaded, { power: 1 }, 12, 0, 0.0003, 0.005);
      advanceMotor(motor, loaded, { power: 1 }, 12, 0.8, 0.0003, 0.005);
    }

    expect(loaded.velocityRadiansPerSecond).toBeLessThan(unloaded.velocityRadiansPerSecond * 0.7);
    expect(loaded.currentAmps).toBeGreaterThan(unloaded.currentAmps * 5);
  });

  it("dissipates much more rotor energy in BRAKE than FLOAT after power is released", () => {
    const freeSpeed = YELLOW_JACKET_312.freeSpeedRpm * (2 * Math.PI / 60);
    const brake = createMotorState();
    const coast = createMotorState();
    brake.velocityRadiansPerSecond = freeSpeed;
    coast.velocityRadiansPerSecond = freeSpeed;

    for (let step = 0; step < 20; step += 1) {
      advanceMotor(motor, brake, { power: 0, zeroPowerBehavior: "BRAKE" }, 12, 0, 0, 0.005);
      advanceMotor(motor, coast, { power: 0, zeroPowerBehavior: "FLOAT" }, 12, 0, 0, 0.005);
    }

    const remainingEnergyRatio = (brake.velocityRadiansPerSecond / coast.velocityRadiansPerSecond) ** 2;
    expect(coast.velocityRadiansPerSecond).toBeGreaterThan(freeSpeed * 0.7);
    expect(remainingEnergyRatio).toBeLessThan(0.01);
  });

  it("dissipates unpowered servo kinetic energy without snapping a free shaft to rest", () => {
    const servo = { ...createBiobuzzAllRounder().servos[0]!, minRadians: -100, maxRadians: 100, inertiaKgM2: 0.004 };
    const state = { target: 0.5, angle: 0, velocity: 1, torque: 0 };
    // Independent viscous-rotor solution: I*dω/dt = -c*ω, time constant I/c = 0.2 s.
    // This is a numerical acceptance case, not a measured servo damping value.
    for (let step = 0; step < 40; step++) advanceServo(servo, state, 1, 0, 0.005, false, 0.02);
    expect(state.velocity).toBeCloseTo(Math.exp(-1), 2);
    expect(state.angle).toBeGreaterThan(0);
    expect(state.torque).toBe(0);
    for (let step = 0; step < 160; step++) advanceServo(servo, state, 0, 0, 0.005, false, 0.02);
    expect(state.velocity).toBeGreaterThan(0);
    expect(state.velocity ** 2).toBeLessThan(0.0001);
  });

  it("lets an external load backdrive an unpowered servo against passive damping", () => {
    const servo = { ...createBiobuzzAllRounder().servos[0]!, minRadians: -100, maxRadians: 100, inertiaKgM2: 0.004 };
    const state = { target: 0.5, angle: 0, velocity: 0, torque: 0 };
    // A 0.01 Nm resisting load balances a 0.02 Nm*s/rad damper at -0.5 rad/s.
    for (let step = 0; step < 200; step++) advanceServo(servo, state, 1, 0.01, 0.005, false, 0.02);
    expect(state.velocity).toBeCloseTo(-0.5, 2);
    expect(state.angle).toBeLessThan(0);
    expect(state.torque).toBe(0);
  });
});
