# Shua native realtime voice

## Intent and approval

The user chose native realtime speech over preserving Fenrir and approved the
in-chat design: one voice, Fn hold-to-talk, explicitly enabled continuous Talk,
interruptible playback, audio-driven visualization, and visible failures without
a hidden second-voice fallback. This document expands that approved direction for
review before implementation. It does not report a shipped voice upgrade.

Subsequent user clarification: use the connected subscription only, with no
separate API credentials/billing and no reconnect-on-interruption workaround.
The user approved continued investigation and end-to-end implementation within
those constraints. A missing RPC alone must not be treated as proof that native
in-call interruption is unavailable; test the existing media connection.

Success means removing local text-to-speech from Shua's selected native voice
experience without sacrificing microphone control, truthful tool results, or
existing action approvals. Network and model latency still exist; zero latency
and exact word-level caption timing are not promised.

## Current implementation

- `apps/web/src/lib/live-voice.ts` negotiates WebRTC but mutes its remote audio.
  Assistant transcript events drive `LiveNarration` and a local `SpeechQueue`.
  The visualizer measures that local queue instead of remote audio.
- `apps/gateway/src/live.ts` already requests Codex app-server realtime v3 with
  audio output. Spoken inserts use `thread/realtime/appendSpeech`.
- `apps/web/src/lib/live-session.ts` owns the call and relays its state to other
  windows. It currently records live failures for classic fallback eligibility.
- `apps/web/src/screens/Buddy.tsx` sends Fn through classic capture, separately
  from Talk, and ignores hold/release while a call is active.
- `LiveVoiceSelect` currently selects a local voice, not the native voice used
  in the realtime start request.

## Approach and alternatives

Use the existing authenticated Codex realtime transport first. Keep a single
call owner and one output stream across notch and full chat. This avoids adding
a second service and preserves the existing task and approval integration.

A direct public OpenAI Realtime API integration is a separate alternative if the
installed transport cannot support the required controls. It needs a separate
credential/billing decision and is not an automatic fallback. Keeping Fenrir's
text-to-speech pipeline is rejected for this mode because it retains the extra
generation stage the user wants removed.

## Behavior

### Audio and ownership

- In native mode, remote WebRTC audio is the sole spoken output. Local TTS must
  not read replies, command announcements, approval prompts, or task results.
- Stop any local playback when entering native mode. Settings previews and
  background notifications must not create another voice during native playback.
- Keep the existing single owner and call identity across app surfaces. Stale
  events from an ended or replaced call cannot restart sound or update captions.
- Voice settings expose validated native voice choices. Changes apply to the
  next connection and say so; no misleading Fenrir selection for native mode.

### Microphone lifecycle

- Fn tap remains a notch interaction, not a continuous-listening toggle.
- Fn hold starts a push-to-talk turn. Release closes the microphone gate
  immediately, even if connection setup is still pending. Input captured after
  release must never reach the service. Cancel discards the pending utterance.
- First-connection capture is bounded to 30 seconds in memory. Preserve audio
  from the accepted hold gesture while connecting; discard it on cancel, timeout,
  or error. Never persist microphone buffers to disk.
- After release, the response can continue playing while the microphone remains
  closed. Distinguish ready/mic-off, connecting, listening, working, and speaking
  in UI state; an open connection alone does not mean listening.
- Only an explicit Talk action enables continuous capture. Fn during Talk does
  not disable or accidentally re-enable that explicit mode. End Talk stops input
  and closes the call. Switching to push-to-talk closes continuous capture first.
- If the transport needs an input clock during output, use generated audio only,
  never ambient microphone input disguised as a muted microphone.

### Interruptions and narration

- A new push-to-talk turn or detected speech in Talk stops old output promptly.
  Explicit Stop also discards queued spoken inserts and clears speaking state.
- Coordinate local playback suppression with a verified transport cancellation
  mechanism. Do not resume buffered old audio or old transcript deltas afterward.
- Queue one purpose announcement per command identity in execution order, through
  the same native voice. Preserve honest wording such as “Eli requested to run
  the tests”; announcing a request is not evidence of execution or success.
- Announcements wait for user speech and current playback, never interrupt an
  approval question, and are cleared on explicit Stop or call end. Historical
  commands are not replayed on reconnect. Surface undelivered announcements in
  the activity feed instead of claiming they were spoken.
- Keep tool-result verification and approvals unchanged. Interrupting speech is
  not proof an already-dispatched Mac action was undone; retain truthful status.

### Captions, visualization, and failures

- Measure remote audio for the speaking waveform and gated mic input for the
  listening waveform. Smooth levels with short attack/release, retain silence,
  and clear levels on interruption, disconnect, or end. No fabricated pulse.
- Use available audio/transcript identifiers and playback events to associate
  captions with the current spoken turn. Do not display a completed answer as
  though it has already been spoken. Without timing metadata, use turn-level
  captions and disclose that exact word alignment is unavailable.
- Preserve the stationary notch, readable short status, and hover-collapse
  behavior. Fn must not open the full chat window.
- Playback permission failures, mic denial, unsupported protocol, setup timeout,
  and disconnect produce actionable visible errors. Native mode never silently
  changes to Fenrir. Typed interaction remains available without requiring mic
  permission or starting a hidden listening session.

## Transport feasibility gate

Before changing the default, inspect the installed app-server schema and verify
actual events for turn boundaries, cancellation, microphone gating, and spoken
insert completion. Public Realtime API event names must not be assumed to exist
on the Codex transport. Record the installed version and verified capabilities.

If any required operation is unsupported, stop rollout and report the specific
gap. Do not simulate reliable cancellation by briefly muting and unmuting audio,
send undocumented RPCs, or silently introduce the public API. This gate is part
of implementation, not a claim that the current transport already supports it.

## Verification and rollout

1. Add failing tests for sole output ownership; native voice selection; Fn
   hold/release/cancel during connection setup; capture off after release;
   interruption and stale events; narration ordering; and explicit error state.
2. Add gateway tests for the verified protocol controls and failure propagation.
   Test transcript/remote-level behavior without constructing local TTS.
3. Run focused tests, web/gateway typechecks, and the full suite. Report commands
   and their outputs. Unit tests do not prove audible playback or hardware keys.
4. Build the web assets with a reversible backup. Do not bundle unfinished native
   autonomy changes or restart an active call/task. If a native bridge change is
   necessary, isolate it and review the deployment scope before installation.
5. In the installed app, test short and long replies, repeated Fn release,
   interruption, purposeful command announcements, both app surfaces, and a
   connection failure. Ask the user to confirm physical Fn behavior and audibility
   where automation cannot measure them.
6. Measure release-to-first-audible-output and interruption-to-silence across
   repeated turns, separating cold startup from warm turns. Report observations,
   not an unmeasured latency promise. Do not declare rollout complete with a
   missing physical microphone, speaker, or cancellation check.

## Non-goals

No broader autonomous Mac permissions, policy bypass, session deletion changes,
new billing integration, native autonomy deployment, commits, or pushes. Existing
uncommitted work remains intact. The earlier session/title work is not treated
as deployed or verified by this voice design.
