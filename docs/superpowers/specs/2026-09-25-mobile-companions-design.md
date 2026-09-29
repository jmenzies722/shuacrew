# ShuaCrew iPhone and Watch companions

Status: written design approved by the user on 2026-09-25, including the opt-in
private CloudKit data boundary. The implementation plan is also approved. Local
protocol/authority/state implementation is underway. No cloud container,
entitlement, external relay, or mobile application has been created.

## User outcome and scope

The user runs side projects from the existing Mac application and wants to see
the crew's work and safely approve specific actions away from the desk. Build
dedicated SwiftUI iPhone and Apple Watch applications targeting iOS 27 and
watchOS 27. The Mac remains the execution authority. Neither companion receives
Claude/Codex credentials or launches an unrestricted remote shell.

This spec covers mobile access only. Voice duplex, Mac workflow verification,
and distribution have separate completion gates in `docs/closure-status.md`.
It does not redefine a test suite as end-to-end product acceptance.

## Transport decision

Recommended: an explicitly enabled private CloudKit mailbox, with a native Mac
bridge between CloudKit and the loopback gateway. iPhone reads bounded snapshots
and submits commands. Watch uses WatchConnectivity through its paired iPhone;
standalone cellular Watch operation is not promised in this first delivery.

Alternatives:

- Private-network HTTPS: no CloudKit content, but requires network setup on each
  device and does not itself provide away-from-home notification delivery.
- Hosted relay with push: more transport control, but adds deployment, credentials,
  service operation and possible recurring cost. No such service is authorized.

CloudKit changes the current local-only data boundary; the user approved this
design on 2026-09-25. No assumption that an Apple Development signing
identity proves CloudKit entitlement or production-container access.

## Identity, pairing and disclosure

Mobile access is off by default. Enabling it explains exactly which data sync:
selected room messages, task summaries, run states, usage summaries and approval
descriptions. Never upload raw event logs, provider tokens, environment variables,
audio, internal reasoning, or arbitrary tool payloads. Private database only.
Apply existing secret redaction before constructing any mobile projection.

Each device creates a Keychain-backed signing key. The Mac explicitly confirms
the device public key and pairing fingerprint. The same iCloud account alone
does not authorize commands. Watch identity is separately paired through iPhone;
the phone forwards signed Watch commands without replacing their identity.
Revocation takes effect in the Mac's authoritative registry, including commands
that were queued before revocation. Reinstallation requires pairing again.

Use CloudKit encrypted fields for sensitive mailbox bodies. Do not claim this
alone guarantees end-to-end encryption under every iCloud account configuration.
Only opaque identifiers, schema versions and expiration metadata need indexing.
Keep pending command records no longer than 24 hours; publish expiration and
revocation tombstones before eventual cleanup. Local audit history remains.

## Approval and command protocol

The gateway creates a bounded remote approval offer containing installation ID,
device audience, run ID, approval ID, tool name, canonical tool-input digest,
redacted display summary, nonce, protocol version and expiration. Offers expire
after five minutes or when the local request ends, whichever comes first.
If the display cannot safely convey the action, require review on the Mac.

A signed decision binds every offer identity field plus allow/deny and a unique
command ID. The Mac validates paired device, signature, version, expiration,
current input digest and still-pending local approval before applying it once.
The client cannot supply audit authorship or grant an `always` permission.
Concurrent local/mobile decisions resolve to one durable winner. Repeated command
IDs return their durable acknowledgment; conflicting bodies are rejected.

Other commands are narrowly typed: submit a room message, pause a room, stop a
run, or refresh a snapshot. Messages require explicit submission and idempotency
IDs. No remote policy edits, terminal command endpoint, automatic retry of an
uncertain side effect, or provider credential changes.

An approval notification opens details; it does not approve from the lock screen.
iPhone requires LocalAuthentication before signing an allow decision. Watch
shows explicit confirmation only for actions safe to describe on its screen;
sensitive actions hand off to the authenticated iPhone flow. Spoken “yes” never
authorizes a tool. Deny and stop remain visible, explicit user actions.

## Honest connectivity

