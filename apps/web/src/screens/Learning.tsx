import { LessonWorkspace } from "../components/LessonWorkspace";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BookOpenCheck, Brain, Check, Flag, Dumbbell, GraduationCap, Plus, RotateCcw, Sparkles, Target, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { learningProgress } from "../lib/learning-progress";
import { PaneHeader } from "../components/Pane";
import { Coach } from "../components/Coach";
import "../components/setting-controls.css";
import "./settings.css";
import "./learning.css";
import "./learn-anything.css";
import { LearningProjects } from "../components/LearningProjects";

interface Track { id: string; name: string; level: number; focus: boolean }
interface Card { id: string; track: string; front: string; back: string; source: { run?: string; title?: string }; due: number; reps: number; lapses: number; interval: number }
interface Lesson { title: string; summary: string; run?: string; done: boolean }
interface Course { id: string; topic: string; level: number; title: string; plan?: string; created: number; lessons: Lesson[] }
interface Milestone { title: string; why: string; skills: string[]; project: string; weeks: number; done: boolean }
interface Roadmap { id: string; goal: string; months: number; title: string; run: string; created: number; milestones: Milestone[] }
interface Doc { id: string; kind: "resume" | "interview"; title: string; run: string; created: number }
interface State { profile: { goal: string; about: string; tracks: Track[] }; cards: Card[]; due: number; days: Array<{ day: string; reviews: number }>; totalReviews: number; drill: { day: string; track: string; run: string; done: boolean } | null; studied: Array<{ run: string; study: string }>; coach: Partial<Record<"analyze" | "quiz" | "explain" | "plan", { run: string }>>; courses: Course[]; roadmaps: Roadmap[]; docs: Doc[] }
export type Tab = "overview" | "coach" | "today" | "learn" | "roadmap" | "career" | "work" | "review" | "profile" | "projects";
const TABS: Array<[Tab, string]> = [["overview", "My path"], ["learn", "Courses"], ["today", "Practice"], ["review", "Review"]];
/** The Library inside Learn: one row, each thing once. Practice lives with the flashcards it drills; the roadmap and
 * your goal live in Journey. */
const LIBRARY: Array<[Tab, string]> = [["learn", "Courses"], ["review", "Flashcards"], ["coach", "Tutor"], ["career", "Career kit"], ["projects", "Projects"]];
const inLibrary = (t: Tab): Tab => (t === "today" ? "review" : LIBRARY.some(([id]) => id === t) ? t : "learn");
interface Session { id: string; title: string; at: number; studied: boolean }

