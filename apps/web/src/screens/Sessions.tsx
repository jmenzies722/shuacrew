import type { RunView } from "@shuacrew/core/projections";
import { Chip, StatusGlyph, StatusPill, formatTokens } from "@shuacrew/ui";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowUp,
  Bug,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  Ellipsis,
  FileDiff,
  Folder,
  GitBranch,
  ListChecks,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Telescope,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Thread } from "../components/Thread";
import { api, cancelRun, followUp, launchRun, launchTask } from "../lib/api";
import { conversation } from "../lib/conversation";
import { useLive } from "../lib/live";
import { isMac, pickFolder } from "../lib/native";

interface RuntimeInfo {
  id: string;
  label: string;
  authMode: string;
  models: Array<{ id: string; label: string; tier: string }>;
  limitedUntil: number | null;
}

const FRIENDLY: Record<string, string> = { claude: "Claude Code", codex: "Codex", mock: "Demo (no usage)" };
const friendly = (r: { id: string; label: string }) => FRIENDLY[r.id] ?? r.label;

const WORKING = new Set(["running", "planning", "queued", "awaiting_approval"]);
const folderOf = (run: RunView) => (run.repo ? run.repo.split("/").filter(Boolean).pop()! : "workspace");

/**
 * Kiro Crew's working surface: sessions on the left, the conversation in the middle, what it
 * changed on the right. A session is a run — the first message starts it, every next one continues it.
 */
export function Sessions() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id;
  const [changes, setChanges] = useState(true);
  return (
    <div className={`grid h-full gap-2 p-2 pt-0 ${id && changes ? "grid-cols-[300px_minmax(0,1fr)_320px]" : "grid-cols-[300px_minmax(0,1fr)]"} max-[1150px]:grid-cols-[260px_minmax(0,1fr)] max-[760px]:grid-cols-1`}>
      <SessionsPanel selected={id} />
      {id ? <Chat id={id} changes={changes} onToggleChanges={() => setChanges((v) => !v)} /> : <NewSession />}
      {id && changes && <ChangesPanel id={id} />}
    </div>
  );
}

// ── sessions panel ──────────────────────────────────────────────────────────────────────────

