# Notch realtime polish — 2026-10-04

Installed `/Applications/ShuaCrew.app`; prior app retained at `/Users/admin/.shuacrew/app-backups/ShuaCrew-20261004-182739.app`. No content reset, commit, or push.

## Findings and changes

- Live calls explicitly hid NotchAura. It now stays mounted, reflects actual listening/speaking state, and uses measured audio with elapsed-time smoothing and capped 30Hz style updates. Idle does not sample audio.
- Lower light lobes and rim follow Crew theme colors. Top stays dark, bottom corners remain rounded, controls retain their compact layout. Reduced-motion preferences suppress decorative movement.
- Cancelling voice during a pending readiness check now cancels the pending start. Repeated starts coalesce; switching to Talk preserves the latest intent. This prevents a late microphone start after cancellation.
- Background notices use the selected live voice through an output-only connection. Notices wait during an active conversation and retry while the voice connection is not ready.
- Routine mission continuations retain the original task and a three-round limit. Real decisions remain visible; exhausting continuations reports unfinished work instead of success. This is not evidence that every possible task is executable.
- Existing combined interaction remains: tap Fn for Live Talk; hold Fn for precise region selection and spoken analysis. Crop narration starts without microphone capture.

## Research applied

[Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion) and [reduced-motion criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria) informed purposeful state feedback and reduced-motion handling.

[Apple ScreenCaptureKit](https://developer.apple.com/documentation/ScreenCaptureKit) supports the existing native capture implementation. [OpenAI realtime tools](https://developers.openai.com/api/docs/guides/realtime-mcp), [voice server controls](https://developers.openai.com/api/docs/guides/voice-server-controls), and [computer use](https://developers.openai.com/api/docs/guides/tools-computer-use) informed separating audio feedback from tool execution and retaining verification/approval boundaries. These API documents do not establish guarantees for the app's existing Codex subscription transport; that transport was preserved.

## Verification

From repository root:

```text
node node_modules/vitest/vitest.mjs run
Test Files 246 passed (246)
Tests 1144 passed (1144)
Duration 13.41s

node node_modules/typescript/bin/tsc --noEmit -p apps/web
exit 0
node node_modules/typescript/bin/tsc --noEmit -p apps/gateway
exit 0
git diff --check
exit 0

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path apps/mac --filter FnGesture
Test run with 8 tests in 0 suites passed

bash apps/mac/scripts/install.sh
Vite built in 680ms
Build complete! (6.51 sec)
installed /Applications/ShuaCrew.app
exit 0
```

Logs: `/private/tmp/shua-notch-final-tests.log`, `/private/tmp/shua-notch-native-tests.log`, `/private/tmp/shua-notch-realtime-install.log`. The frontend build retains its existing chunk-size warning. Gateway snapshot read returned HTTP 200.

## Still needs physical verification

CUA `getApp('/Applications/ShuaCrew.app')` failed with `Sky Computer Use native pipe startup failed`. Final animation appearance, physical Fn behavior, actual audible latency, and crop playback are therefore not claimed verified. No zero-latency or flawless-operation guarantee.

When returning:

1. Open ShuaCrew. Tap Fn: “What courses am I taking? Open my current lesson.” Tap again to stop voice.
2. Hold Fn and drag a box around a paragraph. Release the mouse; confirm a spoken explanation and no microphone capture for this output-only response.
3. Change the Crew accent; speak again and check that the lower gradient follows it. Check Reduced Motion as desired.
4. Say “Agent: create a local comparison of three project ideas for my current learning goals. Finish with a recommendation and explain your evidence.” Check progress, completion, and cancellation. No publishing or spending is implied.
