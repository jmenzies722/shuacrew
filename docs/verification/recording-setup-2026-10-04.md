# Recording setup repair — 2026-10-04

Observed in the installed notch: Apps to record contained `open codex session in sable`, and native error was `App unavailable, duplicated, or protected: open codex session in sable`. Recording had not started. The field conflated naming a task with selecting app scope.

Replaced freeform scope entry with checkboxes populated from permitted running applications. Added a separate optional task name, preserved into the review draft. Record stays disabled until at least one app is selected. Refresh apps updates discovery. No permission broadening or inference from a task description.

Verification:

```text
node node_modules/vitest/vitest.mjs run apps/web/src/components/WorkflowLibrary.test.tsx
Before fix: 1 failed (missing Task name and app selection)
After fix with workflow-memory.test.ts: 3 passed

node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0, no diagnostics

node node_modules/vitest/vitest.mjs run
232 files, 1065 tests passed; exit 0

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path apps/mac --filter Workflow
7 tests in 1 suite passed; exit 0

bash apps/mac/scripts/install.sh
Build complete! (34.38 sec)
Quit ShuaCrew before installing. Agents keep running in the gateway.
exit 1
```

## Completed installation and live verification

After the user closed Shua, the signed update installed successfully (`bash apps/mac/scripts/install.sh`, exit 0; `installed /Applications/ShuaCrew.app`).

The first recording probe captured two unexpected mouse clicks in addition to the intended demonstration and failed its exact-step assertion. It was not counted as a pass. A new untouched run passed:

```text
open --env 'SHUACREW_SPARK_SELFTEST=workflowtexteditprobe' /Applications/ShuaCrew.app
Receipt: /private/tmp/shua-textedit-workflow-probe.json
ok: true
recordedSteps: [shortcut, input]
verifiedRuns: 2
replayMilliseconds: [759.0609788894653, 706.5680027008057]
typedValueNotPersisted: true
```

[Fresh receipt](assets/workflow-memory/textedit-probe-2026-10-04.json). The native probe records real shortcut/key events, saves to an isolated library, replays with two different input values, and checks new-window identity and exact text after each replay. This verifies TextEdit capture/save/replay; it does not prove every Sable terminal action can replay. Unsupported interactions remain checkpoints. Task name labels the demonstration; recording does not execute that description for the user.

The app was subsequently relaunched to the workflow panel with the updated app picker. No workflow probe remains running. Final combined regression suite: 232 files, 1068 tests passed; web and gateway type checks passed. Installed app signature verified.
