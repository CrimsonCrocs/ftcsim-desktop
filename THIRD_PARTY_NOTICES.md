# Third-party materials

FTC Simulator Desktop contains desktop code and the shared Crimson Crocs FTC Simulator modules needed to build it. This source snapshot does not include private project data, service credentials, installed SDK binaries, or local build caches.

- The FTC SDK, official Java samples, and Blocks assets come from FIRST. Sample attribution is in `src/lib/projects/OFFICIAL_FTC_SAMPLES_LICENSE.txt`. Blocks licenses and notices are under `public/vendor/ftc-blocks/2026-offline-v1/`.
- Runtime adapter notices are in `runtime/java-sdk-shim/THIRD_PARTY_NOTICES.md`.
- Monaco, React, Three.js, Rapier, the MCP TypeScript SDK, and other packages retain the licenses in their published packages and lockfiles. Monaco's preparation script copies its license with the browser assets.
- OpenCascade/occt-import-js is loaded as an unmodified WebAssembly library. Its preparation script copies the library notices and license files to `public/vendor/occt-import-js/0.0.23/`.
- ONNX Runtime notices are under `public/models/policies/runtime/onnxruntime-web/1.30.0/`.
- Model sidecars record source filenames, content hashes, units, and conversion settings. Models and marks retain their original ownership. A conversion does not grant a new license to a source asset.
- JDK, Gradle, Kotlin, Android SDK, NextFTC, and Pedro Pathing are separate toolchains or project dependencies. Their original terms apply. They are not committed as toolchain binaries in this repository.

The app is an independent simulator. FIRST, FTC, vendor names, and vendor marks belong to their respective owners. No endorsement is implied. No general license for the original project code is declared in this snapshot.
