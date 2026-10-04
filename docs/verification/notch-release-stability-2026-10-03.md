# Fn release stability and cursor/notch readability

- Replaced scrollHeight-plus-two measurement with intrinsic visible row heights, margins, gap, and padding. The previous measurement could depend on the height it had just imposed. Measurements are deduplicated before sending native geometry; row replacement/resizing is observed with cleanup.
- Released Fn now moves to preparation during its final-syllable tail, rather than competing listening/transcribing presentations. Dropped turns, errors, and explicit cancellation clear pending Fn state.
- Collapsed active preview uses one height through listening/preparation/playback. Expanded pulse/caption rows reserve 64 px to reduce jumps. The elapsed timer has reserved space from frame one.
- Raised caption type to 14 px with 1.55 line height, brighter upcoming/past words, and removed fading masks inside the notch. Preparation uses a restrained pulse with existing reduced-motion support.
- Cursor now follows actual Live call states and levels as well as Fn/local speech; intensity uses the same sensitivity curve as the waveform. No new autonomous computer-control permissions or behaviors introduced.
- New tests observed failing before implementation. Full web suite: 131 files, 537 tests passed. Final typecheck, build, and diff check passed. Served index matches dist.
- Idle app reloaded. Physical Fn-release visual stability is not yet confirmed end-to-end; tests establish state/geometry behavior, not perceived native animation quality.
