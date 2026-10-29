import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CircleDashed, Loader2, X } from "lucide-react";
import { api } from "../lib/api";
import { Dictation } from "./Dictation";
import { Markdown } from "./Markdown";
import "./explain-back.css";

type Session = { id: string; project: string; title: string; modifiedAt: number };
type Card = {
  id: string; kind: "retry" | "failure" | "edits" | "command"; title: string; what: string; why: string;
  concept: string; conceptDetail: string; evidence: Array<{ tool: string; target: string; ok: boolean; error: string | null }>;
};
type Verdict = "correct" | "partial" | "wrong";
type Score = { what: Verdict; why: Verdict; missed: string[]; feedback: string; points: number; scoredBy: "model" | "offline"; model: string | null };
type Cost = {
  calls: number; tokens: number; costUsd: number;
  entries: Array<{ purpose: "cards" | "score"; model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUsd: number; ms: number }>;
};
type Lesson = { id: string; project: string; title: string; cards: Card[]; explainStep: number; polished: boolean; cost: Cost };

const KIND: Record<Card["kind"], string> = { retry: "Failed, then fixed", failure: "Failed", edits: "Edits", command: "Command" };
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`);

function Mark({ v }: { v: Verdict }) {
  return <span className={`xb-mark is-${v}`}>{v === "correct" ? <Check size={12} /> : v === "partial" ? <CircleDashed size={12} /> : <X size={12} />}{v}</span>;
}

/**
 * Explain-back, inside the Teach view: pick a session you finished, see its key steps as cards,
 * then explain one back (voice or text) and get it scored against the transcript.
 */
export function ExplainBack({ compact = false }: { compact?: boolean }) {
  const [phase, setPhase] = useState<"idle" | "picking" | "loading" | "lesson">("idle");
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [at, setAt] = useState(0);
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState<Score | null>(null);
  const [scoring, setScoring] = useState(false);
  const [voice, setVoice] = useState<{ voice: boolean; missing: string[] }>({ voice: false, missing: [] });
  const [error, setError] = useState("");

  useEffect(() => { void api<{ voice: boolean; missing: string[] }>("/api/media").then(setVoice).catch(() => undefined); }, []);

  const pick = async () => {
    setError(""); setPhase("picking"); setSessions(null);
    try { setSessions((await api<{ sessions: Session[] }>("/api/explain-back/sessions")).sessions); }
    catch (e) { setError((e as Error).message); }
  };
  const open = async (session: string) => {
    setError(""); setPhase("loading");
    try {
      const l = await api<Lesson>("/api/explain-back/lessons", { body: { session } });
      setLesson(l); setAt(0); setAnswer(""); setScore(null); setPhase("lesson");
    } catch (e) { setError((e as Error).message); setPhase("picking"); }
  };
  const submit = async () => {
    if (!lesson || !answer.trim()) return;
    setError(""); setScoring(true);
    try {
      const r = await api<{ score: Score; cost: Cost }>(`/api/explain-back/lessons/${lesson.id}/answer`, { body: { step: lesson.explainStep, answer } });
      setScore(r.score); setLesson({ ...lesson, cost: r.cost });
    } catch (e) { setError((e as Error).message); }
    finally { setScoring(false); }
  };

  if (phase === "idle")
    return <section className={`xb ${compact ? "is-compact" : ""}`} aria-label="Explain back">
      <div className="xb-intro">
        <div><strong>Explain back</strong><span>Pick a session you finished. See its key steps, then explain one in your own words and get scored against what really happened.</span></div>
        <button type="button" onClick={() => void pick()}>Choose a session</button>
      </div>
    </section>;

  if (phase === "picking" || phase === "loading")
    return <section className={`xb ${compact ? "is-compact" : ""}`} aria-label="Explain back">
      <header className="xb-head"><div><small>EXPLAIN BACK</small><h2>{phase === "loading" ? "Reading the session…" : "Which session?"}</h2></div>
        <button type="button" onClick={() => setPhase("idle")}>Cancel</button></header>
      {phase === "loading" && <p className="xb-status" role="status"><Loader2 size={14} className="xb-spin" /> Finding the key steps and writing the cards. This takes a few seconds.</p>}
      {phase === "picking" && !sessions && !error && <p className="xb-status" role="status"><Loader2 size={14} className="xb-spin" /> Looking for finished sessions…</p>}
      {phase === "picking" && sessions && !sessions.length && <p className="xb-status">No finished sessions in ~/Developer/projects or ~/Developer/learn yet.</p>}
      {phase === "picking" && sessions && sessions.length > 0 && <ul className="xb-sessions">{sessions.map((s) =>
        <li key={s.id}><button type="button" onClick={() => void open(s.id)}><b>{s.project}</b><span>{s.title || "Untitled session"}</span><small>{ago(s.modifiedAt)}</small></button></li>)}</ul>}
      <small className="xb-scope">Only Claude Code sessions from ~/Developer/projects and ~/Developer/learn are listed. Work folders are never read.</small>
      {error && <p className="teaching-error" role="alert">{error}</p>}
    </section>;

  if (!lesson) return null;
  const card = lesson.cards[at]!, target = lesson.cards[lesson.explainStep]!, onTarget = at === lesson.explainStep;
  return <section className={`xb ${compact ? "is-compact" : ""}`} aria-label="Explain back">
    <header className="xb-head">
      <div><small>EXPLAIN BACK · {lesson.project}</small><h2>{lesson.title}</h2></div>
      <button type="button" onClick={() => void pick()}>Another session</button>
    </header>
    <ol className="xb-strip" aria-label="Key steps">{lesson.cards.map((c, i) =>
      <li key={c.id}><button type="button" aria-current={i === at ? "step" : undefined} className={`is-${c.kind}${i === lesson.explainStep ? " is-target" : ""}`} onClick={() => setAt(i)} title={c.title}>{i + 1}</button></li>)}</ol>
    <article className={`xb-card is-${card.kind}`}>
      <div className="xb-card-top"><span className="xb-kind">{KIND[card.kind]}</span><span>{at + 1} / {lesson.cards.length}</span>{onTarget && <span className="xb-yours">You'll explain this one</span>}</div>
      <h3>{card.title}</h3>
      <dl>
        <dt>What happened</dt><dd><Markdown text={card.what} /></dd>
        <dt>Why</dt><dd>{card.why}</dd>
        <dt>Concept</dt><dd><b className="xb-concept">{card.concept}</b> {card.conceptDetail}</dd>
      </dl>
      <details><summary>From the transcript ({card.evidence.length})</summary><ul className="xb-evidence">{card.evidence.map((e, i) =>
        <li key={i} className={e.ok ? "" : "is-bad"}><code>{e.tool}</code> {e.target}{e.error && <em> — {e.error}</em>}</li>)}</ul></details>
      <nav>
        <button type="button" disabled={at === 0} onClick={() => setAt(at - 1)}><ChevronLeft size={13} />Back</button>
        <button type="button" disabled={at >= lesson.cards.length - 1} onClick={() => setAt(at + 1)}>Next<ChevronRight size={13} /></button>
        {!onTarget && <button type="button" onClick={() => setAt(lesson.explainStep)}>Go to step {lesson.explainStep + 1}</button>}
      </nav>
    </article>
    <form className="xb-answer" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label htmlFor="xb-answer-text">Your turn. In your own words: in step {lesson.explainStep + 1} (“{target.title}”), what happened, and why?</label>
      <textarea id="xb-answer-text" rows={compact ? 3 : 4} value={answer} placeholder="Type, or press the mic and talk…" onChange={(e) => setAnswer(e.target.value)} />
      <div className="xb-answer-tools">
        <Dictation available={voice.voice} reason={voice.missing[0]} onText={(t) => setAnswer((cur) => (cur.trim() ? `${cur.trimEnd()} ${t}` : t))} />
        <button type="submit" disabled={scoring || answer.trim().length < 3}>{scoring ? <><Loader2 size={13} className="xb-spin" />Scoring…</> : score ? "Score again" : "Score my answer"}</button>
      </div>
    </form>
    {score && <section className="xb-score" aria-label="Your score" role="status">
      <div className="xb-score-row"><span>What</span><Mark v={score.what} /><span>Why</span><Mark v={score.why} /><b>{score.points}/4</b></div>
      <p>{score.feedback}</p>
      {score.missed.length > 0 && <><small>You missed</small><ul>{score.missed.map((m, i) => <li key={i}>{m}</li>)}</ul></>}
      <small>{score.scoredBy === "model" ? `Scored by ${score.model} against the transcript` : "Scored offline by matching the transcript's files, commands and reasons"}</small>
    </section>}
    <details className="xb-cost">
      <summary>This lesson's AI cost: {lesson.cost.calls} {lesson.cost.calls === 1 ? "call" : "calls"} · {lesson.cost.tokens.toLocaleString()} tokens · ≈{usd(lesson.cost.costUsd)}</summary>
      <table><thead><tr><th>For</th><th>Model</th><th>In</th><th>Out</th><th>Cache</th><th>≈ USD</th><th>Time</th></tr></thead>
        <tbody>{lesson.cost.entries.map((e, i) => <tr key={i}><td>{e.purpose === "cards" ? "Cards" : "Score"}</td><td>{e.model}</td><td>{e.inputTokens.toLocaleString()}</td><td>{e.outputTokens.toLocaleString()}</td>
          <td>{(e.cacheReadTokens + e.cacheCreationTokens).toLocaleString()}</td><td>{usd(e.costUsd)}</td><td>{(e.ms / 1000).toFixed(1)} s</td></tr>)}</tbody></table>
      <small>{lesson.polished ? "" : "Cards came straight from the transcript (no model call). "}Costs are the SDK's estimate at API list price, logged per call to ~/.shuacrew/explain-back/costs.jsonl.</small>
    </details>
    {error && <p className="teaching-error" role="alert">{error}</p>}
  </section>;
}
