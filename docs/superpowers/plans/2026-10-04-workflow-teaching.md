# Workflow teaching loop

User intent: demonstrate cursor actions and text entry, send the workflow to Shua, teach corrections, and improve repeated execution.

Implement a bounded Codex review endpoint and an explicit Send to Shua action in workflow review. Include task name, recorded semantic steps, user feedback, prior lessons and run statistics. Typed values remain input slots; no video/keylogging is added. Codex returns explanation, reusable lessons, and suggestions requiring a new demonstration. It may propose dropping a redundant focus immediately before filling the same field; it cannot invent targets, actions or verification evidence. Changes remain a review draft until Save.

Store teaching history with the workflow, retrieve it for future reviews and relevant assistant context, and add Record correction to replace an existing workflow's demonstration while retaining identity/history. New revisions reset execution timing statistics. Only verified replay improves timing; model reviews are never counted as successful executions. Verify schema and allowed edits, backward-compatible persistence, fresh Codex review, build and install.