/** Suggestions only — nothing is added until you pick it. */
const SUGGESTED: Array<[string, string]> = [
  ["agentic-systems", "Agentic systems & orchestration"], ["evals", "LLM evals & reliability"], ["context", "Prompt & context engineering"],
  ["typescript", "TypeScript & Node"], ["swift", "Swift & SwiftUI"], ["system-design", "System design"], ["security", "Security for AI tools"], ["testing", "Testing & debugging"],
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/**
 * `embedded`: the Library inside Learn — no page header or overview (Learn's Today replaces them), one row of tabs.
 * `only`: just one part, no tabs (Journey shows Goal & skills this way).
 */
export function Learning({ embedded = false, initialTab, only, onJourney, suggest }: { embedded?: boolean; initialTab?: Tab; only?: Tab; onJourney?: () => void; suggest?: Array<{ topic: string; why: string }> } = {}) {
  const navigate = useNavigate();
  const place = (t: Tab | undefined): Tab => only ?? (embedded ? inLibrary(t ?? "learn") : t ?? "overview");
  const [tab, setTab] = useState<Tab>(place(initialTab));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (initialTab) setTab(place(initialTab)); }, [initialTab]);
  const [selectedLesson, setSelectedLesson] = useState<{course:string;index:number;run:string}|null>(()=>{try{const v=JSON.parse(localStorage.getItem("shuacrew.activeLesson")??"null");return v&&typeof v.course==="string"&&Number.isInteger(v.index)&&typeof v.run==="string"?v:null;}catch{return null;}});
  useEffect(() => {
    const sync = () => { try { const v=JSON.parse(localStorage.getItem("shuacrew.activeLesson")??"null"); setSelectedLesson(v && typeof v.course === "string" && Number.isInteger(v.index) && typeof v.run === "string" ? v : null); } catch { setSelectedLesson(null); } };
    const storage = (e:StorageEvent) => {if(e.key === "shuacrew.activeLesson") sync();};
    window.addEventListener("storage",storage); window.addEventListener("shuacrew:lesson",sync);
    return () => {window.removeEventListener("storage",storage);window.removeEventListener("shuacrew:lesson",sync);};
  }, []);
  const openLesson = (course: Course,index:number,run:string) => { const value={course:course.id,index,run};setSelectedLesson(value);try{localStorage.setItem("shuacrew.activeLesson",JSON.stringify(value));}catch{} };

  const [s, setS] = useState<State | null>(null), [sessions, setSessions] = useState<Session[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try { const [st, se] = await Promise.all([api<State>("/api/learning"), api<Session[]>("/api/learning/sessions")]); setS(st); setSessions(se); setError(""); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);
  const act = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setError(""); try { await fn(); await load(); } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(""); } };
  const saveProfile = (p: Partial<State["profile"]>) => act("profile", () => api("/api/learning/profile", { body: p }));
  if (!s) return <div className="pane-scroll"><div className="pane-body"><PaneHeader eyebrow="Brain" icon={GraduationCap} title="Learning" /><p className="lx-muted">{error || "Loading…"}</p></div></div>;
  const tracks = s.profile.tracks;
  const name = (id: string) => tracks.find((t) => t.id === id)?.name ?? s.courses.find((c) => c.id === id)?.title ?? s.courses.find((c) => c.id === id)?.topic ?? (id === "interview" ? "Interview prep" : id);
  const setupNeeded = !s.profile.goal || !tracks.length;
  const road = s.roadmaps.at(-1), roadDone = road?.milestones.length ? Math.round((road.milestones.filter((m) => m.done).length / road.milestones.length) * 100) : null;
  const progress = learningProgress(s.courses);
  const course = progress.course, lesson = course?.lessons[progress.lessonIndex];
  const continueLesson = () => {
    if (!course || !lesson) return;
    void act(`l:${course.id}:${progress.lessonIndex}`, async () => {
      const result = await api<{ run: string }>(`/api/learning/courses/${course.id}/lessons/${progress.lessonIndex}`, { body: {} });
      openLesson(course, progress.lessonIndex, result.run);
    });
  };
  const go = (t: Tab) => { setTab(t); try { localStorage.setItem("shuacrew.learnTab", t); } catch { /* ignore */ } };
  const selectedCourse = s.courses.find(c=>c.id===selectedLesson?.course), selected = selectedCourse?.lessons[selectedLesson?.index??-1];
  if(selectedLesson && selectedCourse && selected) return <div className="pane-scroll"><LessonWorkspace key={selectedLesson.run} course={selectedCourse.title||selectedCourse.topic} title={selected.title} summary={selected.summary} run={selectedLesson.run} done={selected.done} onClose={()=>{setSelectedLesson(null);localStorage.removeItem("shuacrew.activeLesson");}} onDone={async()=>{await api(`/api/learning/courses/${selectedCourse.id}/lessons/${selectedLesson.index}/done`,{body:{done:!selected.done}});await load();}}/></div>;
  return <div className={embedded ? "lx is-embedded" : "pane-scroll lx"}><div className={embedded ? "" : "pane-body pane-body-wide"}>
    {!embedded && <header className="lx-studio-header">
      <div><span className="lx-kicker"><GraduationCap size={13} /> Your learning space</span><h1>Learning Studio</h1><p>Pick up a lesson. Put it into practice. Make it yours.</p></div>
      <button type="button" className="lx-goal" onClick={() => go("profile")}><Target size={13} />{s.profile.goal || "Set your learning goal"}</button>
    </header>}
    {!embedded && tab === "overview" && <div className="lx-studio-overview">
      <section className="lx-continue" aria-label="Your next lesson">
        <span className="lx-kicker"><BookOpenCheck size={13} />{lesson ? "Up next" : "A place to begin"}</span>
        {course && lesson ? <>
          <p className="lx-course-context">{course.title || course.topic} <span>· Lesson {progress.lessonIndex + 1} of {course.lessons.length}</span></p>
          <h2>{lesson.title}</h2><p className="lx-continue-description">{lesson.summary}</p>
          <div className="lx-continue-footer"><button type="button" className="lx-studio-primary" disabled={!!busy} onClick={continueLesson}>{busy === `l:${course.id}:${progress.lessonIndex}` ? "Opening lesson…" : "Continue lesson"}<ArrowRight size={15} /></button><button type="button" className="lx-studio-link" onClick={() => go("learn")}>View courses</button></div>
        </> : <>
          <h2>{s.courses.length ? "Ready for your next chapter?" : "What would you like to understand?"}</h2>
          <p className="lx-continue-description">{s.courses.some((item) => !item.lessons.length) ? "Your course is being designed. Open your courses to follow its progress." : "Choose a topic and start a course shaped around what you already know."}</p>
          <button type="button" className="lx-studio-primary" onClick={() => go("learn")}>{s.courses.some((item) => !item.lessons.length) ? "View courses" : "Explore a topic"}<ArrowRight size={15} /></button>
        </>}
      </section>
      <section className="lx-progress-summary" aria-label="Your learning progress">
        <h2>Your progress</h2>
        <div className="lx-progress-total"><strong>{progress.completed}</strong><span>lessons completed{progress.total > 0 && <small>of {progress.total} across your courses</small>}</span></div>
        <progress aria-label="Lessons completed" max={progress.total || 1} value={progress.completed} />
        <button type="button" onClick={() => go("learn")}><span>Courses in progress</span><strong>{progress.active}</strong></button>
        <button type="button" onClick={() => go("review")}><span>Cards ready to review</span><strong>{s.due}</strong></button>
        <button type="button" onClick={() => go("roadmap")}><span>Roadmap completed</span><strong>{roadDone === null ? "Not started" : `${roadDone}%`}</strong></button>
      </section>
    </div>
    }
    {!only && <nav className="lx-tabs" role="tablist" aria-label={embedded ? "Library" : "Learning"}>{(embedded ? LIBRARY : TABS).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => go(id)}>{label}{id === "review" && s.due > 0 && <b>{s.due}</b>}</button>)}</nav>}
    {!embedded && !only && <><div className="lx-secondary">{([['roadmap','Roadmap'],['coach','Tutor'],['work','From my work'],['career','Career kit'],['profile','Goal & skills']] as const).map(([id,label])=><button key={id} className={tab===id?'is-on':''} onClick={()=>go(id)}>{label}</button>)}</div></>}
    {!embedded && tab === "overview" && <section className="lx-panel"><h2>Your path, one step at a time.</h2><p className="lx-muted">Learn a concept, try the exercise, get feedback, then revisit it in Review. Building ideas live separately in Projects.</p><div className="lx-secondary"><button onClick={()=>go("learn")}>Explore courses</button><button onClick={()=>go("today")}>Practice a skill</button><Link to="/ventures">Recommended projects ↗</Link></div></section>}
    {error && <p className="lx-error" role="alert">{error}</p>}
    {tab === "coach" && <Coach runs={s.coach ?? {}} onChange={() => void load()} />}
    {tab === "today" && <div className="lx-top">
      <TodayCard s={s} busy={busy} onDrill={() => act("drill", () => api("/api/learning/drill", { body: {} }))} />
      <ReviewDeck cards={s.cards} trackName={name} onGrade={(id, grade) => act(`r:${id}`, () => api(`/api/learning/cards/${id}/review`, { body: { grade } }))} />
    </div>}
    {tab === "review" && embedded && <div className="lx-top">
      <TodayCard s={s} busy={busy} onDrill={() => act("drill", () => api("/api/learning/drill", { body: {} }))} />
      <ReviewDeck cards={s.cards} trackName={name} onGrade={(id, grade) => act(`r:${id}`, () => api(`/api/learning/cards/${id}/review`, { body: { grade } }))} />
    </div>}
    {tab === "review" && !embedded && <div className="lx-top lx-top-single"><ReviewDeck cards={s.cards} trackName={name} onGrade={(id, grade) => act(`r:${id}`, () => api(`/api/learning/cards/${id}/review`, { body: { grade } }))} /></div>}
    {tab === "review" && <CardLibrary cards={s.cards} tracks={tracks} onAdd={(c) => act("add", () => api("/api/learning/cards", { body: c }))} onRemove={(id) => act(`d:${id}`, () => api(`/api/learning/cards/${id}`, { method: "DELETE" }))} />}
    {tab === "projects" && <LearningProjects onPlan={onJourney ?? (() => void navigate({ to: "/learn" }))} />}
    {tab === "learn" && <LearnAnything courses={s.courses} roadmaps={s.roadmaps} goal={s.profile.goal} suggest={suggest} busy={busy} act={act} onOpen={openLesson} />}
    {tab === "roadmap" && <RoadmapTab roadmaps={s.roadmaps} goal={s.profile.goal} busy={busy} act={act} onSetGoal={() => go("profile")} />}
    {tab === "career" && <CareerKit docs={s.docs} goal={s.profile.goal} busy={busy} act={act} />}
    {tab === "work" && <section className="lx-panel">
      <h2><Brain size={14} /> Learn from your work</h2>
      <p className="lx-muted">Pick a finished session. The crew explains what it did and why at your level, then adds review cards to your deck. One small, efficient model call.</p>
      {setupNeeded && <p className="lx-hint">Set your goal and at least one skill track in Profile first — lessons are pitched to them.</p>}
      <ul className="lx-sessions">{sessions.map((x) => { const lesson = s.studied.find((st) => st.run === x.id); return <li key={x.id}>
        <span className="lx-session-title" title={x.title}>{x.title}</span><time>{new Date(x.at).toLocaleDateString([], { month: "short", day: "numeric" })}</time>
        {lesson ? <Link className="lx-chip is-done" to="/sessions/$id" params={{ id: lesson.study }}><Check size={11} /> Lesson</Link>
          : <button type="button" className="lx-chip" disabled={!!busy || setupNeeded} onClick={() => void act(`s:${x.id}`, () => api("/api/learning/study", { body: { run: x.id } }))}>{busy === `s:${x.id}` ? "Starting…" : "Teach me"}</button>}
      </li>; })}</ul>
      {!sessions.length && <p className="lx-muted">Finished sessions will appear here.</p>}
    </section>}
    {tab === "profile" && <section className="lx-panel">
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
    </section>}
  </div></div>;
}

