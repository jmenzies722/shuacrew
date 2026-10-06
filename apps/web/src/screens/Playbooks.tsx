import { plain } from "../lib/plain";
import type { PhaseView, PlayView } from "@shuacrew/core/projections";
import { Button } from "@shuacrew/ui";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowUp, Check, ChevronDown, CircleSlash, Copy, Hand, Loader2, Pencil, Play, Plus, RotateCcw, SkipForward, Trash2, X, Zap, ListChecks } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Markdown } from "../components/Markdown";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import { KIND } from "../lib/kinds";
import { Glyph, IconPicker } from "../lib/glyphs";
import { PaneHeader } from "../components/Pane";
import { StatStrip } from "../components/StatStrip";

interface Phase {
  id: string;
  name: string;
  member?: string;
  prompt: string;
  gate: "auto" | "approve";
  deliverable?: string;
}
interface Playbook {
  id: string;
  name: string;
  description: string;
  emoji: string;
  inputs: Array<{ key: string; label: string; placeholder?: string; long?: boolean; optional?: boolean }>;
  phases: Phase[];
  builtin: boolean;
}

const LIVE = new Set(["running", "waiting"]);

function usePlaybooks() {
  const mine = useLive((s) => s.crew.playbooks); // refetch when yours change
  const [books, setBooks] = useState<Playbook[]>([]);
  useEffect(() => void api<Playbook[]>("/api/playbooks").then(setBooks).catch(() => undefined), [mine]);
  return books;
}

