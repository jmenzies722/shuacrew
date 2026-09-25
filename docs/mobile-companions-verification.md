# Mobile foundations and Mac closure checks — 2026-09-25

This is implementation evidence, not a claim that the mobile companions or the
whole product are finished.

## Implemented in this continuation

Strict TypeScript/Swift wire validation and P-256 signing interoperability;
bounded, explicitly truncated snapshots; separate large-snapshot decoding that
does not expand command ingress limits; canonical live-input digests; live-only
approval inspection/compare-and-consume; paired-device authority; selected-room
commands; durable command receipts/acknowledgments and conservative recovery;
loopback-only HTTP routes requiring a separate native bridge credential.

Snapshot projection excludes unselected rooms, incognito/archived/demo runs,
raw prompts, reasoning and tool payload objects. Existing secret redaction is
applied to exported text; this is pattern-based redaction, not a guarantee that
arbitrary sensitive prose can be automatically identified.

Approval display is deliberately narrow: representable medium/low-risk Bash
requests with one bounded command field; high/critical, secret-bearing and
unknown payloads stay on the Mac. Medium-risk offers require a paired phone.
No permanent permission option exists in the command schema.

The shared Swift state accepts only signed, audience-bound Mac responses;
same-sequence/newer-time snapshots can refresh freshness, older snapshots cannot
roll it back. Delivery leaves commands Waiting for Mac. A matching Mac ack is
required for Applied. Account change clears content/queued envelopes and requires
new pairing. AES-GCM checkpoints now preserve exact signed bytes and delivery/terminal
state across restarts, expire overdue commands and reject corruption, wrong keys or
wrong accounts. The atomic checkpoint file has owner-only permissions. It is a shared
library implementation, now wired into the iPhone's serial companion session.

