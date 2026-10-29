import { describe, expect, it } from "vitest";
import type { AnyEvent } from "@shuacrew/core/events";
import type { RunView } from "@shuacrew/core/projections";
import { ago, cleanTitle, groupWork, hrefOf, parseRoute, routeForPath, runtimeLabel, statusLabel, transcript } from "./model";

const run = (id: string, over: Partial<RunView> = {}): RunView => ({
  id, title: id, ask: id, runtime: "codex", labels: [], incognito: false, status: "running", permission: "ask", createdAt: 0, updatedAt: 1000, priority: 0,
  turns: 1, ticker: "", tail: "", toolCalls: 0, failedTools: 0, files: [], checks: [], pendingApprovals: [], lessons: [], subagents: [], checkpoints: [],
  usage: { inputTokens: 0, outputTokens: 0, costUsd: null }, lastSeq: 0, ...over,
} as RunView);
const ev = (seq: number, kind: string, body: Record<string, unknown>) => ({ seq, kind, body, at: seq, run: "r" }) as unknown as AnyEvent;

describe("routes", () => {
  it("reads and writes the hash, Chat by default", () => {
    expect(parseRoute("")).toEqual({ tab: "chat" });
    expect(parseRoute("#/work/r_1")).toEqual({ tab: "work", id: "r_1" });
    expect(parseRoute("#/nowhere")).toEqual({ tab: "chat" });
    expect(hrefOf({ tab: "work", id: "r 1" })).toBe("#/work/r%201");
  });
  it("maps the classic app's paths (menus, links, Shua's go) to the lean app", () => {
    expect(routeForPath("/sessions/r_9")).toEqual({ tab: "work", id: "r_9" });
    expect(routeForPath("/review/r_9?x=1")).toEqual({ tab: "work", id: "r_9" });
    expect(routeForPath("/integrations")).toEqual({ tab: "tools" });
    expect(routeForPath("/studio")).toBeNull();
  });
});

describe("work", () => {
  it("puts what needs you first, hides Shua's chats and children, and drops last week's finished work", () => {
    const now = 10 * 86_400_000;
    const runs = {
      a: run("a", { pendingApprovals: ["p1"], updatedAt: now - 5 }),
      b: run("b", { status: "running", updatedAt: now - 1 }),
      c: run("c", { status: "done", updatedAt: now - 100 }),
      old: run("old", { status: "done", updatedAt: now - 9 * 86_400_000 }),
      chat: run("chat", { labels: ["buddy"] }),
      child: run("child", { parent: "b" }),
      review: run("review", { status: "reviewing", updatedAt: now - 2 }),
    };
    const g = groupWork(runs, now);
    expect(g.needsYou.map((r) => r.id)).toEqual(["review", "a"]);
    expect(g.running.map((r) => r.id)).toEqual(["b"]);
    expect(g.done.map((r) => r.id)).toEqual(["c"]);
    expect(g.background).toEqual([]);
  });
  it("sets ShuaCrew's own background jobs apart (Learn, schedules) unless one needs you", () => {
    const now = 10 * 86_400_000;
    const runs = {
      mine: run("mine", { status: "done", updatedAt: now - 10 }),
      quiz: run("quiz", { status: "done", labels: ["learning", "learn-kind:exam-questions"], updatedAt: now - 5 }),
      standup: run("standup", { status: "running", labels: ["schedule", "crew-standup"], updatedAt: now - 1 }),
      asks: run("asks", { labels: ["learning"], pendingApprovals: ["p"], updatedAt: now - 2 }),
    };
    const g = groupWork(runs, now);
    expect(g.done.map((r) => r.id)).toEqual(["mine"]);
    expect(g.running).toEqual([]);
    expect(g.background.map((r) => r.id)).toEqual(["standup", "quiz"]);
    expect(g.needsYou.map((r) => r.id)).toEqual(["asks"]);
  });
  it("shows titles as text", () => {
    expect(cleanTitle({ title: "# SHUA CREW AI — MASTER **OPERATING**\nmore", ask: "" })).toBe("SHUA CREW AI — MASTER OPERATING");
    expect(cleanTitle({ title: "", ask: "" })).toBe("Untitled session");
  });
  it("names harnesses and states the way you'd say them", () => {
    expect(runtimeLabel("claude")).toBe("Claude Code");
    expect(runtimeLabel("codex")).toBe("Codex");
    expect(statusLabel(run("x", { pendingApprovals: ["1", "2"] }))).toBe("Needs your OK (2)");
    expect(statusLabel(run("x", { status: "cancelled" }))).toBe("Stopped");
    expect(ago(0, 30_000)).toBe("now");
    expect(ago(0, 5 * 60_000)).toBe("5m");
    expect(ago(0, 3 * 3_600_000)).toBe("3h");
  });
});

describe("transcript", () => {
  it("tells the story: asks, messages, tool stretches folded, checks, how it ended", () => {
    const lines = transcript([
      ev(1, "turn.started", { turn: 1, text: "Fix the login bug", by: "you" }),
      ev(2, "tool.called", { id: "t1", tool: "Read", input: {} }),
      ev(3, "tool.returned", { id: "t1", ok: true }),
      ev(4, "tool.called", { id: "t2", tool: "mcp__github__list_pull_requests", input: {} }),
      ev(5, "tool.returned", { id: "t2", ok: false }),
      ev(6, "tool.called", { id: "t3", tool: "Read", input: {} }),
      ev(7, "check.ran", { command: "pnpm test", exitCode: 0 }),
      ev(8, "agent.message", { turn: 1, text: "Fixed it.", final: true }),
      ev(9, "run.status", { status: "failed", reason: "usage limit" }),
    ]);
    expect(lines.map((l) => l.kind)).toEqual(["you", "tools", "check", "agent", "status"]);
    expect(lines[1]).toMatchObject({ names: ["Read", "github · list_pull_requests"], failed: 1 });
    expect(lines[2]).toMatchObject({ passed: true });
    expect(lines[4]).toMatchObject({ text: "Failed: usage limit" });
  });
  it("shows streaming text as the newest line, replaced by the final message", () => {
    expect(transcript([ev(1, "agent.delta", { turn: 1, text: "Work" }), ev(2, "agent.delta", { turn: 1, text: "ing…" })]).at(-1)).toMatchObject({ kind: "agent", text: "Working…" });
    expect(transcript([ev(1, "agent.delta", { turn: 1, text: "Work" }), ev(2, "agent.message", { turn: 1, text: "Done." })]).map((l) => l.kind === "agent" && l.text)).toEqual(["Done."]);
  });
});
