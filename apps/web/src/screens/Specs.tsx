import { Button, Eyebrow, Panel, StatusGlyph } from "@shuacrew/ui";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { FileText, KanbanSquare, ListChecks, ListTodo, PenTool, Plus } from "lucide-react";
import "./specs.css";
import { PaneHeader } from "../components/Pane";
import { StatStrip } from "../components/StatStrip";

type Phase = "requirements" | "design" | "tasks";
const PHASES: Phase[] = ["requirements", "design", "tasks"];

interface SpecComment {
  phase: Phase;
  line: number;
  text: string;
}
interface SpecView {
  id: string;
  title: string;
  ask: string;
  repo: string;
  phase: Phase;
  approved: Phase[];
  runs: string[];
  comments: SpecComment[];
  file: string;
  text?: string;
  planning?: string;
}

const RECENT = "shuacrew.recentRepos";
const FLOW = [
  { icon: ListChecks, title: "Requirements", hint: "what it must do" },
  { icon: PenTool, title: "Design", hint: "how it will work" },
  { icon: ListTodo, title: "Tasks", hint: "the steps, in order" },
  { icon: KanbanSquare, title: "Board", hint: "each task, a session" },
];
const STARTERS = ["Add sign-in with email and Google", "Take payments with Stripe", "A landing page with a waitlist", "Nightly backups with a restore check"];

/**
 * Requirements, then design, then tasks. The current phase is a file you comment on
 * line by line. Approving tasks fans each line onto the board as its own run.
 */
