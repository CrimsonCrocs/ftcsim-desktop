import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

// Uses the running application's private local connection. Never print its key.
const connection = JSON.parse(await readFile(resolve(homedir(), "Library/Application Support/FTC Simulator Desktop/connection.json"), "utf8")) as { port: number; token: string };
const seed = Number(process.argv[2] ?? 20261024);
if (!Number.isSafeInteger(seed)) throw new Error("Usage: bun desktop/scripts/evaluate.ts [seed] [result.json]");
const response = await fetch(`http://127.0.0.1:${connection.port}/desktop/evaluate`, {
  method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${connection.token}` },
  body: JSON.stringify({ seed, ...(process.argv.includes("--full") ? { replay:false } : {}) }), signal: AbortSignal.timeout(240_000),
});
const result = await response.json() as Record<string, unknown>;
if (!response.ok) throw new Error(JSON.stringify(result, null, 2));
if (process.argv[3]) await writeFile(resolve(process.argv[3]), JSON.stringify(result, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).filter(([key]) => key !== "samples" && key !== "flightPaths")), null, 2));
