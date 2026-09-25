# Crew Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native implementation followed by one independent review. Steps use checkbox syntax. Do not commit or push without permission.

**Goal:** Close a supervised side-project workflow from one user request through real cross-provider delegation to inspectable results in the installed Mac app.

**Architecture:** Add durable room and assignment events to the existing store. A room coordinator uses run-authenticated MCP tools to delegate through Supervisor; a room projection feeds groupchat and the live workspace. Existing runtime adapters, policy, worktrees, library and approvals remain authoritative.

**Tech Stack:** Existing TypeScript, Zod, SQLite event log, Fastify, React, SVG and AppKit/WKWebView. No additional agent framework or paid service.

**Spec:** `docs/superpowers/specs/2026-09-24-crew-rooms-design.md` (user approved).

## Global Constraints

- Extend the existing ShuaCrew Mac app; no separate web product.
- Initial limits: one coordinator turn, up to three active children, eight child assignments per user request, and depth one.
- No agent-to-agent endless chatter, fabricated progress, or automatic retry of an uncertain external action.
- Rooms inherit existing deny rules and approval UI.
- Delegation never loosens policy, approves pending requests, grants OS access, or adds credentials.
- Children must not concurrently mutate a shared checkout by default.
- No commits or pushes without separate permission; preserve all existing changes.
- Never access `/Users/admin/Nectar-Work` or `/Users/admin/Developer/work`.
- No claim of general Kiro Crew parity or public-release readiness.

## Review Focus

1. A stale coordinator token after pause/restart must not launch more children (Tasks 2–3).
2. A worker crash between event persistence and launch must not duplicate external actions on recovery (Task 2).
3. Native runtime delegation must not bypass room assignment/depth limits (Tasks 2–3).
4. Concurrent specialists editing one repo must not share a writable checkout (Task 2).
5. Disconnected UI and old completion events must not show stale work as live or repeat summaries (Tasks 2, 4–5).

## File boundaries and interfaces

`packages/core/src/rooms.ts`: browser-safe room types, schemas and pure projection.
`apps/gateway/src/rooms.ts`: durable assignment lifecycle and scheduling.
`apps/gateway/src/room-routes.ts`: validated room HTTP endpoints.
`apps/gateway/src/room-tools.ts`: tool schemas and run-scoped authorization.
`apps/web/src/screens/Rooms.tsx`: room navigation, creation and conversation.
`apps/web/src/components/CrewWorkspace.tsx`: shared event-driven task visualization.
`apps/web/src/lib/room-view.ts`: view-model derivation, without execution side effects.

```ts
type RoomInput = { title: string; coordinator: string; members: string[]; repo?: string };
type AssignmentInput = { requestId: string; memberId: string; task: string };
// IDs are server-generated except requestId, a client-generated UUID for deduplication.
// RoomCoordinator methods are synchronous durable transitions; runtime work is asynchronous.
class RoomCoordinator {
  create(input: RoomInput): RoomView;
  send(roomId: string, requestId: string, text: string, recipient?: string): { runId: string };
  delegate(sourceRun: string, input: AssignmentInput): { assignmentId: string; runId: string };
  pause(roomId: string, paused: boolean): void;
  stop(roomId: string): void;
  retry(roomId: string, assignmentId: string, requestId: string): { assignmentId: string; runId: string };
  recover(): void;
  close(): void;
}
```

### Task 1: Durable room contract and projection

**Files:** Create core `rooms.ts` and `rooms.test.ts`; modify core events/exports.
**Interfaces:** Produces `RoomView`, `RoomInput`, `AssignmentInput`, `foldRooms(events)`.

- [ ] Write literal event-fixture tests: room creation; authorship; one accepted user message; assignment requested/accepted/completed; pause state; reject malformed UUID/member/task; replay gives identical state.

```ts
expect(foldRooms(events).rooms.room1.messages.map(m => m.author)).toEqual(["you", "shua", "eli"]);
expect(foldRooms(events).rooms.room1.assignments.a1.status).toBe("done");
expect(() => AssignmentInputSchema.parse({ requestId: "bad", memberId: "eli", task: "" })).toThrow();
```

