# ShuaCrew conversations and native iPhone workflow

Status: conversational direction approved; written specification awaiting user review.
Date: 2026-09-25. This document is a design, not implementation or release evidence.

## Outcome

For a solo builder managing personal projects, make it easy to give a crew an
outcome, understand ownership and handoffs, review actual results, and make
specific decisions from Mac or iPhone. Preserve ShuaCrew's existing appearance
and permission boundaries. Success means fewer steps to understand and direct
real work, not more agent chatter or animated dashboards.

The user approved a coordinated workflow upgrade over cosmetic-only changes or
attempting complete Grok Bot parity. "Better" is a usability hypothesis to test,
not a claim established by implementing this specification.

## Research and existing implementation

Official documentation inspected September 25:

- https://docs.x.ai/grok-bot/chat-and-collaboration — groups, mentions, replies,
  asynchronous handoffs and instructions during work.
- https://docs.x.ai/grok-bot/mobile — saved conversation drafts, mobile review,
  group management and share-sheet inputs.
- https://docs.x.ai/grok-bot/files-and-results — inspectable output cards.
- https://docs.x.ai/grok-bot/overview — cloud execution while a laptop is closed.

These are documented capabilities, not hands-on competitor test results.
ShuaCrew is Mac-executed; neither the interface nor CloudKit makes a sleeping Mac
an always-on cloud worker.

Existing foundations: event-backed room coordinator with bounded assignments,
cross-provider delegation, supervised actions, explicit retry and archived-run
recovery; desktop room search/history/activity; signed mobile snapshots and
command acknowledgments. The current phone room is a basic message list. Its
strict snapshot schema lacks member identities, task relationships and results.
Desktop currently rejects another user request while the room is working.

## Scope and non-goals

Deliver one consistent conversation/work/result model across existing Mac and
native SwiftUI iPhone surfaces. Add durable follow-ups, one-recipient mentions,
contextual replies, member identity projection, result provenance and per-room
phone drafts. Upgrade Today to prioritize decisions and recent actual outcomes.

Do not add remote desktop, file uploads/downloads, share extensions, arbitrary
remote shells, room administration from phone, a new cloud execution service,
full-duplex voice, automatic sending/publishing, or more themes in this slice.
Those require separate designs. Watch retains its compact existing contract.
Distribution, provider terms, physical CloudKit delivery and acoustic voice
acceptance remain separate gates in docs/closure-status.md.

## Visual and interaction design

Mac retains current theme variables, accent, typography, density settings,
compact sidebar and composer surfaces. Avoid introducing a separate visual brand.
The room header shows its name, coordinator and current request as the objective;
an idle room asks for an outcome rather than inventing a mission. Show the active
request separately from queued follow-ups. A concise attention strip exposes
pending approvals and failed tasks, with links to their exact details.

Room navigation is Chat, Work and Results. Chat is the default. The existing
desktop activity inspector is an optional compact view of the same Work model,
not a second source of truth. At narrow widths use a single pane and those same
controls. Preserve search when space is constrained.

Chat: stable member glyph/name, timestamp, optional reply reference and recipient.
Add an accessible member picker through @ and a visible recipient control. A
message has zero or one routing recipient; other typed mentions are ordinary
text. No @everyone execution fan-out. Reply selects an existing message/result
reference, with a removable context chip above the composer. One-level contextual
replies, not a new recursively nested discussion system.

Work: request history, coordinator and specialist relationships, observed status,
last activity time, failures and approvals. Collapse repetitive tool details.
Do not show private reasoning, imagined typing, percentage completion, or a
heartbeat animation when there is no evidence of activity.

Results: completed assignment outputs and coordinator responses grouped by
request, with author, originating task/run, actual check evidence and recorded
artifact references. "Completed" is a run state, not "verified correct". Missing
checks say "No verification recorded". Failed work may expose partial output but
cannot be presented as a successful deliverable. Mac links use existing artifact
and run viewers. Phone displays bounded text and metadata only; file contents
remain on Mac and unavailable references are labeled explicitly.

iPhone keeps Today, Crew and Settings. Crew uses searchable room rows with latest
message preview, member identities and actual attention state. A room opens a
native conversation with a bottom safe-area composer and Chat/Work/Results
selection; contextual details use navigation or sheets, not cramped columns.
Today orders pending decisions first, then recent outcomes and active work.
Existing unknown-cost accounting remains unchanged and secondary to decisions.

Respect Dynamic Type, VoiceOver, keyboard focus, light/dark appearance, reduced
motion and increased contrast. Color is never the only status signal. No essential
action is hover-only. Loading, empty, truncated, disconnected, incompatible-version
and removed-scope states have explicit copy and recovery actions.

## Durable follow-up semantics

Use the existing EventStore and RoomCoordinator, not an in-memory UI queue.
Accept at most 20 pending follow-ups per room, each with a UUID request ID, bounded
text (8,000 UTF-8 bytes), optional member ID, optional reply message ID, enqueue
time and an expiry no later than 24 hours. Validate recipient and reply ownership
against the same room before acceptance and again before dispatch.

The composer says Send when idle and Queue next while busy. A queued request is
visible immediately after durable acceptance, but is not represented as a started
run. Dispatch FIFO only after the current coordinator, children and summary settle.
Queue and dispatch records bind a deterministic run ID so replay after a crash
cannot create a duplicate task. Identical request retries return original state;
reuse with different content fails. Preserve exact routing and reply bindings.

Pause prevents dispatch and retains unexpired entries. Stop cancels current work,
pauses the room and holds pending follow-ups; it never silently resumes them.
The confirmation explains this. Failed/cancelled/uncertain current work holds the
queue until explicit user resume after inspection. Expired or invalid-recipient
entries are terminal and visible, never rerouted automatically.

