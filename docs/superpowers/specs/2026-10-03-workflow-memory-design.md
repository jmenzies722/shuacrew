# Demonstration recording and workflow memory

Authorized scope: the user requested research and end-to-end implementation of watching a demonstrated task, storing workflows, and improving repeated execution speed. Existing OpenAI-only inference, visible activity, stop controls, protected work folders and explicit OS permissions remain in force. No commits or pushes.

## Research and approach

- Agent Workflow Memory (https://arxiv.org/abs/2409.07429): retrieve reusable procedural routines from past trajectories. Its web benchmark results are not performance claims for Shua.
- ALLOY (https://arxiv.org/abs/2510.10049): demonstrations should become transparent, editable, parameterized workflows.
- Apple AppKit monitoring (https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/MonitoringEvents/MonitoringEvents.html): global monitors observe other apps; keyboard observation requires Accessibility; remove monitors when finished.
- ScreenCaptureKit (https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos): appropriate for live screen context, not a substitute for semantic action targets.

Decision: native semantic recorder and deterministic guarded replay, rather than video-only inference or coordinate macros. Stored workflow execution requires no model; adaptation uses the existing Codex conversation. Model weights are unchanged.

## Product

Workflows button in the notch opens a compact library. Record starts only after naming allowed apps; recording shows a persistent indicator and step count. Stop produces a reviewable draft. Save stores the routine locally, with text entry represented by input slots rather than captured text. Replay asks for input values, shows step progress and Stop, and records verified completion time. Library displays successes, last and best duration. Unsupported/ambiguous controls remain explicit manual checkpoints rather than guessed actions. User may ask Shua to adapt a stopped routine; revisions require review/save.

## Native engine

Bounded global mouse/key monitoring for selected app bundle IDs only, excluding Shua, password managers, Kiro, and windows exposing sealed-work paths. No raw keyboard content, screenshots or video are persisted. Text actions store field selectors and parameter keys only. A bounded background Accessibility scan retains a short history of target geometry. Mouse events bind to the snapshot preceding their timestamp, so a click that changes layout cannot accidentally record the newly displayed control. Clicks bind Accessibility role + identifier/label; keyboard shortcuts are constrained and unknown operations become checkpoints. Recordings stop after 15 minutes or 100 steps. Replay re-resolves each target within its app, rejects ambiguity, uses AX actions/value assignment where supported, and verifies recorded postconditions. A changed or unverified result never causes automatic repeated mutation. Esc, session lock, revoke, and user takeover stop replay. Only fully verified runs update per-step timing estimates; future initial waits are capped at the original delay and all verification remains mandatory. Workflow data is atomically stored under ~/.shuacrew/workflows with private permissions, bounded and versioned.

## Validation

Core tests: schema bounds, protected apps/paths, ambiguous selectors, input parameter handling, unsupported controls, result statistics and no success on partial execution. Native release build and Swift suite; web types and unit suite. Explicit native fixture tests for recording/replay persistence and changed-target stop. Report observed performance, not promised speedups. TextEdit and arbitrary app support may require a manual checkpoint when Accessibility cannot expose a verifiable result.
