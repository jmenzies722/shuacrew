import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, BarChart3, Brain, CalendarCheck, Flame, HelpCircle, Lightbulb, RotateCcw, Sparkles } from "lucide-react";
import type { AnyEvent } from "@shuacrew/core/events";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { Markdown } from "./Markdown";
import { WorkspaceIllustration } from "./WorkspaceIllustration";

type Mode = "analyze" | "quiz" | "explain" | "plan";
const MODES: Array<{ id: Mode; label: string; icon: typeof Brain; starter: string; placeholder: string }> = [
  { id: "analyze", label: "Analyze my progress", icon: BarChart3, starter: "", placeholder: "Ask about your progress…" },
  { id: "quiz", label: "Quiz me", icon: HelpCircle, starter: "", placeholder: "Type your answer…" },
  { id: "explain", label: "Explain a topic", icon: Lightbulb, starter: "", placeholder: "What should I explain? e.g. how RAG evals work" },
  { id: "plan", label: "Plan today", icon: CalendarCheck, starter: "", placeholder: "Tell me how much time you have…" },
];
interface Insights {
  tracks: Array<{ id: string; name: string; level: number; cards: number; due: number; reviews: number; accuracy: number | null; lapses: number; stale: boolean }>;
  weakest: { name: string } | null; hardest: Array<{ front: string; lapses: number }>; stale: string[];
  week: { reviews: number; accuracy: number | null; change: number }; due: number;
}

/** Hide the machine-readable cards block from the chat; report how many cards it carried. */
function clean(text: string) {
  let cards = 0;
  const shown = text.replace(/```cards[\s\S]*?```/gi, (m) => { try { cards += (JSON.parse(m.replace(/```cards|```/gi, "")) as unknown[]).length; } catch { /* ignore */ } return ""; }).trim();
  return { shown, cards };
}

