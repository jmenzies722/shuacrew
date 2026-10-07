/**
 * Exam prep, on screen. Plan: will you pass, and what to do today — your predicted score against the pass mark, the
 * verdict, today's session in timed blocks, and the exam's blueprint domain by domain with your mastery. Practice:
 * exam-style questions on clean, readable cards (one decision per screen, an explanation for every option once you
 * answer), adaptive sets, domain drills, your misses, a diagnostic and full mock exams on the exam's own clock.
 * Everything comes from /api/exam; nothing here guesses.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, BookOpen, Check, ChevronDown, Clock, ExternalLink, Flag, Layers, ListChecks, Play, RotateCcw, Sparkles, Target, Timer, Trophy, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { api } from "../lib/api";
import "./learn-exam.css";

export interface Task { id: string; title: string; skills: string[] }
export interface Domain { id: string; name: string; weight: number; tasks: Task[] }
export interface Blueprint { code: string; name: string; provider: string; url: string; questions: number; scored?: number; minutes: number; passing: number; scale: [number, number]; formats: string[]; domains: Domain[]; source: "builtin" | "research"; at: number }
interface Mastery { accuracy: number; answered: number; correct: number; status: "new" | "learning" | "solid" | "mastered" }
export interface Block { kind: "review" | "learn" | "practice" | "mock" | "diagnostic"; minutes: number; title: string; detail: string; domain?: string; task?: string; count?: number }
export interface ExamView {
  cert: { id: string; name: string; code: string; examDate?: number; status: string; track: string }; key: string; blueprint: Blueprint | null; researching: string | null; failed?: boolean; builtin?: boolean;
  mastery?: { domains: Record<string, Mastery>; tasks: Record<string, Mastery>; answered: number };
  predicted?: { score: number; percent: number; confident: boolean };
  verdict?: { level: "start" | "building" | "close" | "ready"; title: string; why: string; gates: Array<{ label: string; met: boolean }> };
  plan?: { daysLeft: number | null; phase: string; phaseTitle: string; today: Block[]; milestones: Array<{ title: string; done: boolean; when?: string }> };
  bank?: { total: number; perDomain: Record<string, number>; writing: Record<string, boolean>; missed: number };
  mocks?: Array<{ id: string; started: number; finished?: number; correct?: number; score?: number; total: number }>;
  progress?: Progress;
}
export interface Progress {
  days: Array<{ day: string; answered: number; correct: number }>; streak: number; week: { answered: number; correct: number; minutes: number };
  trend: Array<{ end: number; score: number | null; answered: number }>; calibration: { sure: number | null; unsure: number | null; sureN: number; unsureN: number };
}
export interface Question { id: string; domain: string; task: string; kind: "single" | "multi"; stem: string; options: Array<{ id: string; text: string }>; answer: string[]; explain: string; why: Record<string, string>; refs: string[]; evidence?: string }
export type PracticeMode = "quick" | "drill" | "missed" | "diagnostic";
export type Start = { kind: "practice"; mode: PracticeMode; domain?: string; n?: number } | { kind: "mock" } | { kind: "review" } | { kind: "learn"; domain?: string; task?: string };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const STATUS: Record<Mastery["status"], string> = { new: "Not started", learning: "Learning", solid: "Solid", mastered: "Mastered" };
const COUNT = ["", "one", "two", "three", "four"];

/** The exam picture for one cert, refreshed while Shua is researching the guide or writing questions. */
export function useExam(certId: string | undefined) {
  const [view, setView] = useState<ExamView | null>(null), [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!certId) return;
    try { setView(await api<ExamView>(`/api/exam/${certId}`)); setError(""); } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); }
  }, [certId]);
  useEffect(() => { setView(null); void load(); }, [load]);
  const working = !!view?.researching || Object.values(view?.bank?.writing ?? {}).some(Boolean);
  useEffect(() => { if (!working) return; const t = setInterval(() => void load(), 15_000); return () => clearInterval(t); }, [working, load]);
  return { view, error, reload: load };
}

/** Exam words that change the answer — LEAST, MOST, NOT, TWO — in bold, the way the real exam's eye-catchers read. */
function Stem({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((para, i) => <p key={i} className="xq-stem">{para.split(/(\b[A-Z]{3,}\b)/).map((part, j) => /^[A-Z]{3,}$/.test(part) && !/^(AWS|API|IAM|KMS|VPC|EC2|ECS|EKS|ECR|SQS|SNS|RDS|SSM|ARN|CDK|SAM|ALB|NLB|ELB|DNS|TLS|SSL|CPU|RTO|RPO|SLA|CLI|SDK|JSON|YAML|HTTP|HTTPS|S3|SCP|ABAC|RBAC|MFA|SSO|URL|GPU|AMI|EBS|EFS|CIDR|NAT)$/.test(part) ? <strong key={j}>{part}</strong> : <Fragment key={j}>{part}</Fragment>)}</p>)}</>;
}

