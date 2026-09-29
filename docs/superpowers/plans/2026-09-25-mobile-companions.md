# Mobile Companions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Preserve native execution from the existing workflow, with one independent review at the end. No commits or pushes without user permission.

**Goal:** Inspect the Mac crew, send room messages and decide specific live approvals from dedicated iPhone and Watch apps without exposing the gateway publicly.

**Architecture:** Signed commands are validated by the gateway independently of transport. A native Mac CloudKit bridge exports selected, redacted snapshots and imports commands; iPhone uses that private mailbox, while Watch forwards its own signed envelopes through iPhone. Delivery does not count as execution without a durable Mac acknowledgment.

**Tech Stack:** Existing TypeScript/Zod/Fastify/SQLite events; Swift Package Manager, SwiftUI, CryptoKit, Security, LocalAuthentication, CloudKit and WatchConnectivity. Native Xcode targets and local shared Swift package.

**Spec:** `docs/superpowers/specs/2026-09-25-mobile-companions-design.md` — approved 2026-09-25.

## Global Constraints

- Dedicated SwiftUI iPhone and Apple Watch applications targeting iOS 27 and watchOS 27.
- The Mac remains the execution authority.
- Mobile access is off by default.
- Neither companion receives Claude/Codex credentials or launches an unrestricted remote shell.
- Private database only.
- Never upload raw event logs, provider tokens, environment variables, audio, internal reasoning, or arbitrary tool payloads.
- Offers expire after five minutes or when the local request ends, whichever comes first.
- Keep pending command records no longer than 24 hours; publish expiration and revocation tombstones before eventual cleanup.
- Mark snapshots stale after 60 seconds without contact, without assuming the Mac crashed.
- The client cannot supply audit authorship or grant an `always` permission.
- Standalone cellular Watch operation is not promised in this first delivery.
- Creating containers, publishing schemas, enrolling devices and distribution require explicit account authorization.
- Per-command `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer`; no global Xcode switch.
- Preserve existing changes and permissions. No commits/pushes; no access to sealed day-job directories.

## Review Focus

1. Expired or no-longer-live approval in transit: reject without reviving work (Tasks 1–2).
2. Crash after action but before acknowledgment: recover the result without repeating effects (Task 2).
3. iCloud account change or older snapshot: clear old account data and reject stale authority (Tasks 3–4).
4. Revoked Watch command relayed by trusted phone: validate original Watch identity (Tasks 1, 2, 5).
5. Sensitive room/tool text: allowlist and redact projections; withhold approvals whose meaning cannot safely be shown (Tasks 2–5).

## Task 1: Signed wire contract and shared Swift package

**Files:** Create `packages/core/src/mobile.ts`, `mobile.test.ts`; `packages/apple/Package.swift`; `packages/apple/Sources/ShuaCrewMobile/Protocol.swift`, `Signing.swift`; `packages/apple/Tests/ShuaCrewMobileTests/ProtocolTests.swift`; `fixtures/mobile/envelopes.json`. Add core package export `./mobile`.

**Interfaces:** Strict version-1 types/schemas `ApprovalOffer`, `MobileCommand`, `SignedEnvelope`, `MobileAck`, `MobileSnapshot`. TS `decodeEnvelope(raw: unknown): SignedEnvelope`, `signingBytes(payload: string): Uint8Array`; Swift `MobileCodec.decode(_ data: Data) throws -> SignedEnvelope`, `MobileSigning.verify(_ envelope: SignedEnvelope, publicKey: Data) throws -> Bool`.

P-256 public keys use X9.63 bytes; signatures use fixed 64-byte r||s. Encode both base64url without padding. Sign exact UTF-8 payload bytes prefixed with `ShuaCrew/mobile/v1\n`; verify before decoding, never reserialize signed data. Envelope max32KiB, payload max16KiB. Reject duplicate JSON keys in both languages, invalid P-256 points, extra fields and non-safe numeric values. Timestamps are integer epoch milliseconds. IDs are bounded ASCII.

