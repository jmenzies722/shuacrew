# Notch, Studio and workspace polish

## Implemented

- Rooms and Learning Coach use static layered card illustrations instead of animated purple orbs.
- Rooms textarea no longer inherits the extra inner purple focus rectangle; the composer retains its outer focus indicator.
- Normal model prompts clear the submitted draft before context/model requests finish. Failed requests can restore it without overwriting newer edits. Typed notch focus prefetches Mac context.
- Non-music questions wait at most 150 ms for optional playback context; omitted context does not invent playback status. Model selection and explicit music questions retain their existing quality/freshness behavior.
- Loaded run history is copied once per run per stream batch, rather than once per event. Stored events and ordering are preserved.
- Studio exposes existing native Apple Music actions: song/artist lookup, playlist playback, play/pause, previous/next and catalog browsing. Errors and native requirements remain visible. This is control of Music, not importing protected audio.

## Verification

- `pnpm exec vitest run`: 183 files, 865 tests passed.
- `pnpm --filter @shuacrew/web exec tsc --noEmit -p .`: exit 0.
- `pnpm --filter @shuacrew/web build`: passed, existing large-chunk warning remains.
- `git diff --check`: exit 0.
- Native UI: Rooms replacement rendered; focused composer has no inner rectangle. Learning Coach opened. Studio exposes enabled native music controls and an honest no-track-reported state.
- Navigation smoke check: Sessions, Today, Team, Rooms, Crew HQ, Studio, Ventures, Playbooks, Specs, Board, Schedules, Library, Memory, Learning, Visual teaching, Tools & Skills, Policy & Audit, Insights, Terminal, Guide and Settings opened. Terminal initialized without running a command. No visible load-error banners in the checked routes.
- A synthetic Node benchmark of 20,000 existing events plus a 250-event batch, averaged over 30 iterations: old repeated spread 19.26 ms/batch; grouped append 0.05 ms/batch. This is an algorithm benchmark, not an end-to-end notch latency measurement.
- Native process sample before changes: physical footprint 103 MB, peak 157.3 MB. A two-second sample cannot establish long-session memory stability.

## Limits

- Real Apple Music playback/account authorization has not been tested; no music was started and no new permissions were granted.
- Navigation checks do not prove every mutating operation works.
- Physical Enter-to-paint latency, audio/device recovery and an extended memory soak remain unverified. No zero-lag or leak-free claim.
- The native notch must load the updated web bundle; restarting ShuaCrew refreshes its separate webview, whereas Cmd-R refreshes only the main window.
