import type { TouchGamepadInput } from "./types";

export type TouchStick = "left" | "right";
export type TouchControl = keyof TouchGamepadInput;
type StickPointer = { stick: TouchStick; x: number; y: number };
type ButtonPointer = { control: TouchControl };
type AxisControl = "left_stick_x" | "left_stick_y" | "right_stick_x" | "right_stick_y";

const STICK_AXES: Record<TouchStick, readonly [AxisControl, AxisControl]> = {
  left: ["left_stick_x", "left_stick_y"],
  right: ["right_stick_x", "right_stick_y"],
};

/** Tracks each touch/keyboard control independently so cancellation releases only its owner. */
export class TouchInputTracker {
  private readonly pointers = new Map<number, StickPointer | ButtonPointer>();
  private readonly keys = new Map<string, TouchControl>();
  private readonly sliderAxes: Partial<Record<AxisControl, number>> = {};
  private readonly listeners = new Set<() => void>();
  private currentSnapshot: TouchGamepadInput = {};

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): TouchGamepadInput => this.currentSnapshot;

  commit(): void {
    this.currentSnapshot = this.snapshot();
    for (const listener of this.listeners) listener();
  }

  pressButton(pointerId: number, control: TouchControl): void {
    this.pointers.set(pointerId, { control });
  }

  moveStick(pointerId: number, stick: TouchStick, x: number, y: number): void {
    const [xAxis, yAxis] = STICK_AXES[stick];
    delete this.sliderAxes[xAxis];
    delete this.sliderAxes[yAxis];
    this.pointers.set(pointerId, {
      stick,
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
    });
  }

  setSlider(axis: AxisControl, value: number): void {
    this.sliderAxes[axis] = Math.max(-1, Math.min(1, value));
  }

  releasePointer(pointerId: number): void {
    this.pointers.delete(pointerId);
  }

  pressKey(code: string, control: TouchControl): void {
    this.keys.set(`${code}:${control}`, control);
  }

  releaseKey(code: string, control: TouchControl): void {
    this.keys.delete(`${code}:${control}`);
  }

  releaseControlKeys(control: TouchControl): void {
    for (const [key, heldControl] of this.keys) {
      if (heldControl === control) this.keys.delete(key);
    }
  }

  closeButtons(): void {
    for (const [pointerId, pointer] of this.pointers) {
      if (!("stick" in pointer)) this.pointers.delete(pointerId);
    }
    this.keys.clear();
    for (const axis of Object.keys(this.sliderAxes) as AxisControl[]) delete this.sliderAxes[axis];
  }

  resetSticks(): void {
    for (const [pointerId, pointer] of this.pointers) {
      if ("stick" in pointer) this.pointers.delete(pointerId);
    }
    for (const axis of Object.keys(this.sliderAxes) as AxisControl[]) delete this.sliderAxes[axis];
  }

  reset(): void {
    this.pointers.clear();
    this.keys.clear();
    for (const axis of Object.keys(this.sliderAxes) as AxisControl[]) delete this.sliderAxes[axis];
  }

  snapshot(): TouchGamepadInput {
    const next = {} as Record<TouchControl, boolean | number>;
    const latestStick = new Map<TouchStick, StickPointer>();
    for (const pointer of this.pointers.values()) {
      if ("stick" in pointer) {
        latestStick.set(pointer.stick, pointer);
      } else {
        this.press(next, pointer.control);
      }
    }
    for (const control of this.keys.values()) this.press(next, control);
    for (const [stick, pointer] of latestStick) {
      const [xAxis, yAxis] = STICK_AXES[stick];
      next[xAxis] = pointer.x;
      next[yAxis] = pointer.y;
    }
    Object.assign(next, this.sliderAxes);
    return next as TouchGamepadInput;
  }

  private press(input: Record<TouchControl, boolean | number>, control: TouchControl): void {
    Object.assign(input, { [control]: control === "left_trigger" || control === "right_trigger" ? 1 : true });
  }
}
