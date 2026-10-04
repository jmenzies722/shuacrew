# Unified notch conversation

Status: design direction approved; written specification awaiting user review.

## Intent and scope

Shua should feel like one assistant in the macOS notch: a continuous conversation that can use existing Mac actions, interact with the screen, and teach through the existing architecture cards. Live provides conversation audio; existing Spark executors provide capabilities. Preserve Claude's pending work and the previously implemented teaching system rather than introducing another assistant or replacing either wholesale.

This phase completes the call integration and its settings, ownership, cancellation, and truthful results. It does not redesign other app sections, expand permissions, change credentials/providers, or promise a particular response latency. No commit or push is authorized.

## Observed starting point

- Pending changes introduce Live/Classic preferences, notch call controls, and a `spark_screen` relay.
- `liveHooks.task` is declared but not registered by Buddy, so the screen relay cannot execute a request.
- `LiveCall` defines two `say` methods for different wire messages. The baseline TypeScript check reports TS2393 at lines 131 and 135.
- The latest reviewed saved screen-request call contains acknowledgments but no recorded completed action. That is not evidence of a successful cursor movement or drawing.
- The focused gateway Live and live-speech suites pass nine tests, but do not cover these integration gaps.

## Architecture and alternatives

Use a single call coordinator with a cancellable adapter to the existing executor. Keeping separate user-facing Live and Classic assistants would preserve the current capability split and audio contention. Replacing the entire executor inside realtime would duplicate permissions, teaching, and tool handling. The adapter approach reuses those established paths while making ownership explicit.

### Responsibilities

- `live-voice.ts`: transport and media lifecycle only. Separate `sendText(text)` for user input from `speak(text)` for assistant announcements. Retain existing wire message types and update all callers; reject sends after termination or before the socket is ready with a surfaced outcome.
- Call coordinator: owns call identity, task identities, approvals, cancellation, availability, and state. UI components subscribe to state rather than own independently running calls.
- Buddy adapter: executes a request through the existing reasoning/action/visual pipeline in silent mode and returns an explicit result. It must not submit into or clear an unrelated user draft.
- Gateway: routes requests and results for the active call, preserves permission enforcement, distinguishes progress from completion, and terminates pending relays when the call ends.
- Notch and main window: render the same logical call. Main-window mounting, unmounting, or minimization must not start a second microphone or steal task ownership.

Use the existing native-window event bridge for cross-window ownership rather than assuming module-level JavaScript state is shared across webviews. The notch owns the call; main-window controls forward commands and display snapshots. If the owner is unavailable, show a recoverable unavailable state instead of silently starting a duplicate call.

### Task contract and flow

Each request carries a call ID, task ID, request text, and cancellation signal. The adapter returns a discriminated result: completed, failed, cancelled, or unavailable; a concise summary; actual action outcomes; and optional references to generated teaching visuals. An empty result is not success.

1. User starts Live through the notch, talk button, or configured shortcut. Capture begins only for that explicit activation or the already-enabled wake flow.
2. Connecting is shown until the transport confirms readiness; only then show Listening.
3. A delegated task is validated and executed by the adapter. Existing permission and screen-access settings remain authoritative.
4. Mac and screen tasks share a serialized execution lane so temporary action hooks cannot overlap. Duplicate task IDs reuse their existing outcome rather than repeat side effects.
5. Progress remains visible but is not narrated as completion. Results return to Live once; the Classic speech queue remains silent throughout the call.
6. Teaching visuals are published through the existing shared visual mechanism. Result summaries reference the lesson, not a second independently generated explanation.

## Cancellation, approvals, and accuracy

Ending a call aborts its tasks, stops capture/playback, releases timers/listeners, and resolves pending local approvals as denied. Check cancellation before each subsequent side effect. Already-completed actions cannot be undone by cancellation and remain in the outcome record. Late events from a previous call cannot update the next call or speak through it.

Speech interruption stops the current spoken response; it does not silently undo a running action. Explicit Stop work cancels execution, while End call cancels call-owned tasks as well. Present these controls distinctly when a task is running.