/** Reusable, multi-phase work your crew runs for you — you approve at the gates. */
export function Playbooks() {
  const books = usePlaybooks();
  const plays = useLive((s) => s.crew.plays);
  const [starting, setStarting] = useState<Playbook | null>(null);
  const [editing, setEditing] = useState<Partial<Playbook> | null>(null);
  const list = useMemo(() => Object.values(plays).sort((a, b) => b.updatedAt - a.updatedAt), [plays]);
  const active = list.filter((p) => LIVE.has(p.status));
  const recent = list.filter((p) => !LIVE.has(p.status)).slice(0, 8);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-8 pb-12 pt-8">
        <PaneHeader {...(() => { const all = Object.values(plays), waiting = all.filter((p) => p.status === "waiting").length, running = all.filter((p) => p.status === "running").length; return waiting ? { status: `${waiting} playbook${waiting === 1 ? " is" : "s are"} waiting for you`, tone: "wait" as const } : running ? { status: `${running} running now`, tone: "live" as const } : books.length ? { status: `${books.length} playbook${books.length === 1 ? "" : "s"} ready to run`, tone: "ok" as const } : { status: "No playbooks yet. Teach one once and reuse it.", tone: "idle" as const }; })()} children={<StatStrip stats={[{ value: books.length, label: "playbooks" }, { value: Object.values(plays).filter((p) => p.status === "running").length, label: "running", live: Object.values(plays).some((p) => p.status === "running") }, { value: Object.values(plays).filter((p) => p.status === "waiting").length, label: "waiting for you", tone: "wait" }, { value: Object.values(plays).filter((p) => p.status === "done" && p.updatedAt > Date.now() - 7 * 86_400_000).length, label: "finished this week", tone: "ok" }]} />} eyebrow="Plan" icon={ListChecks} title="Automations" description="Repeatable work in phases. Each phase goes to the right crew member, builds on the last, saves its output to the Library, and waits for you where it matters."
          actions={<Button onClick={() => setEditing({ emoji: "workflow", inputs: [{ key: "goal", label: "Goal", long: true }], phases: [{ id: "phase-1", name: "", prompt: "", gate: "approve" }] })}><Plus size={14} /> New playbook</Button>} />

        <div className="automation-intro"><div><span className="studio-eyebrow">01 / DEMONSTRATE</span><h2>Teach your Mac workflow.</h2><p>Use Watch me in the notch, demonstrate a task, then finish and review the captured steps. Missing steps stay marked for help.</p></div><div><span className="studio-eyebrow">02 / ORCHESTRATE</span><h2>Give the crew a playbook.</h2><p>Run repeatable work with explicit inputs and approval gates. Outputs stay linked to the Library.</p></div><div><span className="studio-eyebrow">03 / REPEAT</span><h2>Put it on your schedule.</h2><p>Inspect the outcome of each run before relying on a routine.</p><Link to="/schedules">Manage schedules →</Link></div></div>
        {active.length > 0 && (
          <section className="mb-8">
            <h2 className="pb-eyebrow">In progress</h2>
            <div className="flex flex-col gap-2">
              {active.map((p) => (
                <PlayRow key={p.id} play={p} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="pb-eyebrow">Library</h2>
          <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
            {books.map((b) => (
              <BookCard key={b.id} book={b} onRun={() => setStarting(b)} onEdit={() => setEditing(b.builtin ? { ...b, id: `${b.id}-mine`, name: `${b.name} (mine)`, builtin: false } : b)} />
            ))}
          </div>
        </section>

        {recent.length > 0 && (
          <section className="mt-8">
            <h2 className="pb-eyebrow">Recent</h2>
            <div className="flex flex-col gap-2">
              {recent.map((p) => (
                <PlayRow key={p.id} play={p} />
              ))}
            </div>
          </section>
        )}
      </div>
      {starting && <StartDialog book={starting} onClose={() => setStarting(null)} />}
      {editing && <Editor book={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MemberFace({ id, size = 22 }: { id?: string; size?: number }) {
  const member = useLive((s) => (id ? s.crew.members[id] : undefined));
  return (
    <span className="pb-face" style={{ "--member": member?.color ?? "var(--text-3)", width: size, height: size, fontSize: size * 0.52 } as React.CSSProperties} title={member ? `${member.name}, ${member.role}` : "Any agent"}>
      <Glyph name={member?.emoji} fallback={id} label={member?.name ?? "·"} size={size * 0.55} />
    </span>
  );
}

function BookCard({ book, onRun, onEdit }: { book: Playbook; onRun: () => void; onEdit: () => void }) {
  return (
    <article className="pb-card">
      <div className="flex items-start gap-3">
        <span className="pb-emoji">
          <Glyph name={book.emoji} fallback={book.id} label={book.name} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15.5px] font-semibold text-fg">{book.name}</span>
            {!book.builtin && <span className="lib-badge">Yours</span>}
          </div>
          <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-fg-3">{book.description}</p>
        </div>
      </div>
      <ol className="pb-flow">
        {book.phases.map((p, i) => (
          <li key={p.id}>
            {i > 0 && <ArrowRight size={11} className="shrink-0 text-fg-3" />}
            <MemberFace id={p.member} size={18} />
            <span>{p.name}</span>
            {p.gate === "approve" && <Hand size={10} className="text-amber" aria-label="waits for you" />}
          </li>
        ))}
      </ol>
      <div className="mt-auto flex items-center gap-2 pt-4">
        <Button variant="primary" size="s" onClick={onRun}>
          <Play size={12} /> Run
        </Button>
        <Button variant="ghost" size="s" onClick={onEdit}>
          {book.builtin ? <Copy size={12} /> : <Pencil size={12} />} {book.builtin ? "Customise" : "Edit"}
        </Button>
        <span className="ml-auto text-[11px] text-fg-3">
          {book.phases.length} phase{book.phases.length === 1 ? "" : "s"} · {book.phases.filter((p) => p.gate === "approve").length} review{book.phases.filter((p) => p.gate === "approve").length === 1 ? "" : "s"}
        </span>
      </div>
    </article>
  );
}

const PHASE_TONE: Record<PhaseView["status"], string> = { pending: "idle", running: "live", review: "wait", done: "ok", failed: "bad", skipped: "idle" };

function PlayRow({ play }: { play: PlayView }) {
  const waiting = play.phases.findIndex((p) => p.status === "review");
  const done = play.phases.filter((p) => p.status === "done" || p.status === "skipped").length;
  return (
    <Link to="/plays/$id" params={{ id: play.id }} className={`pb-row ${play.status === "waiting" ? "is-waiting" : ""}`}>
      <span className="pb-emoji is-small">
        <Glyph name={play.emoji} fallback={play.playbook} label={play.name} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-fg">{play.title}</span>
        <span className="block truncate text-[12px] text-fg-3">
          {play.status === "waiting" && waiting >= 0 ? (
            <span className="text-amber">{play.phases[waiting]!.name} is ready for your review</span>
          ) : play.status === "running" ? (
            <span>
              <span className="shimmer-text">{play.phases.find((p) => p.status === "running")?.name ?? "Working"}</span> · phase {Math.min(done + 1, play.phases.length)} of {play.phases.length}
            </span>
          ) : (
            <span>{play.status === "done" ? `Done · ${play.phases.length} phases` : play.reason ?? play.status}</span>
          )}
        </span>
      </span>
      <span className="pb-dots" aria-hidden>
        {play.phases.map((p, i) => (
          <span key={i} className={`pb-dot is-${PHASE_TONE[p.status]}`} />
        ))}
      </span>
    </Link>
  );
}

function StartDialog({ book, onClose }: { book: Playbook; onClose: () => void }) {
  const navigate = useNavigate();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [repo, setRepo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const builds = book.phases.some((p) => p.member === "engineer") || book.id === "mvp";
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const play = await api<{ id: string }>("/api/plays", { body: { playbook: book.id, inputs, repo: repo || undefined } });
      navigate({ to: "/plays/$id", params: { id: play.id } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose} label={`Run ${book.name}`}>
      <div className="flex items-center gap-3">
        <span className="pb-emoji">
          <Glyph name={book.emoji} fallback={book.id} label={book.name} size={20} />
        </span>
        <div>
          <div className="text-[16px] font-semibold">{book.name}</div>
          <div className="text-[12px] text-fg-3">{book.phases.map((p) => p.name).join(" → ")}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {book.inputs.map((input, i) => (
          <label key={input.key} className="field">
            <span>
              {input.label}
              {input.optional ? " (optional)" : ""}
            </span>
            {input.long ? (
              <textarea rows={3} autoFocus={i === 0} value={inputs[input.key] ?? ""} onChange={(e) => setInputs((v) => ({ ...v, [input.key]: e.target.value }))} placeholder={input.placeholder} />
            ) : (
              <input autoFocus={i === 0} value={inputs[input.key] ?? ""} onChange={(e) => setInputs((v) => ({ ...v, [input.key]: e.target.value }))} placeholder={input.placeholder} />
            )}
          </label>
        ))}
        <label className="field">
          <span>{builds ? "Build in this repo (optional)" : "Work in a repo (optional)"}</span>
          <input className="mono" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="~/Developer/projects/fern — or leave empty for the crew's workspace" />
        </label>
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-fg-3">
        Phases marked <Hand size={10} className="inline text-amber" /> wait for your review. Nothing is published, posted or paid for without asking.
      </p>
      {error && <div className="mt-3 text-[12px] text-bad">{error}</div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void start()} disabled={busy}>
          <Play size={13} /> {busy ? "Starting…" : "Start"}
        </Button>
      </div>
    </Modal>
  );
}

function Editor({ book, onClose }: { book: Partial<Playbook>; onClose: () => void }) {
  const members = useLive((s) => s.crew.members);
  const [draft, setDraft] = useState({
    id: book.id ?? "",
    name: book.name ?? "",
    emoji: book.emoji ?? "workflow",
    description: book.description ?? "",
    inputs: (book.inputs ?? []).map((i) => `${i.key}: ${i.label}${i.optional ? " (optional)" : ""}`).join("\n"),
    phases: (book.phases ?? []).map((p) => ({ ...p })),
  });
  const [error, setError] = useState("");
  const setPhase = (i: number, patch: Partial<Phase>) => setDraft((d) => ({ ...d, phases: d.phases.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const move = (i: number, by: number) =>
    setDraft((d) => {
      const phases = [...d.phases];
      const [p] = phases.splice(i, 1);
      phases.splice(i + by, 0, p!);
      return { ...d, phases };
    });
  const save = async () => {
    const inputs = draft.inputs
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [key, ...rest] = l.split(":");
        const label = rest.join(":").trim() || key!.trim();
        return { key: key!.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"), label: label.replace(/\s*\(optional\)$/i, ""), optional: /\(optional\)$/i.test(label), long: true };
      });
    try {
      await api("/api/playbooks", { body: { ...draft, id: draft.id || draft.name, inputs, phases: draft.phases.map((p, i) => ({ ...p, id: p.id || `phase-${i + 1}`, deliverable: p.deliverable || undefined, member: p.member || undefined })) } });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal onClose={onClose} label="Playbook" wide>
      <div className="mb-4 text-[16px] font-semibold">{book.name && !book.id?.endsWith("-mine") ? `Edit ${book.name}` : "New playbook"}</div>
      <label className="field">
        <span>Name</span>
        <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Weekly content" autoFocus />
      </label>
      <div className="field mt-3">
        <span>Icon</span>
        <IconPicker value={draft.emoji} onChange={(emoji) => setDraft((d) => ({ ...d, emoji }))} choices={["workflow", "lightbulb", "layout-template", "hammer", "rocket", "scan-search", "trending-up", "megaphone", "telescope", "target", "zap", "layers", "pen-tool", "code", "chart-line", "sparkles"]} />
      </div>
      <label className="field mt-3">
        <span>What it's for</span>
        <input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Turn one idea into a week of posts" />
      </label>
      <label className="field mt-3">
        <span>Inputs — one per line, as key: Label (use them in phases as {"{{key}}"})</span>
        <textarea rows={2} className="mono" value={draft.inputs} onChange={(e) => setDraft((d) => ({ ...d, inputs: e.target.value }))} placeholder={"topic: Topic\naudience: Audience (optional)"} />
      </label>
      <div className="mt-4 flex flex-col gap-3">
        {draft.phases.map((p, i) => (
          <div key={i} className="pb-edit-phase">
            <div className="flex items-center gap-2">
              <span className="pb-num">{i + 1}</span>
              <input className="pb-edit-name" value={p.name} onChange={(e) => setPhase(i, { name: e.target.value })} placeholder="Phase name" aria-label={`Phase ${i + 1} name`} />
              <select className="lib-select" value={p.member ?? ""} onChange={(e) => setPhase(i, { member: e.target.value })} aria-label="Crew member">
                <option value="">Any agent</option>
                {Object.values(members).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.role}
                  </option>
                ))}
              </select>
              <button className={`pb-gate ${p.gate === "approve" ? "is-on" : ""}`} onClick={() => setPhase(i, { gate: p.gate === "approve" ? "auto" : "approve" })} title="Toggle review">
                {p.gate === "approve" ? <Hand size={11} /> : <Zap size={11} />} {p.gate === "approve" ? "You review" : "Automatic"}
              </button>
              <button className="member-icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                <ArrowUp size={12} />
              </button>
              <button className="member-icon" disabled={i === draft.phases.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                <ArrowDown size={12} />
              </button>
              <button className="member-icon" onClick={() => setDraft((d) => ({ ...d, phases: d.phases.filter((_, j) => j !== i) }))} aria-label="Remove phase">
                <Trash2 size={12} />
              </button>
            </div>
            <textarea className="pb-edit-prompt" rows={3} value={p.prompt} onChange={(e) => setPhase(i, { prompt: e.target.value })} placeholder="What this phase should do. Earlier phases' output is passed along automatically." aria-label={`Phase ${i + 1} instructions`} />
            <input className="pb-edit-deliverable" value={p.deliverable ?? ""} onChange={(e) => setPhase(i, { deliverable: e.target.value })} placeholder="Saves an artifact titled… (optional)" aria-label={`Phase ${i + 1} deliverable`} />
          </div>
        ))}
        <button className="pb-add" onClick={() => setDraft((d) => ({ ...d, phases: [...d.phases, { id: "", name: "", prompt: "", gate: "approve" }] }))}>
          <Plus size={13} /> Add phase
        </button>
      </div>
      {error && <div className="mt-3 text-[12px] text-bad">{error}</div>}
      <div className="mt-5 flex items-center gap-2">
        {book.id && !book.builtin && !book.id.endsWith("-mine") && (
          <Button variant="danger" onClick={() => void api(`/api/playbooks/${book.id}`, { method: "DELETE" }).then(onClose)}>
            <Trash2 size={13} /> Delete
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={!draft.name.trim() || !draft.phases.length}>
          Save playbook
        </Button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, label, wide }: { children: React.ReactNode; onClose: () => void; label: string; wide?: boolean }) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={label}>
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`${wide ? "w-[760px]" : "w-[560px]"} max-w-full rounded-[16px] border border-line-strong bg-panel p-5 shadow-[0_30px_90px_rgba(0,0,0,.45)]`}>
        {children}
      </motion.div>
    </div>
  );
}

// ── a play, live ───────────────────────────────────────────────────────────────────────────

export function PlayPage() {
  const { id } = useParams({ from: "/plays/$id" });
  const play = useLive((s) => s.crew.plays[id]);
  const [showInputs, setShowInputs] = useState(false);
  if (!play) return <div className="p-10 text-center text-[13px] text-fg-3">No such play.</div>;
  const live = LIVE.has(play.status);
  const done = play.phases.filter((p) => p.status === "done" || p.status === "skipped").length;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-6 py-6">
        <Link to="/playbooks" className="text-[12px] text-fg-3 hover:text-fg">
          ← Playbooks
        </Link>
        <header className="mt-3 flex items-start gap-4">
          <span className="pb-emoji">
            <Glyph name={play.emoji} fallback={play.playbook} label={play.name} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-fg-3">{play.name}</div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{play.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
              <span className={`pb-status is-${play.status}`}>
                {play.status === "waiting" ? "Needs your review" : play.status === "running" ? "Working" : play.status === "done" ? "Done" : play.status === "failed" ? "Stopped" : "Cancelled"}
              </span>
              <span className="text-fg-3">
                {done} of {play.phases.length} phases
              </span>
              {play.repo && <span className="mono truncate text-fg-3">{play.repo}</span>}
              <button className="text-fg-3 hover:text-fg" onClick={() => setShowInputs((v) => !v)}>
                Inputs <ChevronDown size={11} className={`inline transition ${showInputs ? "rotate-180" : ""}`} />
              </button>
            </div>
          </div>
          {live && (
            <Button variant="ghost" size="s" onClick={() => void api(`/api/plays/${play.id}/cancel`, { body: {} })}>
              <CircleSlash size={12} /> Cancel
            </Button>
          )}
        </header>
        <AnimatePresence initial={false}>
          {showInputs && (
            <motion.dl initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="pb-inputs">
              {Object.entries(play.inputs).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </motion.dl>
          )}
        </AnimatePresence>
        <ol className="pb-timeline">
          {play.phases.map((phase, i) => (
            <PhaseCard key={`${phase.id}:${phase.runs.length}`} play={play} phase={phase} index={i} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function PhaseCard({ play, phase, index }: { play: PlayView; phase: PhaseView; index: number }) {
  const navigate = useNavigate();
  const member = useLive((s) => (phase.member ? s.crew.members[phase.member] : undefined));
  const run = useLive((s) => (phase.run ? s.crew.runs[phase.run] : undefined));
  const artifacts = useLive((s) => s.crew.artifacts);
  const [open, setOpen] = useState(phase.status === "review" || phase.status === "failed");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (phase.status === "review" || phase.status === "failed") setOpen(true);
  }, [phase.status]);
  const act = async (label: string, path: string, body: object) => {
    setBusy(label);
    await api(`/api/plays/${play.id}/${path}`, { body }).finally(() => setBusy(""));
  };
  const made = phase.artifacts.map((id) => artifacts[id]).filter(Boolean);
  const icon =
    phase.status === "done" ? <Check size={13} strokeWidth={3} /> : phase.status === "running" ? <Loader2 size={13} className="animate-spin" /> : phase.status === "review" ? <Hand size={12} /> : phase.status === "failed" ? <X size={13} strokeWidth={3} /> : phase.status === "skipped" ? <SkipForward size={11} /> : index + 1;
  const hasBody = Boolean(phase.output || made.length || phase.note);
  return (
    <li className={`pb-phase is-${phase.status}`} style={{ "--member": member?.color ?? "var(--amber)" } as React.CSSProperties}>
      <span className="pb-node">{icon}</span>
      <div className="pb-phase-card">
        <button className="flex w-full items-center gap-3 text-left" onClick={() => hasBody && setOpen((v) => !v)} disabled={!hasBody}>
          <MemberFace id={phase.member} size={28} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-[14.5px] font-semibold text-fg">{phase.name}</span>
              <span className={`pb-gate is-static ${phase.gate === "approve" ? "is-on" : ""}`}>
                {phase.gate === "approve" ? <Hand size={10} /> : <Zap size={10} />} {phase.gate === "approve" ? "You review" : "Automatic"}
              </span>
            </span>
            <span className="block truncate text-[12px] text-fg-3">
              {member ? `${member.name} · ${member.role}` : "Any agent"}
              {" — "}
              {phase.status === "running" ? (
                <span className="shimmer-text">{run?.currentTool ? `using ${run.currentTool}…` : plain(run?.ticker) || "working…"}</span>
              ) : phase.status === "review" ? (
                <span className="text-amber">ready for your review</span>
              ) : phase.status === "failed" ? (
                <span className="text-bad">{phase.note ?? "stopped"}</span>
              ) : phase.status === "done" ? (
                `done${made.length ? ` · saved ${made.length}` : ""}`
              ) : (
                phase.status
              )}
            </span>
          </span>
          {hasBody && <ChevronDown size={14} className={`shrink-0 text-fg-3 transition ${open ? "rotate-180" : ""}`} />}
        </button>

        <AnimatePresence initial={false}>
          {open && hasBody && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              {made.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {made.map((a) => {
                    const K = KIND[a!.kind];
                    return (
                      <button key={a!.id} className="art-inline" style={{ "--kind": K.tone } as React.CSSProperties} onClick={() => navigate({ to: "/library", hash: a!.id })}>
                        <span className="art-inline-icon">
                          <K.icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-fg">{a!.title}</span>
                          <span className="block truncate text-[11.5px] text-fg-3">{a!.summary ?? `${K.label} · ${a!.file}`}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-fg-3">{a!.version > 1 ? `v${a!.version} · ` : ""}Open →</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {phase.output && (
                <div className="pb-output prose-agent">
                  <Markdown text={phase.output} />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {feedback !== null && (
          <div className="member-talk mt-3" style={{ "--member": "var(--amber)" } as React.CSSProperties}>
            <input
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setFeedback(null);
                if (e.key === "Enter" && feedback.trim()) void act("revise", "revise", { index, feedback }).then(() => setFeedback(null));
              }}
              placeholder={`Tell ${member?.name ?? "the agent"} what to change…`}
              aria-label="What to change"
            />
            <button className="member-send" disabled={!feedback.trim()} onClick={() => void act("revise", "revise", { index, feedback }).then(() => setFeedback(null))} aria-label="Send feedback">
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5 empty:hidden">
          {phase.status === "review" && (
            <>
              <Button variant="primary" size="s" disabled={Boolean(busy)} onClick={() => void act("approve", "approve", { index })}>
                <Check size={12} /> {index === play.phases.length - 1 ? "Approve & finish" : "Approve & continue"}
              </Button>
              <Button size="s" onClick={() => setFeedback("")}>
                <Pencil size={12} /> Ask for changes
              </Button>
            </>
          )}
          {phase.status === "failed" && (
            <Button variant="primary" size="s" disabled={Boolean(busy)} onClick={() => void act("restart", "restart", { from: index })}>
              <RotateCcw size={12} /> Try again
            </Button>
          )}
          {(phase.status === "review" || phase.status === "failed" || phase.status === "running") && play.status !== "cancelled" && (
            <Button variant="ghost" size="s" disabled={Boolean(busy)} onClick={() => void act("skip", "skip", { index })}>
              <SkipForward size={12} /> Skip
            </Button>
          )}
          {(phase.status === "done" || phase.status === "review" || phase.status === "skipped") && (
            <Button variant="ghost" size="s" disabled={Boolean(busy)} onClick={() => void act("restart", "restart", { from: index })} title="Run this phase again, and every phase after it">
              <RotateCcw size={12} /> Redo from here
            </Button>
          )}
          {phase.run && (
            <Button variant="ghost" size="s" onClick={() => navigate({ to: "/sessions/$id", params: { id: phase.run! } })}>
              Open session →
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