Native identity storage separates a local installation-generation marker from
device-only, non-synchronizing Keychain secrets. A missing marker generates a new
identity; missing/damaged secrets with an existing marker fail rather than silently
replacing the paired key. Tests use temporary marker files and an isolated Keychain
boundary double; no actual user Keychain items were created. macOS data-protection
selection follows [Apple's Keychain documentation](https://developer.apple.com/documentation/security/ksecusedataprotectionkeychain).

Cloud record encoding puts content only in encrypted fields with opaque UUID record
names and version/expiry metadata. A 900,000-byte transport cap reserves record overhead;
oversized envelopes fail, never truncate signed bytes. The off-by-default mailbox actor
handles bounded pages, tombstones and retryable expiry cleanup through an injected
backend. Its controlled-backend tests are not proof of actual CloudKit delivery.

The concrete private CKDatabase adapter now implements encrypted records,
pagination, immutable retries and deletion results. A page advances only after
durable consumer handling. Expired server cursors restart from the beginning once;
late responses cannot repopulate a disabled/re-enabled mailbox. The native Mac
reconciler verifies original device signatures and signs only bound gateway acks.
Native Settings exposes explicit opt-in, real room scope, fingerprint confirmation
and revoke; no cloud container is instantiated in the installed ad-hoc setup state.

The native iPhone uses that session for refresh, messages, pause/resume, stop and
specific approval decisions. Requests persist before delivery; state persists
before visible acknowledgment or cursor advancement. Failed/cancelled authentication
creates no Allow envelope, and expiry is checked again after authentication. Local
terminal history retains 200 results without dropping pending commands. No sample
activity, fabricated costs or fake cloud-connected mode is used in production/UI tests.

## Independent review

One read-only review of the mobile foundation found two Important issues:

1. Local denial could be reentered by mobile before waiter consumption, producing
   opposite decisions. Both paths now reserve the waiter before append and restore
   it on persistence failure. Regression observed true instead of false before fix.
2. A status-write failure after durable approval could strand the provider promise.
   Promise settlement is now guaranteed after the recorded decision. Regression
   observed zero completed turns before fix and one after fix.

Both targeted regressions passed after fixes; the subsequent full suite passed
305 tests. Additional parser/accounting and shutdown tests were added afterward.
The shutdown test reproduced a false Applied stop acknowledgment and now requires
recorded cancellation, otherwise Uncertain/inspect-on-Mac.

The review's Minor replay issue is now fixed: credential-shaped command/device/
installation identities are rejected before durable storage or actions; log redaction
remains enabled. Three regressions failed before the fix and passed afterward.

Review scope excluded CloudKit, native pairing/LocalAuthentication, application
targets, physical devices and unrelated dirty-checkout features. These exclusions
remain acceptance work, not implied passes. The later Swift reconciliation model
was tested locally but was outside that independent review.

## Native Mac observations

- Developer memory graph visibly accumulated 58 actual samples (196 MB down to
  about 130 MB, later 150 MB); no pre-measurement history was invented.
- Gateway restart was preceded by `/api/snapshot` returning `active: []`, head1803.
  The app reconnected and displayed build1790310956252/head1804.
- Header UTC tokens386274 matched the day's analytics input370113 + output16161.
  Missing cost remained null. A context-limit-only coverage discrepancy was then
  reproduced in a regression and corrected in analytics/mobile projection.
- Remove-chat initially produced no dialog in WKWebView. After replacing
  `window.confirm` with the existing in-app dialog system, AX exposed Remove chat?,
  retained-audit/files explanation, Cancel (initial focus), and Remove chat.
  Cancel kept all ten recent chats and returned focus to the same row control.
  No user's chat was removed during this check. Actual archive success and
  active/paused rejection are exercised against the real server in isolated tests.
- Native screenshot showed the Ventures label adjacent to its hovered rail icon
  with unchanged sidebar width. Moving away dismissed it. Temporary text selection
  used during pointer positioning was cleared.

## Commands observed

- `pnpm test`: 319 tests /57 files passed; Node emitted an existing localstorage-file warning.
- `pnpm typecheck`: exit0.
- `pnpm --filter @shuacrew/web build`: exit0; existing `::highlight(find)` CSS
  optimizer warning remains.
- `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift test --package-path packages/apple`:
  38 Swift Testing tests passed, including cancellation and review regressions.
- Same override with `swift test --package-path apps/mac`:12 tests passed.
- `git diff --check`: exit0.

## Not implemented or not proven

The CKDatabase backend, Mac bridge/provisioning flow, pairing UI and iPhone target
exist. No physical-device/cloud delivery has been verified. Watch target and
WatchConnectivity relay, notification delivery, signed lifecycle tombstones and
the final integration review remain unfinished. Native async generation guards
compile, but provisioned account-change paths still need dedicated acceptance.
No bridge credential is in WKWebView content or cloud.

`xcodebuild ... -scheme ShuaCrew -destination
'platform=iOS Simulator,id=7173E153-10F9-4ED7-B35F-7019FD796C12'
CODE_SIGNING_ALLOWED=NO -parallel-testing-enabled NO test` passed the initial
phone-state unit test and unpaired production UI navigation test. The setup screen
reports Cloud sync is off and Setup required. The native inspection tool could
not capture the simulator window, so no manual screenshot/design acceptance is
claimed. Larger text/dark-appearance checks are tracked separately in the ledger.

The expanded run passed one initial-state model test and two production empty-state
UI tests (ordinary navigation and requested large text/dark appearance). Afterward,
independent native review identified three Important recovery bugs: nondeterministic
outer retry JSON across launches, checkpoint collisions when pairing another Mac,
and poisoned change pages. All three were corrected with scoped regressions; no
Critical finding was reported. This is a native-slice review, not release acceptance.
Populated/account-change UI tests and explicit foreground wake sync remain open.
The post-fix iPhone rerun also succeeded: one model test and two UI tests, zero
failures. Result bundle: `Test-ShuaCrew-2026.09.25_01-38-03--0400.xcresult` in the
Xcode DerivedData test logs. The latest release Mac install verified its signature
and preserved `/Applications/ShuaCrew.backup-20260925-013918.app`.

See `mobile-provisioning.md` for the build/account boundary. The native settings
check also confirmed `.shuacrew/mobile` and its bridge credential did not exist.

Free Apple membership was confirmed by the user. No Apple account resources were
created. Unsigned local development is possible; provisioned CloudKit and physical
delivery still need membership/setup and user participation. Full-duplex microphone
quality, clean-machine installation, notarization and signed updates are separate
unclosed requirements.
