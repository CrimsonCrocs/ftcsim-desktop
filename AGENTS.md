# Working on FTC Simulator Desktop

The main task is fast, truthful FTC autonomous development. Preserve the real SDK runner, fixed physics step, game rules, and robot configuration when optimizing the development loop.

Use the app's MCP to edit code, run tests, inspect telemetry, and capture the app view. Do not use computer-use automation for those tasks when the MCP can perform them. `desktop/scripts/mcp-call.ts` is a stdio MCP client for hosts that cannot load a new server during an active session.

For autonomous changes:

- Use a fixed seed for comparisons. Keep the previous source and measured result.
- Use `editor_patch` for actual autosave/Hot Reload checks. Use checked disk edits and the accelerated evaluator for parameter searches.
- A changed source file uses the warm compiler after the first build. Do not rebuild the native app for a TeamCode constant change.
- Validate the selected candidate with `full:true`. Check parking, STOP output, element type, payload capacity, and time as well as score.
- Reuse physics only while actual actuator outputs match. Keep the feedback check and fresh-trial fallback.
- Report observed outcomes and test conditions. A successful sweep does not prove a global optimum or real-hardware accuracy.

The included Red Pollen Auto is red alliance, pollen only, with a compliant intake. Its drivetrain and shooter are not compliant rollers. It uses Pedro for drive paths and the actual NextFTC lifecycle.

For desktop changes, run the affected type checks and tests. Build and inspect the app when native or renderer behavior changes. The opt-in MCP app verification reversibly changes the example's flywheel constant and restores it. Use checks that cover the change; a small edit does not require unrelated whole-project suites.

Do not commit installed toolchains, dependency folders, connection files, project data from the user's Application Support directory, credentials, or local build caches. Retain third-party notices. Do not invent redistribution or license grants.
