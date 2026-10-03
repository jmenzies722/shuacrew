# Voice reliability pass

The approved scope: current-screen cursor targeting, fast common commands, duplicate-action protection, dependable interruption, conversation continuity, honest action results, a calm notch, and repeatable benchmarks.

## Behavior

- Point/guide blocks acquire a new screen capture and re-identify the original target by its name and role. Screenshot indices are not reused. Missing, ambiguous, or changed-window targets fail visibly instead of pointing at a guess. Secondary displays carry stable display IDs and OCR. Replay buttons ask for a fresh target.
- `stop talking` silences output while work continues; `stop`/`cancel this request` invalidate queued continuations, decline pending confirmations, stop guidance, and request cancellation of the companion run. Named crew cancellation still follows the crew confirmation path. Already-dispatched OS actions cannot always be undone.
- Repeat/open-chat controls run locally. Existing timer/media controls keep their direct route. Developer Settings reports measured command dispatch median/p95; voice playback timing remains separately available.
- Model actions have stable message/block/action keys. SQLite atomically reserves each key across app surfaces and restarts, stores a hash of the action and a redacted receipt, and refuses replay of unknown outcomes. A genuine new user request gets a new key. The reservation is at-most-once dispatch, not a transactional guarantee across external apps.
- Generation checks suppress old batches, delayed follow-through, and setup results after interruption. Native delayed clicks/presses check a cancellation generation before execution.
- Last selected session, target label, and task provide continuity. Archived/missing sessions are excluded. Crew references persist across reloads. Screen IDs and positions are always re-resolved.
- Conversation history survives runtime/context rollover through linked runs. Conversation options can resume saved chats. Instruction updates refresh the existing conversation instead of discarding it; stable event-based message keys prevent late history loading from re-executing actions.
- Spoken completion claims wait for executor receipts. Navigation requests are described as requested; merge requests as queued. Failed native press results are not presented as success.
- The notch retains the small thinking wave and no thinking words/shimmer. Chat keeps detailed history and receipts.

## Repeatable checks

Run `pnpm test`, `pnpm typecheck`, `pnpm --filter @shuacrew/web build`, and, from `apps/mac`, `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test`.

`pnpm voice:benchmark tests/voice/commands.json /private/tmp/shua-voice-benchmark.json` runs the checked-in command-routing corpus. It is **text-only**, not a microphone accuracy measurement. Regression tests separately cover ambiguous/moved targets, duplicate reservations across DB connections/restarts, cancellation during confirmation, out-of-order transcript fragments, and VAD noise/echo behavior.

To measure real recordings, copy the JSON corpus and add `"audio": "relative/clip.wav"` to each recorded case, then pass that manifest to the same command. Empty `expected` is a silence/noise case. It calls the local transcription endpoint, never executes recognized commands, and reports word error rate, control mismatches, false activations, and transcription request p95. Do not compare text-routing times with audio transcription times. The existing native `selfTestVoice` path also accepts `expected` on each PCM clip and grades the actual HandsFree/Apple/Whisper path without executing commands; its elapsed time includes replay duration.

No real speech recordings were supplied or checked into this repository. Acoustic accuracy and physical multi-monitor testing must be reported as unmeasured until those inputs are available.

## Verified on September 30, 2026

- `pnpm exec vitest run --maxWorkers=4`: **160 files, 776 tests passed**. The preceding unrestricted run hit a 15-second timeout in the merge-queue integration test; the complete bounded-worker run passed.
- `pnpm typecheck`: exit 0.
- `pnpm --filter @shuacrew/web build`: exit 0, with the existing large-chunk warning.
- Native Swift tests: **76 tests in 7 suites passed**. Release build completed.
- `pnpm voice:benchmark tests/voice/commands.json /private/tmp/shua-voice-benchmark.json`: **15 text-routing cases, 0 routing failures, 0 audio cases**.
- `git diff --check`: exit 0.
- Live gateway health returned `ok: true`. Live receipt reservation refused a duplicate claim and returned the stored result.
- Installed signed native build **20260930194522** at `/Applications/ShuaCrew.app`, preserving the prior app in `~/.shuacrew/app-backups/`, and restarted the app and gateway.
- Live Codex answered the Settings-pointing request without a target error. After restoring the existing conversation, the follow-up “what did I ask you to show earlier?” returned “You asked me to show you the Settings button in ShuaCrew.” Prior messages remained visible.

