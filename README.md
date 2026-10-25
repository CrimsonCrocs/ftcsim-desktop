# FTC Simulator Desktop

Write FTC autonomous code, run it locally, and test the next change without a cloud build queue.

FTC Simulator Desktop is a native macOS app with a Java/Kotlin editor, a 3D field, robot configuration, telemetry, and the FTC Simulator physics and scoring engine. It runs real FTC OpModes against the published SDK and project libraries. The included Kotlin Red Pollen Auto uses NextFTC and Pedro Pathing.

The main task is simple: change a value, save the file, and see what the robot does. You can use the editor or connect an AI coding agent through MCP. Both use the same local project files and runner.

## What makes the loop fast

The app keeps the compiler and runtime JVMs open. After the first Gradle build, a source edit uses the Java or Kotlin compiler already in memory. A fresh classloader then starts the changed program. Static fields reset, and changes can add or remove fields and methods.

The app build compiles the fixed simulator SDK shim once. Cold project builds reuse those classes only after checking the source, compiler options, and class-file hashes. A mismatch uses the real compiler. Robot code always passes through the compiler.

Run reuses the loaded build. It does not upload or unpack the project each time. Changes to Gradle files or the dependency graph still need a full build.

A failed evaluation stops its runtime. The next trial resets that runtime and keeps the compiled classes when the loaded build is still valid. A control timeout alone does not require another Gradle build.

Autonomous evaluation runs 30 simulated seconds without waiting 30 real seconds. The physics step stays at 5 ms. A repeated trial can reuse an unchanged section of the previous physics run. The new robot program still runs every control tick. If a motor or servo output changes, the evaluator restores a checkpoint and computes the remaining physics. A feedback mismatch causes a fresh full trial.

For a LinearOpMode, each tick waits for the program to reach `idle()` or a simulated `sleep()`. Host delays do not count as completed ticks. A program that misses this bounded control deadline stops with an error and neutral motor output.

During a build, run, or evaluation, the Mac app holds a native work activity. This keeps active work out of App Nap, including when the window is hidden. The activity ends when the work ends, with a 30-second heartbeat limit if the local service or editor stops responding. Control errors identify the command and source revision, plus the virtual tick and last reported phase when available.

The evaluator worker uses macOS user-initiated scheduling for each job, then restores its previous setting. Single-use Gradle JVMs use the fast startup compiler tier; the robot runtime retains the full JIT.

Desktop Run and Evaluate use rehearsal seed `20261024` by default. Match resets retain that seed. An MCP evaluation can request another seed explicitly. Matching the seed controls the initial random state; different INIT timing or live input can still change a live run.

Measured on an Apple M4 Pro during development:

| Operation | Observed time |
| --- | ---: |
| Run an already built OpMode | 0.50 s |
| Save a constant and restart through Hot Reload | 2.25 s |
| Compile a small Java edit in the warm evaluator | 0.18–0.51 s |
| Compile a subsequent Kotlin edit through Hot Reload | 1.2 s |
| Run all 30 simulated seconds with fresh physics | 12.54 s |
| Repeat an unchanged 30-second trial | 1.36 s |
| Test an edit to the final volley | 4.0–4.8 s |

These are observed runs, not fixed limits. The first Gradle build, dependency downloads, robot geometry, and camera work can take longer. See [performance notes](docs/PERFORMANCE.md) for the test method.

## Build and install

This version builds from source on an Apple Silicon Mac. It targets macOS 14 or later and uses an APFS volume for fast bundle copies. You need Xcode command-line tools, Bun 1.3.14, Node.js with its Node-API headers, JDK 17, Gradle 8.9, and an Android SDK with platform 30 and build-tools 34.0.0. Use your existing Android SDK installation and accepted licenses.

