# Intelligent Notch Teaching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects delegated execution. Complete tasks in order with failing tests before implementation.

**Goal:** Deliver connected, accurate architecture lessons whose visual steps follow actual narration and survive follow-up questions.

**Architecture:** Extend the existing architecture visual contract and SpeechQueue. Keep diagram layout and lesson state in small pure modules, with Buddy coordinating existing surfaces. Keep local voice comparison in the companion plan rather than coupling provider setup to teaching.

**Tech Stack:** React, TypeScript, SVG, existing Vitest tests, existing native WKWebView bridge and local speech service. No new runtime dependencies planned.

**Spec:** `docs/superpowers/specs/2026-10-02-intelligent-notch-teaching-design.md`

## Global Constraints

- “Limit one overview to 12 nodes and 20 edges; larger architectures use separate views.”
- “Never silently truncate a graph into a misleading diagram.”
- “Do not silently downgrade or change the user's provider.”
- “No commit or push without the user's separate permission.”
- Preserve existing dirty work; never access the user's sealed work directories.
- Research is required before claiming current real-company architecture; a proposed Netflix-like system must be labeled as such.
- Only use the approved native UI automation for UI verification. No live destructive workflows as test fixtures.

## Review Focus

- Unicode/long labels must remain legible without changing node identity: Tasks 1–2.
- Cycles, disconnected components and cross-links must remain truthful, not silently disappear: Task 2.
- Old audio finishing after a follow-up must not highlight the new lesson: Task 3.
- Rapid follow-ups and a dismissed lesson must not resurrect old previews: Task 4.
- Malformed visual blocks must not remove the readable answer or claim verification: Tasks 1 and 5.

## Task 1: Validated lesson contract and legacy migration

**Files:** modify `apps/web/src/lib/notch-lesson.ts`, `notch-lesson.test.ts`, `visual.ts`, `visual.test.ts`; create `apps/web/src/lib/architecture-fixtures.ts` for deterministic proposed-system test data only.

**Interfaces:** retain `ArchitectureLesson` and `parseArchitecture(value): ArchitectureLesson | null`. Add optional legacy-compatible metadata: `version: 2`, `id`, `revision`, `scope`, `assumptions`, `tradeoffs`, `failureModes`, `sources: {title,url}[]`, `followups: string[]`. Nodes gain `role` and `group`; steps gain stable `id` and `edgeFocus`. Use edge IDs rather than array positions. Add `normalizeArchitecture(value: unknown): ArchitectureLesson | null` as the sole legacy/current decoding entry point; legacy IDs are generated deterministically.

- [ ] Write parser regressions: accept 12 nodes/20 edges; reject 13/21 without truncation; reject duplicate IDs, dangling edges/focus references, unsupported source schemes and malformed sources. Preserve Unicode labels. Existing two-node legacy fixture must still render after normalization.
- [ ] Run `pnpm exec vitest run apps/web/src/lib/notch-lesson.test.ts apps/web/src/lib/visual.test.ts`; observe new failures.
- [ ] Implement normalization and structural limits. Bound metadata and text lengths explicitly: title 100, label 80, body 1200, assumptions/trade-offs/failures 8 each, sources 8, follow-ups 3. Reject oversized structural arrays rather than slicing them. No source content is trusted as instructions.
- [ ] Run the same tests; require all pass, including existing fixtures.

## Task 2: Connected responsive diagram

**Files:** create `apps/web/src/lib/architecture-layout.ts` and `.test.ts`, `apps/web/src/components/ArchitectureDiagram.tsx` and `.test.tsx`; modify `ArchitectureCard.tsx`, `ArchitectureCard.test.tsx`, `architecture-card.css`.

**Interfaces:** `layoutArchitecture(lesson: ArchitectureLesson, group?: string): {nodes: {id,x,y,width,height}[]; edges: {id,points: {x,y}[]}[]; width:number; height:number}`. `ArchitectureDiagram` consumes the lesson, optional group, and focused node/edge IDs. Layout output is deterministic and memoized by lesson revision/group, never audio energy.

- [ ] Write tests for connected request paths, directed edge endpoints, cycles, disconnected nodes, long labels and a 12-node streaming overview. Assert every included node and edge has a layout and no node boxes overlap.
- [ ] Run `pnpm exec vitest run apps/web/src/lib/architecture-layout.test.ts apps/web/src/components/ArchitectureDiagram.test.tsx`; observe failures.
- [ ] Implement dependency-free layered layout: group strongly connected components, rank the resulting DAG, stable-sort nodes within ranks, and route cycle/cross edges through separate gutters. Render SVG connectors under accessible HTML component cards. The viewBox grows with content; compact view uses path tabs rather than unreadably shrinking labels.
- [ ] Integrate into ArchitectureCard with overview/path navigation, source links, assumptions and trade-off details; preserve pin/replay/close. Do not mark a diagram factually verified merely because parsing passed.
- [ ] Run layout, diagram and ArchitectureCard tests; verify keyboard labels, text-only explanation and reduced-motion CSS.

## Task 3: Playback-linked narration identity

**Files:** modify `apps/web/src/lib/buddy-voice.ts`, `speech-queue.test.ts`, `components/ArchitectureCard.tsx`; create `apps/web/src/lib/lesson-narration.ts` and `.test.ts`.

