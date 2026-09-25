import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpenCheck, Brain, Check, Dumbbell, GraduationCap, Plus, RotateCcw, Sparkles, Target, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { PaneHeader } from "../components/Pane";
import "../components/setting-controls.css";
import "./settings.css";
import "./learning.css";

interface Track { id: string; name: string; level: number; focus: boolean }
interface Card { id: string; track: string; front: string; back: string; source: { run?: string; title?: string }; due: number; reps: number; lapses: number; interval: number }
interface State { profile: { goal: string; about: string; tracks: Track[] }; cards: Card[]; due: number; days: Array<{ day: string; reviews: number }>; totalReviews: number; drill: { day: string; track: string; run: string; done: boolean } | null; studied: Array<{ run: string; study: string }> }
interface Session { id: string; title: string; at: number; studied: boolean }

/** Suggestions only — nothing is added until you pick it. */
const SUGGESTED: Array<[string, string]> = [
  ["agentic-systems", "Agentic systems & orchestration"], ["evals", "LLM evals & reliability"], ["context", "Prompt & context engineering"],
  ["typescript", "TypeScript & Node"], ["swift", "Swift & SwiftUI"], ["system-design", "System design"], ["security", "Security for AI tools"], ["testing", "Testing & debugging"],
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export function Learning() {
  const [s, setS] = useState<State | null>(null), [sessions, setSessions] = useState<Session[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try { const [st, se] = await Promise.all([api<State>("/api/learning"), api<Session[]>("/api/learning/sessions")]); setS(st); setSessions(se); setError(""); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);
  const act = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setError(""); try { await fn(); await load(); } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(""); } };
  const saveProfile = (p: Partial<State["profile"]>) => act("profile", () => api("/api/learning/profile", { body: p }));
  if (!s) return <div className="pane-scroll"><div className="pane-body"><PaneHeader eyebrow="Brain" icon={GraduationCap} title="Learning" /><p className="lx-muted">{error || "Loading…"}</p></div></div>;
  const tracks = s.profile.tracks, name = (id: string) => tracks.find((t) => t.id === id)?.name ?? id;
  const setupNeeded = !s.profile.goal || !tracks.length;
  return <div className="pane-scroll lx"><div className="pane-body pane-body-wide">
    <PaneHeader eyebrow="Brain" icon={GraduationCap} title="Learning" description="Skill up from your own work: the crew teaches you from your real sessions, sets one drill a day on your weakest skill, and schedules reviews so it sticks." />
    {error && <p className="lx-error" role="alert">{error}</p>}
    <div className="lx-top">
      <TodayCard s={s} busy={busy} onDrill={() => act("drill", () => api("/api/learning/drill", { body: {} }))} />
      <ReviewDeck cards={s.cards} trackName={name} onGrade={(id, grade) => act(`r:${id}`, () => api(`/api/learning/cards/${id}/review`, { body: { grade } }))} />
    </div>
    <div className="lx-grid">
      <section className="lx-panel">
        <h2><Target size={14} /> Career path</h2>
        <label className="lx-field"><span>Where you're headed</span><input className="setting-input" defaultValue={s.profile.goal} placeholder="Agentic software engineer" onBlur={(e) => e.target.value !== s.profile.goal && void saveProfile({ goal: e.target.value })} /></label>
        <label className="lx-field"><span>About you (optional)</span><textarea rows={2} defaultValue={s.profile.about} placeholder="Solo dev shipping iOS apps and a TS agent platform; strong in TypeScript, newer to evals." onBlur={(e) => e.target.value !== s.profile.about && void saveProfile({ about: e.target.value })} /></label>
        <div className="lx-sub">Skill tracks</div>
        <ul className="lx-tracks">{tracks.map((t) => <li key={t.id}>
          <button type="button" className={`lx-focus ${t.focus ? "is-on" : ""}`} title={t.focus ? "In focus" : "Not in focus"} aria-pressed={t.focus} onClick={() => void saveProfile({ tracks: tracks.map((x) => (x.id === t.id ? { ...x, focus: !x.focus } : x)) })}><Sparkles size={12} /></button>
          <span className="lx-track-name">{t.name}</span>
          <span className="lx-level" role="radiogroup" aria-label={`${t.name} level`}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={t.level === n} className={n <= t.level ? "is-on" : ""} onClick={() => void saveProfile({ tracks: tracks.map((x) => (x.id === t.id ? { ...x, level: n } : x)) })} title={`Level ${n}`} />)}</span>
          <span className="lx-count">{s.cards.filter((c) => c.track === t.id).length} cards</span>
          <button type="button" className="lx-icon" aria-label={`Remove ${t.name}`} onClick={() => void saveProfile({ tracks: tracks.filter((x) => x.id !== t.id) })}><X size={12} /></button>
        </li>)}</ul>
        <AddTrack onAdd={(t) => void saveProfile({ tracks: [...tracks, t] })} existing={tracks} />
        {SUGGESTED.some(([id]) => !tracks.some((t) => t.id === id)) && <div className="lx-suggest"><span>Suggested for an agentic software engineer:</span>{SUGGESTED.filter(([id]) => !tracks.some((t) => t.id === id)).map(([id, label]) => <button key={id} type="button" onClick={() => void saveProfile({ tracks: [...tracks, { id, name: label, level: 2, focus: true }] })}><Plus size={11} />{label}</button>)}</div>}
      </section>
      <section className="lx-panel">
        <h2><Brain size={14} /> Learn from your work</h2>
        <p className="lx-muted">Pick a finished session. The crew explains what it did and why at your level, then adds review cards to your deck. Uses one small, efficient model call.</p>
        {setupNeeded && <p className="lx-hint">Set your goal and at least one skill track first — lessons are pitched to them.</p>}
        <ul className="lx-sessions">{sessions.map((x) => { const lesson = s.studied.find((st) => st.run === x.id); return <li key={x.id}>
          <span className="lx-session-title" title={x.title}>{x.title}</span><time>{new Date(x.at).toLocaleDateString([], { month: "short", day: "numeric" })}</time>
          {lesson ? <Link className="lx-chip is-done" to="/sessions/$id" params={{ id: lesson.study }}><Check size={11} /> Lesson</Link>
            : <button type="button" className="lx-chip" disabled={!!busy || setupNeeded} onClick={() => void act(`s:${x.id}`, () => api("/api/learning/study", { body: { run: x.id } }))}>{busy === `s:${x.id}` ? "Starting…" : "Teach me"}</button>}
        </li>; })}</ul>
        {!sessions.length && <p className="lx-muted">Finished sessions will appear here.</p>}
      </section>
    </div>
    <CardLibrary cards={s.cards} tracks={tracks} onAdd={(c) => act("add", () => api("/api/learning/cards", { body: c }))} onRemove={(id) => act(`d:${id}`, () => api(`/api/learning/cards/${id}`, { method: "DELETE" }))} />
  </div></div>;
}

