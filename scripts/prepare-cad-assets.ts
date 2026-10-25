import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const requireFromConverter = createRequire(resolve("tools/cad-convert/package.json"));
const source = dirname(requireFromConverter.resolve("occt-import-js"));
const target = resolve("public/vendor/occt-import-js/0.0.23");
await mkdir(target, { recursive: true });
for (const file of ["occt-import-js.js", "occt-import-js.wasm", "license.occt-import-js.txt", "license.occt.txt"]) await copyFile(resolve(source, file), resolve(target, file));
await writeFile(resolve(target, "README.txt"), "occt-import-js 0.0.23 / OpenCascade\nLoaded on demand for local CAD conversion.\nSource: https://github.com/kovacsv/occt-import-js/tree/0.0.23\nPackage: https://www.npmjs.com/package/occt-import-js/v/0.0.23\nLicenses and OpenCascade LGPL exception: see the adjacent license files.\nThis is an unmodified, replaceable WebAssembly library.\n");
console.log("Prepared on-demand CAD importer (OpenCascade/occt-import-js 0.0.23).");
execFileSync("bun", ["build", "src/lib/cad/import-worker.ts", "--outfile", "public/cad-import-worker.js", "--target", "browser", "--format", "iife", "--minify"], { stdio: "inherit" });