Users may remove a still-pending entry through an idempotent, owner-authorized
cancel operation. Dispatch-versus-cancel is serialized: if dispatch won, return
"already started" and offer the existing stop control; never claim cancellation
of completed effects. Queue reordering/editing and mid-tool instruction injection
are not included. An explicit Stop is separate from sending the next instruction.

## Mobile protocol and privacy

Introduce an explicit v2 phone conversation contract; do not silently add fields
to the strict v1 decoder. Preserve v1 Watch and legacy phone support. Advertise
supported protocol versions/capabilities through signed pairing/setup metadata,
persist the selected version per device, and default existing pairings to v1.
An incompatible client shows update-required and cannot emit unknown commands.
Keep signing domains version-specific and verify signatures before interpretation.
Do not regenerate paired keys merely to upgrade the protocol.

Phone v2 adds allowlisted member display identity, coordinator ID, request/queue
state, message routing/reply references, task ownership/dependencies and bounded
result summaries. Never spread raw events or provider objects into snapshots.
Retain the 512-KiB snapshot ceiling: at most 50 rooms, 16 members per room,
50 messages per room, 100 tasks and 100 result summaries overall, 20 pending
requests per room; text fields capped by UTF-8 byte limits. Prioritize decisions,
active work and recent results; mark every omitted collection as truncated.
Existing Watch projection retains its smaller budget and excludes these additions.

Only explicitly selected rooms are projected. Exclude incognito/mock sources and
secret-bearing tool payloads, local filesystem paths, provider credentials and
private reasoning. Show member names/roles but not their system prompts or secrets.
Result metadata does not grant file access. Changes stay inside the already approved
private CloudKit boundary, with native Mac authority and no public gateway.

V2 message commands bind recipient and reply IDs. Queue cancellation binds the
original request and room. Existing signature, audience, device revocation, selected
scope, receipt persistence, expiry and conflicting-replay checks apply to both.
For a message, an Applied command acknowledgment means accepted into the Mac's
queue, not completed execution. Work state arrives independently in snapshots.
Approval commands retain offer/input-digest binding and iPhone authentication.
Replies, reactions, result cards and spoken words cannot grant tool permission.

## Drafts and recovery

Save local phone drafts per paired installation/account/room using device-bound
encrypted storage, with at most 50 drafts of 8,000 bytes each. Store text, recipient
and reply reference atomically. Do not sync drafts or log their content. Clear them
on account change, revocation or explicit forget; hide removed-scope drafts and
offer local deletion without sending them. Switching rooms or relaunching preserves
valid drafts. Send clears only the matching submitted draft after durable local
command persistence; later edits survive asynchronous completion.

Use existing exact-envelope retry and uncertain-outcome handling. No automatic
new request ID after a lost response. Display observation time and stale status;
"verified snapshot" authenticates its source, not current Mac availability.
Batch UI updates and use lazy/virtualized histories; derive badges from the same
event/snapshot projections. Measure scrolling and update cost before adding caches.

## Code ownership

- packages/core/src/rooms.ts and events.ts: queue/reply events and replay projection.
- apps/gateway/src/rooms.ts and room-routes.ts: serialized acceptance/dispatch/cancel.
- apps/web/src/lib and components: reusable conversation/work/result selectors and
  accessible presentation; Rooms.tsx composes them instead of absorbing all logic.
- packages/core/src/mobile.ts and apps/gateway/src/mobile/: versioned allowlisted
  schemas, capabilities, projections, command authority and durable acknowledgments.
- packages/apple/Sources/ShuaCrewMobile: strict matching Swift wire models,
  signing/version selection, draft storage and state reconciliation.
- apps/ios/Sources: shared native appearance primitives, room navigation/composer,
  work/results detail and Today priority ordering; no transport logic in views.
- apps/mac and apps/watch: compatibility integration and regression verification,
  not a new Watch dashboard.

## Acceptance and definition of closed

1. Queue tests cover duplicate/conflicting requests, bounded capacity, FIFO,
   expiry, pause/resume, stop, failed-work hold, cancellation races, removed members,
   wrong-room replies and crash recovery around every persistence boundary.
2. Literal TS/Swift fixtures establish version compatibility, UTF-8/size caps,
   signature and audience checks, malformed fields, redaction, incognito/mock
   exclusion, Watch compatibility and no scope escalation through references.
3. Draft tests cover relaunch, account switch, revocation, atomic storage failure,
   room switching and edits during send. Production never uses populated fixtures.
4. Mac acceptance exercises mentions, replies, queue while busy, remove pending,
   explicit stop, restart, history and result provenance with harmless scoped work.
   Verify keyboard focus, search, compact layouts and existing appearance settings.
5. iPhone simulator tests cover native navigation, unpaired and populated injected
   test states, stale/expired offers, delivery-versus-execution labels, draft
   persistence, Dynamic Type and accessibility. Test fixtures stay in test targets.
6. Signed physical Mac/iPhone acceptance separately checks pairing, room scope,
   foreground/background refresh, one harmless approval/denial, Mac sleep, offline
   follow-up and revocation. Account resources and permissions require user input;
   simulator passes cannot close this gate.
7. Record commands/results and visual evidence in a dedicated verification report,
   review safety-sensitive changes, and update closure-status without erasing other
   open work. No feature is labeled shipped merely because its screen renders.

Self-review: no new public/cloud execution boundary; command acceptance and task
completion remain distinct; v1 compatibility and concrete bounds are explicit;
the proposed result UI does not imply file transfer or verified correctness.
No commit/push is authorized. Implementation planning follows written-spec approval.