function TodayCard({ s, busy, onDrill }: { s: State; busy: string; onDrill: () => void }) {
  const max = Math.max(1, ...s.days.map((d) => d.reviews)), week = s.days.slice(-7).reduce((n, d) => n + d.reviews, 0);
  return <section className="lx-today">
    <div className="lx-today-head"><span className="lx-kicker">Today</span><span className="lx-date">{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span></div>
    <div className="lx-stats"><div><strong>{s.due}</strong><span>cards due</span></div><div><strong>{week}</strong><span>reviews this week</span></div><div><strong>{s.cards.length}</strong><span>in your deck</span></div></div>
    <div className="lx-bars" aria-label="Reviews per day, last 14 days">{s.days.map((d) => <i key={d.day} title={`${d.day}: ${d.reviews}`} style={{ height: `${Math.max(4, (d.reviews / max) * 100)}%` }} className={d.reviews ? "is-on" : ""} />)}</div>
    <div className="lx-drill"><Dumbbell size={15} />
      {s.drill ? <><span>Today's drill{s.drill.done ? " · ready" : " · being written"}</span><Link to="/sessions/$id" params={{ id: s.drill.run }} className="lx-chip is-primary">Open drill</Link></>
        : <><span>One focused drill on your weakest skill.</span><button type="button" className="lx-chip is-primary" disabled={!!busy || !s.profile.tracks.length} onClick={onDrill}>{busy === "drill" ? "Writing…" : "Get today's drill"}</button></>}
    </div>
  </section>;
}

function ReviewDeck({ cards, trackName, onGrade }: { cards: Card[]; trackName: (id: string) => string; onGrade: (id: string, g: "again" | "good" | "easy") => void }) {
  const due = useMemo(() => cards.filter((c) => c.due <= Date.now()).sort((a, b) => a.due - b.due), [cards]);
  const [flipped, setFlipped] = useState(false);
  const card = due[0];
  useEffect(() => setFlipped(false), [card?.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!card || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)) return;
      if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); }
      if (flipped && ["1", "2", "3"].includes(e.key)) onGrade(card.id, (["again", "good", "easy"] as const)[Number(e.key) - 1]!);
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [card, flipped, onGrade]);
  if (!card) return <section className="lx-deck is-empty"><BookOpenCheck size={26} /><h3>All caught up</h3><p>New cards arrive when the crew teaches you from a session or a drill. Reviews come back on schedule.</p></section>;
  return <section className="lx-deck" aria-live="polite">
    <div className="lx-deck-head"><span className="lx-kicker">{trackName(card.track)}</span><span className="lx-muted">{due.length} due</span></div>
    <button type="button" className={`lx-card ${flipped ? "is-flipped" : ""}`} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? "Show question" : "Reveal answer"}>
      <span className="lx-face is-front"><small>Question</small>{card.front}</span>
      <span className="lx-face is-back"><small>Answer</small>{card.back}{card.source.title && <em>From: {card.source.title}</em>}</span>
    </button>
    {flipped ? <div className="lx-grades">
      <button type="button" className="is-again" onClick={() => onGrade(card.id, "again")}><RotateCcw size={13} /> Again <kbd>1</kbd></button>
      <button type="button" className="is-good" onClick={() => onGrade(card.id, "good")}>Good <kbd>2</kbd></button>
      <button type="button" className="is-easy" onClick={() => onGrade(card.id, "easy")}>Easy <kbd>3</kbd></button>
    </div> : <p className="lx-muted lx-center">Think of your answer, then tap the card or press <kbd>Space</kbd>.</p>}
  </section>;
}

