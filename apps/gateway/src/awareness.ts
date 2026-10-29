/**
 * What's going on, for Shua and the crew to ask about (the `whats_happening` tool): ShuaCrew's sessions and approvals,
 * how much usage each brain has left, and this Mac's state — read on demand, so an answer is about now, not about
 * whatever the conversation was told when it started. Mac facts come from commands that need no permission prompt.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CrewState, RunView } from "@shuacrew/core";

const exec = promisify(execFile);
export type Focus = "all" | "sessions" | "brains" | "mac";
export interface BrainNow { id: string; usedPercent?: number; resetsAt?: number; limitedUntil: number; nearlyOut: boolean }

const ago = (ms: number) => (ms < 90_000 ? "just now" : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} min ago` : `${Math.round(ms / 3_600_000)} h ago`);
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const oneLine = (text: string, max: number) => { const t = text.replace(/\s+/g, " ").trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
const ACTIVE = new Set(["running", "queued", "planning", "reviewing", "paused"]);

function sessionLine(r: RunView, state: CrewState, now: number): string {
  const who = r.member ? `${state.members[r.member]?.name ?? r.member} · ` : "";
  const brain = `${r.runtime}${r.model ? ` ${r.model}` : ""}`;
  const doing = r.pendingApprovals.length ? `waiting on your approval (${r.pendingApprovals.length})` : r.currentTool ? `using ${r.currentTool}` : r.statusReason ? oneLine(r.statusReason, 90) : "";
  const said = r.ticker ? ` — "${oneLine(r.ticker, 110)}"` : "";
  return `- [${r.id}] ${who}${oneLine(r.title, 70)} · ${r.status} on ${brain}${doing ? ` · ${doing}` : ""} · ${ago(now - r.updatedAt)}${said}`;
}

/** ShuaCrew right now, as plain text. Pure (no I/O), for tests. */
export function shuacrewNow(state: CrewState, brains: BrainNow[], focus: Focus = "all", now = Date.now()): string {
  const out: string[] = [];
  const runs = Object.values(state.runs).filter((r) => !r.labels.includes("buddy") && !r.incognito);
  if (focus === "all" || focus === "sessions") {
    const active = runs.filter((r) => ACTIVE.has(r.status)).sort((a, b) => b.pendingApprovals.length - a.pendingApprovals.length || b.updatedAt - a.updatedAt);
    const recent = runs.filter((r) => !ACTIVE.has(r.status) && now - r.updatedAt < 24 * 3_600_000).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
    const approvals = Object.values(state.approvals);
    out.push(`Sessions: ${active.length ? `${active.length} active` : "nothing running"}${approvals.length ? ` · ${approvals.length} waiting on your approval` : ""}`);
    for (const r of active.slice(0, 12)) out.push(sessionLine(r, state, now));
    for (const a of approvals.slice(0, 6)) out.push(`- approval ${a.id}: ${a.tool} (${a.risk} risk) for ${a.run ? state.runs[a.run]?.title ?? a.run : "ShuaCrew"} — ${oneLine(a.reason, 90)}`);
    if (recent.length) { out.push("Last 24 h:"); for (const r of recent) out.push(sessionLine(r, state, now)); }
    const rooms = Object.values(state.rooms ?? {}).filter((room) => !room.archived && !room.stopped);
    if (rooms.length) out.push(`Crew rooms: ${rooms.slice(0, 6).map((room) => `${room.title}${room.paused ? " (paused)" : ""}`).join(", ")}`);
  }
  if (focus === "all" || focus === "brains") {
    out.push("Brains:");
    for (const b of brains) {
      const parts = [b.usedPercent !== undefined ? `${Math.round(b.usedPercent)}% of its usage window used${b.resetsAt ? `, resets ${clock(b.resetsAt)}` : ""}` : "usage not reported yet"];
      if (b.limitedUntil > now) parts.push(`out until ${clock(b.limitedUntil)}`);
      else if (b.nearlyOut) parts.push("about to run out — new work goes to another brain");
      out.push(`- ${b.id}: ${parts.join(" · ")}`);
    }
    out.push(`Today: ${state.today.runs} sessions, ${state.today.tokens.toLocaleString()} tokens`);
  }
  return out.join("\n");
}

/** One session in detail: what it was asked, where it stands, what it touched. */
export function sessionNow(state: CrewState, id: string, now = Date.now()): string {
  const r = state.runs[id];
  if (!r) return `No session ${id}. Call whats_happening without "session" to list them.`;
  return [
    sessionLine(r, state, now),
    `Asked: ${oneLine(r.ask, 600)}`,
    r.repo ? `Repo: ${r.repo}${r.worktree ? ` (branch ${r.worktree.branch})` : ""}` : "",
    `Turns: ${r.turns} · tool calls: ${r.toolCalls}${r.failedTools ? ` (${r.failedTools} failed)` : ""}`,
    r.files.length ? `Files changed: ${r.files.slice(0, 20).join(", ")}${r.files.length > 20 ? ` +${r.files.length - 20}` : ""}` : "",
    r.checks.length ? `Checks: ${r.checks.slice(-5).map((c) => `${c.passed ? "pass" : "FAIL"} ${oneLine(c.command, 60)}`).join("; ")}` : "",
    r.subagents.length ? `Subagents: ${r.subagents.map((s) => `${s.name}${s.done ? (s.ok ? " ✓" : " ✗") : " …"}`).join(", ")}` : "",
    r.review ? `Review: ${r.review.pr ? `PR ${r.review.pr}` : r.review.landed ? `landed ${r.review.landed}` : r.review.failed ? `failed: ${r.review.failed}` : r.review.decided ? (r.review.approved ? "approved" : "changes requested") : "not reviewed yet"}` : "",
    r.tail ? `Latest output: ${oneLine(r.tail, 500)}` : "",
  ].filter(Boolean).join("\n");
}

/** This Mac, now: the app in front, what else is open, power, idle time, disk. Each part is skipped if it can't be read. */
export async function macNow(): Promise<string> {
  const read = (cmd: string, args: string[]) => exec(cmd, args, { timeout: 2500 }).then((r) => r.stdout, () => "");
  const [apps, power, hid, disk] = await Promise.all([read("lsappinfo", ["visibleProcessList"]), read("pmset", ["-g", "batt"]), read("ioreg", ["-c", "IOHIDSystem", "-d", "4"]), read("df", ["-k", "/"])]);
  const names = [...apps.matchAll(/-"([^"]+)"/g)].map((m) => m[1]!.replace(/_/g, " "));
  const out = [`Mac (${new Date().toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}):`];
  if (names.length) out.push(`- In front: ${names[0]}`, `- Also open: ${names.slice(1, 16).join(", ") || "nothing else"}`);
  const battery = /(\d+)%;\s*([^;]+);/.exec(power);
  if (battery) out.push(`- Battery: ${battery[1]}% (${battery[2]!.trim()}), ${/AC Power/.test(power) ? "on power" : "on battery"}`);
  const idle = /"HIDIdleTime" = (\d+)/.exec(hid);
  if (idle) { const s = Number(idle[1]) / 1e9; out.push(`- Idle: ${s < 60 ? "active now" : `${Math.round(s / 60)} min since the last key or click`}`); }
  const df = disk.trim().split("\n").at(-1)?.split(/\s+/);
  if (df && Number(df[3])) out.push(`- Disk: ${Math.round(Number(df[3]) / 1048576)} GB free`);
  return out.join("\n");
}
