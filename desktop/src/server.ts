import { resolve, sep } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { DesktopBuildError, DesktopSessions } from "./sessions";
import { DesktopWorkspace } from "./workspace";
import { closeJavaHosts } from "./java-host";
import { DesktopEvaluatorClient } from "./evaluator-client";
import { JVM_TOOLCHAIN_CONTRACT_ID } from "@ftc-studio/opmode-protocol";
import { validateSessionMessage } from "../../services/java-runner/src/session-validation";
import { object, text, sourceFiles, sessionOptions, trialOptions } from "./validation";
import { PayloadValidationError } from "../../services/java-runner/src/validation";
import { EditorAutomation } from "./automation";

const root = resolve(process.env.FTC_DESKTOP_RESOURCE_ROOT ?? process.cwd());
const port = Number(process.env.FTC_DESKTOP_PORT ?? 4327);
const token = process.env.FTC_DESKTOP_TOKEN;
if (!token || token.length < 24) throw new Error("A private desktop connection key is required");
const sessions = new DesktopSessions(root);
const workspace = new DesktopWorkspace(resolve(process.env.FTC_DESKTOP_PROJECT ?? "desktop/examples/Red Pollen Auto"),
  resolve(process.env.FTC_DESKTOP_PROJECTS_DIRECTORY ?? "desktop/.cache/projects"));
const renderer = resolve(root, "desktop/dist");
const evaluator = new DesktopEvaluatorClient(root);
const automation=new EditorAutomation();
const trials=new Map<string,Awaited<ReturnType<DesktopEvaluatorClient["evaluate"]>>>();

const server = Bun.serve({ hostname: "127.0.0.1", port, idleTimeout: 255, maxRequestBodySize: 48 * 1024 * 1024,
  async fetch(request: Request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") return Response.json({ status: "ok", app: "FTC Simulator Desktop", protocol: 1 });
      if (url.pathname.startsWith("/desktop/")) {
        if (request.headers.get("authorization") !== `Bearer ${token}`) return Response.json({ error: "Desktop connection required" }, { status: 403 });
        if (request.method !== "POST") return Response.json({ error: "Use POST" }, { status: 405 });
        const body = object(await request.json());
        const path = url.pathname.slice("/desktop".length);
        let result: unknown;
        if (path === "/workspace") result = await workspace.snapshot(body.trackEditor!==false);
        else if (path === "/workspace/open") { await workspace.open(text(body.directory, "project directory")); result = await workspace.snapshot(); }
        else if (path === "/workspace/save") { await workspace.save(text(body.projectId, "project id", 80), sourceFiles(body.files)); result = { saved: true }; }
        else if(path==="/workspace/edit"){
          const expected=body.expectedSha256;
          if(expected!==null&&(typeof expected!=="string"||!/^[a-f0-9]{64}$/.test(expected)))throw new Error("An expected SHA-256 or null for a new file is required");
          const change=typeof body.content==="string"?{content:body.content}:{search:text(body.search,"patch search",16*1024*1024),replacement:typeof body.replacement==="string"?body.replacement:(()=>{throw new Error("Invalid replacement");})()};
          result=await workspace.edit(text(body.path,"file path"),expected,change);
        }
        else if(path==="/automation/request")result=await automation.request(text(body.action,"editor action",40),body.args===undefined?{}:object(body.args));
        else if(path==="/automation/poll")result={...automation.poll(),activeWork:evaluator.busy};
        else if(path==="/automation/complete"){automation.complete(text(body.id,"command id",80),body.result,typeof body.error==="string"?body.error:undefined);result={received:true};}
        else if(path==="/build")result=await evaluator.build(workspace.path);
        else if (path === "/sessions/open") result = await sessions.open(sessionOptions(body));
        else if (path === "/sessions/build") {
          const message = validateSessionMessage(body.message);
          if (message.command !== "build") throw new Error("Expected a build command");
          const id = text(body.sessionId, "session id", 80);
          result = { artifact: await sessions.build(id, message), completionIndex: sessions.completionIndex(id) };
        }
        else if (path === "/sessions/command") {
          const message = validateSessionMessage(body.message);
          if (["build", "load", "load-artifact", "close"].includes(message.command)) throw new Error("Use the dedicated desktop build or close operation");
          result = await sessions.command(text(body.sessionId, "session id", 80), message);
        }
        else if (path === "/sessions/close") { await sessions.close(text(body.sessionId, "session id", 80)); result = { closed: true }; }
        else if (path === "/metrics") result = { compilation: sessions.executor.measurements };
        else if (path === "/evaluate") {
          const trial=await evaluator.evaluate(workspace.path,trialOptions(body)),trialId=crypto.randomUUID();
          trials.set(trialId,trial);while(trials.size>12)trials.delete(trials.keys().next().value!);
          result={trialId,...trial};
        }
        else if(path==="/trials/get"){
          const id=body.trialId===undefined?[...trials.keys()].at(-1):text(body.trialId,"trial id",80);
          if(!id||!trials.has(id))throw new Error("Trial is no longer in memory. Run the autonomous again.");
          result={trialId:id,...trials.get(id)!};
        }
        else if (path === "/shutdown") { evaluator.dispose();await sessions.dispose(); closeJavaHosts(); result = { stopped: true }; }
        else return Response.json({ error: "Unknown desktop operation" }, { status: 404 });
        return Response.json(result ?? null);
      }
      if (url.pathname === "/api/java-runner/health") return Response.json({ status: "ok", toolchainContractId: JVM_TOOLCHAIN_CONTRACT_ID,
        runnerMode: "local-v3", sdkVersion: "11.1.0", javaTarget: "8", kotlinVersion: "2.2.10", sdkCompileClasspathHash: await sessions.classpathHash() });
      if (url.pathname === "/api/auth/get-session") return Response.json(null);
      if (url.pathname.startsWith("/api/")) return Response.json({ error: { code: "DESKTOP_LOCAL_ONLY", message: "This action is available on the web version." } }, { status: 404 });
      const publicPath = resolve(root, "public", "." + decodeURIComponent(url.pathname));
      const rendererPath = resolve(renderer, "." + decodeURIComponent(url.pathname));
      for (const [base, path] of [[resolve(root,"public"), publicPath], [renderer, rendererPath]]) {
        if (path !== base && !path.startsWith(base + sep)) continue;
        const file = Bun.file(path);
        if (await file.exists() && !url.pathname.endsWith("/")) return new Response(file, { headers: { "cache-control": "no-cache" } });
      }
      return new Response(await readFile(resolve(renderer, "index.html")), { headers: { "content-type": "text/html; charset=utf-8" } });
    } catch (error) {
      return Response.json({ error: error instanceof PayloadValidationError ? error.issues.join("; ") : error instanceof Error ? error.message : String(error),
        ...(error instanceof DesktopBuildError ? { code: error.code, diagnostics: error.diagnostics } : {}) }, { status: 400 });
    }
  },
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  evaluator.dispose();
  void sessions.dispose().finally(() => { closeJavaHosts(); server.stop(true); process.exit(0); });
});
console.log(JSON.stringify({ event: "desktop-ready", port: server.port }));
if(process.env.FTC_DESKTOP_CONNECTION_FILE)await writeFile(process.env.FTC_DESKTOP_CONNECTION_FILE,JSON.stringify({port:server.port,token}),{mode:0o600});
