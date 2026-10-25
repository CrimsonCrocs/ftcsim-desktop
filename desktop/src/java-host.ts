import { resolve } from "node:path";
import { jvmWorkPolicyArgument } from "./work-policy";
import type { Subprocess } from "bun";
import type { ProcessResult } from "../../services/java-runner/src/process-executor";

const hosts = new Set<JavaHost>();
type Reply = { resolve: (r: ProcessResult) => void; reject: (e: Error) => void };

/** Serialized, bounded RPC to a warm JVM. A failed generation is never reused. */
export class JavaHost {
  private child: Subprocess<"pipe", "pipe", "pipe">;
  private sequence = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, Reply>();
  private ready: Promise<void>;
  private stderr = "";
  closed = false;

  constructor() {
    const policy = process.platform === "darwin" ? ["/usr/sbin/taskpolicy", "-a"] : [];
    const argument = jvmWorkPolicyArgument(), agent = argument ? [argument] : [];
    this.child = Bun.spawn([...policy, process.env.FTC_DESKTOP_JAVA ?? "java", ...agent, "-Xms32m", "-Xmx384m", "-Djava.awt.headless=true", "-Dftcsim.cooperativeDeadlineMillis=300", "-cp",
      process.env.FTC_DESKTOP_HOST_CLASSES ?? resolve("desktop/.cache/host"), "ftc.desktop.DesktopHost"], { stdin:"pipe",stdout:"pipe",stderr:"pipe" });
    hosts.add(this);
    this.ready = new Promise<void>((resolveReady, rejectReady) => {
      const timeout = setTimeout(() => { rejectReady(new Error("Java host did not start")); this.close(); }, 8_000);
      void readLines(this.child.stdout, line => {
        if (line === "READY") { clearTimeout(timeout); resolveReady(); return; }
        const fields = line.split("\t");
        if (fields[0] !== "RESULT") return;
        const entry = this.pending.get(fields[1]!);
        if (!entry) return;
        this.pending.delete(fields[1]!);
        entry.resolve({ exitCode: Number(fields[2]), stdout: Buffer.from(fields[3]!, "base64").toString(),
          stderr: Buffer.from(fields[4]!, "base64").toString(), durationMs: Number(fields[5]),
          timedOut: false, stdoutTruncated: false, stderrTruncated: false });
      }).catch(error=>this.close(error instanceof Error?error:new Error(String(error))));
      const exited = (error: Error) => {
        clearTimeout(timeout); rejectReady(error); this.closed = true; hosts.delete(this);
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      };
      void this.child.exited.then(code=>exited(new Error(`Java host stopped (code ${code}). ${this.stderr.slice(-2000)}`)),exited);
      void readLines(this.child.stderr,line=>{this.stderr=(this.stderr+line+"\n").slice(-8_000);});
    });
    void this.ready.catch(() => undefined);
  }

  request(command: "COMPILE" | "INVOKE" | "OPEN" | "FRAME" | "DISPOSE", args: string[], timeoutMs = 10_000, signal?: AbortSignal): Promise<ProcessResult> {
    const task = this.tail.then(async () => {
      if (signal?.aborted) throw new Error("Operation cancelled");
      await this.ready;
      if (this.closed) throw new Error("Java host is closed");
      const id = String(++this.sequence);
      return new Promise<ProcessResult>((resolveResult, rejectResult) => {
        const finish = (action: () => void) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); action(); };
        const abort = () => this.close(new Error("Operation cancelled"));
        const timer = setTimeout(() => this.close(new Error(`${command} exceeded its bounded deadline`)), timeoutMs);
        this.pending.set(id, { resolve: r => finish(() => resolveResult(r)), reject: e => finish(() => rejectResult(e)) });
        signal?.addEventListener("abort", abort, { once: true });
        this.child.stdin.write([command, id, ...args.map(arg => Buffer.from(arg).toString("base64"))].join("\t") + "\n");
        void this.child.stdin.flush();
      });
    });
    this.tail = task.catch(() => undefined);
    return task;
  }

  close(error = new Error("Java host closed")): void {
    if (this.closed) return;
    this.closed = true; hosts.delete(this); this.child.kill("SIGKILL");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

export function closeJavaHosts(): void { for (const host of [...hosts]) host.close(); }

async function readLines(stream:ReadableStream<Uint8Array>,consume:(line:string)=>void):Promise<void>{
  const reader=stream.getReader(),decoder=new TextDecoder();let pending="";
  try{while(true){const result=await reader.read();if(result.done)break;pending+=decoder.decode(result.value,{stream:true});let end;while((end=pending.indexOf("\n"))>=0){consume(pending.slice(0,end));pending=pending.slice(end+1);}}}
  finally{reader.releaseLock();}
}
