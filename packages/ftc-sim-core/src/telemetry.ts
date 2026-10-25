import { DeterministicClock } from "./clock.js";

export interface TelemetryItem {
  caption: string;
  value: string;
}

export interface TelemetryFrame {
  timestampMs: number;
  data: readonly TelemetryItem[];
  lines: readonly string[];
}

function formatValue(format: string, values: readonly unknown[]): string {
  let cursor = 0;
  return format.replace(/%(?:\.(\d+))?([sdif])/g, (_match, precision: string | undefined, type: string) => {
    const value = values[cursor++];
    if (type === "s") return String(value);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    if (type === "d" || type === "i") return String(Math.trunc(numeric));
    return precision === undefined ? String(numeric) : numeric.toFixed(Number(precision));
  });
}

/** Buffered telemetry with explicit, timestamped publication to the simulation UI. */
export class Telemetry {
  private readonly data = new Map<string, TelemetryItem>();
  private lines: string[] = [];
  private readonly frames: TelemetryFrame[] = [];
  private autoClear = true;
  private dirty = false;
  private transmissionIntervalMs = 0;
  private lastTransmissionMs = Number.NEGATIVE_INFINITY;

  constructor(private readonly clock: DeterministicClock) {}

  addData(caption: string, value: unknown): TelemetryItem;
  addData(caption: string, format: string, ...values: unknown[]): TelemetryItem;
  addData(caption: string, valueOrFormat: unknown, ...values: unknown[]): TelemetryItem {
    const item: TelemetryItem = {
      caption,
      value:
        typeof valueOrFormat === "string" && values.length > 0
          ? formatValue(valueOrFormat, values)
          : String(valueOrFormat),
    };
    this.data.set(caption, item);
    this.dirty = true;
    return { ...item };
  }

  addLine(line = ""): void {
    this.lines.push(line);
    this.dirty = true;
  }

  clear(): void {
    this.data.clear();
    this.dirty = true;
  }

  clearAll(): void {
    this.data.clear();
    this.lines = [];
    this.dirty = true;
  }

  setAutoClear(autoClear: boolean): void {
    this.autoClear = autoClear;
  }

  isAutoClear(): boolean {
    return this.autoClear;
  }

  setMsTransmissionInterval(intervalMs: number): void {
    if (!Number.isFinite(intervalMs) || intervalMs < 0) {
      throw new RangeError("Telemetry transmission interval must be a finite non-negative number");
    }
    this.transmissionIntervalMs = intervalMs;
  }

  getMsTransmissionInterval(): number {
    return this.transmissionIntervalMs;
  }

  update(): boolean {
    if (!this.dirty || this.clock.nowMs - this.lastTransmissionMs < this.transmissionIntervalMs) {
      return false;
    }

    const frame: TelemetryFrame = {
      timestampMs: this.clock.nowMs,
      data: [...this.data.values()].map((item) => ({ ...item })),
      lines: [...this.lines],
    };
    this.frames.push(frame);
    this.lastTransmissionMs = this.clock.nowMs;
    this.dirty = false;

    if (this.autoClear) {
      this.data.clear();
      this.lines = [];
    }
    return true;
  }

  getLatestFrame(): TelemetryFrame | undefined {
    const frame = this.frames[this.frames.length - 1];
    return frame === undefined
      ? undefined
      : { timestampMs: frame.timestampMs, data: frame.data.map((item) => ({ ...item })), lines: [...frame.lines] };
  }

  getFrames(): readonly TelemetryFrame[] {
    return this.frames.map((frame) => ({
      timestampMs: frame.timestampMs,
      data: frame.data.map((item) => ({ ...item })),
      lines: [...frame.lines],
    }));
  }
}
