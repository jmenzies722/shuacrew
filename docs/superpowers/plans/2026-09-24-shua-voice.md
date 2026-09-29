# Shua Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects delegated execution. Execute and review each task before proceeding. Do not commit or push without separate permission.

**Goal:** Deliver a natural, English-only voice conversation inside the installed ShuaCrew Mac app, backed by its existing Claude/Codex sessions and customizable crew.

**Architecture:** A managed local speech worker supplies neural synthesis while the existing local transcription path supplies bounded utterances. A voice controller coordinates capture, the existing Supervisor/session event stream, and cancellable playback. Crew metadata owns voice/personality preferences; existing tools and approval boundaries remain authoritative.

**Tech Stack:** Existing TypeScript/Fastify gateway, React/Zustand Mac interface, Swift/AppKit/WebKit shell, whisper.cpp, and an isolated Python neural TTS worker. Evaluate Qwen3-TTS through MLX Audio first; evaluate Pocket TTS if quality or latency is unsuitable. Do not add a paid speech API.

**Spec:** `docs/shua-voice-design.md` (approved by user; this implementation plan awaits review).

## Global Constraints

- Existing macOS application; preserve its chat, session history, themes, and tools.
- Use existing authenticated Claude/Codex runtime connections for intelligence.
- No newly billed voice API, API-key setup, or claim of unlimited subscription use.
- Local neural speech. English US/UK only; a small curated cast, male Shua default.
- No giant system-voice list. Personality and voice identity remain independent.
- Preserve approval policy, protected paths, and visible activity.
- No commits, pushes, or access to the user's sealed day-job directories.
- Preserve all pre-existing uncommitted changes. No destructive git operations.
- Do not grant OS microphone or other security-sensitive access during verification without the user's required approval.

## Review Focus

1. Late synthesis/transcription completions after interrupt, end, unmount, or reconnect must not play audio or submit a message (Tasks 2 and 4).
2. Duplicate/replayed events and uncertain HTTP submission outcomes must not duplicate speech, requests, or tool actions (Tasks 3 and 4).
3. Noise, permission denial, device removal, silence, and oversized utterances must release resources and present a recovery action (Task 4).
4. Historical crew records, deleted voices, and provider changes must preserve user choices without silent robot-voice or paid-provider fallback (Tasks 1–3).
5. An assistant's output, untrusted tool output, or ambiguous spoken confirmation must never change the active member or approve an action (Tasks 3–5).

## Delivery boundaries

Tasks 1–2 form the independently testable local-speech foundation. Tasks 3–5 deliver the conversation/crew integration. Task 6 gates installation and the end-to-end claim. If Task 1 fails quality or responsiveness, stop before coupling an unsuitable engine into the app; show measured results and propose the alternate engine.

General cross-provider autonomous delegation is a separate subsystem, not a hidden prerequisite: retain existing opt-in Claude specialist delegation and expose explicit user-controlled member switching for both providers. Label unsupported delegation unavailable. Do not claim Codex delegates to the entire crew unless it has been separately implemented and verified.

## Shared contracts and file ownership

New shared contracts belong in `packages/core/src/voice.ts`, exported through `packages/core/package.json`. Browser code may import this module; it must not import Node or audio-engine dependencies.

```ts
export type VoiceAccent = "en-US" | "en-GB";
export type VoicePersonality = "calm" | "warm" | "direct" | "energetic";
export interface VoiceChoice {
  id: string;
  name: string;
  accent: VoiceAccent;
  description: string;
  sample: string; // same-origin sample identifier, never an arbitrary remote URL
}
export interface MemberVoice {
  voiceId: string;
  speed: number; // finite, 0.8–1.2
  personality: VoicePersonality;
}
export interface SpeechRequest {
  id: string;
  generation: number;
  voiceId: string;
  text: string; // 1–600 characters, no SSML
  speed: number;
}
export type SpeechHealth = {
  state: "missing" | "installing" | "loading" | "ready" | "failed";
  voices: VoiceChoice[];
  error?: string;
  downloadedBytes: number;
  totalBytes: number;
};
```

Model IDs, approved voice references, pinned revisions, checksums, attribution, and expected files are server-owned manifest entries, never accepted from the browser. UI metadata exposes only reviewed choices.

### Task 1: Audition and qualify the neural voice cast