type Act = (key: string, fn: () => Promise<unknown>) => Promise<void>;
const TOPICS = ["Kubernetes for app developers", "RAG & retrieval evals", "Building MCP servers", "Terraform & infrastructure as code", "Distributed systems fundamentals", "Observability with OpenTelemetry", "Rust for TypeScript devs", "CI/CD with GitHub Actions"];

/** Topics worth a course for where you're headed (suggestions only: nothing starts until you pick one). */
function goalTopics(goal: string): string[] {
  const g = goal.toLowerCase(), ai = /\b(ai|ml|llm|agent|machine learning)/.test(g), ops = /(devops|platform|sre|cloud|infra|reliability)/.test(g);
  return [...(ai ? ["LLM evals & reliability", "RAG & retrieval evals", "Building MCP servers", "Serving models on Kubernetes", "Prompt & context engineering"] : []),
    ...(ops || ai ? ["Kubernetes for app developers", "Terraform & infrastructure as code", "Observability with OpenTelemetry", "CI/CD with GitHub Actions"] : []),
    ...(!ai && !ops ? TOPICS : [])];
}
const LEVELS = ["New", "Basics", "Working", "Strong", "Expert"];
const clean = (t: string) => t.replace(/^\d+\.\s*/, "");

/**
 * Learn anything: pick up where you left off, start a course on what matters for you (each suggestion says why), and
 * your courses as compact cards — the next lesson up front, every lesson one tap away.
 */