function AddTrack({ onAdd, existing }: { onAdd: (t: Track) => void; existing: Track[] }) {
  const [n, setN] = useState("");
  const id = slug(n);
  return <form className="lx-add" onSubmit={(e) => { e.preventDefault(); if (id && !existing.some((t) => t.id === id)) { onAdd({ id, name: n.trim(), level: 2, focus: true }); setN(""); } }}>
    <input className="setting-input" placeholder="Add a skill track, e.g. Rust" value={n} onChange={(e) => setN(e.target.value)} aria-label="New skill track" />
    <button className="settings-reset" disabled={!id || existing.some((t) => t.id === id)}><Plus size={13} /> Add</button>
  </form>;
}

function CardLibrary({ cards, tracks, onAdd, onRemove }: { cards: Card[]; tracks: Track[]; onAdd: (c: { front: string; back: string; track: string }) => void; onRemove: (id: string) => void }) {
  const [filter, setFilter] = useState(""), [front, setFront] = useState(""), [back, setBack] = useState(""), [track, setTrack] = useState("");
  const shown = cards.filter((c) => !filter || c.track === filter).slice().reverse();
  return <section className="lx-panel lx-library">
    <h2><BookOpenCheck size={14} /> Your cards</h2>
    <div className="lx-filters"><button type="button" aria-pressed={!filter} onClick={() => setFilter("")}>All · {cards.length}</button>{tracks.map((t) => <button key={t.id} type="button" aria-pressed={filter === t.id} onClick={() => setFilter(t.id)}>{t.name} · {cards.filter((c) => c.track === t.id).length}</button>)}</div>
    <form className="lx-new-card" onSubmit={(e) => { e.preventDefault(); onAdd({ front, back, track: track || tracks[0]?.id || "general" }); setFront(""); setBack(""); }}>
      <input className="setting-input" placeholder="Question" value={front} onChange={(e) => setFront(e.target.value)} aria-label="Card question" />
      <input className="setting-input" placeholder="Answer" value={back} onChange={(e) => setBack(e.target.value)} aria-label="Card answer" />
      <select className="setting-input" value={track} onChange={(e) => setTrack(e.target.value)} aria-label="Card track"><option value="">{tracks[0]?.name ?? "General"}</option>{tracks.slice(1).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <button className="settings-reset" disabled={!front.trim() || !back.trim()}><Plus size={13} /> Add card</button>
    </form>
    <ul className="lx-cards">{shown.map((c) => <li key={c.id}><div><strong>{c.front}</strong><p>{c.back}</p><small>{c.reps ? `Reviewed ${c.reps}× · next in ${Math.max(0, Math.round((c.due - Date.now()) / 86_400_000))}d` : "New"}{c.source.run && <> · <Link to="/sessions/$id" params={{ id: c.source.run }}>source</Link></>}</small></div>
      <button type="button" className="lx-icon" aria-label="Delete card" onClick={() => onRemove(c.id)}><Trash2 size={13} /></button></li>)}</ul>
    {!shown.length && <p className="lx-muted">No cards yet. Teach-me lessons, drills and your own cards land here.</p>}
  </section>;
}