Offers bind version, installationId, deviceId, offerId, runId, approvalId, tool, inputDigest, summary, nonce, issuedAt, expiresAt and requiresPhone. Commands additionally bind commandId and one action:

```ts
type CommandAction =
  | { kind: "approval"; offer: ApprovalOffer; allow: boolean }
  | { kind: "room-message"; roomId: string; text: string }
  | { kind: "room-pause"; roomId: string; paused: boolean }
  | { kind: "run-stop"; runId: string }
  | { kind: "refresh" };
```

Ack binds installation/device/command ID, payload SHA-256, state `applied|rejected|expired|uncertain`, reason code and timestamp. Uncertain requires Mac inspection, never replay. Snapshot binds installation/device, source sequence, observed time, selected rooms, usage and offers. Caps:50 rooms,50 messages/room,100 runs,50 offers,512KiB encoded snapshot; explicit truncation flags. Unknown costs are nullable.

- [ ] Write literal TS/Swift vectors: valid cross-language signatures, tampering, wrong version, duplicate keys, invalid signature/key lengths, extra `always`, oversized text and numeric boundaries.

```ts
expect(() => decodeEnvelope({ payload: "x".repeat(32769), signature: "" })).toThrow();
expect(() => MobileCommandSchema.parse({ ...validCommand, always: true })).toThrow();
```

Use fixture-local Node `verify('sha256', signingBytes(payload), {key, dsaEncoding:'ieee-p1363'}, signature)` and CryptoKit `P256.Signing.ECDSASignature(rawRepresentation:)` to prove interoperability; these are real cryptographic checks, not accepted-by-default mocks.

- [ ] Run `pnpm exec vitest run packages/core/src/mobile.test.ts` and `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path packages/apple`. Expected RED before implementation.
- [ ] Implement strict codecs/signing and literal fixture loading. Swift package minimums macOS15/iOS27/watchOS27. Use no external crypto implementation.
- [ ] Repeat both commands. Expected GREEN including both-direction signing/verification and all rejection cases. Record commands/results.

## Task 2: Durable live-only gateway authority

**Files:** Create `apps/gateway/src/mobile/authority.ts`, `crypto.ts`, `projection.ts`, `routes.ts`, `authority.test.ts`, `routes.test.ts`; modify gateway `runs.ts`, `server.ts`, `main.ts` and core `events.ts`.

**Interfaces:** `MobileAuthority(store, supervisor, rooms, options)` exposes `pair(device)`, `revoke(deviceId)`, `offers(deviceId, now)`, `receive(envelope, now): MobileAck`, `snapshot(deviceId, now): MobileSnapshot`, `recover()`. Options inject installation ID, clock and locally approved sync scope. All authority transitions are synchronous; no await between validation and local action. `verifyEnvelope(envelope, publicKey): boolean` implements Task1's Node crypto recipe.

Add `Supervisor.liveApproval(id)` returning an immutable live run/tool/input/risk copy, or undefined. Add `decideLiveApproval(id, expectedRun, expectedDigest, allow, by, commandId)` consuming **only** `waiting`, never `pendingFromLog`. Existing code can record historical approvals; remote execution must not use that fallback.

Digest canonical, recursively key-sorted JSON from live **unredacted** tool input, not the redacted event copy. Reject cycles/nonfinite numbers. Store no raw input in mobile events. Device name/ID determines `by`; clients cannot provide it. Add optional `mobileCommandId` to `approval.decided` to reconstruct the result after an acknowledgment crash.

Durable events cover config, pairing/revocation, offers, command receipt/digest and acknowledgments. No private keys or raw envelopes in audit. Room-message uses commandId for `rooms.send` deduplication. Stop/pause recovery inspects final state; ambiguous outcomes become uncertain. A recorded decision means decision-recorded, not tool-succeeded.

- [ ] Write integration tests using real EventStore/Supervisor and controlled Runtime `ctx.approve`, real test signing keys and injected clock.