export function Specs() {
  const [specs, setSpecs] = useState<SpecView[]>([]);
  const [open, setOpen] = useState<SpecView | null>(null);
  const [starting, setStarting] = useState(false);
  const [seed, setSeed] = useState("");
  const refresh = () => api<SpecView[]>("/api/specs").then(setSpecs).catch(() => undefined);
  useEffect(() => {
    void refresh();
  }, []);

  const select = async (id: string) => setOpen(await api<SpecView>(`/api/specs/${id}`));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-8 pb-12 pt-8">
        <PaneHeader {...(() => { const waiting = specs.filter((x) => !x.approved.includes(x.phase)).length; return waiting ? { status: `${waiting} waiting for your approval`, tone: "wait" as const } : specs.length ? { status: `${specs.length} spec${specs.length === 1 ? "" : "s"}, all approved`, tone: "ok" as const } : { status: "No specs yet. Ask a session to write one and approve it here.", tone: "idle" as const }; })()} eyebrow="Plan" icon={FileText} title="Specs"
          actions={specs.length ? <Button onClick={() => (setSeed(""), setStarting(true), setOpen(null))}>Start a spec</Button> : undefined} />

        {starting && (
          <Start
            seed={seed}
            onCancel={() => setStarting(false)}
            onCreated={(spec) => {
              setStarting(false);
              setOpen(spec);
              void refresh();
            }}
          />
        )}

        {open ? (
          <Review
            spec={open}
            onChange={setOpen}
            onBack={() => {
              setOpen(null);
              void refresh();
            }}
          />
        ) : (
          !starting && (
            <div className="sp-list">
              {specs.length === 0 && <section className="sp-empty">
                <ol className="sp-flow" aria-label="How a spec moves">
                  {FLOW.map(({ icon: Icon, title, hint }, i) => <li key={title} style={{ ["--i" as string]: i }}><i><Icon size={17} /></i><b>{title}</b><small>{hint}</small></li>)}
                </ol>
                <h2>Plan a feature before anyone writes code</h2>
                <p>Describe what you want in a repo. A session drafts the requirements; you approve them, then the design, then the tasks, which land on the Board as sessions. Everything is saved in the repo under <code>.shuacrew/specs/</code>.</p>
                <div className="sp-starters">{STARTERS.map((t) => <button key={t} type="button" onClick={() => { setSeed(t); setStarting(true); setOpen(null); }}>{t}</button>)}</div>
                <button type="button" className="cr-btn is-primary sp-go" onClick={() => { setSeed(""); setStarting(true); setOpen(null); }}><Plus size={14} /> Start a spec</button>
              </section>}
              {specs.length > 0 && <div className="sp-grid">{specs.map((spec) => {
                const waiting = !spec.approved.includes(spec.phase), done = PHASES.every((ph) => spec.approved.includes(ph));
                return <button key={spec.id} type="button" onClick={() => void select(spec.id)} className={`sp-card${spec.planning ? " is-drafting" : waiting && !done ? " is-waiting" : done ? " is-done" : ""}`}>
                  <span className="sp-card-top"><b>{spec.title}</b>
                    <em>{spec.planning ? "drafting…" : done ? "on the board" : waiting ? "waiting for you" : spec.phase}</em></span>
                  <span className="sp-rail" aria-label={`Phase: ${spec.phase}`}>{PHASES.map((ph) => <i key={ph} className={spec.approved.includes(ph) ? "is-done" : spec.phase === ph ? "is-now" : ""}><span>{ph}</span></i>)}</span>
                  <small>{spec.repo.split("/").filter(Boolean).pop()}{spec.runs.length ? ` · ${spec.runs.length} session${spec.runs.length === 1 ? "" : "s"}` : ""}{spec.comments.length ? ` · ${spec.comments.length} comment${spec.comments.length === 1 ? "" : "s"}` : ""}</small>
                </button>;
              })}</div>}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Phases({ spec }: { spec: SpecView }) {
  return (
    <span className="flex items-center gap-2 text-[11px] text-fg-3">
      {PHASES.map((phase) => {
        const done = spec.approved.includes(phase);
        const current = spec.phase === phase && !done;
        return (
          <span key={phase} className={`flex items-center gap-1 ${current ? "text-amber" : done ? "text-ok" : ""}`}>
            <StatusGlyph tone={done ? "ok" : current ? "live" : "idle"} size={7} />
            {phase}
          </span>
        );
      })}
    </span>
  );
}

function Start({ onCreated, onCancel, seed = "" }: { onCreated: (spec: SpecView) => void; onCancel: () => void; seed?: string }) {
  const [ask, setAsk] = useState(seed);
  const [repo, setRepo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const recent = (() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT) ?? "[]") as string[];
    } catch {
      return [];
    }
  })();
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const spec = await api<SpecView>("/api/specs", { body: { ask, repo } });
      if (repo) localStorage.setItem(RECENT, JSON.stringify([repo, ...recent.filter((r) => r !== repo)].slice(0, 8)));
      onCreated(spec);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="sp-start mt-6 p-5">
      <Eyebrow className="mb-3">New spec · a session drafts the requirements first</Eyebrow>
      <textarea
        value={ask}
        onChange={(e) => setAsk(e.target.value)}
        placeholder="What should this spec cover?"
        className="min-h-[88px] w-full resize-y rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 py-2 text-[13.5px] outline-none focus:border-amber"
      />
      <input
        list="spec-repos"
        value={repo}
        onChange={(e) => setRepo(e.target.value)}
        placeholder="Repo path"
        className="mono mt-2 h-9 w-full rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 text-[12.5px] outline-none focus:border-amber"
        aria-label="Repo"
      />
      <datalist id="spec-repos">
        {recent.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      {error && <p className="mt-2 text-[12.5px] text-bad">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="primary" disabled={busy || !ask.trim() || !repo.trim()} onClick={() => void submit()}>
          Draft requirements
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
}

function Review({ spec, onChange, onBack }: { spec: SpecView; onChange: (spec: SpecView) => void; onBack: () => void }) {
  const [draft, setDraft] = useState<{ line: number; text: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!spec.planning) return;
    const timer = setInterval(() => {
      void api<SpecView>(`/api/specs/${spec.id}`).then(onChange).catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [spec.id, spec.planning, onChange]);
  const lines = (spec.text ?? "").split("\n");
  const done = spec.approved.includes(spec.phase);
  const act = async (path: string) => {
    setBusy(true);
    setError("");
    try {
      onChange(await api<SpecView>(path, { body: {} }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sendComment = async () => {
    if (!draft?.text.trim()) return;
    setBusy(true);
    try {
      onChange(await api<SpecView>(`/api/specs/${spec.id}/comments`, { body: { line: draft.line, text: draft.text } }));
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-3">
        <button onClick={onBack} className="text-[12.5px] text-fg-3 hover:text-fg">
          All specs
        </button>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{spec.title}</span>
        <Phases spec={spec} />
      </div>
      <Panel className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <Eyebrow>{spec.phase}</Eyebrow>
          <span className="mono truncate text-[11.5px] text-fg-3">{spec.file}</span>
          {spec.planning && <span className="text-[11.5px] text-amber">drafting</span>}
          <div className="ml-auto flex gap-2">
            {spec.comments.length > 0 && !done && (
              <Button
                size="s"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void api<{ run: string }>(`/api/specs/${spec.id}/revise`, { body: {} })
                    .then(() => onChange(spec))
                    .catch((e: Error) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Send comments as one run
              </Button>
            )}
            {!done && spec.phase !== "tasks" && (
              <Button size="s" variant="primary" disabled={busy} onClick={() => void act(`/api/specs/${spec.id}/approve`)}>
                Approve {spec.phase}
              </Button>
            )}
            {!done && spec.phase === "tasks" && (
              <Button size="s" variant="primary" disabled={busy} onClick={() => void act(`/api/specs/${spec.id}/approve`)}>
                Fan out to the board
              </Button>
            )}
          </div>
        </div>
        <ol className="mono text-[12.5px] leading-6">
          {lines.map((line, i) => {
            const n = i + 1;
            const notes = spec.comments.filter((c) => c.line === n);
            return (
              <li key={n} className="border-b border-line last:border-0">
                <button onClick={() => !done && setDraft({ line: n, text: "" })} className="flex w-full gap-3 px-4 text-left hover:bg-raised">
                  <span className="w-8 shrink-0 text-right text-fg-3">{n}</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap text-fg">{line || " "}</span>
                </button>
                {notes.map((note, k) => (
                  <div key={k} className="ml-16 pb-1 text-[12px] text-wait">
                    {note.text}
                  </div>
                ))}
                {draft?.line === n && (
                  <div className="flex gap-2 px-4 py-2">
                    <input
                      autoFocus
                      value={draft.text}
                      onChange={(e) => setDraft({ line: n, text: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && void sendComment()}
                      placeholder="Comment on this line"
                      className="h-8 min-w-0 flex-1 rounded-[var(--radius-s)] border border-line-strong bg-raised px-2 text-[12.5px] outline-none focus:border-amber"
                    />
                    <Button size="s" onClick={() => void sendComment()}>
                      Add
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Panel>
      {error && <p className="mt-2 text-[12.5px] text-bad">{error}</p>}
      {spec.runs.length > 0 && (
        <p className="mt-3 text-[12.5px] text-fg-2">
          {spec.runs.length} {spec.runs.length === 1 ? "run" : "runs"} on the{" "}
          <Link to="/board" className="text-amber">
            board
          </Link>
          .
        </p>
      )}
    </div>
  );
}
