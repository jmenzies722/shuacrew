/**
 * Learn's career side: your Path (roadmap milestones), the Certs you're working toward and your Jobs pipeline, plus
 * "Ask Shua" — say what happened in plain words ("booked the CKA for March 3", "applied to Grafana") and Shua keeps it
 * all organized (gateway: learning-career.ts, coach mode `organize`). Every view shows the next action first.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUp, Award, BadgeCheck, Briefcase, CalendarClock, Check, ExternalLink, Flag, Loader2, Plus, RotateCcw, Search, Sparkles, Target, Trash2, X } from "lucide-react";
import type { AnyEvent } from "@shuacrew/core/events";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { Markdown } from "../components/Markdown";
import { article, goalRole } from "../lib/learn-today";
import "./learn-career.css";

export interface Milestone { title: string; why: string; skills: string[]; project: string; weeks: number; done?: boolean }
export interface Roadmap { id: string; goal: string; months: number; title: string; run: string; created: number; milestones: Milestone[] }
export interface Cert { id: string; name: string; provider: string; code: string; status: "planned" | "studying" | "booked" | "passed"; examDate?: number; passedAt?: number; track: string; plan?: string; steps: Array<{ title: string; done: boolean }>; notes: string; created: number }
export interface Job {
  id: string; company: string; role: string; url: string; stage: "saved" | "applied" | "interviewing" | "offer" | "closed"; location: string; salary: string;
  next: string; nextAt?: number; notes: string; description: string; fit?: { run: string; score?: number; summary: string; gaps: string[] }; source: "you" | "shua"; created: number; updated: number;
}
export interface TrackInsight { id: string; name: string; cards: number; due: number; reviews: number; accuracy: number | null }
export interface CareerState { profile: { goal: string }; roadmaps?: Roadmap[]; certs?: Cert[]; jobs?: Job[]; coach?: Record<string, { run: string }> }

const DAY = 86_400_000;
const active = (status?: string) => !!status && ["queued", "planning", "running"].includes(status);
const daysTo = (t: number, now = Date.now()) => Math.ceil((t - now) / DAY);
const isoDay = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : "");
const clean = (title: string) => title.replace(/^\d+\.\s*/, "");
function useRunStatus() { return useLive((s) => s.crew.runs); }
const errText = (e: unknown) => (e as Error).message.replace(/^\d+\s*/, "");

/** In days, said plainly: "today", "in 3 days", "2 days ago". */
export function when(t: number, now = Date.now()) {
  const d = daysTo(t, now);
  return d === 0 ? "today" : d === 1 ? "tomorrow" : d > 1 ? `in ${d} days` : d === -1 ? "yesterday" : `${-d} days ago`;
}

