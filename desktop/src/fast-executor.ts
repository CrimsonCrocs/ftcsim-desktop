import { basename } from "node:path";
import { BunProcessExecutor, type ProcessExecutor, type ProcessRequest, type ProcessResult } from "../../services/java-runner/src/process-executor";
import { JavaHost } from "./java-host";
import { usePrecompiledShim } from "./precompiled-shim";
import { jvmWorkPolicyArgument, quoteJvmToolOption } from "./work-policy";

export class FastExecutor implements ProcessExecutor {
  private compiler?: JavaHost;
  readonly fallback = new BunProcessExecutor();
  readonly measurements: Array<{ kind: string; durationMs: number }> = [];
  async run(request: ProcessRequest): Promise<ProcessResult> {
    const executable = basename(request.argv[0] ?? ""), start = performance.now();
    const compiler = () => this.compiler && !this.compiler.closed ? this.compiler : (this.compiler = new JavaHost());
    let result: ProcessResult, kind: string;
    if (executable === "javac" && request.argv.some(arg => arg.endsWith(".java")) && !request.argv.some(arg => arg.startsWith("@"))) {
      const prepared = process.env.FTC_DESKTOP_RESOURCE_ROOT ? await usePrecompiledShim(request, process.env.FTC_DESKTOP_RESOURCE_ROOT) : undefined;
      kind = prepared ? "precompiled-shim" : "warm-javac";
      result = prepared ?? await compiler().request("COMPILE", [request.cwd, ...request.argv.slice(1)], request.timeoutMs, request.signal);
    } else if (executable === "java" && request.argv.includes("org.jetbrains.kotlin.cli.jvm.K2JVMCompiler")) {
      kind = "warm-kotlinc";
      const main = request.argv.indexOf("org.jetbrains.kotlin.cli.jvm.K2JVMCompiler"), cp = request.argv.indexOf("-cp");
      result = await compiler().request("KOTLIN", [request.argv[cp + 1]!, ...request.argv.slice(main + 1)], request.timeoutMs, request.signal);
    } else if (executable === "java" && request.argv.includes("org.firstinspires.ftc.sim.OpModeDiscoveryCli")) {
      kind = "warm-discovery";
      const main = request.argv.indexOf("org.firstinspires.ftc.sim.OpModeDiscoveryCli"), cp = request.argv.indexOf("-cp");
      result = await compiler().request("INVOKE", [request.argv[cp + 1]!, ...request.argv.slice(main)], request.timeoutMs, request.signal);
    } else {
      kind = executable;
      // Gradle's single-use JVM benefits from startup compilation; robot runtime
      // hosts retain the full JIT for sustained control and physics workloads.
      const gradle = executable === "gradle" || request.argv.some(arg => /(?:^|\/)gradlew$/.test(arg));
      const agent = jvmWorkPolicyArgument();
      const prepared = gradle ? { ...request, env: { ...request.env,
        JAVA_TOOL_OPTIONS: [request.env?.JAVA_TOOL_OPTIONS, "-XX:TieredStopAtLevel=1", agent ? quoteJvmToolOption(agent) : undefined].filter(Boolean).join(" ") } } : request;
      result = await this.fallback.run(process.platform === "darwin"
        ? { ...prepared, argv: ["/usr/sbin/taskpolicy", "-a", ...prepared.argv] } : prepared);
    }
    result.durationMs = Math.round(performance.now() - start);
    this.measurements.push({ kind, durationMs: result.durationMs });
    if (this.measurements.length > 200) this.measurements.shift();
    const stdout = Buffer.from(result.stdout), stderr = Buffer.from(result.stderr);
    return { ...result, stdout: stdout.subarray(0, request.stdoutLimitBytes).toString(), stderr: stderr.subarray(0, request.stderrLimitBytes).toString(),
      stdoutTruncated: stdout.length > request.stdoutLimitBytes, stderrTruncated: stderr.length > request.stderrLimitBytes };
  }
  close(): void { this.compiler?.close(); }
}
