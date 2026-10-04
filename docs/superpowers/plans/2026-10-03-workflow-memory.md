# Implementation plan

1. Add testable native workflow schema and policy; prove parameterization, unique target matching, bounded validation, and outcome statistics.
2. Implement native recording, persistence, guarded replay, progress and cancellation over the existing WebKit bridge.
3. Add compact record/review/library/run UI, input fields, activity integration and Codex adaptation handoff.
4. Build and test. Exercise deterministic fixtures and, when no user task is active, install and verify native UI. Leave accurate limitations and benchmark evidence.

No dependencies, new provider, global permission grants, commit, push or delegation required.
