/**
 * Learn, built on what the research says works: one obvious next action, short spaced retrieval sessions, practice
 * over reading, progress you can see on a path, and a forgiving weekly rhythm instead of a fragile streak.
 *
 * Three places, not six: Today (do the next thing, learn anything, see your week and where you stand), Journey (your
 * goal's roadmap, certifications and job search as one story) and Library (courses, cards, the career kit). Explain is
 * the "Learn anything" box, not a tab. Ask Shua sits under all of it: say what happened and Shua keeps it organized.
 * /learn and /teach both land here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Award, BookOpen, Brain, Briefcase, Map as MapIcon, Presentation, RotateCcw, Sparkles, Target } from "lucide-react";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { learningProgress } from "../lib/learning-progress";
import { companionName, useCompanion } from "../lib/companion";
import { weakestSkill, weekRhythm } from "../lib/learn-today";
import { Learning, type Tab as LibraryTab } from "./Learning";
import { Teaching } from "./Teaching";
import { LearningProjects } from "../components/LearningProjects";
import { CertsView, JobsView, LearnAsk, PathView, careerSteps, type Cert, type Job } from "./LearnCareer";
import "./learn.css";
import { ControlHeader, Seg } from "../components/ControlRoom";
import "./learn-today.css";
import "./learn-flow.css";

/** Older links and saved tabs (path, certs, jobs) open the matching part of Journey. */
type Mode = "today" | "journey" | "library" | "explain";
type Legacy = "path" | "certs" | "jobs";
const MODES: ReadonlyArray<readonly [Mode, string]> = [["today", "Today"], ["journey", "Journey"], ["library", "Library"]];
const LAST = "shuacrew.learn.tab";
const asMode = (v: string | null): Mode | null => (v === "path" || v === "certs" || v === "jobs" ? "journey" : MODES.some(([m]) => m === v) ? (v as Mode) : null);
interface Track { id: string; name: string; level: number; cards: number; due: number; reviews: number; accuracy: number | null; lapses: number; stale: boolean }
interface Insights {
  tracks: Track[]; weakest: { id: string; name: string } | null; hardest: Array<{ front: string; lapses: number; track: string }>; stale: string[];
  week: { reviews: number; accuracy: number | null; change: number }; due: number;
  roadmap: { title: string; done: number; total: number; next: string | null } | null;
}
interface Course { id: string; title: string; topic: string; lessons: Array<{ title: string; done: boolean }> }
interface Milestone { title: string; why: string; skills: string[]; project: string; weeks: number; done?: boolean }
interface Roadmap { id: string; goal: string; months: number; title: string; run: string; created: number; milestones: Milestone[] }
interface State { profile: { goal: string }; courses: Course[]; roadmaps?: Roadmap[]; certs?: Cert[]; jobs?: Job[]; coach?: Record<string, { run: string }>; days?: Array<{ day: string; reviews: number }> }
interface Step { id: string; icon: typeof Brain; title: string; why: string; cta: string; run: () => Promise<void> | void }

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);
const minutes = (cards: number) => Math.max(1, Math.round(cards * 0.4));

