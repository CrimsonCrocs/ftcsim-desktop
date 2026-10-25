# FTC Simulator Desktop

A native macOS app for editing FTC Java/Kotlin and running the simulator locally. The editor, robot configuration, physics, game rules, and scoring are shared with FTC Simulator.

Open `~/Applications/FTC Simulator Desktop.app`. The initial Red Pollen Auto lives in `~/Library/Application Support/FTC Simulator Desktop/Projects/Red Pollen Auto`. File → Open Project selects another folder containing `ftcsim.project.json`.

Build once to resolve Gradle dependencies. **Hot Reload** is on by default. A saved source edit compiles in a persistent compiler JVM and starts in a fresh classloader. Static fields reset, and structural source edits are supported. Changes to Gradle configuration need another full build. **Run** reuses the loaded artifact.

**Evaluate 30 s** (⌘E) runs the actual Java autonomous with a fixed 5 ms physics step, without waiting for real time. It reports hive tips, score, parking, compiler time, and trial time. It checks pollen-only collection, four-piece capacity, and neutral motor output at STOP. The evaluator currently uses Red/Near and idle other robots. Geometric AprilTags work; camera pixel processing needs the interactive simulator.

The evaluator can reuse an unchanged physics prefix while the new program's motor and servo outputs match. On a change, it restores a checkpoint and resumes actual physics. A sensor mismatch causes a fresh full trial. Checkpoints keep the full game state and compress the complete physics state without changing its bytes.

## MCP

The installed bundle contains `Contents/Resources/desktop/mcp.js`. Run it with the bundle's `Contents/Resources/bin/bun`, or use `desktop/scripts/mcp-launch.sh` from this checkout. It uses the official MCP SDK over stdio. Keep the app open.

Tools cover file reads and checked edits, live editor patches, build/run/stop/reload/show/quit, compiler diagnostics, telemetry, native PNG views, autonomous evaluation, and recorded robot/pollen paths. The private local connection key never belongs in model-visible arguments. `editor_patch` exercises actual autosave and Hot Reload. `write_file` and `patch_file` edit disk source; reload the editor when needed.

```sh
bun desktop/scripts/mcp-call.ts simulator_status
bun desktop/scripts/mcp-call.ts evaluate_autonomous '{"seed":20261024,"full":true}'
bun desktop/scripts/mcp-call.ts get_trial '{"includeFlightPaths":true}'
bun desktop/scripts/mcp-call.ts simulator_view '{}' /tmp/ftcsim.png
```

## Build and check

From the repository root, install its dependencies and those in `desktop/`. Packaging needs macOS 14+, an APFS volume, Xcode command-line tools, Bun 1.3.14, JDK 17, and Gradle 8.9. Set `FTC_DESKTOP_GRADLE_HOME` to the extracted Gradle folder. JDK lookup uses `FTC_DESKTOP_JDK`, `JAVA_HOME`, or macOS `java_home -v 17`.

```sh
bun install --cwd desktop
bun run --cwd services/java-runner toolchains:install
bun scripts/prepare-monaco-assets.ts
bun scripts/prepare-cad-assets.ts
bun desktop/scripts/build.ts
bun desktop/scripts/install.ts
bun run --cwd desktop typecheck
bun run --cwd desktop test
```

Android build-tools 34.0.0, platform 30, and existing licenses come from `~/Library/Android/sdk`; override with `FTC_DESKTOP_ANDROID_SDK`. The installed bundle includes its runtime tools, so it does not need this checkout. It is ad hoc signed for local use.

The opt-in `bun desktop/scripts/verify-mcp.ts` check runs the installed app, reversibly changes the example's flywheel constant, verifies Hot Reload and compile-error recovery, checks neutral motor output, and captures a native view. Use it with the unchanged example project.

Files save atomically. Unchanged editor buffers preserve external file changes; conflicting edits stop the save. Native open/reload/quit waits for pending saves. TeamCode and Gradle scripts run with the local user's permissions.

See [CCC.md](CCC.md) for source references and architecture choices.