function LearnAnything({ courses, roadmaps, goal, suggest = [], busy, act, onOpen }: { courses: Course[]; roadmaps: Roadmap[]; goal: string; suggest?: Array<{ topic: string; why: string }>; busy: string; act: Act; onOpen: (course: Course, index: number, run: string) => void }) {
  const [topic, setTopic] = useState(""), [level, setLevel] = useState(2), [expanded, setExpanded] = useState<string | null>(null);
  const navigate = useNavigate();
  const start = (t: string) => act("course", () => api("/api/learning/courses", { body: { topic: t, level } }).then(() => setTopic("")));
  const open = (c: Course, i: number) => act(`l:${c.id}:${i}`, async () => { const r = await api<{ run: string }>(`/api/learning/courses/${c.id}/lessons/${i}`, { body: {} }); onOpen(c, i, r.run); });
  const mine = courses.slice().sort((x, y) => y.created - x.created);
  const current = mine.find((c) => c.lessons.some((l) => !l.done)), next = current ? current.lessons.findIndex((l) => !l.done) : -1;
  const road = roadmaps.filter((r) => r.milestones.length).sort((x, y) => y.created - x.created)[0], now = road?.milestones.find((m) => !m.done);
  const role = goal.split(/[,.;]| dedicating | with /i)[0]!.replace(/^(become|becoming|be)\s+(an?\s+)?/i, "").trim();
  const have = new Set(courses.map((c) => c.topic.toLowerCase()));
  const ideas = [...suggest, ...(now ? now.skills.slice(0, 2).map((k) => ({ topic: k, why: `Next on your roadmap · ${clean(now.title)}` })) : []),
    ...goalTopics(goal).map((t) => ({ topic: t, why: role ? `For ${role}` : "Popular with engineers" }))]
    .filter((x, i, all) => !have.has(x.topic.toLowerCase()) && all.findIndex((y) => y.topic.toLowerCase() === x.topic.toLowerCase()) === i).slice(0, 4);
  return <div className="la">
    {current && next >= 0 && <section className="la-continue">
      <div>
        <span className="la-kicker">Continue · {current.title || current.topic}</span>
        <h3>Lesson {next + 1} of {current.lessons.length}: {current.lessons[next]!.title}</h3>
        {current.lessons[next]!.summary && <p>{current.lessons[next]!.summary}</p>}
        <div className="la-bar" aria-hidden><i style={{ width: `${(current.lessons.filter((l) => l.done).length / current.lessons.length) * 100}%` }} /></div>
      </div>
      <button type="button" className="lx-go" disabled={!!busy} onClick={() => void open(current, next)}>{busy === `l:${current.id}:${next}` ? "Writing…" : current.lessons[next]!.run ? "Continue" : "Start lesson"} <ArrowRight size={14} /></button>
    </section>}

    <section className="la-new">
      <span className="la-kicker">Learn anything</span>
      <h3>What do you want to get good at?</h3>
      <p className="la-sub">Shua designs a course at your level: 5–8 lessons that build on each other, each with a worked example, a hands-on exercise, a quiz you click and flashcards.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (topic.trim()) void start(topic.trim()); }}>
        <input placeholder="e.g. Kubernetes networking, LLM evals, Go concurrency…" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic" />
        <select value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Your level">{LEVELS.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}</select>
        <button className="lx-go" disabled={!topic.trim() || !!busy}>{busy === "course" ? "Designing…" : "Build my course"}</button>
      </form>
      {ideas.length > 0 && <div className="la-ideas">{ideas.map((i) => <button key={i.topic} type="button" className="la-idea" disabled={!!busy} onClick={() => void start(i.topic)}>
        <b>{i.topic}</b><span>{i.why}</span><Plus size={14} /></button>)}</div>}
    </section>

    {mine.length > 0 && <section className="la-courses">
      <h3 className="la-h">Your courses</h3>
      {mine.map((c) => {
        const done = c.lessons.filter((l) => l.done).length, i = c.lessons.findIndex((l) => !l.done), isOpen = expanded === c.id;
        return <article key={c.id} className="la-course">
          <header>
            <div><strong>{c.title || c.topic}</strong><small>{LEVELS[c.level - 1]} · {c.lessons.length ? (done === c.lessons.length ? "finished" : `${done} of ${c.lessons.length} lessons`) : "Shua is designing it…"}</small></div>
            {c.lessons.length > 0 && i >= 0 && <button type="button" className="lx-chip" disabled={!!busy} onClick={() => void open(c, i)}>{c.lessons[i]!.run ? "Continue" : "Start"} lesson {i + 1}</button>}
            {c.lessons.length > 0 && <button type="button" className="la-toggle" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : c.id)}>{isOpen ? "Hide lessons" : "All lessons"}</button>}
            <button type="button" className="lx-icon" aria-label="Remove course" onClick={() => void act(`x:${c.id}`, () => api(`/api/learning/courses/${c.id}`, { method: "DELETE" }))}><Trash2 size={13} /></button>
          </header>
          {c.lessons.length > 0 && <div className="la-bar" aria-hidden><i style={{ width: `${(done / c.lessons.length) * 100}%` }} /></div>}
          {!c.lessons.length && c.plan && <button type="button" className="la-toggle" onClick={() => void navigate({ to: "/sessions/$id", params: { id: c.plan! } })}>Watch it being designed</button>}
          {isOpen && <ol className="la-lessons">{c.lessons.map((l, k) => <li key={k} className={l.done ? "is-done" : k === i ? "is-next" : ""}>
            <button type="button" className="lx-check" aria-label={l.done ? "Mark not done" : "Mark done"} aria-pressed={l.done} onClick={() => void act(`c:${c.id}:${k}`, () => api(`/api/learning/courses/${c.id}/lessons/${k}/done`, { body: { done: !l.done } }))}>{l.done && <Check size={11} />}</button>
            <div><strong>{k + 1}. {l.title}</strong><small>{l.summary}</small></div>
            <button type="button" className="la-toggle" disabled={!!busy} onClick={() => void open(c, k)}>{busy === `l:${c.id}:${k}` ? "Writing…" : l.done ? "Review" : l.run ? "Open" : "Start"}</button>
          </li>)}</ol>}
        </article>;
      })}
    </section>}
  </div>;
}

