# Room and Phone Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Grok-inspired room workflow and corresponding native phone experience without weakening supervision.
**Architecture:** Durable queue and contextual references extend existing room events; a versioned signed phone projection carries bounded identities/work/results. Native views remain consumers, never execution authorities.
**Tech Stack:** Zod/TypeScript, EventStore/RoomCoordinator, Swift Codable/CryptoKit, SwiftUI.
**Spec:** `docs/superpowers/specs/2026-09-25-crew-conversation-mobile-design.md`.

## Global Constraints

Inherit master constraints. At most20 pending follow-ups/room,8,000 UTF-8 bytes/request,24h lifetime, one optional routing recipient and one same-room reply. Preserve v1 Watch/legacy phone support,512KiB phone snapshots,50 rooms,16 members/room,50 messages/room,100 tasks and100 result summaries overall. No file transfer, remote shell or additional room scope.

## Review Focus

- Crash between accepted queue event and run creation must not duplicate work: R2.
- Cancel versus dispatch has one serialized winner: R2.
- Protocol downgrade/replay and wrong-room references fail closed: R1/R3.
- Editing a draft while send finishes must retain the new edit: R4.
- Expired approval or queued delivery must never look executed: R3/R4.

### R1: Queue and contextual-reference event contract

**Files:** Modify `packages/core/src/rooms.ts`, `events.ts`, `rooms.test.ts`; create `packages/core/src/room-queue.ts`, `room-queue.test.ts`; export the module in `packages/core/package.json`.

**Interfaces:** Produce `RoomQueueInput {requestId:string;text:string;recipient?:string;replyTo?:string;issuedAt:number;expiresAt:number}` and `RoomQueueEntry` extending it with `state:'pending'|'started'|'cancelled'|'expired'|'rejected';runId?:string`. Produce `validateQueueInput(input,now):RoomQueueInput` and pure event projection for queued/dispatched/cancelled/expired/rejected. Add optional recipient/replyTo to existing messages compatibly.

- [ ] Write the regression and observe it fail:

```ts
const value = {requestId:'00000000-0000-4000-a000-000000000001',text:'next',issuedAt:1000,expiresAt:2000};
expect(validateQueueInput(value,1000)).toEqual(value);
expect(()=>validateQueueInput(value,2000)).toThrow();
expect(()=>validateQueueInput({...value,text:'🙂'.repeat(2001)},1000)).toThrow();
```

- [ ] Run `pnpm exec vitest run packages/core/src/room-queue.test.ts`.
- [ ] Implement strict UUID/text/lifetime validation, event schemas and replay projection. Historical room events still fold identically. Project queue state separately from active turns; queued messages are visible without implying run creation.
- [ ] Test duplicate event replay, invalid transitions,20 pending cap in owner logic, unknown IDs and historical messages lacking optional fields; run core room suites and typecheck.

### R2: Durable serialized room dispatch and cancellation

**Files:** Modify `apps/gateway/src/rooms.ts`, `room-routes.ts`, `rooms.test.ts`, `room-tools.ts`; add `apps/web/src/lib/room-queue-client.ts` and `room-queue-client.test.ts`.

**Interfaces:** Preserve `send` for legacy callers. Add `enqueue(roomId:string,input:RoomQueueInput):RoomQueueEntry`, `cancelPending(roomId:string,requestId:string):'cancelled'|'already-started'|'not-pending'`. Existing recover/reconcile drains validated FIFO when unpaused and prior root/children/summary have settled. Use deterministic run IDs from request UUIDs.

- [ ] Extend the existing `world()` harness in rooms.test.ts:

```ts
it('durably queues behind active work without starting it', async()=>{
  const w=world();
  w.rooms.send(w.room.id,randomUUID(),'first');
  const now=Date.now(), requestId=randomUUID();
  const q=w.rooms.enqueue(w.room.id,{requestId,text:'second',issuedAt:now,expiresAt:now+60000});
  expect(q.state).toBe('pending');
  expect(w.rooms.enqueue(w.room.id,{requestId,text:'second',issuedAt:now,expiresAt:now+60000})).toEqual(q);
  expect(w.rooms.cancelPending(w.room.id,requestId)).toBe('cancelled');
});
```

- [ ] Run `pnpm exec vitest run apps/gateway/src/rooms.test.ts`; record failure before implementation.
- [ ] Implement queue acceptance/cancel as serialized owner operations, validate same-room reply and current member, persist before response, then dispatch on existing scheduling boundaries. Identical UUID retries return original receipt; conflicting payloads fail. A failed/cancelled/uncertain preceding request holds dispatch until explicit resume; stop pauses and retains unexpired queue.
- [ ] Add fault injection before/after each append/run creation, restore coordinator and assert one run.created per deterministic ID. Cover expiry, capacity, scope, missing member, paused enqueue, old archived roots, final-summary races and cancel-wins/dispatch-wins. Preserve existing delegation limits and policy tests.
- [ ] Add explicit enqueue/cancel routes with strict bodies and existing gateway guards. Client preserves pending UUID/body through uncertain response; never silently makes a new ID. Test lost response and conflicting retry.