- [ ] Run `pnpm exec vitest run packages/core/src/rooms.test.ts`. Expected: missing room behavior fails.
- [ ] Add schemas for `room.created`, `room.message`, `room.paused`, `room.assignment.requested`, `room.assignment.started`, `room.assignment.completed`, `room.assignment.failed`. Each assignment includes room, root request, source run, target member, child run and parent assignment when relevant; depth >1 rejected. Messages include immutable author/source attribution. Projection deduplicates by event sequence and request ID.
- [ ] Run the focused test and `pnpm test`. Expected: all pass; no change to existing run history.

### Task 2: Coordinator and safe child-run lifecycle

**Files:** Create gateway `rooms.ts`, `rooms.test.ts`; modify `runs.ts` and `main.ts`.
**Interfaces:** Consumes Task 1 schemas and existing Supervisor. Produces the class methods above and run-to-room lookup used by Task 3.

- [ ] Build tests with real EventStore/Crew/Supervisor and controlled Runtime. Capture actual RunSpec arguments. Assert policy `ask`, correct selected provider, parent links, independent checkout, idempotent retries and visible completion.

```ts
const first = rooms.delegate(coordinatorRun, { requestId, memberId: "eli", task: "Review the draft" });
expect(rooms.delegate(coordinatorRun, { requestId, memberId: "eli", task: "Review the draft" })).toEqual(first);
expect(() => rooms.delegate(first.runId, { requestId: anotherId, memberId: "rhea", task: "Recurse" })).toThrow();
expect(capturedChild.agentPolicy).toBe("ask"); // derive from persisted run permission, not a mocked field
expect(childWorkingDirectory).not.toBe(coordinatorWorkingDirectory);
```

- [ ] Run `pnpm exec vitest run apps/gateway/src/rooms.test.ts`. Expected: missing coordinator behavior fails.
- [ ] Persist the requested assignment before dispatch with a reserved child ID, and add Supervisor support for launching that reserved ID exactly once. Resume only recorded-but-never-started work after restart; mark interrupted in-flight tasks for review instead of blindly restarting side effects.
- [ ] Child repo work uses a fresh worktree from the room's declared base, not the existing parent-worktree reuse path. For non-repo tasks use separate workspace directories. Preserve all policy roots/denies. Disable native specialist spawning in room runs so tracked room tools enforce depth and limits.
- [ ] Enforce member opt-in, membership, provider availability, current root request ownership, one coordinator active, three children active, eight assignments total, depth one. Paused rooms reject agent delegation; explicit user resume permits queued work. Stop cancels parent and children, records the boundary, and rejects subsequent calls from those turns.
- [ ] Persist child results once using terminal run facts. Summaries only consume user-facing final prose and artifact references, never internal thought or arbitrary instructions from tool output. Deliver one bounded coordinator follow-up after all assignments for the batch settle; interrupted work is not labelled successful.
- [ ] Add crash-injection tests around reservation/launch/result acknowledgement; revoked member/token, simultaneous calls, pause/stop races, provider limits, failed children, stale completions and restart. Expected: no duplicate run or summary, no policy expansion.
- [ ] Run focused test, `pnpm test`, `pnpm typecheck`. Expected: green.

### Task 3: Authenticated room tools and HTTP surface

**Files:** Create `room-tools.ts`, `room-routes.ts`, tests; modify toolserver/server/main.
**Interfaces:** `/api/rooms` GET/POST; `/api/rooms/:id/messages` POST; `/pause`, `/stop`, `/retry` POST; room-specific tool methods `crew_delegate`, `crew_status`, `crew_message`.

- [ ] Write route tests using `app.inject`, and ToolServer tests using real run tokens. `crew_message` may report progress but cannot launch work; `crew_delegate` obtains its source exclusively from the bearer token, not arguments.

```ts
expect((await app.inject({ method: "POST", url: "/api/rooms", payload: input })).statusCode).toBe(403);
expect(await roomTools.call("crew_delegate", input, outsiderRun)).toMatchObject({ isError: true });
expect(await roomTools.call("crew_delegate", input, stoppedRun)).toMatchObject({ isError: true });
```