// ── Path ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export function PathView({ state, onChange, startCourse }: { state: CareerState; onChange: () => void; startCourse: (topic: string) => void }) {
  const runs = useRunStatus(), reduce = useReducedMotion();
  const goal = state.profile.goal.trim();
  const all = [...(state.roadmaps ?? [])].sort((a, b) => b.created - a.created);
  const ready = all.filter((r) => r.milestones.length);
  const [pick, setPick] = useState<string | null>(null);
  const road = ready.find((r) => r.id === pick) ?? ready.find((r) => r.goal.trim().toLowerCase() === goal.toLowerCase()) ?? ready[0];
  const building = all.filter((r) => !r.milestones.length && active(runs[r.run]?.status));
  const drafts = all.filter((r) => !r.milestones.length && !active(runs[r.run]?.status));
  const [newGoal, setNewGoal] = useState(goal), [months, setMonths] = useState(6), [busy, setBusy] = useState(""), [error, setError] = useState("");
  const act = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setError(""); try { await fn(); onChange(); } catch (e) { setError(errText(e)); } finally { setBusy(""); } };
  const done = road ? road.milestones.filter((m) => m.done).length : 0, current = road ? road.milestones.findIndex((m) => !m.done) : -1;
  const weeksLeft = road ? road.milestones.filter((m) => !m.done).reduce((n, m) => n + (m.weeks || 0), 0) : 0;
  return <div className="lc">
    <section className="lc-head">
      <div><h2>{road ? (road.title || `${road.months} months to ${road.goal}`) : goal ? `A plan to become ${article(goalRole(goal))} ${goalRole(goal)}` : "Where are you headed?"}</h2>
        {road && <p className="lc-sub">{done} of {road.milestones.length} milestones · about {Math.max(1, Math.round(weeksLeft))} weeks to go</p>}</div>
      {ready.length > 1 && <div className="lc-pills" role="tablist" aria-label="Roadmaps">{ready.map((r) => <button key={r.id} type="button" role="tab" aria-selected={r.id === road?.id} className={r.id === road?.id ? "is-on" : ""} onClick={() => setPick(r.id)}>{r.title || r.goal}</button>)}</div>}
    </section>
    {road && <div className="lc-progress" aria-hidden><i style={{ width: `${Math.round((done / road.milestones.length) * 100)}%` }} /></div>}
    {error && <p className="lx-error" role="alert">{error}</p>}
    {road ? <ol className="lc-timeline">{road.milestones.map((m, i) => {
      const state$ = m.done ? "is-done" : i === current ? "is-now" : "";
      return <motion.li key={i} className={state$} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.035, type: "spring", stiffness: 420, damping: 34 }}>
        <span className="lc-node">{m.done ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
        <div className="lc-step">
          <header><strong>{clean(m.title)}</strong><small>{m.weeks ? `${m.weeks} wk` : ""}</small></header>
          {(i === current || !m.done) && m.why && <p>{m.why}</p>}
          {m.project && i === current && <p className="lc-prove"><Flag size={12} /> <b>Prove it:</b> {m.project}</p>}
          {m.skills.length > 0 && <div className="lc-chips">{m.skills.slice(0, 8).map((k) => <span key={k}>{k}</span>)}</div>}
          <div className="lc-actions">
            {i === current && <button type="button" className="lc-go" disabled={!!busy} onClick={() => startCourse(clean(m.title))}>Start a course on it <ArrowRight size={13} /></button>}
            <button type="button" className={m.done ? "lc-quiet" : ""} disabled={!!busy} onClick={() => void act(`m${i}`, () => api(`/api/learning/roadmaps/${road.id}/milestones/${i}`, { body: { done: !m.done } }))}>{m.done ? "Undo" : "Mark done"}</button>
          </div>
        </div>
      </motion.li>;
    })}</ol> : <div className="lc-empty"><Target size={18} /><p>{building.length ? "Shua is writing your roadmap: milestones, the skills each builds, and a project that proves it." : "A realistic plan: milestones in order, the skills each builds, and one project per step that proves it."}</p></div>}
    <form className="lc-new" onSubmit={(e) => { e.preventDefault(); if (newGoal.trim()) void act("roadmap", () => api("/api/learning/roadmaps", { body: { goal: newGoal.trim(), months } })); }}>
      <span className="lt-kicker">{road ? "Plan another path" : "Build your roadmap"}</span>
      <div><input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder="Where you're headed, e.g. DevOps Engineer" aria-label="Goal" />
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Months">{[3, 6, 9, 12].map((n) => <option key={n} value={n}>{n} months</option>)}</select>
        <button type="submit" className="lc-go" disabled={!!busy || !newGoal.trim() || building.length > 0}>{building.length ? <><Loader2 size={13} className="lc-spin" /> Writing…</> : busy === "roadmap" ? "Starting…" : <>Build it <ArrowRight size={13} /></>}</button></div>
    </form>
    {drafts.length > 0 && <p className="lc-drafts">{drafts.length} empty draft{drafts.length === 1 ? "" : "s"} that never got milestones.
      <button type="button" disabled={!!busy} onClick={() => void act("drafts", async () => { for (const d of drafts) await api(`/api/learning/roadmaps/${d.id}`, { method: "DELETE" }); })}>Clear {drafts.length === 1 ? "it" : "them"}</button></p>}
  </div>;
}

