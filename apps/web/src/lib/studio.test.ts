import { describe, expect, it } from "vitest";
import type { AnyEvent } from "@shuacrew/core/events";
import type { ApprovalView, CrewMember, RunView } from "@shuacrew/core/projections";
import { nowPlaying } from "./now-playing";
import {
  albumOf, channelOpen, cinemaCuts, crewNowBlock, isStudioAsk, masterLevel, mixChannels,
  parseMix, producerMove, recentlyPlayed, routeLaunch, runRecap, setHeadline, skipToFight, studioAnswer, todaysSet,
} from "./studio";

const member = (id: string, name: string, extra: Partial<CrewMember> = {}): CrewMember =>
  ({ id, name, role: "dev", persona: "", color: "#f5b544", emoji: "code", triggers: [], sessions: 0, ...extra });
const run = (id: string, status: RunView["status"], extra: Partial<RunView> = {}): RunView => ({
  id, title: id, ask: "", labels: [], incognito: false, status, permission: "ask", createdAt: 1000, updatedAt: 2000,
  priority: 0, turns: 1, ticker: "", tail: "", toolCalls: 0, failedTools: 0, files: [], checks: [], pendingApprovals: [],
  lessons: [], subagents: [], checkpoints: [], usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.12 }, lastSeq: 1, runtime: "claude", ...extra,
} as RunView);
const approval = (id: string, runId: string): ApprovalView => ({ id, run: runId, tool: "Bash", input: {}, risk: "low", reason: "", rule: "x", at: 1, seq: 1 });
const ev = (kind: string, seq: number, body: Record<string, unknown> = {}, at = seq * 1000): AnyEvent =>
  ({ kind, seq, at, run: "r", body } as AnyEvent);

describe("mix desk", () => {
  it("builds a channel per member from real runs only", () => {
    const members = { eli: member("eli", "Eli"), aria: member("aria", "Aria") };
    const runs = {
      a: run("a", "running", { title: "Ship", member: "eli", usage: { inputTokens: 800, outputTokens: 200, costUsd: 1 } }),
      b: run("b", "done", { title: "Old", member: "aria", usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.01 } }),
      child: run("child", "running", { parent: "a", member: "eli" }),
    };
    const ch = mixChannels(members, runs);
    expect(ch.map((c) => c.id)).toEqual(["eli", "aria"]);
    expect(ch[0]).toMatchObject({ name: "Eli", status: "live", title: "Ship", runId: "a", level: 1 });
    expect(ch[1]).toMatchObject({ name: "Aria", status: "idle", title: "", runId: null });
    expect(ch[1]!.level).toBeLessThan(ch[0]!.level);
  });
  it("marks review when the run is waiting on you", () => {
    const ch = mixChannels({ eli: member("eli", "Eli") }, { a: run("a", "awaiting_approval", { member: "eli" }) });
    expect(ch[0]!.status).toBe("review");
  });
  it("reads mute and solo honestly", () => {
    expect(channelOpen("eli", { muted: ["eli"], solo: null })).toBe(false);
    expect(channelOpen("eli", { muted: [], solo: "aria" })).toBe(false);
    expect(channelOpen("eli", { muted: [], solo: "eli" })).toBe(true);
    expect(parseMix({ muted: ["eli", "eli", ""], solo: "eli" })).toEqual({ muted: ["eli"], solo: null });
    expect(routeLaunch("eli", { muted: [], solo: null })).toBe("eli");
    expect(routeLaunch(undefined, { muted: [], solo: "aria" })).toBe("aria");
    expect(() => routeLaunch("eli", { muted: ["eli"], solo: null })).toThrow(/muted/);
  });
  it("does not treat a paused run as live, and VU is today's spend", () => {
    const now = new Date(2026, 8, 25, 15).getTime();
    const ch = mixChannels({ eli: member("eli", "Eli"), aria: member("aria", "Aria") }, {
      p: run("p", "paused", { member: "eli", title: "Held", usage: { inputTokens: 9000, outputTokens: 0, costUsd: 2 }, updatedAt: now }),
      old: run("old", "done", { member: "aria", usage: { inputTokens: 50_000, outputTokens: 0, costUsd: 9 }, updatedAt: now - 3 * 86_400_000 }),
    }, now);
    expect(ch.find((c) => c.id === "eli")).toMatchObject({ status: "idle", title: "" });
    expect(ch.find((c) => c.id === "aria")!.tokens).toBe(0);
  });
  it("calls the master hot only with a real budget", () => {
    expect(masterLevel(900, null)).toEqual({ use: 0, hot: false });
    expect(masterLevel(900, 1000)).toEqual({ use: 0.9, hot: true });
    expect(masterLevel(100, 1000).hot).toBe(false);
  });
});