- [ ] Run route/tool tests. Expected: missing endpoints/authorization fail.
- [ ] Register routes behind existing host/origin/CSRF gates. Validate all IDs/body lengths with the shared schemas; return 400 malformed, 404 absent, 409 paused/busy/conflicting retry. Do not accept a caller-supplied author, permission mode, source run, working directory or runtime credential.
- [ ] Add room-only MCP tool definitions to tools/list and instructions. Bind authorization to current room membership and live coordinator turn on every call; revoked and finished tokens cannot delegate. Non-room library tools retain existing behavior.
- [ ] Run focused tests and full suite. Expected: authorized delegation works; every outsider case leaves the store unchanged.

### Task 4: Crew rooms and shared visual workspace

**Files:** Create `Rooms.tsx`, `CrewWorkspace.tsx`, `room-view.ts`, associated tests/CSS; modify router/Shell/CrewFloor.
**Interfaces:** View model consumes room/run projections and connection state; UI submits explicit user actions only.

- [ ] Test event-to-view derivation: queued, active, approval, failed, idle and disconnected; parent-child edges; selected transcript; no invented progress percentage.

```ts
expect(workspaceView(room, runs, "offline").agents[0].state).toBe("disconnected");
expect(workspaceView(room, runs, "live").edges).toEqual([{ from: "coordinator", to: "child" }]);
```

- [ ] Run view tests. Expected: missing view behavior fails.
- [ ] Implement room creation with coordinator/member choices and optional project scope; a shared transcript with real author attribution; explicit recipient chips for @mentions; task/result cards; pause/stop/retry; existing approval components or APIs with tool input visible before Allow.
- [ ] Add a restrained SVG dependency graph and accessible agent cards beside chat. Show actual tool activity, elapsed time, observed checks/artifacts and status. Clicking opens the child's existing session. Reuse the visualization in CrewFloor without removing useful existing history/filtering.
- [ ] Ensure compact/narrow window fallback, reduced motion, visible keyboard focus, room-empty/disconnected/error states and preserved drafts. Never start a run or microphone merely by opening a view.
- [ ] Run view tests, full tests, typecheck and production build. Expected: green, existing routes retained.

### Task 5: Native verification and one independent review

**Files:** Create `docs/crew-rooms-verification.md`; update parity status with measured evidence only.

- [ ] Run `pnpm test`, `pnpm typecheck`, `swift test --package-path apps/mac`, web build, `git diff --check`. Expected: zero failing checks; record warnings separately.
- [ ] Use existing authenticated providers for one non-sensitive task: coordinator asks the other provider for a short public-text review, gathers result, and reports who did what. Verify run events, author attribution, cancellation and same-room follow-up. Never claim a controlled runtime fixture is live-provider evidence.
- [ ] Inspect installed Mac room UI, real handoff graph, child drill-down, approval details, stop/retry and reconnect. Do not grant OS permissions or approve risky real tools to make the test pass.
- [ ] Dispatch one independent read-only reviewer of the complete room diff plus adjacent voice work, with spec, plan, ledger, tests and remaining gaps. Fix important findings with regression tests; rerun the full suite.
- [ ] Restart only with no active user work; install using existing recoverable backup script only if native binary changes require it. Verify signature and installed interface. No commit/push.
- [ ] Report exact evidence and remaining release gaps. Phone approvals, public signing/notarization, onboarding, updates and provider terms are separate release work, not falsely included in room completion.

## Self-review and release sequence

All approved spec sections map to Tasks 1–5. Phone approvals are next after this
coordinator closes its loop, with a separately approved Telegram/iMessage choice
and explicit credential setup. Usage is reported as observed tokens/limits;
subscription inclusion is not represented as zero economic cost. Public release
requires current provider-policy review, signing/notarization/distribution,
onboarding, backup and update testing. Further terminal/theme expansion is paused.

Recommended execution remains native implementation in this session, then one
independent review: the durable scheduler, tool authorization and UI share tight
interfaces. The written plan awaits user review before room implementation.
