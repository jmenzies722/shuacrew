# Native Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve measured responsiveness and support bounded native conversational interruption without echo-triggered work or stale playback.
**Architecture:** Native audio owns microphone and playback; the existing controller owns durable turns and supervision. Capability failure yields explicit push-to-talk fallback, not a false full-duplex claim.
**Tech Stack:** Swift AVAudioEngine, TypeScript state machine, existing local speech workers and provider adapters.
**Spec:** `docs/superpowers/specs/2026-09-25-native-conversational-voice-design.md`.

## Global Constraints

Inherit the master plan. Capture pre-roll500ms, utterance30s, encoded request8MiB; synthesis lookahead two sentences/20s; warm retention2/5/10 minutes default5. No microphone activation by the implementation agent without user participation. No paid voice API or robotic fallback.

## Review Focus

- End/route changes racing playback: V1.
- Echo/noise mistaken for an instruction: V1/V3.
- Cancellation uncertain while another utterance arrives: V2.
- Historical response replay after reconnect: V2.
- Latency dashboards conflating provider wait and synthesis: V3.

### V1: Native audio lifecycle and secure bridge

**Files:** Create `apps/mac/Sources/ShuaCrewCore/VoiceAudioState.swift`, `apps/mac/Tests/ShuaCrewCoreTests/VoiceAudioStateTests.swift`, `apps/mac/Sources/ShuaCrew/NativeVoiceAudio.swift`; modify `MainWindow.swift`.

**Interfaces:** `VoiceAudioState` exposes `generation: UInt64`, `active: Bool`, mutating `start()->UInt64`, `end()`, and `accepts(_ generation:UInt64)->Bool`. `NativeVoiceAudio` is MainActor-owned, exposes explicit start/mute/end and bounded playback for the current generation; no web-supplied URL/path accepted.

- [ ] Add the first regression:

```swift
@Test func endedAudioRejectsLatePlayback() {
    var state = VoiceAudioState()
    let first = state.start()
    state.end()
    #expect(!state.accepts(first))
    let second = state.start()
    #expect(second != first)
    #expect(state.accepts(second))
}
```

- [ ] Run `swift test --package-path apps/mac --filter endedAudioRejectsLatePlayback`; confirm missing implementation failure.
- [ ] Implement monotonically advancing generation and active guards; wire AVAudioEngine input/output to one voice-processing graph with explicit capability errors. Bound ring buffers before allocation, keep audio callbacks free of UI/network/file work, and marshal control events to the owner.
- [ ] Extend tests for double-end, stale start callback, device removal, route change,30s/8MiB boundaries, permission denial and invalid bridge message. Validate current main-frame local origin before decoding messages. End audio on close/navigation/sleep and test observer cleanup.
- [ ] Run full Mac tests/build. Use prerecorded buffers for automated acoustic fixtures; no user microphone or OS permission prompt.

### V2: Independent capture/turn/playback state and interruption

**Files:** Create `apps/web/src/lib/voice-session-state.ts`, `voice-session-state.test.ts`, `native-voice.ts`; modify `voice-controller.ts`, `voice-controller.test.ts`, `voice-playback.ts`, `components/VoiceConversation.tsx` and native bridge types.

**Interfaces:** Produce a pure reducer `reduceVoice(state,event)` with independent `capture:'off'|'listening'|'muted'`, `turn:'idle'|'waiting'|'cancelling'|'uncertain'|'approval'`, `playback:'idle'|'buffering'|'speaking'`, `generation:number`, `pendingTranscript:string`. Events include start, userSpeech, cancellationSettled, cancellationUnknown, mute, end, approval and audioChunk(generation). Explicit `initialVoiceState()` supplies defaults.

- [ ] Add and run a failing reducer test:

```ts
const state = {...initialVoiceState(), capture:'listening' as const, turn:'waiting' as const, playback:'speaking' as const};
const stopped = reduceVoice(state, {type:'userSpeech'});
expect(stopped.playback).toBe('idle');
expect(stopped.turn).toBe('cancelling');
const uncertain = reduceVoice(stopped, {type:'cancellationUnknown'});
expect(uncertain.turn).toBe('uncertain');
```

- [ ] Implement the reducer with generation invalidation on interrupt/end; retain capture capability during playback but never submit a second provider turn before cancellation settles. Unknown cancellation retains editable text and offers explicit recovery.
- [ ] Integrate typed native audio adapter in the existing VoiceController; disable simultaneous browser capture. Keep exact pending request IDs, provider identity and approval gates. Reject old chunks, repeat events and historical streamed answers.
- [ ] Add controller regressions with controllable promises for cancellation/end/reconnect, backlog bounds and approval arriving during speech; run `pnpm exec vitest run apps/web/src/lib/voice-session-state.test.ts apps/web/src/lib/voice-controller.test.ts` then typecheck.

### V3: Settings, timing and acoustic acceptance

**Files:** Modify `components/VoiceSettings.tsx`, `VoiceConversation.tsx`, `voice-conversation.css`, `components/DeveloperSettings.tsx`, `apps/gateway/src/speech.ts`; create `apps/web/src/lib/voice-timing.ts` and `voice-timing.test.ts`; update voice verification report.

**Interfaces:** `voiceDurations(stamps: Partial<Record<'endpoint'|'transcribed'|'firstText'|'firstAudio'|'playback',number>>): Record<string,number|null>` reports only ordered, present monotonic intervals. Missing/negative values become null.

- [ ] Add failing test `expect(voiceDurations({endpoint:100,transcribed:140}).transcriptionMs).toBe(40)` and `expect(voiceDurations({endpoint:140,transcribed:100}).transcriptionMs).toBeNull()`; run targeted Vitest.
- [ ] Implement stage timestamps without content logging. Add explicit endpoint profile, bounded warm-retention, spoken verbosity and capability-gated interruption controls. Preview actual installed voices; no unverified locale labels or fake samples.
- [ ] Instrument real warm/cold prerecorded speech runs, capture median/p95 and model/resource behavior, and compare first-audio versus chunk quality. Record observed values, not promises. Verify no duplicate workers and idle release.
- [ ] Inspect installed UI, mute/end/manual interruption with permitted test audio. Keep automatic speaker interruption labeled experimental until participating-user speakers/headphones tests pass. Verify no self-trigger, clipped speech, stale audio or background microphone capture before removing that label.
