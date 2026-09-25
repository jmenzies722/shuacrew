# Native conversational voice refinement

Status: proposed written design awaiting review. Not implemented.
Extends docs/shua-voice-design.md; its old Current status section is historical.

## Outcome and architecture choice

Make Shua's existing local-speech/subscription-reasoning loop feel responsive and
interruptible in the installed Mac app. Keep English US/UK curated voices, a male
default, explicit microphone activation and no separate paid voice API. Current
VoiceController releases capture before transcription; this is not full duplex.

Prefer a native AVAudioEngine capture/playback owner with voice processing over
depending solely on browser echoCancellation flags. Hosted speech-to-speech would
change billing and data boundaries; it is excluded. Browser push-to-talk remains
an explicitly labeled fallback when native processing is unavailable. Do not
claim speakers support safe automatic interruption until acoustic tests pass.

API reference: https://developer.apple.com/documentation/avfaudio/avaudioionode/setvoiceprocessingenabled(_:)
API existence is not evidence of this app's measured echo rejection or latency.

## Ownership and state

Native audio owns both microphone input and Shua playback through one supported
voice-processing graph so playback is available to the echo-control path. Never
run WebKit capture/playback concurrently with that owner. The existing controller
owns durable transcript submission, provider work, approvals and cancellation.
Use separate observable capture, turn and playback states; simultaneous listening
and speaking must not be squeezed into one misleading enum.

Restrict native bridge calls to the app's validated local main-frame origin and
an active session generation. Accept typed start/mute/end/playback messages with
strict bounds, not arbitrary URLs, file paths or native selectors. Bind audio to
the active run/session and reject stale generation callbacks. Gateway requests
retain current loopback/auth constraints; no audio tokens in events or logs.

Capture uses a bounded 500ms in-memory pre-roll and up to30-second utterances,
with an 8MiB encoded request limit. Speech detection separates user speech from
energy spikes; detection thresholds use tested profiles, not an exposed expert
slider wall. Endpoint profiles target roughly450/750/1100ms silence, tested for
clipped words and false endpoints. These are tunable targets, not measured results.
No audio is retained beyond processing; temporary data is removed on success,
failure, cancellation and next-launch cleanup after a crash.

During playback, sustained detected user speech stops queued/current audio and
invalidates synthesis generations immediately, then requests provider cancellation.
Capture the new utterance but do not submit until the old turn settles. If cancellation
is uncertain, show that state and retain a bounded editable transcript rather than
starting overlapping work. Tool effects already performed cannot be undone.
Do not trust transcript similarity alone as an echo rejection strategy.

## Performance and speech quality

Instrument capture endpoint, transcription, provider first text, synthesis first
chunk and playback start separately using monotonic timings without transcript
content. Show measured cold/warm results and provider wait time in Developer.
Warm speech dependencies only on explicit voice entry or an opt-in keep-warm
setting. Limit synthesized lookahead to two sentences and20seconds of audio;
discard stale work on interrupt. Release warm workers after configurable2/5/10
idle minutes; default5. Avoid duplicate model processes and unbounded queues.

Continue existing sentence streaming with bounds and natural punctuation; tune
minimum chunk size through measured first-audio time versus audible prosody.
Voice previews use the actual engine and selected voice, not sample substitutions.
No automatic robotic fallback. Offer only voices with verified locale, licensing
and local operation; US voices must not be relabeled British. Missing verified UK
voices remain an explicitly reported gap, not a reason to invent presets.

## Experience and settings

Keep voice within the current conversation. Show selected crew member, actual
capture/playback levels, transcript, concise live-work cards and persistent mute,
interrupt, end-call and separate Stop work controls. Approval state pauses normal
conversation and opens the existing review surface; spoken yes is not authorization.
Spark can react to real voice states but never replaces recording indicators.

Settings: small voice cast with previews, existing personality/pace controls,
push-to-talk/conversation mode, short/balanced/detailed spoken responses, endpoint
profile, interrupt-while-speaking capability, keep-warm choice and a diagnostics
panel with measured timing and audio-route capability. Disable unsupported options
with explanation. Mute releases microphone input; end/close/navigation tears down
both audio directions. Headset unplug, route change and sleep invalidate the graph
and require safe recovery, not silent background recording.

Mac is the initial audio execution target. iPhone may show configured voice identity
but must not display a working Call button without a separately approved realtime
audio transport. CloudKit mailbox delivery is not suitable for pretending to be a
live phone voice call. Watch microphone support remains excluded.

## Acceptance

Unit/integration tests: pre-roll and utterance bounds, false/noisy endpoint cases,
overlapping speech/playback states, cancellation races, stale chunks, reconnect,
provider limits, pending approvals, permission denial, graph failure, route changes,
no audio after mute/end, origin spoofing and resource cleanup. Automated prerecorded
fixtures are labeled test inputs and never represented as user microphone evidence.

Installed Mac tests: actual local inference and authenticated provider response,
engine setup errors, previews and audio controls. Record cold/warm median/p95 stage
timings over a documented script. Target native stop-audio response under150ms;
report actual results and do not promise provider end-to-end response latency.
Physical acoustic gate: speakers and headphones, quiet/background noise, double
talk, interruption without self-triggering and long sessions. User previously
deferred microphone participation: do not activate it on their behalf. Until that
gate passes, label automatic acoustic interruption experimental and keep manual
interrupt/push-to-talk as the reliable path. No claim of full voice completion.