**Files:** Create `apps/gateway/speech/requirements.in`, `apps/gateway/speech/requirements.lock`, `apps/gateway/speech/audition.py`, `apps/gateway/speech/manifest.json`, `docs/research/shua-voice-audition.md`. Store model downloads and generated samples outside git under the app's speech data directory.

**Interfaces:** Produces the server-owned manifest consumed by Task 2 and up to four curated `VoiceChoice` entries. Every manifest entry includes model repository/revision, package lock, reference license, accent, and measured performance.

- [ ] Inspect Python/uv availability, Mac chip/memory/disk, current official model APIs, and licenses. Do not install globally. Resolve and record concrete model revisions and dependency versions before downloading; use safetensors and reviewed implementations, not unreviewed remote model code.
- [ ] Create an isolated environment and locked requirements using uv's resolver. Record download sizes before setup. Start with Qwen3-TTS 1.7B CustomVoice Ryan/Aiden. Do not represent either preset as British. For UK voices use a documented, permissively licensed British reference or an original generated voice whose accent is audited.
- [ ] Build a repeatable audition using this exact public, non-sensitive text:

```python
SAMPLE = "Hi, I'm Shua. You've got a few things on your mind. Let's pick the most important one, and take it from there. What would you like to get done?"
```

- [ ] Measure process/model cold start, time to first audible chunk, generated audio duration, wall time, peak memory, and cancellation. Repeat warm generation five times. Test short confirmations, questions, dates, names, and several sentences. Keep samples and numeric results, not subjective superlatives.
- [ ] Aim for warm first audio within 1.5 seconds and generation faster than playback on this Mac. These are engineering acceptance targets, not advertised engine guarantees. If Qwen misses, audition Pocket TTS with the same text and measurements. Select one initial shipping engine rather than multiplying maintenance dependencies.
- [ ] Present the US/UK samples for user listening. Only approved natural voices enter the primary picker. If UK quality or license cannot be validated, record the missing slot; do not relabel a US voice or include robot placeholders. User audition is a release gate, while subsequent engine-independent work may proceed.
- [ ] Verify manifest parsing rejects empty IDs, duplicate IDs, non-US/UK accents, missing revisions/licenses, and unexpected model paths. Example expectations for `validateManifest(input)` (defined in Task 2):

```ts
expect(() => validateManifest({ voices: [{ id: "x", accent: "fr-FR" }] })).toThrow();
expect(() => validateManifest({ voices: [] })).toThrow();
```

### Task 2: Managed speech service and secure gateway API

**Files:** Create `apps/gateway/speech/worker.py`, `apps/gateway/speech/test_worker.py`, `apps/gateway/src/speech.ts`, `apps/gateway/src/speech-routes.ts`, `apps/gateway/src/speech.test.ts`, `packages/core/src/voice.ts`. Modify `apps/gateway/src/main.ts`, `apps/gateway/src/server.ts`, `packages/core/package.json`.

**Interfaces:** `validateManifest(input: unknown): SpeechManifest`; `SpeechService.status(): SpeechHealth`; `install(signal: AbortSignal): Promise<void>`; `synthesize(request: SpeechRequest, signal: AbortSignal): Promise<Uint8Array>`; `close(): Promise<void>`. Export `SpeechManifest` from speech.ts with the Task 1 metadata fields. Inject the service as optional `ServerOptions.speech`; absent service reports unavailable, never fake success.

- [ ] Write failing tests using a controlled subprocess transport only at the expensive engine boundary. Exercise actual validation, request ownership, queue limits, process cleanup, and HTTP route behavior. Required route assertions:

```ts
expect((await app.inject({ method: "POST", url: "/api/speech/synthesize", payload: {} })).statusCode).toBe(403);
expect((await post("/api/speech/synthesize", { id: "a", generation: 1, voiceId: "../../bad", text: "Hello", speed: 1 })).statusCode).toBe(400);
expect((await post("/api/speech/synthesize", { id: "a", generation: 1, voiceId: validVoice, text: "a".repeat(601), speed: 1 })).statusCode).toBe(400);
```

  Define `post` in the test as `app.inject` with the existing X-ShuaCrew header; derive `validVoice` from a complete literal manifest fixture, not the implementation under test. Run `pnpm exec vitest run apps/gateway/src/speech.test.ts` and observe the missing-behavior failure.
