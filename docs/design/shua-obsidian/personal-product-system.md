# Shua: personal product system

Status: proposed architecture for review, October 4, 2026. This is a design, not a claim that the features below have shipped.

## Purpose

Build a personal workspace for one developer to learn, build products, deliver AI automation services, and monitor the results. Both income paths are in scope, as explicitly selected by the user. Research feeds a small number of experiments; experiments produce project work; project work produces learning and reusable workflows. The interface makes the next action, running work, evidence, and decisions easy to find.

Success means useful verified outcomes on the user's actual tasks. Universal superiority to ChatGPT or Claude and guaranteed income are not acceptance criteria. Shua uses OpenAI/Codex models; its advantage must come from personal context, integrated tools, persistent work, and measured execution.

“New product” means a coherent experience and a fresh guided setup, preserving existing sessions, courses, artifacts, projects, and recordings. No reset or deletion. Original Sable sessions remain running. No commits or pushes without the user's permission.

## Findings from the current implementation

- `Welcome.tsx` already has identity, goal, runtime, and permission steps, but goal-save failure is swallowed and completion is recorded before persistence succeeds. Runtime lookup failure becomes an empty array. Unknown sign-in is presented as signed out. The microphone explanation describes only local transcription even though live audio has a different path.
- `health.ts` treats an installed runtime with unknown authentication as ready. Speech timing measures synthesis rather than verified speaker playback, but uses “Speaks” wording. Hearing checks describe the local engine without distinguishing the chosen voice mode. `HealthCheck.tsx` still mentions Claude and can headline “Everything's working” based on a limited check set.
- `ventures.ts` can advance a launching project to earning from any positive stored revenue, including test/manual values, without distinguishing verified live receipts. A caught playbook-launch failure disappears. Aggregate project MRR currently sums currencies without conversion. These need provenance and failure-state corrections before revenue monitoring is trustworthy.
- `scripts/eval.ts` covers memory recall, not full task completion. Existing unit tests and the two isolated terminal replays are valuable but do not prove arbitrary cross-app automation.
- Existing useful foundations: event log, run supervisor, crew/task projections, playbook review gates, learning/course state, visual documents, workflow capture and conservative teaching, read-only Stripe integration, schedules, native permission bridge, and persistent artifacts.

## Approach

Recommended: rebuild the product flows on the existing persistence and execution services, add explicit evidence and readiness contracts, and migrate presentation incrementally. This retains working data and provides an acceptance check for each change.

Alternatives considered: a complete storage/runtime rewrite adds migration risk without solving the observed user-facing failures; cosmetic additions leave unreliable setup and metrics untouched. Neither is the recommended first step.

## Product organization

Keep the six primary destinations. Avoid a new competing dashboard for every feature.

| Destination | Primary job | Connected result |
| --- | --- | --- |
| Today | Next useful action, active work, decisions, results | Resume the relevant lesson, experiment, or run |
| Projects | Product and service experiments, delivery, measured outcomes | Evidence and next decision |
| Crew | Inspect and direct actual agent work | Outputs, failures, and source runs |
| Learning | Learn, attempt, receive feedback, recall, apply | Skill evidence linked to project work |
| Automations | Teach, validate, reuse, schedule, monitor | Versioned workflows with run receipts |
| Library | Find reusable results and context | Source-linked artifacts and editable memory |

The notch stays compact: ask/type, speak, Watch me/Finish, current activity, stop, and a path to details. Flat top and rounded lower corners. Busy states convey actual work; connectivity loss removes the implication of live progress. Motion respects reduced-motion settings.

## Release 1: setup and truthful readiness

Replace the old tour with a resumable setup available from Settings and Today. Persist a versioned setup profile on the gateway, separate from browser preferences. Existing learning goal is prefilled; new values are not written until a successful save.

Steps:
1. Outcomes: career/learning goal plus Products, Services, or Both. Both is the user's selected direction. Collect weekly available time; leave unspecified limits visibly unset.
2. Models: inspect connected Codex availability; distinguish installed, signed in, unknown, rate limited, and a successful real response. Model choices must be from the available runtime catalog.
3. Mac and tools: show current permission and connector states, why each capability needs access, and a specific action to connect or test it. macOS grants remain user-controlled. Preserve sealed work-directory exclusions.
4. Voice and control: choose an existing supported voice mode; explain the actual audio path; let the user run a short listening, speaking, stop, and harmless text-entry test. Record individual results instead of awarding a blanket score.
5. Work defaults: selected repositories, concurrency/time limits, review policy, and notification preferences. No new spending authority is implied. Missing configuration blocks only its dependent feature.
6. First outcome: choose a lesson exercise, a harmless recorded workflow, or a research-only business brief. Return a source-linked result and next action.

Readiness states: untested, checking, verified, blocked, stale. Each result includes capability, timestamp, scope, evidence reference, and fix link. A permission grant alone does not mean an action test passed. Service checks and real device tests remain distinguishable. Failed save keeps the current step and entered values; retry cannot create duplicates.

## Release 2: reliable work and teaching

Use one task lifecycle across chat, crew, playbooks, and workflow replay: queued, running, awaiting user, blocked, cancelled, completed. A task receipt includes the request, attempts, executed actions, observed results, outputs, errors, and timestamps. A generated answer is not proof of a completed external action.