// ── Certs ────────────────────────────────────────────────────────────────────────────────────────────────────────
const CERT_STATUS: Array<[Cert["status"], string]> = [["planned", "Planned"], ["studying", "Studying"], ["booked", "Booked"], ["passed", "Passed"]];
/** Starting points for a goal (only suggestions — nothing is added until you pick one). */
export function certIdeas(goal: string): Array<{ name: string; code: string; provider: string }> {
  const g = goal.toLowerCase();
  const devops = [
    { name: "AWS Certified Solutions Architect – Associate", code: "SAA-C03", provider: "AWS" },
    { name: "Certified Kubernetes Administrator", code: "CKA", provider: "CNCF" },
    { name: "HashiCorp Certified: Terraform Associate", code: "Terraform 004", provider: "HashiCorp" },
    { name: "AWS Certified DevOps Engineer – Professional", code: "DOP-C02", provider: "AWS" },
    { name: "Certified Kubernetes Application Developer", code: "CKAD", provider: "CNCF" },
  ];
  const ai = [
    { name: "AWS Certified Machine Learning Engineer – Associate", code: "MLA-C01", provider: "AWS" },
    { name: "AWS Certified AI Practitioner", code: "AIF-C01", provider: "AWS" },
    { name: "Google Cloud Professional Machine Learning Engineer", code: "PMLE", provider: "Google Cloud" },
  ];
  if (/\b(ai|ml|machine learning|llm|agent)/.test(g)) return [...ai, devops[0]!, devops[1]!];
  if (/(devops|platform|sre|cloud|infra|reliability)/.test(g)) return devops;
  return [devops[0]!, ai[1]!, devops[1]!];
}
export function CertsView({ state, tracks, onChange, review, quiz }: { state: CareerState; tracks: TrackInsight[]; onChange: () => void; review: () => void; quiz: (topic: string) => void }) {
  const runs = useRunStatus(), navigate = useNavigate(), reduce = useReducedMotion();
  const certs = [...(state.certs ?? [])].sort((a, b) => (a.status === "passed" ? 1 : 0) - (b.status === "passed" ? 1 : 0) || (a.examDate ?? Infinity) - (b.examDate ?? Infinity));
  const [name, setName] = useState(""), [code, setCode] = useState(""), [date, setDate] = useState(""), [busy, setBusy] = useState(""), [error, setError] = useState(""), [dating, setDating] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setError(""); try { await fn(); onChange(); } catch (e) { setError(errText(e)); } finally { setBusy(""); } };
  const add = (body: Record<string, unknown>) => act("add", async () => { await api("/api/learning/certs", { body }); setName(""); setCode(""); setDate(""); });
  const ideas = certIdeas(state.profile.goal).filter((i) => !certs.some((c) => c.code.toLowerCase() === i.code.toLowerCase()));
  return <div className="lc">
    <section className="lc-head"><div><h2>{certs.length ? `${certs.filter((c) => c.status !== "passed").length} in progress · ${certs.filter((c) => c.status === "passed").length} passed` : "Prove it on paper too"}</h2>
      <p className="lc-sub">Shua builds each one a study plan with flashcards; readiness comes from how you actually do on them.</p></div></section>
    {error && <p className="lx-error" role="alert">{error}</p>}
    <div className="lc-grid">{certs.map((c, i) => {
      const t = tracks.find((x) => x.id === c.track), planning = active(runs[c.plan ?? ""]?.status), days = c.examDate ? daysTo(c.examDate) : null;
      const stepsDone = c.steps.filter((s) => s.done).length, nextStep = c.steps.findIndex((s) => !s.done);
      const readiness = t && t.reviews >= 5 && t.accuracy !== null ? Math.round(t.accuracy * 100) : null;
      return <motion.article key={c.id} className={`lc-card lc-cert is-${c.status}`} initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: Math.min(i, 6) * 0.04, type: "spring", stiffness: 420, damping: 34 }}>
        <header>
          <span className="lc-badge"><Award size={15} /></span>
          <div><strong>{c.code || c.name}</strong><small>{c.code ? c.name : c.provider}</small></div>
          <button type="button" className="lc-icon" aria-label={`Remove ${c.code || c.name}`} title="Remove" disabled={!!busy} onClick={() => { if (window.confirm(`Remove ${c.code || c.name}? Its flashcards stay in your deck.`)) void act(`x:${c.id}`, () => api(`/api/learning/certs/${c.id}`, { method: "DELETE" })); }}><Trash2 size={13} /></button>
        </header>
        <div className="lc-seg" role="radiogroup" aria-label="Status">{CERT_STATUS.map(([s, label]) => <button key={s} type="button" role="radio" aria-checked={c.status === s} className={c.status === s ? "is-on" : ""} disabled={!!busy} onClick={() => void act(`s:${c.id}`, () => api(`/api/learning/certs/${c.id}`, { body: { status: s } }))}>{label}</button>)}</div>
        <div className="lc-facts">
          <label className={days !== null && days <= 14 && c.status !== "passed" ? "is-soon" : ""}><CalendarClock size={13} /><span>{c.status === "passed" ? `Passed ${c.passedAt ? when(c.passedAt) : ""}` : days === null ? "No exam date" : days < 0 ? `Exam was ${when(c.examDate!)}` : `Exam ${when(c.examDate!)}`}</span>
            {c.status !== "passed" && (c.examDate || dating === c.id
              ? <input type="date" autoFocus={dating === c.id} value={isoDay(c.examDate)} aria-label="Exam date" onBlur={() => setDating(null)} onChange={(e) => { setDating(null); void act(`d:${c.id}`, () => api(`/api/learning/certs/${c.id}`, { body: { examDate: e.target.value } })); }} />
              : <button type="button" className="lc-setdate" onClick={() => setDating(c.id)}>Set date</button>)}</label>
          <span title={t ? `${t.cards} cards · ${t.due} due` : undefined}><Target size={13} />{readiness === null ? (t?.cards ? `${t.cards} cards · review to measure readiness` : "Readiness shows after a few reviews") : `${readiness}% right · ${t!.cards} cards`}</span>
        </div>
        {readiness !== null && <div className="lc-meter" aria-label={`Readiness ${readiness}%`}><i style={{ width: `${readiness}%` }} data-tone={readiness < 60 ? "low" : readiness < 80 ? "mid" : "high"} /></div>}
        {c.steps.length > 0 ? <ol className="lc-steps" aria-label="Study plan">{c.steps.map((s, k) => <li key={k} className={s.done ? "is-done" : k === nextStep ? "is-now" : ""}>
          <button type="button" aria-pressed={s.done} aria-label={s.done ? `Undo ${s.title}` : `Done: ${s.title}`} disabled={!!busy} onClick={() => void act(`st:${c.id}:${k}`, () => api(`/api/learning/certs/${c.id}`, { body: { step: k, done: !s.done } }))}>{s.done && <Check size={11} strokeWidth={3} />}</button>
          <span>{s.title}</span></li>)}</ol>
          : c.status !== "passed" && <p className="lc-hint">{planning ? <><Loader2 size={13} className="lc-spin" /> Shua is writing your study plan and flashcards…</> : "No study plan yet: Shua can build one around your exam date."}</p>}
        <div className="lc-actions">
          {c.status !== "passed" && !c.steps.length && <button type="button" className="lc-go" disabled={!!busy || planning} onClick={() => void act(`p:${c.id}`, () => api(`/api/learning/certs/${c.id}/plan`, { body: {} }))}>{planning ? "Writing…" : <>Build study plan <Sparkles size={13} /></>}</button>}
          {c.steps.length > 0 && <span className="lc-count">{stepsDone}/{c.steps.length} steps</span>}
          {t && t.due > 0 && <button type="button" onClick={review}>Review {t.due} due</button>}
          {c.status !== "passed" && <button type="button" onClick={() => quiz(`${c.code ? `${c.code} ` : ""}${c.name}`)}>Quiz me</button>}
          {c.plan && <button type="button" className="lc-quiet" onClick={() => void navigate({ to: "/sessions/$id", params: { id: c.plan! } })}>Plan session <ExternalLink size={12} /></button>}
        </div>
      </motion.article>;
    })}
      <form className="lc-card lc-add" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void add({ name: name.trim(), code: code.trim(), examDate: date }); }}>
        <span className="lt-kicker">Add a certification</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Certified Kubernetes Administrator" aria-label="Certification name" />
        <div><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (CKA)" aria-label="Exam code" /><input type="date" className={date ? "" : "is-empty"} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Exam date" title="Exam date (optional)" />
          <button type="submit" className="lc-go" disabled={!!busy || !name.trim()}><Plus size={13} /> Add</button></div>
        {ideas.length > 0 && <div className="lc-ideas"><small>For {state.profile.goal || "you"}:</small>{ideas.slice(0, 4).map((i) => <button key={i.code} type="button" disabled={!!busy} onClick={() => void add({ ...i, status: "planned" })} title={i.name}><Plus size={11} />{i.code}</button>)}</div>}
      </form>
    </div>
  </div>;
}

