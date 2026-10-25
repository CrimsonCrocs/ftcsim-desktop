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
