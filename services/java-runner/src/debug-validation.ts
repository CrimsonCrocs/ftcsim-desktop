import type { DebugConfiguration, DebugMessage } from "@ftc-studio/opmode-protocol";
import { PayloadValidationError } from "./validation";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const sourcePath = (value: unknown): value is string => typeof value === "string" && value.length <= 1024
  && /\.(?:java|kt)$/u.test(value) && !value.startsWith("/") && !value.includes("\\")
  && !value.includes("\0") && !value.split("/").some((part) => !part || part === "." || part === "..")
  && !/^[A-Za-z]:/u.test(value);
export const WATCH_PATH = /^(?:this\.)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d{1,5}\])*$/u;

export function validateDebugConfiguration(value: unknown): DebugConfiguration {
  if (!record(value) || Object.keys(value).some((key) => !["breakpoints", "sourcePaths", "watches"].includes(key))
      || !Array.isArray(value.breakpoints) || value.breakpoints.length > 128
      || !Array.isArray(value.sourcePaths) || value.sourcePaths.length > 512 || !value.sourcePaths.every(sourcePath)
      || !Array.isArray(value.watches) || value.watches.length > 32
      || !value.watches.every((watch) => typeof watch === "string" && watch.length <= 256 && WATCH_PATH.test(watch))) {
    throw new PayloadValidationError(["Debug configuration requires at most 128 breakpoints, 512 source paths, and 32 read-only variable paths"]);
  }
  const ids = new Set<string>();
  const breakpoints = value.breakpoints.map((point) => {
    if (!record(point) || Object.keys(point).some((key) => !["id", "path", "line", "enabled"].includes(key))
        || typeof point.id !== "string" || !/^[\w.-]{1,64}$/u.test(point.id) || ids.has(point.id)
        || !sourcePath(point.path) || !Number.isInteger(point.line) || Number(point.line) < 1 || Number(point.line) > 1_000_000
        || typeof point.enabled !== "boolean") throw new PayloadValidationError(["Invalid or duplicate source breakpoint"]);
    ids.add(point.id);
    return { id: point.id, path: point.path, line: Number(point.line), enabled: point.enabled };
  });
  return { breakpoints, sourcePaths: [...new Set(value.sourcePaths as string[])], watches: [...new Set(value.watches as string[])] };
}

export function validateDebugMessage(value: Record<string, unknown>): DebugMessage {
  if (value.protocolVersion !== 3 || !["configure", "pause", "continue", "step-over", "step-in", "step-out", "inspect"].includes(String(value.action))
      || Object.keys(value).some((key) => !["protocolVersion", "requestId", "command", "action", "configuration", "frameId"].includes(key))
      || (value.action === "configure") !== (value.configuration !== undefined)
      || (value.frameId !== undefined && (value.action !== "inspect" || !Number.isInteger(value.frameId) || Number(value.frameId) < 0 || Number(value.frameId) > 63))) {
    throw new PayloadValidationError(["Invalid debugger command"]);
  }
  return { protocolVersion: 3, requestId: value.requestId as string, command: "debug", action: value.action as DebugMessage["action"],
    ...(value.configuration === undefined ? {} : { configuration: validateDebugConfiguration(value.configuration) }),
    ...(value.frameId === undefined ? {} : { frameId: Number(value.frameId) }) };
}

/** Simple tab protocol keeps the debugger outside TeamCode's Java 8 classpath. */
export function encodeDebugConfiguration(value: DebugConfiguration): string {
  const encode = (text: string) => Buffer.from(text).toString("base64");
  return [value.sourcePaths.map(encode).join(","),
    value.breakpoints.map((point) => [point.id, encode(point.path), point.line, point.enabled ? 1 : 0].join(":")).join(","),
    value.watches.map(encode).join(",")].join("\t");
}