No commit or push was performed. These checks do not establish acoustic accuracy, physical multi-monitor correctness, or rollback of an OS action already dispatched.

## Spoken approval and Autopilot follow-up

- Spoken approvals describe common commands in plain language, such as running tests, building, deleting files, or pushing commits. Exact commands remain in the approval card. Unrecognized scripts and complex shell syntax direct the user to review the details instead of inventing a purpose.
- “Go autopilot mode” directly sets the discussed active crew session to the existing `auto` permission mode. “Enable autopilot for [exact session title]” selects an explicit session; “turn off autopilot” restores supervision. Ambiguous targets require a session name. This does not change workspace defaults, mouse-control settings, or venture automation.
- Existing gateway deny rules and the supervised-only crew-room restriction remain in place. Enabling session Autopilot releases its pending policy approval using the existing gateway behavior.
- Explicitly requested completion alerts persist across reloads, synchronize across app windows, and report finished, ready-for-review, failed, or canceled accurately. They do not automatically approve review or merge work.
- `pnpm test --maxWorkers=4`: **161 files, 780 tests passed**. `pnpm typecheck`, web build, and `git diff --check` passed before the final storage-event synchronization addition; final typecheck/build also run for that addition. No native changes were required.
- Live UI verification of these follow-up changes was unavailable: the computer-use native pipe failed to start. No real crew session was switched to Autopilot as a test.

## Natural completion reports and boxed screen selection

- Session completion now requests a short model-written spoken recap grounded in the latest turn's final report, changed files, recorded checks, and status. It uses the existing connected subscription with the tool-free structured completion path. Summaries distinguish review, failure, cancellation, and completion; proposed actions are not execution evidence. Concurrent requests share one cached generation. Model failure gives an honest fallback pointing to the full session result.
- Normal completions, Autopilot completions, and mission reports use one announcement path, with per-turn duplicate suppression and stale-result checks. The latest 20 recap cards remain in local chat storage.
- The new “Select an area to analyze” button (or “select an area” spoken command) opens frozen native display overlays. Drag a rectangular selection; Escape cancels. Only the cropped image is attached to the next question. Tiny drags are rejected and reverse-direction/Retina coordinate conversion is covered by native tests. Crop-only turns cannot dispatch desktop action/point/guide/zoom blocks.
- `pnpm test --maxWorkers=4`: **162 files, 783 tests passed**. Native tests: **78 tests in 8 suites passed**. Final typecheck, web build, native release build, and diff checks passed. Existing web chunk-size and native compiler warnings remain.
- The live `/api/runs/r_78e54118/spoken-summary` request returned a generated summary through Codex. Gateway health reported `ok: true` after restart. No task actions were executed by this check.
- Signed native build **20260930224858** installed at `/Applications/ShuaCrew.app`; prior app preserved at `~/.shuacrew/app-backups/ShuaCrew-before-selection-20260930224858.app`. The user must quit and reopen the running app to load the new native binary because computer-use could not start its native pipe. Live drag, Escape, and physical multi-monitor interaction remain unverified.
- Crew-session model selection: composer **Options → agent → model**, plus effort. Shua companion model selection: **Model** dropdown in its chat header; separate preference.

## Existing-session model controls correction

The previous directions were incorrect for existing sessions: their Options panel only exposed voice and context controls. Added labeled Agent, Model, and Effort selectors there. Selections apply to the next message, with controls disabled during active work. The follow-up endpoint validates the selection before recording a route change or enqueueing the message; changing providers retains the session and supplies its recap to a fresh provider conversation. Latest model and effort selections override earlier routes.

`pnpm test --maxWorkers=4`: **785 tests in 162 files passed**. The focused route tests also passed with repeated provider changes and a second model on the same provider; invalid selections enqueue nothing. Typecheck, web build, and diff check passed. Gateway restarted with no active sessions. No native rebuild was needed for this correction; live visual verification remains unavailable.
