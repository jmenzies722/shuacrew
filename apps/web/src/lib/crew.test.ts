import { describe, expect, it } from "vitest";
import { inScope, pauseClock, policyLine, scopeRuns, recentWork } from "./crew";
import type { RunView } from "@shuacrew/core/projections";

const run = (id: string, repo?: string, parent?: string): RunView =>
  ({ id, repo, parent, title: id, ask: "", runtime: "claude", labels: [], incognito: false, status: "paused", permission: "ask", createdAt: 0, updatedAt: 0, priority: 0, turns: 0, ticker: "", tail: "", toolCalls: 0, failedTools: 0, files: [], checks: [], pendingApprovals: [], lessons: [], subagents: [], checkpoints: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, lastSeq: 0 }) as RunView;

describe("repo scope", () => {
  it("keeps a child with its parent's repo", () => {
    const runs = { p: run("p", "/repos/app"), c: run("c", undefined, "p"), o: run("o", "/repos/other") };
    expect(Object.keys(scopeRuns(runs, "/repos/app")).sort()).toEqual(["c", "p"]);
    expect(inScope(undefined, null)).toBe(true);
  });
});

describe("policy line", () => {
  it("names the rule and the layer that decided", () => {
    expect(policyLine("ask", "git.push", "project")).toBe("ask — rule git.push in the project layer");
    expect(policyLine("deny", "git.push")).toBe("deny — rule git.push");
  });
});

describe("pause clock", () => {
  it("says when a usage window resumes", () => {
    const until = Date.parse("2026-09-24T16:12:00");
    const label = pauseClock({ status: "paused", runtime: "claude", model: "opus" }, { "claude · opus": { until } }, until - 60_000);
    expect(label).toMatch(/^Paused · resumes /);
    expect(pauseClock({ status: "running", runtime: "claude" }, {})).toBeNull();
    expect(pauseClock({ status: "paused", runtime: "claude", statusReason: "follow-up" }, {})).toBe("Paused · follow-up");
  });
});


it("resumes only visible top-level work in the current project, newest first", () => {
  const runs = {
    a: { ...run("a", "/repos/app"), updatedAt: 10 },
    b: { ...run("b", "/repos/app"), updatedAt: 20 },
    child: run("child", "/repos/app", "a"),
    buddy: { ...run("buddy", "/repos/app"), labels: ["buddy"] },
    learning: { ...run("learning", "/repos/app"), labels: ["learning"] },
    hidden: { ...run("hidden", "/repos/app"), archived: true },
    other: run("other", "/repos/other"),
  };
  expect(recentWork(runs, "/repos/app").map(r => r.id)).toEqual(["b", "a"]);
  expect(recentWork(runs, "/repos/app", 1).map(r => r.id)).toEqual(["b"]);
});