function SessionsPanel({ selected }: { selected?: string }) {
  const runs = useLive((s) => s.crew.runs);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showOlder, setShowOlder] = useState(false);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = Object.values(runs)
      .filter((r) => !r.parent)
      .filter((r) => !q || `${r.title} ${r.ask} ${r.ticker} ${r.repo ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const week = Date.now() - 7 * 86400_000;
    return {
      needs: all.filter((r) => r.pendingApprovals.length > 0),
      working: all.filter((r) => !r.pendingApprovals.length && WORKING.has(r.status)),
      recent: all.filter((r) => !r.pendingApprovals.length && !WORKING.has(r.status) && r.updatedAt >= week),
      older: all.filter((r) => !r.pendingApprovals.length && !WORKING.has(r.status) && r.updatedAt < week),
    };
  }, [runs, query]);
  const empty = !groups.needs.length && !groups.working.length && !groups.recent.length && !groups.older.length;

  return (
    <aside className="flex min-h-0 flex-col rounded-[14px] border border-line bg-panel max-[760px]:hidden" aria-label="Sessions">
      <div className="flex items-center gap-2 px-3.5 pb-2.5 pt-3.5">
        <h2 className="text-[15px] font-semibold">Sessions</h2>
        <button
          onClick={() => navigate({ to: "/" })}
          className="ml-auto flex h-7 items-center gap-1 rounded-[8px] bg-amber px-2.5 text-[12.5px] font-semibold text-[#1a1204] hover:brightness-110"
          title="New session (⌘N)"
        >
          <Plus size={14} strokeWidth={2.5} /> New
        </button>
      </div>
      <label className="mx-3.5 mb-2 flex h-8 items-center gap-2 rounded-[8px] border border-line bg-ink px-2.5 text-[12.5px] text-fg-3 focus-within:border-amber">
        <Search size={13} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sessions…" className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3" />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {empty && <div className="px-2 py-6 text-center text-[12.5px] leading-relaxed text-fg-3">{query ? "No session matches." : "No sessions yet. Press New and say what you want done."}</div>}
        <Group title="Needs you" runs={groups.needs} selected={selected} accent />
        <Group title="Working" runs={groups.working} selected={selected} />
        <Group title="Recent" runs={groups.recent} selected={selected} />
        {groups.older.length > 0 && (
          <button onClick={() => setShowOlder((v) => !v)} className="flex w-full items-center gap-1 px-2 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-3 hover:text-fg-2">
            <ChevronDown size={12} className={showOlder ? "" : "-rotate-90"} /> Older · {groups.older.length}
          </button>
        )}
        {showOlder && <Group runs={groups.older} selected={selected} />}
      </div>
    </aside>
  );
}

function Group({ title, runs, selected, accent }: { title?: string; runs: RunView[]; selected?: string; accent?: boolean }) {
  if (!runs.length) return null;
  return (
    <div>
      {title && (
        <div className={`px-2 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${accent ? "text-wait" : "text-fg-3"}`}>
          {title} · {runs.length}
        </div>
      )}
      {runs.map((run) => (
        <SessionCard key={run.id} run={run} selected={run.id === selected} />
      ))}
    </div>
  );
}

function SessionCard({ run, selected }: { run: RunView; selected: boolean }) {
  const working = WORKING.has(run.status) && !run.pendingApprovals.length;
  return (
    <Link
      to="/sessions/$id"
      params={{ id: run.id }}
      className={`relative mb-0.5 block rounded-[10px] px-2.5 py-2 transition-colors ${selected ? "bg-raised" : "hover:bg-raised/60"}`}
      aria-current={selected ? "page" : undefined}
    >
      {selected && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-amber" />}
      <div className="flex items-center gap-1.5 text-[11px] text-fg-3">
        <Folder size={11} />
        <span className="truncate">{folderOf(run)}</span>
        <span className="ml-auto shrink-0 tabular-nums">{clock(run.updatedAt)}</span>
      </div>
      <div className="mt-0.5 truncate text-[13px] font-semibold text-fg">{run.title}</div>
      <div className="mt-0.5 truncate text-[12px]">
        {run.pendingApprovals.length > 0 ? (
          <span className="text-wait">Waiting for your approval</span>
        ) : working ? (
          <span className="text-amber">{run.currentTool ? `Using ${run.currentTool}…` : run.ticker || "Thinking…"}</span>
        ) : run.status === "failed" ? (
          <span className="text-bad">{run.statusReason ?? "Failed"}</span>
        ) : (
          <span className="text-fg-3">{run.ticker || (run.status === "reviewing" ? "Ready for review" : run.status)}</span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Chip mono>{run.runtime}</Chip>
        {run.turns > 0 && <Chip>{`${run.turns} turn${run.turns === 1 ? "" : "s"}`}</Chip>}
        {run.usage.inputTokens + run.usage.outputTokens > 0 && <Chip mono>{formatTokens(run.usage.inputTokens + run.usage.outputTokens)}</Chip>}
        {run.status === "reviewing" && <Chip>review</Chip>}
      </div>
    </Link>
  );
}

function clock(ms: number): string {
  const d = new Date(ms);
  return Date.now() - ms < 86400_000 ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── conversation ────────────────────────────────────────────────────────────────────────────

function Chat({ id, changes, onToggleChanges }: { id: string; changes: boolean; onToggleChanges: () => void }) {
  const run = useLive((s) => s.crew.runs[id]);
  const events = useLive((s) => s.runEvents[id]);
  const loadRun = useLive((s) => s.loadRun);
  useEffect(() => {
    void loadRun(id);
  }, [id, loadRun]);
  const items = useMemo(() => conversation(events ?? []), [events]);
  if (!run) return <section className="flex items-center justify-center rounded-[14px] border border-line bg-panel text-fg-3">Loading…</section>;
  const working = WORKING.has(run.status) && !run.pendingApprovals.length;

  return (
    <section className="flex min-h-0 flex-col rounded-[14px] border border-line bg-panel" aria-label="Conversation">
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <h1 className="min-w-0 truncate text-[14px] font-semibold">{run.title}</h1>
        <StatusPill status={run.status} />
        <span className="mono truncate text-[11.5px] text-fg-3">
          {run.runtime}
          {run.model ? ` · ${run.model}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {working && (
            <IconButton title="Stop" onClick={() => void cancelRun(run.id)}>
              <CircleStop size={15} />
            </IconButton>
          )}
          <IconButton title={changes ? "Hide changes" : "Show changes"} onClick={onToggleChanges} active={changes}>
            <FileDiff size={15} />
          </IconButton>
          <Link to="/runs/$id" params={{ id: run.id }} className="grid h-7 w-7 place-items-center rounded-[7px] text-fg-3 hover:bg-raised hover:text-fg" title="Inspect: timeline, graph, terminal, cost">
            <Ellipsis size={15} />
          </Link>
        </div>
      </header>
      <Thread items={items} working={working} />
      <Composer run={run} />
    </section>
  );
}