// ── Jobs ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const STAGES: Array<[Job["stage"], string]> = [["saved", "Saved"], ["applied", "Applied"], ["interviewing", "Interviewing"], ["offer", "Offer"]];
export function JobsView({ state, onChange }: { state: CareerState; onChange: () => void }) {
  const runs = useRunStatus(), navigate = useNavigate();
  const jobs = state.jobs ?? [];
  const [open, setOpen] = useState<string | null>(null), [showClosed, setShowClosed] = useState(false), [dragging, setDragging] = useState<string | null>(null), [over, setOver] = useState<string | null>(null);
  const [company, setCompany] = useState(""), [role, setRole] = useState(""), [url, setUrl] = useState(""), [busy, setBusy] = useState(""), [error, setError] = useState("");
  // Paste a job link and Shua reads it: company and role fill in, and the posting comes along for the fit check.
  const [posting, setPosting] = useState<{ url: string; description: string; location: string } | null>(null), [reading, setReading] = useState(false), [readNote, setReadNote] = useState("");
  const readLink = async (link: string) => {
    const u = link.trim(); if (!/^https?:\/\//i.test(u) || posting?.url === u || reading) return;
    setReading(true); setReadNote("");
    try {
      const p = await api<{ url: string; company: string; role: string; location: string; description: string }>("/api/learning/jobs/read", { body: { url: u } });
      setCompany((c) => c || p.company); setRole((r) => r || p.role); setPosting({ url: u, description: p.description, location: p.location });
      setReadNote(`Shua read the posting${p.role ? `: ${p.role}` : ""}. Add it, then check your fit.`);
    } catch (e) { setPosting(null); setReadNote(errText(e)); } finally { setReading(false); }
  };
  const [research, setResearch] = useState<string | null>(() => { try { return localStorage.getItem("shuacrew.learn.research"); } catch { return null; } });
  const act = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setError(""); try { await fn(); onChange(); } catch (e) { setError(errText(e)); } finally { setBusy(""); } };
  const patch = (id: string, body: Record<string, unknown>) => act(`j:${id}`, () => api(`/api/learning/jobs/${id}`, { body }));
  const searching = !!research && active(runs[research]?.status);
  const researchStatus = research ? runs[research]?.status : undefined;
  useEffect(() => { if (researchStatus === "done") onChange(); }, [researchStatus, onChange]);
  const selected = jobs.find((j) => j.id === open);
  const columns = showClosed ? [...STAGES, ["closed", "Closed"] as [Job["stage"], string]] : STAGES;
  const followUps = jobs.filter((j) => j.stage !== "closed" && j.nextAt && daysTo(j.nextAt) <= 2).length;
  return <div className="lc">
    <section className="lc-head"><div><h2>{jobs.filter((j) => j.stage !== "closed").length ? `${jobs.filter((j) => j.stage === "applied" || j.stage === "interviewing").length} in play · ${jobs.filter((j) => j.stage === "saved").length} saved${followUps ? ` · ${followUps} follow-up${followUps === 1 ? "" : "s"} due` : ""}` : "Your pipeline, start to offer"}</h2>
      <p className="lc-sub">Drag a card to move it. Shua checks your fit against the posting and turns its gaps into your next skills.</p></div>
      <button type="button" className="lc-go" disabled={!!busy || searching || !state.profile.goal} title={state.profile.goal ? `Shua searches the web for ${state.profile.goal} openings` : "Set a goal first"}
        onClick={() => void act("research", async () => { const r = await api<{ run: string }>("/api/learning/jobs/research", { body: {} }); setResearch(r.run); try { localStorage.setItem("shuacrew.learn.research", r.run); } catch { /* ignore */ } })}>
        {searching ? <><Loader2 size={13} className="lc-spin" /> Shua is searching…</> : <><Search size={13} /> Find openings</>}</button>
    </section>
    {error && <p className="lx-error" role="alert">{error}</p>}
    <form className="lc-addrow" onSubmit={(e) => { e.preventDefault(); if (company.trim()) void act("add", async () => {
      const read = posting && posting.url === url.trim() ? { description: posting.description, location: posting.location } : {};
      await api("/api/learning/jobs", { body: { company: company.trim(), role: role.trim(), url: url.trim(), ...read } }); setCompany(""); setRole(""); setUrl(""); setPosting(null); setReadNote(""); }); }}>
      <Briefcase size={14} /><input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" aria-label="Company" /><input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" aria-label="Role" />
      <input value={url} onChange={(e) => setUrl(e.target.value)} onPaste={(e) => { const t = e.clipboardData.getData("text"); setTimeout(() => void readLink(t), 0); }} onBlur={() => void readLink(url)}
        placeholder="Paste a job link: Shua reads it" aria-label="Posting link" />
      <button type="submit" className="lc-go" disabled={!!busy || reading || !company.trim()}>{reading ? <><Loader2 size={13} className="lc-spin" /> Reading…</> : <><Plus size={13} /> Add</>}</button>
    </form>
    {readNote && <p className="lc-hint" role="status">{readNote}</p>}
    <div className={`lc-board${selected ? " has-detail" : ""}`}>
      <div className="lc-cols" style={{ "--cols": columns.length } as React.CSSProperties}>{columns.map(([stage, label]) => {
        const list = jobs.filter((j) => j.stage === stage).sort((a, b) => (a.nextAt ?? Infinity) - (b.nextAt ?? Infinity) || b.updated - a.updated);
        return <section key={stage} className={`lc-col${over === stage ? " is-over" : ""}`} aria-label={label}
          onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(stage); } }} onDragLeave={() => setOver((o) => (o === stage ? null : o))}
          onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/job") || dragging; setDragging(null); const j = jobs.find((x) => x.id === id); if (j && j.stage !== stage) void patch(j.id, { stage }); }}>
          <header><span>{label}</span><b>{list.length}</b></header>
          {list.map((j) => { const due = j.nextAt ? daysTo(j.nextAt) : null;
            return <button key={j.id} type="button" draggable className={`lc-job${open === j.id ? " is-open" : ""}${dragging === j.id ? " is-drag" : ""}`}
              onDragStart={(e) => { e.dataTransfer.setData("text/job", j.id); e.dataTransfer.effectAllowed = "move"; setDragging(j.id); }} onDragEnd={() => { setDragging(null); setOver(null); }}
              onClick={() => setOpen(open === j.id ? null : j.id)}>
              <strong>{j.company}</strong>{j.role && <span>{j.role}</span>}
              <div className="lc-job-meta">
                {j.fit?.score !== undefined && <em className={j.fit.score >= 70 ? "is-good" : j.fit.score >= 45 ? "is-mid" : "is-low"}>{j.fit.score}% fit</em>}
                {j.source === "shua" && <em className="is-shua"><Sparkles size={10} /> found</em>}
                {j.next && <small className={due !== null && due < 0 ? "is-late" : due !== null && due <= 2 ? "is-soon" : ""}>{j.next}{j.nextAt ? ` · ${when(j.nextAt)}` : ""}</small>}
              </div>
            </button>; })}
          {!list.length && <p className="lc-col-empty">{stage === "saved" ? "Add one above, or let Shua find openings." : "Drop a card here"}</p>}
        </section>;
      })}</div>
      {selected && <JobDetail key={selected.id} job={selected} busy={busy} running={active(runs[selected.fit?.run ?? ""]?.status)} onClose={() => setOpen(null)} patch={(b) => patch(selected.id, b)}
        fit={() => act(`fit:${selected.id}`, () => api(`/api/learning/jobs/${selected.id}/fit`, { body: {} }))}
        prep={() => act(`prep:${selected.id}`, async () => { const r = await api<{ run: string }>("/api/learning/interview", { body: { role: `${selected.role || state.profile.goal} at ${selected.company}`, focus: "system design" } }); void navigate({ to: "/sessions/$id", params: { id: r.run } }); })}
        openRun={(id) => void navigate({ to: "/sessions/$id", params: { id } })}
        remove={() => { if (window.confirm(`Remove ${selected.company}?`)) void act(`x:${selected.id}`, async () => { await api(`/api/learning/jobs/${selected.id}`, { method: "DELETE" }); setOpen(null); }); }} />}
    </div>
    <button type="button" className="lc-closed" onClick={() => setShowClosed((v) => !v)}>{showClosed ? "Hide closed" : `Show closed (${jobs.filter((j) => j.stage === "closed").length})`}</button>
  </div>;
}

