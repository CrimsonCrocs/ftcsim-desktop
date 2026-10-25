import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve("monaco-editor/package.json");
const monacoPackage = require(packageJsonPath) as { version: string };
const packageDirectory = dirname(packageJsonPath);
const destination = resolve("public/vendor/monaco", monacoPackage.version);

// Repeated builds must not remove files that a running local editor is loading.
await mkdir(destination, { recursive: true });
await Promise.all([
  cp(join(packageDirectory, "min/vs"), join(destination, "vs"), { recursive: true }),
  cp(join(packageDirectory, "LICENSE"), join(destination, "LICENSE")),
]);

console.log(`Prepared Monaco ${monacoPackage.version} browser assets in ${destination}.`);
