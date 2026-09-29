# Crew Rooms visual refinement — 2026-09-25

User approved: preserve existing ShuaCrew palette, accent, typography and compact navigation; conversation-first room layout, cleaner searchable rooms, shared composer, member identities, collapsible real-work inspector, Chat/Activity controls at narrow widths. No mock activity or new theme.

Implemented in the existing Mac app's served interface, not a separate application:

- Conversation hierarchy and member glyphs; shared `composer-box` surfaces and appearance tokens.
- Room search, active-room styling, truthful room counts and existing-room welcome copy.
- Collapsible inspector, observed task counts, real assignment connections, current tool/check/file evidence and original-run inspection links.
- Request-history selector; previous delegation can be inspected independently of the latest request.
- Long task disclosure preserves original text; missing source sessions are explicitly unavailable, not fabricated queued work or dead links.
- At <=1050px Chat/Activity replace competing columns. At <=650px room navigation becomes horizontal while search remains visible. Density, reading-size and reduced-motion preferences retained.

Evidence:

- State regression RED missing counts/history selection → GREEN; `pnpm exec vitest run apps/web/src/lib/room-view.test.ts apps/web/src/lib/room-submit.test.ts`: 6 passed.
- `pnpm test`: 58 files, 321 tests passed. `pnpm typecheck`: exit 0 after correcting a missing test-fixture room field.
- `pnpm --filter @shuacrew/web build`: exit 0.
- Native CUA verification on `/Applications/ShuaCrew.app`: existing rooms/history visible; hide/show activity expands/restores conversation; request-history selector shows recorded Claude-to-Codex handoff and one completed specialist; search no-match state and clearing restore rooms; increased native zoom triggers Chat/Activity layout, both controls work; full-task disclosure opens by click and closes with Return, visible focus ring. Zoom restored after testing. No messages sent, decisions granted, members created or histories deleted during visual acceptance.
- Independent read-only review `/root/review_room_redesign`: no Critical, one Important responsive search trap. Fixed by retaining search at <=650px. No second review requested. Reviewer declined rendered/keyboard/native and test execution judgments: owned by main-agent evidence above. Narrowest <=650px rule is code-reviewed, not independently rendered; exhaustive palette/contrast audit remains outside this focused acceptance. Mobile/watch/gateway broader release readiness not implied.

Related reliability repair: archived source sessions previously crashed gateway recovery with `Run already exists`. Isolated reproduction failed before the fix, passed afterward; all 21 room coordinator tests pass. Archive still hides the source session publicly, while internal coordinator history remains durable. Launch agent recovered; health returned `ok:true`, no pending approvals. No archived session was restored or deleted.

No commit or push performed. This closes the approved Crew Rooms design slice, not the entire product-release checklist.