describe("setlist", () => {
  const now = new Date(2026, 8, 25, 15).getTime();
  it("orders needs-you, now, up-next, then today's finished", () => {
    const members = { eli: member("eli", "Eli"), aria: member("aria", "Aria") };
    const runs = {
      live: run("live", "running", { title: "Ship", member: "eli", createdAt: now - 1000, updatedAt: now }),
      wait: run("wait", "awaiting_approval", { title: "Push", member: "aria", createdAt: now - 2000, updatedAt: now }),
      later: run("later", "queued", { title: "Research", member: "eli", createdAt: now - 500 }),
      done: run("done", "done", { title: "Landed", member: "aria", updatedAt: now - 60_000 }),
      old: run("old", "done", { title: "Yesterday", member: "eli", updatedAt: now - 2 * 86_400_000 }),
    };
    const set = todaysSet(runs, { x: approval("x", "wait") }, members, {}, now);
    expect(set.map((i) => `${i.kind}:${i.id}`)).toEqual(["needs-you:wait", "up-next:live", "up-next:later", "finished:done"]);
    // pinned approval is now-playing, so "now" is wait — already listed as needs-you
    expect(setHeadline(set, 1)).toBe("One thing needs you");
  });
  it("goes quiet when the house is empty", () => {
    expect(todaysSet({}, {}, {}, {}, now)).toEqual([]);
    expect(setHeadline([], 0)).toBe("House lights down");
  });
});

describe("spark producer", () => {
  it("recognises a brief, a record, and a focus block", () => {
    expect(isStudioAsk("what's going on")).toBe(true);
    expect(isStudioAsk("What needs me?")).toBe(true);
    expect(isStudioAsk("design a url shortener")).toBe(false);
    expect(producerMove("put on rain")).toEqual({ kind: "scape", scape: "rain" });
    expect(producerMove("start a 25")).toEqual({ kind: "focus", minutes: 25 });
    expect(producerMove("stop the radio")).toEqual({ kind: "stop-radio" });
    expect(producerMove("put on lofi jazz")).toEqual({ kind: "radio", cmd: "play", station: "jazz" });
    expect(producerMove("play some lo-fi hip hop")).toEqual({ kind: "radio", cmd: "play", station: "hip hop" });
    expect(producerMove("put on some music")).toEqual({ kind: "radio", cmd: "play" });
    expect(producerMove("next song")).toEqual({ kind: "radio", cmd: "next" });
    expect(producerMove("idea: a CRM for dog walkers")).toEqual({ kind: "idea", text: "idea: a CRM for dog walkers" });
    expect(producerMove("my idea is great")).toBeNull();
    expect(producerMove("explain this")).toEqual({ kind: "explain" });
    expect(producerMove("What does this mean?")).toEqual({ kind: "explain" });
    expect(producerMove("explain this concept of kubernetes pods")).toBeNull();
    expect(producerMove("pause the music")).toEqual({ kind: "radio", cmd: "pause" });
    expect(producerMove("play the radio")).toEqual({ kind: "radio", cmd: "play" });
    expect(producerMove("open safari")).toBeNull();
  });
  it("answers from live state and stays quiet when nothing is on", () => {
    const quiet = nowPlaying({}, {}, {});
    expect(studioAnswer({ track: quiet, set: [], waiting: 0, tokens: 0, costUsd: null })).toBe("All quiet. Nobody is on, and nothing is waiting on you.");
    const track = nowPlaying({ a: run("a", "running", { title: "Ship", member: "eli" }) }, {}, { eli: member("eli", "Eli") });
    const text = studioAnswer({ track, set: [{ kind: "up-next", id: "b", title: "Research", who: "Aria", status: "queued", at: 1 }], waiting: 1, tokens: 1200, costUsd: 0.4 });
    expect(text).toContain("Eli");
    expect(text).toContain("Ship");
    expect(text).toContain("One decision");
    expect(text).toContain("Research");
    expect(text).toContain("$0.40");
    expect(crewNowBlock(track, [], 0)).toContain("Ship");
  });
});

describe("cinema", () => {
  it("cuts the film and finds the fight", () => {
    const events = [
      ev("run.created", 1),
      ev("agent.thinking", 2),
      ev("tool.called", 3, { tool: "Edit" }),
      ev("file.changed", 4, { path: "/x/App.tsx" }),
      ev("tool.returned", 5, { ok: false }),
      ev("approval.decided", 6, { allow: false }),
      ev("run.status", 7, { status: "failed" }),
    ];
    const cuts = cinemaCuts(events);
    expect(cuts.map((c) => c.kind)).toEqual(["thought", "tool", "file", "fail", "fail", "fail"]);
    expect(skipToFight(events)).toBe(5);
    expect(runRecap(events, "Ship")).toMatch(/The fight: Tool failed/);
    expect(skipToFight([ev("agent.message", 1, { final: true })])).toBeNull();
  });
});

describe("crate + album", () => {
  it("keeps recently used things and drops the rest", () => {
    const now = 10 * 86_400_000;
    expect(recentlyPlayed([{ updatedAt: now - 1000 }, { updatedAt: now - 8 * 86_400_000 }], now).map((a) => a.updatedAt)).toEqual([now - 1000]);
  });
  it("uses the venture as album art when there is one", () => {
    const r = run("a", "running", { venture: "v", member: "eli" });
    expect(albumOf(r, { eli: member("eli", "Eli") }, { v: { id: "v", name: "Nectar", emoji: "hexagon", color: "#88f" } as never })).toEqual({ emoji: "hexagon", color: "#88f", label: "Nectar" });
    expect(albumOf(undefined, {}, {})).toBeNull();
  });
});