```ts
const before = store.ofKinds("approval.decided").length;
authority.receive(signedWrongDigest, now);
expect(store.ofKinds("approval.decided")).toHaveLength(before);
expect(supervisor.liveApproval(approvalId)).toBeDefined();
const ack = authority.receive(validDecision, now);
expect(ack.state).toBe("applied");
expect(authority.receive(validDecision, now)).toEqual(ack);
expect(store.ofKinds("approval.decided")).toHaveLength(before + 1);
```

Test expiry boundary, cancellation, log-only historical approval after restart, wrong run/installation/device/nonce/digest, local/mobile race, revoked Watch through trusted phone, same ID/different payload, storage failure before decision, crash after decision/before ack and room-message recovery. Negative cases create no approval or work.

- [ ] Run `pnpm exec vitest run apps/gateway/src/mobile`. Expected RED.
- [ ] Implement authority and projections with existing core `redact`/`redactDeep`. Exclude incognito, archived and unselected rooms, reasoning and raw tool data. High/critical or unrepresentable actions remain Review on Mac; medium risk requires paired phone, not a Watch-supplied authentication flag.
- [ ] Register local `/api/mobile/config`, `/devices`, `/devices/:id/revoke`, `/snapshot/:deviceId`, `/commands`. Keep existing host/origin/CSRF protections. Snapshot/command transport additionally requires a separate native bridge credential provisioned locally, never in CloudKit or WKWebView content. Reject non-loopback remote addresses even if the general server has a token. Pair/revoke/config require explicit local UI actions.
- [ ] Test off-by-default, wrong host/origin, absent bridge auth, oversize input and unsupported fields return4xx without mutation; secret sentinels/unselected data absent from snapshots.
- [ ] Run focused tests, `pnpm test`, `pnpm typecheck`. Expected GREEN.

## Task 3: Cloud mailbox, keys and Mac opt-in UI

**Files:** Create shared Swift `KeyStore.swift`, `Mailbox.swift`, `CloudMailbox.swift`, `SyncState.swift` and `Tests/ShuaCrewMobileTests/SyncTests.swift`; Mac `Sources/ShuaCrew/MobileBridge.swift`, `MobileSettings.swift`; modify Mac `Package.swift`, `main.swift`, `MainWindow.swift`. Add optional signed-build entitlement/config files in Mac Resources.

**Interfaces:** `Mailbox.fetchChanges() async throws -> [MailboxRecord]`, `save(_ record:) async throws`, `deleteExpired(now:) async throws`; records carry opaque ID, version, expiry and encrypted Data. `MobileKeyStore` owns device-only Keychain P-256 keys with local installation-generation marker: reinstall missing marker requires pairing again despite Keychain survival. `MobileSyncState` accepts current account/installation and increasing snapshot sequence; exposes observed-time freshness.

Use private CloudKit custom zone with encrypted payload fields; only opaque IDs/version/expiry indexable. Mac signs snapshots and acks; clients verify before display. Pairing fingerprint binds both public keys and installation ID, confirmed out-of-band in Mac UI. Pairing offers expire in5minutes; cloud receipt alone never pairs.

- [ ] Write fake-mailbox tests for stale/duplicate records, account change, conflicts, quota error, expiration, tombstones and retry cancellation.

```swift
state.accept(snapshot: newer, account: "A")
state.accept(snapshot: older, account: "A")
#expect(state.sequence == newer.sequence)
state.changeAccount(to: "B")
#expect(state.snapshot == nil)
#expect(state.pendingCommands.isEmpty)
```

