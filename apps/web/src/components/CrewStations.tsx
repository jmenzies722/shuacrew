/**
 * The Studio floor's stations and inspector: per agent, what it's doing this second, a heartbeat of its last 15 minutes,
 * today's numbers and a box to hand it something; and, for the agent you pick, its sessions and latest actions. Every
 * state comes from recorded events; nothing is simulated.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { AnyEvent } from "@shuacrew/core/events";
import type { RunView } from "@shuacrew/core/projections";
import { ArrowUp, ArrowUpRight, Loader2, X } from "lucide-react";
import { formatTokens, since } from "@shuacrew/ui";
import type { StageNode } from "../lib/floor-graph";
import { launchRun } from "../lib/api";
import { Glyph } from "../lib/glyphs";
import { Sparkline } from "./ControlRoom";
import "./crew-stations.css";

export const STATE: Record<StageNode["state"], string> = { working: "Working", waiting: "Needs you", queued: "Queued", failed: "Needs attention", recent: "Just finished", idle: "Available" };

/** A tool call in words, with what it touches: "Editing Sessions.tsx", "Running npm test". */
export function doing(tool: { name: string; detail: string } | undefined): string {
  if (!tool) return "";
  const n = tool.name.replace(/^mcp__/, ""), d = tool.detail ? ` ${tool.detail}` : "";
  if (/^(Read|read_file|NotebookRead)$/i.test(n)) return `Reading${d}`;
  if (/^(Edit|Write|MultiEdit|apply_patch|fileChange|NotebookEdit)$/i.test(n)) return `Editing${d}`;
  if (/^(Bash|shell|exec_command|commandExecution|terminal)$/i.test(n)) return `Running${d}`;
  if (/^(Grep|Glob|LS|search)$/i.test(n)) return `Searching${d}`;
  if (/^(WebFetch|WebSearch|web_search)$/i.test(n)) return "Reading the web";
  if (/^(Task|spawn_agent|Agent)$/i.test(n)) return "Handing part to a helper";
  return `Using ${n.split("__")[0]}${d}`;
}

export const owns = (node: StageNode, r: RunView) => r.member === node.id || (!r.member && node.id === `agent:${r.runtime}`);

/** One agent's station: now, heartbeat, today, and a box to hand it something. */
export function Station({ node, runs, beat, now, onOpen }: { node: StageNode; runs: Record<string, RunView>; beat: number[]; now: number; onOpen: () => void }) {
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const today = Object.values(runs).filter((r) => owns(node, r) && r.createdAt >= midnight.getTime());
  const steps = today.reduce((s, r) => s + r.toolCalls, 0), tokens = today.reduce((s, r) => s + r.usage.inputTokens + r.usage.outputTokens, 0);
  const [ask, setAsk] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const hand = async () => {
    if (!ask.trim()) return;
    setBusy(true); setNote("");
    try { await launchRun({ ask: ask.trim(), ...(node.kind === "member" ? { member: node.id } : { runtime: node.id.replace(/^agent:/, "") }) }); setAsk(""); setNote("Handed over. It's on the floor."); }
    catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  };
  return <article className={`station is-${node.state}`} style={{ ["--c" as string]: node.color }}>
    <header onClick={onOpen}>
      <span className="station-avatar">{node.emoji ? <Glyph name={node.emoji} fallback={node.id} label={node.label} size={16} /> : <b>{node.label.slice(0, 1)}</b>}</span>
      <span className="station-who"><b>{node.label}</b><small>{node.sub}</small></span>
      <span className={`station-pill is-${node.state}`}><i />{STATE[node.state]}</span>
    </header>
    <p className="station-now">{node.state === "working" ? <><Loader2 size={12} className="station-spin" />{doing(node.tool) || "Thinking"}</> : node.state === "waiting" ? "Paused before a step that needs your OK" : node.runId && runs[node.runId] ? `Last: ${runs[node.runId]!.title}` : "Ready for work"}</p>
    <Sparkline values={beat} color={node.color} height={30} />
    <footer><span>{today.length} session{today.length === 1 ? "" : "s"} today</span><span>{steps} steps</span>{tokens > 0 && <span>{formatTokens(tokens)} tok</span>}<span className="station-beat">{beat.reduce((a, b) => a + b, 0)} in 15 min</span></footer>
    <form className="station-hand" onSubmit={(e) => { e.preventDefault(); void hand(); }}>
      <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={`Hand ${node.label} something…`} aria-label={`Hand ${node.label} a task`} disabled={busy} />
      <button type="submit" disabled={busy || !ask.trim()} aria-label="Hand it over">{busy ? <Loader2 size={13} className="station-spin" /> : <ArrowUp size={13} />}</button>
    </form>
    {note && <p className="station-note">{note}</p>}
  </article>;
}

/** The agent you clicked: what it's on, its sessions and its latest actions. */
export function Inspector({ node, runs, activity, onClose }: { node: StageNode; runs: Record<string, RunView>; activity: AnyEvent[]; onClose: () => void }) {
  const owned = Object.values(runs).filter((r) => owns(node, r)).sort((a, b) => b.updatedAt - a.updatedAt);
  const ids = new Set(owned.map((r) => r.id));
  const recent = activity.filter((e) => e.kind === "tool.called" && e.run && ids.has(e.run)).slice(-6).reverse();
  return <aside className="studio-inspector" style={{ ["--c" as string]: node.color }} aria-label={`${node.label} details`}>
    <header><span className="station-avatar">{node.emoji ? <Glyph name={node.emoji} fallback={node.id} label={node.label} size={16} /> : <b>{node.label.slice(0, 1)}</b>}</span>
      <span className="station-who"><b>{node.label}</b><small>{node.sub} · {STATE[node.state]}</small></span>
      <button type="button" onClick={onClose} aria-label="Close"><X size={15} /></button></header>
    {node.tool && node.state === "working" && <p className="station-now"><Loader2 size={12} className="station-spin" />{doing(node.tool)}</p>}
    <h4>Sessions</h4>
    {owned.length ? owned.slice(0, 5).map((r) => <Link key={r.id} to="/sessions/$id" params={{ id: r.id }} className="studio-run"><b>{r.title || r.id}</b><small>{r.status.replaceAll("_", " ")} · {since(r.updatedAt)}</small><ArrowUpRight size={12} /></Link>) : <p className="studio-muted">No sessions yet.</p>}
    <h4>Latest actions</h4>
    {recent.length ? <ol className="studio-actions">{recent.map((e) => { const b = e.body as { tool: string; input?: Record<string, unknown> }; const detail = String(b.input?.file_path ?? b.input?.command ?? b.input?.url ?? "").split("/").pop()!.slice(0, 40);
      return <li key={e.seq}><span>{doing({ name: b.tool, detail })}</span><time>{since(e.at)}</time></li>; })}</ol> : <p className="studio-muted">Nothing recorded recently.</p>}
    <Link to="/crew" className="studio-manage">Manage in Agents <ArrowUpRight size={12} /></Link>
  </aside>;
}