export function Learn({ initial = "today" }: { initial?: Mode | Legacy }) {
  const name = companionName(useCompanion());
  const runs = useLive((s) => s.crew.runs);
  // Where you were last time (Explain only when you came for it: /teach).
  const [mode, setModeState] = useState<Mode>(() => {
    if (initial === "explain") return "explain";
    if (initial !== "today") return asMode(initial) ?? "today";
    try { return asMode(localStorage.getItem(LAST)) ?? "today"; } catch { return "today"; }
  });
  const setMode = (m: Mode) => { setModeState(m); if (m !== "explain") try { localStorage.setItem(LAST, m); } catch { /* ignore */ } };
  const [section, setSection] = useState<Legacy | null>(initial === "path" || initial === "certs" || initial === "jobs" ? initial : null);
  const [question, setQuestion] = useState(""), [asking, setAsking] = useState("");
  const [libraryTab, setLibraryTab] = useState<LibraryTab | undefined>();
  const [insights, setInsights] = useState<Insights | null>(null), [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
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
  const reload = useCallback(() => { void load(); }, [load]);
  const open = (tab: LibraryTab) => { setLibraryTab(tab); setMode("library"); };
  const goJourney = (part: Legacy) => { setSection(part); setMode("journey"); };
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setError(""); try { await fn(); } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(""); } };
  const explain = (q: string) => { if (!q.trim()) return; setAsking(q.trim()); setQuestion(""); setMode("explain"); };

  // Journey opened on a part (an old Certs or Jobs link, or a Today step): bring that part into view.
  const journey = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode !== "journey" || !section) return;
    const t = setTimeout(() => journey.current?.querySelector(`#learn-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => clearTimeout(t);
  }, [mode, section, state]);

  // The plan: one next action and at most two after it, in the order that moves you most, each grounded in a number.
  const weak = insights ? weakestSkill(insights.tracks) : null;
  const plan: Step[] = [];
  if (insights && state) {
    if (insights.due > 0) plan.push({ id: "review", icon: RotateCcw, title: `Review ${insights.due} card${insights.due === 1 ? "" : "s"}`, why: `About ${minutes(insights.due)} min, right before you'd forget them. Recalling beats rereading.`, cta: "Start review", run: () => open("review") });
    for (const step of careerSteps(state)) plan.push({ id: step.id, icon: step.kind === "cert" ? Award : Briefcase, title: step.title, why: step.why, cta: step.kind === "cert" ? "Open certs" : "Open jobs", run: () => goJourney(step.kind === "cert" ? "certs" : "jobs") });
    if (weak) plan.push({
      id: "drill", icon: Target, title: `Strengthen ${weak.name}`,
      why: `${pct(weak.accuracy)} right over ${weak.reviews} answers${weak.lapses ? `, ${weak.lapses} slip${weak.lapses === 1 ? "" : "s"}` : ""}. ${name} quizzes you on what you miss and turns each gap into a card.`,
      cta: "Quiz me", run: () => run("drill", async () => {
        const hard = insights.hardest.filter((h) => h.track === weak.id).map((h) => `"${h.front}"`).join(", ");
        await api("/api/learning/coach", { body: { mode: "quiz", fresh: true, message: `Focus only on ${weak.name}.${hard ? ` Start with what I keep missing: ${hard}.` : ""}` } });
        open("coach");
      }),
    });
    const progress = learningProgress(state.courses), course = progress.course, lesson = course?.lessons[progress.lessonIndex];
    if (course && lesson) plan.push({
      id: "lesson", icon: BookOpen, title: lesson.title, why: `${course.title || course.topic} · lesson ${progress.lessonIndex + 1} of ${course.lessons.length}. Then practice it until it sticks.`, cta: "Continue lesson",
      run: () => run("lesson", async () => {
        const r = await api<{ run: string }>(`/api/learning/courses/${course.id}/lessons/${progress.lessonIndex}`, { body: {} });
        try { localStorage.setItem("shuacrew.activeLesson", JSON.stringify({ course: course.id, index: progress.lessonIndex, run: r.run })); } catch { /* ignore */ }
        window.dispatchEvent(new Event("shuacrew:lesson"));
        open("learn");
      }),
    });
    if (!plan.length) plan.push(
      state.profile.goal.trim()
        ? { id: "quiz", icon: Target, title: "Find where you really stand", why: "A short quiz on your goal's core skills. Your answers become the cards that keep it fresh.", cta: "Quiz me", run: () => run("quiz", async () => { await api("/api/learning/coach", { body: { mode: "quiz", fresh: true, message: `Quiz me on the core skills for becoming a ${state.profile.goal.trim()}, one question at a time.` } }); open("coach"); }) }
        : { id: "goal", icon: Target, title: "Tell me what you're working toward", why: "Your goal shapes the roadmap, the quizzes and the next step here.", cta: "Set my goal", run: () => open("profile") },
    );
  }
  const scored = insights?.tracks.filter((t) => t.reviews > 0).sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1)) ?? [];
  const goal = state?.profile.goal.trim() ?? "";
  const rhythm = state?.days ? weekRhythm(state.days) : null;
  const statLine = insights ? [insights.due ? `${insights.due} due now` : "All caught up", insights.week.reviews ? `${insights.week.reviews} reviewed this week` : null, insights.week.accuracy !== null ? `${pct(insights.week.accuracy)} right` : null].filter(Boolean).join(" · ") : "";
  // Your path: the newest roadmap for the goal you have now that has milestones; one still being written shows as such.
  const roadmaps = [...(state?.roadmaps ?? [])].filter((r) => r.goal.trim().toLowerCase() === goal.toLowerCase()).sort((a, b) => b.created - a.created);
  const path = roadmaps.find((r) => r.milestones.length > 0);
  const building = !path && roadmaps[0] && runs[roadmaps[0].run] && ["queued", "planning", "running"].includes(runs[roadmaps[0].run]!.status);
  const current = path ? path.milestones.findIndex((m) => !m.done) : -1;
  // What the crew finished lately, ready to become cards from your own real work.
  const worked = Object.values(runs).filter((r) => (r.status === "done" || r.status === "merged") && !r.labels?.some((l) => l === "buddy" || l === "learning") && Date.now() - r.updatedAt < 36 * 3600_000)
    .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  const [first, ...then] = plan;
  const title = mode === "today" ? (goal ? `Becoming a ${goal}` : "Learn") : mode === "journey" ? (goal ? `Your journey to ${goal}` : "Your journey") : mode === "library" ? "Library" : "What do you want to understand?";

  return <div className="pane-scroll learn lf"><div className="pane-body pane-body-wide">
    <ControlHeader title={title} status={!insights ? "Reading where you stand…" : statLine} tone={!insights ? "idle" : insights.due ? "live" : "ok"}>
      <Seg label="Learn" value={mode === "explain" ? "today" : mode} onChange={(id) => { setMode(id); setSection(null); if (id === "library") setLibraryTab(undefined); }} options={MODES} />
    </ControlHeader>
    {error && <p className="lx-error" role="alert">{error}</p>}

    {mode === "today" && <div className="lt">
      {first && <section className="lt-next" aria-label="Next up">
        <span className="lt-kicker">Next up</span>
        <div className="lt-next-row">
          <i><first.icon size={20} /></i>
          <div><h2>{first.title}</h2><p>{first.why}</p></div>
          <button type="button" className="lt-go" disabled={!!busy} onClick={() => void first.run()}>{busy === first.id ? "Starting…" : first.cta}<ArrowRight size={15} /></button>
        </div>
        {then.length > 0 && <div className="lt-then"><span>Then</span>{then.slice(0, 2).map((step) => <button key={step.id} type="button" disabled={!!busy} onClick={() => void step.run()}><step.icon size={13} />{busy === step.id ? "Starting…" : step.title}</button>)}</div>}
      </section>}

      <form className="lf-anything" onSubmit={(e) => { e.preventDefault(); explain(question); }} aria-label="Learn anything">
        <Presentation size={17} aria-hidden />
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Learn anything: “how does a Kubernetes Service route traffic?”" aria-label="What do you want to understand?" />
        <button type="submit" disabled={!question.trim()}>Explain it<ArrowRight size={14} /></button>
      </form>

      <div className="lf-grid">
        <section className="lf-week" aria-label="Your week">
          <span className="lt-kicker">Your week</span>
          {rhythm && <>
            <ol className="lf-days">{rhythm.days.map((d) => <li key={d.day} className={`${d.reviews ? "is-on" : ""}${d.today ? " is-today" : ""}`} title={`${d.day}: ${d.reviews} review${d.reviews === 1 ? "" : "s"}`}>
              <i style={{ ["--fill" as string]: `${Math.min(1, d.reviews / 12)}` }} /><small>{d.label}</small></li>)}</ol>
            <p><b>{rhythm.practised} of 7 days</b>{rhythm.reviews ? ` · ${rhythm.reviews} answers` : ""}. {rhythm.practised >= 4 ? "That's the rhythm that makes it stick." : "Any 4 days a week keeps it fresh: short and often beats long and rare."}</p>
          </>}
        </section>

        <section className="lf-stand" aria-label="Where you stand">
          <span className="lt-kicker">Where you stand</span>
          {scored.length ? <ul className="learn-skills">{scored.slice(0, 5).map((t) => <li key={t.id}>
            <span><b>{t.name}</b>{t.stale && <em>stale</em>}</span>
            <i className="learn-bar"><i style={{ width: `${Math.round((t.accuracy ?? 0) * 100)}%` }} data-tone={(t.accuracy ?? 0) < 0.6 ? "low" : (t.accuracy ?? 0) < 0.8 ? "mid" : "high"} /></i>
            <small>{pct(t.accuracy)}</small>
          </li>)}</ul> : <p className="learn-muted">One review or quiz and this fills in with real numbers.</p>}
          {insights && insights.hardest.length > 0 && <div className="learn-hardest"><h3>You keep missing</h3>{insights.hardest.slice(0, 3).map((h) => <p key={h.front}>{h.front}<small>{h.lapses}×</small></p>)}</div>}
          <button type="button" className="learn-ask" disabled={!!busy} onClick={() => void run("analyze", async () => { await api("/api/learning/coach", { body: { mode: "analyze", fresh: true } }); open("coach"); })}>
            <Sparkles size={13} />{busy === "analyze" ? "Thinking…" : `Ask ${name} what to focus on`}</button>
        </section>
      </div>

      <div className="lf-grid">
        <section className="lt-path lf-path" aria-label="Your path">
          <span className="lt-kicker">Your path</span>
          {path ? <>
            <ol className="lt-track">{path.milestones.map((m, i) => <li key={i} className={m.done ? "is-done" : i === current ? "is-now" : ""} title={m.title}><i />{i === current && <span>{m.title.replace(/^\d+\.\s*/, "")}</span>}</li>)}</ol>
            <p className="lf-path-line">{path.milestones.filter((m) => m.done).length} of {path.milestones.length} milestones{current >= 0 ? ` · now: ${path.milestones[current]!.title.replace(/^\d+\.\s*/, "")}` : " · all done"}</p>
          </> : <p className="learn-muted">{building ? `${name} is writing your roadmap now.` : goal ? `No roadmap yet for ${goal}: milestones, the skills each builds, and a project that proves it.` : "Set a goal and your roadmap, certifications and job search come together in Journey."}</p>}
          <button type="button" className="lf-link" onClick={() => goJourney("path")}><MapIcon size={13} />Open your journey<ArrowRight size={13} /></button>
        </section>

        <section className="lt-work" aria-label="Learn from your work">
          <span className="lt-kicker">Learn from your work</span>
          {worked.length ? worked.map((r) => <button key={r.id} type="button" disabled={!!busy} onClick={() => void run(`study:${r.id}`, async () => { await api("/api/learning/study", { body: { run: r.id } }); open("coach"); })}>
            <span><strong>{r.title}</strong><small>{busy === `study:${r.id}` ? "Writing cards…" : "Turn it into 3–6 cards"}</small></span><ArrowRight size={14} /></button>)
            : <p className="learn-muted">When your crew finishes something, it shows up here, ready to become cards from your own real work.</p>}
        </section>
      </div>
    </div>}

    {mode === "journey" && state && <div className="lf-journey" ref={journey}>
      <nav className="lf-journey-nav" aria-label="Journey">
        {([["path", "Roadmap"], ["certs", "Certifications"], ["jobs", "Job search"]] as const).map(([id, label]) => <button key={id} type="button" className={section === id ? "is-on" : ""} onClick={() => { setSection(id); journey.current?.querySelector(`#learn-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{label}</button>)}
      </nav>
      <section id="learn-path" className="lf-part"><PathView state={state} onChange={() => void load()} startCourse={(topic) => void run("course", async () => { await api("/api/learning/courses", { body: { topic } }); open("learn"); })} /></section>
      <section id="learn-certs" className="lf-part"><CertsView state={state} tracks={insights?.tracks ?? []} onChange={() => void load()} review={() => open("review")}
        quiz={(topic) => void run("quiz", async () => { await api("/api/learning/coach", { body: { mode: "quiz", fresh: true, message: `Quiz me for the ${topic} exam: its highest-weight topics first, one question at a time.` } }); open("coach"); })} /></section>
      <section id="learn-jobs" className="lf-part"><JobsView state={state} onChange={() => void load()} /></section>
    </div>}

    {mode === "explain" && <div className="lf-explain">
      <button type="button" className="lf-back" onClick={() => setMode("today")}><ArrowLeft size={14} />Today</button>
      <Teaching bare initialQuestion={asking} autoAsk={!!asking} key={asking || "teach"} />
    </div>}
    {mode === "library" && <><LearningProjects /><Learning embedded initialTab={libraryTab} /></>}
    {mode !== "explain" && state && <LearnAsk state={state} onChange={reload} />}
  </div></div>;
}

/** /teach: the same place, opened on Explain. */
export function Teach() { return <Learn initial="explain" />; }
