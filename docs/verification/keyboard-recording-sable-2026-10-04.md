# Keyboard recording and Sable accessibility — 2026-10-04

## Result and deployment

Shua keyboard recording update is installed at `/Applications/ShuaCrew.app`. The live Sable app did not expose its terminal as an Accessibility text target. A minimal Sable bridge now exposes the visible terminal input and readable current line, while refusing whole-field replacement. Hidden surfaces and protected directory contexts remain excluded.

The signed Sable release is staged at `/Users/admin/Developer/projects/sable/dist/Sable-Recording-20261004.app`. The original running app at `dist/Sable.app` was not replaced or restarted. PID 8596 remained running with over six days of uptime. The user requested that all Sable sessions stay running.

## Behavior

- Editable text fields use Accessibility value replacement; multiline Return stays part of the input step.
- Keyboard-only terminal fields use Unicode key events, with exact focused-control/window checks and exact readable before/after comparison. Input is single-line; control characters are rejected. Partial writes are not retried automatically.
- Supported shortcuts include Cmd-N, Cmd-Shift-N, Cmd-T, Cmd-L, Cmd-F, Tab, Shift-Tab and Escape. Unsupported keys explain which key needs help.
- Terminal Return remains a checkpoint because it can execute a command. This patch verifies typing, not arbitrary shell-command execution.
- Recording shows captured-action and needs-help counts. Input values remain runtime parameters rather than stored demonstration text.
- Terminal wrapping, asynchronous output and full-screen terminal UIs can prevent exact verification. A changed target stops replay. Terminal identifiers last for the pane lifetime; re-record after recreating a pane/restarting Sable.

## Verification

Commands and observed outputs:

```text
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path apps/mac --filter Workflow
✔ Test run with 12 tests in 2 suites passed.

node node_modules/vitest/vitest.mjs run
Test Files 233 passed (233)
Tests 1071 passed (1071)

node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0

# From the Sable repository:
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --build-system native --filter 'workflowAccessibility|protectedTerminalContext'
✔ Test run with 2 tests passed.

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift build --build-system native -c release --product Sable
Build of product 'Sable' complete! (48.96s)

codesign --verify --deep --strict /Applications/ShuaCrew.app
exit 0
codesign --verify --deep --strict /Users/admin/Developer/projects/sable/dist/Sable-Recording-20261004.app
exit 0

ps -p 8596 -o pid=,etime=,command=
8596 06-11:21:36 /Users/admin/Developer/projects/sable/dist/Sable.app/Contents/MacOS/Sable
```

Installed-app terminal probe used a disposable app built against Sable's actual `TerminalMac`/`SwiftTermLocalSurface`, running `/bin/cat` in `/private/tmp`. It shared no Sable application state and executed no commands. The fixture exposed a non-settable AXTextArea named Terminal input. Shua recorded `demo`, then replayed ` test one` and ` cafe`; UI readback was `demo test one cafe`.

```text
open --env 'SHUACREW_SPARK_SELFTEST=workflowterminalprobe' /Applications/ShuaCrew.app
keyboardOnly: true; recordedSteps: [input]; verifiedRuns: 2; ok: true
replayMilliseconds: [221.053, 137.087]

open --env 'SHUACREW_SPARK_SELFTEST=workflowkeyboardprobe' /Applications/ShuaCrew.app
recordedSteps: [shortcut, input]; verifiedRuns: 2; ok: true
replayMilliseconds: [798.453, 741.463]
```

The multiline TextEdit test recorded an actual Return key, created fresh documents and exactly verified multiline and Unicode replay, including `Café 👋`. An independent recursive JSON-value inspection of the temporary library confirmed that the actual multiline demonstration and both replay text values were absent. The built-in persistence receipt checks the original single-line demonstration string, so the independent check was necessary for the multiline variant.

Receipts: [terminal](assets/workflow-memory/shua-terminal-workflow-probe.json), [multiline](assets/workflow-memory/shua-keyboard-workflow-probe.json). Initial terminal probe correctly stopped when the disposable fixture was not open; the successful rerun followed fixture launch. The fixture was closed after testing. These checks do not claim successful replay inside the still-running old Sable build.

## Research basis

[Keyboard Maestro recording](https://wiki.keyboardmaestro.com/manual/Recording) captures actions such as keystrokes, application activation and clicks and expects users to review/edit recordings. [UiPath App/Web Recorder](https://docs.uipath.com/activities/other/latest/ui-automation/app-web-recorder) distinguishes typing from shortcuts; [its input-method guidance](https://docs.uipath.com/activities/other/latest/ui-automation/input-methods) distinguishes simulated/API input from hardware events with compatibility tradeoffs. This implementation chooses the method before dispatch and verifies the result instead of blindly replaying coordinates.

[Apple NSAccessibilityProtocol](https://developer.apple.com/documentation/appkit/nsaccessibilityprotocol) supplies the native control contract and selector permissions. [CGEvent Unicode input](https://developer.apple.com/documentation/coregraphics/cgevent/keyboardsetunicodestring%28stringlength%3Aunicodestring%3A%29) supplies the terminal typing path.

## User test after the next planned Sable restart

1. Finish/save terminal jobs before deliberately quitting Sable. Do not run the staged app alongside the original app: they share a bundle identifier and state.
2. Open the staged `Sable-Recording-20261004.app`.
3. In Shua Workflows, select Sable and record a new short typing demonstration in a disposable terminal pane. Stop without pressing Return.
4. Confirm the review contains an input slot. Save it, focus the same terminal pane/caret, provide a short single-line value, and replay.
5. Confirm the displayed text and successful-run count. Old unsupported checkpoints are not retroactively repaired: use Record a correction or record again.

No commit or push was made.
