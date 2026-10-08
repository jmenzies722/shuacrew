/**
 * Learn: a system for leveling up, built around what you're going for. Four places, each with one job:
 * - Plan: will you pass your certification, and what to do today — predicted score against the pass mark, today's
 *   session in timed blocks, the exam's blueprint with your mastery, the gates to sitting it once. Your career path
 *   (your goal's roadmap) sits under it.
 * - Practice: exam-style questions — a diagnostic, smart sets, domain drills, your misses, full mock exams — and your
 *   flashcards.
 * - Learn: the exam taught task by task, and anything else in a structured way (courses, a tutor, lessons from your
 *   own work, projects).
 * - Career: your goal and skills, the roadmap, certifications, the job search and the career kit.
 * Ask Shua sits under all of it. /learn and /teach land here; older links (today, journey, library, certs, jobs) find
 * their place.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Award, Plus } from "lucide-react";
import { api } from "../lib/api";
import { article, goalRole } from "../lib/learn-today";
import { Learning } from "./Learning";
import { Teaching } from "./Teaching";
import { CertsView, JobsView, LearnAsk, PathView, type Cert, type Job } from "./LearnCareer";
import { ExamPlan, ExamPractice, ExamSession, ExamTasks, MockExam, lessonAsk, useExam, type PracticeMode, type Start } from "./LearnExam";
import "./learn.css";
import "./learn-today.css";
import "./learn-flow.css";
import "./learn-v2.css";

type Mode = "plan" | "practice" | "learn" | "career" | "explain";
type Part = "goal" | "path" | "certs" | "jobs" | "kit";
type LearnPart = "tasks" | "learn" | "coach" | "projects";
const MODES: ReadonlyArray<readonly [Mode, string]> = [["plan", "Plan"], ["practice", "Practice"], ["learn", "Learn"], ["career", "Career"]];
const CAREER: ReadonlyArray<readonly [Part, string]> = [["path", "Roadmap"], ["certs", "Certifications"], ["jobs", "Job search"], ["goal", "Goal & skills"], ["kit", "Career kit"]];
const LAST = "shuacrew.learn.tab", CERT = "shuacrew.learn.cert", PART = "shuacrew.learn.career";
/** Older tabs and links: today → Plan, library → Learn, journey and its parts → Career. */
const asMode = (v: string | null): Mode | null => v === "today" ? "plan" : v === "library" ? "learn" : v === "journey" || v === "path" || v === "certs" || v === "jobs" || v === "goal" ? "career" : MODES.some(([m]) => m === v) ? (v as Mode) : null;
interface Insights { tracks: Array<{ id: string; name: string; level: number; cards: number; due: number; reviews: number; accuracy: number | null; lapses: number; stale: boolean }>; due: number }
interface Milestone { title: string; done?: boolean }
interface Roadmap { id: string; goal: string; title: string; created: number; milestones: Milestone[] }
interface State { profile: { goal: string }; courses: unknown[]; roadmaps?: Roadmap[]; certs?: Cert[]; jobs?: Job[] }