Approval requests retain existing policy checks and protected-folder restrictions. Spoken yes/no applies only to the single currently displayed approval for the active task. Pending approvals block further dependent actions. A new request, timeout, denial, or call termination cannot accidentally grant an older approval. Screen access off remains off: explain the limitation and offer the existing permission control instead of enabling it implicitly.

Remove unconditional capability claims such as telling the model never to admit it cannot see the screen. Report unavailable tools, denied permissions, failures, and timeouts honestly. A relay timeout is not completion; cancel the associated task and report the known partial outcomes. Never automatically retry an uncertain side effect.

## Settings and fallback

Keep one clearly labeled conversation-engine selector: Live call or Classic. Explain each engine without hard-coded latency promises. Retain the saved choice; do not reset unrelated voice, microphone, screen, or provider preferences.

Separate preferred mode from current availability. If Live setup fails, release all Live media first and show a clear Classic fallback status. The next explicit talk activation may use Classic; do not silently open a different microphone pipeline or replay an already-submitted request. Switching modes during a call cleanly ends it and does not auto-start capture in the other mode.

Connection backoff expires and allows explicit retry. Cached usage must not permanently disable Live: stale usage is advisory, and a fresh authoritative limit or connection result determines availability. Idle hang-up uses the same documented 45-second interval as the implementation, only when listening with no active task, speech, or approval.

## Notch experience and teaching

Keep the existing obsidian-notch styling and dimensional teaching cards. Compact states show Connecting, Listening, Speaking, Working with elapsed time, Needs your approval, or a recoverable error. Voice-reactive motion follows actual playback energy, respects reduced motion, and does not rerender the architecture graph per audio frame.

Expand for an actionable approval or user-opened result, without stealing typing focus. Show one completion preview per task; suppress repeated announcements. Defer proactive suggestions until the user finishes speaking and no approval or task competes for attention. Screen-aware suggestions require the existing screen-access permission.

Architecture requests reuse validated diagrams and the existing strongest-capable reasoning route subject to provider settings. Preserve lesson revisions and follow-up context. Do not use the call's low-effort conversational setting as the only reasoning path for complex architecture work. Distinguish proposed architecture from verified company internals.

Live captions do not inherently provide step-level playback alignment. Only highlight a teaching step from an explicit matching narration identity or playback event. Without that evidence, use manual step navigation and a general speaking indicator; do not simulate synchronized highlighting from text arrival. Classic narration retains its existing step synchronization.

## Verification and acceptance

Add regression tests before implementation for:

- Distinct announcement/user-input messages; socket lifecycle guards.
- Handler registration and cleanup; actual results, empty results, failures, and unavailable executor.
- One call owner across windows; repeated start and owner loss.
- Serialized tasks, duplicate delivery, cancellation, timeout, and stale callbacks.
- Approval denial/expiry/end-call cleanup and no accidental approval reuse.
- Classic speech suppression during Live, without suppressing Live itself.
- Preference persistence, mode switching, bounded fallback, and stale-usage recovery.
- Idle timeout blocked by tasks/approvals and cleared on termination.
- Teaching visual publication without duplicate speech or false synchronization.

Run targeted suites, web typecheck, the full suite, build, and diff checks. Record exact commands/results, including initial failures and retries. Verify served assets match the rebuilt live checkout before native acceptance testing.

Native acceptance is a separate gate: settings selection persists; one call stays available in the notch while the main window is hidden; text and voice reach that call; End stops capture; an explicitly authorized benign screen action returns an observed result; a proposed Netflix-style lesson renders in the notch without duplicate narration. Start with Mac speakers; require user confirmation of audible quality. AirPods switching remains unverified until the device is available and physically tested.

Record first-ready, first-audio, task completion, and cancellation timings without claiming a guaranteed target. Repeated start/stop and task cycles must leave no accumulating listeners, media tracks, or timers. Preserve user drafts, avoid restarting during an active call, and do not perform consequential actions merely for testing.

## Review handoff

After written-spec approval, prepare a sequenced implementation plan with regression tests first, then transport/coordinator lifecycle, executor integration, notch/settings presentation, and native verification. Execution stays local without subagents unless separately requested.
