# Workflow teaching loop — 2026-10-04

Implemented recording → review → Send workflow to Shua → inspect proposal → Save taught workflow. User feedback and up to ten teaching reviews persist with the native workflow. Subsequent reviews receive earlier lessons; relevant successful workflows include lessons in assistant context. Record a correction replaces a saved workflow's demonstration after review/save, retaining identity and teaching history; a changed revision resets execution statistics.

Codex receives semantic controls, input slots, feedback and run counts. It does not receive continuously recorded video or literal input values. It can propose removing only a redundant focus directly before input into the same app/field. It cannot invent actions, remove input/new-window guards or count its own analysis as successful execution. Corrections needing other controls require a new demonstration. This is procedural memory and verified timing adaptation, not model-weight training or guaranteed per-run speed improvement.

## Verification

```text
node node_modules/vitest/vitest.mjs run
233 files, 1071 tests passed; exit 0
node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0
node node_modules/typescript/bin/tsc --noEmit -p apps/gateway
exit 0
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path apps/mac --filter Workflow
8 tests in 1 suite passed; exit 0
bash apps/mac/scripts/install.sh
Build complete! (34.90 sec)
installed /Applications/ShuaCrew.app
exit 0
codesign --verify --deep --strict --verbose=2 /Applications/ShuaCrew.app
valid on disk; satisfies its Designated Requirement; exit 0
```

Fresh native recording probe on installed release: real Command-N and text entry captured, save succeeded, two new documents replayed and exact text verified in 752 ms and 820 ms. One preceding attempt stopped on target/permission verification; it was not counted as a pass. [Passing receipt](assets/workflow-memory/taught-workflow-replay-2026-10-04.json).

Live `POST /api/workflows/teach` through Codex (`gpt-5.6-terra`) returned 200, retained the new-window/input steps, and extracted three lessons about preserving documents and parameterized text. [Review receipt](assets/workflow-memory/teaching-review-2026-10-04.json).

A second live request included those prior lessons plus a request for an unseen formatting button. It returned 200, `needsDemonstration: true`, unchanged executable steps and a request to demonstrate the button. [Correction receipt](assets/workflow-memory/teaching-correction-2026-10-04.json).

Tests cover guarded model edits, disconnected-provider errors, legacy workflow decoding and bounded teaching-history persistence. Arbitrary Sable terminal workflows, literal keystroke storage, continuous video interpretation and unrestricted model-authored actions are not verified/supported by this change. No commit or push.
