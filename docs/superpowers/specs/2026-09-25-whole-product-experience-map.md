# Whole-product experience map

Status: proposed scope and source inventory; not a completed visual audit or an
implementation plan. Existing room/mobile, MCP, companion and voice specifications
remain pending written review. No product-code changes in this review.

## Product spine

One user outcome should remain traceable through project/venture, room, request,
assigned task, run, approval, result and reusable workflow. Screens are views onto
those identities, not separate copies of a task. Preserve existing IDs, history,
scope and permissions; never attach old work to a project through a guessed match.

Primary flow: describe outcome → select owner/crew → run supervised work → inspect
evidence → approve or request revision → retain result and reusable knowledge.
Any missing relationship is explicitly unassigned rather than fabricated.

## Pane inventory and proposed direction

Inventory grounded in apps/web/src/routes.tsx and corresponding screen source.
Presence of an action in source is not evidence it works end to end.

| Pane | Its job and proposed premium treatment | Connection to the rest |
| --- | --- | --- |
| Sessions / Shua | Main conversation, readable tool/result cards, persistent draft, honest voice states, keyboard behavior chosen explicitly | Open room, originating task and deliverable without losing conversation position |
| Ventures list/detail | Project identity, current outcome, next useful action and recorded business results; replace duplicate empty-state actions | Crew, playbooks, sessions and artifacts retain project context; manual metrics labeled manual |
| Crew roster/member editor | Clear role, provider/model, availability and permission summary; preview personality/voice before saving | Start a scoped conversation or select member for room; editing a persona never adds authority |
| Crew Rooms | Chat/Work/Results, objective, member mentions, contextual replies and durable follow-up queue | Shared task/run/result identities; same bounded evidence on iPhone |
| Crew Floor | Optional spatial overview of actual work, not a competing task board or fake office simulation | Selecting a member/task opens its room or run; stale state stops activity animation |
| Terminal | Legible existing terminal, session identity and copy/search behavior; preserve expert utility | Explicit association with run/worktree; no automatic command execution from decorative controls |
| Playbooks list/detail | Outcome-based templates, visible inputs/permissions, phase status, review gates and failure recovery | Run creates traceable work; existing artifacts and revision requests remain linked |
| Specs | Clear draft/review/approved states and differences between revisions | Approved scope links to execution without treating design approval as tool permission |
| Board | Useful grouping and filters; each card shows owner, blocker and next action | Same run state as room/session; drag cannot pretend to complete work |
| Today | Decision inbox, actual recent results, active work and next scheduled actions | Jump to exact approval/result, then return without losing place |
| Library | Searchable results and knowledge with source, version and context; readable previews | Use as task context, inspect original run; destructive actions are explicit and recoverability documented |
| Memory | Source, scope and applicability for lessons/skills; understandable edit/forget controls | Teach from reviewed work, inspect where memory is used; no fabricated learning |
| Schedules & Triggers | Human-readable next run/timezone, last outcome, pause and safe validation | Open actual run/playbook; distinguish local Mac availability from always-on service |
| Tools & Skills | Authentic provider identities, connection health, capability and scope; preview before installation | Same branded tool-card identity in conversations; no implicit installation or sign-in |
| Policy & Audit | Human-readable permission boundaries, decision evidence and audit details | Exact run/tool/approval links; changing appearance never changes policy |
| Observability | Operational failures, bottlenecks, freshness and drill-through evidence | Selected chart point/filter links to contributing runs, not disconnected totals |
| Usage | Recorded tokens, coverage and separately labeled known/unknown costs; useful time/provider/project filters | Reconcile displayed totals to source events and selected scope |
| Developer | Diagnose gateway, provider, voice and sync health; bounded redacted diagnostics | Failures link to recovery instructions without exposing credentials or weakening guards |
| Settings | Searchable sections, live previews, persistent values, section reset and clear scope | Same appearance, keyboard, voice, notification and accessibility behavior across panes |
| Run detail | Task context, status, actual tool evidence and cancellation/fork semantics | Link back to room/project and forward to results/review |
| Review | Changes and checks before approve/revise; clear effect of each action | Revision returns to responsible task; no merge/publish hidden behind generic Accept |
| iPhone Today | Decisions first, recent outcomes, actual work and sync freshness | Signed selected-room data, authenticated approval, explicit Mac acknowledgment |
| iPhone Crew / Room | Native searchable conversations, saved drafts, member identities and Work/Results details | Same versioned room/request model, not a separate mobile task list |
| iPhone Settings | Pairing, scope explanation, sync/notifications, accessibility and supported customization | No fake voice-call control without a realtime audio transport |
| Watch | Brief decisions and truthful status with legible confirmation | Original Watch identity, phone relay, Mac authority; avoid desktop dashboard density |

## Shared design rules

Reuse existing palette/accent and compact navigation. Standardize readable type
hierarchy, content widths, section spacing, borders, cards, tooltips, focus rings,
destructive controls and loading/error/empty states. A premium screen has a clear
next action and useful information, not a large decorative header everywhere.

Keep navigation groups recognizable; do not silently relocate every pane. Add
consistent breadcrumbs/context links and preserve filters/drafts when returning.
Every interactive-looking control must either work or explain why unavailable.
Progressive disclosure keeps expert controls available without overwhelming setup.

Fun is optional: Spark/Mini Crew and celebrations follow the separate companion
design. Serious approval, failure and privacy states remain clear and unobstructed.
No hard-coded demo activity, imaginary usage, unverified logos, synthetic progress
or unearned Connected/Completed labels.

## Evidence and remaining audit work

Current native capture: installed ShuaCrew at /ventures, gateway shown online,
zero running. Visible empty state has duplicate New venture actions, small
secondary copy and substantial unused space. These are visual observations only;
creation, venture automation and Stripe flows were not exercised.

Other panes have source inventory only in this pass. Their visual quality and
functional correctness are not certified. Full screenshot audit needs a supported
way to persist the exact CUA captures: current documented native capture API returns
image bytes but exposes no screenshot-save operation. Do not substitute an unrelated
OS capture or call this a completed product-design audit. No screenshot file set
has been saved by this pass.

For each pane, record current screenshot, task entry, one useful successful action,
empty/error/disconnected behavior, keyboard/focus, large text/reflow, data source
and next-pane handoff. Use isolated fixtures for mutating tests; production inspection
must not create or delete user work merely to populate attractive screens.

## End-to-end acceptance

Use three coherent scenarios rather than isolated screenshot checkboxes:

1. Personal project task → crew handoff → reviewed result → Library → reusable
   playbook, retaining identity and approvals throughout.
2. Same task inspected from iPhone → one specifically authenticated decision →
   Mac execution acknowledgment → refreshed result; offline/expiry paths included.
3. User configures appearance/companion/voice/MCP presentation → settings survive
   restart → conversation reflects them → failures remain understandable.

Run failure/restart/permission/scope tests before calling those scenarios complete.
Record live-provider, simulator and physical-device evidence separately. Clean
install, release signing, voice acoustic acceptance and cloud provisioning remain
gates, not cosmetic details. Existing docs/closure-status.md remains authoritative
for those open gates.

The next written implementation plan must order dependencies, assign per-pane
acceptance and explicitly account for all pending specifications. Do not start
independent visual rewrites that leave inconsistent duplicate components behind.
No commits/pushes authorized. Whole-product design approval is still required.