function IconButton({ title, onClick, active, children }: { title: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className={`grid h-7 w-7 place-items-center rounded-[7px] hover:bg-raised ${active ? "text-amber" : "text-fg-3 hover:text-fg"}`}>
      {children}
    </button>
  );
}

function NewSession() {
  const [seed, setSeed] = useState<{ text: string; n: number }>({ text: "", n: 0 });
  const ideas = [
    { icon: CheckCircle2, text: "Review my uncommitted changes across ~/Developer and tell me what's risky" },
    { icon: Bug, text: "Find a failing test in one of my projects and fix it" },
    { icon: Telescope, text: "Summarise what changed in my repos today" },
    { icon: Sparkles, text: "Look at my most recent project and suggest the next three things to build" },
  ];
  return (
    <section className="flex min-h-0 flex-col rounded-[14px] border border-line bg-panel" aria-label="New session">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[640px] px-6 pb-6 pt-[10vh]">
          <img src="/icon.svg" alt="" className="h-11 w-11" />
          <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.02em]">What should the crew work on?</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">No project to set up — just say what you want. ShuaCrew picks Claude or Codex, works in its own branch, and asks before anything risky.</p>
          <div className="mt-6 flex flex-col gap-2">
            {ideas.map(({ icon: Icon, text }) => (
              <button key={text} onClick={() => setSeed((s) => ({ text, n: s.n + 1 }))} className="group flex items-center gap-3 rounded-[10px] border border-line bg-ink px-3.5 py-3 text-left text-[13px] text-fg-2 transition hover:border-amber hover:text-fg">
                <Icon size={16} className="shrink-0 text-amber" />
                <span className="flex-1">{text}</span>
                <ArrowUp size={14} className="text-fg-3 group-hover:text-amber" />
              </button>
            ))}
          </div>
        </div>
      </div>
      <Composer seed={seed} />
    </section>
  );
}

// ── composer ────────────────────────────────────────────────────────────────────────────────

const COMMANDS = [
  { name: "task", hint: "Plan it into steps, check each one, retry what fails", icon: ListChecks },
  { name: "learn", hint: "Teach a lesson every future run is told", icon: Sparkles },
  { name: "schedule", hint: "/schedule weekdays 9am: triage new issues", icon: Zap },
  { name: "autopilot", hint: "Approve what policy would ask about (deny rules still apply)", icon: ShieldCheck },
];
const EFFORTS = ["low", "medium", "high", "max"];
const RECENT = "shuacrew.recentRepos";

let runtimeCache: Promise<RuntimeInfo[]> | null = null;
const loadRuntimes = () => (runtimeCache ??= api<RuntimeInfo[]>("/api/runtimes").catch(() => ((runtimeCache = null), [])));

