# FTC Blocks editor third-party notices

This directory contains a sanitized, iframe-isolated copy of the FTC Offline
Blocks editor supplied to the FTC Simulator project.

- Source archive SHA-256:
  `f5eb4abf1deb9faa3f0011139a5131713eeeedce2ce98707c9c8ece004e2eec3`
- Imported runtime SHA-256:
  `4d80350a14701586bf6212219bc6a4210f24cd0f7d57cfe1a5a3881fa452d457`
- Import pipeline: `tools/import-ftc-blocks.mjs`

The source headers in `blockly/`, `blocks/`, and `ftcblockly/` identify their
respective copyright owners and license terms. Blockly and many FTC integration
files are distributed under Apache License 2.0. FIRST/FTC files retain their
upstream FIRST license and patent disclaimer. `js/split.min.js` is Split.js
1.5.11, distributed under the MIT license.

The supplied archive contained personal/sample OpMode documents and standalone
project-catalog pages. Those documents, catalog pages, and embedded catalog data
are intentionally not distributed. Some upstream editor utility files still
contain dormant project-storage helpers; the sandboxed host bridge replaces
them, and the iframe Content Security Policy blocks network access. FTC
Simulator supplies project data, robot configuration, saving, Git, building,
and runtime execution through that host bridge.

Full Apache 2.0 and Split.js MIT license texts are included beside this notice.
