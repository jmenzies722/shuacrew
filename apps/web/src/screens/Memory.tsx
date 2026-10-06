import { Button, Chip, Eyebrow, Panel, StatusGlyph, since } from "@shuacrew/ui";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { BookOpen } from "lucide-react";
import { PaneHeader } from "../components/Pane";
import { StatStrip } from "../components/StatStrip";

interface Lesson {
  id: string;
  text: string;
  scope: "global" | "project";
  project?: string;
  origin: "correction" | "recovery" | "review" | "stated";
  confidence: number;
  learnedAt: number;
  from?: string;
  applied: number;
  wins: number;
  losses: number;
  retired?: string;
}
interface Skill {
  id: string;
  name: string;
  body: string;
  from: string[];
  status: "proposed" | "accepted" | "rejected";
}
interface Evolve {
  retired: Array<{ id: string; reason: string }>;
  proposed: string[];
  eval: { precision: number; recall: number; exact: number };
  at: number;
}

const ORIGIN: Record<Lesson["origin"], string> = { correction: "you corrected a run", review: "a rejected review", recovery: "a recovered failure", stated: "you said so" };
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Everything ShuaCrew has learned, where it came from, and whether it's earning its place. */
export function Memory() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [evolve, setEvolve] = useState<Evolve | null>(null);
  const [text, setText] = useState("");
  const [project, setProject] = useState("");
  const [probe, setProbe] = useState("");
  const [probed, setProbed] = useState<Array<{ id: string; text: string; score: number; shared: string[] }> | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  const refresh = async () => {
    const m = await api<{ lessons: Lesson[]; skills: Skill[]; lastEvolve: Evolve | null }>("/api/memory");
    setLessons(m.lessons);
    setSkills(m.skills);
    if (m.lastEvolve) setEvolve(m.lastEvolve);
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!probe.trim()) return setProbed(null);
    const t = setTimeout(() => void api<typeof probed>(`/api/memory/recall?ask=${encodeURIComponent(probe)}`).then(setProbed), 150);
    return () => clearTimeout(t);
  }, [probe, lessons]);

  const active = lessons.filter((l) => !l.retired);
  const shown = showRetired ? lessons : active;
  const proposed = skills.filter((s) => s.status === "proposed");
  const accepted = skills.filter((s) => s.status === "accepted");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-8 pb-12 pt-8">
        <PaneHeader {...(() => { const active = lessons.filter((l) => !l.retired).length; return active ? { status: `${active} lesson${active === 1 ? "" : "s"} shaping how your crew works`, tone: "ok" as const } : { status: "No lessons yet. They form as finished sessions are reviewed.", tone: "idle" as const }; })()} children={<StatStrip stats={[{ value: lessons.filter((l) => !l.retired).length, label: "lessons in use", tone: "amber" }, { value: lessons.filter((l) => l.retired).length, label: "retired" }, { value: skills.length, label: "skills" }]} />} eyebrow="Brain" icon={BookOpen} title="Memory" description="Lessons with provenance and confidence, skills you approve — all inspectable, all deletable. Confidence moves with the reviews of the runs a lesson was used in."
          actions={<Button onClick={async () => (setEvolve(await api<Evolve>("/api/memory/evolve", { body: {} })), refresh())}>Evolve now</Button>} />

        {evolve && (
          <Panel className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-[12.5px]">
            <span className="text-fg-3">Last evolve {since(evolve.at)}</span>
            <span>
              retired <b>{evolve.retired.length}</b> · proposed <b>{evolve.proposed.length}</b> skill{evolve.proposed.length === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-2" title="The recall eval: fixed lessons and asks with the answers a person would give">
              recall eval
              <Chip mono>precision {pct(evolve.eval.precision)}</Chip>
              <Chip mono>recall {pct(evolve.eval.recall)}</Chip>
            </span>
          </Panel>
        )}

        <div className="mt-6 grid grid-cols-[1fr_340px] gap-5 max-[1000px]:grid-cols-1">
          <div>
            <Panel className="p-4">
              <Eyebrow className="mb-2.5">Teach it something</Eyebrow>
              <div className="flex flex-wrap gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Tests use the injected Clock — never real timers"
                  className="h-9 min-w-[220px] flex-1 rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[13px] outline-none focus:border-amber"
                  aria-label="Lesson"
                />
                <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="all projects" className="mono h-9 w-48 rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[12px] outline-none focus:border-amber" aria-label="Project (optional)" />
                <Button
                  variant="primary"
                  disabled={!text.trim()}
                  onClick={async () => {
                    await api("/api/memory/lessons", { body: { text, project } });
                    setText("");
                    void refresh();
                  }}
                >
                  Learn
                </Button>
              </div>
            </Panel>

            <div className="mb-2.5 mt-6 flex items-center">
              <Eyebrow>
                {active.length} lesson{active.length === 1 ? "" : "s"}
              </Eyebrow>
              {lessons.length > active.length && (
                <button className="ml-auto text-[12px] text-fg-3 hover:text-fg" onClick={() => setShowRetired((v) => !v)}>
                  {showRetired ? "hide" : "show"} {lessons.length - active.length} retired
                </button>
              )}
            </div>
            <Panel className="divide-y divide-line">
              {shown.length === 0 && (
                <div className="px-4 py-6 text-[12.5px] leading-relaxed text-fg-3">
                  Nothing learned yet. Correct a run in a follow-up ("no — always use pnpm here"), reject a review with a note, or teach it directly above.
                </div>
              )}
              {shown.map((l) => (
                <div key={l.id} className={`flex items-start gap-3 px-4 py-3 ${l.retired ? "opacity-50" : ""}`}>
                  <div className="w-14 shrink-0 pt-1" title={`confidence ${pct(l.confidence)}`}>
                    <div className="h-1 overflow-hidden rounded-full bg-raised" role="meter" aria-valuenow={Math.round(l.confidence * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
                      <div className="h-full rounded-full" style={{ width: pct(l.confidence), background: l.confidence >= 0.6 ? "var(--ok)" : l.confidence >= 0.4 ? "var(--amber)" : "var(--bad)" }} />
                    </div>
                    <div className="mono mt-1 text-[10.5px] text-fg-3">{pct(l.confidence)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] leading-snug">{l.text}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-3">
                      <Chip mono>{l.scope === "project" ? l.project?.split("/").pop() : "all projects"}</Chip>
                      <span>from {ORIGIN[l.origin]}</span>
                      {l.from && (
                        <Link to="/sessions/$id" params={{ id: l.from }} className="text-amber hover:underline">
                          see run
                        </Link>
                      )}
                      <span>· {since(l.learnedAt)}</span>
                      {l.applied > 0 && (
                        <span>
                          · used {l.applied}× <span className="text-ok">{l.wins} approved</span> <span className={l.losses ? "text-bad" : ""}>{l.losses} rejected</span>
                        </span>
                      )}
                      {l.retired && <span className="text-bad">· {l.retired}</span>}
                    </div>
                  </div>
                  {!l.retired && (
                    <button className="text-[11.5px] text-fg-3 hover:text-bad" onClick={async () => (await api(`/api/memory/lessons/${l.id}`, { method: "DELETE" }), refresh())} aria-label={`Forget: ${l.text}`}>
                      forget
                    </button>
                  )}
                </div>
              ))}
            </Panel>
          </div>

          <div className="flex flex-col gap-5">
            <Panel className="p-4">
              <Eyebrow className="mb-2.5">What would a run be told?</Eyebrow>
              <input value={probe} onChange={(e) => setProbe(e.target.value)} placeholder="Type an ask…" className="h-9 w-full rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[13px] outline-none focus:border-amber" aria-label="Ask to test recall against" />
              {probed && (
                <div className="mt-3 flex flex-col gap-2 text-[12.5px]">
                  {probed.length === 0 && <span className="text-fg-3">Nothing — this run starts clean.</span>}
                  {probed.map((p) => (
                    <div key={p.id}>
                      <div>{p.text}</div>
                      <div className="mono mt-0.5 text-[10.5px] text-fg-3">
                        {p.score.toFixed(2)} · {p.shared.join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <div>
              <div className="mb-2.5 flex items-center">
                <Eyebrow>Skills</Eyebrow>
                <Link to="/integrations" hash="skills" className="ml-auto text-[11.5px] text-fg-3 hover:text-fg">
                  Install & write skills →
                </Link>
              </div>
              <Panel className="divide-y divide-line">
                {skills.length === 0 && <div className="px-4 py-5 text-[12.5px] leading-relaxed text-fg-3">When the same kind of ask comes back three times, Evolve drafts a skill here for you to approve. Nothing is used until you do.</div>}
                {[...proposed, ...accepted].map((s) => {
                  const fm = /^---[\s\S]*?description:\s*"?([^\n"]+)"?[\s\S]*?---/.exec(s.body)?.[1];
                  const body = s.body.replace(/^---[\s\S]*?---\s*/, "");
                  return (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      <StatusGlyph tone={s.status === "accepted" ? "ok" : "wait"} size={7} />
                      <span className="mono">{s.name}</span>
                      <span className="ml-auto text-[11px] font-normal text-fg-3">from {s.from.length} runs</span>
                    </div>
                    {fm && <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-fg-2" title={fm}>{fm}</p>}
                    {s.status === "proposed" && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-[var(--radius-s)] bg-raised p-2 text-[11.5px] text-fg-2">{body}</pre>}
                    {s.status === "proposed" && (
                      <div className="mt-2 flex gap-1.5">
                        <Button size="s" variant="primary" onClick={async () => (await api(`/api/memory/skills/${s.id}`, { body: { accept: true } }), refresh())}>
                          Accept
                        </Button>
                        <Button size="s" variant="ghost" onClick={async () => (await api(`/api/memory/skills/${s.id}`, { body: { accept: false } }), refresh())}>
                          Dismiss
                        </Button>
                      </div>
                    )}
                  </div>
                  );
                })}
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
