# Notch Voice Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if selected. Use failing tests before implementation.

**Goal:** Let the user compare actual local voices for architecture narration and explicitly choose a preferred voice without disrupting conversation playback.

**Architecture:** Reuse the existing voice manifest, settings persistence, SpeechQueue and playback timing. Comparison samples are isolated from saved conversation state. Cloud remains unavailable until separately configured and approved; this plan does not silently add a provider.

**Tech Stack:** TypeScript, React, existing local speech service, Vitest, native Mac UI.

**Spec:** `docs/superpowers/specs/2026-10-02-intelligent-notch-teaching-design.md`, section 5.

## Global Constraints

- “Do not change the saved voice until the user explicitly chooses it.”
- “Stop the previous sample before starting another.”
- “No automatic subscriptions, key creation or transmission to a new provider.”
- “No commit or push without the user's separate permission.”
- Complete the teaching plan first; preserve existing device routing and conversation cancellation semantics.

## Review Focus

- Rapid A/B switching must not play stale audio: Task 1.
- An unavailable voice must show its failure rather than silently substitute: Task 1.
- Incoming user speech must stop previews and remain usable: Tasks 1 and 3.
- Navigation/unmount must release preview resources: Tasks 1 and 3.
- A remembered preference must not change just because a sample played: Task 2.

## Task 1: Isolated local comparison controller

**Files:** create `apps/web/src/lib/voice-comparison.ts` and `.test.ts`; modify `buddy-voice.ts` only as needed to expose a bounded disposal method without affecting existing callers.

**Interfaces:** `VoiceComparison` exposes `play(voiceId:string): Promise<void>`, `stop():void`, `dispose():void` and `snapshot(): {voiceId:string|null; status:'idle'|'loading'|'playing'|'error'; firstAudioMs:number|null; error:string|null}`. It consumes existing available voice IDs and uses one fixed architecture passage at speed 1. A new generation invalidates callbacks from every previous sample. Latency starts on click and ends on actual scheduled playback start, not HTTP completion.

- [ ] Write tests for A→B ordering, cancellation before/after first audio, unavailable voice, disposal and incoming-speech cancellation. Assert no saved-voice writes.
- [ ] Run `pnpm exec vitest run apps/web/src/lib/voice-comparison.test.ts`; observe failures.
- [ ] Implement the controller using existing audio queue capabilities and explicit voice overrides. Dispose timers, sources and owned audio context when done; never close a conversation-owned audio context.
- [ ] Rerun tests and existing speech-queue/device tests.

## Task 2: Voice comparison UI and explicit selection

**Files:** create `apps/web/src/components/VoiceComparison.tsx` and `.test.tsx`; modify `components/SparkSettings.tsx` and its scoped CSS.

**Interfaces:** render the controller snapshot and existing available voices. “Use this voice” calls `saveBuddyVoice({id})` only on a deliberate user click. Show engine identity, measured first-audio latency and an honest unconfigured cloud state.

- [ ] Write render/action tests: preview does not save, Use this voice saves the selected ID, errors are visible, missing engine disables preview, cloud configuration never starts on mount.
- [ ] Run `pnpm exec vitest run apps/web/src/components/VoiceComparison.test.tsx`; observe failures.
- [ ] Implement accessible A/B controls with a single Stop action, fixed shared sample text and no automatic winner. Explain that cloud voice would transmit spoken text and may incur cost; require separate setup rather than fake availability.
- [ ] Rerun tests and web typecheck. Review any future cloud adapter against current official provider documentation before proposing credentials or transmission.

## Task 3: Playback and hardware verification

**Files:** extend `docs/verification/intelligent-notch-teaching-2026-10-02.md` with voice measurements and device coverage.

- [ ] Run full tests/typecheck/build and record output.
- [ ] Test both local voices with the same passage, report cold/warm first-audio latency and gaps between already-buffered segments. Target no unintended gap over 250 ms; distinguish synthesis stalls from playback stalls.
- [ ] Verify rapid switching, Stop, incoming speech and leaving Settings during playback.
- [ ] Test built-in speakers/mic and AirPods when available, including disconnect/reconnect. Do not change system defaults or grant permissions without authorization. Mark unavailable hardware untested.
- [ ] Let the user choose the preferred voice; do not select a winner on their behalf. Report cloud voice as unconfigured unless explicitly authorized and independently implemented.

## Self-review

This plan implements the approved local-first comparison and the cloud-consent boundary, not a cloud provider deployment. Every review-focus failure has a test or native acceptance step. Hardware and audio quality are not proven by unit tests alone.
