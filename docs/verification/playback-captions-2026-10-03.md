# Playback captions and quiet waveform

User clarified that Fenrir speaks after a delay, rather than remaining silent.

- Speech status endpoint returned ready. A local Fenrir synthesis diagnostic returned HTTP 200, 74,444 audio bytes, and done in 0.178 seconds. This is synthesis timing, not end-to-end voice latency.
- Call start now unlocks the local playback context before awaiting microphone/network setup.
- The live notch uses audio-playback captions for assistant text instead of displaying incoming model text ahead of the voice. Full chat retains streamed text.
- Playback captions also publish Speaking directly. Waveform sensitivity uses square-root scaling and finer level updates so quiet audio is visible; silence still has no simulated audio energy.
- Added failing regression tests for playback initialization/caption timing and quiet waveform visibility, then implemented fixes.
- Web suite: 127 files, 527 tests passed. Typecheck, build, and diff check passed. Gateway index matches built index.
- Reloaded the app after the user's call became idle. Diagnostic request appeared in conversation and received “Shua is ready.” A screenshot showed visible waveform bars; these were in Listening state and do not prove speaker-output animation. Ended diagnostic call and verified Talk off; no diagnostic draft remains.
- Audible smoothness and speaker-output animation still require the user's confirmation. No claim of zero latency or measured end-to-end improvement.
