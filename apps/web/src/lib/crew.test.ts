import { describe, expect, it } from "vitest";
import { inScope, pauseClock, policyLine, scopeRuns } from "./crew";
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
