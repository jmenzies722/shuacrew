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

describe("plans and receipts", () => {
  let seq = 0;
  const ev = (kind: string, body: object) => ({ seq: ++seq, at: seq, kind, run: "r", session: null, body, prev: "", hash: "" });
  const done = (turn = 1) => ev("turn.completed", { turn, route: { runtime: "claude", model: "m" }, durationMs: 10 });
  const receipt = (items: ReturnType<typeof conversation>) => (items.findLast((i) => i.kind === "finished") as Extract<(typeof items)[number], { kind: "finished" }>).receipt;

  it("keeps one plan card per turn, updated in place, and hides the checklist tool itself", () => {
    const items = conversation([
      ev("turn.started", { turn: 1, text: "Fix it", by: "you" }),
      ev("tool.called", { id: "tw", tool: "TodoWrite", input: { todos: [] } }),
      ev("plan.updated", { turn: 1, steps: [{ text: "Reproduce", status: "active" }, { text: "Fix", status: "pending" }], note: "" }),
      ev("tool.called", { id: "b", tool: "Bash", input: { command: "pnpm test" } }),
      ev("plan.updated", { turn: 1, steps: [{ text: "Reproduce", status: "done" }, { text: "Fix", status: "active" }], note: "" }),
    ] as never);
    const plans = items.filter((i) => i.kind === "plan");
    expect(plans).toHaveLength(1);
    expect((plans[0] as { steps: unknown }).steps).toEqual([{ text: "Reproduce", status: "done" }, { text: "Fix", status: "active" }]);
    expect(items.findIndex((i) => i.kind === "plan")).toBeLessThan(items.findIndex((i) => i.kind === "tool"));
    expect(items.some((i) => i.kind === "tool" && i.tool === "TodoWrite")).toBe(false);
  });

  it("calls a change verified only when the last check passed", () => {
    const items = conversation([
      ev("turn.started", { turn: 1, text: "Fix it", by: "you" }),
      ev("check.ran", { command: "pnpm test", exitCode: 1, output: "" }),
      ev("tool.called", { id: "e", tool: "Edit", input: { file_path: "/repo/src/a.ts" } }),
      ev("tool.returned", { id: "e", ok: true, output: "" }),
      ev("file.changed", { path: "src/b.ts", change: "modified" }),
      ev("check.ran", { command: "pnpm test", exitCode: 0, output: "" }),
      done(),
    ] as never);
    expect(receipt(items)).toMatchObject({ outcome: "verified", files: ["/repo/src/a.ts", "src/b.ts"], checks: { passed: 1, failed: 1, last: { command: "pnpm test", passed: true } } });
  });

  it("says unverified when files changed and nothing checked them, failing when the last check failed", () => {
    const unverified = conversation([ev("turn.started", { turn: 1, text: "Edit", by: "you" }), ev("file.changed", { path: "a.ts", change: "modified" }), done()] as never);
    expect(receipt(unverified).outcome).toBe("unverified");
    const failing = conversation([ev("turn.started", { turn: 1, text: "Edit", by: "you" }), ev("file.changed", { path: "a.ts", change: "modified" }), ev("check.ran", { command: "pnpm test", exitCode: 1, output: "" }), done()] as never);
    expect(receipt(failing).outcome).toBe("failing");
    const answered = conversation([ev("turn.started", { turn: 1, text: "Why?", by: "you" }), ev("agent.message", { turn: 1, text: "Because.", final: true }), done()] as never);
    expect(receipt(answered)).toMatchObject({ outcome: "answered", files: [], plan: undefined });
  });

  it("lists the plan steps a turn left undone, and starts each turn's receipt fresh", () => {
    const items = conversation([
      ev("turn.started", { turn: 1, text: "Build it", by: "you" }),
      ev("plan.updated", { turn: 1, steps: [{ text: "Spec", status: "done" }, { text: "Build", status: "active" }, { text: "Test", status: "pending" }], note: "" }),
      ev("file.changed", { path: "a.ts", change: "added" }),
      done(1),
      ev("turn.started", { turn: 2, text: "Thanks", by: "you" }),
      done(2),
    ] as never);
    const finished = items.filter((i) => i.kind === "finished") as Array<Extract<(typeof items)[number], { kind: "finished" }>>;
    expect(finished[0]!.receipt.plan).toEqual({ done: 1, total: 3, left: ["Build", "Test"] });
    expect(finished[1]!.receipt).toMatchObject({ outcome: "answered", files: [], plan: undefined });
  });

  it("closes a turn the run failed in, so its receipt still says what's left", () => {
    const items = conversation([
      ev("turn.started", { turn: 1, text: "Build it", by: "you" }),
      ev("plan.updated", { turn: 1, steps: [{ text: "Build", status: "done" }, { text: "Deploy", status: "active" }], note: "" }),
      ev("error.raised", { message: "Deploy key missing" }),
      ev("run.status", { status: "failed", reason: "Deploy key missing" }),
    ] as never);
    expect(receipt(items)).toMatchObject({ outcome: "stopped", plan: { done: 1, total: 2, left: ["Deploy"] } });
  });
});
