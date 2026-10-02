# Live voice: Codex realtime on the ChatGPT sign-in (P0, 2026-10-02)

Goal: ChatGPT-style live conversation with Shua: barge-in, about 1 s replies, no API key, no new billing.

## What works

- `codex app-server` (0.154 and 0.155.1) exposes `thread/realtime/*` behind `experimentalApi`.
- **v3 ("frameless bidi", model `gpt-live-1-codex`) over WebRTC works on the ChatGPT sign-in.** The call goes to
  `chatgpt.com/backend-api/codex/realtime/calls`. v1 is refused for ChatGPT auth ("AVAS requires quicksilver=v2"),
  and the websocket transport needs an API key.
- Audio flows directly between the page's `RTCPeerConnection` and OpenAI. app-server only negotiates the call
  (SDP offer in `thread/realtime/start`, answer in `thread/realtime/sdp`) and runs a sideband for hand-offs.
- When the voice delegates, app-server runs a normal Codex turn on the thread. The turn's messages are relayed back
  to the voice.

## Measured (headless Chromium, synthetic mic)

| | |
|---|---|
| Simple question, first reply audio | 1.0–1.6 s after the question ended (server VAD included) |
| Call setup to `session.started` | usually 1–2 s; one outlier took 12.6 s, and speech before it was lost |
| Delegated task (read a file), result spoken | 0.3 s after Codex's final message |

## Gotchas that cost the most time

1. **Digital silence freezes the voice.** The frameless model runs on the *input audio clock*
   (`delegation.context.appended` reports `end_ms` in input time). A synthetic mic that goes silent after the
   question stops that clock, so results were never spoken. A real mic always has room noise. Live mixes in
   room tone at about −54 dBFS as a guarantee.
2. **Untagged progress makes the voice guess.** With the default hand-off mode, Codex's preamble ("I'll read
   notes.txt…") was relayed into the delegation, and the voice answered on the spot with an invented result
   ("It's Quartz", "moonlight"). The fix is what the ChatGPT desktop app does: tell the backend to prefix
   messages `[STATUS] `/`[COMPLETE] ` (`realtimeStartInstructions`), map them with
   `codexResponseHandoffChannelPrefixes`, and set `codexResponseHandoffMode: "bemTags"`. Progress then goes to the
   non-speakable commentary channel. 3 of 3 runs were honest once the session had really started.
3. Show "Listening" only after `session.started` on the `oai-events` data channel.
4. `includeStartupContext: false`. The default startup context pulls in unrelated Codex history.

## Safety

The Live thread runs under a Codex permission profile passed with `-c`: `":root" = "read"`, the Live workspace
writable, and every protected folder `"deny"`. This is enforced by the macOS sandbox, verified on a stand-in folder
(`cat`/`ls` → "Operation not permitted"; a model turn refused, citing the policy). Escalations (opening apps,
AppleScript) are server→client approval requests. They are auto-declined if they touch a protected folder,
otherwise shown in the notch.

## Sources

- openai/codex `codex-rs/core/src/realtime_conversation.rs`, `realtime_websocket/*` (rust-v0.154.0, v0.155.1)
- ChatGPT desktop app bundle (`app.asar`): realtime start params, `[STATUS]`/`[COMPLETE]` start instructions
- Codex 0.155 TUI voice: `clientManagedHandoffs` + `appendSpeech` on turn completion (an alternative path)
