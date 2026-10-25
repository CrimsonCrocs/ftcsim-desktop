/** Minimal common surface shared by objects that can be placed in a HardwareMap. */
export interface HardwareDevice {
  resetDeviceConfigurationForOpMode(): void;
  onOpModeStop(): void;
  close(): void;
}

/** Base implementation used by the built-in simulated devices. */
export abstract class SimHardwareDevice implements HardwareDevice {
  private closed = false;

  get isClosed(): boolean {
    return this.closed;
  }

  protected assertOpen(): void {
    if (this.closed) throw new Error("Cannot use a closed simulated hardware device");
  }

  resetDeviceConfigurationForOpMode(): void {
    // Subclasses reset their own configuration where needed.
  }

  onOpModeStop(): void {
    // Most sensors do not need stop handling.
  }

  close(): void {
    this.closed = true;
  }
}