export function Coach({ runs, onChange }: { runs: Partial<Record<Mode, { run: string }>>; onChange: () => void }) {
  const [mode, setMode] = useState<Mode>(() => { try { return (localStorage.getItem("shuacrew.coachMode") as Mode) || "analyze"; } catch { return "analyze"; } });
  const [draft, setDraft] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [insights, setInsights] = useState<Insights | null>(null);
  const run = runs[mode]?.run;
  const loadRun = useLive((s) => s.loadRun), events = useLive((s) => (run ? s.runEvents[run] : undefined)), status = useLive((s) => (run ? s.crew.runs[run]?.status : undefined));
  useEffect(() => { if (run) void loadRun(run); }, [run, loadRun]);
  useEffect(() => { void api<Insights>("/api/learning/insights").then(setInsights).catch(() => undefined); }, [runs, status]);
  const thread = useRef<HTMLDivElement>(null);
  // The conversation: your follow-ups and the coach's replies; the live reply streams in.
  const messages = useMemo(() => {
    const out: Array<{ who: "you" | "coach"; text: string; cards: number; live?: boolean }> = [];
    let streaming = "";
    for (const e of (events ?? []) as AnyEvent[]) {
      if (e.kind === "run.followup") { out.push({ who: "you", text: (e.body as { text: string }).text.split("\n\n[coach] ")[0]!, cards: 0 }); streaming = ""; }
      else if (e.kind === "agent.delta") streaming += e.body.text;
      else if (e.kind === "agent.message") { const c = clean(e.body.text); out.push({ who: "coach", text: c.shown, cards: c.cards }); streaming = ""; }
    }
    if (streaming) out.push({ who: "coach", text: clean(streaming).shown, cards: 0, live: true });
    return out;
  }, [events]);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" }); }, [messages.length, messages.at(-1)?.text.length]);
  const working = status === "running" || status === "planning" || status === "queued";
  const send = async (fresh = false, text = draft) => {
    setBusy(true); setError("");
    try { await api("/api/learning/coach", { body: { mode, message: text.trim() || undefined, fresh } }); setDraft(""); onChange(); }
    catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(false); }
  };
  const pick = (m: Mode) => { setMode(m); try { localStorage.setItem("shuacrew.coachMode", m); } catch { /* ignore */ } };
  const active = MODES.find((m) => m.id === mode)!;
  return <div className="coach">
    <section className="coach-chat">
      <div className="coach-modes" role="tablist" aria-label="Coach mode">{MODES.map((m) => <button key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? "is-on" : ""} onClick={() => pick(m.id)}><m.icon size={14} />{m.label}{runs[m.id] && <i className="coach-dot" />}</button>)}</div>
      <div className="coach-thread" ref={thread}>
        {!run && <div className="coach-empty"><WorkspaceIllustration kind="learning" /><h3>{active.label}</h3>
          <p>{mode === "analyze" ? "Your coach reads your real reviews, courses and roadmap, then tells you what's working, what isn't, and where to focus." : mode === "quiz" ? "One question at a time from what you forget most. Answer in your own words — you'll get graded, corrected, and new cards for what you miss." : mode === "explain" ? "Ask about anything in software, platform, DevOps or AI engineering. Explained at your level, then checked with a question." : "A 30–45 minute plan for today from your due cards, next lesson and roadmap milestone."}</p>
          {mode === "explain" ? null : <button type="button" className="lx-go" disabled={busy} onClick={() => void send()}>{busy ? "Starting…" : `Start: ${active.label}`}</button>}</div>}
        {run && messages.length === 0 && <p className="coach-typing"><Sparkles size={13} /> Your coach is reading your data…</p>}
        {messages.map((m, i) => <div key={i} className={`coach-msg is-${m.who}`}>
          {m.who === "coach" ? <div className="coach-bubble"><Markdown text={m.text} streaming={m.live} />{m.cards > 0 && <span className="coach-cards"><Flame size={11} /> +{m.cards} card{m.cards === 1 ? "" : "s"} added to your deck</span>}</div> : <div className="coach-bubble">{m.text}</div>}
        </div>)}
        {run && working && messages.at(-1)?.who === "you" && <p className="coach-typing"><span /><span /><span /></p>}
      </div>
      {error && <p className="lx-error">{error}</p>}
      <form className="coach-input" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) void send(); }}>
        <textarea rows={1} value={draft} placeholder={run ? active.placeholder : mode === "explain" ? active.placeholder : "Or start with your own question…"} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (draft.trim()) void send(); } }} aria-label="Message your coach" />
        {run && <button type="button" className="coach-new" title="New conversation" aria-label="New conversation" disabled={busy} onClick={() => void send(true, "")}><RotateCcw size={14} /></button>}
        <button className="coach-send" disabled={busy || !draft.trim()} aria-label="Send"><ArrowUp size={16} /></button>
      </form>
    </section>
    <aside className="coach-insights" aria-label="Your learning insights">
      <h3><BarChart3 size={13} /> Insights</h3>
      {!insights || !insights.tracks.length ? <p className="lx-muted">Add skills in Profile and review a few cards — insights appear from your real answers.</p> : <>
        <div className="coach-week"><div><strong>{insights.week.reviews}</strong><span>reviews this week</span></div><div><strong>{insights.week.accuracy === null ? "—" : `${Math.round(insights.week.accuracy * 100)}%`}</strong><span>correct</span></div><div><strong className={insights.week.change >= 0 ? "is-up" : "is-down"}>{insights.week.change >= 0 ? "+" : ""}{insights.week.change}</strong><span>vs last week</span></div></div>
        <ul className="coach-tracks">{insights.tracks.map((t) => <li key={t.id}>
          <div><span>{t.name}{t.stale && <em>stale</em>}</span><b>{t.accuracy === null ? "no reviews" : `${Math.round(t.accuracy * 100)}%`}</b></div>
          <i><s style={{ width: `${t.accuracy === null ? 0 : Math.round(t.accuracy * 100)}%` }} className={t.accuracy !== null && t.accuracy < 0.6 ? "is-low" : ""} /></i>
          <small>{t.cards} cards · {t.due} due · {t.lapses} forgotten</small></li>)}</ul>
        {insights.weakest && <p className="coach-callout"><Brain size={13} /> Focus: <strong>{insights.weakest.name}</strong></p>}
        {insights.hardest.length > 0 && <><div className="lx-sub">You keep forgetting</div><ul className="coach-hard">{insights.hardest.map((h) => <li key={h.front}>{h.front}<b>{h.lapses}×</b></li>)}</ul></>}
      </>}
    </aside>
  </div>;
}