function JobDetail({ job, busy, running, onClose, patch, fit, prep, openRun, remove }: {
  job: Job; busy: string; running: boolean; onClose: () => void; patch: (b: Record<string, unknown>) => void; fit: () => void; prep: () => void; openRun: (id: string) => void; remove: () => void;
}) {
  const [next, setNext] = useState(job.next), [nextAt, setNextAt] = useState(isoDay(job.nextAt)), [notes, setNotes] = useState(job.notes), [desc, setDesc] = useState(job.description);
  const [readNote, setReadNote] = useState(""), [reading, setReading] = useState(false);
  return <motion.aside className="lc-detail" aria-label={`${job.company} details`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 480, damping: 38 }}>
    <header><div><strong>{job.company}</strong><span>{[job.role, job.location, job.salary].filter(Boolean).join(" · ") || "Add the role in the posting below"}</span></div>
      <button type="button" className="lc-icon" aria-label="Close" onClick={onClose}><X size={14} /></button></header>
    <div className="lc-seg" role="radiogroup" aria-label="Stage">{[...STAGES, ["closed", "Closed"] as [Job["stage"], string]].map(([s, label]) => <button key={s} type="button" role="radio" aria-checked={job.stage === s} className={job.stage === s ? "is-on" : ""} disabled={!!busy} onClick={() => patch({ stage: s })}>{label}</button>)}</div>
    {job.url && <a className="lc-link" href={job.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open the posting</a>}
    <label className="lc-field"><span>Next step</span><div><input value={next} onChange={(e) => setNext(e.target.value)} onBlur={() => next !== job.next && patch({ next })} placeholder="e.g. Follow up with the recruiter" />
      <input type="date" value={nextAt} onChange={(e) => { setNextAt(e.target.value); patch({ nextAt: e.target.value }); }} aria-label="When" /></div></label>
    <section className="lc-fit">
      <header><span className="lt-kicker">Your fit</span>{job.fit?.score !== undefined && <b>{job.fit.score}%</b>}</header>
      {job.fit?.summary ? <><p>{job.fit.summary}</p>{job.fit.gaps.length > 0 && <div className="lc-chips is-gaps">{job.fit.gaps.map((g) => <span key={g}>{g}</span>)}</div>}</>
        : <p className="lc-hint">{running ? <><Loader2 size={13} className="lc-spin" /> Shua is reading the posting against your skills…</> : desc.trim().length < 80 ? "Paste the job description below, then Shua checks how you fit and what to learn first." : "Shua can read the posting against your skills and roadmap."}</p>}
      <div className="lc-actions">
        <button type="button" className="lc-go" disabled={!!busy || running || desc.trim().length < 80} onClick={fit}>{running ? "Reading…" : job.fit?.summary ? <>Check again <RotateCcw size={12} /></> : <>Check my fit <Sparkles size={13} /></>}</button>
        <button type="button" disabled={!!busy} onClick={prep}>Interview prep</button>
        {job.fit?.run && <button type="button" className="lc-quiet" onClick={() => openRun(job.fit!.run)}>Full read <ExternalLink size={12} /></button>}
      </div>
    </section>
    <label className="lc-field"><span>Job description</span><textarea rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== job.description && patch({ description: desc })} placeholder="Paste the posting here" /></label>
    {job.url && !desc.trim() && <button type="button" className="lc-quiet" disabled={!!busy || reading} onClick={async () => {
      setReading(true); setReadNote("");
      try { const p = await api<{ description: string; role: string; location: string }>("/api/learning/jobs/read", { body: { url: job.url } }); setDesc(p.description); await patch({ description: p.description, ...(job.role ? {} : { role: p.role }), ...(job.location ? {} : { location: p.location }) }); }
      catch (e) { setReadNote(errText(e)); } finally { setReading(false); }
    }}>{reading ? <><Loader2 size={12} className="lc-spin" /> Reading the posting…</> : <><Sparkles size={12} /> Read the posting from its link</>}</button>}
    {readNote && <p className="lc-hint" role="status">{readNote}</p>}
    <label className="lc-field"><span>Notes</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== job.notes && patch({ notes })} placeholder="Who you talked to, what they said, salary range…" /></label>
    <button type="button" className="lc-remove" disabled={!!busy} onClick={remove}><Trash2 size={12} /> Remove</button>
  </motion.aside>;
}

