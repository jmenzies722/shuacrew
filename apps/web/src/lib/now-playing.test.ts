import { describe, expect, it } from "vitest";
import { nextTrack, nowPlaying, trackAge, trackMood } from "./now-playing";
import type { ApprovalView, CrewMember, RunView } from "@shuacrew/core/projections";

const member = (id: string, name: string): CrewMember => ({ id, name, role: "", persona: "", color: "#f5b544", runtime: "claude" } as CrewMember);
const run = (id: string, status: RunView["status"], extra: Partial<RunView> = {}): RunView => ({
  id, title: id, ask: "", labels: [], incognito: false, status, permission: "ask", createdAt: 1000, updatedAt: 2000,
  priority: 0, turns: 1, ticker: "", tail: "", toolCalls: 0, failedTools: 0, files: [], checks: [], pendingApprovals: [],
  lessons: [], subagents: [], checkpoints: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: null }, lastSeq: 1, runtime: "claude", ...extra,
} as RunView);
const approval = (id: string, runId: string): ApprovalView => ({ id, run: runId, tool: "Bash", input: {}, risk: "low", reason: "", rule: "x", at: 1, seq: 1 });

describe("now playing", () => {
  it("is quiet when nothing is on", () => {
    expect(nowPlaying({}, {}, {})).toMatchObject({ mood: "quiet", id: null, title: "All quiet", label: "all quiet" });
  });
  it("pins the run that is waiting on you", () => {
    const runs = { a: run("a", "running", { title: "Ship", member: "eli" }), b: run("b", "awaiting_approval", { title: "Push", member: "aria" }) };
    const members = { eli: member("eli", "Eli"), aria: member("aria", "Aria") };
    const t = nowPlaying(runs, { x: approval("x", "b") }, members);
    expect(t).toMatchObject({ id: "b", title: "Push", who: "Aria", mood: "review", label: "needs you", waiting: 1 });
  });
  it("prefers a running session over a queued one", () => {
    const t = nowPlaying({ q: run("q", "queued", { title: "Later" }), r: run("r", "running", { title: "Now", member: "eli" }) }, {}, { eli: member("eli", "Eli") });
    expect(t).toMatchObject({ id: "r", title: "Now", who: "Eli", mood: "working", label: "playing" });
  });
  it("skips buddy and child runs", () => {
    const t = nowPlaying({
      child: run("child", "running", { parent: "r", title: "sub" }),
      buddy: run("buddy", "running", { labels: ["buddy"], title: "Spark" }),
    }, {}, {});
    expect(t.id).toBeNull();
  });
  it("ages a track in words", () => {
    expect(trackAge(0, 10_000)).toBe("");
    expect(trackAge(0, 0)).toBe("");
    expect(trackAge(1000, 4000)).toBe("3s");
    expect(trackAge(0, 125_000) || trackAge(1, 125_001)).toMatch(/2m/);
    expect(trackAge(1, 3_661_000)).toMatch(/1h/);
  });
  it("next is the first approval, then another live run", () => {
    expect(nextTrack({ a: run("a", "running") }, { x: approval("x", "a") }, "a")).toBeNull();
    expect(nextTrack({ a: run("a", "running"), b: run("b", "queued") }, { x: approval("x", "a") }, "a")).toEqual({ kind: "run", id: "b" });
    expect(nextTrack({ a: run("a", "running"), b: run("b", "queued") }, { x: approval("x", "b") }, "a")).toEqual({ kind: "approval", id: "b" });
    expect(nextTrack({ a: run("a", "running") }, {}, "a")).toBeNull();
  });
  it("maps status to a mood the radio can follow", () => {
    expect(trackMood("running", 0)).toBe("working");
    expect(trackMood("planning", 0)).toBe("working");
    expect(trackMood("idle", 2)).toBe("review");
    expect(trackMood("failed", 0)).toBe("failed");
    expect(trackMood("paused", 0)).toBe("quiet");
  });
});
