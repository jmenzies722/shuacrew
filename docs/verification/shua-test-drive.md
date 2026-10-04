# Shua test drive

## Start here

1. In Shua, type **watch me** (or open **Teach Shua → Watch me**).
2. Switch to a disposable TextEdit document or another permitted app and demonstrate a short task. No app checklist is needed; the recorder follows foreground apps during this session.
3. The notch shows **Watching**, captured-action counts, the current permitted app, and the last three captured steps when expanded. Secure/protected contexts are skipped.
4. Type **stop watching**, use the visible Stop button, or press Escape. Review what Shua captured and any actions needing help.
5. Describe the goal/correction in **Teach Shua**, then use **Send workflow to Shua** for Codex review. Review and save the teaching.

The broken **Run workflow** form has been removed from the notch. Existing saved demonstrations and teaching history are retained, but this UI does not offer deterministic replay. Asking Shua to adapt a demonstration is a separate task, not proof the saved sequence ran.

No continuous video or raw typed values are saved. Capture still depends on macOS Accessibility targets; unsupported controls become explicit checkpoints. The unchanged, currently running old Sable app still needs its staged accessibility update at your chosen restart.

## What to test

- Recording indicator remains visible after leaving the notch.
- Stop and Escape stop recording/replay; taking control in another app pauses replay.
- Changing/removing a target produces a clear stop, not an automatic repeated write.
- Relaunching Shua preserves saved workflows; text input values must be supplied again.
- Library shows measured successful replay times and stopped-run counts. A failed run must not improve the success count or timing cache.
- Fn/chat and existing screen-watch controls still work after stopping a workflow.

Workflows are stored locally at `~/.shuacrew/workflows/library.json`. Saving/reviewing workflows is separate from turning on screen watch. No continuous video is saved. Replay currently relies on controls exposed through macOS Accessibility and stops when a result cannot be verified.

## Gate for the next phase

Before expanding Crew integration, validate three real routines you use daily, each three times with varied inputs; one workflow with an intentional changed target; cancellation; app restart; and permission revocation. Record actual result, duration and failure reason. Then prioritize the Crew workflow that removes the most paid-project work, with a measurable time or revenue target. These features do not establish revenue or superiority over other coding harnesses on their own.

## Teach and refine a workflow

After Stop, write the intended outcome or a correction in **Teach Shua**, then click **Send workflow to Shua**. Codex receives the recorded control sequence, input slots, feedback, previous lessons and run counts. Review its explanation and proposed changes, then **Save taught workflow**. The review itself does not execute the workflow.

Select a saved workflow and choose **Teach / edit** for another correction. **Record a correction** starts a new demonstration for the same app scope and workflow; Save replaces its steps, increments the revision, preserves teaching history, and resets execution statistics. **What Shua learned** shows the retained reviews. You still provide the text for input fields at replay time.

Automatic structural changes are deliberately limited to redundant focus steps immediately before input into the same field. Different controls, commands or missing verification require a new demonstration. Corrections are procedural memory, not model-weight training. Faster execution is measured only after successful verified runs, and is not guaranteed on every attempt.

## Sable typing

The Sable accessibility update is staged separately to preserve your running sessions. Follow [the verified keyboard/Sable setup](keyboard-recording-sable-2026-10-04.md) after your next planned restart. The currently running old Sable app still lacks the terminal input target. Terminal typing requires a visible readable line and the same focused pane; Return that executes a command remains a checkpoint. Re-record old unsupported steps after updating.