### R3: Signed v2 projection and command negotiation

**Files:** Create `packages/core/src/mobile-v2.ts`, `mobile-v2.test.ts`, `packages/apple/Sources/ShuaCrewMobile/MobileV2.swift`, `Tests/ShuaCrewMobileTests/MobileV2Tests.swift`, shared literal fixtures under `fixtures/mobile-v2/`; modify mobile authority/projection/routes, pairing and signing modules in TS/Swift, and `apps/mac/Sources/ShuaCrew/MobileBridge.swift`.

**Interfaces:** V2 payloads explicitly carry `version:2`; version-specific signing prefix `ShuaCrew/mobile/v2\n`. Keep existing v1 functions unchanged. Produce `MobileV2SnapshotSchema`, `MobileV2CommandSchema`, Swift `MobileV2Codec.snapshot(_ data:Data)` and `.command(_ data:Data)`; normalize valid v1/v2 into common presentation models. V2 room-message adds recipient/replyTo; queue-cancel binds roomId/requestId. V2 members have id/name/role/color/glyph; work includes request/run/member/source/dependency IDs; results include source IDs, bounded summary, check status and artifact metadata only.

- [ ] Create literal valid v1/v2 and invalid-version fixtures and tests asserting old decoders reject v2, v2 accepts only its strict shape, and missing capability defaults existing pairings to v1. Test same payload signed under wrong domain is rejected.

```ts
expect(MobileV2SnapshotSchema.safeParse({version:1}).success).toBe(false);
expect(MobileV2CommandSchema.safeParse({version:3}).success).toBe(false);
```

- [ ] Run new TS and Swift fixture tests and record RED; implement exact matching strict validators, limits and normalized views. Explicit null fields agree across languages. Bound strings by bytes, not character count.
- [ ] Add signed capability advertisement bound to paired installation/device. Updating capability requires valid authenticated device proof, not a client-supplied unsigned preference. Persist selected version in scoped device registry; never rotate keys as an upgrade side effect. Unknown versions display update-required.
- [ ] Extend allowlisted projections with actual room/member/task/result identities and truthful truncation, excluding mock/incognito/secret-bearing sources. Prioritize current decisions/work before history; cap the serialized envelope. Preserve Watch v1 projection and8KiB budget.
- [ ] Map message acknowledgment to queue acceptance and cancellation acknowledgment to its actual outcome. Recheck current device/scope/expiry before queue operations; reuse durable mobile receipts. Add tests for revoked device, wrong room/reply/member, expired command, conflict replay, deleted artifacts and limit overflow, then full shared suites.

### R4: Desktop and iPhone conversation/work/results plus drafts

**Files:** Modify `apps/web/src/screens/Rooms.tsx`, `components/CrewWorkspace.tsx`, `components/crew-workspace.css`, `lib/room-view.ts`, `room-view.test.ts`; create `components/RoomResults.tsx`, `RoomComposer.tsx`; create `packages/apple/Sources/ShuaCrewMobile/RoomDraftStore.swift`, `Tests/ShuaCrewMobileTests/RoomDraftStoreTests.swift`; modify iPhone CrewView/MobileModel/TodayView and UI tests.

**Interfaces:** `roomResults(room,runs)` returns only actual outputs and source-bound references, with `verification:'recorded'|'not-recorded'|'unavailable'`. `RoomDraftStore` stores encrypted drafts keyed by account/installation/room with text,recipient,replyTo and revision UUID; maximum50 drafts,8,000 bytes each. `clearIfRevisionMatches(key,revision)` is atomic and preserves newer edits.

- [ ] Add a draft regression using temporary storage and a real symmetric key: save revisionA, save revisionB, clearIfRevisionMatches(A), restore store, expectB. Add namespace mismatch/revocation/storage-failure/removed-scope cases and run `swift test --package-path packages/apple --filter RoomDraft` before implementation.
- [ ] Implement encrypted atomic device-local storage and lifecycle cleanup, no cloud draft sync. Separate durable submitted requests from editable drafts.
- [ ] Add result selector tests: missing source → unavailable, no checks → not-recorded, failed run output → partial not successful. Run targeted Vitest, then implement selectors and shared cards.
- [ ] Implement Chat/Work/Results, objective/current owner, one-recipient picker, reply chip, durable Queue next and pending cancellation. No @everyone fan-out or blind retry. Preserve search and inspector collapse; label held/expired/uncertain entries.
- [ ] Implement native iPhone room list, bottom safe-area composer, context sheets and same view semantics. Preserve iPhone approval authentication, stale-state indicators and original signed command identity.
- [ ] Run model/UI tests, keyboard/VoiceOver/large-text checks and cross-pane navigation. Complete G2 physical-device gate only with real pairing/provisioning/user participation.