- [ ] Run shared Swift tests with the Xcode-beta override. Expected RED.
- [ ] Implement serial bounded exponential retry1–60seconds honoring server retry-after; cancel on sign-out/disable; foreground reconcile; expose last success and error. Offline server cleanup cannot be guaranteed until reconnect, but expired commands are rejected everywhere immediately. Cloud subscriptions are refresh hints, not acknowledgments.
- [ ] Add Mac Settings→Mobile: off switch, exact disclosure, selected rooms, pairing fingerprints, devices/revoke, sync state/errors. Instantiate CloudKit only with opt-in/configured entitlements. Unsigned/ad-hoc builds show Setup required rather than crashing or pretending Connected. Do not create cloud resources.
- [ ] Connect local bridge; disabling halts import/export and clears transient state, explains existing remote records and queues cleanup when access resumes. Local revoke applies immediately even if cloud tombstone upload fails.
- [ ] Run shared and Mac Swift tests plus TS tests/typecheck. Expected GREEN; inspect native off/setup-required/persistence states without private-data uploads.

## Task 4: Native iPhone application

**Files:** Create `apps/ios/ShuaCrew.xcodeproj/project.pbxproj`, shared scheme `ShuaCrew`; `Sources/ShuaCrewApp.swift`, `MobileModel.swift`, `TodayView.swift`, `CrewView.swift`, `ApprovalView.swift`, `SettingsView.swift`; `Resources/Info.plist`, `ShuaCrew.entitlements`, `Tests/MobileModelTests.swift`, `UITests/CompanionUITests.swift`. Local shared package path `../../packages/apple`; no remote generator dependency.

**Interfaces:** `@MainActor MobileModel.submit(action:) async throws -> commandId`; `authenticateApproval() async throws` wraps LocalAuthentication. Only verified Mac ack changes state to Applied. Reuse original envelope/ID across transport retries.

- [ ] Write model/UI tests under explicitly labeled fixture launch mode, never a fake production connection.

```swift
let id = try await model.submit(action: .pause(roomID: "room-fixture", paused: true))
#expect(model.status(id) == .waitingForMac)
model.accept(ack: verifiedAppliedAck)
#expect(model.status(id) == .applied)
```

Also test canceled/failed authentication creates zero signed Allow envelopes, expired offers disable Allow, cloud-save without ack stays Waiting, wrong-device ack ignored, account sign-out clears content and Unknown costs render explicitly.

- [ ] Discover simulator destinations using `xcrun simctl list devices available` with Xcode-beta. Run tests using an actual iOS27 simulator ID. Expected RED. Missing simulator runtime is recorded as unavailable, never a pass.
- [ ] Implement Today (briefing/outcomes/decisions), Crew (attributed room chat/dependencies/results), Settings (pairing/scope/notifications/privacy), usage drill-down with real accounting coverage. Native semantic colors/materials, Dynamic Type, accessible controls and stale banners.
- [ ] Approval notification opens details, never lock-screen Allow. Notification permission only on explicit user action. Authentication lockout/cancel retains pending state; no silent fallback. Withheld approvals show Review on Mac.
- [ ] Build unsigned simulator app:

```sh
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcodebuild -project apps/ios/ShuaCrew.xcodeproj -scheme ShuaCrew -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

- [ ] Run unit/UI suites with discovered destination. Inspect light/dark, largest Dynamic Type, VoiceOver labels, reduced motion, offline/relaunch. Mark fixture screenshots accordingly; no cloud-connection claim until provisioned.

## Task 5: Watch companion and original-identity relay

**Files:** Create `apps/watch/Sources/ShuaCrewWatchApp.swift`, `WatchModel.swift`, `ApprovalsView.swift`, `CrewStatusView.swift`, `WatchRelay.swift`, `Resources/Info.plist`, `Tests/WatchModelTests.swift`; add embedded Watch target/shared scheme `ShuaCrewWatch` to iPhone project; create phone `Sources/WatchRelay.swift` and relay tests.

**Interfaces:** `WatchRelay.send(_ envelope: SignedEnvelope)` forwards original signed bytes. Watch owns separate key/device ID; phone cannot re-sign as itself. Reachable interactive messages, otherwise bounded WatchConnectivity transferUserInfo queue. Max20pending; reject expired offers before enqueue.

- [ ] Write relay/model tests: duplicate transfers, unreachable phone, phone restart, revoked Watch, bad signature, old snapshot, unknown ack and queued expiry.

```swift
try relay.receive(watchEnvelope)
#expect(mailbox.savedPayload == watchEnvelope.payload)
#expect(mailbox.savedSignature == watchEnvelope.signature)
#expect(watchModel.status(commandID) == .waitingForMac)
```

- [ ] Run shared/phone relay tests and Watch model tests under available watchOS27 simulator. Expected RED.
- [ ] Implement decisions, concise crew status, stop/pause and freshness. Representable low-risk offers require confirmation; phone-required offers hand off. No background microphone or desktop-density transcripts. Complete all WatchConnectivity background tasks; cancel stale work on deactivation.
- [ ] Build unsigned Watch target:

```sh
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer xcodebuild -project apps/ios/ShuaCrew.xcodeproj -scheme ShuaCrewWatch -sdk watchsimulator -destination 'generic/platform=watchOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

