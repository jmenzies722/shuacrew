# Hover-first notch

- Pointer exit schedules collapse after 450 ms. Re-entry cancels it; an active media drag defers it until the drag ends. Unmount cancels pending work.
- Drafts, active requests, approvals, and architecture lessons no longer pin the expanded notch open. Collapse does not stop voice or clear the draft. The small status/waveform remains available.
- Architecture arrival no longer opens the full hover body. Hover shows a compact title/summary and Expand diagram, which uses the existing Visual teaching destination rather than embedding the full graph in the notch.
- Diagram cards and nodes use charcoal surfaces; the teaching canvas is up to 960 px wide.
- `tsc --noEmit -p apps/web`: passed.
- Focused Vitest (notch-hover, ArchitectureCard, notch-lesson, LiveMode): 4 files, 11 tests passed, including delayed collapse, re-entry cancellation, and drag completion.
- Vite build: succeeded; existing chunk-size warning. `git diff --check`: passed.
- `curl` plus `cmp` against dist index: gateway serves the current build.
- Restarted idle app; screenshot confirmed compact call layout and waveform with no repeated Connecting label.
- Native pointer automation could not complete a reliable hover-exit cycle: the window changed before the coordinate action. Physical pointer re-entry/exit still requires user confirmation. No claim of end-to-end native hover verification.
