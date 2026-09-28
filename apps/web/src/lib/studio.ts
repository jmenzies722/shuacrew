import type { AnyEvent } from "@shuacrew/core/events";
import type { ApprovalView, CrewMember, PlayView, RunView, VentureView } from "@shuacrew/core/projections";
import { useSyncExternalStore } from "react";
import { isTopLevelWork } from "./crew";
import { nextTrack, nowPlaying, type Track } from "./now-playing";
import type { Scape } from "./soundscape";

const LIVE = ["awaiting_approval", "running", "planning", "queued"] as const;
const RANK: Record<string, number> = { awaiting_approval: 0, running: 1, planning: 2, queued: 3, paused: 4 };

export interface MixChannel {
  id: string;
  name: string;
  emoji: string;
  color: string;
  role: string;
  status: "live" | "review" | "idle";
  title: string;
  runId: string | null;
  model: string;
  runtime: string;
  tokens: number;
  costUsd: number | null;
  /** 0–1, relative to the loudest channel today. Quiet channels stay at 0. */
  level: number;
}

/** Who a named launch goes to, after mute/solo. Throws if that member is muted. */
export function routeLaunch(member: string | undefined, prefs: MixPrefs): string | undefined {
  if (member && !channelOpen(member, prefs)) throw new Error("That member is muted on the mix desk.");
  if (!member && prefs.solo) return prefs.solo;
  return member;
}

/** One strip per crew member, from live runs only. Nobody is invented. */
export function mixChannels(members: Record<string, CrewMember>, runs: Record<string, RunView>, now = Date.now()): MixChannel[] {
  const day = startOfDay(now);
  const byMember = new Map<string, RunView[]>();
  for (const run of Object.values(runs)) {
    if (!run.member || !members[run.member] || !isTopLevelWork(run, runs)) continue;
    (byMember.get(run.member) ?? byMember.set(run.member, []).get(run.member)!).push(run);
  }
  const channels = Object.values(members).map((m) => {
    const list = (byMember.get(m.id) ?? []).sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || b.updatedAt - a.updatedAt);
    const live = list.find((r) => (LIVE as readonly string[]).includes(r.status));
    const today = list.filter((r) => r.updatedAt >= day || (LIVE as readonly string[]).includes(r.status));
    const tokens = today.reduce((n, r) => n + r.usage.inputTokens + r.usage.outputTokens, 0);
    const costs = today.map((r) => r.usage.costUsd).filter((n): n is number => n != null);
    const review = live?.status === "awaiting_approval" || (live?.pendingApprovals.length ?? 0) > 0;
    return {
      id: m.id,
      name: m.name,
      emoji: m.emoji,
      color: m.color,
      role: m.role,
      status: live ? (review ? "review" as const : "live" as const) : "idle" as const,
      title: live?.title ?? "",
      runId: live?.id ?? null,
      model: live?.model || m.model || "",
      runtime: live?.runtime || m.runtime || "",
      tokens,
      costUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      level: 0,
    };
  });
  const peak = Math.max(1, ...channels.map((c) => c.tokens));
  for (const c of channels) c.level = c.tokens ? c.tokens / peak : 0;
  return channels.sort((a, b) => (a.status === "idle" ? 1 : 0) - (b.status === "idle" ? 1 : 0) || b.tokens - a.tokens || a.name.localeCompare(b.name));
}

/** How hard the master is driven. 0 = no budget or nothing spent; 1 = exactly at budget. */
export function masterLevel(tokensToday: number, budget: number | null): { use: number; hot: boolean } {
  if (!budget || budget <= 0) return { use: 0, hot: false };
  const use = tokensToday / budget;
  return { use, hot: use >= 0.85 };
}

