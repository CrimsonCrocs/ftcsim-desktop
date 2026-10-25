export interface ProcessRequest {
  argv: string[];
  cwd: string;
  env?: Record<string, string>;
  timeoutMs: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
  signal?: AbortSignal;
}

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
  cancelled?: boolean;
}

export interface ProcessExecutor {
  run(request: ProcessRequest): Promise<ProcessResult>;
}

interface CappedOutput {
  text: string;
  truncated: boolean;
}

interface OutputCapture {
  result: Promise<CappedOutput>;
  cancel(): Promise<void>;
}

export class BunProcessExecutor implements ProcessExecutor {
  async run(request: ProcessRequest): Promise<ProcessResult> {
    const startedAt = performance.now();
    if (request.signal?.aborted) {
      return {
        exitCode: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        stdoutTruncated: false,
        stderrTruncated: false,
        durationMs: 0,
        cancelled: true,
      };
    }
    const subprocess = Bun.spawn(request.argv, {
      cwd: request.cwd,
      detached: process.platform !== "win32",
      env: request.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdoutCapture = captureCapped(subprocess.stdout, request.stdoutLimitBytes);
    const stderrCapture = captureCapped(subprocess.stderr, request.stderrLimitBytes);
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timeoutHandle = setTimeout(() => resolve("timeout"), request.timeoutMs);
    });
    let abortListener: (() => void) | undefined;
    const abortPromise = request.signal
      ? new Promise<"aborted">((resolve) => {
        abortListener = () => resolve("aborted");
        request.signal?.addEventListener("abort", abortListener, { once: true });
      })
      : new Promise<never>(() => {});
    const outcome = await Promise.race([
      subprocess.exited.then(() => "exited" as const),
      timeoutPromise,
      abortPromise,
    ]);

    if (outcome === "timeout" || outcome === "aborted") {
      timedOut = outcome === "timeout";
      killProcessTree(subprocess);
      await subprocess.exited;
    }
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (abortListener) request.signal?.removeEventListener("abort", abortListener);

    const outputPromise = Promise.all([stdoutCapture.result, stderrCapture.result]);
    const drained = await Promise.race([
      outputPromise.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    if (!drained) {
      if (process.platform !== "win32") killProcessGroup(subprocess.pid);
      await Promise.all([stdoutCapture.cancel(), stderrCapture.cancel()]);
    }
    const [stdout, stderr] = await outputPromise;
    return {
      exitCode: subprocess.exitCode,
      stdout: stdout.text,
      stderr: stderr.text,
      timedOut,
      stdoutTruncated: stdout.truncated,
      stderrTruncated: stderr.truncated,
      durationMs: Math.round(performance.now() - startedAt),
      cancelled: outcome === "aborted",
    };
  }
}

function captureCapped(
  stream: ReadableStream<Uint8Array>,
  limitBytes: number,
): OutputCapture {
  const reader = stream.getReader();
  let settled = false;
  const result = (async (): Promise<CappedOutput> => {
    const chunks: Uint8Array[] = [];
    let keptBytes = 0;
    let truncated = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        const remaining = limitBytes - keptBytes;
        if (remaining > 0) {
          const kept = value.byteLength <= remaining ? value : value.subarray(0, remaining);
          chunks.push(kept);
          keptBytes += kept.byteLength;
        }
        if (value.byteLength > remaining) truncated = true;
      }
    } finally {
      settled = true;
    }

    const bytes = new Uint8Array(keptBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { text: new TextDecoder().decode(bytes), truncated };
  })();

  return {
    result,
    async cancel() {
      if (!settled) await reader.cancel();
    },
  };
}

function killProcessTree(subprocess: Pick<BunSubprocess, "pid" | "kill">): void {
  if (process.platform !== "win32") killProcessGroup(subprocess.pid);
  else subprocess.kill("SIGKILL");
}

function killProcessGroup(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if ((error as { code?: string }).code !== "ESRCH") throw error;
  }
}