function RoadmapTab({ roadmaps, goal, busy, act, onSetGoal }: { roadmaps: Roadmap[]; goal: string; busy: string; act: Act; onSetGoal: () => void }) {
  const [months, setMonths] = useState(6);
  const r = roadmaps.at(-1);
  const total = r?.milestones.reduce((n, m) => n + m.weeks, 0) ?? 0;
  return <>
    <section className="lx-panel lx-ask">
      <h2><Target size={14} /> Your roadmap</h2>
      {goal ? <form onSubmit={(e) => { e.preventDefault(); void act("roadmap", () => api("/api/learning/roadmaps", { body: { goal, months } })); }}>
        <span className="lx-goal-line">Toward <strong>{goal}</strong> in</span>
        <span className="lx-level-pick" role="radiogroup" aria-label="Horizon">{[3, 6, 12, 18].map((m) => <button key={m} type="button" role="radio" aria-checked={months === m} className={months === m ? "is-on" : ""} onClick={() => setMonths(m)}>{m} months</button>)}</span>
        <button className="lx-go" disabled={!!busy}>{busy === "roadmap" ? "Planning…" : r ? "Plan a new roadmap" : "Plan my roadmap"}</button>
      </form> : <p className="lx-hint">Set your career goal first. <button type="button" className="lx-chip" onClick={onSetGoal}>Open profile</button></p>}
    </section>
    {r && <section className="lx-panel">
      <h2>{r.title || `Toward ${r.goal}`} <span className="lx-muted">· {r.months} months{total ? ` · ${total} weeks of milestones` : ""}</span></h2>
      {!r.milestones.length ? <p className="lx-muted">Planning… <Link className="lx-chip" to="/sessions/$id" params={{ id: r.run }}>Watch</Link></p> : <ol className="lx-road">{r.milestones.map((m, i) => <li key={i} className={m.done ? "is-done" : ""}>
        <button type="button" className="lx-node" aria-label={m.done ? "Mark not done" : "Mark done"} aria-pressed={m.done} onClick={() => void act(`m:${i}`, () => api(`/api/learning/roadmaps/${r.id}/milestones/${i}`, { body: { done: !m.done } }))}>{m.done ? <Check size={12} /> : i + 1}</button>
        <div className="lx-road-card"><header><strong>{m.title}</strong><small>{m.weeks} week{m.weeks === 1 ? "" : "s"}</small></header>
          {m.why && <p>{m.why}</p>}
          {m.skills.length > 0 && <div className="lx-tags">{m.skills.map((k) => <span key={k}>{k}</span>)}</div>}
          {m.project && <p className="lx-project"><Dumbbell size={12} /> {m.project}</p>}</div>
      </li>)}</ol>}
      <p className="lx-muted" style={{ marginTop: 10 }}><Link to="/sessions/$id" params={{ id: r.run }}>Read the full plan</Link></p>
    </section>}
  </>;
}