- [ ] Implement a persistent worker using stdin/stdout JSON lines, no network listener. Request IDs correlate responses. Keep diagnostic output on stderr; never log input text. Return bounded WAV data, not arbitrary filesystem paths. Keep one inference active and at most three waiting; reject further work with 429. Use a 30-second per-sentence timeout and release an idle worker after five minutes.
- [ ] Add GET `/api/speech/status`, POST `/api/speech/install`, POST `/api/speech/install/cancel`, POST `/api/speech/synthesize`, and POST `/api/speech/cancel`. Enforce existing host/origin/CSRF checks. Install accepts no model URL or shell command; it uses the checked manifest and atomic staging. Cancellation terminates incomplete setup or the active worker if the chosen engine cannot cooperatively cancel. Restart lazily afterward.
- [ ] Handle HTTP client disconnect by cancelling its synthesis. Return WAV with `Cache-Control: no-store`; cap decoded output at 16 MiB. No audio file is retained after request completion. An ended UI generation ignores all late responses even if cancellation races.
- [ ] Add tests for process crash, malformed output, cancellation before/after startup, duplicate request ID, installation cancel/retry, disk failure, and timeout. Verify canceled jobs never return usable audio and later jobs can recover. Run the worker tests in the isolated environment, gateway tests, and full `pnpm test`.

### Task 3: Durable voice/personality preferences and subscription-backed sessions

**Files:** Modify `packages/core/src/events.ts`, `packages/core/src/projections.ts`, `apps/gateway/src/crew.ts`, `apps/gateway/src/crew.test.ts`, `apps/web/src/screens/CrewPage.tsx`. Create `apps/gateway/src/voice-sessions.ts`, `apps/gateway/src/voice-sessions.test.ts`; register routes through server.ts. Integrate persistence with the existing event store.

**Interfaces:** Add optional `voice?: MemberVoice` to `CrewMember` and the crew.member.set event schema. Add `VoiceSessions.submit({requestId, runId?, memberId, runtime, text}): {runId: string}`. The run belongs to the selected member and runtime; runtime changes require a new session. Persist accepted request IDs in an event-backed index to make retry idempotent across restart.

- [ ] Extend the existing `crew.test.ts` world helper with voice/personality cases. Write failing checks that old records load, updates persist after EventStore reopen, invalid speeds/voice IDs return 400, existing members are not overwritten by Shua initialization, and explicit persona text remains unchanged by voice selection.
- [ ] Add idempotency/session checks against a real Supervisor and captured Runtime boundary:

```ts
const first = sessions.submit({ requestId: "utterance-1", memberId: "shua", runtime: "mock", text: "Hello" });
const retry = sessions.submit({ requestId: "utterance-1", memberId: "shua", runtime: "mock", text: "Hello" });
expect(retry.runId).toBe(first.runId);
expect(store.forRun(first.runId).filter(e => e.kind === "run.created")).toHaveLength(1);
expect(() => sessions.submit({ requestId: "utterance-1", memberId: "shua", runtime: "mock", text: "Different" })).toThrow();
```

  Construct `sessions` with the real store, crew, and supervisor fixture. Test mismatched member/runtime and pending approvals; rejection must leave the event log unchanged.
- [ ] Add Shua through an explicit idempotent initialization action without modifying the existing five-member starter set. Default its runtime from a connected subscription-backed provider; if neither is connected, show setup instead of choosing mock or a paid API provider. Use short conversational persona instructions while retaining the runtime's normal tool policy.
- [ ] POST `/api/voice/utterances` validates text length (1–8,000), request ID (UUID), member existence, run membership/runtime, and idle session state. Set new voice runs to supervised. Reject resuming an autopilot session until the user changes its mode explicitly. Do not route recognized “yes” into approval endpoints.
- [ ] Existing member selection offers “Start from Shua” plus editable name, role, instructions, personality, curated voice, and pace. Preview uses Task 2. Old native system-voice preferences are not treated as neural IDs. Invalid/missing choices show a reselection message; no automatic robot fallback.
- [ ] Run `pnpm exec vitest run apps/gateway/src/crew.test.ts apps/gateway/src/voice-sessions.test.ts` and the full suite. Test provider authentication failure/rate limit as existing runtime states, not fallback success.

### Task 4: Conversation state machine, capture, and cancellable speech

