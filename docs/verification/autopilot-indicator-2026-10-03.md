# Autopilot and visible activity — 2026-10-03

Changes:
- Persisted the user's requested native desktop control mode to `auto` via the installed app's settings action. Self-test receipt: `ok=true message=Updated: control`.
- Added an activity indicator independent of caption visibility, panel expansion, and live voice. Permission and failure states take priority over work; work takes priority over listening. Reduced Motion disables pulsing. Compact mode retains its dot and accessible label.
- Display pending companion gateway approvals directly above the live transcript, including the actual request, review details, Allow once, Deny, and failed-decision feedback. Decisions use the existing approval endpoint; no blanket automatic acceptance of arbitrary tool messages.
- Clarified native desktop action routing to prevent competing computer-use MCP and native action execution. Refreshed saved conversation rules to v3. Other MCP resource tools remain available within their configured scope.
- Distinguished missing target app from protected app in native screen capture errors. Protected applications remain blocked.
- Renamed the existing Automatic option to Autopilot.

Verification:
- `node node_modules/vitest/vitest.mjs run`: 230 files, 1,062 tests passed (log `/private/tmp/shua-autopilot-tests.log`).
- After final prompt regression assertion: focused buddy/activity suite 57 tests passed; web TypeScript check exit 0.
- `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer swift build --package-path apps/mac -c release --product ShuaCrew`: Build complete (27.96 sec).
- `bash apps/mac/scripts/install.sh`: installed `/Applications/ShuaCrew.app`; prior application retained in app-backups. `codesign --verify --strict /Applications/ShuaCrew.app`: exit 0.
- Existing real TextEdit run r_a69813ae completed after explicitly authorized app approvals. CUA tool output reported focused text entry value `Hello World`; independent TextEdit accessibility read also showed `Hello World`. This is a CUA result, not proof of the native actuator.
- Installed native settings action and open-app action returned success. Native UI accessibility showed `Working`, `Stop`, and `Stop work` during a new task.
- A launch-time test initially hit the target-app capture guard. A subsequent native open-app action established the TextEdit target; fresh capture then completed in 555 ms. No restriction was removed to make this pass.

Limits:
Screen watch does not replace fresh action frames. The code retains per-step observation and target checks. Full arbitrary complex-task reliability and hardware Fn/voice latency are not established by unit tests. No commits or pushes were made.

Final native trial:
- Run r_a69813ae turns 5–8 used native `open_app TextEdit`, `press File`, `press New`, then proposed `type Shua autopilot test 1752`.
- The native receipts confirmed File and New presses. UI state displayed Acting without a per-step approval pause.
- The final trial stopped with: `The app or window changed while observing, or the capture took too long. Look again before acting.` UI showed Needs attention.
- An independent TextEdit accessibility read during the trial showed a differently titled document with duplicated/malformed test text. No native successful final typing receipt established which actor produced that state. Do not count this as a passing end-to-end typing test.
- Removed a remaining contradictory follow-up instruction that suggested arrays of actions, although the executor runs one observed action per step.
- No arbitrary complex-task or flawless typing claim is justified. The known successful Hello World result used the separate CUA route; native multi-step typing remains unverified.