export interface MixPrefs { muted: string[]; solo: string | null }
const MIX_KEY = "shuacrew.mix";
const mixListeners = new Set<() => void>();
export function parseMix(value: unknown): MixPrefs {
  const v = value && typeof value === "object" ? value as { muted?: unknown; solo?: unknown } : {};
  const muted = Array.isArray(v.muted) ? [...new Set(v.muted.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 64))] : [];
  const solo = typeof v.solo === "string" && v.solo && !muted.includes(v.solo) ? v.solo : null;
  return { muted, solo };
}
let mixCurrent = (() => { try { return parseMix(JSON.parse(localStorage.getItem(MIX_KEY) ?? "null")); } catch { return parseMix(null); } })();
export function getMix() { return mixCurrent; }
export function saveMix(patch: Partial<MixPrefs>) {
  mixCurrent = parseMix({ ...mixCurrent, ...patch });
  try { localStorage.setItem(MIX_KEY, JSON.stringify(mixCurrent)); } catch { /* ignore */ }
  mixListeners.forEach((l) => l());
}
export function toggleMute(id: string) {
  const muted = mixCurrent.muted.includes(id) ? mixCurrent.muted.filter((x) => x !== id) : [...mixCurrent.muted, id];
  saveMix({ muted, solo: mixCurrent.solo === id ? null : mixCurrent.solo });
}
export function toggleSolo(id: string) {
  saveMix({ solo: mixCurrent.solo === id ? null : id, muted: mixCurrent.muted.filter((x) => x !== id) });
}
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === MIX_KEY) { mixCurrent = (() => { try { return parseMix(JSON.parse(e.newValue ?? "null")); } catch { return parseMix(null); } })(); mixListeners.forEach((l) => l()); } });
export function useMix() { return useSyncExternalStore((l) => { mixListeners.add(l); return () => { mixListeners.delete(l); }; }, () => mixCurrent, () => mixCurrent); }

/** Can this member take new work, given mute/solo. Running work is never faked off. */
export function channelOpen(id: string, prefs: MixPrefs): boolean {
  if (prefs.muted.includes(id)) return false;
  if (prefs.solo) return prefs.solo === id;
  return true;
}

export type SetKind = "now" | "needs-you" | "up-next" | "finished" | "play";
export interface SetItem {
  kind: SetKind;
  id: string;
  title: string;
  who: string;
  status: string;
  at: number;
}

const startOfDay = (now: number) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Tonight's set: what needs you, what's on, what's queued, what already played, one optional encore. */
export function todaysSet(
  runs: Record<string, RunView>,
  approvals: Record<string, ApprovalView>,
  members: Record<string, CrewMember>,
  plays: Record<string, PlayView>,
  now: number,
): SetItem[] {
  const who = (r: RunView) => (r.member ? members[r.member]?.name ?? "" : r.runtime);
  const day = startOfDay(now);
  const top = Object.values(runs).filter((r) => isTopLevelWork(r, runs));
  const track = nowPlaying(runs, approvals, members);
  const items: SetItem[] = [];
  const seen = new Set<string>();
  const push = (item: SetItem) => { if (seen.has(item.id)) return; seen.add(item.id); items.push(item); };

  for (const a of Object.values(approvals).sort((a, b) => a.at - b.at)) {
    const run = a.run ? runs[a.run] : undefined;
    if (run && isTopLevelWork(run, runs)) push({ kind: "needs-you", id: run.id, title: run.title || a.tool, who: who(run), status: run.status, at: a.at });
  }
  if (track.id) push({ kind: "now", id: track.id, title: track.title, who: track.who, status: track.status, at: track.startedAt });
  for (const r of top.filter((r) => ["queued", "planning", "running"].includes(r.status)).sort((a, b) => a.createdAt - b.createdAt)) {
    push({ kind: "up-next", id: r.id, title: r.title || "Untitled", who: who(r), status: r.status, at: r.createdAt });
  }
  for (const p of Object.values(plays).filter((p) => p.status === "waiting" || p.status === "running").sort((a, b) => a.updatedAt - b.updatedAt)) {
    push({ kind: "play", id: p.id, title: p.title || p.name, who: p.emoji ? p.name : "playbook", status: p.status, at: p.updatedAt });
  }
  for (const r of top.filter((r) => ["done", "failed", "merged"].includes(r.status) && r.updatedAt >= day).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)) {
    push({ kind: "finished", id: r.id, title: r.title || "Untitled", who: who(r), status: r.status, at: r.updatedAt });
  }
  return items;
}

export function setHeadline(items: SetItem[], waiting: number): string {
  if (waiting) return waiting === 1 ? "One thing needs you" : `${waiting} things need you`;
  const now = items.find((i) => i.kind === "now");
  if (now) return now.title;
  if (items.some((i) => i.kind === "up-next" || i.kind === "play")) return "A few things are cued";
  if (items.some((i) => i.kind === "finished")) return "The set is done";
  return "House lights down";
}

