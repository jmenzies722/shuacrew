# Watch me notch teaching — 2026-10-04

## Installed behavior

The notch no longer exposes the Run workflow form or Apps to watch checklist. Teach Shua offers Watch me, follows permitted foreground apps, shows the current app, real captured counts and the three most recent actions, and provides Stop. Existing saved demonstrations and Codex teaching history are preserved. A scan light and observing indicator animate only during capture; reduced-motion rules disable motion. The collapsed notch remains visibly active while recording.

Type `watch me`, `watch me and learn`, or `record my task` in the Shua assistant. Type `stop watching` or `stop recording`, use Stop, or press Escape to review. Requests are matched conservatively; quoted, negated and future requests do not silently start recording. This direct path is before ordinary chat dispatch. Continuous realtime-call voice routing was not separately verified; do not promise all spoken variants.

Native recording follows only the foreground regular application while explicitly armed. Secure fields, protected app identifiers and protected window paths are checked before observation. The existing eight-app, 100-step and 15-minute limits remain. Typed values/video are not persisted. Unsupported controls are checkpoints. Starting requires the existing Accessibility/control readiness checks; this does not auto-grant OS permissions.

## Evidence

```text
node node_modules/vitest/vitest.mjs run
Test Files 234 passed (234)
Tests 1073 passed (1073)

node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path apps/mac --filter Workflow
12 tests in 2 suites passed

bash apps/mac/scripts/install.sh
Build complete! (35.84 sec)
installed /Applications/ShuaCrew.app

codesign --verify --deep --strict /Applications/ShuaCrew.app
exit 0
```

The UI removal test failed before the component change, then passed. Installed `workflowterminalprobe` now starts with `followForeground: true` and no app checklist payload. After opening the disposable fixture, it returned `followingForeground: true`, `recordedSteps: [input]`, `keyboardOnly: true`, `verifiedRuns: 2`, `ok: true`. Observed AX text was `demo test one cafe`. An initial probe stopped because the fixture was absent; the explicit fixture-launch rerun passed. Receipt: [foreground probe](assets/workflow-memory/watch-me-foreground-probe.json).

The fixture uses the updated actual Sable terminal component but does not use the running Sable's state or shells. Original Sable PID 8596 stayed running. The user chose to defer its restart; the running old Sable therefore still lacks the new accessibility input. This update cannot repair that already-running binary.

The native replay verification remains a development regression check; its passing does not reinstate the removed notch replay UI. No live model teaching call, multi-app demonstration or continuous voice session was exercised in this pass. No frame-rate claim. No commits/pushes, no saved-workflow deletion, no gateway restart.
