# Chat, transcription and cursor routing repair

## Reproduced causes

The reported TextEdit request reached `spark_screen`, which returned a refusal with status completed and no action receipts. The companion prompt contained both native act/do instructions and the conflicting sentence “Use tools only to read an attached screenshot.” The voice's specific-word check treated `Command-N` versus `Command–N`, and TextEdit versus transcribed “text edit,” as potentially unsupported claims. Finally, the voice-call CSS hid nearly every direct child of the notch body, including native action-approval controls.

## Changes

- Removed the contradictory screenshot-only instruction, explicitly distinguished the native action bridge from the model shell, and advanced the rules revision so saved conversations receive refreshed instructions. Current control mode and Accessibility status are included on every turn. Existing permission enforcement remains authoritative.
- Obvious desktop action requests with no execution receipts return unavailable instead of completed.
- Normalized punctuation/word boundaries for the voice's name-specificity check. Regression reproduces the reported TextEdit/Command-N correction.
- Combined backend results and their spoken paraphrases into one assistant reply per user turn. Updated results have a short label rather than replaying the entire earlier reply.
- Added a stable scrollable transcript column with You/Shua labels and partial-transcription labeling. Manual scroll position is retained; new content follows only while near the bottom.
- Kept composer reachable, made approvals and stop/end controls visible during voice, corrected dark-on-dark control colors, and allowed the call panel to grow to fit content. The full chat no longer displays the backend thread beside the duplicate voice conversation.

## Verification

- Before fixes: three regression tests failed (prompt contradiction, punctuation/name correction, false completed status).
- `node node_modules/vitest/vitest.mjs run`: 229 files / 1057 tests passed before the final two UI/follow-through tests. `/private/tmp/shua-chat-cursor-suite.log`.
- Final affected tests: 5 files / 78 tests passed. `/private/tmp/shua-chat-cursor-targeted.log`.
- Web and gateway `tsc --noEmit`: exit 0, no diagnostics.
- Production Vite build: built in 798ms; existing bundle warning remains.
- Subscription-backed real Codex model probe with execution disabled emitted `do [{"type":"open_app","name":"TextEdit"}]` in 5699ms instead of screenshot-only refusal. This verifies model routing only; it did not open or type into TextEdit. Probe output `/private/tmp/shua-action-model-probe.log`.
- Browser layout fixture used a simulated voice snapshot, without mic access or native execution. Verified two transcript rows for one user message plus duplicate result/voice data. Allow and Deny visible; panel recomputed to 409px height with 377px content. Screenshot `assets/shua-chat-layout-2026-10-03.png`.
- Gateway refreshed only with zero active runs/approvals, then app relaunched to load the new UI. No native binary change needed. No commits or pushes.

Real multi-step TextEdit execution and audible voice behavior still require a live application trial. Do not claim end-to-end cursor reliability from the model probe or simulated layout.
