# Cursor feedback and stale lesson repair

Implemented correlated native pointer/guide acknowledgments after overlay presentation. Invalid coordinates/displays return errors; missing acknowledgments time out rather than imply success. Receipt success means overlay presentation, not independently verified target placement or task completion.

The notch and chat show locating, highlighting, displayed, or blocked status, with cancel/dismiss and fresh-capture Find again. New requests and interruption abort pending receipts; late replies cannot overwrite the current request. Displayed feedback expires after 6.5 seconds; existing hover dismissal remains in control.

Old architecture cards were restored by a history-watching effect and their active lesson context was included in subsequent prompts. Removed automatic history restoration; a new request retires the old lesson, clears its visual/timers, and stops its narration. Chat history is preserved.

## Verification

- `node node_modules/vitest/vitest.mjs run --maxWorkers=4`: 207 files, 973 tests passed. Includes six pointer receipt cases and the new stale-lesson regression. Existing target-reacquisition tests cover moved, missing, ambiguous, and changed-app targets.
- `node node_modules/typescript/bin/tsc --noEmit -p apps/web`: passed.
- `cd apps/web && ../../node_modules/.bin/vite build`: passed; bundle-size warning remains.
- `swift build -c release --product ShuaCrew`: passed; existing compiler warnings remain. One intermediate build was invalidated by a source change; the final build completed.
- `git diff --check`: passed.
- Signed staged app: `/private/tmp/shuacrew-pointer.9rqrF8/ShuaCrew.app`.
- Installed app passed `codesign --verify --deep --strict`; its binary matches the signed staging copy. Unsigned build-output comparison differs due to signing.
- Backup: `~/.shuacrew/app-backups/ShuaCrew-before-pointer-20261003-023344.app`.
- Served web index matches `apps/web/dist/index.html`.
- App restarted after the reply finished, with user approval. Initial UI showed Gateway live and Talk off.
- UI smoke test submitted `Say exactly: Cursor update ready. Do not use tools, diagrams, or screen access.` and observed `Cursor update ready.` as the reply, without an active architecture card in the inspected chat UI. This is not a physical voice or pointer-placement test.

## Remaining manual checks

- Physical Fn down/release, audible Fenrir timing, and actual cursor target placement need a user-observed pass.
- Purple box report is not yet identified: inspected notch showed a charcoal architecture summary and colored voice glow, not a distinct purple test box. Do not claim it removed without identifying it.
- This update does not add autonomous click execution or broaden permissions.
