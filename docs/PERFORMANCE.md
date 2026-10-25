# Performance

Measurements below used the real Red Pollen Auto project, FTC SDK 11.1.0, NextFTC 1.1.0, Pedro 3.0.2, and the BIOBUZZ field on an Apple M4 Pro. They are individual observations from 2026-10-24. They do not establish a percentile or a guarantee for other computers.

The live-app check used an MCP stdio client. It built the project, ran the robot, changed `FLYWHEEL_FRACTION` from `0.40` to `0.401`, introduced an invalid numeric expression, restored `0.40`, and stopped the robot. It then ran the loaded build again. It checked simulation time, actual compiler diagnostics, motor outputs, the saved source hash, and a native app snapshot.

- First Run after build: 2,095 ms, including the first advancing physics frames.
- Save to Hot Reload restart: 2,246 ms, including autosave, debounce, and MCP polling. The app reported 0.8 s for the restart itself.
- Run without a build: 500 ms.
- Invalid source stopped the runtime. All observed motor power commands were zero. A valid edit recovered the run, and the original source hash was restored.

A separate full trial used seed 20261024 and advanced all 6,000 physics steps for 30 simulated seconds. It took 12,543 ms after compilation. A repeated trial took 1,358 ms, reused all 30 unchanged seconds, and executed no new physics steps. Recorded positions, Java telemetry samples, pollen flight paths, tip count, score, and parking matched the reference trial exactly.

Final-volley changes used the warm compiler in 181–505 ms per edit. Trials that reused the first 21.42 unchanged simulated seconds took about 4.0–4.8 seconds with the final checkpoint policy. The cache keeps five-second checkpoints within a bounded memory budget.

The initial Gradle build is a separate cost. Observed builds took about 10–33 seconds with dependencies available. A missing dependency or cold cache can take longer.

The evaluator runs Java at a 20 ms control interval and physics at a fixed 5 ms interval. Acceleration removes wall-clock waiting; it does not enlarge the physics step or award a predicted score. Cache reuse compares actual outputs from a fresh program generation. Checkpoint feedback is checked before changed physics continues. A mismatch reruns the full trial.

The initial checkpoint is captured after actual sensor warmup. This preserves camera capture and occlusion state across trials. Native AppKit delivers editor commands, so background WebKit timer suspension does not interrupt the MCP. Status and native view capture were checked again after sustained headless evaluation.

## Four-tip route, 2026-10-25

The current example was tuned through the installed app's MCP, using seed `20261024`. Marginal changes to the fourth-volley hood compiled in 189–222 ms. Each 30-second trial took 3,962–4,082 ms after compilation and reused the first 23.48 unchanged simulated seconds. The selected cleanup matched actual actuator outputs for all 30 seconds; its cached trial took 1,246 ms after a 239 ms compile.

A fresh check of the four-tip route executed all 6,000 physics steps in 12,536 ms after a 232 ms warm compile. It finished with four tips, a park, no Nectar collected, a peak payload of four, and neutral STOP output. See the example's [recorded result](../desktop/examples/Red%20Pollen%20Auto/validation.json) for the final source and configuration hashes.

Heavy CPU contention still matters. Earlier runs on the same Mac took 63–90 seconds for fresh physics and 172–193 seconds for a cold Gradle build. Warm compilation, replay, work scheduling, and runtime recovery remove avoidable work; they do not provide a fixed latency under every host load.

The Kotlin conversion also completed four tips and parked for 88 points with fresh physics in 13,324 ms. Its first Gradle build, including Kotlin plugin setup, took 38,961 ms. Kotlin source edits now use the compiler in the persistent JVM.

The final installed-app check started the loaded Kotlin program in 636 ms. Its first use of the persistent Kotlin compiler took 3.9 seconds; the complete source-edit-to-restart check took 5,001 ms. A subsequent recovery compile took 1.2 seconds. The earlier check also verified a Kotlin compiler error, neutral motor demand, source restoration, field rewind, and the native Evaluate control.

A complete live Run reached park and neutral output after 30 simulated seconds, taking 47,042 ms with the 3D view active under host contention. The field and program clocks stayed aligned within one control tick. This check covers live execution; accelerated tuning uses the separate evaluator. Native work activity was active during Run and ended after Stop.