Transport delivery is not execution success. Commands display Sending, Waiting
for Mac, Applied, Rejected or Expired, driven by a Mac acknowledgment. No optimistic
Approved/Stopped label. Expired approval decisions are never renewed or replayed.

Snapshots carry source sequence, installation ID and observed time. Show last
contact; mark snapshots stale after 60 seconds without contact, without assuming
the Mac crashed. Foreground refresh reconciles missed notifications. A sleeping
Mac cannot be promised to execute commands or deliver immediate acknowledgments.
Cloud delivery and Watch background transfers are not realtime guarantees.

## Native interface

iPhone has Today, Crew and Settings tabs. Today surfaces pending decisions,
morning briefing and recent outcomes. Crew contains rooms, attributed messages,
task dependencies and inspectable results. Usage is a drill-down with recorded
tokens and Unknown costs, retaining existing accounting provenance. Settings
contains paired Mac identity, data-sync scope, notification preferences and
revocation instructions. Respect Dynamic Type, VoiceOver and reduced motion.

Watch prioritizes pending decisions, crew status, stop/pause, and brief summaries.
It does not squeeze the desktop dashboard onto a watch face. Every view includes
freshness; disconnected controls explain what can and cannot be delivered.

## Code boundaries

- `packages/core/src/mobile.ts`: versioned wire schemas and bounded projections.
- `apps/gateway/src/mobile/`: pairing registry, offer lifecycle, command validation,
  acknowledgments and redacted snapshots, available only through the local bridge.
- `packages/apple/`: shared Swift wire models, signature verification, mailbox
  reconciliation and test fixtures shared by all Apple targets.
- `apps/mac/`: native CloudKit bridge and opt-in pairing/sync settings.
- `apps/ios/`: SwiftUI companion, authentication and CloudKit transport.
- `apps/watch/`: SwiftUI Watch companion and signed WatchConnectivity commands.

Cloud transport is an adapter. Pure command validation and acknowledgment logic
must be testable without an Apple account. Test adapters must never appear as
Connected production devices. Existing gateway host/origin guards stay enabled.

## Acceptance evidence

1. Literal shared fixtures pass TypeScript and Swift decoding, version and bound
   checks. Tampered signatures, wrong devices/runs/digests, replay, expired offers
   and revoked keys cannot produce `approval.decided`.
2. Concurrency and restart tests prove one durable decision; interrupted offers
   cannot revive a provider tool request that no longer exists.
3. Build iPhone and Watch targets with the installed version-27 toolchain. Record
   simulator verification separately from signed physical-device testing.
4. Pair the user's real Mac/iPhone/Watch only with their participation. Exercise
   one harmless approval and denial, notification opening, room message, stop,
   Mac sleep, lost network, iCloud sign-out, expired decision and revocation.
5. Test physical WatchConnectivity. Simulators and mocks alone do not establish
   phone-to-watch delivery. Verify no sensitive data in notifications or logs.
6. Inspect production entitlements and CloudKit environment before any TestFlight
   or public distribution. Creating containers, publishing schemas, enrolling
   devices and distribution require explicit account authorization.

## Verified environment and references

On 2026-09-25, default `xcodebuild -version` returned Xcode 26.6. Running with
`DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` returned Xcode
27.0 (27A5252f); `-showsdks` listed iOS 27.0 and watchOS 27.0. No global toolchain
selection was changed. `security find-identity -v -p codesigning` found one Apple
Development identity, no Developer ID distribution identity.

- [Apple SDK requirements](https://developer.apple.com/xcode/system-requirements)
- [CloudKit encrypted fields](https://developer.apple.com/documentation/cloudkit/ckrecord/encryptedvalues)
- [WatchConnectivity delivery and physical-device testing](https://developer.apple.com/documentation/watchconnectivity/transferring-data-with-watch-connectivity)
- [Watch session reachability and queued transfers](https://developer.apple.com/documentation/watchconnectivity/wcsession)

Self-review: mobile scope is separate from voice and public distribution; cloud
data transfer and physical-device acceptance are explicit; no background-delivery,
subscription-price, encryption or completion guarantee is inferred from mocks.
