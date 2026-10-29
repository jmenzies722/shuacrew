import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, Square, X } from "lucide-react";
import type { RunView } from "@shuacrew/core/projections";
import { api, cancelRun, decideApproval, followUp } from "../lib/api";
import { useLive } from "../lib/live";
import { ago, cleanTitle, runtimeLabel, statusLabel, transcript, type WorkGroups } from "./model";

const tone = (r: RunView) => r.pendingApprovals.length || r.status === "awaiting_approval" || r.status === "reviewing" ? "is-wait"
  : r.status === "failed" ? "is-off" : ["running", "planning", "queued"].includes(r.status) ? "is-run" : r.status === "done" || r.status === "merged" ? "is-live" : "";

export function Work({ groups, selected, onSelect }: { groups: WorkGroups; selected?: string; onSelect: (id?: string) => void }) {
  const runs = useLive((s) => s.crew.runs);
  const run = selected ? runs[selected] : undefined;
  return (
    <div className="work">
      <aside className="work-list" aria-label="Sessions">
        <NewWork runs={runs} onStarted={onSelect} />
        <Group title="Needs you" runs={groups.needsYou} selected={selected} />
        <Group title="Working" runs={groups.running} selected={selected} />
        <Group title="This week" runs={groups.done} selected={selected} />
        {!groups.needsYou.length && !groups.running.length && !groups.done.length && <p className="empty">Nothing of yours this week. Ask Shua, or start one above.</p>}
        {groups.background.length > 0 && <Group title="Background" runs={groups.background} selected={selected} folded hint="Learn and scheduled jobs" />}
      </aside>
      {run ? <Session key={run.id} run={run} /> : <div className="session"><p className="empty" style={{ margin: "auto" }}>Pick a session, or start new work.</p></div>}
    </div>
  );
}

function Group({ title, runs, selected, folded = false, hint }: { title: string; runs: RunView[]; selected?: string; folded?: boolean; hint?: string }) {
  const [open, setOpen] = useState(!folded || runs.some((r) => r.id === selected));
  if (!runs.length) return null;
  return (
    <section>
      {folded ? <button type="button" className="group-title group-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)} title={hint}>
        {open ? "▾" : "▸"} {title}<span className="muted">{runs.length}</span>{hint && <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>· {hint}</span>}
      </button> : <div className="group-title">{title}<span className="muted">{runs.length}</span></div>}
      {open && runs.map((r) => (
        <a key={r.id} className="row" href={`#/work/${encodeURIComponent(r.id)}`} aria-current={r.id === selected ? "page" : undefined}>
          <span className={`dot ${tone(r)}`} />
          <span className="row-title">{cleanTitle(r)}</span>
          <span className="row-when">{ago(r.updatedAt)}</span>
          <span className="row-sub">{runtimeLabel(r.runtime)} · {statusLabel(r)}{r.ticker && ["running", "planning"].includes(r.status) ? ` · ${r.ticker}` : ""}</span>
        </a>
      ))}
    </section>
  );
}

/** Start work on Claude Code or Codex (or let Auto pick), in one of your repos. */
function NewWork({ runs, onStarted }: { runs: Record<string, RunView>; onStarted: (id: string) => void }) {
  const [ask, setAsk] = useState(""), [runtime, setRuntime] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const repos = useMemo(() => [...new Set(Object.values(runs).sort((a, b) => b.updatedAt - a.updatedAt).map((r) => r.repo).filter((x): x is string => !!x))].slice(0, 12), [runs]);
  const [repo, setRepo] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const on = () => box.current?.focus(); window.addEventListener("shua:new-work", on); return () => window.removeEventListener("shua:new-work", on); }, []);
  const start = async () => {
    if (!ask.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const { id } = await api<{ id: string }>("/api/runs", { body: { ask: ask.trim(), ...(runtime ? { runtime } : {}), ...(repo ? { repo } : {}) } });
      setAsk(""); onStarted(id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="new-work">
      <textarea ref={box} className="field" rows={2} placeholder="What should get done?" value={ask} onChange={(e) => setAsk(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void start(); } }} aria-label="New work" />
      <div className="new-work-row">
        <select value={runtime} onChange={(e) => setRuntime(e.target.value)} aria-label="Harness">
          <option value="">Auto</option><option value="claude">Claude Code</option><option value="codex">Codex</option>
        </select>
        <select value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="Repo">
          <option value="">No repo</option>
          {repos.map((r) => <option key={r} value={r}>{r.split("/").pop()}</option>)}
        </select>
        <button type="button" className="btn is-primary" disabled={!ask.trim() || busy} onClick={() => void start()}>{busy ? "Starting…" : "Start"}</button>
      </div>
      {error && <p className="err">{error}</p>}
    </div>
  );
}

