import type { MotorCommand, MotorElectricalProfile, MotorPhysicalState, ServoPhysicalState, WorldMotorConfiguration, WorldServoConfiguration } from "./world-types.js";

export const clampPhysical = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));

export function createMotorState(): MotorPhysicalState {
  return { positionRadians: 0, velocityRadiansPerSecond: 0, encoderOffsetRadians: 0, currentAmps: 0, torqueNm: 0, temperatureC: 25 };
}

/** A brushed DC motor: applied voltage minus back EMF determines current and torque. */
export function motorElectricalOutput(profile: MotorElectricalProfile, power: number, angularSpeed: number, voltage: number, braking: boolean): { torqueNm: number; currentAmps: number } {
  const resistance = profile.nominalVoltage / profile.stallCurrentAmps;
  const freeRadiansPerSecond = profile.freeSpeedRpm * Math.PI / 30;
  const backEmfConstant = (profile.nominalVoltage - resistance * profile.freeCurrentAmps) / freeRadiansPerSecond;
  const torqueConstant = profile.stallTorqueNm / profile.stallCurrentAmps;
  const appliedVoltage = clampPhysical(power, -1, 1) * voltage;
  const currentAmps = power === 0 && !braking ? 0 : (appliedVoltage - backEmfConstant * angularSpeed) / resistance;
  const frictionTorque = torqueConstant * profile.freeCurrentAmps * Math.tanh(angularSpeed / 0.5);
  return { torqueNm: torqueConstant * currentAmps - frictionTorque, currentAmps };
}

export function commandedMotorPower(config: WorldMotorConfiguration, state: MotorPhysicalState, command: MotorCommand, voltage: number): number {
  if (command.enabled === false || command.mode === "STOP_AND_RESET_ENCODER") return 0;
  const direction = (command.direction === "REVERSE" ? -1 : 1) * (config.inverted ? -1 : 1);
  const ticksPerRadian = config.profile.ticksPerRevolution / (2 * Math.PI);
  const ticks = (state.positionRadians - state.encoderOffsetRadians) * ticksPerRadian * direction;
  const velocity = state.velocityRadiansPerSecond * ticksPerRadian * direction;
  if (command.mode === "RUN_TO_POSITION") {
    const error = (command.targetPosition ?? 0) - ticks;
    if (Math.abs(error) <= (command.targetPositionTolerance ?? 5)) return 0;
    return direction * clampPhysical(error * 0.005 - velocity * 0.0004, -Math.abs(command.power), Math.abs(command.power));
  }
  if (command.mode === "RUN_USING_ENCODER" || command.velocitySetpoint !== undefined) {
    const maximumTicks = config.profile.freeSpeedRpm / 60 * config.profile.ticksPerRevolution;
    const target = command.velocitySetpoint ?? command.power * maximumTicks;
    const feedForward = target / maximumTicks * config.profile.nominalVoltage / Math.max(1, voltage);
    return direction * clampPhysical(feedForward + (target - velocity) * 0.0005, -1, 1);
  }
  return direction * clampPhysical(command.power, -1, 1);
}

export function advanceMotor(config: WorldMotorConfiguration, state: MotorPhysicalState, command: MotorCommand, voltage: number, loadTorqueNm: number, outputInertiaKgM2: number, dt: number): void {
  if (command.mode === "STOP_AND_RESET_ENCODER") state.encoderOffsetRadians = state.positionRadians;
  const power = commandedMotorPower(config, state, command, voltage);
  const braking = command.enabled !== false && command.zeroPowerBehavior !== "FLOAT";
  const output = motorElectricalOutput(config.profile, power, state.velocityRadiansPerSecond, voltage, braking);
  const inertia = config.profile.rotorInertiaKgM2 + outputInertiaKgM2 / (config.reduction ** 2);
  // Implicit back-EMF integration avoids numerical energy creation for small unloaded rotors.
  const resistance = config.profile.nominalVoltage / config.profile.stallCurrentAmps;
  const kt = config.profile.stallTorqueNm / config.profile.stallCurrentAmps;
  const ke = (config.profile.nominalVoltage - resistance * config.profile.freeCurrentAmps) / (config.profile.freeSpeedRpm * Math.PI / 30);
  const electricalDamping = power === 0 && !braking ? 0 : kt * ke / resistance;
  const netTorque = output.torqueNm - loadTorqueNm / (config.reduction * config.efficiency);
  state.velocityRadiansPerSecond += netTorque * dt / (inertia + electricalDamping * dt);
  state.positionRadians += state.velocityRadiansPerSecond * dt;
  const nextOutput = motorElectricalOutput(config.profile, power, state.velocityRadiansPerSecond, voltage, braking);
  state.currentAmps = Math.abs(nextOutput.currentAmps);
  state.torqueNm = nextOutput.torqueNm;
  // Thermal capacity and cooling remain experimental; temperature is diagnostic, not a failure switch.
  state.temperatureC += (nextOutput.currentAmps ** 2 * resistance - (state.temperatureC - 25) * 0.4) * dt / 120;
}

export function advanceServo(config: WorldServoConfiguration, state: ServoPhysicalState, target: number, gravityLoadNm: number, dt: number, enabled = true, passiveDampingNmSecondsPerRadian = 0): void {
  state.target = clampPhysical(target, 0, 1);
  const desired = config.minRadians + state.target * (config.maxRadians - config.minRadians);
  const requestedVelocity = clampPhysical((desired - state.angle) * 20, -config.speedRadiansPerSecond, config.speedRadiansPerSecond);
  const torque = enabled ? clampPhysical((requestedVelocity - state.velocity) * config.inertiaKgM2 / dt, -config.torqueNm, config.torqueNm) : 0;
  state.torque = torque;
  if (!enabled && passiveDampingNmSecondsPerRadian > 0 && config.inertiaKgM2 > 0) {
    // The powered profile specifies delivered shaft speed/torque. Once disabled,
    // passive gearbox losses still dissipate energy; the target supplies no torque.
    // Integrate I*dω/dt = -load - c*ω exactly for this step's contact load.
    const timeConstant = config.inertiaKgM2 / passiveDampingNmSecondsPerRadian;
    const relaxation = -Math.expm1(-dt / timeConstant);
    const terminalVelocity = -gravityLoadNm / passiveDampingNmSecondsPerRadian;
    const displacement = terminalVelocity * dt + (state.velocity - terminalVelocity) * timeConstant * relaxation;
    state.velocity = clampPhysical(state.velocity + (terminalVelocity - state.velocity) * relaxation, -config.speedRadiansPerSecond, config.speedRadiansPerSecond);
    state.angle += clampPhysical(displacement, -config.speedRadiansPerSecond * dt, config.speedRadiansPerSecond * dt);
  } else {
    state.velocity = clampPhysical(state.velocity + (torque - gravityLoadNm) / config.inertiaKgM2 * dt, -config.speedRadiansPerSecond, config.speedRadiansPerSecond);
    state.angle += state.velocity * dt;
  }
  if (state.angle <= config.minRadians || state.angle >= config.maxRadians) {
    state.angle = clampPhysical(state.angle, config.minRadians, config.maxRadians);
    state.velocity = 0;
  }
}
