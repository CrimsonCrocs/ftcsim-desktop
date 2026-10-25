"use client";

import { CirclePlus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import type { WorldRobotConfiguration } from "../../../packages/ftc-sim-core/src/world-types";
import {
  MAX_SERVOS,
  type PhysicalHardwareConfiguration,
  type RobotConfigurationCommand,
  type RobotConfigurationDocument,
  type SensorPortConfiguration,
  type ServoPortConfiguration,
} from "@/lib/robot-configuration";
import type { WorldSensorConfiguration } from "../../../packages/ftc-sim-core/src/world-types";
import styles from "./robot-configuration-physical.module.css";

export type PhysicalConfigurationSection = "chassis" | "drive" | "mechanisms" | "servos" | "sensors" | "cameras";

type Props = {
  disabled: boolean;
  document: RobotConfigurationDocument;
  onCommand: (command: RobotConfigurationCommand) => void;
  section: PhysicalConfigurationSection;
};

const radiansToDegrees = (value: number) => value * 180 / Math.PI;
const degreesToRadians = (value: number) => value * Math.PI / 180;
const mm = (value: number) => value * 1000;
const meters = (value: number) => value / 1000;
const formatNumericDisplay = (value: number) => Number.isFinite(value) ? Number(value.toPrecision(10)).toString() : String(value);

function NumberSetting({ label, value, min, max, step = 0.01, unit, disabled, display = (number) => number, parse = (number) => number, validate, validationMessage, descriptionId, commit }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  disabled: boolean;
  display?: (value: number) => number;
  parse?: (value: number) => number;
  validate?: (value: number) => boolean;
  validationMessage?: string;
  descriptionId?: string;
  commit: (value: number) => void;
}) {
  const errorId = useId();
  const [validationError, setValidationError] = useState<string | null>(null);
  const describedBy = [descriptionId, validationError ? errorId : null].filter(Boolean).join(" ") || undefined;
  const displayValue = formatNumericDisplay(display(value));
  return (
    <label className={styles.setting}>
      <span>{label}</span>
      <span className={styles.inputLine}>
        <input
          aria-label={`${label} (${unit})`}
          aria-describedby={describedBy}
          aria-invalid={validationError ? true : undefined}
          type="number"
          min={min}
          max={max}
          step={step}
          defaultValue={displayValue}
          key={`${label}-${value}`}
          disabled={disabled}
          onBlur={(event) => {
            if (event.currentTarget.value === displayValue) {
              setValidationError(null);
              return;
            }
            const displayed = event.currentTarget.valueAsNumber;
            if (!Number.isFinite(displayed) || displayed < min || displayed > max) {
              event.currentTarget.value = displayValue;
              return;
            }
            if (validate && !validate(displayed)) {
              event.currentTarget.value = displayValue;
              setValidationError(validationMessage ?? "This value is not valid.");
              return;
            }
            setValidationError(null);
            const next = parse(displayed);
            if (next !== value) commit(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.stopPropagation();
              event.currentTarget.value = displayValue;
              event.currentTarget.blur();
            }
          }}
        />
        <small>{unit}</small>
      </span>
      {validationError && <small id={errorId} className={styles.inputError} role="alert">{validationError}</small>}
    </label>
  );
}

function TextSetting({ label, value, disabled, commit }: { label: string; value: string; disabled: boolean; commit: (value: string) => void }) {
  return <label className={styles.setting}>
    <span>{label}</span>
    <input
      aria-label={label}
      type="text"
      defaultValue={value}
      key={`${label}-${value}`}
      disabled={disabled}
      onBlur={(event) => { if (event.currentTarget.value !== value) commit(event.currentTarget.value); }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.stopPropagation();
          event.currentTarget.value = value;
          event.currentTarget.blur();
        }
      }}
    />
  </label>;
}

function uniqueName(base: string, names: Set<string>): string {
  let index = 1;
  while (names.has(index === 1 ? base : `${base}_${index}`)) index++;
  return index === 1 ? base : `${base}_${index}`;
}

function getFreePort(ports: readonly { controllerId: string; port: number }[], controllerId: string, maximum: number): number | null {
  for (let port = 0; port <= maximum; port++) {
    if (!ports.some((candidate) => candidate.controllerId === controllerId && candidate.port === port)) return port;
  }
  return null;
}

