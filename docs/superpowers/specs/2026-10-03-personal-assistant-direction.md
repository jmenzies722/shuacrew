# Shua Crew personal assistant — proposed direction

Status: draft for user review. No implementation or runtime verification claimed.

## Intended outcome

A personal Mac assistant with an intuitive, dynamic notch interface: realtime
conversation, reliable chained actions, actual cursor control, background tasks,
music, and useful proactive suggestions. All model inference uses OpenAI through
the connected ChatGPT/Codex account. Show permissions and accurate execution state.

Assumption carried from the existing voice design: subscription only, without
separate API billing. Select models from authenticated runtime capabilities rather
than inventing model names or assuming every model supports realtime audio.

## Approach

Extend the existing native bridge, task contracts, gateway event store, scheduler,
and notch. This keeps one execution authority and preserves unfinished live work.
A cosmetic-only redesign would not improve execution reliability. A full rewrite
would duplicate working foundations and delay useful improvements.

## Visual experience

- Resting notch: quiet presence, actual connection/microphone status, and compact
  now-playing information when music is active.
- Active notch: one primary task, current step, real audio waveform while speaking
  or listening, and distinct observing/acting/verifying/blocked states.
- Expanded task view: understood request, ordered steps, permission scope,
  background jobs, receipts, and Pause/Cancel controls.
- Approval card: exact action, destination/app, intended effect, and Approve/Deny.
  Approvals take visual priority over suggestions and music.
- Proactive card: one useful next action, the evidence and timestamp behind it,
  plus Prepare, Dismiss, and disable-this-suggestion controls.
- Cursor overlay: highlight a freshly observed target and label the action.
  Decorative motion must never move the real pointer. Respect reduced motion.

## Intelligence and permissions

Enforce OpenAI-only routing in the gateway, including fallback, scheduled work,
teaching, and saved runtime preferences. Remove other providers from selectable
choices; retain historical records. Unavailable authentication produces a clear
blocked state, never an alternate-provider fallback.

Interpret “show permission for anything” as visible permission scope for every
task, with approval before the task changes Mac state. The user can approve a
specific multi-step scope once; changes outside it require new approval. Offer
an explicit per-action approval mode. macOS Accessibility, Screen Recording,
Microphone, and Automation grants remain separate, visible OS permissions.

Keep consequential sends, purchases, deletion, and security changes explicit.
Never commit or push without asking. Preserve both sealed work-folder exclusions,
including resolved paths and observation boundaries. A request for broad Mac
control does not override OS restrictions or authorize arbitrary screen capture.

## Reliable execution and background work

Use one task identity across voice, UI, gateway, and native execution. Plan steps,
observe the permitted app, act on fresh targets, and verify each intended result.
Persist minimal receipts; dispatch success alone is never task completion.
Reconcile unknown outcomes before retries, prevent duplicate actions, enforce
budgets, and stop dependent steps when verification fails.

Serialize desktop interaction. Physical user takeover pauses it. Background
non-UI tasks may continue within their approved scope and resource limits.
Cancellation invalidates queued dispatches; after restart, reconcile pending
work instead of blindly replaying mutations.

Proactivity starts with opt-in sources and routines. Prepare suggestions from
authorized context; do not silently take over the desktop. Show why and when a
suggestion arose, suppress duplicates, and support quiet hours and revocation.
Initial daily-life flows: prepare a focus session, control music, and track an
approved background task. Calendar/mail integrations follow separately.

## Delivery sequence and acceptance

### Added direction: immediate interaction and complex tasks

The user additionally requests instant notch/Fn behavior, fast responses, complex
tasks, and an implementation that ties these capabilities together.

- Handle Fn-down and notch opening locally before network work. Target p95 under
  50 ms from native key event to visible acknowledgment on the development Mac;
  this is an acceptance target, not an achieved measurement. Preserve the existing
  300 ms tap/hold distinction, modifier cancellation, and microphone permissions.
- Keep the notch view ready without silently activating microphone capture or
  incurring continuous model usage. Begin bounded capture only under the accepted
  gesture contract; discard tap/cancel buffers. Release must close input promptly
  even while connection setup is pending.
- Stream the first useful answer and execution updates as they arrive. Measure
  Fn-to-paint, release-to-first-text, release-to-first-audible-output, approval-to-
  dispatch, and dispatch-to-verification separately, with cold/warm p50/p95.
  Network/model responses have no zero-latency guarantee; show real waiting states.
- Replace task completion polling with subscribed state changes where the owning
  controller can provide them. Tie every update to task, step, and generation IDs.
- Add a task coordinator above the existing execution paths: a dependency graph
  of bounded steps, scoped approvals, a single desktop lease, durable checkpoints,
  receipt-based completion, and a visible next step. It coordinates the existing
  native controller rather than introducing another actuator.
- Complex tasks span multiple bounded execution windows, not one enlarged timeout.
  Pause at budget limits, checkpoint, and resume explicitly. Independent approved
  non-UI steps can run concurrently; dependent or desktop steps cannot race.
  A revised plan invalidates approvals for changed effects. Restart reconciles
  in-flight actions before offering resume. Report partial completion precisely.
- Keep short voice conversation responsive while a long task runs. Ending voice
  does not silently cancel approved background work; an explicit task Stop does.
  A single task event projection drives notch, expanded view, and voice summaries.

1. Unified task/permission notch and OpenAI-only routing. Test provider rejection,
   saved preference migration, real event-driven state, approval binding, and
   visible disconnect/failure states; review narrow and expanded layouts.
2. Verified chained Mac actions using the existing controller. Demonstrate
   Calculator readback and an approved music/focus flow; test stale targets,
   takeover, denial, cancellation, retries, and duplicate events. Report observed
   outcomes; unit tests alone do not establish real-app reliability.
3. Native realtime voice on the existing connection. Resolve the interruption
   and stale-output questions documented in the transport report before claiming
   seamless voice. Measure audible latency and verify Fn on real hardware.
4. Opt-in proactive routines and durable background progress. Verify reconnect,
   restart reconciliation, permission revocation, and deduplication.

Each stage gets a focused implementation plan and verification evidence. This is
a direction for staged delivery, not a claim of universal Mac autonomy. No app
installation, deployment, commit, or push is part of this design document.
