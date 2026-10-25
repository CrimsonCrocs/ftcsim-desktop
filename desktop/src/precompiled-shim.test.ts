import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { ProcessRequest } from "../../services/java-runner/src/process-executor";
import { SHIM_OPTIONS, usePrecompiledShim } from "./precompiled-shim";
import { writeShimManifest } from "../scripts/precompile-shim";

test("bundled shim reuse requires identical sources, options, and verified class bytes", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "desktop-shim-test-"));
  try {
    const sourceRoot = resolve(root, "runtime/java-sdk-shim/src/main/java"), source = resolve(sourceRoot, "Example.java");
    const cache = resolve(root, "desktop/precompiled-shim"), output = resolve(root, "output"), empty = resolve(root, "empty");
    await Promise.all([mkdir(sourceRoot, { recursive: true }), mkdir(resolve(cache, "classes/pkg"), { recursive: true }), mkdir(empty), mkdir(output)]);
    await writeFile(source, "package pkg; public class Example {}\n");
    const classFile = resolve(cache, "classes/pkg/Example.class");
    await writeFile(classFile, Buffer.from([0xca, 0xfe, 0xba, 0xbe]));
    await writeShimManifest(sourceRoot, cache);
    const request: ProcessRequest = { argv: ["javac", ...SHIM_OPTIONS, "-classpath", empty, "-d", output, source], cwd: root,
      timeoutMs: 20_000, stdoutLimitBytes: 1000, stderrLimitBytes: 1000 };
    expect((await usePrecompiledShim(request, root))?.exitCode).toBe(0);
    expect(await readFile(resolve(output, "pkg/Example.class"))).toEqual(await readFile(classFile));
    await rm(output, { recursive: true }); await mkdir(output);
    await writeFile(source, "package pkg; public class Example { int changed; }\n");
    expect(await usePrecompiledShim(request, root)).toBeUndefined();
    expect(await readdir(output)).toEqual([]);
    await writeFile(source, "package pkg; public class Example {}\n");
    await writeFile(classFile, "corrupt");
    expect(await usePrecompiledShim(request, root)).toBeUndefined();
    expect(await readdir(output)).toEqual([]);
    await writeFile(classFile, Buffer.from([0xca, 0xfe, 0xba, 0xbe]));
    expect(await usePrecompiledShim({ ...request, argv: [...request.argv, "-parameters"] }, root)).toBeUndefined();
    expect(await usePrecompiledShim({ ...request, argv: request.argv.slice(0, -1).concat(resolve(root, "TeamCode.java")) }, root)).toBeUndefined();
    expect(await readdir(output)).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