export function RobotConfigurationPhysicalEditor({ disabled, document, onCommand, section }: Props) {
  const { physical, servoPorts, sensorPorts } = document.configuration;

  const updateRobot = (update: (robot: WorldRobotConfiguration) => void, nextServoPorts = servoPorts, nextSensorPorts = sensorPorts) => {
    const robot = structuredClone(physical);
    update(robot);
    const hardware: PhysicalHardwareConfiguration = {
      robot,
      servoPorts: structuredClone(nextServoPorts),
      sensorPorts: structuredClone(nextSensorPorts),
    };
    onCommand({ type: "set-physical-hardware", hardware });
  };

  const setMechanismReference = (key: "intake.motor" | "feeder.motor" | "shooter.motor" | "lift.motor" | "shooter.turretMotor" | "shooter.turretServo" | "shooter.hoodServo" | "lift.releaseServo" | "gate.servo", value: string) => {
    updateRobot((robot) => {
      const mechanisms = robot.mechanisms;
      if (!mechanisms) return;
      const [group, field] = key.split(".") as [keyof typeof mechanisms, string];
      (mechanisms[group] as unknown as Record<string, string>)[field] = value;
    });
  };

  const addServo = () => {
    if (physical.servos.length >= MAX_SERVOS) return;
    const assignment = document.configuration.controllers.map((hub) => ({ hub, port: getFreePort(servoPorts, hub.id, 5) })).find((candidate) => candidate.port !== null);
    if (!assignment || assignment.port === null) return;
    const name = uniqueName("servo", new Set([
      ...document.configuration.devices.map((motor) => motor.hardwareMapName),
      ...servoPorts.map((servo) => servo.hardwareMapName),
      ...sensorPorts.map((sensor) => sensor.hardwareMapName),
      ...physical.cameras.map((camera) => camera.name),
    ]));
    const descriptor: ServoPortConfiguration = { id: `servo-${name}`, hardwareMapName: name, controllerId: assignment.hub.id, port: assignment.port };
    updateRobot((robot) => robot.servos.push({ name, mount: { x: 0, y: 0.1, z: 0 }, minRadians: 0, maxRadians: Math.PI / 2, speedRadiansPerSecond: 5, torqueNm: 1, inertiaKgM2: 0.004, source: "user configured; physical accuracy unvalidated" }), [...servoPorts, descriptor]);
  };

  const removeServo = (name: string) => {
    const mechanisms = physical.mechanisms;
    if (mechanisms && [mechanisms.shooter.turretServo, mechanisms.shooter.hoodServo, mechanisms.lift.releaseServo, mechanisms.gate.servo].includes(name)) return;
    updateRobot((robot) => { robot.servos = robot.servos.filter((servo) => servo.name !== name); }, servoPorts.filter((servo) => servo.hardwareMapName !== name));
  };

  const addSensor = () => {
    const assignment = document.configuration.controllers.map((hub) => ({ hub, port: getFreePort(sensorPorts.filter((sensor) => sensor.kind === "digital"), hub.id, 7) })).find((candidate) => candidate.port !== null);
    if (!assignment || assignment.port === null) return;
    const name = uniqueName("digital_input", new Set([
      ...document.configuration.devices.map((motor) => motor.hardwareMapName),
      ...servoPorts.map((servo) => servo.hardwareMapName),
      ...sensorPorts.map((sensor) => sensor.hardwareMapName),
      ...physical.cameras.map((camera) => camera.name),
    ]));
    const descriptor: SensorPortConfiguration = { id: `sensor-${name}`, hardwareMapName: name, kind: "digital", controllerId: assignment.hub.id, port: assignment.port };
    updateRobot((robot) => robot.sensors.push({ name, kind: "digital", mount: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }, maximumRange: 0.1, noise: 0, latencyMs: 0 }), servoPorts, [...sensorPorts, descriptor]);
  };

  const removeSensor = (name: string) => updateRobot((robot) => {
    robot.sensors = robot.sensors.filter((sensor) => sensor.name !== name);
  }, servoPorts, sensorPorts.filter((sensor) => sensor.hardwareMapName !== name));

  const addCamera = () => {
    if (physical.cameras.length >= 4) return;
    const name = uniqueName("Webcam", new Set([
      ...document.configuration.devices.map((motor) => motor.hardwareMapName),
      ...servoPorts.map((servo) => servo.hardwareMapName),
      ...sensorPorts.map((sensor) => sensor.hardwareMapName),
      ...physical.cameras.map((camera) => camera.name),
    ]));
    updateRobot((robot) => robot.cameras.push({
      name,
      mount: { position: { x: 0, y: 0.2, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      horizontalFovRadians: Math.PI / 2,
      verticalFovRadians: Math.PI / 3,
      maximumRange: 4,
      latencyMs: 80,
      framesPerSecond: 30,
      positionNoiseMeters: 0.005,
      angleNoiseRadians: 0.01,
    }));
  };

  const removeCamera = (index: number) => updateRobot((robot) => { robot.cameras.splice(index, 1); });

  const setPort = (kind: "servo" | "sensor", id: string, field: "controllerId" | "port", value: string | number) => {
    const servo = kind === "servo";
    const servoMapping = servoPorts.map((entry) => entry.id === id ? { ...entry, [field]: value } : entry);
    const sensorMapping = sensorPorts.map((entry) => entry.id === id ? { ...entry, [field]: value } : entry);
    updateRobot(() => {}, servo ? servoMapping : servoPorts, servo ? sensorPorts : sensorMapping);
  };

  const numeric = (label: string, value: number, min: number, max: number, unit: string, commit: (next: number) => void, step?: number, display?: (value: number) => number, parse?: (value: number) => number) => (
    <NumberSetting key={label} label={label} value={value} min={min} max={max} unit={unit} disabled={disabled} commit={commit} step={step} display={display} parse={parse} />
  );
  const vectorSettings = (label: string, value: { x: number; y: number; z: number }, commit: (axis: "x" | "y" | "z", next: number) => void) => (
    <div className={styles.vector} aria-label={`${label} position`}>
      {(["x", "y", "z"] as const).map((axis) => numeric(`${label} ${axis.toUpperCase()}`, mm(value[axis]), -2000, 2000, "mm", (next) => commit(axis, meters(next)), 1))}
    </div>
  );
  const unitVectorSettings = (label: string, value: { x: number; y: number; z: number }, commit: (axis: "x" | "y" | "z", next: number) => void) => (
    <div className={styles.vector} role="group" aria-label={`${label} direction`}>
      {(["x", "y", "z"] as const).map((axis) => <NumberSetting
        key={`${label}-${axis}-${value[axis]}`}
        label={`${label} ${axis.toUpperCase()}`}
        value={value[axis]}
        min={-1}
        max={1}
        unit="unitless"
        disabled={disabled}
        descriptionId="lift-axis-description"
        commit={(next) => commit(axis, next)}
        validate={axis === "y" ? (next) => next > 0 : undefined}
        validationMessage={axis === "y" ? "Lift axis Y must be greater than zero." : undefined}
      />)}
    </div>
  );
  const rotationSettings = (label: string, rotation: { x: number; y: number; z: number; w: number }, commit: (rotation: { x: number; y: number; z: number; w: number }) => void) => {
    const roll = Math.atan2(2 * (rotation.w * rotation.x + rotation.y * rotation.z), 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y));
    const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (rotation.w * rotation.y - rotation.z * rotation.x))));
    const yaw = Math.atan2(2 * (rotation.w * rotation.z + rotation.x * rotation.y), 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z));
    const update = (axis: "roll" | "pitch" | "yaw", value: number) => {
      const angles = { roll, pitch, yaw, [axis]: degreesToRadians(value) };
      const cr = Math.cos(angles.roll / 2), sr = Math.sin(angles.roll / 2);
      const cp = Math.cos(angles.pitch / 2), sp = Math.sin(angles.pitch / 2);
      const cy = Math.cos(angles.yaw / 2), sy = Math.sin(angles.yaw / 2);
      commit({ x: sr * cp * cy - cr * sp * sy, y: cr * sp * cy + sr * cp * sy, z: cr * cp * sy - sr * sp * cy, w: cr * cp * cy + sr * sp * sy });
    };
    return <div className={styles.vector} aria-label={`${label} orientation`}>
      {numeric(`${label} roll`, radiansToDegrees(roll), -180, 180, "°", (next) => update("roll", next), 1)}
      {numeric(`${label} pitch`, radiansToDegrees(pitch), -90, 90, "°", (next) => update("pitch", next), 1)}
      {numeric(`${label} yaw`, radiansToDegrees(yaw), -180, 180, "°", (next) => update("yaw", next), 1)}
    </div>;
  };

  const sectionTitle: Record<PhysicalConfigurationSection, string> = {
    chassis: "Chassis and power",
    drive: "Motor and wheel physics",
    mechanisms: "Mechanisms",
    servos: "Servos",
    sensors: "Sensors",
    cameras: "Cameras",
  };

  return (
    <div className={styles.editor}>
      <header className={styles.header}>
        <h2 id="robot-physical-title">{sectionTitle[section]}</h2>
        <p className={styles.calibrationNote}>Calibration unvalidated</p>
      </header>

      {section === "chassis" && <section className={styles.section} aria-labelledby="robot-physical-title">
        <div className={styles.grid}>
          {numeric("Chassis width", mm(physical.chassis.size.x), 50, 457.2, "mm", (next) => updateRobot((robot) => { robot.chassis.size.x = meters(next); }), 1)}
          {numeric("Chassis height", mm(physical.chassis.size.y), 30, 457.2, "mm", (next) => updateRobot((robot) => { robot.chassis.size.y = meters(next); }), 1)}
          {numeric("Chassis length", mm(physical.chassis.size.z), 50, 457.2, "mm", (next) => updateRobot((robot) => { robot.chassis.size.z = meters(next); }), 1)}
          {numeric("Robot mass", physical.chassis.massKg, 1, 30, "kg", (next) => updateRobot((robot) => { robot.chassis.massKg = next; }), 0.1)}
        </div>
        <details className={styles.details}>
          <summary>Mass distribution and battery</summary>
        {vectorSettings("Center of mass", physical.chassis.centerOfMass, (axis, value) => updateRobot((robot) => { robot.chassis.centerOfMass[axis] = value; }))}
        <div className={styles.grid}>
          {numeric("Battery open-circuit voltage", physical.battery.openCircuitVoltage, 6, 16, "V", (next) => updateRobot((robot) => { robot.battery.openCircuitVoltage = next; }), 0.1)}
          {numeric("Battery internal resistance", physical.battery.internalResistanceOhms, 0.001, 1, "Ω", (next) => updateRobot((robot) => { robot.battery.internalResistanceOhms = next; }), 0.001)}
          {numeric("Battery current limit", physical.battery.maximumCurrentAmps, 1, 200, "A", (next) => updateRobot((robot) => { robot.battery.maximumCurrentAmps = next; }), 1)}
        </div>
        </details>
      </section>}

      {section === "drive" && <section className={styles.section} aria-labelledby="robot-physical-title">
        {physical.motors.length === 0 && physical.wheels.length === 0 && <p className={styles.emptyState}>No drive motors or wheels are configured.</p>}
        {physical.motors.map((motor) => {
          const device = document.configuration.devices.find((candidate) => candidate.hardwareMapName === motor.name);
          if (!device) return null;
          const updateMotor = (update: (entry: WorldRobotConfiguration["motors"][number]) => void) => updateRobot((robot) => {
            const entry = robot.motors.find((candidate) => candidate.name === motor.name);
            if (entry) update(entry);
          });
          return (
            <details className={styles.details} key={motor.name}>
              <summary>{motor.name} <small>motor port {device.port}</small></summary>
              <div className={styles.grid}>
                {numeric(`${motor.name} external reduction`, motor.reduction, 0.01, 1000, ":1", (next) => updateMotor((entry) => { entry.reduction = next; }), 0.01)}
                {numeric(`${motor.name} drive efficiency`, motor.efficiency, 0.01, 1, "ratio", (next) => updateMotor((entry) => { entry.efficiency = next; }), 0.01)}
                {numeric(`${motor.name} nominal voltage`, motor.profile.nominalVoltage, 1, 24, "V", (next) => updateMotor((entry) => { entry.profile.nominalVoltage = next; }), 0.1)}
                {numeric(`${motor.name} free speed`, motor.profile.freeSpeedRpm, 1, 5000, "rpm", (next) => updateMotor((entry) => { entry.profile.freeSpeedRpm = next; }), 1)}
                {numeric(`${motor.name} stall torque`, motor.profile.stallTorqueNm, 0.001, 100, "N·m", (next) => updateMotor((entry) => { entry.profile.stallTorqueNm = next; }), 0.01)}
                {numeric(`${motor.name} stall current`, motor.profile.stallCurrentAmps, 0.01, 100, "A", (next) => updateMotor((entry) => { entry.profile.stallCurrentAmps = next; }), 0.1)}
                {numeric(`${motor.name} free current`, motor.profile.freeCurrentAmps, 0, 100, "A", (next) => updateMotor((entry) => { entry.profile.freeCurrentAmps = next; }), 0.01)}
                {numeric(`${motor.name} encoder ticks`, motor.profile.ticksPerRevolution, 1, 1000000, "ticks/rev", (next) => updateMotor((entry) => { entry.profile.ticksPerRevolution = next; }), 1)}
                {numeric(`${motor.name} rotor inertia`, motor.profile.rotorInertiaKgM2, 0.000001, 10, "kg·m²", (next) => updateMotor((entry) => { entry.profile.rotorInertiaKgM2 = next; }), 0.0001)}
              </div>
              <label className={styles.check}>
                <input type="checkbox" checked={motor.inverted} disabled={disabled} onChange={(event) => updateMotor((entry) => { entry.inverted = event.currentTarget.checked; })} />
                <span>Motor direction inverted</span>
              </label>
              <p className={styles.provenance}>{motor.profile.id}: {motor.profile.freeSpeedRpm} rpm, {motor.profile.stallTorqueNm.toFixed(2)} Nm stall, {motor.profile.stallCurrentAmps} A. Source: {motor.profile.source}</p>
            </details>
          );
        })}
        {physical.wheels.map((wheel, index) => (
          <details className={styles.details} key={`${wheel.motor}-${index}`}>
            <summary>{wheel.motor} wheel <small>contact and suspension</small></summary>
            <div className={styles.grid}>
              {numeric(`${wheel.motor} wheel radius`, mm(wheel.radius), 10, 250, "mm", (next) => updateRobot((robot) => { robot.wheels[index]!.radius = meters(next); }), 1)}
              {numeric(`${wheel.motor} grip`, wheel.grip, 0, 3, "ratio", (next) => updateRobot((robot) => { robot.wheels[index]!.grip = next; }), 0.01)}
              {numeric(`${wheel.motor} roller grip`, wheel.rollerGrip, 0, 3, "ratio", (next) => updateRobot((robot) => { robot.wheels[index]!.rollerGrip = next; }), 0.01)}
              {numeric(`${wheel.motor} traction angle`, radiansToDegrees(wheel.tractionAngle), -180, 180, "°", (next) => updateRobot((robot) => { robot.wheels[index]!.tractionAngle = degreesToRadians(next); }), 1)}
              {numeric(`${wheel.motor} suspension travel`, mm(wheel.suspensionTravel), 0, 100, "mm", (next) => updateRobot((robot) => { robot.wheels[index]!.suspensionTravel = meters(next); }), 1)}
              {numeric(`${wheel.motor} spring stiffness`, wheel.springNPerM, 0, 100000, "N/m", (next) => updateRobot((robot) => { robot.wheels[index]!.springNPerM = next; }), 10)}
              {numeric(`${wheel.motor} damper coefficient`, wheel.damperNsPerM, 0, 10000, "N·s/m", (next) => updateRobot((robot) => { robot.wheels[index]!.damperNsPerM = next; }), 1)}
            </div>
            {vectorSettings(`${wheel.motor} wheel mount`, wheel.mount, (axis, value) => updateRobot((robot) => { robot.wheels[index]!.mount[axis] = value; }))}
          </details>
        ))}
      </section>}

      {section === "mechanisms" && <section className={styles.section} aria-labelledby="robot-physical-title">
        {physical.mechanisms && (() => {
          const m = physical.mechanisms;
          const motorNames = physical.motors.map((motor) => motor.name);
          const servoNames = physical.servos.map((servo) => servo.name);
          const motorSelect = (label: string, value: string, commit: (value: string) => void) => (
            <label className={styles.setting} key={label}>
              <span>{label}</span>
              <select aria-label={label} value={value} disabled={disabled} onChange={(event) => commit(event.currentTarget.value)}>
                {motorNames.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
          );
          const servoSelect = (label: string, value: string, commit: (value: string) => void) => (
            <label className={styles.setting} key={label}>
              <span>{label}</span>
              <select aria-label={label} value={value} disabled={disabled} onChange={(event) => commit(event.currentTarget.value)}>
                {servoNames.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
          );
          return (
            <div className={styles.mechanisms}>
              <details className={styles.details}>
                <summary>Intake</summary>
                <div className={styles.grid}>
                  {motorSelect("Intake motor", m.intake.motor, (value) => setMechanismReference("intake.motor", value))}
                  {numeric("Intake width", mm(m.intake.width), 10, 457.2, "mm", (next) => updateRobot((robot) => { robot.mechanisms!.intake.width = meters(next); }), 1)}
                  {numeric("Roller radius", mm(m.intake.radius), 5, 250, "mm", (next) => updateRobot((robot) => { robot.mechanisms!.intake.radius = meters(next); }), 1)}
                  {numeric("Roller compliance", m.intake.complianceNPerM, 0, 100000, "N/m", (next) => updateRobot((robot) => { robot.mechanisms!.intake.complianceNPerM = next; }), 10)}
                </div>
                {vectorSettings("Intake mount", m.intake.mount, (axis, value) => updateRobot((robot) => { robot.mechanisms!.intake.mount[axis] = value; }))}
              </details>
              <details className={styles.details}>
                <summary>Feeder and storage</summary>
                <div className={styles.grid}>
                  {motorSelect("Feeder motor", m.feeder.motor, (value) => setMechanismReference("feeder.motor", value))}
                  {numeric("Feeder reduction", m.feeder.reduction ?? 1, 0.01, 1000, ":1", (next) => updateRobot((robot) => { robot.mechanisms!.feeder.reduction = next; }), 0.1)}
                  {numeric("Feeder speed", m.feeder.speedMetersPerSecond, 0, 20, "m/s", (next) => updateRobot((robot) => { robot.mechanisms!.feeder.speedMetersPerSecond = next; }), 0.01)}
                  {numeric("Feeder grip", m.feeder.grip, 0, 3, "ratio", (next) => updateRobot((robot) => { robot.mechanisms!.feeder.grip = next; }), 0.01)}
                  {numeric("Storage width", mm(m.storage.width), 10, 457.2, "mm", (next) => updateRobot((robot) => { robot.mechanisms!.storage.width = meters(next); }), 1)}
                  {numeric("Storage length", mm(m.storage.length), 10, 1000, "mm", (next) => updateRobot((robot) => { robot.mechanisms!.storage.length = meters(next); }), 1)}
                  {numeric("Storage capacity", m.storage.capacity, 1, 40, "elements", (next) => updateRobot((robot) => { robot.mechanisms!.storage.capacity = next; }), 1)}
                </div>
                {vectorSettings("Storage mount", m.storage.mount, (axis, value) => updateRobot((robot) => { robot.mechanisms!.storage.mount[axis] = value; }))}
              </details>
              <details className={styles.details}>
                <summary>Shooter and aiming</summary>
                <div className={styles.grid}>
                  {motorSelect("Flywheel motor", m.shooter.motor, (value) => setMechanismReference("shooter.motor", value))}
                  {m.shooter.turretMotor
                    ? motorSelect("Turret motor", m.shooter.turretMotor, (value) => setMechanismReference("shooter.turretMotor", value))
                    : servoSelect("Turret servo", m.shooter.turretServo ?? "", (value) => setMechanismReference("shooter.turretServo", value))}
                  {m.shooter.turretMotor && numeric("Turret inertia", m.shooter.turretInertiaKgM2 ?? 0.012, 0.000001, 10, "kg·m²", (next) => updateRobot((robot) => { robot.mechanisms!.shooter.turretInertiaKgM2 = next; }), 0.001)}
                  {servoSelect("Hood servo", m.shooter.hoodServo, (value) => setMechanismReference("shooter.hoodServo", value))}
                  {numeric("Flywheel radius", mm(m.shooter.wheelRadius), 5, 250, "mm", (next) => updateRobot((robot) => { robot.mechanisms!.shooter.wheelRadius = meters(next); }), 1)}
                  {numeric("Flywheel inertia", m.shooter.inertiaKgM2, 0.000001, 10, "kg·m²", (next) => updateRobot((robot) => { robot.mechanisms!.shooter.inertiaKgM2 = next; }), 0.0001)}
                  {numeric("Ball compression", mm(m.shooter.compression), 0, 100, "mm", (next) => updateRobot((robot) => { robot.mechanisms!.shooter.compression = meters(next); }), 1)}
                </div>
                {vectorSettings("Shooter mount", m.shooter.mount, (axis, value) => updateRobot((robot) => { robot.mechanisms!.shooter.mount[axis] = value; }))}
              </details>
              <details className={styles.details}>
                <summary>Lift and sorting</summary>
                <div className={styles.grid}>
                  {motorSelect("Lift motor", m.lift.motor, (value) => setMechanismReference("lift.motor", value))}
                  {servoSelect("Release servo", m.lift.releaseServo, (value) => setMechanismReference("lift.releaseServo", value))}
                  {servoSelect("Sorting gate servo", m.gate.servo, (value) => setMechanismReference("gate.servo", value))}
                  {numeric("Lift spool radius", mm(m.lift.spoolRadius), 1, 100, "mm", (next) => updateRobot((robot) => { robot.mechanisms!.lift.spoolRadius = meters(next); }), 1)}
                  {numeric("Lift travel hard stop", mm(m.lift.maximumTravel), 1, 736.6, "mm", (next) => updateRobot((robot) => { robot.mechanisms!.lift.maximumTravel = meters(next); }), 1)}
                  {numeric("Lift carriage mass", m.lift.carriageMassKg, 0.01, 15, "kg", (next) => updateRobot((robot) => { robot.mechanisms!.lift.carriageMassKg = next; }), 0.1)}
                  {numeric("Sorting threshold", m.gate.rejectionThreshold, 0, 1, "ratio", (next) => updateRobot((robot) => { robot.mechanisms!.gate.rejectionThreshold = next; }), 0.01)}
                </div>
                {vectorSettings("Lift mount", m.lift.mount, (axis, value) => updateRobot((robot) => { robot.mechanisms!.lift.mount[axis] = value; }))}
                {unitVectorSettings("Lift axis", m.lift.axis ?? { x: 0, y: 1, z: 0 }, (axis, value) => updateRobot((robot) => {
                  robot.mechanisms!.lift.axis ??= { x: 0, y: 1, z: 0 };
                  robot.mechanisms!.lift.axis[axis] = value;
                }))}
                <p id="lift-axis-description" className={styles.provenance}>Unitless direction in robot coordinates. The three values must form a unit vector, and Y must be greater than zero.</p>
                {document.diagnostics.filter((diagnostic) => /lift.*axis|axis.*lift/i.test(diagnostic.message)).map((diagnostic, index) => (
                  <p className={styles.validationError} role="status" key={`${diagnostic.code}-${index}`}>{diagnostic.message}</p>
                ))}
              </details>
            </div>
          );
        })()}
        {!physical.mechanisms && <div className={styles.emptyState}>
          <p>No mechanism profile is configured for this robot.</p>
          <button className={styles.action} type="button" disabled={disabled} title="Replaces the configured hubs, devices and physical settings with the BIOBUZZ starter robot." onClick={() => onCommand({ type: "apply-biobuzz-all-rounder" })}><CirclePlus aria-hidden="true" /> Replace with BIOBUZZ all-rounder</button>
        </div>}
      </section>
      }

      {section === "servos" && <section className={styles.section} aria-labelledby="robot-physical-title">
        <div className={styles.sectionHeading}><button type="button" disabled={disabled || physical.servos.length >= MAX_SERVOS || !document.configuration.controllers.some((hub) => getFreePort(servoPorts, hub.id, 5) !== null)} onClick={addServo}><CirclePlus aria-hidden="true" /> Add servo</button></div>
        {physical.servos.length === 0 && <p className={styles.emptyState}>No servos configured.</p>}
        {physical.servos.map((servo) => {
          const descriptor = servoPorts.find((entry) => entry.hardwareMapName === servo.name);
          if (!descriptor) return null;
          const updateServo = (update: (entry: WorldRobotConfiguration["servos"][number]) => void) => updateRobot((robot) => { const entry = robot.servos.find((candidate) => candidate.name === servo.name); if (entry) update(entry); });
          const canRemove = !physical.mechanisms || ![physical.mechanisms.shooter.turretServo, physical.mechanisms.shooter.hoodServo, physical.mechanisms.lift.releaseServo, physical.mechanisms.gate.servo].includes(servo.name);
          return <details className={styles.details} key={servo.name}><summary>{servo.name} <small>servo port {descriptor.port}</small></summary>
            <div className={styles.grid}>
              <TextSetting label={`${servo.name} HardwareMap name`} value={servo.name} disabled={disabled} commit={(name) => onCommand({ type: "set-servo-name", servoId: descriptor.id, name })} />
              <label className={styles.setting}><span>Hub</span><select aria-label={`${servo.name} hub`} value={descriptor.controllerId} disabled={disabled} onChange={(event) => setPort("servo", descriptor.id, "controllerId", event.currentTarget.value)}>{document.configuration.controllers.map((hub) => <option value={hub.id} key={hub.id}>{hub.name}</option>)}</select></label>
              <label className={styles.setting}><span>Servo port</span><select aria-label={`${servo.name} servo port`} value={descriptor.port} disabled={disabled} onChange={(event) => setPort("servo", descriptor.id, "port", Number(event.currentTarget.value))}>{Array.from({ length: 6 }, (_, port) => <option value={port} key={port}>Port {port}</option>)}</select></label>
              {numeric(`${servo.name} minimum travel`, radiansToDegrees(servo.minRadians), -720, 720, "°", (next) => updateServo((entry) => { entry.minRadians = degreesToRadians(next); }), 1)}
              {numeric(`${servo.name} maximum travel`, radiansToDegrees(servo.maxRadians), -720, 720, "°", (next) => updateServo((entry) => { entry.maxRadians = degreesToRadians(next); }), 1)}
              {numeric(`${servo.name} travel speed`, radiansToDegrees(servo.speedRadiansPerSecond), 0.5, 5000, "°/s", (next) => updateServo((entry) => { entry.speedRadiansPerSecond = degreesToRadians(next); }), 1)}
              {numeric(`${servo.name} torque`, servo.torqueNm, 0.001, 100, "N·m", (next) => updateServo((entry) => { entry.torqueNm = next; }), 0.01)}
              {numeric(`${servo.name} inertia`, servo.inertiaKgM2, 0, 10, "kg·m²", (next) => updateServo((entry) => { entry.inertiaKgM2 = next; }), 0.001)}
              {!canRemove && <p className={styles.provenance}>Reassign the mechanism before removing this servo.</p>}
              {canRemove && <button className={styles.remove} type="button" disabled={disabled} onClick={() => removeServo(servo.name)}><Trash2 aria-hidden="true" /> Remove servo</button>}
            </div>
            {vectorSettings(`${servo.name} mount`, servo.mount, (axis, value) => updateServo((entry) => { entry.mount[axis] = value; }))}
          </details>;
        })}
      </section>}

      {section === "sensors" && <section className={styles.section} aria-labelledby="robot-physical-title">
        <div className={styles.sectionHeading}><button type="button" disabled={disabled || !document.configuration.controllers.some((hub) => getFreePort(sensorPorts.filter((sensor) => sensor.kind === "digital"), hub.id, 7) !== null)} onClick={addSensor}><CirclePlus aria-hidden="true" /> Add digital sensor</button></div>
        {physical.sensors.length === 0 && <p className={styles.emptyState}>No sensors configured.</p>}
        {physical.sensors.map((sensor, index) => {
          const descriptor = sensorPorts.find((entry) => entry.hardwareMapName === sensor.name);
          if (!descriptor) return null;
          const updateSensor = (update: (entry: WorldRobotConfiguration["sensors"][number]) => void) => updateRobot((robot) => { const entry = robot.sensors.find((candidate) => candidate.name === sensor.name); if (entry) update(entry); });
          return <details className={styles.details} key={sensor.name}><summary>{sensor.name} <small>{sensor.kind} sensor · port {descriptor.port}</small></summary>
            <div className={styles.grid}>
              <TextSetting label={`${sensor.name} HardwareMap name`} value={sensor.name} disabled={disabled} commit={(name) => onCommand({ type: "set-sensor-name", sensorId: descriptor.id, name })} />
              <label className={styles.setting}><span>Sensor type</span><select aria-label={`${sensor.name} sensor type`} value={sensor.kind} disabled={disabled} onChange={(event) => {
                const kind = event.currentTarget.value as WorldSensorConfiguration["kind"];
                updateRobot((robot) => { robot.sensors[index]!.kind = kind; }, servoPorts, sensorPorts.map((entry) => entry.id === descriptor.id ? { ...entry, kind, port: Math.min(entry.port, kind === "digital" ? 7 : 3) } : entry));
              }}>{["digital", "distance", "color", "analog", "odometry", "pinpoint"].map((kind) => <option key={kind}>{kind}</option>)}</select></label>
              <label className={styles.setting}><span>Hub</span><select aria-label={`${sensor.name} hub`} value={descriptor.controllerId} disabled={disabled} onChange={(event) => setPort("sensor", descriptor.id, "controllerId", event.currentTarget.value)}>{document.configuration.controllers.map((hub) => <option value={hub.id} key={hub.id}>{hub.name}</option>)}</select></label>
              <label className={styles.setting}><span>Hub port</span><select aria-label={`${sensor.name} hub port`} value={descriptor.port} disabled={disabled} onChange={(event) => setPort("sensor", descriptor.id, "port", Number(event.currentTarget.value))}>{Array.from({ length: sensor.kind === "digital" ? 8 : 4 }, (_, port) => <option value={port} key={port}>Port {port}</option>)}</select></label>
              {numeric(`${sensor.name} sensing range`, sensor.maximumRange, 0, 100, "m", (next) => updateSensor((entry) => { entry.maximumRange = next; }), 0.01)}
              {numeric(`${sensor.name} measurement noise`, sensor.noise, 0, 100, "σ", (next) => updateSensor((entry) => { entry.noise = next; }), 0.001)}
              {numeric(`${sensor.name} sensor latency`, sensor.latencyMs, 0, 10000, "ms", (next) => updateSensor((entry) => { entry.latencyMs = next; }), 1)}
              <button className={styles.remove} type="button" disabled={disabled} onClick={() => removeSensor(sensor.name)}><Trash2 aria-hidden="true" /> Remove sensor</button>
            </div>
            {vectorSettings(`${sensor.name} mount`, sensor.mount.position, (axis, value) => updateSensor((entry) => { entry.mount.position[axis] = value; }))}
            {rotationSettings(`${sensor.name} mount`, sensor.mount.rotation, (rotation) => updateSensor((entry) => { entry.mount.rotation = rotation; }))}
          </details>;
        })}
      </section>}

      {section === "cameras" && <section className={styles.section} aria-labelledby="robot-physical-title">
        <div className={styles.sectionHeading}><button type="button" disabled={disabled || physical.cameras.length >= 4} onClick={addCamera}><CirclePlus aria-hidden="true" /> Add camera</button></div>
        {physical.cameras.length === 0 && <p className={styles.emptyState}>No cameras configured.</p>}
        {physical.cameras.map((camera, index) => {
          const updateCamera = (update: (entry: WorldRobotConfiguration["cameras"][number]) => void) => updateRobot((robot) => { const entry = robot.cameras[index]; if (entry) update(entry); });
          return <details className={styles.details} key={`${camera.name}-${index}`}><summary>{camera.name}<small>synthetic vision and AprilTag settings</small></summary>
            <div className={styles.grid}>
              <TextSetting label={`${camera.name} HardwareMap name`} value={camera.name} disabled={disabled} commit={(name) => onCommand({ type: "set-camera-name", currentName: camera.name, name })} />
              {numeric(`${camera.name} horizontal field of view`, radiansToDegrees(camera.horizontalFovRadians), 1, 360, "°", (next) => updateCamera((entry) => { entry.horizontalFovRadians = degreesToRadians(next); }), 1)}
              {numeric(`${camera.name} vertical field of view`, radiansToDegrees(camera.verticalFovRadians), 1, 180, "°", (next) => updateCamera((entry) => { entry.verticalFovRadians = degreesToRadians(next); }), 1)}
              {numeric(`${camera.name} camera range`, camera.maximumRange, 0, 100, "m", (next) => updateCamera((entry) => { entry.maximumRange = next; }), 0.1)}
              {numeric(`${camera.name} camera latency`, camera.latencyMs, 0, 10000, "ms", (next) => updateCamera((entry) => { entry.latencyMs = next; }), 1)}
              {numeric(`${camera.name} frame rate`, camera.framesPerSecond, 1, 240, "fps", (next) => updateCamera((entry) => { entry.framesPerSecond = next; }), 1)}
              {numeric(`${camera.name} position noise`, camera.positionNoiseMeters, 0, 10, "m", (next) => updateCamera((entry) => { entry.positionNoiseMeters = next; }), 0.001)}
              {numeric(`${camera.name} angle noise`, radiansToDegrees(camera.angleNoiseRadians), 0, 180, "°", (next) => updateCamera((entry) => { entry.angleNoiseRadians = degreesToRadians(next); }), 0.1)}
              <button className={styles.remove} type="button" disabled={disabled} onClick={() => removeCamera(index)}><Trash2 aria-hidden="true" /> Remove camera</button>
            </div>
            {vectorSettings(`${camera.name} mount`, camera.mount.position, (axis, value) => updateCamera((entry) => { entry.mount.position[axis] = value; }))}
            {rotationSettings(`${camera.name} mount`, camera.mount.rotation, (rotation) => updateCamera((entry) => { entry.mount.rotation = rotation; }))}
          </details>;
        })}
      </section>}
    </div>
  );
}
