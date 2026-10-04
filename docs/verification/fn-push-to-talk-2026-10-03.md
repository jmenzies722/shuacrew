# Fn push-to-talk

- Root cause: Fn hold started Live, and the active-call branch ignored release. Replaced it with explicit warm/press/release capture routing; only Talk starts the persistent call.
- Fn hold keeps the notch compact, protects capture from UI preference effects, and does not enable the background conversation preference. Existing explicit Live calls are not interrupted by Fn.
- Release keeps the existing 300 ms final-syllable tail, then stops microphone tracks before awaiting transcription. The captured request still completes and can receive a Fenrir reply.
- Regression tests were observed failing before implementation: missing Fn capture routing, and a microphone remaining open during pending transcription.
- Focused capture tests: 20 passed. Full web suite: 530 passed. Typecheck, Vite build, and diff check passed.
- App was idle before restart; served index matches the new build. Physical Fn press/release remains a hardware verification step for the user.