function Session({ run }: { run: RunView }) {
  const events = useLive((s) => s.runEvents[run.id]);
  const loadRun = useLive((s) => s.loadRun);
  const approvals = useLive((s) => s.crew.approvals);
  useEffect(() => { void loadRun(run.id); }, [run.id, loadRun]);
  const lines = useMemo(() => transcript(events ?? []), [events]);
  const asks = Object.values(approvals).filter((a) => a.run === run.id);
  const live = ["running", "planning", "queued"].includes(run.status);

  // Follow the newest line while you're at the bottom; leave you be if you scrolled up to read.
  const body = useRef<HTMLDivElement>(null), atBottom = useRef(true);
  useEffect(() => { const el = body.current; if (el && atBottom.current) el.scrollTop = el.scrollHeight; }, [lines.length, asks.length, run.ticker]);

  const [text, setText] = useState(""), [sending, setSending] = useState(false), [error, setError] = useState("");
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true); setError("");
    try { await followUp(run.id, text.trim()); setText(""); atBottom.current = true; } catch (e) { setError((e as Error).message); } finally { setSending(false); }
  };
  const decide = async (id: string, allow: boolean) => { try { await decideApproval(id, allow); } catch (e) { setError((e as Error).message); } };

  return (
    <section className="session" aria-label={cleanTitle(run)}>
      <header className="session-head">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <h2>{cleanTitle(run)}</h2>
          <div className="session-actions">
            {live && <button type="button" className="btn btn is-danger" onClick={() => void cancelRun(run.id).catch((e: Error) => setError(e.message))}><Square size={12} /> Stop</button>}
          </div>
        </div>
        <div className="session-meta">
          <span className={`pill ${tone(run) === "is-run" ? "is-live" : tone(run) === "is-wait" ? "is-wait" : tone(run) === "is-off" ? "is-bad" : tone(run) === "is-live" ? "is-ok" : ""}`}>{statusLabel(run)}</span>
          <span className="pill">{runtimeLabel(run.runtime)}{run.model ? ` · ${run.model}` : ""}</span>
          {run.repo && <span className="pill mono">{run.repo.split("/").pop()}{run.worktree ? ` · ${run.worktree.branch}` : ""}</span>}
          <span>{run.toolCalls} tool calls{run.failedTools ? ` · ${run.failedTools} failed` : ""}</span>
          <span>updated {ago(run.updatedAt)}</span>
        </div>
      </header>
      <div className="session-body" ref={body} onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {asks.map((a) => (
          <div key={a.id} className="ask-card" role="group" aria-label="Approval needed">
            <b>Wants to use {a.tool.replace(/^mcp__/, "").replaceAll("__", " · ")}</b>
            {a.reason && <span className="muted">{a.reason}</span>}
            <pre className="mono">{typeof a.input === "string" ? a.input : JSON.stringify(a.input, null, 2)}</pre>
            <div className="ask-card-actions">
              <button type="button" className="btn is-primary" onClick={() => void decide(a.id, true)}><Check size={13} /> Approve</button>
              <button type="button" className="btn" onClick={() => void decide(a.id, false)}><X size={13} /> Deny</button>
            </div>
          </div>
        ))}
        {!events && <p className="muted">Loading the session…</p>}
        {lines.map((l) => l.kind === "you" ? <div key={l.seq} className="line-you">{l.text}</div>
          : l.kind === "agent" ? <div key={l.seq} className="line-agent">{l.text}</div>
          : l.kind === "tools" ? <div key={l.seq} className="line-tools">{l.names.slice(0, 8).map((n) => <span key={n} className="pill">{n}</span>)}{l.names.length > 8 && <span>+{l.names.length - 8}</span>}{l.failed > 0 && <span className="pill is-bad">{l.failed} failed</span>}</div>
          : l.kind === "check" ? <div key={l.seq} className="line-check"><span className={`pill ${l.passed ? "is-ok" : "is-bad"}`}>{l.passed ? "passed" : "failed"}</span><span className="mono">{l.command}</span></div>
          : <div key={l.seq} className="line-check"><span className="pill is-bad">{l.text}</span></div>)}
        {live && run.ticker && <p className="ticker"><span className="dot is-run" />{run.currentTool ? `${run.currentTool.replace(/^mcp__/, "")} · ` : ""}{run.ticker}</p>}
        {run.files.length > 0 && (
          <details>
            <summary className="muted">{run.files.length} file{run.files.length === 1 ? "" : "s"} changed</summary>
            <ul className="files mono">{run.files.slice(0, 60).map((f) => <li key={f}>{f}</li>)}</ul>
          </details>
        )}
      </div>
      <footer className="session-foot">
        <textarea className="field" rows={1} placeholder={live ? "Steer it…" : "Follow up…"} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} aria-label="Follow up" />
        <button type="button" className="btn is-primary" style={{ height: 44 }} disabled={!text.trim() || sending} onClick={() => void send()} aria-label="Send"><ArrowUp size={15} /></button>
      </footer>
      {error && <p className="err" style={{ padding: "0 28px 12px" }}>{error}</p>}
    </section>
  );
}
