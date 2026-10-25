import { basename } from "node:path";
import { BunProcessExecutor, type ProcessExecutor, type ProcessRequest, type ProcessResult } from "../../services/java-runner/src/process-executor";
import { JavaHost } from "./java-host";

export class FastExecutor implements ProcessExecutor {
  private compiler?: JavaHost;
  readonly fallback = new BunProcessExecutor();
  readonly measurements: Array<{ kind: string; durationMs: number }> = [];
  async run(request: ProcessRequest): Promise<ProcessResult> {
    const executable = basename(request.argv[0] ?? ""), start = performance.now();
    const compiler = () => this.compiler && !this.compiler.closed ? this.compiler : (this.compiler = new JavaHost());
    let result: ProcessResult, kind: string;
    if (executable === "javac" && request.argv.some(arg => arg.endsWith(".java")) && !request.argv.some(arg => arg.startsWith("@"))) {
      kind = "warm-javac";
      result = await compiler().request("COMPILE", [request.cwd, ...request.argv.slice(1)], request.timeoutMs, request.signal);
    } else if (executable === "java" && request.argv.includes("org.firstinspires.ftc.sim.OpModeDiscoveryCli")) {
      kind = "warm-discovery";
      const main = request.argv.indexOf("org.firstinspires.ftc.sim.OpModeDiscoveryCli"), cp = request.argv.indexOf("-cp");
      result = await compiler().request("INVOKE", [request.argv[cp + 1]!, ...request.argv.slice(main)], request.timeoutMs, request.signal);
    } else { kind = executable; result = await this.fallback.run(request); }
    result.durationMs = Math.round(performance.now() - start);
    this.measurements.push({ kind, durationMs: result.durationMs });
    if (this.measurements.length > 200) this.measurements.shift();
    const stdout = Buffer.from(result.stdout), stderr = Buffer.from(result.stderr);
    return { ...result, stdout: stdout.subarray(0, request.stdoutLimitBytes).toString(), stderr: stderr.subarray(0, request.stderrLimitBytes).toString(),
      stdoutTruncated: stdout.length > request.stdoutLimitBytes, stderrTruncated: stderr.length > request.stderrLimitBytes };
  }
  close(): void { this.compiler?.close(); }
}