/** Questions Spark should answer from live state, not a new chat. */
export function isStudioAsk(q: string): boolean {
  return /^(what('?s| is) going on|what('?s| is) (on|playing)|who('?s| is) (working|on|playing)|status of the crew|what needs me|what needs (you|us)|give me the (room|desk|brief))\b/i.test(q.trim());
}

export type ProducerMove =
  | { kind: "brief" }
  | { kind: "scape"; scape: Scape }
  | { kind: "stop-radio" }
  | { kind: "radio"; cmd: "play" | "pause" | "resume" | "next" | "previous"; station?: string }
  /** Whatever's playing — ShuaCrew Radio, Music or Spotify — decided at the moment it runs. */
  | { kind: "player"; cmd: "pause" | "resume" | "next" | "previous" }
  /** Voice mode on / off / toggle: a live spoken conversation. Done instantly, never left to a model to claim. */
  | { kind: "voice"; on: boolean | "toggle" }
  /** "Stop talking", "be quiet", "shh": stop what Spark is saying or doing, right now. */
  | { kind: "hush" }
  /** "open music artist by Drake", "show me Drake on Spotify": open that artist / album / search in the music app. */
  | { kind: "browse"; query: string; app?: "Spotify" | "Music" }
  /** "play Drake", "play some jazz on Spotify": search and play in the music app, right away. */
  | { kind: "play"; query: string; app?: "Spotify" | "Music" }
  | { kind: "focus"; minutes: number }
  | { kind: "idea"; text: string }
  | { kind: "explain" };

/** Spoken commands come wrapped in politeness: "hey Shua, can you pause the music please". Unwrap to the command. */
export function commandText(q: string): string {
  return q.trim()
    .replace(/^(hey|hi|ok|okay|yo)[,!\s]+/i, "").replace(/^(shua|spark)[,!:\s]+/i, "")
    .replace(/^(can|could|would|will) you( please)?\s+/i, "").replace(/^please\s+/i, "").replace(/^(go ahead and|just)\s+/i, "")
    .replace(/[.!?]+$/, "").replace(/[\s,]+(please|for me|now|right now|thanks|thank you)\s*$/i, "").replace(/[.!?,]+$/, "").trim();
}
export function producerMove(q: string): ProducerMove | null {
  const t = commandText(q);
  if (isStudioAsk(t)) return { kind: "brief" };
  if (/^(new\s+)?idea\s*[:\-–—]\s*\S/i.test(t)) return { kind: "idea", text: t };
  if (/^(explain|break down|what does|what's|what is)\s+(this|that|the selection|what i (selected|highlighted))( (mean|do|code))?\s*[?.!]*$/i.test(t)) return { kind: "explain" };
  if (/^(stop talking|stop speaking|be quiet|quiet|shh+|shush|hush|stop|cancel|never ?mind|nevermind)$/i.test(t)) return { kind: "hush" };
  const VOICE = "(the )?(voice|talk|talking|conversation|hands[- ]?free|live voice)( mode| chat)?";
  if (new RegExp(`^(toggle|switch) ${VOICE}$`, "i").test(t)) return { kind: "voice", on: "toggle" };
  if (new RegExp(`^(turn on|start|enable|switch on|go (in)?to|open|use) ${VOICE}$`, "i").test(t) || /^(let'?s talk|talk to me|i want to talk)$/i.test(t)) return { kind: "voice", on: true };
  if (new RegExp(`^(turn off|stop|end|disable|switch off|exit|leave|close) ${VOICE}$`, "i").test(t)) return { kind: "voice", on: false };
  if (/^(stop|kill|turn off) (the )?(radio|soundscape|record)\b/i.test(t)) return { kind: "stop-radio" };
  // Music/Spotify or the radio — whichever is actually playing.
  const MEDIA = "(the |my |this )?(music|song|track|tune|spotify|apple music|playback|audio|it|that)";
  if (new RegExp(`^(pause|stop|hold)( ${MEDIA})?$`, "i").test(t)) return { kind: "player", cmd: "pause" };
  if (new RegExp(`^(resume|unpause|continue|keep playing)( ${MEDIA})?$`, "i").test(t) || new RegExp(`^(play|start) ${MEDIA} again$`, "i").test(t)) return { kind: "player", cmd: "resume" };
  if (new RegExp(`^(next|skip)( ${MEDIA}| one)?$`, "i").test(t) || /^play the next (song|track)$/i.test(t)) return { kind: "player", cmd: "next" };
  if (/^(previous|go back|last|back)( (song|track|one))?$/i.test(t) || /^play the (previous|last) (song|track)$/i.test(t)) return { kind: "player", cmd: "previous" };
  // ShuaCrew Radio: your own lofi stations.
  const lofi = /^(put on|play|start|tune (in )?to)( some| the| my)? (lo-?fi)( radio)?\s*(jazz|hip[\s-]?hop)?\b/i.exec(t);
  if (lofi) return { kind: "radio", cmd: "play", station: lofi[6] ? (/jazz/i.test(lofi[6]) ? "jazz" : "hip hop") : undefined };
  if (/^(put on|play|start|turn on)( some| the| my)? (music|radio|shuacrew radio)\b/i.test(t)) return { kind: "radio", cmd: "play" };
  if (/^pause( the)? radio$/i.test(t)) return { kind: "radio", cmd: "pause" };
  if (/^(resume|unpause)( the)? radio$/i.test(t)) return { kind: "radio", cmd: "resume" };
  const appOf = (a?: string) => (a ? (/spotify/i.test(a) ? "Spotify" as const : "Music" as const) : undefined);
  const browse = /^(?:open|show(?: me)?|go to|pull up|find|look up|bring up)\s+(?:the\s+)?(?:(apple music|music|spotify)\s+)?(?:the\s+)?(artist|album|playlist|song|track)s?\s+(?:by\s+|called\s+|named\s+|for\s+)?(.{2,60}?)(?:'s page)?(?:\s+(?:in|on)\s+(spotify|apple music|music))?$/i.exec(t)
    ?? /^(?:open|show(?: me)?|go to|pull up|find|look up|bring up)\s+()()(.{2,60}?)(?:'s page)?\s+(?:in|on)\s+(spotify|apple music|music)$/i.exec(t);
  if (browse) { const app = appOf(browse[4] || browse[1]); return { kind: "browse", query: browse[3]!.trim(), ...(app ? { app } : {}) }; }
  if (/^(play|put on) (something|anything|some music|music|a song)$/i.test(t)) return { kind: "player", cmd: "resume" };
  const play = /^(?:play|put on|queue up)\s+(?:some\s+|me\s+|the song\s+|the album\s+)?(.{2,80}?)(?:\s+(?:on|in|from)\s+(spotify|apple music|music))?$/i.exec(t);
  if (play && !/^(the )?(radio|lo-?fi|rain|brown|caf[eé]|soundscape|focus)\b/i.test(play[1]!)) return { kind: "play", query: play[1]!.trim(), ...(play[2] ? { app: /spotify/i.test(play[2]) ? "Spotify" as const : "Music" as const } : {}) };
  const scape = /^(put on|play|start) (the )?(brown|rain|caf[eé]|soundscape)\b/i.exec(t);
  if (scape) {
    const name = scape[3]!.toLowerCase();
    return { kind: "scape", scape: name.startsWith("caf") ? "cafe" : name === "rain" ? "rain" : "brown" };
  }
  const focus = /^(start|begin|put on) (a )?(\d{1,2})(\s*-?\s*minute|\s*min)?\b/i.exec(t);
  if (focus) {
    const minutes = Number(focus[3]);
    if ([5, 10, 15, 25, 45, 50, 60, 90].includes(minutes)) return { kind: "focus", minutes };
  }
  if (/^(start|begin|put on) (a )?(focus|pomodoro|25)\b/i.test(t)) return { kind: "focus", minutes: 25 };
  return null;
}

export function studioAnswer(input: {
  track: Track;
  set: SetItem[];
  waiting: number;
  tokens: number;
  costUsd: number | null;
  next?: { kind: string; id: string } | null;
}): string {
  const { track, set, waiting, tokens, costUsd } = input;
  if (!track.id && !waiting && !set.length) return "All quiet. Nobody is on, and nothing is waiting on you.";
  const bits: string[] = [];
  if (track.id) bits.push(`${track.who || "The crew"} is ${track.label} “${track.title}.”`);
  else bits.push("Nothing is on right now.");
  if (waiting) bits.push(waiting === 1 ? "One decision is waiting on you." : `${waiting} decisions are waiting on you.`);
  const next = set.find((i) => i.kind === "up-next" || i.kind === "play");
  if (next) bits.push(`Up next: ${next.title}.`);
  const finished = set.filter((i) => i.kind === "finished").length;
  if (finished) bits.push(`${finished} already played today.`);
  if (costUsd != null) bits.push(`Today has cost $${costUsd.toFixed(2)}.`);
  else if (tokens) bits.push(`${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(tokens)} tokens so far today.`);
  return bits.join(" ");
}

/** A compact block Spark can ground in when a question does go to the model. */
export function crewNowBlock(track: Track, set: SetItem[], waiting: number): string {
  const lines = [
    `CREW NOW — live, not a guess. Mood ${track.mood}. ${track.id ? `On: “${track.title}” (${track.who || "the crew"}, ${track.label}).` : "Nothing on."}`,
    waiting ? `${waiting} approval${waiting === 1 ? "" : "s"} waiting.` : "Nothing waiting on Josh.",
    set.length ? `Set: ${set.slice(0, 6).map((i) => `${i.kind} “${i.title}”`).join(" · ")}.` : "Empty set.",
  ];
  return lines.join(" ");
}

export type CutKind = "thought" | "tool" | "file" | "approval" | "result" | "fail";
export interface Cut { seq: number; kind: CutKind; at: number; label: string }

const CUT_KIND: Partial<Record<string, CutKind>> = {
  "agent.thinking": "thought",
  "agent.message": "thought",
  "tool.called": "tool",
  "file.changed": "file",
  "approval.requested": "approval",
  "turn.completed": "result",
  "run.status": "result",
};

/** The film of a session: one cut per event that changed what you would watch. */
export function cinemaCuts(events: AnyEvent[]): Cut[] {
  const out: Cut[] = [];
  for (const e of events) {
    const b = e.body as Record<string, unknown>;
    if (e.kind === "tool.returned" && b.ok === false) { out.push({ seq: e.seq, kind: "fail", at: e.at, label: "Tool failed" }); continue; }
    if (e.kind === "approval.decided" && b.allow === false) { out.push({ seq: e.seq, kind: "fail", at: e.at, label: "Denied" }); continue; }
    if (e.kind === "check.ran" && b.passed === false) { out.push({ seq: e.seq, kind: "fail", at: e.at, label: `Failed ${b.command ?? "check"}` }); continue; }
    if (e.kind === "run.status" && b.status === "failed") { out.push({ seq: e.seq, kind: "fail", at: e.at, label: "Session failed" }); continue; }
    const kind = CUT_KIND[e.kind];
    if (!kind) continue;
    if (e.kind === "agent.delta") continue;
    let label = e.kind.replace(/\./g, " ");
    if (e.kind === "tool.called") label = `Called ${b.tool ?? "a tool"}`;
    else if (e.kind === "file.changed") label = `Changed ${String(b.path ?? "").split("/").pop() || "a file"}`;
    else if (e.kind === "approval.requested") label = `Asked to use ${b.tool ?? "a tool"}`;
    else if (e.kind === "agent.message") label = b.final ? "Answered" : "Wrote";
    else if (e.kind === "agent.thinking") label = "Thinking";
    else if (e.kind === "turn.completed") label = "Turn finished";
    else if (e.kind === "run.status") label = `Now ${b.status}`;
    out.push({ seq: e.seq, kind, at: e.at, label });
  }
  return out;
}

/** First failure or deny — the fight. Null if the take was clean. */
export function skipToFight(events: AnyEvent[]): number | null {
  return cinemaCuts(events).find((c) => c.kind === "fail")?.seq ?? null;
}

/** A short recap you can read in about thirty seconds. */
export function runRecap(events: AnyEvent[], title: string): string {
  const cuts = cinemaCuts(events);
  const tools = cuts.filter((c) => c.kind === "tool").length;
  const files = cuts.filter((c) => c.kind === "file").length;
  const fight = cuts.find((c) => c.kind === "fail");
  const last = events.at(-1);
  const status = last?.kind === "run.status" ? String((last.body as { status?: string }).status ?? "") : "";
  const ended = status === "done" ? "It finished." : status === "failed" ? "It failed." : status === "cancelled" ? "It was stopped." : "It's still on.";
  const bits = [`“${title || "Untitled"}.”`];
  if (tools) bits.push(`${tools} tool call${tools === 1 ? "" : "s"}.`);
  if (files) bits.push(`${files} file${files === 1 ? "" : "s"} changed.`);
  if (fight) bits.push(`The fight: ${fight.label}.`);
  else bits.push("No failures recorded.");
  bits.push(ended);
  return bits.join(" ");
}

export function recentlyPlayed<T extends { updatedAt: number }>(items: T[], now: number, limit = 6): T[] {
  return [...items].filter((a) => now - a.updatedAt < 7 * 86_400_000).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

export function nextInSet(runs: Record<string, RunView>, approvals: Record<string, ApprovalView>, current: string | null) {
  return nextTrack(runs, approvals, current);
}

export function albumOf(run: RunView | undefined, members: Record<string, CrewMember>, ventures: Record<string, VentureView>): { emoji: string; color: string; label: string } | null {
  if (!run) return null;
  const v = run.venture ? ventures[run.venture] : undefined;
  if (v) return { emoji: v.emoji, color: v.color, label: v.name };
  const m = run.member ? members[run.member] : undefined;
  if (m) return { emoji: m.emoji, color: m.color, label: m.name };
  return null;
}
