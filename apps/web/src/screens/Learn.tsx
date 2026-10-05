/**
 * Learn: one place to get better. Today is a plan Shua builds from what you actually got right and wrong (graded
 * reviews, lapses, stale skills), not from your profile. Explain is the visual teacher. Library holds courses,
 * roadmap, cards, career kit and your goal. /learn and /teach both land here.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BookOpen, Brain, Flame, GraduationCap, Library, Presentation, RotateCcw, Sparkles, Target, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import { learningProgress } from "../lib/learning-progress";
import { companionName, useCompanion } from "../lib/companion";
import { Learning, type Tab as LibraryTab } from "./Learning";
import { Teaching } from "./Teaching";
import { LearningProjects } from "../components/LearningProjects";
import "./learn.css";

type Mode = "today" | "explain" | "library";
interface Track { id: string; name: string; level: number; cards: number; due: number; reviews: number; accuracy: number | null; lapses: number; stale: boolean }
interface Insights {
  tracks: Track[]; weakest: { id: string; name: string } | null; hardest: Array<{ front: string; lapses: number; track: string }>; stale: string[];
  week: { reviews: number; accuracy: number | null; change: number }; due: number;
  roadmap: { title: string; done: number; total: number; next: string | null } | null;
}
interface Course { id: string; title: string; topic: string; lessons: Array<{ title: string; done: boolean }> }
interface State { profile: { goal: string }; courses: Course[] }
interface Step { id: string; icon: typeof Brain; title: string; why: string; cta: string; run: () => Promise<void> | void }

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

export function Learn({ initial = "today" }: { initial?: Mode }) {
  const name = companionName(useCompanion());
  const [mode, setMode] = useState<Mode>(initial);
  const [libraryTab, setLibraryTab] = useState<LibraryTab | undefined>();
  const [insights, setInsights] = useState<Insights | null>(null), [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const [i, s] = await Promise.all([api<Insights>("/api/learning/insights"), api<State>("/api/learning")]); setInsights(i); setState(s); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const open = (tab: LibraryTab) => { setLibraryTab(tab); setMode("library"); };
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setError(""); try { await fn(); } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(""); } };

  // The plan: at most three steps, in the order that moves you most. Each is grounded in a number you can check.
  const plan: Step[] = [];
  if (insights && state) {
    if (insights.due > 0) plan.push({ id: "review", icon: RotateCcw, title: `Review ${insights.due} card${insights.due === 1 ? "" : "s"}`, why: `About ${Math.max(1, Math.round(insights.due * 0.4))} min. Spaced right before you'd forget them.`, cta: "Start review", run: () => open("review") });
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
  const headline = !insights ? "" : insights.weakest && scored.length ? `Your weakest area is ${insights.weakest.name}. Let's close it.`
    : insights.due ? `${insights.due} card${insights.due === 1 ? " is" : "s are"} ready: right on time.` : "Let's find where you really are.";

  return <div className="pane-scroll learn"><div className="pane-body pane-body-wide">
    <header className="learn-head">
      <div><span className="learn-kicker"><GraduationCap size={13} /> Learn with {name}</span><h1>{mode === "today" ? headline || "Learn" : mode === "explain" ? "What do you want to understand?" : "Your library"}</h1></div>
      <nav className="learn-modes" role="tablist" aria-label="Learn">
        {([["today", "Today", Flame], ["explain", "Explain", Presentation], ["library", "Library", Library]] as const).map(([id, label, Icon]) =>
          <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? "is-on" : ""} onClick={() => { setMode(id); if (id === "library") setLibraryTab(undefined); }}><Icon size={14} />{label}</button>)}
      </nav>
    </header>
    {error && <p className="lx-error" role="alert">{error}</p>}
    {mode === "today" && <div className="learn-today">
      <section className="learn-plan" aria-label="Today's plan">
        {plan.map((step, i) => <article key={step.id} className={`learn-step${i === 0 ? " is-first" : ""}`}>
          <i className="learn-step-ico"><step.icon size={17} /></i>
          <div><strong>{step.title}</strong><p>{step.why}</p></div>
          <button type="button" disabled={!!busy} onClick={() => void step.run()}>{busy === step.id ? "Starting…" : step.cta}<ArrowRight size={14} /></button>
        </article>)}
        {!insights && <p className="learn-muted">Reading your progress…</p>}
      </section>
      <aside className="learn-stand" aria-label="Where you stand">
        <header><h2>Where you stand</h2>{insights && insights.week.reviews > 0 && <span className={insights.week.change >= 0 ? "is-up" : "is-down"}>{insights.week.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{insights.week.reviews} this week · {pct(insights.week.accuracy)}</span>}</header>
        {scored.length ? <ul className="learn-skills">{scored.slice(0, 6).map((t) => <li key={t.id}>
          <span><b>{t.name}</b>{t.stale && <em>stale</em>}</span>
          <i className="learn-bar"><i style={{ width: `${Math.round((t.accuracy ?? 0) * 100)}%` }} data-tone={(t.accuracy ?? 0) < 0.6 ? "low" : (t.accuracy ?? 0) < 0.8 ? "mid" : "high"} /></i>
          <small>{pct(t.accuracy)}</small>
        </li>)}</ul> : <p className="learn-muted">No graded answers yet. One review or quiz and this fills in with real numbers.</p>}
        {insights && insights.hardest.length > 0 && <div className="learn-hardest"><h3>You keep missing</h3>{insights.hardest.slice(0, 3).map((h) => <p key={h.front}>{h.front}<small>{h.lapses}×</small></p>)}</div>}
        <button type="button" className="learn-ask" disabled={!!busy} onClick={() => void run("analyze", async () => { await api("/api/learning/coach", { body: { mode: "analyze", fresh: true } }); open("coach"); })}>
          <Sparkles size={13} />{busy === "analyze" ? "Thinking…" : `Ask ${name} what to focus on`}</button>
      </aside>
    </div>}
    {mode === "today" && <LearningProjects />}
    {mode === "explain" && <Teaching bare />}
    {mode === "library" && <Learning embedded initialTab={libraryTab} />}
  </div></div>;
}

/** /teach: the same place, opened on Explain. */
export function Teach() { return <Learn initial="explain" />; }
