import type { TelemetryUpdateFrame } from "@ftc-studio/opmode-protocol";
import type { TelemetrySnapshot } from "@/lib/studio-types";

export interface TelemetryViewSnapshot {
  update: TelemetryUpdateFrame | null;
  robot: TelemetrySnapshot;
}

type ScheduleFrame = (callback: () => void) => void;

const EMPTY_ROBOT_SNAPSHOT: TelemetrySnapshot = Object.freeze({
  x: 0,
  z: 0,
  heading: 0,
  velocity: 0,
  loopHz: 50,
});
const EMPTY_SNAPSHOT: TelemetryViewSnapshot = Object.freeze({
  update: null,
  robot: EMPTY_ROBOT_SNAPSHOT,
});

function browserFrameScheduler(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
  } else {
    setTimeout(callback, 0);
  }
}

/**
 * Retains the newest JVM telemetry publication and notifies React at most once per paint.
 * The 50 Hz runtime can therefore keep running without building a render queue or rerendering
 * Monaco/Three.js for every `telemetry.update()` call.
 */
export class TelemetryViewStore {
  private readonly listeners = new Set<() => void>();
  private readonly scheduleFrame: ScheduleFrame;
  private snapshot: TelemetryViewSnapshot = EMPTY_SNAPSHOT;
  private pending: TelemetryUpdateFrame | null | undefined;
  private pendingRobot: TelemetrySnapshot | undefined;
  private scheduled = false;

  constructor(scheduleFrame: ScheduleFrame = browserFrameScheduler) {
    this.scheduleFrame = scheduleFrame;
  }

  getSnapshot = (): TelemetryViewSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  publish(update: TelemetryUpdateFrame): void {
    const newestRevision = this.pending?.revision ?? this.snapshot.update?.revision ?? -1;
    if (update.revision <= newestRevision) return;
    if (this.listeners.size === 0) {
      this.snapshot = Object.freeze({ ...this.snapshot, update });
      return;
    }
    this.pending = update;
    if (this.scheduled) return;
    this.scheduled = true;
    this.scheduleFrame(() => this.flush());
  }

  publishRobot(robot: TelemetrySnapshot): void {
    if (this.listeners.size === 0) {
      this.snapshot = Object.freeze({ ...this.snapshot, robot });
      return;
    }
    this.pendingRobot = robot;
    if (this.scheduled) return;
    this.scheduled = true;
    this.scheduleFrame(() => this.flush());
  }

  reset(): void {
    this.pending = undefined;
    this.pendingRobot = undefined;
    this.scheduled = false;
    if (this.snapshot === EMPTY_SNAPSHOT) return;
    this.snapshot = EMPTY_SNAPSHOT;
    for (const listener of this.listeners) listener();
  }

  private flush(): void {
    this.scheduled = false;
    const update = this.pending;
    const robot = this.pendingRobot;
    this.pending = undefined;
    this.pendingRobot = undefined;
    const nextUpdate = update && update.revision > (this.snapshot.update?.revision ?? -1)
      ? update
      : this.snapshot.update;
    if (nextUpdate === this.snapshot.update && !robot) return;
    this.snapshot = Object.freeze({ update: nextUpdate, robot: robot ?? this.snapshot.robot });
    for (const listener of this.listeners) listener();
  }
}
