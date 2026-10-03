# Live voice reliability verification — 2026-10-02

## Scope

Reconciled the companion's shared SpeechQueue and HandsFree reliability fixes into the actual served checkout, `shuacrew-live` on `feat/live-voice`. Preserved the newer native voice engine, conversation controller, voice settings, and UI. This is not a wholesale merge of the other checkout's UI work.

- Cancelled playback cannot enqueue late decoded audio or block a replacement generation.
- Partial playback is not replayed by a whole-sentence retry.
- Pending follow-ups are cancelled on stop and cannot interrupt a long reply when their wait expires.
- Microphone capture releases late streams and failed audio graphs, handles device changes and ended tracks, and remains recoverable after a failed reacquisition.
- Added six playback and five microphone regression tests, including 100 simulated disconnect/recovery/stop cycles.

## Commands and observed results

Commands run from the live checkout unless noted.

| Command | Result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run apps/web/src/lib/speech-queue.test.ts apps/web/src/lib/mic-recovery.test.ts` before implementation | 9 failed, 2 passed: reproduced the regressions |
| `node node_modules/vitest/vitest.mjs run apps/web/src/lib/speech-queue.test.ts apps/web/src/lib/mic-recovery.test.ts apps/web/src/lib/native-voice.test.ts apps/web/src/lib/voice-controller.test.ts` after implementation | 4 files, 35 tests passed |
| `node node_modules/typescript/bin/tsc --noEmit -p apps/web` | Exit 0, no diagnostics |
| `node node_modules/vitest/vitest.mjs run` | 160 files passed; one gateway rooms worktree timing test failed; 792 passed, 1 failed |
| `node node_modules/vitest/vitest.mjs run apps/gateway/src/rooms.test.ts` | 30 passed |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=4` | 161 files, 793 tests passed |
| `node node_modules/vite/bin/vite.js build` from `apps/web` | Exit 0; built in 1.70s; chunk-size warning remains |
| `git diff --check` | Exit 0 |

The pnpm test wrapper attempted dependency reconciliation and aborted with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`; existing installed Node CLIs were used instead. Dependencies were not purged or reinstalled. No unrelated gateway test changes were made.

## Deployment and physical testing

- Compared `http://127.0.0.1:7420/` with `apps/web/dist/index.html` using Node fetch and readFileSync: exact match, SHA256 `3c748e185fe2149c3752d36f71a9a9156cdc6871a51dbb0e4c75da0026a68d48`.
- Restarted the idle native app through its menu; process inspection showed `/Applications/ShuaCrew.app/Contents/MacOS/ShuaCrew` started at 13:32:40. Its Today page and companion reopened successfully.
- Before this port, the user confirmed the selected Puck audition was clear and continuous on MacBook Pro Speakers. That audition uses a separate path and does not establish physical acceptance of these shared-queue changes.
- A post-restart text-only companion test was attempted with screen access off. A different draft appeared in the input; testing stopped without submitting or replacing that draft. No post-port physical playback success is claimed.
- AirPods route switching, real microphone disconnect recovery, and sustained physical conversations remain unverified. Automated recovery tests simulate device events and do not replace those checks.

No commit or push performed.
