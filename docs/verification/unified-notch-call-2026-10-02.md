# Unified notch execution ledger

Plan: `docs/superpowers/plans/2026-10-02-unified-notch-call.md`

- User approved local end-to-end execution; no commits, branches, or pushes.
- Ruling: keep work in the existing feature checkout with Claude's uncommitted changes rather than create a worktree that omits them. All edits remain reviewable in the working tree.
- Pre-flight: transport sends distinct text/speech messages; session owns transport; task executor consumes call/task identity and abort signal; Buddy publishes existing visuals. No interface conflicts identified.
- Initial baseline: duplicate `say` implementation fails web typecheck; existing focused tests pass 9/9 but do not cover the incomplete bridge.

## Implemented and tested

- Transport separates text, narration, and recorded typed results; guards late media, stale callbacks, closed sockets, and setup deadlines.
- A module-level coordinator preserves the existing API rather than adding a second `LiveSession` class. The native notch owns media; other windows forward commands and receive revision-ordered snapshots. Audio levels use a separate throttled store.
- Serial task queue has call/task identity, duplicate suppression, bounded work, cancellation and truthful partial outcomes. Local approvals settle on end; gateway relay timeouts notify the client to cancel.
- Buddy registers its existing action/visual executor, silences Classic output during Live, retains drafts, and refuses screen actions when the eye is off. Architecture uses the existing validated visual pipeline.
- Settings preserve the chosen engine; fallback requires another user activation. Usage samples expire, retry clears backoff, and idle shutdown waits for tasks/approvals. Working elapsed time and Stop work remain distinct from End call.
- Typed prompts now execute through Buddy and record their real results before Live narration. Rationale: the first physical call reached Listening but the realtime append-text request produced no response before idle shutdown. The precise provider cause is not established.

## Observed verification

- Transport, queue, session, adapter, preferences and gateway regressions were run RED then GREEN during implementation. Adapter tests are contract tests, not a mounted Buddy integration suite.
- `node node_modules/vitest/vitest.mjs run`: 930 tests passed across 197 files before the setup-deadline regression; final rerun below.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/web` and `-p apps/gateway`: exit 0.
- `swift test` from `apps/mac`: 89 passed. `swift build -c release --product ShuaCrew`: succeeded; existing Sendable warnings remain.
- `node node_modules/vite/bin/vite.js build` from `apps/web`: succeeded; chunk-size warning remains.
- `curl -sf http://127.0.0.1:7420/ | cmp - apps/web/dist/index.html`: exit 0, served bundle matches.
- Native signed build installed after backing up the prior app to `~/.shuacrew/app-backups/ShuaCrew-unified-20261002-232025.app`. Strict codesign verification and signed-stage versus installed binary comparison passed.
- Native settings: Classic selection and restoration to Live both visibly verified. Screen eye remained off. User authorized a short microphone call on Mac speakers, not screen control or AirPods tests.
- First physical call: Listening appeared, typed architecture prompt cleared, but no response/task/report appeared before idle shutdown. Failed acceptance, not a pass.
- Second physical call after direct typed routing: remained Connecting; explicitly ended through the native End live call control. Added a whole-setup 30-second deadline. New regression failed before the fix, then transport suite passed 5/5.
- Third physical call with that deadline: visibly changed from Connecting to "Couldn't connect — The call could not connect within 30 seconds. Please retry." End-call controls disappeared and an explicit retry/Classic fallback appeared. No prompt was submitted while not ready. This verifies failure recovery, not successful calling.
- Final `node node_modules/vitest/vitest.mjs run --maxWorkers=4`: **197 files, 931 tests passed**, 21.81 seconds. Gateway typecheck and `git diff --check` in the same command exited 0. Web typecheck exited 0 before the final build (930ms). Final built assets matched the served index and were loaded by relaunching the native app.
- Live is not acceptance-complete: setup currently fails before readiness on the installed app. The call has ended; no test microphone call was left running. Existing wake-word preference was not changed.

## Remaining acceptance limits

## Follow-up: connection investigation and native acceptance

- Added phase-specific timeout diagnostics. The failure was **microphone acquisition while `document.hidden` was true**, before WebSocket negotiation. No Live child process was launched in that state. This corrects the earlier, overly broad description of a Live-service connection failure.
- WebKit documents deferring capture for hidden documents: https://bugs.webkit.org/show_bug.cgi?id=259465. On the visible retry, macOS logs showed `grantRequest` for MacBook Pro Microphone and the native UI reached Listening.
- The same authorized text-only Netflix-style prompt then entered Working, rendered six connected components with seven labeled connections and a proposed-design disclaimer, finished, and returned to Listening. Manual Next moved from overview to “Upload once” (teaching step 1/3). The overall five cards include overview and wrap-up. End live call removed the call controls. Screen eye stayed off.
- Fix: the owner asks the native host to open the notch before capture; transport waits for document visibility, cancels the wait on end, and retains the bounded deadline. Retry clears the old error rather than displaying it beside Listening.
- Regression evidence: two new assertions initially failed (hidden page requested media, stale error survived retry). After the fix, those passed. Added a visible-transition assertion proving one acquisition and no leftover timers. Full run: `node node_modules/vitest/vitest.mjs run --maxWorkers=4` → 197 files, **934 tests passed** (21.86s). Web/gateway typechecks and diff check exited 0. Web build 972ms; Swift release build 28.70s; Swift tests 89 passed.
- Installed signed build verified by `codesign --verify --strict`, staged/installed binary `cmp`, and served-index `cmp`. Backup: `~/.shuacrew/app-backups/ShuaCrew-visible-20261002-235907.app`.
- Final entry-point test then found main-window `liveSubscribe`/`liveCommand` messages were not forwarded (only `buddy*` messages were). Added explicit forwarding through the existing origin-validating Buddy handler. Native retest follows; do not count the earlier main-window click as a pass.

