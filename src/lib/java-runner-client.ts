import type { RepositorySnapshot } from "@ftc-studio/opmode-protocol";

export type JavaSource = {
  path: string;
  content: string;
};

export type JavaCompilePayload = {
  protocolVersion: 1;
  sources: JavaSource[];
  entryClass: string;
};

export type JavaDiagnostic = {
  kind: "error" | "warning" | "note";
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
};

export type JavaCompileResult = {
  protocolVersion: 1;
  requestId: string;
  status: "succeeded" | "failed";
  entryClass: string;
  diagnostics: JavaDiagnostic[];
  timedOut: boolean;
  outputTruncated: boolean;
  durationMs: number;
  isolation: "process";
  trust: "trusted-local";
};

type RunnerErrorBody = {
  error?: {
    code?: string;
    message?: string;
    issues?: string[];
  };
};

export class JavaRunnerRequestError extends Error {
  constructor(
    message: string,
    readonly code = "RUNNER_UNAVAILABLE",
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "JavaRunnerRequestError";
  }
}

/** Converts the complete build worktree, including binary JAR/AAR files, to the v3 wire format. */
export async function createRepositorySnapshot(
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<RepositorySnapshot> {
  const entries = Object.entries(files).sort(([left], [right]) => compareText(left, right));
  if (entries.length === 0) throw new Error("The build snapshot is empty");
  const encoded = entries.map(([path, value]) => {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value.slice();
    return {
      path,
      bytes,
      file: {
        path,
        encoding: typeof value === "string" ? "utf8" as const : "base64" as const,
        content: typeof value === "string" ? value : bytesToBase64(bytes),
      },
    };
  });
  const totalLength = encoded.reduce((length, { path, bytes }) => (
    length + 4 + new TextEncoder().encode(path).byteLength + 8 + bytes.byteLength
  ), 0) + new TextEncoder().encode("ftc-repository-snapshot-v1\0").byteLength;
  const framed = new Uint8Array(totalLength);
  let offset = 0;
  const prefix = new TextEncoder().encode("ftc-repository-snapshot-v1\0");
  framed.set(prefix, offset);
  offset += prefix.byteLength;
  const view = new DataView(framed.buffer);
  for (const { path, bytes } of encoded) {
    const pathBytes = new TextEncoder().encode(path);
    view.setUint32(offset, pathBytes.byteLength);
    offset += 4;
    framed.set(pathBytes, offset);
    offset += pathBytes.byteLength;
    view.setBigUint64(offset, BigInt(bytes.byteLength));
    offset += 8;
    framed.set(bytes, offset);
    offset += bytes.byteLength;
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", framed));
  return {
    format: "ftc-repository-snapshot-v1",
    sha256: [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    files: encoded.map(({ file }) => file),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function compareText(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const sharedLength = Math.min(leftBytes.byteLength, rightBytes.byteLength);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = (leftBytes[index] ?? 0) - (rightBytes[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftBytes.byteLength - rightBytes.byteLength;
}

export function inferJavaEntryClass(path: string, source: string): string {
  const fileName = path.split("/").at(-1);
  if (!fileName?.endsWith(".java")) throw new Error("Entry source must be a Java file");
  const simpleName = fileName.slice(0, -".java".length);
  const packageName = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\r\n]*/g, "")
    .match(/(?:^|\n)\s*package\s+([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*;/)?.[1];
  return packageName ? `${packageName}.${simpleName}` : simpleName;
}

export function createJavaCompilePayload(
  files: Record<string, string>,
  entryPath: string,
): JavaCompilePayload {
  const entrySource = files[entryPath];
  if (entrySource === undefined) throw new Error("Entry source is not available");

  return {
    protocolVersion: 1,
    entryClass: inferJavaEntryClass(entryPath, entrySource),
    sources: Object.entries(files)
      .filter(([path]) => path.endsWith(".java"))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, content]) => ({ path, content })),
  };
}

export async function compileJavaProject(
  files: Record<string, string>,
  entryPath: string,
  options: {
    endpoint?: string;
    signal?: AbortSignal;
  } = {},
): Promise<JavaCompileResult> {
  const endpoint = options.endpoint
    ?? process.env.NEXT_PUBLIC_JAVA_RUNNER_URL
    ?? "/api/java-runner";

  let response: Response;
  try {
    response = await fetch(`${endpoint.replace(/\/$/, "")}/v1/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createJavaCompilePayload(files, entryPath)),
      signal: options.signal,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    throw new JavaRunnerRequestError(
      timedOut
        ? "The Java build took too long and was stopped."
        : "The trusted local Java runner is offline. Start it and build again.",
      timedOut ? "RUNNER_TIMEOUT" : "RUNNER_OFFLINE",
      error instanceof Error ? [error.message] : [],
    );
  }

  let body: JavaCompileResult | RunnerErrorBody;
  try {
    body = await response.json() as JavaCompileResult | RunnerErrorBody;
  } catch {
    throw new JavaRunnerRequestError(
      "The Java runner returned an unreadable response.",
      "INVALID_RESPONSE",
    );
  }

  if (!response.ok) {
    const runnerError = (body as RunnerErrorBody).error;
    throw new JavaRunnerRequestError(
      runnerError?.message ?? `Java runner request failed (${response.status})`,
      runnerError?.code ?? "RUNNER_REQUEST_FAILED",
      runnerError?.issues,
    );
  }

  const result = body as JavaCompileResult;
  if (result.status !== "succeeded" && result.status !== "failed") {
    throw new JavaRunnerRequestError(
      "The Java runner response did not include a build result.",
      "INVALID_RESPONSE",
    );
  }
  return result;
}