Recording keeps one primary button. Save demonstration, user correction, and verified workflow as distinct states. Captured actions are grounded in application/accessibility targets where available, with screen context as supporting evidence. Password input is not recorded. A missing executable target becomes a visible checkpoint needing another demonstration.

Reuse improves through verified versions: retain prior versions, record success/failure and elapsed time, allow only validated optimization, and roll back after a regression. Speed gains are reported for comparable successful runs; screenshots or delays are not dropped merely to improve a number. A changed app or target can require revalidation.

Background tasks resume safely after restart. Duplicate prevention, cancellation, retry limits, run deadlines, and visible failure reasons are required. Read-only research and prepared artifacts can run within an approved scope; publishing, sending outreach, spending, and expanding access need the relevant explicit authorization.

## Release 3: learning that transfers to work

Keep lesson, visual, exercise, feedback, and source session together. Add an explicit skill-evidence record referencing the attempt and feedback. Completion, recall success, and project application are separate facts.

Each project suggests prerequisite skills and a short practice task. After execution, Shua explains the decisions made and asks the user to apply the concept to a new example. Track attempted exercises, later recall, and applied artifacts rather than using time spent chatting as a claim of mastery. The user can correct stored preferences and dismiss irrelevant recommendations.

## Release 4: products and services with measured experiments

Projects gains two business paths under the same experiment model:
- Product: customer problem → sourced demand research → narrow offer → prototype → customer test → launch → review.
- Service: customer problem → repeatable automation offer → demonstration → scoped pilot proposal → delivery → recurring support review.

An experiment records customer, problem, hypothesis, offer, demand sources and dates, effort estimate, allowed budget, success/failure criterion, deadline, source project, and next decision. Scores are transparent judgments with evidence, not probabilities of profit. Start with one active experiment per path; revise this limit in setup.

Shua can research, compare alternatives, prepare prototypes and proposals, run approved local tests, and monitor connected sources. Outreach remains a draft until explicitly authorized. No fabricated customer interviews, leads, purchases, or revenue. Connectors are added only when a chosen experiment needs them.

Revenue views distinguish live provider data, test provider data, manual numbers, and estimates. Show source, currency, and last update. Do not sum unlike currencies without a dated conversion source. Live receipts can establish observed revenue; manual figures are labeled reported, and test figures never mark a business as live earning. Costs and refunds must be identified before claiming profit; unavailable data means profit unknown.

Monitoring begins with read-only sources and reviewable scheduled reports. A report shows metric changes, evidence, anomalies, and a proposed next experiment. A failed launch or sync creates a visible problem with retry, never a silent success. Scheduling exposes timezone, next run, scope, limits, and stop.

## Acceptance and comparison

Build a versioned benchmark of the user's representative tasks, initially:
1. Fresh setup, failed save, retry, and resume with data retained.
2. Signed-out/unknown/limited Codex and successful real response.
3. Short microphone turn, interruption, typed fallback, permission denial.
4. TextEdit launch, blank document, exact text input, observed result, cancellation.
5. Record, review, replay, and corrected demonstration; no duplicate effect on retry.
6. Changed application target and stale screen context produce a clear block.
7. Existing lesson, full exercise feedback, associated saved visual, restart/resume.
8. Sourced product and service briefs with assumptions separated from facts.
9. Experiment to scoped project, linked run/artifact, launch failure and recovery.
10. Revenue source/currency/test-mode distinctions and stale-data display.
11. Scheduled task duplicate prevention, restart, stop, and timezone behavior.
12. Keyboard access, narrow window layout, reduced motion, live connection loss.

Report exact outcomes, first-feedback latency, completion latency, retries, interventions, and usage where available. Measure microphone and end-to-end latency on the real device. Use the same inputs and completion rubric for any later comparison to another assistant; no universal superiority claim from a small sample.

Release gates: relevant regression tests and typechecks pass, native build/signature verify, selected workflows pass in installed UI, existing data remains readable, failures surface, and remaining device-specific checks are listed. No feature is called verified solely because its mock test passes.

## Research informing the design

- OpenAI, [Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals): reproducible workflow evaluations and trace-based diagnosis inform the task benchmark and run receipts.
- OpenAI, [Trace grading](https://developers.openai.com/api/docs/guides/trace-grading): evaluate the executed workflow as well as its final answer.
- SBA, [Plan your business](https://www.sba.gov/counseling/plan-your-business/): research customers and competitors and define costs before treating an idea as a business opportunity.
- Existing Apple HIG research in [workspace verification](../../verification/obsidian-workspace-2026-10-04.md) remains applicable to navigation, layout, motion, and feedback.

## Audit verification, October 4

`node node_modules/vitest/vitest.mjs run apps/gateway/src/ventures.test.ts apps/gateway/src/health.test.ts apps/gateway/src/workflow-teaching.test.ts apps/web/src/lib/integration-setup.test.ts`

Output: `Test Files 4 passed (4)`; `Tests 15 passed (15)`. These establish the existing baseline, not coverage of the new findings.

Read-only live checks: `/api/health` returned HTTP 200, `ok:true`; `/api/runtimes` returned only `codex`, installed and signed in. No production business task, purchase, message, or new schedule was launched in this audit.