1. Install the command-line tools if needed: `xcode-select --install`.
2. Install JDK 17 and download the [Gradle 8.9 binary distribution](https://services.gradle.org/distributions/gradle-8.9-bin.zip). Extract Gradle to a permanent folder.
3. Clone this repository and prepare its dependencies:

```sh
git clone https://github.com/CrimsonCrocs/ftcsim-desktop.git
cd ftcsim-desktop
bun install --frozen-lockfile
bun install --cwd desktop --frozen-lockfile

export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
export PATH="$JAVA_HOME/bin:$PATH"
export FTC_DESKTOP_GRADLE_HOME="/absolute/path/to/gradle-8.9"

bun run toolchains:install
bun run assets:prepare
bun run build
bun run install:app
open "$HOME/Applications/FTC Simulator Desktop.app"
```

The toolchain command downloads checksum-checked FTC SDK and Kotlin compiler files. The packager uses `~/Library/Android/sdk` for Android build tools. Set `FTC_DESKTOP_ANDROID_SDK` if your SDK is elsewhere. Set `FTC_DESKTOP_JDK` if JDK 17 is not your selected `JAVA_HOME`.

The native scheduling helper uses Node-API headers from `/opt/homebrew/include/node`. Set `FTC_DESKTOP_NODE_HEADERS` if your headers are elsewhere. Node.js is a build tool; the installed app runs on its bundled Bun runtime.

The installed app includes the runtime tools and assets. It can run after you move or close this checkout. It is signed locally with an ad hoc signature; this repository does not provide a notarized download.

## Edit and run an autonomous

The app opens a copy of Red Pollen Auto on first launch. The project is stored at:

```text
~/Library/Application Support/FTC Simulator Desktop/Projects/Red Pollen Auto
```

Use **Build and Play** for the first run. **Hot Reload** is on by default. Save a source edit to compile it and restart the OpMode. If the edit does not compile, the runtime stops and the editor shows the compiler error. Correct the file and save again to resume.

Use **Run** to start the loaded build again. Use **Stop** to end the run and return motor demand to zero. Use **Evaluate 30 s** or `⌘E` for an accelerated autonomous trial.

The project folder, Evaluate button, and latest result share the native title bar. Run, Hot Reload, the editor, and the field view keep working when another app covers the window.

Desktop Run advances four 5 ms physics steps for each 20 ms control tick. The program and field clocks stay together when the host is busy. Native transport requests preserve the program's tick order.

Run uses the current field state. Through MCP, call `editor_control` with `{"action":"rewind"}` to stop the robot and reset the field while keeping the loaded build. Wait for `simulator_status.fieldReady`, then Run again. Use Evaluate for a fresh, fixed-seed autonomous comparison.

Use **File → Open Project** for another folder that contains `ftcsim.project.json`. Files save to disk automatically. If another process changes a file, unchanged editor buffers preserve that change. Conflicting edits require a reload. Use **View → Reload Project** or `⌘R` after a disk edit.

The included [Red Pollen Auto](desktop/examples/Red%20Pollen%20Auto/README.md) handles pollen through a compliant intake. Its shooter and drivetrain do not use compliant rollers. It uses FTC SDK 11.1.0, NextFTC 1.1.0, and Pedro core/revhub 3.0.2. The best verified route completes **four red hive tips and parks for 88 points** within 30 simulated seconds, using seed `20261024` and idle partner/opponent robots. The [recorded result](desktop/examples/Red%20Pollen%20Auto/validation.json) identifies its source and configuration. Five pollen-only tips with park has not been achieved; this is not a claim that five is impossible.

## Connect an AI agent through MCP

The app includes a local MCP server. It lets an agent edit code, build, run, stop, inspect telemetry, view the app, and compare autonomous trials without a browser driver or computer-use tool. Keep the app open while using it.

For Codex, register the installed server:

```sh
codex mcp add ftcsim-desktop -- \
  "$HOME/Applications/FTC Simulator Desktop.app/Contents/Resources/bin/bun" \
  "$HOME/Applications/FTC Simulator Desktop.app/Contents/Resources/desktop/mcp.js"
```

For another MCP client, use a stdio server configuration with `/bin/sh` as the command and the absolute path to `desktop/scripts/mcp-launch.sh` as its argument. The launcher uses the installed app's Bun runtime. It does not need a separate JavaScript installation.

| Tool | Use it to |
| --- | --- |
| `simulator_status` | Read the live state, compiler errors, Run log, motor commands, and telemetry. |
| `project_files` | List the current project's files. |
| `read_file` | Read source and its SHA-256. |
| `write_file` / `patch_file` | Change disk source with a check against the last file hash. |
| `delete_file` | Remove a source file with a check against its last file hash. |
| `editor_patch` | Change source through the editor and test actual Hot Reload. |
| `editor_control` | Build, run, stop, rewind, reload, show, hide, press Evaluate, resize, or quit. |
| `build_project` | Compile disk source through the evaluator's warm build path. |
| `evaluate_autonomous` | Run a timed autonomous trial and return its result and ID. |
| `get_trial` | Read the robot path, telemetry, hive angles, cell contents, payload changes, and optional pollen flight paths. |
| `simulator_view` | Get a PNG of the actual app window, including the native title bar. |

A useful tuning loop is: read the source, patch one value, evaluate with a fixed seed, and inspect the result. Set `full: true` on `evaluate_autonomous` to check a candidate with fresh physics. Compare tip count, parking, payload, and STOP output before keeping the edit.

Each trial records payload changes at the 20 ms control interval. Use `payloadChanges` to find a dropped element or a brief capacity breach between the one-second telemetry samples.

The samples include contact pairs, robot velocity, physical servo state, motor commands, and the other robots' positions. Use these fields to distinguish a blocked path from a controller that has stopped short.

You can also call the MCP from a shell:

```sh
bun run mcp:call evaluate_autonomous '{"seed":20261024}'
bun run mcp:call get_trial '{"includeSamples":true}'
bun run mcp:call simulator_view '{}' /tmp/ftcsim-view.png
```

The server uses stdio and a private connection file with owner-only permissions. No connection key belongs in your agent configuration or project source. TeamCode and Gradle scripts run locally with your account permissions, so open projects you trust.

## Checks and source layout

```sh
bun run typecheck
bun run test
# Opt-in: exercise the installed app and reversibly edit its example auton.
bun run test:app
```

`desktop/` contains the native shell, local service, warm JVM host, evaluator, and MCP server. `src/` contains the shared editor and simulator interface. `packages/ftc-sim-core/` contains the physics and game rules. `services/java-runner/` and `runtime/` contain SDK integration. The [reference notes](desktop/CCC.md) explain the borrowed workflow patterns and implementation choices.

The evaluator currently uses Red/Near with other robots present and idle. It supports geometric AprilTag observations. Camera pixel processing needs the interactive simulator. Physics parameters remain unvalidated against a real robot, so transfer results to hardware with measured calibration. Windows and Linux packages are not provided.

Third-party code, libraries, model assets, and tools retain their own terms. See [third-party notes](THIRD_PARTY_NOTICES.md). Publication does not assign a new license to those materials.
