/**
 * Learn: one place to get better and get there. Today is the next thing to do, built from what you actually got right
 * and wrong, your exams and your job follow-ups. Path is your roadmap; Certs and Jobs are your career; Library holds
 * courses, cards and the career kit; Explain is the visual teacher. Ask Shua sits under all of it: say what happened
 * and Shua keeps everything organized. /learn and /teach both land here.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Award, BookOpen, Brain, Briefcase, Flame, GraduationCap, Library, Presentation, RotateCcw, Sparkles, Target, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { learningProgress } from "../lib/learning-progress";
import { companionName, useCompanion } from "../lib/companion";
import { Learning, type Tab as LibraryTab } from "./Learning";
import { Teaching } from "./Teaching";
import { LearningProjects } from "../components/LearningProjects";
import { CertsView, JobsView, LearnAsk, PathView, careerSteps, type Cert, type Job } from "./LearnCareer";
import "./learn.css";
import { ControlHeader, Readouts, Seg } from "../components/ControlRoom";
import "./learn-today.css";

type Mode = "today" | "path" | "certs" | "jobs" | "library" | "explain";
const MODES: ReadonlyArray<readonly [Mode, string]> = [["today", "Today"], ["path", "Path"], ["certs", "Certs"], ["jobs", "Jobs"], ["library", "Library"], ["explain", "Explain"]];
const LAST = "shuacrew.learn.tab";
interface Track { id: string; name: string; level: number; cards: number; due: number; reviews: number; accuracy: number | null; lapses: number; stale: boolean }
interface Insights {
  tracks: Track[]; weakest: { id: string; name: string } | null; hardest: Array<{ front: string; lapses: number; track: string }>; stale: string[];
  week: { reviews: number; accuracy: number | null; change: number }; due: number;
  roadmap: { title: string; done: number; total: number; next: string | null } | null;
}
interface Course { id: string; title: string; topic: string; lessons: Array<{ title: string; done: boolean }> }
interface Milestone { title: string; why: string; skills: string[]; project: string; weeks: number; done?: boolean }
interface Roadmap { id: string; goal: string; months: number; title: string; run: string; created: number; milestones: Milestone[] }
interface State { profile: { goal: string }; courses: Course[]; roadmaps?: Roadmap[]; certs?: Cert[]; jobs?: Job[]; coach?: Record<string, { run: string }> }
interface Step { id: string; icon: typeof Brain; title: string; why: string; cta: string; run: () => Promise<void> | void }

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

export function Learn({ initial = "today" }: { initial?: Mode }) {
  const name = companionName(useCompanion());
  const runs = useLive((s) => s.crew.runs);
  // Where you were last time (Explain only when you came for it: /teach).
  const [mode, setModeState] = useState<Mode>(() => { if (initial !== "today") return initial; try { const v = localStorage.getItem(LAST) as Mode | null; return v && MODES.some(([m]) => m === v) && v !== "explain" ? v : "today"; } catch { return "today"; } });
  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem(LAST, m); } catch { /* ignore */ } };
  const [libraryTab, setLibraryTab] = useState<LibraryTab | undefined>();
  const [insights, setInsights] = useState<Insights | null>(null), [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const [i, s] = await Promise.all([api<Insights>("/api/learning/insights"), api<State>("/api/learning")]); setInsights(i); setState(s); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const reload = useCallback(() => { void load(); }, [load]);
  const open = (tab: LibraryTab) => { setLibraryTab(tab); setMode("library"); };
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setError(""); try { await fn(); } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(""); } };

  // The plan: at most three steps, in the order that moves you most. Each is grounded in a number you can check.
  const plan: Step[] = [];
  if (insights && state) {
    if (insights.due > 0) plan.push({ id: "review", icon: RotateCcw, title: `Review ${insights.due} card${insights.due === 1 ? "" : "s"}`, why: `About ${Math.max(1, Math.round(insights.due * 0.4))} min. Spaced right before you'd forget them.`, cta: "Start review", run: () => open("review") });
    // Your career next: an exam coming up, a follow-up that's due.
    for (const step of careerSteps(state)) plan.push({ id: step.id, icon: step.kind === "cert" ? Award : Briefcase, title: step.title, why: step.why, cta: step.kind === "cert" ? "Open certs" : "Open jobs", run: () => setMode(step.kind === "cert" ? "certs" : "jobs") });
    const weak = insights.weakest && insights.tracks.find((t) => t.id === insights.weakest!.id);
    if (weak) plan.push({
      id: "drill", icon: Target, title: `Close the gap in ${weak.name}`,
      why: weak.accuracy === null ? "No graded answers yet: a short quiz finds where you really are." : `${pct(weak.accuracy)} correct over ${weak.reviews} answers${weak.lapses ? `, ${weak.lapses} slips` : ""}. ${name} quizzes your misses first and turns each gap into a card.`,
      cta: "Quiz me", run: () => run("drill", async () => {
        const hard = insights.hardest.filter((h) => h.track === weak.id).map((h) => `"${h.front}"`).join(", ");
        await api("/api/learning/coach", { body: { mode: "quiz", fresh: true, message: `Focus only on ${weak.name}.${hard ? ` Start with what I keep missing: ${hard}.` : ""}` } });
        open("coach");
      }),
    });
    const progress = learningProgress(state.courses), course = progress.course, lesson = course?.lessons[progress.lessonIndex];
    if (course && lesson) plan.push({
      id: "lesson", icon: BookOpen, title: lesson.title, why: `${course.title || course.topic} · lesson ${progress.lessonIndex + 1} of ${course.lessons.length}`, cta: "Continue lesson",
      run: () => run("lesson", async () => {
        const r = await api<{ run: string }>(`/api/learning/courses/${course.id}/lessons/${progress.lessonIndex}`, { body: {} });
        try { localStorage.setItem("shuacrew.activeLesson", JSON.stringify({ course: course.id, index: progress.lessonIndex, run: r.run })); } catch { /* ignore */ }
        window.dispatchEvent(new Event("shuacrew:lesson"));
        open("learn");
      }),
    });
    if (!plan.length) plan.push(
      { id: "explain", icon: Presentation, title: "Learn something new, visually", why: "Ask anything; you get diagrams to explore, then practice until it sticks.", cta: "Explain", run: () => setMode("explain") },
      { id: "goal", icon: Target, title: state.profile.goal ? "Pick a skill to sharpen" : "Tell me what you're working toward", why: "Your goal shapes courses, roadmap and quizzes.", cta: "Set it", run: () => open("profile") },
    );
  }
  const scored = insights?.tracks.filter((t) => t.reviews > 0).sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1)) ?? [];
  const goal = state?.profile.goal.trim() ?? "";
  // "Weakest" only means something with two or more scored tracks and a real gap.
  const weakGap = scored.length >= 2 && (scored[0]!.accuracy ?? 1) < 0.8 ? scored[0]! : null;
  const headline = !insights ? "" : weakGap ? `Close the gap in ${weakGap.name}` : goal ? `Becoming a ${goal}` : insights.due ? `${insights.due} card${insights.due === 1 ? " is" : "s are"} ready` : "Let's find where you really are";
  const statLine = insights ? [insights.due ? `${insights.due} due` : "All caught up", insights.week.reviews ? `${insights.week.reviews} reviewed this week` : null, insights.week.accuracy !== null ? `${pct(insights.week.accuracy)} right` : null].filter(Boolean).join(" · ") : "";
  // Your path: the newest roadmap for the goal you have now that has milestones; one still being written shows as such.
  const roadmaps = [...(state?.roadmaps ?? [])].filter((r) => r.goal.trim().toLowerCase() === goal.toLowerCase()).sort((a, b) => b.created - a.created);
  const path = roadmaps.find((r) => r.milestones.length > 0);
  const building = !path && roadmaps[0] && runs[roadmaps[0].run] && ["queued", "planning", "running"].includes(runs[roadmaps[0].run]!.status);
  const current = path ? path.milestones.findIndex((m) => !m.done) : -1;
  // What the crew finished today, ready to become cards.
  const worked = Object.values(runs).filter((r) => (r.status === "done" || r.status === "merged") && !r.labels?.some((l) => l === "buddy" || l === "learning") && Date.now() - r.updatedAt < 36 * 3600_000)
    .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  const [first, ...then] = plan;

  return <div className="pane-scroll learn"><div className="pane-body pane-body-wide">
    <ControlHeader title={mode === "today" ? headline || "Learn" : mode === "explain" ? "What do you want to understand?" : mode === "path" ? "Your path" : mode === "certs" ? "Certifications" : mode === "jobs" ? "Your job search" : "Your library"} kicker={<><GraduationCap size={13} /> Learn with {name}</>}
      status={!insights ? "Reading where you stand…" : statLine} tone={!insights ? "idle" : insights.due ? "live" : "ok"}>
      <Seg label="Learn" value={mode} onChange={(id) => { setMode(id); if (id === "library") setLibraryTab(undefined); }} options={MODES} />
    </ControlHeader>
    {error && <p className="lx-error" role="alert">{error}</p>}
    {mode === "today" && <div className="lt">
      {insights && <Readouts className="lt-readouts" items={[
        { label: "Due now", value: insights.due, tone: insights.due ? "live" : undefined, dim: !insights.due, sub: insights.due ? `about ${Math.max(1, Math.round(insights.due * 0.4))} min` : "all caught up" },
        { label: "Reviewed this week", value: insights.week.reviews, dim: !insights.week.reviews, sub: insights.week.change ? `${insights.week.change > 0 ? "+" : ""}${insights.week.change} on last week` : "answers you graded" },
        { label: "Right this week", value: pct(insights.week.accuracy), dim: insights.week.accuracy === null, tone: insights.week.accuracy === null ? undefined : insights.week.accuracy >= 0.8 ? "ok" : insights.week.accuracy < 0.6 ? "wait" : undefined, sub: "of graded answers" },
        { label: "Skills tracked", value: insights.tracks.length, dim: !insights.tracks.length, sub: insights.stale.length ? `${insights.stale.length} going stale` : "from your own work" },
      ]} />}
      {first && <section className="lt-next" aria-label="Next up">
        <span className="lt-kicker">Next up</span>
        <div className="lt-next-row">
          <i><first.icon size={20} /></i>
          <div><h2>{first.title}</h2><p>{first.why}</p></div>
          <button type="button" className="lt-go" disabled={!!busy} onClick={() => void first.run()}>{busy === first.id ? "Starting…" : first.cta}<ArrowRight size={15} /></button>
        </div>
        {then.length > 0 && <div className="lt-then"><span>Then</span>{then.map((step) => <button key={step.id} type="button" disabled={!!busy} onClick={() => void step.run()}><step.icon size={13} />{busy === step.id ? "Starting…" : step.title}</button>)}</div>}
      </section>}

      <section className="lt-path" aria-label="Your path">
        <header><div><span className="lt-kicker">Your path</span><h2>{path ? (path.title || `${path.months} months to ${goal}`) : goal ? `A plan to become a ${goal}` : "Where are you headed?"}</h2></div>
          {path && <small>{path.milestones.filter((m) => m.done).length} of {path.milestones.length} milestones</small>}</header>
        {path ? <>
          <ol className="lt-track">{path.milestones.map((m, i) => <li key={i} className={m.done ? "is-done" : i === current ? "is-now" : ""} title={m.title}><i />{i === current && <span>{m.title.replace(/^\d+\.\s*/, "")}</span>}</li>)}</ol>
          {current >= 0 && <div className="lt-milestone">
            <div><strong>{path.milestones[current]!.title.replace(/^\d+\.\s*/, "")}</strong><p>{path.milestones[current]!.why}</p>
              {path.milestones[current]!.project && <p className="lt-project"><b>Prove it:</b> {path.milestones[current]!.project}</p>}
              <div className="lt-skills">{path.milestones[current]!.skills.slice(0, 6).map((k) => <span key={k}>{k}</span>)}</div></div>
            <div className="lt-milestone-actions">
              <button type="button" disabled={!!busy} onClick={() => void run("course", async () => { await api("/api/learning/courses", { body: { topic: path.milestones[current]!.title.replace(/^\d+\.\s*/, "") } }); open("learn"); })}>{busy === "course" ? "Starting…" : "Start a course on it"}</button>
              <button type="button" className="is-quiet" onClick={() => void run("done", async () => { await api(`/api/learning/roadmaps/${path.id}/milestones/${current}`, { body: { done: true } }); await load(); })}>Mark done</button>
            </div>
          </div>}
        </> : <div className="lt-empty">
          <p>{building ? `${name} is writing your roadmap now: milestones, the skills each builds, and a project that proves it.` : goal ? `A realistic plan with milestones, the skills each builds, and one project per step that proves it.` : "Tell me what you're working toward and I'll plan the way there."}</p>
          {building ? <button type="button" disabled>Building your roadmap…</button>
            : goal ? <button type="button" className="lt-go" disabled={!!busy} onClick={() => void run("roadmap", async () => { await api("/api/learning/roadmaps", { body: { goal, months: 6 } }); await load(); })}>{busy === "roadmap" ? "Starting…" : "Build my roadmap"}<ArrowRight size={15} /></button>
            : <button type="button" className="lt-go" onClick={() => open("profile")}>Set my goal<ArrowRight size={15} /></button>}
        </div>}
      </section>

      <div className="lt-cols">
        <section className="lt-work" aria-label="Learn from your work">
          <span className="lt-kicker">Learn from your work</span>
          {worked.length ? worked.map((r) => <button key={r.id} type="button" disabled={!!busy} onClick={() => void run(`study:${r.id}`, async () => { await api("/api/learning/study", { body: { run: r.id } }); open("coach"); })}>
            <span><strong>{r.title}</strong><small>{busy === `study:${r.id}` ? "Writing cards…" : "Turn it into 3–6 cards"}</small></span><ArrowRight size={14} /></button>)
            : <p className="learn-muted">When your crew finishes something, it shows up here, ready to become cards from your own real work.</p>}
        </section>
        <aside className="lt-stand" aria-label="Where you stand">
          <span className="lt-kicker">Where you stand</span>
          {scored.length ? <ul className="learn-skills">{scored.slice(0, 5).map((t) => <li key={t.id}>
            <span><b>{t.name}</b>{t.stale && <em>stale</em>}</span>
            <i className="learn-bar"><i style={{ width: `${Math.round((t.accuracy ?? 0) * 100)}%` }} data-tone={(t.accuracy ?? 0) < 0.6 ? "low" : (t.accuracy ?? 0) < 0.8 ? "mid" : "high"} /></i>
            <small>{pct(t.accuracy)}</small>
          </li>)}</ul> : <p className="learn-muted">One review or quiz and this fills in with real numbers.</p>}
          {insights && insights.hardest.length > 0 && <div className="learn-hardest"><h3>You keep missing</h3>{insights.hardest.slice(0, 3).map((h) => <p key={h.front}>{h.front}<small>{h.lapses}×</small></p>)}</div>}
          <button type="button" className="learn-ask" disabled={!!busy} onClick={() => void run("analyze", async () => { await api("/api/learning/coach", { body: { mode: "analyze", fresh: true } }); open("coach"); })}>
            <Sparkles size={13} />{busy === "analyze" ? "Thinking…" : `Ask ${name} what to focus on`}</button>
        </aside>
      </div>
    </div>}
    {mode === "path" && state && <PathView state={state} onChange={() => void load()} startCourse={(topic) => void run("course", async () => { await api("/api/learning/courses", { body: { topic } }); open("learn"); })} />}
    {mode === "certs" && state && <CertsView state={state} tracks={insights?.tracks ?? []} onChange={() => void load()} review={() => open("review")}
      quiz={(topic) => void run("quiz", async () => { await api("/api/learning/coach", { body: { mode: "quiz", fresh: true, message: `Quiz me for the ${topic} exam: its highest-weight topics first, one question at a time.` } }); open("coach"); })} />}
    {mode === "jobs" && state && <JobsView state={state} onChange={() => void load()} />}
    {mode === "explain" && <Teaching bare />}
    {mode === "library" && <><LearningProjects /><Learning embedded initialTab={libraryTab} /></>}
    {mode !== "explain" && state && <LearnAsk state={state} onChange={reload} />}
  </div></div>;
}

/** /teach: the same place, opened on Explain. */
export function Teach() { return <Learn initial="explain" />; }