// ── Ask Shua ─────────────────────────────────────────────────────────────────────────────────────────────────────
const STARTERS = (goal: string) => [
  goal ? `What should I focus on this week to become ${article(goalRole(goal))} ${goalRole(goal)}?` : "I want to change careers. Help me pick a goal and plan it.",
  "Add the AWS Solutions Architect Associate exam for December",
  "I applied to a job today. Track it and remind me to follow up",
  "Which certification should I do first, and why?",
];
/** Hide Shua's machine-readable blocks; count the changes it made. */
function shown(text: string) {
  let changes = 0;
  const out = text.replace(/```learn[\s\S]*?```/gi, (m) => { try { const v = JSON.parse(m.replace(/```learn|```/gi, "")) as unknown; changes += Array.isArray(v) ? v.length : 0; } catch { /* ignore */ } return ""; })
    .replace(/```cards[\s\S]*?```/gi, "").trim();
  return { text: out, changes };
}
export function LearnAsk({ state, onChange }: { state: CareerState; onChange: () => void }) {
  const run = state.coach?.organize?.run;
  const loadRun = useLive((s) => s.loadRun), events = useLive((s) => (run ? s.runEvents[run] : undefined)), status = useLive((s) => (run ? s.crew.runs[run]?.status : undefined));
  const [draft, setDraft] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [open, setOpen] = useState(false);
  const thread = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), reduce = useReducedMotion();
  useEffect(() => { if (run) void loadRun(run); }, [run, loadRun]);
  const working = active(status);
  // A finished turn may have changed certs, jobs or the roadmap: reload what Learn shows.
  const was = useRef(status); useEffect(() => { if (was.current && active(was.current) && status === "done") onChange(); was.current = status; }, [status, onChange]);
  const messages = useMemo(() => {
    const out: Array<{ who: "you" | "shua"; text: string; changes: number; live?: boolean }> = [];
    let streaming = "";
    for (const e of (events ?? []) as AnyEvent[]) {
      if (e.kind === "run.created") { const said = (e.body.ask.split("--- THEY SAY ---\n")[1] ?? "").trim(); if (said) out.push({ who: "you", text: said, changes: 0 }); }
      else if (e.kind === "run.followup") { out.push({ who: "you", text: (e.body as { text: string }).text.split("\n\n[coach] ")[0]!, changes: 0 }); streaming = ""; }
      else if (e.kind === "agent.delta") streaming += e.body.text;
      else if (e.kind === "agent.message") { const s = shown(e.body.text); out.push({ who: "shua", text: s.text, changes: s.changes }); streaming = ""; }
    }
    if (streaming) out.push({ who: "shua", text: shown(streaming).text, changes: 0, live: true });
    return out.slice(-12);
  }, [events]);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: reduce ? "auto" : "smooth" }); }, [messages.length, messages.at(-1)?.text.length, open, reduce]);
  const send = async (text = draft, fresh = false) => {
    if (!text.trim() && !fresh) return;
    setBusy(true); setError(""); setOpen(true);
    try { await api("/api/learning/coach", { body: { mode: "organize", message: text.trim() || undefined, fresh } }); setDraft(""); onChange(); }
    catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  return <section className={`lc-ask${open ? " is-open" : ""}`} aria-label="Ask Shua">
    {open && <motion.div className="lc-ask-thread" ref={thread} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 520, damping: 40 }}>
      <header><span><Sparkles size={13} /> Shua · learning & career</span>
        <div>{run && <button type="button" className="lc-icon" title="New conversation" aria-label="New conversation" disabled={busy} onClick={() => void send("", true)}><RotateCcw size={13} /></button>}
          <button type="button" className="lc-icon" aria-label="Hide conversation" onClick={() => setOpen(false)}><X size={13} /></button></div></header>
      {!messages.length && !working && <div className="lc-starters">{STARTERS(state.profile.goal).map((s) => <button key={s} type="button" disabled={busy} onClick={() => void send(s)}>{s}<ArrowRight size={12} /></button>)}</div>}
      {messages.map((m, i) => <div key={i} className={`lc-msg is-${m.who}`}>{m.who === "shua" ? <><Markdown text={m.text} streaming={m.live} />{m.changes > 0 && <span className="lc-applied"><BadgeCheck size={12} /> Updated your Learn space · {m.changes} change{m.changes === 1 ? "" : "s"}</span>}</> : m.text}</div>)}
      {working && messages.at(-1)?.who === "you" && <p className="lc-typing"><span /><span /><span /> Organizing…</p>}
    </motion.div>}
    {error && <p className="lx-error" role="alert">{error}</p>}
    <form className="lc-ask-bar" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <Sparkles size={15} className="lc-ask-mark" />
      <textarea ref={input} rows={1} value={draft} onFocus={() => setOpen(true)} onChange={(e) => setDraft(e.target.value)} placeholder="Tell Shua anything — “booked the CKA for March 3”, “applied to Grafana”, “what's next?”"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } if (e.key === "Escape") { setOpen(false); input.current?.blur(); } }} aria-label="Ask Shua" />
      <button type="submit" className="lc-ask-send" disabled={busy || !draft.trim()} aria-label="Send"><ArrowUp size={15} /></button>
    </form>
  </section>;
}

