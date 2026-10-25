import type { HardwareDevice } from "./device.js";

export type HardwareDeviceConstructor<T extends HardwareDevice> = abstract new (...args: never[]) => T;

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (normalized.length === 0) throw new Error("Hardware device names cannot be empty");
  return normalized;
}

/**
 * A typed map of user-configured hardware names to runtime device instances. Names are
 * case-sensitive, matching the FTC configuration convention.
 */
export class HardwareMap implements Iterable<HardwareDevice> {
  private readonly devicesByName = new Map<string, HardwareDevice[]>();

  put<T extends HardwareDevice>(name: string, device: T): T {
    const normalized = normalizeName(name);
    const current = this.devicesByName.get(normalized) ?? [];
    if (!current.includes(device)) current.push(device);
    this.devicesByName.set(normalized, current);
    return device;
  }

  get<T extends HardwareDevice>(type: HardwareDeviceConstructor<T>, name: string): T {
    const device = this.tryGet(type, name);
    if (device !== undefined) return device;

    throw new Error(
      `Unable to find a hardware device with name "${normalizeName(name)}" and type ${type.name}`,
    );
  }

  tryGet<T extends HardwareDevice>(
    type: HardwareDeviceConstructor<T>,
    name: string,
  ): T | undefined {
    const devices = this.devicesByName.get(normalizeName(name));
    return devices?.find((device): device is T => device instanceof type);
  }

  getAll<T extends HardwareDevice>(type: HardwareDeviceConstructor<T>): T[] {
    const matches = new Set<T>();
    for (const devices of this.devicesByName.values()) {
      for (const device of devices) {
        if (device instanceof type) matches.add(device);
      }
    }
    return [...matches];
  }

  getAllNames(type: HardwareDeviceConstructor<HardwareDevice>): string[] {
    return [...this.devicesByName]
      .filter(([, devices]) => devices.some((device) => device instanceof type))
      .map(([name]) => name)
      .sort();
  }

  getNamesOf(device: HardwareDevice): string[] {
    return [...this.devicesByName]
      .filter(([, devices]) => devices.includes(device))
      .map(([name]) => name)
      .sort();
  }

  get size(): number {
    return new Set(this).size;
  }

  resetDevicesForOpMode(): void {
    for (const device of this) device.resetDeviceConfigurationForOpMode();
  }

  stopDevicesForOpMode(): void {
    for (const device of this) device.onOpModeStop();
  }

  *[Symbol.iterator](): Iterator<HardwareDevice> {
    const seen = new Set<HardwareDevice>();
    for (const devices of this.devicesByName.values()) {
      for (const device of devices) {
        if (!seen.has(device)) {
          seen.add(device);
          yield device;
        }
      }
    }
  }
}
