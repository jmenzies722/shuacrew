# Workflow memory verification — 2026-10-03

## Installed result

`/Applications/ShuaCrew.app` includes a native workflow recorder, review/save library, parameterized replay, visible progress/stop controls, verified-run statistics, and retrieval of relevant successful routines into Codex context. The existing OpenAI-only model routing is retained; deterministic replay requires no model request. This is reusable procedural memory and learned timing, not model retraining.

Research informing the design: [Agent Workflow Memory](https://arxiv.org/abs/2409.07429), [ALLOY](https://arxiv.org/abs/2510.10049), and [Apple event monitoring](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/MonitoringEvents/MonitoringEvents.html). Their research results are not Shua benchmarks.

## Commands and observed output

From `/Users/admin/Developer/projects/shuacrew-live`:

```text
node node_modules/vitest/vitest.mjs run
Test Files  231 passed (231)
Tests       1064 passed (1064)
exit 0

node node_modules/typescript/bin/tsc --noEmit -p apps/web
(no diagnostics)
exit 0

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path apps/mac
Test run with 103 tests in 14 suites passed
exit 0

bash apps/mac/scripts/install.sh
Build complete! (33.26 sec)
installed /Applications/ShuaCrew.app
exit 0

codesign --verify --deep --strict --verbose=2 /Applications/ShuaCrew.app
/Applications/ShuaCrew.app: valid on disk
/Applications/ShuaCrew.app: satisfies its Designated Requirement
exit 0
```

The installer built web assets and the native release, signed the app, and retained the previous app in `~/.shuacrew/app-backups`. Existing compiler concurrency/deprecation warnings and a Vite chunk-size warning remain; this is not a warning-free build.

## Native end-to-end checks

Opt-in probes use isolated temporary workflow libraries, never the user's saved library. Each probe requires the app to be quit before launching it with the test environment variable.

```sh
# With the disposable scripts/workflow-fixture.swift app already running:
open --env 'SHUACREW_SPARK_SELFTEST=workflowprobe' /Applications/ShuaCrew.app
# Separately, after quitting Shua:
open --env 'SHUACREW_SPARK_SELFTEST=workflowtexteditprobe' /Applications/ShuaCrew.app
```

- [Fixture receipt](assets/workflow-memory/fixture-probe.json): actual mouse/key events recorded `press → input → press`; two replays verified the exact different input values; stored success count was 2; demonstrated text was absent from the saved library. Measured replays: **875 ms, 599 ms**. Changing the target identifier stopped before typing and preserved the prior field value.
- [TextEdit receipt](assets/workflow-memory/textedit-probe.json): actual shortcut/key events recorded `Command-N → input`; replay created a distinct new document twice and verified the exact different text values. Measured replays: **762 ms, 778 ms**; 2 verified runs; demonstrated text absent from the saved library. Independent Computer Use Accessibility read showed `Shua workflow verified twice` in `Untitled 6`.
- Core tests cover disk reload, private file permissions, corruption preservation, selectors/ambiguity, schema limits, protected app/path policy, input slots, pre-click geometry age, and success-only timing updates.

These measurements cover small local workflows, not arbitrary tasks or voice/model response latency. The second TextEdit run was slightly slower: learned timing does not guarantee every subsequent run is faster.

## Installed UI and final state

Computer Use verified the installed notch library, its square top/rounded bottom presentation, the Apps to record field retaining keyboard focus, `Recording · 0` immediately after Record, and Stop returning to review with Save disabled for an empty recording. The test fixture was closed. Shua was relaunched without a self-test environment variable. The gateway reported `active: []` and `pendingApprovals: 0`. Disposable TextEdit documents remain available as visible test evidence; existing documents were not edited by the workflow probe.

## Bugs found and fixed during verification

1. App resolution now recognizes running applications by bundle ID before using Launch Services lookup.
2. Recording originally resolved a clicked control after layout changed. Background AX snapshots now retain pre-event target geometry and use the event timestamp to select the correct snapshot.
3. Recorded inputs stay parameterized; no demonstrated key text is stored.
4. Shortcut release events clear modifier flags so later typing does not inherit Command.
5. Recorder scans run off the UI thread; workflow fields retain notch keyboard focus.
6. Monitor installation failure now returns an explicit error, and statistics-save failure is preserved in the completion message.

## Supported boundary and handoff

See [the test-drive guide](shua-test-drive.md). Replay supports controls exposed through macOS Accessibility, constrained shortcuts, and whole-field text replacement. Unknown scrolling, arbitrary shortcuts, drags, ambiguous/missing controls, secure fields and unverified results stop or become manual checkpoints. No blanket OS permission bypass, continuous video retention, or automatic self-modifying workflow is implemented. Adaptation hands off to Codex and requires a reviewed new recording/revision.

The broader notch, voice and cursor changes have separate reports in this directory; this pass does not establish that arbitrary natural-language desktop tasks, all microphone devices, or every MCP integration are flawless. Three representative daily routines, each repeated with varied input, are the next acceptance gate before expanding Crew integration. Revenue and superiority to other harnesses remain goals, not verified outcomes.

No commit or push was performed.