function CareerKit({ docs, goal, busy, act }: { docs: Doc[]; goal: string; busy: string; act: Act }) {
  const [resume, setResume] = useState(""), [role, setRole] = useState(goal), [focus, setFocus] = useState("system design");
  const navigate = useNavigate();
  const run = (key: string, url: string, body: unknown) => act(key, async () => { const r = await api<{ run: string }>(url, { body }); void navigate({ to: "/sessions/$id", params: { id: r.run } }); });
  return <div className="lx-grid">
    <section className="lx-panel">
      <h2><BookOpenCheck size={14} /> Resume review</h2>
      <p className="lx-muted">Paste your resume. A hiring-manager review for your target role: an honest read, top fixes, every bullet rewritten with impact (placeholders where you need real numbers — nothing invented). Private: runs incognito, never saved to agent memory.</p>
      <label className="lx-field"><span>Target role</span><input className="setting-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Senior AI/agentic engineer" /></label>
      <textarea className="lx-resume" rows={9} value={resume} onChange={(e) => setResume(e.target.value)} placeholder="Paste your resume text here…" aria-label="Resume text" />
      <button type="button" className="lx-go" disabled={resume.trim().length < 200 || !!busy} onClick={() => void run("resume", "/api/learning/resume", { resume, role })}>{busy === "resume" ? "Reviewing…" : "Review my resume"}</button>
    </section>
    <section className="lx-panel">
      <h2><Brain size={14} /> Interview prep</h2>
      <p className="lx-muted">Six realistic questions for the round, with what great answers cover and the follow-ups — then review cards for your deck.</p>
      <label className="lx-field"><span>Role</span><input className="setting-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Senior AI/agentic engineer" /></label>
      <span className="lx-level-pick lx-wrap" role="radiogroup" aria-label="Round">{["system design", "coding", "behavioral", "AI/LLM systems", "DevOps & reliability"].map((f) => <button key={f} type="button" role="radio" aria-checked={focus === f} className={focus === f ? "is-on" : ""} onClick={() => setFocus(f)}>{f}</button>)}</span>
      <button type="button" className="lx-go" disabled={!!busy} onClick={() => void run("interview", "/api/learning/interview", { role, focus })}>{busy === "interview" ? "Preparing…" : "Prep me"}</button>
      {docs.length > 0 && <><div className="lx-sub">Your career docs</div><ul className="lx-sessions">{docs.slice().reverse().map((d) => <li key={d.id}><span className="lx-session-title">{d.title}</span><time>{new Date(d.created).toLocaleDateString([], { month: "short", day: "numeric" })}</time><Link className="lx-chip" to="/sessions/$id" params={{ id: d.run }}>Open</Link></li>)}</ul></>}
    </section>
  </div>;
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