/** Today's career line: the nearest exam and the follow-ups that are due. */
export function careerSteps(state: CareerState, now = Date.now()): Array<{ id: string; kind: "cert" | "job"; title: string; why: string }> {
  const out: Array<{ id: string; kind: "cert" | "job"; title: string; why: string }> = [];
  const exam = (state.certs ?? []).filter((c) => c.status !== "passed" && c.examDate && c.examDate >= now - DAY).sort((a, b) => a.examDate! - b.examDate!)[0];
  if (exam && daysTo(exam.examDate!, now) <= 45) {
    const left = exam.steps.filter((s) => !s.done).length;
    out.push({ id: `cert:${exam.id}`, kind: "cert", title: `${exam.code || exam.name} exam ${when(exam.examDate!, now)}`, why: exam.steps.length ? `${left} study step${left === 1 ? "" : "s"} left in your plan.` : "No study plan yet: Shua can build one around the date." });
  }
  for (const j of (state.jobs ?? []).filter((x) => x.stage !== "closed" && x.nextAt && daysTo(x.nextAt, now) <= 1).sort((a, b) => a.nextAt! - b.nextAt!).slice(0, 2))
    out.push({ id: `job:${j.id}`, kind: "job", title: `${j.next || "Next step"} · ${j.company}`, why: `${j.role || "Your application"} · due ${when(j.nextAt!, now)}.` });
  return out;
}
