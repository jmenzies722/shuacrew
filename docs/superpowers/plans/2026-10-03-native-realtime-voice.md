# Native Realtime Voice Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Do not commit or push without the user's permission.

**Goal:** One native speech path for Fn, Talk, and command announcements, with reliable interruption and microphone gating.

**Architecture:** Retain the existing Codex WebRTC connection only if its controls satisfy the transport gate. Keep playback and microphone state under the existing single-owner live-session controller. Do not silently switch providers or use local TTS as fallback.

**Tech Stack:** TypeScript, React, Web Audio, WebRTC, Codex app-server, Vitest, existing macOS host.

**Spec:** `docs/superpowers/specs/2026-10-03-native-realtime-voice-design.md`

## Global Constraints

- Preserve existing uncommitted work and all Mac action approval/protected-folder policies.
- No new API credential or billing integration without a separate user decision.
- No native autonomy build/deployment; no active call/task restart.
- Release closes microphone input immediately, including during connection setup.
- No fake cancellation, fabricated waveform, or unverified end-to-end completion claim.
- Subscription-only and no reconnect workaround: both alternatives were explicitly rejected.

## Review Focus

- Release before microphone acquisition resolves: late streams must not reopen input.
- Old reply arrives after interruption: neither sound nor captions may resume.
- Multiple windows: only the existing owner captures or plays audio.
- Command bursts and approval prompts: no overlap, false delivery, or replay after reconnect.
- Failed playback or unsupported control: actionable error, never automatic Fenrir fallback.

## Task 1: Transport feasibility

Files: `docs/verification/native-realtime-transport-2026-10-03.md`.

- [x] Inspect `codex --version` and generate experimental JSON schemas.
- [x] Enumerate realtime RPCs, stop parameters, speech acknowledgment fields, and transcript metadata.
- [x] Check official GPT-Live and Realtime documentation; do not equate their protocols.
- [x] Record the missing verification contract and stop production rollout at this gate.
- [ ] Establish a supported cancellation/recovery contract that discards stale speech while preserving a usable conversation, then verify it on the selected transport.
- [ ] Run `node node_modules/tsx/dist/cli.mjs scripts/probe-native-live.ts --subscription-probe` in an isolated synthetic-media browser; require counting to yield, a changed answer, and a successful later turn on the same connection. Keep the actual app and physical microphone untouched.

Gate status: NOT PASSED. The generated app-server schema exposes session stop, not per-reply cancellation. GPT-Live guidance does not establish safe resume from an instruction acknowledgment. See the evidence report; absence from RPC schemas alone does not prove the WebRTC service lacks a control.

## Task 2: Native output and playback state (gated)

Files: `apps/web/src/lib/live-voice.ts`, `apps/web/src/lib/live-voice.test.ts`, `apps/web/src/lib/live-session.ts`, `apps/web/src/lib/live-session.test.ts`.

Interface: `LiveCall` remains the transport owner; `LiveEvent` carries measured levels, playback text, and state. Cancellation interface must follow Task 1's verified contract, not a speculative RPC.

- [ ] Add failing tests for remote playback with zero local synthesis, remote measured levels, playback rejection, and stale-call event suppression.
- [ ] Remove local narration from the native call; connect the remote track to playback and its analyser.
- [ ] Add and test cancellation using the verified contract, including queued output and subsequent-turn recovery.
- [ ] Run `node node_modules/vitest/vitest.mjs run apps/web/src/lib/live-voice.test.ts apps/web/src/lib/live-session.test.ts` and require all tests to pass.

## Task 3: Fn/Talk microphone ownership (gated)

Files: `apps/web/src/lib/fn-capture.ts`, its tests, `apps/web/src/lib/live-session.ts`, its tests, `apps/web/src/screens/Buddy.tsx`, `apps/web/src/lib/live-preferences.ts`, its tests.

Interface: Fn down/hold/release/cancel/tap route into the single live owner; continuous capture remains a separate explicit Talk intent. UI readiness must distinguish mic-off from listening.

- [ ] Add failing tests for hold-release before setup completes, cancel, repeated release, 30-second buffer limit, and no capture after release.
- [ ] Implement bounded in-memory first-turn buffering and immediate local microphone gating; never persist raw mic buffers.
- [ ] Add owner/secondary-window tests and tests that Fn cannot silently enable continuous capture.
- [ ] Remove automatic native-to-classic fallback in this mode; test that text remains usable on voice failure.
- [ ] Run focused Fn, live-session, live-preferences, and mic-recovery tests.

## Task 4: Voice selection, narration, and notch (gated)

Files: `apps/web/src/components/LiveVoiceSelect.tsx`, `apps/web/src/components/SparkSettings.tsx`, `apps/web/src/components/LiveMode.tsx`, related tests, `apps/web/src/lib/quiet-announcements.ts`, its tests, `apps/gateway/src/live.ts`, its tests.

Interface: existing command identities and single queue feed the native output owner; native voice preference applies on next connection. Keep approval and task execution interfaces unchanged.

- [ ] Add failing tests for native choice persistence, delayed command announcements, priority of pending approvals, and queue disposal on Stop.
- [ ] Route all native-mode speech through one output; suppress competing local previews/notifications.
- [ ] Display measured audio states and turn-level captions without promising word-accurate synchronization.
- [ ] Propagate transport errors rather than swallowing failed spoken inserts; distinguish submitted from audibly delivered.
- [ ] Run gateway voice, command narration, quiet announcement, and LiveMode tests.

## Task 5: Installed-app verification (gated)

Files: append actual evidence to the verification report.

- [ ] Run web/gateway `tsc --noEmit`, `git diff --check`, and the full Vitest suite.
- [ ] Back up web assets, build, verify idle state, and load the web update without including unfinished native changes.
- [ ] Verify short/long replies, actual interruption and recovery, Fn release, Talk, announcements, captions, and failure UI in the installed app.
- [ ] Measure cold/warm first-audio latency and interruption-to-silence; report remaining physical checks to the user.

## Execution Record

2026-10-03: User approved end-to-end implementation. Task 1 found an unresolved transport requirement. No production voice changes, new credentials, call restarts, or deployments were made in this execution. Tasks 2–5 remain gated rather than being marked complete with a weaker interruption policy.

Continuation: user rejected both public API migration and reconnect-on-interruption. Added an isolated subscription-backed probe using the existing gateway negotiation. Investigate observed in-call behavior rather than concluding from missing RPC names; do not weaken the release criteria.

Probe results: natural spoken interruption and a later question succeeded on the
same connection in trial 2. Text-directed interruption also changed the answer,
but not immediately; counting continued after the request. Trial 1 lost media
connectivity. These observations do not pass the immediate-Stop rollout gate.

Ruling: fix persistent media-disconnect reporting now because it was directly
exposed by the probe and otherwise leaves the UI claiming to listen. Five-second
grace retains the same connection for transient recovery, then fails visibly;
there is no automatic application reconnect. Red-green regression tests cover
both outcomes. Full suite: 216 files / 1,007 tests passed; web types passed.
No voice-switch deployment or installed-app verification has occurred.