### Still unverified

- No claim of audible continuity from UI state; user must confirm actual sound from this build.
- AirPods/device-switch, screen-pointer actions, and permission-denial physical tests not performed.
- Full mounted Buddy draft/narration/visual-publication integration coverage remains incomplete. Repeated teardown testing covers the task queue, not 100 physical microphone sessions.
- Stop work cancels local delegated tasks; hard interruption of a provider-owned shell turn is not verified.
- Main-window forwarded text has no delivery acknowledgement; an end/submit race remains possible.
- Self-review only, consistent with the plan's no-subagents constraint. No commit or push.

## Resume: October 3 — forwarding and screen-intent regression

- Main-window Talk visibly opened the native notch, reached Listening, and shared Listening back to the main window after tucking the notch. A main-window text prompt reached the owner and produced a result; main-window End removed the call controls. This closes the prior forwarding acceptance gap for start/text/end, not the acknowledged end/submit race.
- The prompt `Reply with one short sentence: what is 15 percent of 80? Do not use tools or screen access.` incorrectly produced the screen-permission refusal. The preflight used `needsScreen`, which inherited broad `aboutScreen` keywords including `screen`, `explain`, and `code`.
- Ruling: narrow `needsScreen` to screen references and interaction requests, removing explicit screen opt-out phrases before classification. Keep actual capture and action permission guards unchanged. General explanations must remain usable with the eye off.
- Regression first failed on the exact native prompt (`expected true to be false`); expanded positive cases exposed `Read my screen` before the final classifier passed. Coverage includes general explanations, explicit opt-outs, actual screen requests, and a no-click request that still asks for highlighting.
- Focused baseline: six Live suites, 35 passed. Regression plus adapter run: 53 passed. Final full command `node node_modules/vitest/vitest.mjs run --maxWorkers=4` initially reported 931 passed / 4 failed under sandbox restrictions (local socket and system-statistics tests); approved unrestricted retry: **197 files / 935 tests passed**, exit 0, 22.18s. Log: `/private/tmp/shuacrew-resume-unrestricted-tests.log`.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/web && node node_modules/typescript/bin/tsc --noEmit -p apps/gateway && git diff --check`: exit 0.
- First build invocation used the wrong root Vite path and failed with MODULE_NOT_FOUND. Corrected command from `apps/web`: `node node_modules/vite/bin/vite.js build` succeeded in 1.02s. Browser externalization, CSS highlight, and chunk-size warnings remain.
- `curl -f http://127.0.0.1:7420/ -o /private/tmp/shuacrew-served-index.html && cmp /private/tmp/shuacrew-served-index.html apps/web/dist/index.html`: exit 0 after the build. Restarted the idle native app to reload both webviews. No native source changes or native installation in this resume; comparing the unsigned release executable directly against the installed signed binary differed and is not used as build identity evidence.
- After reload, the exact regression prompt reached Working, returned `15 percent of 80 is 12.`, and returned to Listening with the screen eye still off. End live call removed all call controls and restored Talk to Shua (off). Audio captions were visible, but speaker quality is still not physically verified. No test call left active.

## Voice settings clarification — October 3

- User reported two voices, OpenAI and the other. Asked whether this meant settings choices or overlapping audio; no clarification received before implementation. Scope here is the confirmed settings ambiguity, not a claim to have fixed simultaneous playback.
- Moved the conversation-mode selector into Voice. OpenAI Live is labeled recommended; Classic is labeled local speech. Existing saved mode remains unchanged.
- Added the Live voice picker to Voice settings and reused it in the call panel, with next-call timing and same-window/storage-event refresh. Local replies, speed, previews, and setup are explicitly distinguished from Live; Classic open-mic controls only appear in Classic mode.
- Removed inaccurate copy claiming the local voice applies everywhere or that cloud voice is unconfigured. Copy now describes OpenAI call audio separately from local speech synthesis and connected chat models.
- `node node_modules/vitest/vitest.mjs run apps/web/src/components/VoiceComparison.test.tsx apps/web/src/lib/live-session.test.ts apps/web/src/lib/live-preferences.test.ts --maxWorkers=4`: **14 passed**, 3 files. Web `tsc --noEmit` and `git diff --check`: exit 0. Web Vite build: exit 0, 1.62s, existing warnings remain. Served index matches built index via `curl` then `cmp` (exit 0).
- Native inspection found the user's Live call active. Did not end it or reload either webview. Visual acceptance of the updated controls remains pending until the user finishes and reopens the app. No settings, microphone permissions, or screen permissions changed by this work.
