# Execution ledger — intelligent notch teaching and voice comparison

Approved plans: `docs/superpowers/plans/2026-10-02-notch-teaching.md` and `2026-10-02-notch-voice-comparison.md`.

Ruling: implement in the existing feature branch without creating a worktree — approved native execution builds on extensive uncommitted app work that must remain intact. No commits or destructive git operations.

Pre-flight: normalized lesson IDs feed layout, narration and history; narration metadata extends existing queue options compatibly; voice comparison owns a separate queue and never changes saved preferences during preview.

Ruling: legacy public lesson shape remains assignable; normalization supplies versioned IDs and metadata. Existing saved cards and call sites must not break.

Task 1: parser/legacy tests observed RED then GREEN (14 parser/visual tests). Structural arrays reject overflow; sources restricted to HTTP(S).

Task 2: layout/card tests observed RED then GREEN. Connected SVG routes include cycles and disconnected nodes; manual paths include immediate boundary neighbors only.

Task 3: narration identity tests observed RED then GREEN (7 narration/session/queue tests). Playback callbacks carry revision/step identity. Narration splits long steps to respect the existing 600-character speech request limit.

Task 4: bounded session tests include 100 revisions, stale update rejection and dismissal. Buddy integration complete, native verification pending.

Task 5: prompt test RED then GREEN. Updated conflicting legacy SYSTEM DESIGN guidance and bumped rule version. Live model/content evaluation pending.

Voice tasks 1–2: comparison/controller tests RED then GREEN; existing local service only, no cloud provider. Preview has an owned queue and cancellation generation; cross-window voice activity cancels preview. Voice choice requires an explicit click.

Ruling: narration begins after model work finishes and listening/approval clears — no interruption of the user's speech, at the cost of later audio start than speculative narration.

Review fix pass: corrected skip-edge routing, reset isolation, lesson-owned dismissal, missing-engine previews, and content-sized nodes. Distinct narration steps with identical words retain separate playback identities. Follow voice retains the last audible step after playback ends.

Native testing exposed two additional issues: prompt keywords could override Screen off, and visual delivery was gated on the window owning execution. Removed implicit screen enabling; architecture-only rendering now follows shared messages without executing action blocks. Native lessons open in the notch and remain until dismissed. Added fit-to-view/explore controls and compact notch spacing. Directed cycles retain readable forward ranks rather than collapsing into a single tall column.

Verification: `pnpm test` at 12:07:56 on October 2: 188 files, 878 tests passed. Web TypeScript passed; production build completed in 935 ms; `git diff --check` produced no output. Native restart confirmed using process absence before relaunch. Actual `/buddy` notch screenshot verified fitted six-node architecture; Playback delivery filtered to viewer, CDN, and private storage. Screen-off remained off during the successful test submission. Details and remaining acceptance gaps are in `intelligent-notch-teaching-2026-10-02.md`.

Status: implementation and live notch rendering verified; full acceptance remains partial for physical audio, measured latency, long-duration memory, theme/reduced-motion coverage, and broader live follow-up evaluation. No universal performance or audio-quality claim.
