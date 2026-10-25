/** WPILib DataLog 1.0. Fixed-width record headers are valid and deterministic. */
import { AnalysisChannelNames } from "./channel-types";
export type AnalysisValue = number | boolean | string | number[];
export interface AnalysisSample { time: number; values: Readonly<Record<string, AnalysisValue>> }

const utf8 = new TextEncoder();
const uint32 = (value: number) => { const data = new Uint8Array(4); new DataView(data.buffer).setUint32(0, value, true); return data; };
const join = (parts: Uint8Array[]) => {
  const data = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0; for (const part of parts) { data.set(part, offset); offset += part.length; } return data;
};
const string = (value: string) => { const data = utf8.encode(value); return join([uint32(data.length), data]); };
function record(entry: number, time: number, payload: Uint8Array) {
  const header = new Uint8Array(17);
  header[0] = 0x7f; // entry 4 bytes, payload length 4 bytes, timestamp 8 bytes
  const view = new DataView(header.buffer);
  view.setUint32(1, entry, true); view.setUint32(5, payload.length, true);
  view.setBigUint64(9, BigInt(Math.max(0, Math.round(time * 1000))), true);
  return join([header, payload]);
}
function typeOf(value: AnalysisValue) { return Array.isArray(value) ? "double[]" : typeof value === "number" ? "double" : typeof value; }
function dataOf(value: AnalysisValue) {
  if (typeof value === "boolean") return new Uint8Array([value ? 1 : 0]);
  if (typeof value === "string") return utf8.encode(value);
  const values = Array.isArray(value) ? value : [value];
  const data = new Uint8Array(values.length * 8), view = new DataView(data.buffer);
  values.forEach((number, index) => view.setFloat64(index * 8, number, true)); return data;
}

export function encodeWpilog(samples: readonly AnalysisSample[], metadata: Record<string, unknown> = {}): Uint8Array {
  const extra = utf8.encode(JSON.stringify({ source: "FTC Simulator", ...metadata }));
  const parts = [utf8.encode("WPILOG"), new Uint8Array([0, 1]), uint32(extra.length), extra];
  const entries = new Map<string, { id: number; type: string }>(); let nextId = 0;
  const names = new AnalysisChannelNames();
  if (samples.some((sample) => Array.isArray(sample.values["/Robot/Pose"]) && (sample.values["/Robot/Pose"] as number[]).length === 3)) {
    for (const [name, schema] of [["Translation2d", "double x;double y"], ["Rotation2d", "double value"], ["Pose2d", "Translation2d translation;Rotation2d rotation"]]) {
      const id = ++nextId;
      parts.push(record(0, samples[0]?.time ?? 0, join([new Uint8Array([0]), uint32(id), string(`/.schema/struct:${name}`), string("structschema"), string("{}")])));
      parts.push(record(id, samples[0]?.time ?? 0, utf8.encode(schema)));
    }
  }
  let lastTime = -1;
  for (const sample of samples) {
    if (!Number.isFinite(sample.time) || sample.time < lastTime) throw new Error("Log timestamps must increase monotonically");
    lastTime = sample.time;
    for (const [name, value] of Object.entries(sample.values)) {
      const type = name === "/Robot/Pose" && Array.isArray(value) && value.length === 3 ? "struct:Pose2d" : typeOf(value);
      const key = `${name}\0${type}`; let entry = entries.get(key);
      if (!entry) {
        const exportedName = names.resolve(name, type);
        if (!exportedName) continue;
        entry = { id: ++nextId, type }; entries.set(key, entry);
        const entryMetadata = name === "/Robot/Pose" ? { source: "FTC Simulator", units: "meters,radians", description: "x,y,heading in the simulator field coordinate frame" } : { source: "FTC Simulator" };
        parts.push(record(0, sample.time, join([new Uint8Array([0]), uint32(entry.id), string(exportedName), string(type), string(JSON.stringify({ ...entryMetadata, sourceKey: name }))])));
      }
      parts.push(record(entry.id, sample.time, dataOf(value)));
    }
  }
  return join(parts);
}

export function encodeAnalysisCsv(samples: readonly AnalysisSample[]): string {
  const names = [...new Set(samples.flatMap((sample) => Object.keys(sample.values)))].sort();
  const cell = (value: unknown) => `"${String(Array.isArray(value) ? JSON.stringify(value) : value ?? "").replaceAll('"', '""')}"`;
  return [["time_ms", ...names].map(cell).join(","), ...samples.map((sample) => [sample.time, ...names.map((name) => sample.values[name])].map(cell).join(","))].join("\r\n");
}
