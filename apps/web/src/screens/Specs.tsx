import { Button, Eyebrow, Panel, StatusGlyph } from "@shuacrew/ui";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { FileText } from "lucide-react";
import { PaneHeader } from "../components/Pane";

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

/**
 * Requirements, then design, then tasks. The current phase is a file you comment on
 * line by line. Approving tasks fans each line onto the board as its own run.
 */
export function Specs() {
  const [specs, setSpecs] = useState<SpecView[]>([]);
  const [open, setOpen] = useState<SpecView | null>(null);
  const [starting, setStarting] = useState(false);
  const refresh = () => api<SpecView[]>("/api/specs").then(setSpecs).catch(() => undefined);
  useEffect(() => {
    void refresh();
  }, []);

  const select = async (id: string) => setOpen(await api<SpecView>(`/api/specs/${id}`));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-8 pb-12 pt-8">
        <PaneHeader eyebrow="Plan" icon={FileText} title="Specs" description="Requirements, then design, then tasks. A session writes the draft; you approve it here. Tasks land on the board as runs."
          actions={<Button onClick={() => (setStarting(true), setOpen(null))}>Start a spec</Button>} />

        {starting && (
          <Start
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
            <div className="mt-6 flex flex-col gap-2">
              {specs.length === 0 && !starting && (
                <div className="crew-cta flex flex-col items-center py-12 text-center">
                  <div className="flex items-center gap-2 text-[12px] font-medium text-fg-2">
                    {["Requirements", "Design", "Tasks", "Board"].map((step, i) => (
                      <span key={step} className="flex items-center gap-2">
                        {i > 0 && <span className="text-fg-3">→</span>}
                        <span className="vn-stage-chip">{step}</span>
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 text-[17px] font-semibold">Plan a feature before anyone writes code</div>
                  <p className="mt-2 max-w-[520px] text-[13px] leading-relaxed text-fg-3">
                    Describe what you want in a repo. A session drafts the requirements, you approve them, then the design, then the tasks — which land on the Board as sessions. Everything is saved in the repo under <span className="mono">.shuacrew/specs/</span>.
                  </p>
                  <Button variant="primary" className="mt-5" onClick={() => (setStarting(true), setOpen(null))}>
                    Start a spec
                  </Button>
                </div>
              )}
              {specs.map((spec) => (
                <button key={spec.id} onClick={() => void select(spec.id)} className="rounded-[var(--radius-l)] border border-line bg-panel px-4 py-3 text-left hover:border-line-strong">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{spec.title}</span>
                    <Phases spec={spec} />
                  </div>
                  <div className="mono mt-1 truncate text-[11.5px] text-fg-3">
                    {spec.planning ? "drafting · " : ""}
                    {spec.file}
                  </div>
                </button>
              ))}
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

function Start({ onCreated, onCancel }: { onCreated: (spec: SpecView) => void; onCancel: () => void }) {
  const [ask, setAsk] = useState("");
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
    <Panel className="mt-6 p-5">
      <Eyebrow className="mb-3">New spec</Eyebrow>
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
