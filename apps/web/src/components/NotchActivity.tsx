/**
 * A live activity under the notch, like the iPhone's: while the crew works, one slim line says which session, what
 * it's doing this second, and for how long. Tap it to open the session. It keeps its own clock, so the rest of the
 * notch doesn't re-render every second.
 */
import { useEffect, useState } from "react";
import type { RunView } from "@shuacrew/core/projections";
import { ChevronRight } from "lucide-react";
import { plain } from "../lib/plain";

const TOOL_WORD: Record<string, string> = { WebSearch: "Searching the web", WebFetch: "Reading a page", Read: "Reading files", Edit: "Editing", Write: "Writing", Bash: "Running a command", Grep: "Searching code", Glob: "Finding files", Task: "Delegating" };

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** What the session is doing right now, in words: its tool if it's using one, else the last line it wrote. */
export function doingNow(run: Pick<RunView, "currentTool" | "ticker" | "status">): string {
  if (run.status === "awaiting_approval") return "Waiting for your OK";
  if (run.currentTool) return TOOL_WORD[run.currentTool] ?? run.currentTool.replace(/^mcp__[^_]+__/, "").replace(/_/g, " ");
  return plain(run.ticker || "").slice(0, 90) || (run.status === "planning" ? "Planning" : "Working");
}

export function NotchActivity({ run, more, onOpen }: { run: RunView; more: number; onOpen: () => void }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return <button type="button" className={`notch-live-activity is-${run.status}`} onClick={onOpen} title={`Open ${run.title}`}>
    <i aria-hidden />
    <span className="nla-title">{run.title || "Crew session"}</span>
    <span className="nla-doing">{doingNow(run)}</span>
    {more > 0 && <span className="nla-more">+{more}</span>}
    <time>{elapsed(now - run.createdAt)}</time>
    <ChevronRight size={12} aria-hidden />
  </button>;
}
