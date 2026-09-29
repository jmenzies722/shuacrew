# Visual Teaching Implementation Plan

> Implement in this session, preserving the user's current changes. No commits or pushes.

**Goal:** Shared source-grounded teaching with editable vector lessons and capture-bound native annotations.
**Architecture:** Gateway authority, v1 validated core model, deterministic SVG renderer and native overlay.
**Spec:** ../specs/2026-09-27-visual-teaching.md

- [x] Core contract, atomic reducer, revision/user-edit protection, history and persistence tests.
- [x] Runtime native structured output and image input using installed SDK/protocol; cancellation and bounded repair; real SDK end-to-end verification.
- [x] Teaching routes, shared client session, source input and model picker; integrate main app and companion.
- [x] Vector layout/editor, step navigation, pan/zoom/fit, save/load and undo/redo.
- [x] Capture provenance, coordinate transforms and native click-through annotation lifecycle.
- [x] Regression/type/build/Swift tests; native UI verification and explicit capability/verification report.

Review focus: concurrent edits during model generation; malformed references; long/unbroken labels and cycles; stale capture after display/input change; unavailable pinned model without silent fallback.

Verification details and remaining hardware checks: ../../verification/visual-teaching-2026-09-27.md. Native live overlay/multi-display validation remains untested, as recorded there.
