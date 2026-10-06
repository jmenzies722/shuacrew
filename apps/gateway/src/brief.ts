/**
 * "What's going on?" in one answer, for Shua to speak or show: what's working right now and on what step, what is
 * waiting on you and why, what finished (and how it went), what failed, what's queued, today's usage and limits, and
 * what runs next on its own. Built only from recorded state, so every name and number in it is real.
 */
import type { CrewState, RunView } from "@shuacrew/core";
import type { FastifyInstance } from "fastify";

export interface BriefInput {
  state: CrewState;
  now: number;
  /** Count finished and failed work since this moment (default: the start of today, on this Mac). */
  since?: number;
  schedules?: Array<{ name: string; paused: boolean; next: number[] }>;
}
export interface Brief {
  headline: string;
  working: Array<{ id: string; title: string; who: string; step: string; minutes: number }>;
  waiting: Array<{ id: string; run: string | null; title: string; tool: string; what: string; why: string }>;
  finished: Array<{ id: string; title: string; who: string; result: string; files: number; checks: string }>;
  failed: Array<{ id: string; title: string; why: string }>;
  queued: number;
  today: { tokens: number; sessions: number; resting: string[] };
  next: Array<{ name: string; at: number }>;
  /** The whole brief as plain lines, ready to read aloud or hand to the model. */
  text: string;
}

const WORKING = new Set(["running", "planning"]);
const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** What an approval is asking to do, in words: the command, the file, or the tool. */
export function asking(tool: string, input: unknown): string {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (typeof o.command === "string") return `run \`${clip(o.command, 80)}\``;
  const file = o.file_path ?? o.path;
  if (typeof file === "string") return `${/Edit|Write|apply_patch/.test(tool) ? "change" : "open"} ${file.split("/").pop()}`;
  if (typeof o.url === "string") return `open ${o.url}`;
  return `use ${tool.replace(/^mcp__/, "").replaceAll("__", " · ")}`;
}

export function crewBrief({ state, now, since = startOfDay(now), schedules = [] }: BriefInput): Brief {
  const runs = Object.values(state.runs).filter((r) => !r.parent && !r.labels.includes("buddy"));
  const who = (r: RunView) => (r.member && state.members[r.member]?.name) || (r.runtime === "claude" ? "Claude" : r.runtime === "codex" ? "Codex" : r.runtime);
  const working = runs.filter((r) => WORKING.has(r.status)).sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => ({ id: r.id, title: r.title, who: who(r), step: clip(r.currentTool ? `using ${r.currentTool.replace(/^mcp__/, "")}` : r.ticker || "thinking", 90), minutes: Math.max(0, Math.round((now - r.createdAt) / 60_000)) }));
  const waiting = Object.values(state.approvals).sort((a, b) => a.at - b.at)
    .map((a) => ({ id: a.id, run: a.run, title: (a.run && state.runs[a.run]?.title) || "A session", tool: a.tool, what: asking(a.tool, a.input), why: a.reason }));
  const finished = runs.filter((r) => (r.status === "done" || r.status === "merged" || r.status === "reviewing") && r.updatedAt >= since).sort((a, b) => b.updatedAt - a.updatedAt)
    .map((r) => { const passed = r.checks.filter((c) => c.passed).length;
      return { id: r.id, title: r.title, who: who(r), result: clip(r.ticker || "finished", 140), files: r.files.length, checks: r.checks.length ? `${passed}/${r.checks.length} checks passed` : "" }; });
  const failed = runs.filter((r) => r.status === "failed" && r.updatedAt >= since).map((r) => ({ id: r.id, title: r.title, why: clip(r.statusReason || r.ticker || "it stopped with an error", 120) }));
  const queued = runs.filter((r) => r.status === "queued" || r.status === "paused").length;
  const resting = Object.entries(state.limited ?? {}).filter(([, w]) => w.until > now).map(([k, w]) => `${k.split(" · ")[0]} until ${time(w.until)}`);
  const today = { tokens: state.today.tokens, sessions: runs.filter((r) => r.createdAt >= startOfDay(now)).length, resting };
  const next = schedules.filter((s) => !s.paused && s.next[0]).map((s) => ({ name: s.name, at: s.next[0]! })).sort((a, b) => a.at - b.at).slice(0, 3);

  const headline = waiting.length ? `${waiting.length} thing${waiting.length === 1 ? " needs" : "s need"} you${working.length ? `, ${working.length} working` : ""}`
    : working.length ? `${working.length} working${finished.length ? `, ${finished.length} finished` : ""}`
    : finished.length ? `${finished.length} finished${failed.length ? `, ${failed.length} failed` : ""}, nothing running` : failed.length ? `${failed.length} failed, nothing running` : "All quiet";
  const lines = [`HEADLINE: ${headline}.`];
  if (waiting.length) lines.push(`WAITING ON YOU (${waiting.length}):`, ...waiting.map((w) => `- "${w.title}" wants to ${w.what} (${w.why})`));
  if (working.length) lines.push(`WORKING NOW (${working.length}):`, ...working.map((w) => `- "${w.title}" · ${w.who} · ${w.minutes} min · ${w.step}`));
  if (finished.length) lines.push(`FINISHED since ${time(since)} (${finished.length}):`, ...finished.slice(0, 6).map((f) => `- "${f.title}" · ${f.who}: ${f.result}${f.files ? ` · ${f.files} file${f.files === 1 ? "" : "s"} changed` : ""}${f.checks ? ` · ${f.checks}` : ""}`));
  if (failed.length) lines.push(`FAILED (${failed.length}):`, ...failed.map((f) => `- "${f.title}": ${f.why}`));
  if (queued) lines.push(`QUEUED: ${queued} waiting to start.`);
  lines.push(`TODAY: ${compact(today.tokens)} tokens across ${today.sessions} session${today.sessions === 1 ? "" : "s"}${resting.length ? ` · resting: ${resting.join(", ")}` : ""}.`);
  if (next.length) lines.push(`NEXT ON ITS OWN: ${next.map((n) => `${n.name} at ${time(n.at)}`).join(" · ")}.`);
  return { headline, working, waiting, finished, failed, queued, today, next, text: lines.join("\n") };
}

export function registerBrief(app: FastifyInstance, options: { state: CrewState; schedules?: () => BriefInput["schedules"] }) {
  app.get<{ Querystring: { since?: string } }>("/api/brief", async (request) => {
    const since = Number(request.query.since);
    return crewBrief({ state: options.state, now: Date.now(), since: Number.isFinite(since) && since > 0 ? since : undefined, schedules: options.schedules?.() ?? [] });
  });
}
