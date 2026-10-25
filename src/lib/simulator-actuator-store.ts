import type { SimulatorActuatorFrame } from "./runtime-types";

type SimulatorActuatorListener = (frame: SimulatorActuatorFrame | null) => void;

/**
 * High-rate actuator frames deliberately live outside React state.
 *
 * The JVM publishes at 50 Hz. Putting those frames in StudioShell state forces
 * Monaco, the project tree, and every tool window to render for every control
 * tick. The simulator subscribes directly, holds the newest command, and keeps
 * its paused Rapier world on a bounded real-time fixed-step clock.
 */
export class SimulatorActuatorStore {
  private frame: SimulatorActuatorFrame | null = null;
  private readonly listeners = new Set<SimulatorActuatorListener>();

  getSnapshot(): SimulatorActuatorFrame | null {
    return this.frame;
  }

  publish(frame: SimulatorActuatorFrame, options: { force?: boolean } = {}): void {
    if (
      !options.force
      && this.frame
      && frame.sequence >= 0
      && frame.sequence <= this.frame.sequence
    ) return;
    this.frame = frame;
    for (const listener of this.listeners) listener(frame);
  }

  neutralize(): void {
    if (!this.frame) return;
    this.frame = {
      ...this.frame,
      motors: Object.fromEntries(Object.entries(this.frame.motors).map(([name, motor]) => [name, {
        ...motor,
        power: 0,
        velocitySetpointTicksPerSecond: null,
      }])),
    };
    for (const listener of this.listeners) listener(this.frame);
  }

  reset(): void {
    this.frame = null;
    for (const listener of this.listeners) listener(null);
  }

  subscribe(listener: SimulatorActuatorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
