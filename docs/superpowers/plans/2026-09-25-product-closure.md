# ShuaCrew Product Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved connected Mac/iPhone experience, useful customization, safe branded MCP cards and improved conversational voice with evidence for every completion claim.

**Architecture:** Preserve the event-backed gateway as the execution authority. Share projection and presentation primitives across panes, retain native Apple identity/audio boundaries, and ship independent workstreams without replacing the existing application.

**Tech Stack:** TypeScript, React, Vite, Vitest, Swift/SwiftUI, AVAudioEngine, CloudKit and WatchConnectivity.

**Spec:** `docs/superpowers/specs/2026-09-25-whole-product-experience-map.md` and the four designs linked by `docs/superpowers/specs/2026-09-25-experience-review.md`.

## Global Constraints

- Preserve the dirty `codex/shua-neural-voice` checkout. No commit, push, destructive cleanup or user-data deletion without authorization.
- Never access `/Users/admin/Nectar-Work` or `/Users/admin/Developer/work`.
- Existing native Mac application; no substitute web app or frontend-only mock.
- No hard-coded demo activity, imaginary usage, unverified logos, synthetic progress or unearned Connected/Completed labels.
- Preserve palette/accent, compact navigation, permission boundaries and real event identities.
- No new paid voice API, cloud execution service, account resources or implicit microphone permission.
- Use per-command `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` for iOS27/watchOS27; never change global Xcode selection.
- Physical delivery, acoustic voice acceptance and clean-machine release distribution remain explicit completion gates.
- Subplans inherit these constraints. After each task update the execution ledger, not git history.

## Review Focus

1. Historical or archived records must not become active work or duplicate requests after relaunch: Rooms Task R2 and Panes Task P2.
2. Untrusted identity/branding must not grant trust, fetch private addresses or change approvals: MCP Tasks M1–M2.
3. Device/account/route changes during an in-flight operation must invalidate old callbacks: Voice V1–V2 and Rooms R3.
4. Accessibility settings and uncertain data must survive decorative customization: Companion C1–C2 and Panes P1.
5. A UI action can be accepted without execution succeeding: Rooms R2–R3 and final scenario evidence must preserve that distinction.

## Scope decomposition and execution order

Each linked plan is independently testable. Read its spec before executing it.

1. [Shared pane framework and coverage](2026-09-25-premium-panes.md): P1 first, then P2/P3 as dependent features land.
2. [Native conversational voice](2026-09-25-native-voice-execution.md): V1–V3.
3. [MCP branding and tool cards](2026-09-25-mcp-cards-execution.md): M1–M2.
4. [Companion and customization](2026-09-25-companion-execution.md): C1–C2.
5. [Room and phone workflow](2026-09-25-room-phone-execution.md): R1–R4.
6. Finish P2/P3/P4, perform integrated review and final acceptance below.

Recommend native execution in this session: the contracts are tightly related,
the checkout contains substantial uncommitted work, and a single implementer
reduces overlapping edits. One independent final review follows implementation;
do not spawn implementation agents unless the user selects that method.

## Task G1: Baseline and evidence ledger

**Files:** Create `.superpowers/sdd/2026-09-25-product-closure/progress.md` during execution; update `docs/closure-status.md` only with demonstrated results.

**Interfaces:** Consumes current repository state; produces an evidence ledger with task status, commands, output, limits and blockers.

- [ ] Record `git status --short`, `git branch --show-current`, `git remote -v`; do not stage anything.
- [ ] Run the baseline commands separately; record actual failures before making changes:

```sh
pnpm test
pnpm typecheck
swift test --package-path packages/apple
swift test --package-path apps/mac
git diff --check
```

- [ ] Inspect each currently visible UI surface through CUA without launching runs or granting permissions. Resolve exact-capture persistence with documented tool capabilities before claiming a screenshot audit. Do not use shell screenshot automation as a substitute.
- [ ] Create the per-pane evidence rows from P2; mark uncaptured or untested states explicitly, never green by default.

## Task G2: Integrated acceptance and installed handoff

**Files:** Create `docs/product-closure-verification-2026-09-25.md`; update `docs/closure-status.md` and affected design status sections.

**Interfaces:** Consumes all subplan deliverables; produces an installed build plus a factual completion ledger, not an unconditional readiness statement.

- [ ] Run TS/Swift suites and typecheck again, then `pnpm --filter @shuacrew/web build`. Use current simulator IDs discovered with `xcrun simctl list devices available`, not assumptions about earlier runs.
- [ ] Run iPhone and Watch schemes with unsigned simulator builds; capture command, output and xcresult path. A test fixture remains test-only.
- [ ] Exercise in isolated test data: outcome → room → cross-provider assignment → result → review → Library → reusable playbook. Include failure, approval denial, reconnect, queued follow-up and restart. Assert original IDs and no duplicate side effects.
- [ ] Inspect installed real-data navigation and settings persistence without sending unrelated user work. Before an app/gateway restart, read active-run state and postpone restart if work is active.
- [ ] Use the existing install script only after reviewing its current behavior; preserve a recoverable app backup. Verify build/signature output and inspect the installed binary, not just source/dev UI.
- [ ] Request one independent final code review under requesting-code-review; fix demonstrated findings and rerun their regressions. Do not equate a clean review with proof of physical behavior.
- [ ] When user participation is available, verify actual microphone speakers/headphones and paired iPhone/Watch paths. Until then keep these rows open and experimental controls labeled appropriately.
- [ ] Verify a separate clean-account install/update before public-release claims. Never create paid membership, certificates, CloudKit resources, publish a release or commit/push as an inferred implementation step.
- [ ] Hand off exact completed features, remaining gates and how to configure them. Never say all requests are fulfilled while any required evidence row is open.

## Plan review status

Written plan awaiting user review and execution-method confirmation. No implementation is implied by these unchecked tasks. Keyboard assumption for review: Arrow-only send is a new selectable mode; Enter and Shift+Enter both insert a newline in that mode. Preserve existing users' chosen mode rather than silently overwriting it.
