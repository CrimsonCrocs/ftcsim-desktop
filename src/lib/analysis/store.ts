import type { DebugVariable, SimulationFrame } from "@ftc-studio/opmode-protocol";
import type { SimulatorHardwareFrame } from "../runtime-types";
import type { AnalysisSample, AnalysisValue } from "./wpilog";

export interface AnalysisSnapshot { revision: number; count: number; start: number; end: number; truncated: boolean; recording: boolean; channels: string[] }
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_SAMPLES = 30_000;
const numeric = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/u;
export function telemetryValue(value: string): AnalysisValue {
  const text = value.trim();
  if (text === "true" || text === "false") return text === "true";
  return numeric.test(text) && Number.isFinite(Number(text)) ? Number(text) : value.slice(0, 2048);
}

export function variableChannels(variables: DebugVariable[], prefix = "/Variables"): Record<string, AnalysisValue> {
  const values: Record<string, AnalysisValue> = Object.create(null);
  let count = 0;
  const walk = (items: DebugVariable[], root: string) => {
    for (const variable of items) {
      if (++count > 256) return;
      const path = `${root}/${variable.name}`;
      if (variable.children?.length) walk(variable.children, path);
      else if (!variable.error && !variable.truncated) {
        const numericType = /^(?:byte|short|int|long|float|double|java\.lang\.(?:Byte|Short|Integer|Long|Float|Double|Number))$/u.test(variable.type);
        const booleanType = variable.type === "boolean" || variable.type === "java.lang.Boolean";
        const parsed = numericType || booleanType ? telemetryValue(variable.value) : variable.value;
        values[path] = numericType && typeof parsed === "number" && Number.isInteger(parsed) && !Number.isSafeInteger(parsed) ? variable.value : parsed;
      }
    }
  };
  walk(variables, prefix); return values;
}

export function runtimeChannels(frame: SimulationFrame, hardware?: SimulatorHardwareFrame | null): Record<string, AnalysisValue> {
  const values: Record<string, AnalysisValue> = Object.create(null);
  values["/Session/Phase"] = frame.phase;
  values["/Session/Running"] = frame.phase === "running";
  values["/Session/Sequence"] = frame.sequence;
  for (const [name, motor] of Object.entries(frame.motors)) {
    const root = `/Motors/${name}`;
    values[`${root}/Power`] = motor.power; values[`${root}/Enabled`] = motor.enabled;
    values[`${root}/TargetPosition`] = motor.targetPosition; values[`${root}/Mode`] = motor.mode;
    const feedback = hardware?.motors[name];
    if (feedback) { values[`${root}/PositionTicks`] = feedback.currentPosition; values[`${root}/VelocityTicksPerSecond`] = feedback.velocityTicksPerSecond; values[`${root}/CurrentAmps`] = feedback.currentAmps; }
  }
  for (const [name, servo] of Object.entries(frame.servos)) values[`/Servos/${name}/Position`] = servo.position;
  for (const [name, value] of Object.entries(frame.telemetry).slice(0, 256)) values[`/Telemetry/${name.slice(0, 256)}`] = telemetryValue(value);
  if (frame.telemetryUpdate?.log.length) values["/Telemetry/Log"] = frame.telemetryUpdate.log.join("\n").slice(-2048);
  if (frame.capturedStdout) values["/Session/Stdout"] = frame.capturedStdout.slice(-2048);
  if (hardware) {
    const pose = hardware.pose;
    values["/Robot/Pose"] = [pose.xMeters, pose.yMeters, pose.headingRadians];
    values["/Robot/XMeters"] = pose.xMeters; values["/Robot/YMeters"] = pose.yMeters; values["/Robot/HeadingRadians"] = pose.headingRadians;
    values["/Robot/SpeedMetersPerSecond"] = Math.hypot(hardware.chassisVelocity.xMetersPerSecond, hardware.chassisVelocity.yMetersPerSecond);
    values["/Robot/XVelocityMetersPerSecond"] = hardware.chassisVelocity.xMetersPerSecond;
    values["/Robot/YVelocityMetersPerSecond"] = hardware.chassisVelocity.yMetersPerSecond;
    values["/Robot/AngularVelocityRadiansPerSecond"] = hardware.chassisVelocity.angularRadiansPerSecond;
    const sensors = hardware.sensors;
    if (sensors) {
      values["/Sensors/Voltage"] = sensors.voltage;
      const orientation = "orientation" in sensors ? { yaw: sensors.orientation.yawRadians, pitch: sensors.orientation.pitchRadians, roll: sensors.orientation.rollRadians } : sensors.orientationRadians;
      const angularVelocity = "angularVelocity" in sensors ? sensors.angularVelocity : sensors.angularVelocityRadiansPerSecond;
      for (const [axis, angle] of Object.entries(orientation ?? {})) values[`/Sensors/IMU/${axis}Radians`] = angle;
      for (const [axis, rate] of Object.entries(angularVelocity ?? {})) values[`/Sensors/IMU/${axis}RadiansPerSecond`] = rate;
      if ("digital" in sensors) {
        values["/Sensors/CurrentAmps"] = sensors.currentAmps;
        for (const kind of ["digital", "analog", "distance"] as const) for (const [name, value] of Object.entries(sensors[kind])) values[`/Sensors/${kind}/${name}`] = value;
        for (const [name, color] of Object.entries(sensors.color)) for (const [key, value] of Object.entries(color)) values[`/Sensors/color/${name}/${key}`] = value;
        for (const [name, odometry] of Object.entries(sensors.odometry)) for (const [key, value] of Object.entries(odometry)) values[`/Sensors/odometry/${name}/${key}`] = value;
      }
    }
  }
  if (frame.variables) Object.assign(values, variableChannels(frame.variables));
  return values;
}