**Interfaces:** `NarrationIdentity = {lessonId:string; revision:number; stepId:string}`. Add optional `narration?: NarrationIdentity` to the existing SpeechQueue `say` options, internal Line and CaptionLine. `narrationFocus(lesson, caption): {nodes:string[]; edges:string[]; stepId:string|null}` accepts only matching lesson/revision IDs; label matching remains a legacy fallback, not the new synchronization contract.

- [ ] Add tests proving no highlight at enqueue/generation time; matching playback start highlights the step; stop clears focus; stale revision and late cancelled callbacks cannot affect a replacement lesson. Existing `say(text, {voiceId,speed})` callers remain valid.
- [ ] Run `pnpm exec vitest run apps/web/src/lib/lesson-narration.test.ts apps/web/src/lib/speech-queue.test.ts`; observe failures.
- [ ] Propagate optional identity through the existing queue/caption scheduling without changing sentence order, retry rules or PCM playback. Use explicit step narration for validated lessons; suppress duplicate generic narration of that lesson's same explanation.
- [ ] Add Follow voice/manual navigation state. Manual navigation disables automatic page advancement until explicitly resumed; replay speaks the selected step with identity.
- [ ] Rerun tests and verify voice-off mode exposes all steps without waiting for audio.

## Task 4: Bounded continuity and proactive preview lifecycle

**Files:** create `apps/web/src/lib/architecture-session.ts` and `.test.ts`; modify `screens/Buddy.tsx`, `screens/Teaching.tsx`, `components/ArchitectureCard.tsx`.

**Interfaces:** `ArchitectureSession = {current:ArchitectureLesson|null; history:ArchitectureLesson[]; dismissed:string[]; announced:string[]}`. `reduceArchitectureSession(state, event)` supports receive, previous, dismiss and announce events; revision identity is `${id}:${revision}`. Keep at most 5 lesson revisions and 20 dismissal/announcement identities. `architectureContext(state): string` serializes only the active lesson's bounded structure and assumptions for a follow-up.

- [ ] Write tests for receive/previous, stale-revision rejection, stable component identity, 100 receive/dismiss cycles, repeated completion events and interleaved follow-ups. Assert all caps and deduplication.
- [ ] Run `pnpm exec vitest run apps/web/src/lib/architecture-session.test.ts`; observe failures.
- [ ] Integrate the reducer into Buddy's visual lifecycle. A completed lesson produces a single preview and no forced keyboard focus. Delay preview announcement while listening/transcribing or approval UI is active; dismissal wins over delayed callbacks.
- [ ] Carry architecture context in follow-up prompts, expose up to 3 contextual actions and preserve pinning to Visual teaching. Actions submit only after a click; no automatic tool execution. Show previous revision without regenerating it.
- [ ] Rerun tests and existing companion-history/draft tests. Unmount/dismiss must clear lesson-specific timers/listeners.

## Task 5: Architecture generation and truthful failure handling

**Files:** modify `apps/web/src/lib/visual.ts`, `buddy.ts`, `visual.test.ts`, `prompt-quality.test.ts`, `screens/Buddy.tsx`.

**Interfaces:** the prompt consumes the normalized lesson contract from Task 1 and bounded context from Task 4; it emits a complete `visual` block plus readable explanation. Existing frontier routing remains authoritative.

- [ ] Add prompt regressions requiring scale assumptions, proposed-versus-real distinction, separate content/control paths, step narration IDs, review of graph/explanation consistency and explicit uncertainty when research is unavailable. Assert invalid visuals do not suppress readable text.
- [ ] Run `pnpm exec vitest run apps/web/src/lib/visual.test.ts apps/web/src/lib/prompt-quality.test.ts`; observe failures.
- [ ] Update visual guidance and invalid-block handling. On a bad diagram show a retry action and retain the answer; no automatic retry/model loop. Preserve the selected provider and explicit source citations from actual research.
- [ ] Run tests; manually evaluate a proposed Netflix-like design, a small streaming MVP, “why Kafka?”, “simplify this”, and a deliberate unavailable-source scenario. Review content against the source, not just URL presence.

## Task 6: Measured native acceptance and soak

**Files:** create `docs/verification/intelligent-notch-teaching-2026-10-02.md`; add test-only lifecycle/performance fixtures alongside the owning tests. No persistent logging of prompts or screen contents.

- [ ] Run all focused tests, then `pnpm exec vitest run`, `pnpm --filter @shuacrew/web exec tsc --noEmit -p .`, `pnpm --filter @shuacrew/web build`, and `git diff --check`. Record actual output and unrelated failures separately.
- [ ] Reload the main window and separately restart the notch webview when safe. Verify compact preview, expanded diagram, main-window pinning, keyboard focus, reduced motion and theme variants through native UI.
- [ ] Measure Enter-to-visible-acknowledgment separately from model response time. Target p95 under 100 ms; record sample count and method, not just subjective impressions.
- [ ] Run 100 open/replay/dismiss cycles with test fixtures. Check bounded history, outstanding listeners/timers and retained memory trend after cleanup; distinguish cache warm-up from retained growth.
- [ ] Record known limits and unresolved acceptance failures. Do not call the feature complete if narration sync or the live prompt path remains unverified.

## Self-review and execution

Spec sections 1–4 map to Tasks 1–5, section 6 and acceptance map to Task 6. Voice section 5 is covered by the companion voice plan. All five review-focus cases have owning test steps. No automatic commits are included because user permission is required.

Recommended execution: native in this session, in order, then an independent final review if the user selects that method. Product edits begin after plan review and method selection.
