export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string" || !value || value.length > maximum || value.includes("\0")) throw new Error(`Invalid ${label}`);
  return value;
}
export function sourceFiles(value: unknown): Record<string, string> {
  const files = object(value);
  if (Object.keys(files).length > 512) throw new Error("Project exceeds 512 files");
  let bytes = 0;
  const result: Record<string, string> = Object.create(null);
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== "string") throw new Error("Source files must contain text");
    bytes += Buffer.byteLength(content);
    if (bytes > 32 * 1024 * 1024) throw new Error("Project exceeds 32 MB");
    result[path] = content;
  }
  return result;
}
export function sessionOptions(body: Record<string, unknown>): { stage?: "build" | "runtime"; artifactHash?: string } {
  if (body.stage !== undefined && body.stage !== "build" && body.stage !== "runtime") throw new Error("Invalid session stage");
  const artifactHash = body.artifactHash === undefined ? undefined : text(body.artifactHash, "artifact hash", 64);
  if (artifactHash && !/^[a-f0-9]{64}$/.test(artifactHash)) throw new Error("Invalid artifact hash");
  return { stage: body.stage, artifactHash };
}
export function trialOptions(body: Record<string, unknown>): { seed?: number; entryClass?: string; replay?: boolean } {
  if (body.seed !== undefined && (typeof body.seed !== "number" || !Number.isSafeInteger(body.seed))) throw new Error("Trial seed must be an integer");
  const entryClass = body.entryClass === undefined ? undefined : text(body.entryClass, "OpMode class", 512);
  if (entryClass && !/^[\w$]+(?:\.[\w$]+)*$/.test(entryClass)) throw new Error("Invalid OpMode class");
  if(body.replay!==undefined&&typeof body.replay!=="boolean")throw new Error("Invalid replay option");
  return { seed: body.seed as number | undefined, entryClass, replay: body.replay as boolean|undefined };
}
