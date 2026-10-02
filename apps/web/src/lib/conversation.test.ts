import { describe, expect, it } from "vitest";
import { conversation } from "./conversation";

describe("retried asks", () => {
  it("shows a message once when a usage limit moves it to another model, and drops the cut-off attempt", () => {
    let seq = 0;
    const ev = (kind: string, body: object) => ({ seq: ++seq, at: seq, kind, run: "r", session: null, body, prev: "", hash: "" });
    const items = conversation([
      ev("turn.started", { turn: 1, text: "What is 2 plus 2?", by: "you" }),
      ev("agent.delta", { turn: 1, text: "2 plus 2 is" }),
      ev("runtime.limited", { runtime: "claude", until: 9e12, message: "out" }),
      ev("run.routed", { runtime: "codex", model: "terra", reason: "claude-sonnet-5 is out until Sun — moved to codex" }),
      ev("turn.started", { turn: 2, text: "What is 2 plus 2?", by: "you" }),
      ev("agent.delta", { turn: 2, text: "2 plus 2 is 4." }),
      ev("agent.message", { turn: 2, text: "2 plus 2 is 4.", final: true }),
      ev("turn.completed", { turn: 2, route: { runtime: "codex", model: "terra" }, durationMs: 10 }),
      ev("turn.started", { turn: 3, text: "What is 2 plus 2?", by: "you" }),
    ] as never);
    expect(items.filter((i) => i.kind === "ask").length).toBe(2); // the retry merged; asking again after an answer is a new ask
    expect(items.filter((i) => i.kind === "prose").map((i) => (i as { text: string }).text)).toEqual(["2 plus 2 is 4."]);
  });
});
