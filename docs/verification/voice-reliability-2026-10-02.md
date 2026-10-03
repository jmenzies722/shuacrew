# Voice reliability — October 2, 2026

## Reproduced and fixed

1. A failed microphone reacquisition removed the device-change listener, so reconnecting later did not restore listening. Listening intent and device observation now persist through a temporary acquisition failure until explicit stop.
2. Audio graph initialization failures escaped the capture error handler and retained the opened microphone. Setup failures now release capture and report an error.
3. Queued when-quiet callbacks could run after stop or disposal. Stop/disposal now cancel polling timers and invalidate callbacks.
4. Two cancelled, unresolved decodes occupied both generation slots and blocked replacement speech. Generation accounting is now scoped to the active abort signal; stop releases the old generation slots.
5. Disposing active playback could receive a late ended event that recreated an idle timer. Disposal detaches that callback before stopping the source.

Each fix had a failing regression test before its implementation. Additional passing coverage checks contiguous sentence scheduling despite reversed generation completion and 100 microphone disconnect/recover/stop cycles. These use simulated browser audio/device boundaries, not physical AirPods.

## Verification

```text
pnpm test
Test Files 188 passed (188)
Tests      886 passed (886)
Start at   12:55:58
Duration   10.77s

pnpm --filter @shuacrew/web exec tsc --noEmit
[no output, exit 0]

pnpm --filter @shuacrew/web build
✓ built in 736ms

git diff --check
[no output, exit 0]
```

Node localStorage-path warnings and the production large-chunk advisory remain; neither failed validation.

## Real local synthesis check

Read `/api/speech/status`: ready; voices report the Kokoro engine. Sent three short, fixed, non-personal samples to `/api/speech/synthesize` with Michael at speed 1. Validated response identity, audio chunks and terminal completion. Did not play these requests through an output device or change saved preferences.

| Request | First audio chunk | Total response | Audio bytes | Complete |
| --- | ---: | ---: | ---: | --- |
| First observed request | 6378 ms | 6398 ms | 505244 | Yes |
| Second | 550 ms | 566 ms | 456044 | Yes |
| Third | 568 ms | 590 ms | 475244 | Yes |

The first request was consistent with cold-engine startup, but startup itself was not instrumented. These are server-generation timings, not end-to-end audible latency or proof of gapless hardware output.

## Pending hardware acceptance

User was asked whether AirPods are connected and available, whether to use speakers, or whether to limit this pass to automation. No device selection had arrived when this report was written. The build is ready; the running native notch has not been restarted for this pass.

Next: safely restart ShuaCrew, play a fixed sample, listen for dropouts, disconnect/reconnect AirPods during voice mode, verify recovery and explicit Stop, and check that no old reply resumes. Record the actual device route and user listening result. Do not label physical recovery verified until this is done.

No measured Enter p95 or long-duration native memory soak in this pass. No model-provider, voice-preference, system-device, or cloud-service settings changed. No commits or pushes.

## Mac-speaker test follow-up

User selected Mac speakers. `system_profiler SPAudioDataType` reported MacBook Pro Speakers as Default Output and Default System Output, with MacBook Pro Microphone as Default Input; both at 48000 Hz. No device setting was changed.

Restarted the idle native application via its Quit menu; verified no native process remained before relaunch. Discovered that the gateway listening on port 7420 now has its working directory at `/Users/admin/Developer/projects/shuacrew-live/apps/gateway`. Its served entry bundle (`index-Cp26YKQ-.js`) differs from this checkout's built entry (`index-Bbt63qtH.js`). Thus this restart did NOT deploy or validate the fixes in this checkout. Did not overwrite or switch the separate live checkout.

In the live app's Settings → Shua companion → Voice → Hear every voice, clicked Hear Puck (the already-selected voice). Observed Loading followed by Playing on this Mac. No voice preference was changed and the audition does not start the microphone. User listening confirmation is pending. This is a baseline playback test of the live checkout, not acceptance of the patched queue/device-recovery implementation.
