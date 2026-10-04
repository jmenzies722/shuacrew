# Synchronized Fn captions and fluid visualizer

- Fn replies previously rendered streaming model text before their local audio. When voice is enabled, the notch now suppresses that preview and uses the existing playback caption callback. Muted/text-only replies and completed history remain readable. Full chat still streams text.
- Pending audio displays a compact preparation indicator instead of a detailed Thinking label.
- The Fn speaking meter previously received a constant 0.55. It now samples the actual SpeechQueue output, using the same visualizer as live calls.
- Visualizer uses frame-rate-independent exponential attack (45 ms) and release (150 ms), applies bar transforms per animation frame rather than rerendering the whole app, and cancels its animation frame on unmount. Reduced motion bypasses smoothing. Silence settles to zero energy rather than fake oscillation.
- Regression tests observed failing for caption gating and the new envelope before implementation.
- Full web suite: 129 files, 534 tests passed. Typecheck, build, and diff check passed. Served index matches dist.
- App was idle with an empty draft before reload. Physical Fn audio/text synchronization and perceived animation smoothness still need user confirmation.
