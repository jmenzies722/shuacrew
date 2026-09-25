# ShuaCrew end-to-end closure

Updated 2026-09-25. This is a completion checklist, not a claim of release readiness.

## Required order and gates

1. **Mac workflow reliability:** finish installed approval/denial, failed-assignment
   retry, disconnected UI and restart checks using harmless scoped work. Preserve
   pending user work. Existing controlled tests and live delegation evidence are
   documented in `crew-rooms-verification.md`; do not substitute them for missing
   live paths. Update stale design-status prose only when evidence supports it.
2. **Conversational voice:** design and test simultaneous capture/playback with
   echo rejection, user-speech barge-in, bounded recording, stale-response
   cancellation and explicit microphone privacy. Test speakers and headphones
   with user participation. Current transcription/text/TTS loop is not full-duplex.
   Retain local neural voices and subscription-backed reasoning; no paid voice API
   or silent fallback to rejected robotic voices.
3. **Dedicated iPhone/Watch companions:** written design is
   `superpowers/specs/2026-09-25-mobile-companions-design.md`. The user approved
   this design and its opt-in CloudKit privacy boundary on 2026-09-25.
   Implementation plan: `superpowers/plans/2026-09-25-mobile-companions.md`;
   design and plan are approved. Shared protocol/signing, bounded snapshots,
   local gateway authority/routes, reconciliation, encrypted checkpoint files and
   installation-bound identity storage are implemented and tested. Cloud record
   encoding and an off-by-default mailbox actor are tested against isolated storage.
   A real CKDatabase adapter, native Mac bridge/pairing settings and iPhone target
   are now implemented. Gateway routes dynamically resolve a native owner-only
   credential file; without explicit provisioning they fail closed. The installed
   Mac setup screen was verified with sync disabled and no credential generated.
   The iPhone builds and its unpaired model/UI tests pass on iOS27. Native Watch,
   identity-preserving phone relay, opt-in generic decision notifications and signed
   revocation notices are implemented. Offline acknowledgment recovery, revocation
   renewal and cold-background lifecycle regression checks pass locally.
   Provisioned cloud/device checks remain open. Simulator success is not proof of
   real CloudKit delivery.
   Do not expose the existing Mac HTTP service publicly.
4. **Onboarding and distribution:** first-run provider detection, speech setup,
   permission explanations and recoverable errors; portable packaged gateway and
   dependencies rather than reliance on this developer checkout; Developer ID
   signing/notarization and signed updates with rollback. Verify a clean-account
   installation and update, plus current provider usage terms. No public release,
   developer-account changes or paid services without authorization.

## Account/device gates, not completed features

- Version-27 SDKs exist in `/Applications/Xcode-beta.app`; use a per-command
  `DEVELOPER_DIR` override, not an unrequested global Xcode switch.
- One local Apple Development signing identity was found; this does not establish
  CloudKit production access, provisioning profiles, Developer ID or notarization.
- The user confirmed a free Apple account. No paid membership, team selection,
  CloudKit container or provisioning changes have been made. This is a device/cloud
  delivery gate, not a reason to call unfinished local implementation complete.
- Microphone acoustic testing and physical iPhone/Watch pairing require user
  participation. Never grant permissions or fabricate a live-device pass.
- Remote approval cloud scope is approved; notifications and queued delivery
  cannot be described as acknowledged execution.
- There is a configured GitHub remote, but current uncommitted work is not backed
  up merely because the remote exists. No commit or push without asking.

## Definition of closed

Each subsystem has implementation, automated negative-path tests, installed UI
evidence and clearly labeled physical-device/live-provider evidence. No open
critical safety defects, no fake usage/cost data, no silent permission expansion,
and no claim that unfinished platform work is available. Public-release readiness
additionally requires clean-machine install/update and distribution credentials.

## Latest implemented and verified slices

- Approved Crew Rooms refinement preserves existing appearance tokens and compact
  navigation, with searchable rooms, a shared composer, request history and real-work
  activity. Installed native interactions and six targeted tests passed; see
  `crew-room-design-verification-2026-09-25.md` for exact scope and limitations.
- Dedicated Developer, Observability and Usage panes, real-event line charts,
  live invalidation, bounded diagnostic sample history and unknown-cost labels.
- Sidebar removal archives completed sessions, retaining audit history/files;
  active and usage-paused runs cannot be hidden. Native verification found the
  original browser confirmation did not open in WKWebView; an in-app dialog now
  opens and Cancel retains the chat and restores focus.
- Collapsed rail hover shows one adjacent label without widening the rail;
  verified in the installed Mac app. Explicit pinned labels remain a preference.
- Shared projections exclude mock-runtime consumption and distinguish missing
  costs from zero. Historical events cannot populate today's UTC token counter.
- Mobile authority verifies exact signed bytes, enforces selected-room scope,
  persists receipts/acks and consumes only live approvals. Two independently
  reproduced approval races/storage defects were fixed with RED→GREEN tests.
- Shared Swift state verifies Mac snapshots/acks, rejects rollback/wrong audience,
  expires queued commands and clears state on account change. Delivery alone never
  marks a command Applied. Encrypted checkpoints retain queued/terminal state across
  restarts. Native identity storage cannot silently reuse an installation whose
  marker is missing. The iPhone now consumes this state through a serial session
  that persists before upload/settlement, with 20 pending requests and 200 retained
  terminal statuses. It is simulator-verified, not a provisioned physical companion.
- Native iPhone Today, Crew, room chat, approval review and Settings show signed
  observations or explicit empty/setup states. LocalAuthentication gates Allow;
  cancelled authentication creates no signed Allow request. Cloud upload alone
  remains Waiting for Mac. Unknown costs say Not reported.

See `mobile-companions-verification.md` for evidence and review limitations.
Full-duplex voice, remaining live Mac workflow checks, remaining mobile integration,
portable packaging, onboarding and signed distribution/updates remain open.
No account resources were created and no commits or pushes were performed.
