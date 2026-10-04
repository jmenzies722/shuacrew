# Unified Shua voice and truthful eye state

## Delivered

- The user requested their preferred local voice with OpenAI conversation/task capability and reported repeated false eye-off warnings.
- Calls retain OpenAI input, reasoning, delegation, approvals and existing execution. OpenAI's remote audio element is muted; assistant transcript sentences use the saved local SpeechQueue voice. Local playback drives the speaking indicator and audio levels. User transcripts interrupt local narration; call teardown disposes it. Playback errors end with an explicit local-voice error instead of silently switching voices.
- The same saved local voice and speed drive call speech and companion chat. The call picker now shows the local cast. Settings explain one Shua voice, and the notch has one Talk/End control instead of separate Live and Voice mode buttons. Local preview/setup components unmount during a call to avoid overlapping preview playback.
- Eye state now subscribes to same-window and storage changes. Native stream state is broadcast to the notch and registered main-window clients, including on subscription. An active screen stream counts as enabled for Live's preflight and capture decisions.
- Removed the prompt rule that treated every missing screenshot as an eye-off condition. Each task receives current SCREEN STATE separately from whether an image was attached. OpenAI is instructed to request a fresh check instead of repeating an earlier permission failure. Screen questions such as “can you see my screen,” “what do you see in Chrome,” and tab-control requests trigger capture when enabled. No OS permissions were expanded.

## Evidence

- New screen-access/narration suites initially failed because implementation modules were absent. The remote-audio regression then failed because the OpenAI audio element was unmuted. A separate prompt regression reproduced the exact instruction to ask for the eye despite missing permission evidence. All passed after their fixes.
- `node node_modules/vitest/vitest.mjs run --maxWorkers=4`: **199 files, 941 tests passed**, 22.71s, exit 0. Log: `/private/tmp/shuacrew-unified-voice-final-tests.log`.
- Subsequently strengthened interruption coverage and added the no-new-characters final-transcript regression: `node node_modules/vitest/vitest.mjs run apps/web/src/lib/live-narration.test.ts` → **3 passed**, exit 0. No production change followed that run.
- Web and gateway `node node_modules/typescript/bin/tsc --noEmit -p …`: exit 0. After the final one-button notch change, web typecheck and `git diff --check` again exited 0.
- `swift test` → **89 passed**. `swift build -c release --product ShuaCrew` → success, 30.79s; existing Sendable warnings remain.
- `node node_modules/vite/bin/vite.js build` from `apps/web` → exit 0; existing browser-externalization, CSS and chunk-size warnings remain. Final build log: `/private/tmp/shuacrew-unified-voice-build.log`.
- User explicitly approved ending the old call, restarting the gateway, and testing the update. The old call was already off when quitting. Gateway launch configuration was verified to use `shuacrew-live/apps/gateway`; `launchctl kickstart -k gui/501/com.shuacrew.gateway` succeeded. Health returned `ok: true`, `pendingApprovals: 0`.
- Signed staged app and installed app both passed `codesign --verify --strict`; staged versus installed executable `cmp` exited 0. Previous app retained at `~/.shuacrew/app-backups/ShuaCrew-unified-local-20261003-0045.app`. No backup pruning was performed. The staging bundle is `/private/tmp/shuacrew-unified-voice.Dv3yS9/ShuaCrew.app`.
- Served index and rebuilt `apps/web/dist/index.html` matched via `curl` and `cmp` (exit 0). Reopened native app visibly displayed the saved **Fenrir** voice under “Shua's voice · powered by OpenAI.” Call reached Listening; typed test returned “Shua is ready.”
- User confirmed: **“Yes, Fenrir sounds clear”**, answering whether Fenrir sounded clear with no second voice overlapping.
- With the already-enabled eye, a read-only fresh-screen request entered “Reading your screen…” and returned “Sable.” No eye-off or macOS-permission request appeared. This verifies capture request/result flow; the model's identification was not independently compared to its captured image.
- Call subsequently ended and the native UI showed Talk to Shua, off, with screen preference still enabled. No test call left active.

## Limits

- Physical AirPods switching, spoken interruption timing and prolonged-call stability are not yet verified. Unit interruption tests do not prove acoustic echo cancellation on every output device.
- The prompt router remains heuristic. Runtime permission and action checks remain authoritative; this does not grant unrestricted Mac control.
- No commit or push.
