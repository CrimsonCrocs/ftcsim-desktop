import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

if (process.platform !== "darwin") throw new Error("This native scheduling check requires macOS");
const addon = process.env.FTC_DESKTOP_WORK_POLICY ?? resolve(import.meta.dirname, "../build/FTC Simulator Desktop.app/Contents/Resources/desktop/scheduling.node");
createRequire(import.meta.url)(addon); // Fail clearly if the native helper has not been built.
const directory = await mkdtemp(resolve(tmpdir(), "ftc-work-policy-"));
const source = resolve(directory, "worker.ts");
await writeFile(source, `import {createRequire} from "node:module";
import {beginUserInitiatedWork} from ${JSON.stringify(new URL("../src/work-policy.ts", import.meta.url).href)};
process.env.FTC_DESKTOP_WORK_POLICY=${JSON.stringify(addon)};
const native=createRequire(import.meta.url)(process.env.FTC_DESKTOP_WORK_POLICY);
const initial=native.setQoS(21),restore=beginUserInitiatedWork();
const active=native.setQoS(25);restore();const restored=native.setQoS(21);
postMessage({initial,active,restored});close();`);
let worker: Worker | undefined, timer: ReturnType<typeof setTimeout> | undefined;
try {
  const result = await new Promise<{initial:number;active:number;restored:number}>((resolveResult,reject) => {
    worker = new Worker(source);
    worker.addEventListener("message", event => resolveResult(event.data));
    worker.addEventListener("error", event => reject(new Error(event.message)));
    timer = setTimeout(() => reject(new Error("Native worker check timed out")), 10_000);
  });
  assert.equal(result.active, 25); assert.equal(result.restored, 21);
  console.log(JSON.stringify({status:"PASS",...result}));
} finally { clearTimeout(timer); worker?.terminate(); await rm(directory,{recursive:true,force:true}); }