**Files:** Create `apps/web/src/lib/voice-controller.ts`, `apps/web/src/lib/voice-controller.test.ts`, `apps/web/src/lib/voice-capture.ts`, `apps/web/src/lib/voice-capture.test.ts`, `apps/web/src/lib/voice-text.ts`, `apps/web/src/lib/voice-text.test.ts`. Extend media.ts with abortable transcription options and a voice-specific 45-second timeout; leave existing video behavior unchanged.

**Interfaces:** `VoiceController` exposes `start()`, `mute()`, `resume()`, `interrupt()`, `end()`, `receive(events: AnyEvent[])`, `snapshot()`, `subscribe(listener)`. It consumes injected capture, transcription, submission, synthesis, playback, and run-cancellation adapters. State includes `phase`, `generation`, `runId`, `error`, `muted`, and `activeRequestId`. `VoiceCapture.start({signal,onUtterance,onLevel,onError})` returns a cleanup function; `SpeechSegmenter.push(delta)` returns completed speech strings; `finish()` flushes safe prose and `reset()` clears its state.

- [ ] Write failing lifecycle tests with deferred promises at media/network boundaries. Use real state transitions; assert visible phase and consumer side effects, not mock existence:

```ts
await controller.start();
controller.end();
resolvePendingTranscript("Do the task");
await flushPromises();
expect(controller.snapshot().phase).toBe("idle");
expect(submittedTexts).toEqual([]);
expect(stoppedTracks).toBe(1);
```

  Test utilities create deferred adapters and `flushPromises`; keep them out of production. Add the same race for microphone acquisition and synthesized audio. Interrupt increments generation immediately, clears playback, and waits for confirmed run cancellation before accepting the next turn.
- [ ] Implement capture using existing MediaRecorder MIME negotiation, echo cancellation, and noise suppression. Use measured energy for endpointing: speech must persist 250 ms; stop after 900 ms silence; cap an utterance at 30 seconds and encoded size at 8 MiB. After 20 seconds without speech, release capture and offer Resume. Pause capture during playback for the first release. Include a manual Finish speaking button; do not claim acoustic barge-in.
- [ ] Abort transcription fetches on end/interrupt. Extend the gateway recognition runner with AbortSignal and cleanup so browser cancellation does not leave a ten-minute child process. Add tests for silence, empty transcript, media permission rejection, track-ended/device removal, and every timeout; all must release tracks and audio contexts.
- [ ] Use run events from the existing live store. On joining voice, establish an event sequence watermark after hydration; only new accepted turns are eligible for speech. Track event sequence and spoken segment IDs, and reset safely on reconnect. Never replay historical prose or final-answer duplicates.
- [ ] Segment complete user-facing prose into sentences with a bounded three-item queue. Exclude thought/tool events entirely. The segmenter tracks fenced/inline code across deltas, omits URLs and obvious credential-shaped strings, and avoids announcing long code/math blocks. Test split code fences and fragmented secret-like tokens so early chunks cannot escape filtering. Do not claim this is a comprehensive secret detector; provide mute/speak controls for sensitive sessions.
- [ ] Mark Speaking only on actual playback start; mark Listening only after capture starts. If synthesis fails, keep the text answer and offer Retry speech. End voice must not cancel ongoing agent work unless Stop work is chosen. Run the three focused test files, media tests, then `pnpm test`.

### Task 5: Voice panel, curated settings, and visible crew handoffs

**Files:** Create `apps/web/src/components/VoiceConversation.tsx`, `apps/web/src/components/voice-conversation.css`, `apps/web/src/components/VoiceCastPicker.tsx`. Modify `apps/web/src/screens/Sessions.tsx`, `apps/web/src/components/VoiceSettings.tsx`, `apps/web/src/screens/Settings.tsx`, `apps/web/src/screens/CrewPage.tsx`. Reuse Thread, existing approval components, themes, and live state rather than cloning them.

**Interfaces:** `VoiceConversation({runId?, memberId, runtime, onClose, onRunCreated})` owns one controller instance per open panel. `VoiceCastPicker({value, choices, onChange, disabled})` is shared by Settings and member editing. The panel must not remount when a newly created run updates the route; lift ownership above the route-keyed conversation subtree if necessary.

- [ ] Before writing UI code, add controller integration tests for opening without capture, creating a run while the panel stays active, returning to chat with history preserved, and changing member while speaking. A member switch ends the old capture/playback generation and visibly opens that member's thread; names in agent/tool text never trigger switching.
- [ ] Add the composer action without replacing Dictation. Render the panel with the following semantic skeleton; bind controls to controller methods and real state:

```tsx
<section aria-label="Voice conversation with Shua">
  <header><h2>Shua</h2><span>{providerLabel}</span></header>
  <div role="status" aria-live="polite">{phaseLabel}</div>
  <div aria-hidden="true" className="voice-visualizer" />
  <button onClick={start}>Start conversation</button>
  <button onClick={mute}>Mute microphone</button>
  <button onClick={interrupt}>Interrupt</button>
  <button onClick={end}>End voice</button>
</section>
```

  Render Start only before capture; bind disabled states to actual readiness. Keep Close available in every failure state. Preserve focus on open/close, Escape handling, and keyboard operation. Visualization uses measured levels; reduced-motion disables decorative animation.
- [ ] Show dependency installation progress with byte counts and Cancel/Retry. Display “Speech stays on this Mac. Your transcript goes to Claude/Codex. Subscription limits apply.” No microphone starts until the user presses Start and OS access is granted.
- [ ] Replace the large system-voice settings list with reviewed US/UK cards, short descriptions, Preview/Stop, and pace. Put technical engine/download details in a disclosure. Do not silently retain the robotic voice as the default.
- [ ] Render actual session activity and approval cards alongside the transcript. Pending approvals pause listening and playback; resolving them remains an explicit existing UI action. Existing Claude specialists remain opt-in. Show Codex delegation limitations clearly; explicit direct conversations still work with either provider.
- [ ] Validate narrow window layout, dark/light themes, reduced motion, focus return, unavailable microphone/provider/model, and empty voice inventory in the actual Mac window using the approved computer-use tools. Capture screenshots and record observed state, not just source inspection.

### Task 6: Review, real-provider verification, install, and handoff

**Files:** Create `docs/shua-voice-verification.md`; update the voice design status only after evidence supports it. Use existing `apps/mac/scripts/install.sh`; preserve its running-app guard and recoverable backup.

- [ ] Run `pnpm test`, `pnpm typecheck`, `swift test --package-path apps/mac`, the isolated Python worker test command, `pnpm --filter @shuacrew/web build`, and `git diff --check`. Record exact commands, exit codes, counts, warnings, and failures.
- [ ] Request independent read-only code review of the voice-specific diff. Supply the approved spec/plan, implementation paths, evidence, and remaining limitations. Fix important findings and rerun affected tests plus the full suite. Never ask a reviewer to commit or alter unrelated work.
- [ ] Use each already-authenticated Claude/Codex runtime for a short real voice-session test. Verify returned text originates from the real runtime, same-session follow-up retains context, approvals remain supervised, and no speech API credentials or billing are introduced. Do not send private project content just to test voice.
- [ ] Exercise the speech loop with a labeled prerecorded public test fixture, then live microphone input only with required user participation/permission. Verify start → transcript → actual provider response → audible playback, interrupt/cancel, mute/reacquire, end, and return-to-chat history. Fixture success is not proof of live microphone quality.
- [ ] Test provider disconnection, recognition timeout, synthesis failure, stale completion after End, approval pause, app close/reopen, and saved custom crew voice. Ensure idle processes/microphone/audio contexts are released.
- [ ] Quit/relaunch through the normal Mac UI, install with the existing script, then run `codesign --verify --strict --verbose=2 /Applications/ShuaCrew.app`. Verify the installed window contains the new flow and preferences survive relaunch. Do not change unrelated user settings.
- [ ] Final report lists completed behavior, measured latency, approved voice cast, real-provider/live-mic evidence, remaining limitations, and app backup location. Explicitly distinguish voice-only interruption from completed external actions and unsupported autonomous delegation. No “good to go end to end” claim while any required gate remains open.

## Plan self-review

All design sections map to tasks: model quality/cast (1), managed service and setup (2), personalization/provider continuity (3), capture/interrupt/recovery (4), chat layout/activity/approvals (5), installation and evidence (6). Cross-provider delegation is explicitly not falsely advertised. The plan does not authorize commits, new billing, permission grants, or unrestricted computer control.

Execution recommendation: **Native implementation in this session, followed by one independent review**, because capture, cancellation, playback, and the session route lifecycle share tight interfaces. Subagent-driven per-task implementation/review is also available if the user prefers the additional review checkpoints.
