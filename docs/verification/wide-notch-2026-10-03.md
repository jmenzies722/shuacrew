# Wider compact notch — 2026-10-03

- Call preparation raises the native panel without opening full chat. Fn tap explicitly dismisses full chat and toggles the compact notch.
- Mic/local-voice levels drive nine waveform bars; connection/work states pulse, respecting reduced motion.
- Expanded notch flare is 220 points; call body is capped at 150 points. Chat is 720 × 500 points; wide chat is 940 × 560.
- `tsc --noEmit -p apps/web` and `git diff --check`: passed.
- Focused Vitest: LiveMode, live-session, live-voice — 3 files, 18 tests passed.
- `swift test`: 89 tests passed. `swift build -c release --product ShuaCrew`: succeeded with existing warnings.
- Vite build succeeded with chunk-size warning.
- Signed app installed; strict codesign verification and staged/installed executable comparison passed. Served HTML matches final dist index.
- UI test: Talk opened compact notch, not full chat; accessibility reached Listening with waveform controls. Screenshot confirmed wide, shallow call layout. Final follow-up removes repeated idle status text and makes Fn tap explicitly compact.
- Physical Fn key and audible waveform movement still need user confirmation; no claim of hardware-key verification.
- Prior app retained at `~/.shuacrew/app-backups/ShuaCrew-wide-notch-20261003-012931.app`.
