import type { AnyEvent } from "@shuacrew/core/events";
import { describe, expect, it } from "vitest";
import { conversation, queued } from "./conversation";
import { suggestions } from "./followups";

let seq = 0;
const ev = (kind: string, body: object) => ({ seq: ++seq, at: 0, kind, body, run: "r" }) as unknown as AnyEvent;

describe("follow-up pills", () => {
  it("offer the reply's own options, cleaned up", () => {
    expect(suggestions("Done. How do you want to ship it?\n\n1. **Push** to the new remote\n2. Open a PR (recommended)\n3. Leave it on the branch.")).toEqual(["Push to the new remote", "Open a PR", "Leave it on the branch"]);
  });
  it("turn a closing yes/no question into yes and not now", () => {
    expect(suggestions("Tests pass. Want me to push it to main?")).toEqual(["Yes, go ahead", "Not now"]);
  });
  it("stay quiet when the reply offers nothing", () => {
    expect(suggestions("Fixed: the retry now takes its clock from the uploader.\n- a.ts\n- b.ts")).toEqual([]);
    expect(suggestions("What does the retry do?")).toEqual([]);
  });
});

describe("turn footer", () => {
  it("carries the model, tokens, checkpoint and the lessons the turn was given", () => {
    const items = conversation([
      ev("turn.started", { turn: 1, text: "fix it", by: "you" }),
      ev("lesson.applied", { id: "l1" }),
      ev("usage.recorded", { runtime: "claude", inputTokens: 100, outputTokens: 20 }),
      ev("checkpoint.created", { turn: 1, commit: "abcdef1234", note: "" }),
      ev("turn.completed", { turn: 1, route: { runtime: "claude", model: "opus" }, durationMs: 1500 }),
    ]);
    expect(items.at(-1)).toMatchObject({ kind: "finished", turn: 1, runtime: "claude", model: "opus", tokens: 120, commit: "abcdef1234", lessons: ["l1"] });
  });
});

describe("queue", () => {
  it("lists what's waiting, minus what was taken back, until the next turn starts", () => {
    const events = [ev("turn.started", { turn: 1, text: "a", by: "you" }), ev("run.followup", { id: "f1", text: "b" }), ev("run.followup", { id: "f2", text: "c" }), ev("run.followup.withdrawn", { id: "f1" })];
    expect(queued(events)).toEqual([{ id: "f2", text: "c" }]);
    expect(queued([...events, ev("turn.started", { turn: 2, text: "c", by: "you" })])).toEqual([]);
  });
});

import { splitAttachments, withAttachments } from "./attachments";
describe("attachments in messages", () => {
  it("round-trip: the agent gets paths, the chat gets its thumbnails back", () => {
    const files = [{ id: "u_0123456789ab", name: "shot.png", path: "/h/.shuacrew/uploads/u_0123456789ab/shot.png", size: 2048, type: "image/png" }];
    const text = withAttachments("Why is this red?", files);
    expect(text).toContain("/h/.shuacrew/uploads/u_0123456789ab/shot.png");
    expect(splitAttachments(text)).toMatchObject({ body: "Why is this red?", files: [{ id: "u_0123456789ab", name: "shot.png", type: "image/png" }] });
    expect(splitAttachments("Attached files: are great")).toEqual({ body: "Attached files: are great", files: [] });
  });
});