export function Learn({ initial = "plan" }: { initial?: Mode | Part | "today" | "journey" | "library" }) {
  const [mode, setModeState] = useState<Mode>(() => {
    if (initial === "explain") return "explain";
    if (initial !== "plan") return asMode(initial) ?? "plan";
    try { return asMode(localStorage.getItem(LAST)) ?? "plan"; } catch { return "plan"; }
  });
  const setMode = (m: Mode) => { setModeState(m); if (m !== "explain") try { localStorage.setItem(LAST, m); } catch { /* ignore */ } };
  const [part, setPartState] = useState<Part | null>(initial === "path" || initial === "certs" || initial === "jobs" || initial === "goal" ? initial : null);
  const setPart = (p: Part | null) => { setPartState(p); if (p) try { localStorage.setItem(PART, p); } catch { /* ignore */ } };
  const careerPart: Part = part ?? (() => { try { const v = localStorage.getItem(PART); return CAREER.some(([id]) => id === v) ? (v as Part) : "path"; } catch { return "path"; } })();
  const [learnPart, setLearnPart] = useState<LearnPart>("tasks");
  const [asking, setAsking] = useState(""), [from, setFrom] = useState<Mode>("plan");
  const [insights, setInsights] = useState<Insights | null>(null), [state, setState] = useState<State | null>(null), [error, setError] = useState("");
  const [session, setSession] = useState<null | { kind: "practice"; mode: PracticeMode; domain?: string; n?: number; key: number } | { kind: "mock"; key: number } | { kind: "review"; key: number }>(null);

  const load = useCallback(async () => {
    try { const [i, s] = await Promise.all([api<Insights>("/api/learning/insights"), api<State>("/api/learning")]); setInsights(i); setState(s); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Learn as it is now: after a deleted session takes its cards with it, and whenever Shua changes Learn (from the
  // notch or ⌘J), announced in this window or, from another, through storage.
  useEffect(() => {
    const on = () => void load();
    const stored = (e: StorageEvent) => { if (e.key === "shuacrew.learning.changed") void load(); };
    window.addEventListener("shuacrew:deleted", on); window.addEventListener("shuacrew:learning", on); window.addEventListener("storage", stored);
    return () => { window.removeEventListener("shuacrew:deleted", on); window.removeEventListener("shuacrew:learning", on); window.removeEventListener("storage", stored); };
  }, [load]);

  // The certification you're going for: the one you picked, else the soonest exam you haven't passed.
  const certs = (state?.certs ?? []).filter((c) => c.status !== "passed").sort((a, b) => (a.examDate ?? Infinity) - (b.examDate ?? Infinity));
  const [certId, setCertId] = useState<string | undefined>(() => { try { return localStorage.getItem(CERT) ?? undefined; } catch { return undefined; } });
  const active = certs.find((c) => c.id === certId) ?? certs[0];
  const pickCert = (id: string) => { setCertId(id); try { localStorage.setItem(CERT, id); } catch { /* ignore */ } };
  const exam = useExam(active?.id);
  const view = exam.view, bp = view?.blueprint ?? null;

  // Your weakest exam domains, worth a course of their own.
  const weakSpots = bp && view?.mastery?.answered ? [...bp.domains].filter((d) => (view.mastery!.domains[d.id]?.answered ?? 0) > 0 && (view.mastery!.domains[d.id]?.accuracy ?? 1) < 0.7)
    .sort((a, b) => (view.mastery!.domains[a.id]!.accuracy) - (view.mastery!.domains[b.id]!.accuracy)).slice(0, 2)
    .map((d) => ({ topic: `${d.name} on AWS (${bp.code})`, why: `Your weakest ${bp.code} area · ${Math.round(view.mastery!.domains[d.id]!.accuracy * 100)}%` })) : [];
  const teach = (question: string) => { setFrom(mode === "explain" ? from : mode); setAsking(question); setMode("explain"); };
  const start = (s: Start) => {
    if (s.kind === "learn") {
      const d = bp?.domains.find((x) => x.id === s.domain), t = d?.tasks.find((x) => x.id === s.task);
      if (bp && d && t) return teach(lessonAsk(bp, d, t));
      setLearnPart("tasks"); return setMode("learn");
    }
    setSession({ ...s, key: Date.now() } as typeof session); setMode("practice");
  };

  const goal = state?.profile.goal.trim() ?? "", role = goalRole(goal);
  const examLine = bp && view?.plan ? [view.plan.daysLeft !== null && view.plan.daysLeft >= 0 ? `${view.plan.daysLeft} days to ${bp.code}` : bp.code,
    view.mastery?.answered && view.predicted ? `${view.predicted.score} → ${bp.passing}` : null].filter(Boolean).join(" · ") : null;

  return <div className="pane-scroll learn lf lv"><div className="pane-body pane-body-wide">
    <header className="lv-top">
      <h1 className="lv-sr">Learn</h1>
      <nav className="lv-tabs" role="tablist" aria-label="Learn">{MODES.map(([id, label]) => {
        const on = (mode === "explain" ? from : mode) === id;
        return <button key={id} type="button" role="tab" aria-selected={on} className={on ? "is-on" : ""} onClick={() => { setMode(id); setSession(null); }}>{label}</button>;
      })}</nav>
      <div className="lv-status">
        {examLine && <span className={`lv-pill${view?.verdict?.level === "ready" ? " is-ready" : ""}`} title="Days to the exam · predicted score → pass mark">{examLine}</span>}
        {insights?.due ? <span className="lv-pill is-quiet">{insights.due} cards due</span> : null}
      </div>
    </header>
    {error && <p className="lx-error" role="alert">{error}</p>}
    {exam.error && <p className="lx-error" role="alert">{exam.error}</p>}

    {certs.length > 1 && (mode === "plan" || mode === "practice") && <div className="lx-certs" role="tablist" aria-label="Certification">
      {certs.map((c) => <button key={c.id} type="button" role="tab" aria-selected={c.id === active?.id} className={c.id === active?.id ? "is-on" : ""} onClick={() => pickCert(c.id)}><Award size={13} /> {c.code || c.name}</button>)}
    </div>}

    {mode === "plan" && (!active ? <AddCert onAdded={() => void load()} /> : view ? <ExamPlan view={view} onStart={start} onResearch={() => void api(`/api/exam/${active.id}/research`, { body: {} }).then(exam.reload)} /> : <section className="lv-card"><p className="lx-muted">Reading where you stand…</p></section>)}

    {mode === "practice" && (!active ? <AddCert onAdded={() => void load()} />
      : session?.kind === "practice" && bp ? <ExamSession key={session.key} certId={active.id} blueprint={bp} start={session} onExit={() => { setSession(null); void exam.reload(); }} onAgain={() => setSession({ ...session, key: Date.now() })} />
      : session?.kind === "mock" && bp ? <MockExam key={session.key} certId={active.id} blueprint={bp} onExit={() => { setSession(null); void exam.reload(); }} />
      : session?.kind === "review" ? <div className="lx-review"><button type="button" className="lf-back" onClick={() => setSession(null)}><ArrowLeft size={14} />Practice</button><Learning embedded only="review" /></div>
      : view ? <ExamPractice view={view} onStart={start} /> : null)}

    {mode === "learn" && <div className="lx-learn">
      <nav className="lf-journey-nav" aria-label="Learn">
        {([["tasks", bp ? `${bp.code}, task by task` : "Your exam"], ["learn", "Learn anything"], ["coach", "Tutor"], ["projects", "Projects"]] as const).map(([id, label]) =>
          <button key={id} type="button" className={learnPart === id ? "is-on" : ""} onClick={() => setLearnPart(id)}>{label}</button>)}
      </nav>
      {learnPart === "tasks" ? (view && bp ? <ExamTasks view={view} onTeach={(t, d) => teach(lessonAsk(bp, d, t))} /> : <AddCert onAdded={() => void load()} />)
        : <Learning key={learnPart} embedded only={learnPart} suggest={weakSpots} onJourney={() => { setPart("path"); setMode("career"); }} />}
    </div>}

    {mode === "career" && state && <div className="lf-journey">
      <nav className="lf-journey-nav" aria-label="Career">
        {CAREER.map(([id, label]) => <button key={id} type="button" className={careerPart === id ? "is-on" : ""} aria-current={careerPart === id ? "page" : undefined} onClick={() => setPart(id)}>{label}</button>)}
      </nav>
      {careerPart === "goal" && <Learning embedded only="profile" />}
      {careerPart === "path" && <PathView state={state as never} onChange={() => void load()} startCourse={(topic) => void api("/api/learning/courses", { body: { topic } }).then(() => { setLearnPart("learn"); setMode("learn"); })} />}
      {careerPart === "certs" && <CertsView state={state as never} tracks={insights?.tracks ?? []} onChange={() => void load()} review={() => start({ kind: "review" })}
        quiz={() => start({ kind: "practice", mode: "quick", n: 10 })}
        exam={active && view?.predicted && bp ? { certId: active.id, predicted: view.predicted.score, passing: bp.passing, answered: view.mastery?.answered ?? 0, open: () => setMode("plan") } : undefined} />}
      {careerPart === "jobs" && <JobsView state={state as never} onChange={() => void load()} />}
      {careerPart === "kit" && <Learning embedded only="career" />}
    </div>}

    {mode === "explain" && <div className="lf-explain">
      <button type="button" className="lf-back" onClick={() => setMode(from)}><ArrowLeft size={14} />Back</button>
      <Teaching bare initialQuestion={asking} autoAsk={!!asking} key={asking || "teach"} />
    </div>}
    {mode === "career" && state && <div className="lv-ask"><LearnAsk state={state as never} onChange={() => void load()} /></div>}
  </div></div>;
}

/** No certification yet: say which one and when, and the plan builds itself. */
function AddCert({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState(""), [date, setDate] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    setBusy(true); setError("");
    const code = /\b[A-Z]{2,5}-?[A-Z]?\d{2,3}\b/i.exec(name)?.[0]?.toUpperCase() ?? "";
    try { await api("/api/learning/certs", { body: { name: name.trim(), code, status: "studying", ...(date ? { examDate: date } : {}) } }); setName(""); setDate(""); onAdded(); }
    catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(false); }
  };
  return <section className="xp-card lx-addcert">
    <span className="xp-kicker">Start here</span>
    <h3>Which certification are you going for?</h3>
    <p className="lx-muted">Shua reads its official exam guide, writes practice questions like the real ones, and plans every day from now to the exam.</p>
    <form onSubmit={(e) => { e.preventDefault(); void add(); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AWS DevOps Engineer Professional (DOP-C02)" aria-label="Certification" />
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Exam date" />
      <button type="submit" className="xp-go" disabled={busy || !name.trim()}><Plus size={14} /> {busy ? "Adding…" : "Plan it"}</button>
    </form>
    {error && <p className="lx-error" role="alert">{error}</p>}
  </section>;
}

/** /teach: the same place, opened on Explain. */
export function Teach() { return <Learn initial="explain" />; }