function Composer({ run, seed }: { run?: RunView; seed?: { text: string; n: number } }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [repo, setRepo] = useState("");
  const [runtime, setRuntime] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);
  const working = run ? WORKING.has(run.status) : false;

  useEffect(() => {
    void loadRuntimes().then(setRuntimes);
  }, []);
  useEffect(() => {
    if (seed?.text) {
      setText(seed.text);
      field.current?.focus();
    }
  }, [seed?.n]);
  // ⌘N and "New Run…" land here.
  useEffect(() => {
    const focus = () => field.current?.focus();
    focus();
    window.addEventListener("shuacrew:compose", focus);
    return () => window.removeEventListener("shuacrew:compose", focus);
  }, [run?.id]);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const slash = /^\/(\w*)$/.exec(text.trim()) && !text.includes(" ") ? COMMANDS.filter((c) => c.name.startsWith(text.trim().slice(1))) : [];
  const chosen = runtimes.find((r) => r.id === runtime);
  const recent = useMemo<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT) ?? "[]");
    } catch {
      return [];
    }
  }, []);

  const pick = (name: string) => {
    if (name === "task") {
      setTask(true);
      setText("");
    } else if (name === "autopilot") {
      setAutopilot((v) => !v);
      setText("");
    } else setText(`/${name} `);
    field.current?.focus();
  };

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError("");
    try {
      if (message.startsWith("/learn ")) {
        await api("/api/memory/lessons", { body: { text: message.slice(7), project: run?.repo ?? (repo || undefined) } });
        setText("");
        setError("Learned — every future run in scope is told.");
        return;
      }
      if (message.startsWith("/schedule ")) {
        const [when, ...rest] = message.slice(10).split(":");
        await api("/api/schedules", { body: { when: when!.trim(), ask: rest.join(":").trim(), project: run?.repo ?? (repo || undefined) } });
        setText("");
        setError("Scheduled — see Schedules.");
        return;
      }
      if (run) {
        await followUp(run.id, message);
        setText("");
        return;
      }
      const common = { repo: repo || undefined, runtime: runtime || undefined, model: model || undefined };
      const { id } = task
        ? await launchTask({ markdown: message.startsWith("#") ? message : `# ${message.split("\n")[0]}\n${message}`, ...common })
        : await launchRun({ ask: message, ...common, effort: effort || undefined, approveAll: autopilot });
      if (repo) localStorage.setItem(RECENT, JSON.stringify([repo, ...recent.filter((r) => r !== repo)].slice(0, 8)));
      setText("");
      setTask(false);
      navigate({ to: "/sessions/$id", params: { id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const chooseFolder = async () => {
    const path = await pickFolder();
    if (path) setRepo(path);
  };

  return (
    <div className="shrink-0 px-4 pb-3 pt-1">
      <div className="relative mx-auto max-w-[820px]">
        {slash.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-[12px] border border-line-strong bg-raised shadow-[0_18px_50px_rgba(0,0,0,.35)]" role="listbox" aria-label="Commands">
            {slash.map((c, i) => (
              <button
                key={c.name}
                role="option"
                aria-selected={i === slashIndex}
                onMouseEnter={() => setSlashIndex(i)}
                onClick={() => pick(c.name)}
                className={`flex w-full items-center gap-3 px-3.5 py-2 text-left text-[13px] ${i === slashIndex ? "bg-ink" : ""}`}
              >
                <c.icon size={14} className="text-amber" />
                <span className="mono text-fg">/{c.name}</span>
                <span className="truncate text-[12px] text-fg-3">{c.hint}</span>
              </button>
            ))}
          </div>
        )}
        <div className="rounded-[16px] border border-line-strong bg-ink px-3.5 pb-2.5 pt-3 transition focus-within:border-[color-mix(in_srgb,var(--amber)_55%,var(--line-strong))]">
          {(task || autopilot) && (
            <div className="mb-2 flex gap-1.5">
              {task && <Toggle on onClick={() => setTask(false)} icon={<ListChecks size={12} />} label="Task · plan, check, retry" />}
              {autopilot && <Toggle on onClick={() => setAutopilot(false)} icon={<ShieldCheck size={12} />} label="Autopilot" />}
            </div>
          )}
          <textarea
            ref={field}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSlashIndex(0);
            }}
            onKeyDown={(e) => {
              if (slash.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                setSlashIndex((i) => (i + (e.key === "ArrowDown" ? 1 : slash.length - 1)) % slash.length);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (slash.length) pick(slash[slashIndex]!.name);
                else void send();
              }
            }}
            rows={1}
            {...({ writingsuggestions: "false" } as object)}
            placeholder={run ? (working ? "Add to the queue — it's answered when this turn ends…" : "Reply, or ask for the next thing…") : "Message ShuaCrew… just say what you want done  ( / for commands )"}
            className="block max-h-[240px] w-full resize-none bg-transparent text-[14px] leading-relaxed text-fg outline-none placeholder:text-fg-3"
            aria-label="Message"
          />
          <div className="mt-2 flex items-center gap-1.5">
            {!run && (
              <>
                <Toggle on={autopilot} onClick={() => setAutopilot((v) => !v)} icon={<ShieldCheck size={12} />} label={autopilot ? "Autopilot" : "Supervised"} title="Supervised asks before risky actions; Autopilot approves what policy would ask about. Deny rules always apply." />
                <Toggle on={task} onClick={() => setTask((v) => !v)} icon={<ListChecks size={12} />} label="Task" title="Plan into steps, validate each, retry failures, checkpoint as it goes" />
              </>
            )}
            {run?.worktree && (
              <span className="mono flex items-center gap-1 text-[11.5px] text-fg-3" title={run.worktree.path}>
                <GitBranch size={12} /> {run.worktree.branch}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {error && <span className={`text-[12px] ${/^(Learned|Scheduled)/.test(error) ? "text-ok" : "text-bad"}`}>{error}</span>}
              {working && !text.trim() && run ? (
                <button onClick={() => void cancelRun(run.id)} className="grid h-8 w-8 place-items-center rounded-full bg-raised text-fg hover:bg-line-strong" title="Stop" aria-label="Stop">
                  <CircleStop size={15} />
                </button>
              ) : (
                <button
                  onClick={() => void send()}
                  disabled={!text.trim() || busy}
                  className="grid h-8 w-8 place-items-center rounded-full bg-amber text-[#1a1204] transition hover:brightness-110 disabled:bg-raised disabled:text-fg-3"
                  title={working ? "Queue (↵)" : "Send (↵)"}
                  aria-label="Send"
                >
                  <ArrowUp size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
        {!run && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1.5 text-[12px] text-fg-3">
            {isMac() ? (
              <button onClick={() => void chooseFolder()} className="flex items-center gap-1.5 hover:text-fg" title={repo || "Runs in ShuaCrew's own workspace"}>
                <Folder size={12} /> {repo ? repo.split("/").pop() : "default workspace"}
              </button>
            ) : (
              <label className="flex items-center gap-1.5">
                <Folder size={12} />
                <input list="composer-repos" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="default workspace" className="mono w-56 bg-transparent text-[11.5px] text-fg outline-none placeholder:text-fg-3" />
                <datalist id="composer-repos">
                  {recent.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </label>
            )}
            {repo && (
              <button onClick={() => setRepo("")} className="hover:text-fg" aria-label="Use the default workspace">
                ×
              </button>
            )}
            <span className="ml-auto flex items-center gap-3">
              <Select
                value={runtime}
                onChange={(v) => {
                  setRuntime(v);
                  setModel("");
                }}
                options={[{ value: "", label: "Auto agent" }, ...runtimes.map((r) => ({ value: r.id, label: friendly(r) + (r.limitedUntil ? " · limited" : "") }))]}
              />
              <Select value={model} onChange={setModel} options={[{ value: "", label: "auto model" }, ...(chosen?.models ?? []).map((m) => ({ value: m.id, label: m.label }))]} />
              <Select value={effort} onChange={setEffort} options={[{ value: "", label: "auto effort" }, ...EFFORTS.map((e) => ({ value: e, label: e }))]} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, icon, label, title }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`flex h-6 items-center gap-1 rounded-full border px-2 text-[11.5px] transition ${on ? "border-[color-mix(in_srgb,var(--amber)_50%,transparent)] bg-[var(--amber-soft)] text-amber" : "border-line-strong text-fg-3 hover:text-fg-2"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="cursor-pointer appearance-none bg-transparent text-[12px] text-fg-3 outline-none hover:text-fg">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── changes panel ───────────────────────────────────────────────────────────────────────────

function ChangesPanel({ id }: { id: string }) {
  const run = useLive((s) => s.crew.runs[id]);
  if (!run) return null;
  const tokens = run.usage.inputTokens + run.usage.outputTokens;
  return (
    <aside className="flex min-h-0 flex-col rounded-[14px] border border-line bg-panel max-[1150px]:hidden" aria-label="Changes">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="flex items-center gap-1.5 rounded-[7px] bg-[var(--amber-soft)] px-2 py-1 text-[12.5px] font-medium text-amber">
          <FileDiff size={13} /> Changes
        </span>
        {run.status === "reviewing" && (
          <Link to="/review/$id" params={{ id }} className="ml-auto rounded-[7px] bg-amber px-2.5 py-1 text-[12px] font-semibold text-[#1a1204] hover:brightness-110">
            Review & merge
          </Link>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <Section title={`${run.files.length} file${run.files.length === 1 ? "" : "s"} changed`}>
          {run.files.length === 0 && <Empty>Nothing changed yet</Empty>}
          {run.files.map((f) => (
            <Link key={f} to="/review/$id" params={{ id }} className="flex items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12px] hover:bg-raised" title={f}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
              <span className="mono min-w-0 flex-1 truncate [direction:rtl] text-left">{f}</span>
              <span className="text-[11px] text-fg-3">M</span>
            </Link>
          ))}
        </Section>
        <Section title="Checks">
          {run.checks.length === 0 && <Empty>No checks run yet</Empty>}
          {run.checks.map((c) => (
            <div key={c.seq} className="flex items-center gap-2 px-1.5 py-1 text-[12px]">
              <StatusGlyph tone={c.passed ? "ok" : "bad"} size={7} />
              <span className="mono truncate text-fg-2">{c.command}</span>
            </div>
          ))}
        </Section>
        {run.subagents.length > 0 && (
          <Section title="Agents">
            {run.subagents.map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-1.5 py-1 text-[12px]">
                <StatusGlyph tone={!a.done ? "live" : a.ok ? "ok" : "bad"} size={7} />
                <span className="font-medium">{a.name}</span>
                <span className="truncate text-fg-3">{a.task}</span>
              </div>
            ))}
          </Section>
        )}
        <Section title="Session">
          <Line label="Agent" value={`${run.runtime}${run.model ? ` · ${run.model}` : ""}`} />
          <Line label="Status" value={run.status.replace("_", " ")} />
          <Line label="Turns" value={String(run.turns)} />
          <Line label="Tokens" value={formatTokens(tokens)} />
          <Line label="Where" value={run.worktree?.branch ?? run.repo ?? "default workspace"} />
        </Section>
        <Link to="/runs/$id" params={{ id }} className="mt-2 inline-block text-[12px] text-fg-3 hover:text-amber">
          Inspect timeline, graph and terminal →
        </Link>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-3">{title}</div>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <div className="px-1.5 text-[12px] text-fg-3">{children}</div>;

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1.5 py-0.5 text-[12px]">
      <span className="text-fg-3">{label}</span>
      <span className="mono truncate text-fg-2">{value}</span>
    </div>
  );
}
