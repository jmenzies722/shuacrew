import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Check, GraduationCap, Hammer } from "lucide-react";
import { api } from "../lib/api";

type Milestone = { title: string; why: string; project: string; skills: string[]; weeks: number; done: boolean };
type Roadmap = { id: string; goal: string; title: string; milestones: Milestone[] };

/**
 * Practice projects from your learning roadmap. They live in Learn, never in Projects: building one is a learning
 * session (the crew builds it with you and explains as it goes), not a venture. Done marks the milestone.
 */
export function LearningProjects() {
  const navigate = useNavigate();
  const [roads, setRoads] = useState<Roadmap[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState("");
  const load = () => api<{ roadmaps: Roadmap[] }>("/api/learning").then((s) => setRoads(s.roadmaps)).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const road = roads.at(-1);
  const open = road?.milestones.map((m, n) => ({ m, n })).filter(({ m }) => m.project && !m.done) ?? [];
  const build = async (m: Milestone) => {
    setBusy(m.title); setError("");
    const ask = [`Build this with me as a learning project: ${m.title}.`, m.project, `Why it matters: ${m.why}`, `Skills to practise: ${m.skills.join(", ")}.`,
      "Teach as we go: before each step, say what we're doing and why in a sentence or two, and let me try the key parts myself before you do them.",
      "When we finish a concept worth remembering, end that message with a ```cards block of {front, back}."].join("\n");
    try { const r = await api<{ id: string }>("/api/runs", { body: { ask, title: `Learn by building: ${m.title}`.slice(0, 80), labels: ["learning", "learn-kind:project"] } }); void navigate({ to: "/sessions/$id", params: { id: r.id } }); }
    catch (e) { setError((e as Error).message); setBusy(""); }
  };
  const done = async (n: number) => { if (!road) return; await api(`/api/learning/roadmaps/${road.id}/milestones/${n}`, { body: { done: true } }); await load(); };
  if (!open.length && !error) return null;
  return <section className="learning-projects">
    <header><div><span className="studio-eyebrow"><GraduationCap size={13} /> BUILD WHAT YOU LEARN</span><h2>Practice projects</h2><p>From your roadmap. The crew builds each one with you and explains as it goes.</p></div></header>
    {error ? <p role="alert">Couldn't load your roadmap: {error}</p> : <div className="learning-project-grid">{open.slice(0, 3).map(({ m, n }) => <article key={n}>
      <small>{road!.title || road!.goal}</small><h3>{m.title}</h3><p>{m.project}</p>
      <div>{m.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
      <small>{m.weeks} week{m.weeks === 1 ? "" : "s"} suggested</small>
      <footer className="learning-project-actions">
        <button type="button" disabled={!!busy} onClick={() => void build(m)}><Hammer size={13} />{busy === m.title ? "Starting…" : "Build it with the crew"}<ArrowUpRight size={13} /></button>
        <button type="button" className="is-quiet" onClick={() => void done(n)}><Check size={13} />Done</button>
      </footer>
    </article>)}</div>}
  </section>;
}
