import { createRequire } from "node:module";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

let binding: { setQoS(value: number): number } | undefined;

export function jvmWorkPolicyArgument(): string | undefined {
  const path = process.env.FTC_DESKTOP_JAVA_WORK_POLICY ?? (process.env.FTC_DESKTOP_RESOURCE_ROOT
    ? resolve(process.env.FTC_DESKTOP_RESOURCE_ROOT, "desktop/work-policy.dylib") : undefined);
  return process.platform === "darwin" && path && existsSync(path) ? `-agentpath:${path}` : undefined;
}

/** JAVA_TOOL_OPTIONS uses JVM quoting, with no shell expansion. */
export function quoteJvmToolOption(argument: string): string {
  if (!argument.includes('"')) return `"${argument}"`;
  if (!argument.includes("'")) return `'${argument}'`;
  throw new Error("The JVM agent path contains both quote types; move the app to another directory.");
}

/** A dedicated worker does CPU work on behalf of an active user request. */
export function beginUserInitiatedWork(): () => void {
  if (process.platform !== "darwin") return () => {};
  const path = process.env.FTC_DESKTOP_WORK_POLICY ?? resolve(process.env.FTC_DESKTOP_RESOURCE_ROOT ?? process.cwd(), "desktop/scheduling.node");
  // Source-only development can run before the native app has been packaged.
  if (!process.env.FTC_DESKTOP_RESOURCE_ROOT && !existsSync(path)) return () => {};
  binding ??= createRequire(import.meta.url)(path) as typeof binding;
  const previous = binding!.setQoS(0x19); // QOS_CLASS_USER_INITIATED
  return () => { binding!.setQoS(previous); };
}