/** Your predicted score on the exam's scale, the pass mark marked on the arc. */
function Gauge({ score, passing, scale, confident, empty }: { score: number; passing: number; scale: [number, number]; confident: boolean; empty: boolean }) {
  const [lo, hi] = scale, at = (v: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  const arc = (t: number) => { const a = Math.PI * (1 - t); return [60 + 50 * Math.cos(a), 60 - 50 * Math.sin(a)] as const; };
  const [ex, ey] = arc(at(score)), [px, py] = arc(at(passing)), pass = score >= passing;
  return <div className={`xg${empty ? " is-empty" : pass ? " is-pass" : ""}`} role="img" aria-label={empty ? "No prediction yet" : `Predicted ${score}, pass mark ${passing}`}>
    <svg viewBox="0 0 120 70" aria-hidden="true">
      <path d="M10 60 A50 50 0 0 1 110 60" className="xg-track" />
      {!empty && <path d={`M10 60 A50 50 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`} className="xg-fill" />}
      <line x1={px} y1={py} x2={60 + 42 * (px - 60) / 50} y2={60 + 42 * (py - 60) / 50} className="xg-pass" />
    </svg>
    <div className="xg-read"><b>{empty ? "—" : score}</b><span>{empty ? "take the diagnostic" : `${confident ? "predicted" : "early estimate"} · pass ${passing}`}</span></div>
  </div>;
}

/** Plan: will you pass, and exactly what to do today. */
export function ExamPlan({ view, onStart, onResearch }: { view: ExamView; onStart: (s: Start) => void; onResearch: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const bp = view.blueprint;
  if (!bp) return <section className="xp-card xp-wait">
    <Sparkles size={18} /><div><h3>{view.failed ? "Shua couldn't read the exam guide" : `Shua is reading the official ${view.cert.code || view.cert.name} exam guide`}</h3>
      <p>{view.failed ? "It'll try again shortly, or ask now." : "Domains, weights, the format and the pass mark, from the provider itself. This takes a minute or two; the plan builds itself when it's done."}</p>
      {view.failed && <button type="button" className="xp-go" onClick={onResearch}>Try again</button>}</div>
  </section>;
  const m = view.mastery!, v = view.verdict!, plan = view.plan!, p = view.predicted!;
  const exam = view.cert.examDate ? new Date(view.cert.examDate).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : null;
  const total = plan.today.reduce((s, b) => s + b.minutes, 0);
  return <div className="xp">
    <section className={`xp-hero is-${v.level}`}>
      <div className="xp-hero-text">
        <span className="xp-kicker">{bp.code} · {bp.name}</span>
        <h2>{v.title}</h2>
        <p>{v.why}</p>
        <div className="xp-facts">
          {exam && <span><Clock size={13} /> Exam {exam}{plan.daysLeft !== null && plan.daysLeft >= 0 ? ` · ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"}` : ""}</span>}
          <span><ListChecks size={13} /> {bp.questions} questions · {bp.minutes} min · pass {bp.passing}</span>
          <span><Layers size={13} /> {m.answered} answered</span>
        </div>
      </div>
      <Gauge score={p.score} passing={bp.passing} scale={bp.scale} confident={p.confident} empty={!m.answered} />
    </section>

    <section className="xp-card">
      <header className="xp-head"><div><span className="xp-kicker">Today · {plan.phaseTitle}</span><h3>{total} minutes, in this order</h3></div>
        {plan.today[0] && <button type="button" className="xp-go" onClick={() => onStart(startOf(plan.today[0]!))}><Play size={14} /> Start</button>}</header>
      <ol className="xp-blocks">{plan.today.map((b, i) => <li key={i}>
        <span className={`xp-block-icon is-${b.kind}`}>{b.kind === "review" ? <RotateCcw size={15} /> : b.kind === "learn" ? <BookOpen size={15} /> : b.kind === "mock" ? <Timer size={15} /> : <Target size={15} />}</span>
        <div><b>{b.title}</b><span>{b.detail}</span></div>
        <em>{b.minutes} min</em>
        <button type="button" className="xp-quiet" onClick={() => onStart(startOf(b))} aria-label={`Start: ${b.title}`}><ArrowRight size={15} /></button>
      </li>)}</ol>
    </section>

    {view.progress && <ProgressCard progress={view.progress} bp={bp} />}

    <section className="xp-card">
      <header className="xp-head"><div><span className="xp-kicker">The exam, domain by domain</span><h3>Weight, and where you stand</h3></div>
        <span className="xp-legend"><i /> 70% target</span></header>
      <ul className="xp-domains">{bp.domains.map((d) => {
        const dm = m.domains[d.id], acc = dm?.answered ? dm.accuracy : 0, isOpen = open === d.id;
        return <li key={d.id} className={`is-${dm?.status ?? "new"}${isOpen ? " is-open" : ""}`}>
          <button type="button" className="xp-domain" onClick={() => setOpen(isOpen ? null : d.id)} aria-expanded={isOpen}>
            <span className="xp-weight">{d.weight}%</span>
            <span className="xp-dname">{d.name}<small>{dm?.answered ? `${dm.correct} of ${dm.answered} right` : "Not practised yet"}{view.bank?.writing[d.id] ? " · Shua is writing questions" : ""}</small></span>
            <span className="xp-bar" aria-label={dm?.answered ? `${pct(acc)} accurate` : "Not started"}><i style={{ width: dm?.answered ? pct(acc) : 0 }} /><b /></span>
            <span className="xp-status">{dm?.answered ? pct(acc) : "—"}<small>{STATUS[dm?.status ?? "new"]}</small></span>
            <ChevronDown size={15} className="xp-caret" />
          </button>
          {isOpen && <div className="xp-tasks">
            {d.tasks.map((t) => { const tm = m.tasks[t.id]; return <div key={t.id} className="xp-task">
              <span className="xp-tid">{t.id}</span>
              <div><b>{t.title}</b>{t.skills.length > 0 && <span className="xp-skills">{t.skills.join(" · ")}</span>}</div>
              <span className="xp-tstat">{tm?.answered ? pct(tm.accuracy) : "—"}</span>
              <button type="button" className="xp-quiet" onClick={() => onStart({ kind: "learn", domain: d.id, task: t.id })}><BookOpen size={13} /> Learn</button>
            </div>; })}
            <div className="xp-task-actions">
              <button type="button" className="xp-go" onClick={() => onStart({ kind: "practice", mode: "drill", domain: d.id })}><Target size={14} /> Drill {d.name}</button>
              <span>{view.bank?.perDomain[d.id] ?? 0} questions in the bank</span>
            </div>
          </div>}
        </li>;
      })}</ul>
    </section>

    <div className="xp-split">
      <section className="xp-card">
        <header className="xp-head"><div><span className="xp-kicker">Pass on the first try</span><h3>Ready when all three are true</h3></div></header>
        <ul className="xp-gates">{v.gates.map((g) => <li key={g.label} className={g.met ? "is-met" : ""}><i>{g.met ? <Check size={12} /> : null}</i>{g.label}</li>)}</ul>
      </section>
      <section className="xp-card">
        <header className="xp-head"><div><span className="xp-kicker">The road to exam day</span><h3>{plan.milestones.filter((x) => x.done).length} of {plan.milestones.length} done</h3></div></header>
        <ol className="xp-road">{plan.milestones.map((x) => <li key={x.title} className={x.done ? "is-done" : ""}><i />{x.title}{x.when && <small>{x.when}</small>}</li>)}</ol>
      </section>
    </div>

    <p className="xp-source">
      {bp.source === "builtin" ? `Blueprint from the official ${bp.provider} exam guide (built in)` : `Researched from the official guide${bp.at ? ` · ${new Date(bp.at).toLocaleDateString()}` : ""}`}
      {bp.url && <> · <a href={bp.url} target="_blank" rel="noreferrer">exam page <ExternalLink size={11} /></a></>}
      {view.researching ? " · Shua is checking the latest guide…" : <> · <button type="button" onClick={onResearch}>Check for a newer guide</button></>}
      {view.bank && ` · ${view.bank.total} practice questions`}
    </p>
  </div>;
}

/** How you're actually doing: streak, this week, the predicted score over 8 weeks, every day you practised, and calibration. */
function ProgressCard({ progress: p, bp }: { progress: Progress; bp: Blueprint }) {
  const scores = p.trend.map((t) => t.score).filter((x): x is number => x !== null);
  const lo = Math.min(bp.passing - 150, ...scores.map((x) => x - 40)), hi = Math.max(bp.passing + 100, ...scores.map((x) => x + 40));
  const W = 560, H = 128, x = (i: number) => 14 + (i * (W - 28)) / (p.trend.length - 1), y = (v: number) => 8 + (H - 22) * (1 - (v - lo) / (hi - lo));
  const pts = p.trend.map((t, i) => (t.score === null ? null : [x(i), y(t.score)] as const)).filter((v): v is readonly [number, number] => !!v);
  const level = (n: number) => (n === 0 ? 0 : n < 5 ? 1 : n < 10 ? 2 : n < 20 ? 3 : 4);
  const c = p.calibration, tip = c.sure !== null && c.sure < 0.8 ? `When you're sure, you're right ${pct(c.sure)} of the time — read every option before you commit.`
    : c.unsure !== null && c.unsure >= 0.7 ? `Your guesses are right ${pct(c.unsure)} of the time — you know more than you think.` : c.sure !== null ? `When you're sure, you're right ${pct(c.sure)} of the time. Well calibrated.` : "Mark Sure or Guessing before you check: a guess that lands counts half, so your score stays honest.";
  return <section className="xp-card xprog">
    <header className="xp-head"><div><span className="xp-kicker">Your progress</span><h3>{p.streak ? `${p.streak}-day streak` : "Start a streak today"}</h3></div></header>
    <div className="xpg-stats">
      <div><b>{p.week.answered}</b><span>questions this week</span></div>
      <div><b>{p.week.answered ? pct(p.week.correct / p.week.answered) : "—"}</b><span>right this week</span></div>
      <div><b>{p.week.minutes}</b><span>minutes practising</span></div>
      <div><b>{c.sure !== null ? pct(c.sure) : "—"}</b><span>right when you're sure</span></div>
    </div>
    <div className="xpg-grid">
      <figure className="xpg-trend">
        <figcaption>Predicted score, last 8 weeks</figcaption>
        {pts.length ? <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Predicted score ${scores.join(", ")}; pass ${bp.passing}`}>
          <line x1="0" x2={W} y1={y(bp.passing)} y2={y(bp.passing)} className="xpg-pass" /><text x={W - 4} y={y(bp.passing) - 4} textAnchor="end" className="xpg-passlabel">pass {bp.passing}</text>
          {pts.length > 1 && <polyline points={pts.map((v) => v.join(",")).join(" ")} className="xpg-line" />}
          {pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={i === pts.length - 1 ? 4.5 : 3} className={i === pts.length - 1 ? "xpg-now" : "xpg-pt"} />)}
          <text x={pts.at(-1)![0]} y={pts.at(-1)![1] - 9} textAnchor="middle" className="xpg-nowlabel">{scores.at(-1)}</text>
        </svg> : <p className="xpg-empty">Your first answers start the line.</p>}
      </figure>
      <figure className="xpg-days">
        <figcaption>Every day you practised</figcaption>
        <div className="xpg-heat">{p.days.map((d) => <i key={d.day} data-l={level(d.answered)} title={`${d.day}: ${d.answered ? `${d.answered} answered, ${d.correct} right` : "no practice"}`} />)}</div>
        <div className="xpg-legend"><span>8 weeks ago</span><span>today</span></div>
      </figure>
    </div>
    <p className="xpg-tip">{tip}</p>
  </section>;
}

const startOf = (b: Block): Start => b.kind === "review" ? { kind: "review" } : b.kind === "learn" ? { kind: "learn", domain: b.domain, task: b.task } : b.kind === "mock" ? { kind: "mock" }
  : b.kind === "diagnostic" ? { kind: "practice", mode: "diagnostic", n: b.count ?? 20 } : { kind: "practice", mode: b.domain ? "drill" : "quick", domain: b.domain, n: b.count };

/** One question, exam style: read, choose, check — then the answer and why, for every option. */
export function ExamCard({ q, index, total, domain, mode, onDone, reveal = true, chosen: controlled, onChoose }: {
  q: Question; index: number; total: number; domain?: string; mode: PracticeMode | "mock";
  onDone?: (correct: boolean) => void; reveal?: boolean; chosen?: string[]; onChoose?: (c: string[]) => void;
}) {
  const [own, setOwn] = useState<string[]>([]), chosen = controlled ?? own;
  const [result, setResult] = useState<{ correct: boolean } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [reported, setReported] = useState(false);
  const [sure, setSure] = useState<boolean | null>(null), reduce = useReducedMotion();
  const started = useRef(performance.now()), need = q.answer.length;
  useEffect(() => { setOwn([]); setResult(null); setError(""); setReported(false); setSure(null); started.current = performance.now(); }, [q.id]);
  const choose = (id: string) => {
    if (result) return;
    const next = need === 1 ? [id] : chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.length < need ? [...chosen, id] : [...chosen.slice(1), id];
    if (onChoose) onChoose(next); else setOwn(next);
  };
  const check = async () => {
    if (chosen.length !== need || busy || result) return;
    setBusy(true);
    try { const r = await api<{ correct: boolean }>("/api/exam/attempts", { body: { q: q.id, chosen, ms: Math.round(performance.now() - started.current), mode, ...(sure === null ? {} : { sure }) } }); setResult(r); }
    catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(false); }
  };
  // Keys: A–H (or 1–8) choose, Enter checks, then Enter goes on.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, [contenteditable]")) return;
      const k = e.key.toUpperCase(), byNumber = /^[1-8]$/.test(k) ? "ABCDEFGH"[Number(k) - 1] ?? "" : k;
      if (byNumber.length === 1 && q.options.some((o) => o.id === byNumber)) { e.preventDefault(); choose(byNumber); }
      else if (reveal && !result && (k === "S" || k === "U")) { e.preventDefault(); setSure(k === "S"); }
      else if (e.key === "Enter" && reveal) { e.preventDefault(); if (result) onDone?.(result.correct); else void check(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  const right = (id: string) => q.answer.includes(id);
  return <motion.article className={`xq${result ? (result.correct ? " is-right" : " is-wrong") : ""}`} aria-label={`Question ${index + 1} of ${total}`}
    initial={reduce ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}>
    <header className="xq-meta">
      <span className="xq-domain">{domain ?? q.domain}{q.task ? ` · ${q.task}` : ""}</span>
      <span>{index + 1} / {total}</span>
    </header>
    <div className="xq-body">
      <Stem text={q.stem} />
      {need > 1 && <p className="xq-choose">Choose {COUNT[need] ?? need}.</p>}
      <ol className="xq-options" role={need > 1 ? "group" : "radiogroup"}>{q.options.map((o) => {
        const on = chosen.includes(o.id), state = result ? (right(o.id) ? "is-correct" : on ? "is-missed" : "is-other") : on ? "is-on" : "";
        return <li key={o.id}>
          <button type="button" role={need > 1 ? "checkbox" : "radio"} aria-checked={on} className={`xq-option ${state}`} onClick={() => choose(o.id)} disabled={!!result}>
            <span className="xq-letter">{result && right(o.id) ? <Check size={14} /> : result && on ? <X size={14} /> : o.id}</span>
            <span className="xq-text">{o.text}</span>
          </button>
          {result && q.why[o.id] && <p className={`xq-why${right(o.id) ? " is-correct" : ""}`}>{q.why[o.id]}</p>}
        </li>;
      })}</ol>
    </div>
    {error && <p className="xq-error" role="alert">{error}</p>}
    {reveal && (!result
      ? <footer className="xq-foot"><span>{need > 1 ? `Choose ${COUNT[need]} · ` : ""}A–{q.options.at(-1)!.id} to choose · Enter to check</span>
          <div className="xq-sure" role="group" aria-label="How sure are you?">
            <small>How sure?</small>
            <button type="button" aria-pressed={sure === true} className={sure === true ? "is-on" : ""} onClick={() => setSure(sure === true ? null : true)} title="S">Sure</button>
            <button type="button" aria-pressed={sure === false} className={sure === false ? "is-on is-unsure" : ""} onClick={() => setSure(sure === false ? null : false)} title="U">Guessing</button>
          </div>
          <button type="button" className="xp-go" disabled={chosen.length !== need || busy} onClick={() => void check()}>{busy ? "Checking…" : "Check answer"}</button></footer>
      : <motion.section className="xq-explain" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
          <h4>{result.correct ? <><Check size={16} /> Correct</> : <><X size={16} /> The answer is {q.answer.join(" and ")}</>}</h4>
          {q.explain && <p>{q.explain}</p>}
          {q.evidence && <blockquote className="xq-evidence"><span>From the docs</span>{q.evidence}</blockquote>}
          {q.refs.length > 0 && <p className="xq-refs">{q.refs.map((r) => <a key={r} href={r} target="_blank" rel="noreferrer">{r.replace(/^https:\/\/(docs\.)?/, "").split("/").slice(0, 3).join("/")} <ExternalLink size={11} /></a>)}</p>}
          <Report id={q.id} onSent={() => setReported(true)} />
          <footer className="xq-foot"><span>{reported ? "On to the next one." : result.correct ? (sure === false ? "Right — but a guess counts half. It'll come back to make sure." : "On to the next one.") : sure === true ? "A confident miss: the most worth fixing. It'll come back first tomorrow." : "It's in your flashcards now, and it'll come back tomorrow."}</span>
            <button type="button" className="xp-go" onClick={() => onDone?.(result.correct)}>{index + 1 < total ? "Next question" : "See how you did"} <ArrowRight size={14} /></button></footer>
        </motion.section>)}
  </motion.article>;
}

/** "Something's wrong with this question": it leaves your practice, mocks and score, and its miss card leaves your deck. */
function Report({ id, onSent }: { id: string; onSent: () => void }) {
  const [state, setState] = useState<"idle" | "open" | "sending" | "sent">("idle"), [note, setNote] = useState(""), [error, setError] = useState("");
  const send = async () => {
    setState("sending"); setError("");
    try { await api(`/api/exam/questions/${encodeURIComponent(id)}/flag`, { body: { note } }); setState("sent"); onSent(); }
    catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); setState("open"); }
  };
  if (state === "sent") return <p className="xq-report is-sent"><Check size={13} /> Taken out of your practice — it won't count toward your score.</p>;
  if (state === "idle") return <p className="xq-report"><button type="button" className="xp-quiet is-wide" onClick={() => setState("open")}><Flag size={12} /> Something's wrong with this question?</button></p>;
  return <form className="xq-report is-open" onSubmit={(e) => { e.preventDefault(); void send(); }}>
    <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's wrong? e.g. B is also correct since…" aria-label="What's wrong" maxLength={500} />
    <button type="submit" className="xp-go" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Remove it"}</button>
    <button type="button" className="xp-quiet is-wide" onClick={() => setState("idle")}>Cancel</button>
    {error && <span className="xq-error" role="alert">{error}</span>}
  </form>;
}

/** A practice set: questions one at a time, then how it went and what to do next. */
export function ExamSession({ certId, blueprint, start, onExit, onAgain }: { certId: string; blueprint: Blueprint; start: { mode: PracticeMode; domain?: string; n?: number }; onExit: () => void; onAgain: () => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null), [i, setI] = useState(0), [results, setResults] = useState<boolean[]>([]), [error, setError] = useState(""), [short, setShort] = useState(false);
  const names = useMemo(() => Object.fromEntries(blueprint.domains.map((d) => [d.id, d.name])), [blueprint]);
  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ mode: start.mode, ...(start.domain ? { domain: start.domain } : {}), ...(start.n ? { n: String(start.n) } : {}) });
      const r = await api<{ questions: Question[]; short: boolean }>(`/api/exam/${certId}/practice?${q}`);
      setQuestions(r.questions); setShort(r.short); setI(0); setResults([]);
    } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); }
  }, [certId, start.mode, start.domain, start.n]);
  useEffect(() => { void load(); }, [load]);
  // No questions yet (Shua is writing the bank): look again every 20 s.
  useEffect(() => { if (questions?.length !== 0) return; const t = setInterval(() => void load(), 20_000); return () => clearInterval(t); }, [questions, load]);
  const title = start.mode === "diagnostic" ? "Diagnostic" : start.mode === "missed" ? "Your misses" : start.mode === "drill" ? `${names[start.domain ?? ""] ?? "Domain"} drill` : "Practice set";
  if (error) return <section className="xp-card xp-wait"><AlertTriangle size={18} /><div><h3>Couldn't load questions</h3><p>{error}</p><button type="button" className="xp-go" onClick={onExit}>Back</button></div></section>;
  if (!questions) return <section className="xp-card xp-wait"><Sparkles size={18} /><div><h3>Picking your questions…</h3></div></section>;
  if (!questions.length) return <section className="xp-card xp-wait"><Sparkles size={18} /><div>
    <h3>{start.mode === "missed" ? "Nothing to redo right now" : "Shua is writing questions for this"}</h3>
    <p>{start.mode === "missed" ? "Questions you miss come back the next day. Nice." : "Exam-style questions for this part of the exam, with an explanation for every option. They'll appear here in a minute or two."}</p>
    <button type="button" className="xp-quiet is-wide" onClick={onExit}>Back to the plan</button></div></section>;
  if (results.length >= questions.length) {
    const right = results.filter(Boolean).length, byDomain = new Map<string, { r: number; n: number }>();
    questions.forEach((q, k) => { const d = byDomain.get(q.domain) ?? { r: 0, n: 0 }; d.n++; if (results[k]) d.r++; byDomain.set(q.domain, d); });
    return <section className="xp-card xs-done">
      <span className="xp-kicker">{title} · done</span>
      <h2>{right} of {questions.length} right <small>{pct(right / questions.length)}</small></h2>
      <ul className="xs-domains">{[...byDomain].map(([d, x]) => <li key={d}><span>{names[d] ?? d}</span><span className="xp-bar"><i style={{ width: pct(x.r / x.n) }} /><b /></span><em>{x.r}/{x.n}</em></li>)}</ul>
      <p className="xs-note">{right / questions.length >= 0.8 ? "Strong. Your plan moves on to what's weakest next." : "Every miss is a flashcard now and comes back tomorrow. That's how it sticks."}</p>
      <div className="xs-actions"><button type="button" className="xp-go" onClick={onAgain}><RotateCcw size={14} /> Another set</button><button type="button" className="xp-quiet is-wide" onClick={onExit}>Back to the plan</button></div>
    </section>;
  }
  const q = questions[i]!;
  return <div className="xs">
    <header className="xs-head"><button type="button" className="xp-quiet is-wide" onClick={onExit}><X size={14} /> End</button><b>{title}</b>
      <span className="xs-progress" aria-label={`${results.length} of ${questions.length} answered`}>{questions.map((_, k) => <i key={k} className={k < results.length ? (results[k] ? "is-right" : "is-wrong") : k === i ? "is-now" : ""} />)}</span></header>
    {short && i === 0 && <p className="xs-short">Shua is writing more questions for this; here's what's ready.</p>}
    <ExamCard key={q.id} q={q} index={i} total={questions.length} domain={names[q.domain]} mode={start.mode} onDone={(ok) => { setResults((r) => [...r, ok]); setI((k) => Math.min(questions.length - 1, k + 1)); }} />
  </div>;
}

/** A full mock exam: the real length, weighting and clock; answers only at the end. */
export function MockExam({ certId, blueprint, onExit }: { certId: string; blueprint: Blueprint; onExit: () => void }) {
  const [mock, setMock] = useState<{ id: string; minutes: number; started: number } | null>(null), [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string[]>>({}), [flagged, setFlagged] = useState<string[]>([]), [i, setI] = useState(0);
  const [report, setReport] = useState<null | { correct: number; percent: number; score: number; passed: boolean; passing: number; questions: number; domains: Array<{ id: string; name: string; weight: number; right: number; of: number }> }>(null);
  const [error, setError] = useState(""), [now, setNow] = useState(Date.now()), [reviewing, setReviewing] = useState(false);
  const names = useMemo(() => Object.fromEntries(blueprint.domains.map((d) => [d.id, d.name])), [blueprint]);
  useEffect(() => { void api<{ mock: { id: string; minutes: number; started: number }; questions: Question[] }>(`/api/exam/${certId}/mocks`, { body: {} }).then((r) => { setMock(r.mock); setQuestions(r.questions); }, (e: Error) => setError(e.message.replace(/^\d+\s*/, ""))); }, [certId]);
  useEffect(() => { if (!mock || report) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [mock, report]);
  const save = useRef<ReturnType<typeof setTimeout>>(undefined);
  const persist = (a: Record<string, string[]>, f: string[]) => { clearTimeout(save.current); save.current = setTimeout(() => { if (mock) void api(`/api/exam/mocks/${mock.id}`, { body: { answers: a, flagged: f } }).catch(() => {}); }, 600); };
  const finish = useCallback(async () => { if (!mock) return; try { await api(`/api/exam/mocks/${mock.id}`, { body: { answers, flagged } }); setReport(await api(`/api/exam/mocks/${mock.id}/finish`, { body: {} })); } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } }, [mock, answers, flagged]);
  const left = mock ? Math.max(0, mock.started + mock.minutes * 60_000 - now) : 0;
  useEffect(() => { if (mock && !report && left === 0) void finish(); }, [left, mock, report, finish]);
  if (error) return <section className="xp-card xp-wait"><AlertTriangle size={18} /><div><h3>No mock exam yet</h3><p>{error}</p><button type="button" className="xp-quiet is-wide" onClick={onExit}>Back</button></div></section>;
  if (!mock) return <section className="xp-card xp-wait"><Timer size={18} /><div><h3>Setting up your mock exam…</h3></div></section>;
  if (report) return <section className="xp-card xs-done">
    <span className="xp-kicker">Mock exam · {report.questions} questions</span>
    <h2 className={report.passed ? "is-pass" : "is-fail"}>{report.score} <small>{report.passed ? `pass · ${report.passing} needed` : `${report.passing} needed to pass`}</small></h2>
    <p className="xs-note">{report.correct} of {report.questions} right ({pct(report.percent)}). {report.percent >= 0.8 ? "That's the margin that makes the real thing safe." : "Your plan now leans on the domains below with the lowest scores."}</p>
    <ul className="xs-domains">{report.domains.map((d) => <li key={d.id}><span>{d.name} <small>{d.weight}%</small></span><span className="xp-bar"><i style={{ width: d.of ? pct(d.right / d.of) : 0 }} /><b /></span><em>{d.right}/{d.of}</em></li>)}</ul>
    <div className="xs-actions"><button type="button" className="xp-go" onClick={() => setReviewing((x) => !x)}><ListChecks size={14} /> {reviewing ? "Hide answers" : "Review every answer"}</button><button type="button" className="xp-quiet is-wide" onClick={onExit}>Back to the plan</button></div>
    {reviewing && <div className="xm-review">{questions.map((q, k) => <MockAnswer key={q.id} q={q} k={k} total={questions.length} chosen={answers[q.id] ?? []} domain={names[q.domain]} />)}</div>}
  </section>;
  const q = questions[i]!, mm = Math.floor(left / 60_000), ss = Math.floor((left % 60_000) / 1000), answered = questions.filter((x) => (answers[x.id]?.length ?? 0) > 0).length;
  return <div className="xm">
    <header className="xs-head">
      <button type="button" className="xp-quiet is-wide" onClick={() => { if (confirm("Leave the mock? It stays unfinished.")) onExit(); }}><X size={14} /> Leave</button>
      <b><Timer size={14} /> {mm}:{String(ss).padStart(2, "0")} left</b>
      <span>{answered} of {questions.length} answered</span>
      <button type="button" className="xp-go" onClick={() => { if (answered === questions.length || confirm(`${questions.length - answered} unanswered. Finish anyway?`)) void finish(); }}><Trophy size={14} /> Finish</button>
    </header>
    <div className="xm-body">
      <ExamCard key={q.id} q={q} index={i} total={questions.length} domain={names[q.domain]} mode="mock" reveal={false} chosen={answers[q.id] ?? []}
        onChoose={(c) => { const a = { ...answers, [q.id]: c }; setAnswers(a); persist(a, flagged); }} />
      <aside className="xm-nav" aria-label="Questions">
        <div className="xm-grid">{questions.map((x, k) => <button key={x.id} type="button" className={`${k === i ? "is-now" : ""}${answers[x.id]?.length ? " is-answered" : ""}${flagged.includes(x.id) ? " is-flagged" : ""}`} onClick={() => setI(k)} aria-label={`Question ${k + 1}`}>{k + 1}</button>)}</div>
        <div className="xm-moves">
          <button type="button" className="xp-quiet is-wide" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</button>
          <button type="button" className={`xp-quiet is-wide${flagged.includes(q.id) ? " is-on" : ""}`} onClick={() => { const f = flagged.includes(q.id) ? flagged.filter((x) => x !== q.id) : [...flagged, q.id]; setFlagged(f); persist(answers, f); }}><Flag size={13} /> {flagged.includes(q.id) ? "Flagged" : "Flag"}</button>
          <button type="button" className="xp-go" disabled={i === questions.length - 1} onClick={() => setI(i + 1)}>Next <ArrowRight size={14} /></button>
        </div>
      </aside>
    </div>
  </div>;
}

function MockAnswer({ q, k, total, chosen, domain }: { q: Question; k: number; total: number; chosen: string[]; domain?: string }) {
  const ok = chosen.length === q.answer.length && [...chosen].sort().join() === [...q.answer].sort().join();
  const [open, setOpen] = useState(!ok);
  return <div className={`xm-answer${ok ? " is-right" : " is-wrong"}`}>
    <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open}><i>{ok ? <Check size={12} /> : <X size={12} />}</i><span>{k + 1}. {q.stem.slice(0, 120)}{q.stem.length > 120 ? "…" : ""}</span><ChevronDown size={14} /></button>
    {open && <div className="xm-answer-body">
      <p className="xm-line"><b>You chose</b> {chosen.length ? chosen.join(", ") : "nothing"} · <b>Answer</b> {q.answer.join(", ")} · {domain}</p>
      <Stem text={q.stem} />
      <ol className="xq-options">{q.options.map((o) => <li key={o.id}><div className={`xq-option ${q.answer.includes(o.id) ? "is-correct" : chosen.includes(o.id) ? "is-missed" : "is-other"}`}><span className="xq-letter">{o.id}</span><span className="xq-text">{o.text}</span></div>{q.why[o.id] && <p className={`xq-why${q.answer.includes(o.id) ? " is-correct" : ""}`}>{q.why[o.id]}</p>}</li>)}</ol>
      {q.explain && <p className="xm-explain">{q.explain}</p>}
      <small className="xm-k">{k + 1} of {total}</small>
    </div>}
  </div>;
}

/** Practice: pick how to practise; every mode says what it's for. */
export function ExamPractice({ view, onStart }: { view: ExamView; onStart: (s: Start) => void }) {
  const bp = view.blueprint, [domain, setDomain] = useState(bp?.domains[0]?.id ?? "");
  if (!bp) return null;
  const diag = (view.mastery?.answered ?? 0) < 15;
  const modes: Array<{ id: string; icon: typeof Target; title: string; why: string; meta: string; go: () => void; hot?: boolean }> = [
    ...(diag ? [{ id: "diag", icon: Target, title: "Diagnostic", why: "20 questions spread like the exam. It aims your whole plan.", meta: "~30 min", go: () => onStart({ kind: "practice", mode: "diagnostic", n: 20 }), hot: true }] : []),
    { id: "quick", icon: Sparkles, title: "Smart set", why: "10 questions where the exam weighs most and you're weakest.", meta: "~20 min", go: () => onStart({ kind: "practice", mode: "quick", n: 10 }), hot: !diag },
    { id: "missed", icon: RotateCcw, title: "Your misses", why: "Questions you got wrong, back the next day until you get them right.", meta: `${view.bank?.missed ?? 0} due`, go: () => onStart({ kind: "practice", mode: "missed", n: 20 }) },
    { id: "mock", icon: Timer, title: "Mock exam", why: `${bp.questions} questions, ${bp.minutes} minutes, answers at the end — the real thing.`, meta: `${bp.minutes} min`, go: () => onStart({ kind: "mock" }) },
    { id: "cards", icon: Layers, title: "Flashcards", why: "Spaced review of what you've learned and every question you missed.", meta: "a few minutes", go: () => onStart({ kind: "review" }) },
  ];
  return <div className="xr">
    <div className="xr-grid">{modes.map((x) => <button key={x.id} type="button" className={`xr-mode${x.hot ? " is-hot" : ""}`} onClick={x.go}>
      <x.icon size={18} /><b>{x.title}</b><span>{x.why}</span><em>{x.meta}</em></button>)}</div>
    <section className="xp-card xr-drill">
      <div><span className="xp-kicker">Domain drill</span><h3>Practise one part of the exam</h3></div>
      <select value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domain">{bp.domains.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.weight}%</option>)}</select>
      <button type="button" className="xp-go" onClick={() => onStart({ kind: "practice", mode: "drill", domain, n: 10 })}><Target size={14} /> Drill it</button>
    </section>
    {(view.mocks?.length ?? 0) > 0 && <section className="xp-card">
      <header className="xp-head"><div><span className="xp-kicker">Your mock exams</span></div></header>
      <ul className="xr-mocks">{view.mocks!.filter((x) => x.finished).slice(-5).reverse().map((x) => <li key={x.id}><span>{new Date(x.finished!).toLocaleDateString()}</span><b className={(x.score ?? 0) >= bp.passing ? "is-pass" : "is-fail"}>{x.score}</b><span>{x.correct}/{x.total} right</span></li>)}</ul>
    </section>}
  </div>;
}

/** The exam's tasks, each one a lesson Shua teaches for this exam. */
export function ExamTasks({ view, onTeach }: { view: ExamView; onTeach: (task: Task, domain: Domain) => void }) {
  const bp = view.blueprint; if (!bp) return null;
  // One bright button: the lesson today's plan picked. The rest stay quiet so the list reads, not shouts.
  const next = view.plan?.today.find((b) => b.kind === "learn")?.task;
  return <div className="xt">{bp.domains.map((d) => <section key={d.id} className="xp-card">
    <header className="xp-head"><div><span className="xp-kicker">{d.weight}% of the exam</span><h3>{d.name}</h3></div></header>
    <ul className="xt-list">{d.tasks.map((t) => { const tm = view.mastery?.tasks[t.id]; return <li key={t.id}>
      <span className="xp-tid">{t.id}</span>
      <div><b>{t.title}</b>{t.skills.length > 0 && <span className="xp-skills">{t.skills.join(" · ")}</span>}</div>
      <span className={`xt-stat is-${tm?.status ?? "new"}`}>{tm?.answered ? pct(tm.accuracy) : STATUS.new}</span>
      <button type="button" className={t.id === next ? "xp-go" : "xp-quiet is-wide"} onClick={() => onTeach(t, d)}><BookOpen size={13} /> {t.id === next ? "Today's lesson" : "Teach me"}</button>
    </li>; })}</ul>
  </section>)}</div>;
}

/** What Shua is asked when you open a task's lesson: taught for this exam, ending in cards. */
export const lessonAsk = (bp: Blueprint, d: Domain, t: Task) => [
  `Teach me ${bp.code} task ${t.id}: "${t.title}" (${d.name}, ${d.weight}% of the ${bp.name} exam).`,
  t.skills.length ? `Cover: ${t.skills.join(", ")}.` : "",
  "Structure it: 1) the idea in plain words, 2) how each service fits and when to choose which (a comparison table), 3) the decision rules the exam tests (\"least operational overhead\", \"most cost-effective\", cross-account, multi-Region), 4) the traps — the plausible wrong answers and why they're wrong, 5) one worked exam-style scenario.",
  'Then check me with a ```quiz fenced JSON array of 3 exam-style questions [{"stem": "…", "options": ["…", "…", "…", "…"], "answer": ["B"], "explain": "why, in 1–2 sentences", "why": {"A": "why not", …}}] — scenario-style, one clearly best answer, plausible wrong ones.',
  "End with a ```cards block of the 4–6 facts most worth remembering.",
].filter(Boolean).join("\n");

export { Gauge };
