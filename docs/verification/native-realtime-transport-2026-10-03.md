# Native realtime transport gate — 2026-10-03

## Outcome

Not ready for the approved end-to-end rollout. New synthetic-audio probes confirm
that the existing subscription-backed connection can yield to spoken input and
answer a follow-up without reconnecting. Immediate explicit Stop and reliable
stale-output suppression are still unverified. The earlier missing-RPC finding
does not establish that natural in-call interruption is unavailable.

## Local commands and output

```text
$ codex --version
codex-cli 0.154.0

$ codex app-server generate-json-schema --experimental --out /private/tmp/shua-realtime-schema.xAOPNb
exit 0
```

Generated `ClientRequest.json` enumerates these realtime methods:

```text
thread/realtime/start
thread/realtime/appendAudio
thread/realtime/appendText
thread/realtime/appendSpeech
thread/realtime/stop
thread/realtime/listVoices
```

Schema inspection with Node produced:

```text
Per-reply cancel RPC declared: false
ThreadRealtimeStopParams: {"threadId":{"type":"string"}}
ThreadRealtimeAppendSpeechResponse: {}
```

`ThreadRealtimeTranscriptDeltaNotification` provides threadId, role, and delta,
not a playback-completion marker. Canonical item notifications exist, but their
commit is not evidence that a remote audio buffer has finished playing.

The WebRTC data channel is separate from these RPC schemas. Its controls cannot
be declared unsupported solely because an RPC is absent. No undocumented event
was sent and no live user call was interrupted to probe the protocol.

## Official documentation checked

- [Managing GPT-Live sessions](https://developers.openai.com/api/docs/guides/live-conversations): transcript fragments have approximate session timestamps, not completed-turn identifiers. Microphone mute has an acknowledgment but does not stop output.
- [Server-side controls](https://developers.openai.com/api/docs/guides/voice-server-controls): instructions can redirect speech; an instruction acknowledgment is not a playback-resume signal. Applications own output suppression and stale-audio recovery. Output silence alone does not establish answer completion.
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations): the separate Realtime API documents push-to-talk with response cancellation and output-buffer clearing. Those event names must not be assumed to work on the app's Codex v3/Frameless transport.

These sources support investigating a separate Realtime API adapter, not silently
changing the user's provider or billing. They do not verify the installed app's
physical microphone, speakers, or Fn behavior.

## Why rollout stops here

The approved spec expressly requires a verified cancellation mechanism and
forbids temporarily muting and later replaying stale output. Simply unmuting the
remote track and removing Fenrir would not meet that requirement. A timer or
silence detector cannot prove that old speech will not resume.

## Previously considered alternatives — rejected by the user

1. Keep the existing connection and use a hard session end on explicit Stop or
   interruption, followed by a fresh connection. This gives a clear local audio
   boundary but changes seamless barge-in, adds reconnect latency, and can end
   live work. It is not the approved smooth in-call interruption design.
2. Build an adapter for the public Realtime API's documented push-to-talk and
   output-buffer controls. This requires a separate API credential/billing
   decision, and still needs app-level implementation and hardware verification.
3. Retain the current transport while obtaining and testing a supported in-call
   cancellation/recovery contract from its provider.

The user rejected both public API migration and reconnect-on-interruption.
Continue only on the connected subscription, with the same media connection.

## Isolated live probes

Added `scripts/probe-native-live.ts`. It creates synthetic audio with macOS `say`,
uses headless Chromium and the existing gateway `LiveVoice` negotiation, and
stores only synthetic transcripts and measured remote audio levels in a temporary
artifact. No physical microphone acquisition, active-app connection, or new key
is used. The isolated gateway retains the two sealed-folder denies. This is an
opt-in subscription-usage probe, not a unit test or an audible hardware test.

Commands:

```text
node node_modules/tsx/dist/cli.mjs scripts/probe-native-live.ts --subscription-probe
node node_modules/tsx/dist/cli.mjs scripts/probe-native-live.ts --subscription-probe --text-stop
```

Observed trials:

| Trial | Observed behavior | Connection/result |
| --- | --- | --- |
| Spoken interruption 1 | Counting yielded and the assistant transcript changed to Amber | Media disconnected; later question unanswered. Not a passing end-to-end trial. |
| Spoken interruption 2 | Counting yielded to Amber; later “two plus two” received Four | Same connection remained connected; probe exit 0. |
| Text-directed interruption | App-server appendText changed counting to Amber; later question received Four | Same connection remained connected; probe exit 0. Not immediate Stop: transcript still contained counting after the stop request. |

Evidence logs:

- `/private/tmp/shua-native-probe-output.log`
- `/private/tmp/shua-native-probe-output-2.log`
- `/private/tmp/shua-native-probe-text-stop.log`

Each log gives its full `result.json` artifact path with timestamps and remote
RMS samples. In spoken trial 2, first measured response audio occurred 5,093 ms
after synthetic input ended. In the text trial it was 2,351 ms. These cold-call
observations do not support an instant-response claim. Transcript timestamps are
not word-accurate playback timestamps and were not used to claim audible wording.

Actual v3 data-channel events included `turn.created`, `turn.delta`, `turn.done`,
and `output_transcript.added`. These are observed on this connection; they must
not be replaced with newer public GPT-Live event names. `turn.done` alone is not
proof the browser has drained playback.

The first probe initially returned exit 0 based only on startup/interruption.
Its disconnected/unanswered follow-up was identified as a failure; the harness
now also requires Amber, the later answer, and a connected final media state.
That exit status is still a smoke check, not a certification of immediate Stop
or semantic correctness of audible speech.

## Reliability fix from the investigation

`LiveCall` previously ignored a persistent WebRTC `disconnected` state and could
remain visibly listening. Added a five-second grace timer: transient recovery
keeps the same call; a persistent failure releases the microphone and surfaces an
actionable error. It never initiates an application reconnect. This does not
change the voice engine or resolve interruption.

Red: the new persistent-disconnect test failed against the previous behavior.
Green: `node node_modules/vitest/vitest.mjs run apps/web/src/lib/live-voice.test.ts --maxWorkers=2`
reported 12 tests passed. `node node_modules/typescript/bin/tsc --noEmit -p apps/web`
exited 0.

Full validation: `node node_modules/vitest/vitest.mjs run --maxWorkers=4` exited 0:
216 test files and 1,007 tests passed in 22.40 seconds. Existing Node
`--localstorage-file` warnings remain. Log:
`/private/tmp/shua-native-investigation-tests.log`. `git diff --check` passed.

No new key was created or read. No production audio switch was enabled. No
deployment, restart, commit, or push occurred. The live disconnect fix is in source
only; the installed app remains unchanged. Remaining gates are immediate output
suppression and safe resume, Fn release/cancel races, one-voice ownership across
all surfaces, and installed-app/hardware verification.
