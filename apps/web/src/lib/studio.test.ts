import { describe, expect, it } from "vitest";
import type { AnyEvent } from "@shuacrew/core/events";
import type { ApprovalView, CrewMember, RunView } from "@shuacrew/core/projections";
import { nowPlaying } from "./now-playing";
import {
  albumOf, channelOpen, cinemaCuts, crewNowBlock, isStudioAsk, masterLevel, mixChannels,
  parseMix, producerMove, recentlyPlayed, routeLaunch, runRecap, setHeadline, skipToFight, studioAnswer, timerMove, todaysSet,
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
    for (const ask of ["turn off the radio", "turn the radio off", "Can you turn off the radio please", "shut off the lofi", "radio off", "switch the radio off"]) expect(producerMove(ask)).toEqual({ kind: "stop-radio" });
    for (const ask of ["turn it off", "turn off the music", "turn the music off"]) expect(producerMove(ask)).toEqual({ kind: "player", cmd: "pause" });
    expect(producerMove("play Drake")).toEqual({ kind: "play", query: "Drake" });
    expect(producerMove("hey shua play some jazz on spotify")).toEqual({ kind: "play", query: "jazz", app: "Spotify" });
    expect(producerMove("play something")).toEqual({ kind: "player", cmd: "resume" });
    expect(producerMove("toggle voice mode")).toEqual({ kind: "voice", on: "toggle" });
    expect(producerMove("Hey Shua, can you turn on voice mode please?")).toEqual({ kind: "voice", on: true });
    expect(producerMove("let's talk")).toEqual({ kind: "voice", on: true });
    expect(producerMove("stop voice mode")).toEqual({ kind: "voice", on: false });
    expect(producerMove("what is voice mode")).toBeNull();
    expect(producerMove("stop talking")).toEqual({ kind: "hush" });
    expect(producerMove("open music artist by drake")).toEqual({ kind: "browse", query: "drake", app: "Music" });
    expect(producerMove("Hey Shua, open Drake in Apple Music please")).toEqual({ kind: "browse", query: "Drake", app: "Music" });
    expect(producerMove("show me taylor swift on spotify")).toEqual({ kind: "browse", query: "taylor swift", app: "Spotify" });
    expect(producerMove("pull up the album Scorpion")).toEqual({ kind: "browse", query: "Scorpion" });
    expect(producerMove("open safari")).toBeNull();
    expect(producerMove("shh")).toEqual({ kind: "hush" });
    expect(producerMove("put on lofi jazz")).toEqual({ kind: "radio", cmd: "play", station: "jazz" });
    expect(producerMove("play some lo-fi hip hop")).toEqual({ kind: "radio", cmd: "play", station: "hip hop" });
    expect(producerMove("put on some music")).toEqual({ kind: "radio", cmd: "play" });
    expect(producerMove("next song")).toEqual({ kind: "player", cmd: "next" });
    expect(producerMove("idea: a CRM for dog walkers")).toEqual({ kind: "idea", text: "idea: a CRM for dog walkers" });
    expect(producerMove("my idea is great")).toBeNull();
    expect(producerMove("explain this")).toEqual({ kind: "explain" });
    expect(producerMove("What does this mean?")).toEqual({ kind: "explain" });
    expect(producerMove("explain this concept of kubernetes pods")).toBeNull();
    expect(producerMove("pause the music")).toEqual({ kind: "player", cmd: "pause" });
    expect(producerMove("Hey Shua, can you pause the music please?")).toEqual({ kind: "player", cmd: "pause" });
    expect(producerMove("pause spotify")).toEqual({ kind: "player", cmd: "pause" });
    expect(producerMove("pause")).toEqual({ kind: "player", cmd: "pause" });
    expect(producerMove("stop the music")).toEqual({ kind: "player", cmd: "pause" });
    expect(producerMove("resume the music")).toEqual({ kind: "player", cmd: "resume" });
    expect(producerMove("skip")).toEqual({ kind: "player", cmd: "next" });
    expect(producerMove("go back")).toEqual({ kind: "player", cmd: "previous" });
    expect(producerMove("pause the radio")).toEqual({ kind: "radio", cmd: "pause" });
    expect(producerMove("pause and explain what this error means")).toBeNull();
    expect(producerMove("stop the radio")).toEqual({ kind: "stop-radio" });
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
import { describe as describeMusic, expect as expectMusic, it as itMusic } from "vitest";
import { producerMove as move } from "./studio";
describeMusic("Apple Music by asking", () => {
  itMusic("plays a playlist, shuffles, repeats, favourites, saves, and knows the song", () => {
    expectMusic(move("play my workout playlist")).toEqual({ kind: "music", command: "playlist", query: "workout" });
    expectMusic(move("hey shua put on my chill vibes playlist please")).toEqual({ kind: "music", command: "playlist", query: "chill vibes" });
    expectMusic(move("shuffle on")).toEqual({ kind: "music", command: "shuffle", on: true });
    expectMusic(move("turn off shuffle")).toEqual({ kind: "music", command: "shuffle", on: false });
    expectMusic(move("repeat this song")).toEqual({ kind: "music", command: "repeat", mode: "one" });
    expectMusic(move("stop repeating")).toEqual({ kind: "music", command: "repeat", mode: "off" });
    expectMusic(move("love this song")).toEqual({ kind: "music", command: "love" });
    expectMusic(move("add this to my library")).toEqual({ kind: "music", command: "add_to_library" });
    expectMusic(move("what's this song?")).toEqual({ kind: "whatsong" });
    expectMusic(move("who sings this")).toEqual({ kind: "whatsong" });
    expectMusic(move("play Drake")).toEqual({ kind: "play", query: "Drake" });
  });
});
import { it as itFolder, expect as expectFolder } from "vitest";
import { producerMove as moveFolder } from "./studio";
itFolder("makes a folder directly, where you said", () => {
  expectFolder(moveFolder("open Finder and make a new folder called test on my Desktop")).toBeNull(); // compound: Spark handles it
  expectFolder(moveFolder("make a new folder called test on my desktop")).toEqual({ kind: "folder", name: "test", in: "~/Desktop" });
  expectFolder(moveFolder("create a folder named Taxes 2026 in documents")).toEqual({ kind: "folder", name: "Taxes 2026", in: "~/Documents" });
  expectFolder(moveFolder("make a folder called Receipts")).toEqual({ kind: "folder", name: "Receipts" });
});

describe("another song means another of yours", () => {
  it("never searches for a song literally called 'another song'", () => {
    expect(producerMove("play another song")).toEqual({ kind: "music", command: "play_similar", by: "artist" });
    expect(producerMove("play a different song")).toEqual({ kind: "music", command: "play_similar", by: "artist" });
    expect(producerMove("play something else")).toEqual({ kind: "music", command: "play_similar", by: "vibe" });
    expect(producerMove("play something like this")).toEqual({ kind: "music", command: "play_similar", by: "vibe" });
    expect(producerMove("play something similar")).toEqual({ kind: "music", command: "play_similar", by: "vibe" });
  });
  it("'another song by X' plays one of X's", () => {
    expect(producerMove("play another song by Drake")).toEqual({ kind: "play", query: "Drake" });
  });
  it("still plays named songs and artists as before", () => {
    expect(producerMove("play Drake")).toEqual({ kind: "play", query: "Drake" });
    expect(producerMove("play Ain't Nun by Sleepy Hallow")).toEqual({ kind: "play", query: "Ain't Nun by Sleepy Hallow" });
  });
});

describe("moods and two asks at once", () => {
  it("hands two asks in one sentence to the model instead of searching for the whole sentence", () => {
    expect(producerMove("Play something chill and remind me to stretch in 20 minutes")).toBeNull();
    expect(producerMove("play Drake then set a timer for 10 minutes")).toBeNull();
    expect(producerMove("play Simon and Garfunkel")).toEqual({ kind: "play", query: "Simon and Garfunkel" });
  });
  it("plays a mood from the library by genre, never as a song title", () => {
    expect(producerMove("play something chill")).toEqual({ kind: "music", command: "play_similar", by: "vibe", mood: "chill" });
    expect(producerMove("play chill music")).toEqual({ kind: "music", command: "play_similar", by: "vibe", mood: "chill" });
    expect(producerMove("put on some upbeat songs")).toEqual({ kind: "music", command: "play_similar", by: "vibe", mood: "upbeat" });
    expect(producerMove("play some jazz")).toEqual({ kind: "play", query: "jazz" });
  });
});

describe("timers and alarms, instantly", () => {
  const at = new Date(2026, 8, 29, 17, 0).getTime();
  it("hears timers the way you say them", () => {
    expect(producerMove("set a timer for 7 minutes")).toEqual({ kind: "timer", op: "start", seconds: 420 });
    expect(producerMove("set a pasta timer for 9 minutes")).toEqual({ kind: "timer", op: "start", seconds: 540, label: "pasta" });
    expect(producerMove("10 minute timer")).toEqual({ kind: "timer", op: "start", seconds: 600 });
    expect(producerMove("timer for an hour and a half")).toEqual({ kind: "timer", op: "start", seconds: 5400 });
  });
  it("sets alarms for the next time it comes round", () => {
    expect(timerMove("wake me up at 7", at)).toEqual({ kind: "timer", op: "alarm", at: "19:00" }); // at 5 pm, "7" is next at 7 pm
    expect(timerMove("wake me up at 7 am", at)).toEqual({ kind: "timer", op: "alarm", at: "07:00" });
  });
  it("cancels, pauses and says what's left", () => {
    expect(producerMove("cancel the pasta timer")).toEqual({ kind: "timer", op: "cancel", label: "pasta" });
    expect(producerMove("cancel the timer")).toEqual({ kind: "timer", op: "cancel" });
    expect(producerMove("pause the timer")).toEqual({ kind: "timer", op: "pause" });
    expect(producerMove("how much time is left?")).toEqual({ kind: "timer", op: "list" });
    expect(producerMove("set an alarm for 6:30 pm")).toEqual({ kind: "timer", op: "alarm", at: "18:30" });
  });
});

describe("Mac controls, instantly", () => {
  it("hears everyday controls", () => {
    expect(producerMove("set the volume to 30")).toEqual({ kind: "sys", what: "volume", level: 30 });
    expect(producerMove("lock my Mac")).toEqual({ kind: "sys", what: "lock" });
    expect(producerMove("take a screenshot")).toEqual({ kind: "sys", what: "screenshot" });
    expect(producerMove("turn off wifi")).toEqual({ kind: "sys", what: "wifi", on: false });
    expect(producerMove("unmute")).toEqual({ kind: "sys", what: "mute", on: false });
  });
});

it("turns Bluetooth on and off instantly", () => {
  expect(producerMove("Can you turn on Bluetooth")).toEqual({ kind: "sys", what: "bluetooth", on: true });
  expect(producerMove("bluetooth off")).toEqual({ kind: "sys", what: "bluetooth", on: false });
});

import { factMove } from "./studio";
describe("instant facts", () => {
  it("answers the everyday questions without a model", () => {
    expect(factMove("What time is it?")).toBe("time");
    expect(factMove("hey shua, what's the date")).toBe("date");
    expect(factMove("what day is it today")).toBe("date");
    expect(factMove("When's my next meeting?")).toBe("next");
    expect(factMove("what's on my calendar today")).toBe("next");
    expect(factMove("how many cards are due")).toBe("cards");
    expect(factMove("What's the crew doing?")).toBe("crew");
    expect(factMove("does anything need me")).toBe("waiting");
    expect(factMove("Brief me")).toBe("morning");
    expect(factMove("good morning")).toBe("morning");
    expect(producerMove("what time is it")).toEqual({ kind: "fact", what: "time" });
  });
  it("leaves real questions to the model", () => {
    expect(factMove("what time does the Apple store close")).toBeNull();
    expect(factMove("what's the date of the next AWS re:Invent")).toBeNull();
    expect(factMove("why is the crew doing that")).toBeNull();
  });
});