/** Records without React work per tick. A bounded rolling history survives Stop. */
export class AnalysisStore {
  private samples: Array<AnalysisSample & { bytes: number }> = [];
  private bytes = 0;
  private channels = new Set<string>();
  private listeners = new Set<() => void>();
  private liveListeners = new Set<(sample: AnalysisSample) => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private snapshot: AnalysisSnapshot = { revision: 0, count: 0, start: 0, end: 0, truncated: false, recording: true, channels: [] };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  getSamples = (): readonly AnalysisSample[] => this.samples;
  subscribeLive(listener: (sample: AnalysisSample) => void) { this.liveListeners.add(listener); return () => { this.liveListeners.delete(listener); }; }
  record(time: number, input: Record<string, AnalysisValue>) {
    if (!Number.isFinite(time) || time < 0) return;
    // A fresh JVM resets its clock. Keep runs separate instead of corrupting a log timeline.
    if (this.samples.length && time < this.samples.at(-1)!.time) this.clear();
    const values: Record<string, AnalysisValue> = Object.create(null);
    for (const [name, value] of Object.entries(input)) {
      if (!this.channels.has(name) && this.channels.size >= 512) continue;
      if (typeof value === "number" && !Number.isFinite(value)) continue;
      if (Array.isArray(value) && (value.length > 32 || !value.every(Number.isFinite))) continue;
      this.channels.add(name); values[name] = typeof value === "string" ? value.slice(0, 2048) : value;
    }
    const sample = { time, values };
    for (const listener of this.liveListeners) { try { listener(sample); } catch { /* Live consumers own their own errors. */ } }
    if (!this.snapshot.recording) return;
    const bytes = JSON.stringify(sample).length * 2;
    this.samples.push({ ...sample, bytes }); this.bytes += bytes;
    let truncated = this.snapshot.truncated;
    while (this.samples.length > MAX_SAMPLES || this.bytes > MAX_BYTES) { this.bytes -= this.samples.shift()!.bytes; truncated = true; }
    this.snapshot = { ...this.snapshot, revision: this.snapshot.revision + 1, count: this.samples.length,
      start: this.samples[0]?.time ?? 0, end: time, truncated, channels: this.snapshot.channels.length === this.channels.size ? this.snapshot.channels : [...this.channels].sort() };
    this.notify();
  }
  setRecording(recording: boolean) { this.snapshot = { ...this.snapshot, recording, revision: this.snapshot.revision + 1 }; this.notify(); }
  clear() {
    this.samples = []; this.bytes = 0; this.channels.clear();
    this.snapshot = { revision: this.snapshot.revision + 1, count: 0, start: 0, end: 0, truncated: false, recording: this.snapshot.recording, channels: [] };
    this.notify();
  }
  private notify() {
    if (this.timer || this.listeners.size === 0) return;
    this.timer = setTimeout(() => { this.timer = undefined; for (const listener of this.listeners) listener(); }, 100);
  }
  dispose() { clearTimeout(this.timer); this.listeners.clear(); this.liveListeners.clear(); }
}
