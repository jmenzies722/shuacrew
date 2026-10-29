/**
 * The lean app's logic, kept pure (and tested): where you are, what work needs you, and a session's story.
 * Nothing here touches the DOM or the network.
 */
import type { AnyEvent } from "@shuacrew/core/events";
import type { RunView } from "@shuacrew/core/projections";

// ── where you are ────────────────────────────────────────────────────────────────────────────────
export type Tab = "chat" | "work" | "tools" | "settings";
export interface Route { tab: Tab; id?: string }
const TABS: Tab[] = ["chat", "work", "tools", "settings"];

/** "#/work/r_123" → { tab: "work", id: "r_123" }. Anything unknown is Chat, Shua's front door. */
export function parseRoute(hash: string): Route {
  const [tab, id] = hash.replace(/^#\/?/, "").split("/");
  return TABS.includes(tab as Tab) ? { tab: tab as Tab, ...(id ? { id: decodeURIComponent(id) } : {}) } : { tab: "chat" };
}
export const hrefOf = (r: Route) => `#/${r.tab}${r.id ? `/${encodeURIComponent(r.id)}` : ""}`;

/** The classic app's paths (Mac menus, links, Shua's `go`) → the lean app's place for them, if it has one. */
export function routeForPath(path: string): Route | null {
  const p = path.split(/[?#]/)[0] ?? "";
  const session = p.match(/^\/(?:sessions|runs|review)\/([^/]+)/);
  if (session) return { tab: "work", id: decodeURIComponent(session[1]!) };
  if (p === "/" || p === "/sessions" || p === "/activity" || p === "/board" || p === "/crew") return { tab: "work" };
  if (p === "/integrations" || p === "/tools") return { tab: "tools" };
  if (p === "/settings") return { tab: "settings" };
  if (p === "/chat" || p === "/buddy") return { tab: "chat" };
  return null;
}

// ── the work ─────────────────────────────────────────────────────────────────────────────────────
const ACTIVE = new Set(["queued", "planning", "running", "paused", "awaiting_approval", "reviewing"]);
const FINISHED = new Set(["done", "merged", "failed", "cancelled"]);

export interface WorkGroups { needsYou: RunView[]; running: RunView[]; done: RunView[]; background: RunView[] }

/** Work ShuaCrew starts on its own — Learn's question writers and checkers, scheduled jobs — not work you started.
 * On this Mac 20 of 21 sessions in a week were these; they bury yours unless they're set apart. */
export const isBackground = (r: RunView) => r.labels.includes("learning") || r.labels.includes("schedule");

/** A session's title as text: markdown heading marks and emphasis off ("# SHUA CREW AI — …" → "SHUA CREW AI — …"). */
export function cleanTitle(r: Pick<RunView, "title" | "ask">): string {
  const t = (r.title || r.ask || "").split("\n")[0]!.replace(/^#{1,6}\s+/, "").replace(/\*\*|__|`/g, "").trim();
  return t || "Untitled session";
}

/**
 * Your sessions (Claude Code and Codex doing real work), not Shua's own conversations or a session's children:
 * what needs you first (an approval, a question, a review), then what's running, then what finished this week.
 */
export function groupWork(runs: Record<string, RunView>, now = Date.now(), weekMs = 7 * 86_400_000): WorkGroups {
  const mine = Object.values(runs).filter((r) => !r.labels.includes("buddy") && !(r.parent && runs[r.parent]));
  const byRecent = (a: RunView, b: RunView) => b.updatedAt - a.updatedAt;
  const needs = (r: RunView) => r.pendingApprovals.length > 0 || r.status === "awaiting_approval" || (r.status === "reviewing" && !r.review?.decided);
  const recent = (r: RunView) => ACTIVE.has(r.status) || (FINISHED.has(r.status) && now - r.updatedAt < weekMs);
  return {
    needsYou: mine.filter(needs).sort(byRecent),
    running: mine.filter((r) => ACTIVE.has(r.status) && !needs(r) && !isBackground(r)).sort(byRecent),
    done: mine.filter((r) => FINISHED.has(r.status) && !needs(r) && !isBackground(r) && now - r.updatedAt < weekMs).sort(byRecent),
    background: mine.filter((r) => isBackground(r) && !needs(r) && recent(r)).sort(byRecent),
  };
}

/** The harness doing the work, by the name you know it by. */
export function runtimeLabel(runtime: string): string {
  if (runtime === "claude") return "Claude Code";
  if (runtime === "codex") return "Codex";
  if (runtime.startsWith("acp:")) return runtime.slice(4);
  return runtime;
}

export function statusLabel(r: RunView): string {
  if (r.pendingApprovals.length) return `Needs your OK${r.pendingApprovals.length > 1 ? ` (${r.pendingApprovals.length})` : ""}`;
  return ({ queued: "Queued", planning: "Planning", running: "Working", paused: "Paused", awaiting_approval: "Needs your OK", reviewing: "Ready to review",
    merged: "Merged", done: "Done", failed: "Failed", cancelled: "Stopped" } as Record<string, string>)[r.status] ?? r.status;
}

export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "now";
  const m = Math.round(s / 60); if (m < 60) return `${m}m`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

// ── a session's story ────────────────────────────────────────────────────────────────────────────
export type Line =
  | { kind: "you"; text: string; seq: number }
  | { kind: "agent"; text: string; seq: number }
  | { kind: "tools"; names: string[]; failed: number; seq: number }
  | { kind: "check"; command: string; passed: boolean; seq: number }
  | { kind: "status"; text: string; seq: number };

const toolName = (tool: string) => tool.replace(/^mcp__/, "").replaceAll("__", " · ");

/**
 * What happened, readably: your asks, the agent's messages, its tool calls folded into one line per stretch (a
 * session can make hundreds), checks, and how it ended. Streaming text shows up as the newest agent line.
 */
export function transcript(events: AnyEvent[]): Line[] {
  const out: Line[] = [];
  let live = "", liveSeq = 0;
  const flushLive = () => { if (live.trim()) out.push({ kind: "agent", text: live.trim(), seq: liveSeq }); live = ""; };
  for (const e of events) {
    const b = e.body as Record<string, unknown>;
    switch (e.kind) {
      case "turn.started":
        flushLive();
        if (b.by !== "agent") out.push({ kind: "you", text: String(b.text ?? ""), seq: e.seq });
        break;
      case "agent.delta":
        if (!live) liveSeq = e.seq;
        live += String(b.text ?? "");
        break;
      case "agent.message":
        live = ""; out.push({ kind: "agent", text: String(b.text ?? "").trim(), seq: e.seq });
        break;
      case "tool.called": {
        flushLive();
        const last = out.at(-1), name = toolName(String(b.tool ?? "tool"));
        if (last?.kind === "tools") { if (!last.names.includes(name)) last.names.push(name); }
        else out.push({ kind: "tools", names: [name], failed: 0, seq: e.seq });
        break;
      }
      case "tool.returned": {
        const last = out.at(-1);
        if (last?.kind === "tools" && b.ok === false) last.failed += 1;
        break;
      }
      case "check.ran":
        flushLive(); out.push({ kind: "check", command: String(b.command ?? ""), passed: b.exitCode === 0, seq: e.seq });
        break;
      case "run.status":
        if (["failed", "cancelled"].includes(String(b.status))) { flushLive(); out.push({ kind: "status", text: b.status === "failed" ? `Failed${b.reason ? `: ${String(b.reason)}` : ""}` : "Stopped", seq: e.seq }); }
        break;
    }
  }
  flushLive();
  return out.filter((l) => l.kind !== "agent" && l.kind !== "you" ? true : l.text.length > 0);
}
