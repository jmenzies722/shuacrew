import { afterEach, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { EventStore } from "./store.js";
import { Supervisor } from "./runs.js";
import { policyStats } from "./policy-updates.js";

const cleanups: Array<() => void> = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });
const make = (protectedFolders: string[] = []) => {
  const store = new EventStore(":memory:");
  const supervisor = new Supervisor(store, new Map(), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-explain-")), roots: ["/tmp/shua-roots"], protectedFolders });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  return { store, supervisor };
};

it("explains with your own protected folders, not just the defaults", () => {
  const { supervisor } = make(["/tmp/shua-roots/secret-client"]);
  const d = supervisor.explain("Bash", { command: "cat /tmp/shua-roots/secret-client/plan.md" });
  expect(d.supervised.verdict).toBe("deny");
  expect(d.supervised.rule).toBe("deny.protected-folder");
  expect(supervisor.guardrails().protected).toContain("/tmp/shua-roots/secret-client");
});

it("applies an 'always allow' you gave, the way a real run does", () => {
  const { store, supervisor } = make();
  const before = supervisor.explain("Bash", { command: "./scripts/sync.sh" }).supervised.verdict;
  store.append("approval.requested", { id: "a1", tool: "Bash", input: { command: "./scripts/sync.sh --all" }, risk: "medium", reason: "x", rule: "default.ask" }, { run: "r1" });
  store.append("approval.decided", { id: "a1", allow: true, by: "you", always: true }, { run: "r1" });
  expect(before).toBe("ask");
  // "Always" covers the command's first two words: the same command again, with any arguments after them.
  expect(supervisor.explain("Bash", { command: "./scripts/sync.sh --all --dry-run" }).supervised.verdict).toBe("allow");
  expect(supervisor.explain("Bash", { command: "./scripts/sync.sh" }).supervised.verdict).toBe("ask");
  expect(supervisor.guardrails().always.map((r) => r.id)).toContain("always.Bash../scripts/sync.sh --all");
});

it("shows Autopilot truthfully: it waves through what no rule covers, but explicit asks still ask and blocks still block", () => {
  const { supervisor } = make();
  const uncovered = supervisor.explain("Bash", { command: "./scripts/sync.sh" });
  expect(uncovered.supervised.verdict).toBe("ask"); expect(uncovered.autopilot.verdict).toBe("allow");
  const push = supervisor.explain("Bash", { command: "git push origin feature" });
  expect(push.supervised.rule).not.toBe("default.ask"); expect(push.autopilot.verdict).toBe(push.supervised.verdict);
  expect(supervisor.explain("Bash", { command: "rm -rf /" }).autopilot.verdict).toBe("deny");
});

it("counts decisions by verdict, rule, tool and day, leaving demo runs out", () => {
  const { store } = make();
  store.append("run.created", { runtime: "mock", title: "demo", ask: "x" }, { run: "demo" });
  store.append("policy.decided", { tool: "Bash", verdict: "deny", rule: "deny.sudo", layer: "global", reason: "x" }, { run: "demo" });
  store.append("policy.decided", { tool: "Bash", verdict: "ask", rule: "ask.outward", layer: "global", reason: "x" }, { run: "r1" });
  store.append("policy.decided", { tool: "Bash", verdict: "ask", rule: "ask.outward", layer: "global", reason: "x" }, { run: "r1" });
  store.append("policy.decided", { tool: "Read", verdict: "allow", rule: "allow.read", layer: "global", reason: "x" }, { run: "r1" });
  store.append("approval.decided", { id: "a1", allow: true, by: "you", always: true }, { run: "r1" });
  store.append("approval.decided", { id: "a2", allow: false, by: "timeout" }, { run: "r1" });
  const s = policyStats(store.read(0), Date.now(), 7);
  expect(s.verdicts).toEqual({ allow: 1, ask: 2, deny: 0 });
  expect(s.answers).toEqual({ allowed: 1, denied: 0, timedOut: 1, always: 1 });
  expect(s.rules[0]).toEqual({ rule: "ask.outward", verdict: "ask", hits: 2 });
  expect(s.tools).toEqual([{ tool: "Bash", asked: 2, blocked: 0 }]);
  expect(s.daily.reduce((n, d) => n + d.ask, 0)).toBe(2);
});