- [ ] Run model/UI tests and inspect layouts. Physical phone/Watch delivery remains pending until actual-device evidence.

## Task 6: Integrated review and real-device handoff

**Files:** Create `docs/mobile-companions-verification.md`, `docs/mobile-provisioning.md`, `apps/gateway/src/mobile/end-to-end.test.ts`; update `docs/closure-status.md`.

**Interfaces:** Production authority/codecs with in-memory transport first, then provisioned CloudKit/physical devices only after account authorization. No release authorization bypasses.

- [ ] Add controlled-runtime integration test: pair→offer→signed phone decision→relay→one decision→verified ack. Deny/revocation/restart at receipt/decision/ack boundaries also required.

```ts
expect(store.ofKinds("approval.decided").filter(e => e.body.mobileCommandId === commandId)).toHaveLength(1);
expect(ack.state).toBe("applied");
expect(ack.reason).toBe("decision-recorded");
expect(snapshotJSON).not.toContain(secretSentinel);
```

- [ ] Run `pnpm test`, `pnpm typecheck`, web build, Mac/shared Swift tests, both unsigned mobile builds, mobile UI suites and `git diff --check`. Record actual counts and unavailable destinations separately.
- [ ] Dispatch one independent read-only review over mobile changes and adjacent approval semantics with spec/plan/evidence. Fix Important/Critical findings using failing-first regressions and rerun checks. Document minor limitations; no repeat review loop.
- [ ] Before account operations, present actual Apple team plus proposed IDs `dev.shuacrew.ios`, `dev.shuacrew.ios.watchkitapp`, shared container `iCloud.dev.shuacrew`; existing Mac stays `dev.shuacrew.mac`. Obtain authorization for development provisioning; do not infer capabilities, create certificates or publish production schemas.
- [ ] With user participation, pair real Mac/iPhone/Watch and exercise harmless approval/deny, room message, pause/stop, sleep/offline, expiry, sign-out and revocation. Record run/command IDs and audit evidence. Do not approve risky tools for test convenience.
- [ ] Inspect cloud fields/notification payloads for forbidden data and physical Watch signature preservation. Verify decision acknowledgment separately from tool outcome. Retain bounded test records under the documented cleanup policy.
- [ ] Update closure status separating implemented, automated, simulator, physical and cloud evidence. Mobile completion does not close voice duplex, portable Mac packaging, notarization, updates or provider terms. No commit/push/TestFlight publication.

## Self-review and handoff

Protocol/security→Tasks1–2; opt-in/pairing/cloud/freshness→Task3; iPhone→Task4;
Watch→Task5; device/account proof→Task6. Every Review Focus condition has an
explicit owning test. Mac-signed responses prevent cloud data from impersonating
approval offers or acknowledgments. Remote decisions exclude log-only approvals.

Native execution remains selected from the existing workflow. Implementation
begins after user review of this plan. Account/device gates do not prevent local
protocol and model tests or unsigned builds; they do prevent declaring real
CloudKit/physical-device end-to-end delivery proven.
