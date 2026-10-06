import { expect, it } from "vitest";
import { conversation } from "./conversation";
import { explainAsk, shellCommand, turnRecord } from "./turn-story";

it("retells only the finished turn: ask, plan, steps, verdict and what's left", () => {
  let seq = 0;
  const ev = (kind: string, body: object) => ({ seq: ++seq, at: seq, kind, run: "r", session: null, body, prev: "", hash: "" });
  const items = conversation([
    ev("turn.started", { turn: 1, text: "Earlier question", by: "you" }),
    ev("turn.completed", { turn: 1, route: { runtime: "claude" } }),
    ev("turn.started", { turn: 2, text: "Fix the flaky retry test", by: "you" }),
    ev("plan.updated", { turn: 2, steps: [{ text: "Reproduce", status: "done" }, { text: "Fix", status: "done" }, { text: "Ship", status: "pending" }], note: "" }),
    ev("tool.called", { id: "b", tool: "Bash", input: { command: "pnpm test" } }),
    ev("tool.returned", { id: "b", ok: false, output: "1 failed" }),
    ev("tool.called", { id: "e", tool: "Edit", input: { file_path: "/repo/src/upload.ts" } }),
    ev("tool.returned", { id: "e", ok: true, output: "" }),
    ev("check.ran", { command: "pnpm test", exitCode: 0, output: "" }),
    ev("agent.message", { turn: 2, text: "Fixed: the retry uses the injected clock.", final: true }),
    ev("turn.completed", { turn: 2, route: { runtime: "claude" } }),
  ] as never);
  const finished = items.findLast((i) => i.kind === "finished") as Extract<(typeof items)[number], { kind: "finished" }>;
  const record = turnRecord(items, finished);
  expect(record).toContain("I asked: Fix the flaky retry test");
  expect(record).not.toContain("Earlier question");
  expect(record).toContain("Its plan: [x] Reproduce; [x] Fix; [ ] Ship");
  expect(record).toContain("1. Bash `pnpm test` (failed)\n2. Edit src/upload.ts\n3. Check `pnpm test` passed");
  expect(record).toContain("Verified: the last check passed");
  expect(record).toContain("Left undone: Ship");
  expect(record).toContain("Its reply: Fixed: the retry uses the injected clock.");
  expect(explainAsk("Retry fix", record)).toMatch(/^Teach me what my crew just did in the session "Retry fix"/);
});

it("shows a shell command the way you'd type it", () => {
  expect(shellCommand("/bin/zsh -lc 'npm test'")).toBe("npm test");
  expect(shellCommand("bash -c \"pnpm  test --run\"")).toBe("pnpm test --run");
  expect(shellCommand("pnpm test")).toBe("pnpm test");
});
