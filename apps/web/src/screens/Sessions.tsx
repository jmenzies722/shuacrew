import "./session-chat.css";
import { Recommendations } from "../components/Recommendations";
import "../components/chat-composer.css";
import { plain } from "../lib/plain";
import type { RunView } from "@shuacrew/core/projections";
import * as Dialog from "@radix-ui/react-dialog";
import { Button, Chip, StatusGlyph, StatusPill, formatTokens } from "@shuacrew/ui";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowUp,
  Bug,
  CheckCircle2,
  ChevronDown,
  CircleStop,
  Ellipsis,
  FileDiff,
  FileText as FileIcon,
  Folder,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  GitBranch,
  ListChecks, Swords,
  Plus,
  Search,
  ShieldCheck,
  BookOpen,
  Cable,
  Sparkles,
  SquareTerminal,
  Telescope,
  Users,
  X,
  Zap,
  History,
  RefreshCw,
  Sunrise,
  Trash2,
  ArrowUpRight,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Thread } from "../components/Thread";
import { api, cancelRun, followUp, launchRun, launchTask } from "../lib/api";
import { conversation } from "../lib/conversation";
import { MessageQueue } from "../components/MessageQueue";
import { shouldSend } from "../lib/composer-keys";
import { canRemoveSession, removeSession, sessionRemovalCopy } from "../lib/session-removal";
import { pauseClock, scopeRuns, recentWork } from "../lib/crew";
import { useLive } from "../lib/live";
import { Dictation } from "../components/Dictation";
import { ReplayBar } from "../components/Replay";
import { isMac, pickFolder } from "../lib/native";
import { size as fileSize, upload, withAttachments, type Attachment } from "../lib/attachments";
import { Glyph } from "../lib/glyphs";
import { DEFAULT_WORKSPACE, getWorkspace, saveWorkspace } from "../lib/workspace-prefs";
import { getPower, savePower, usePower, type Preset } from "../lib/power";
import { parseChatAction } from "../lib/chat-actions";
import { groupSessions, sessionStatus } from "../lib/session-list";

interface RuntimeInfo {
  id: string;
  label: string;
  authMode: string;
  models: Array<{ id: string; label: string; tier: string; unavailable?: string }>;
  limitedUntil: number | null;
}

const TerminalDrawer = lazy(() => import("../components/TerminalDrawer"));

/** The terminal drawer under a conversation: ⌃` or the header button; height is remembered. */
function useTerminal() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("keydown", onKey);
    window.addEventListener("shuacrew:terminal", onToggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("shuacrew:terminal", onToggle);
    };
  }, []);
  return [open, setOpen] as const;
}

function Drawer({ run, onClose }: { run?: string; onClose: () => void }) {
  const [height, setHeight] = useState(() => Number(localStorage.getItem("shuacrew.termHeight")) || 300);
  const drag = (e: React.PointerEvent) => {
    const start = e.clientY;
    const from = height;
    const move = (m: PointerEvent) => setHeight(Math.max(140, Math.min(window.innerHeight * 0.75, from + start - m.clientY)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setHeight((h) => (localStorage.setItem("shuacrew.termHeight", String(Math.round(h))), h));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="relative shrink-0 border-t border-line" style={{ height }}>
      <div onPointerDown={drag} className="absolute -top-1 left-0 right-0 z-10 h-2 cursor-row-resize" aria-hidden />
      <Suspense fallback={<div className="grid h-full place-items-center bg-[#0a0c0f] text-[12px] text-[#7b8494]">Starting terminal…</div>}>
        <TerminalDrawer scope={{ run }} onClose={onClose} />
      </Suspense>
    </div>
  );
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
  const [sessionsCollapsed, setSessionsCollapsed] = useState(() => {
    const saved = localStorage.getItem("shuacrew.sessionsCollapsed");
    return saved === null ? window.matchMedia("(max-width: 760px)").matches : saved === "true";
  });
  const toggleSessions = () => setSessionsCollapsed(previous => {
    localStorage.setItem("shuacrew.sessionsCollapsed", String(!previous));
    return !previous;
  });
  const [changes, setChanges] = useState(false);
  useEffect(() => {
    const show = () => setChanges(true);
    window.addEventListener("shuacrew:open-file", show);
    return () => window.removeEventListener("shuacrew:open-file", show);
  }, []);
  // A link to a session that's been archived (or never existed) opens a new one instead of hanging.
  const known = useLive((s) => (params.id ? Boolean(s.crew.runs[params.id]) : true));
  const loaded = useLive((s) => s.crew.head > 0);
  const id = params.id && (known || !loaded) ? params.id : undefined;
  return (
    <div className={`sessions-layout ${id ? "is-thread" : "is-fresh"} ${id && changes ? "has-changes" : ""} ${sessionsCollapsed ? "sessions-collapsed" : ""}`}>
      <SessionsPanel selected={id} collapsed={sessionsCollapsed} onToggle={toggleSessions} />
      {id ? <Chat id={id} changes={changes} onToggleChanges={() => setChanges((v) => !v)} /> : <NewSession />}
      {id && changes && <ChangesPanel id={id} />}
    </div>
  );
}

// ── sessions panel ──────────────────────────────────────────────────────────────────────────

function SessionsPanel({ selected, collapsed, onToggle }: { selected?: string; collapsed: boolean; onToggle: () => void }) {
  const all = useLive((s) => s.crew.runs);
  const scope = useLive((s) => s.scope);
  const runs = useMemo(() => scopeRuns(all, scope), [all, scope]);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupSessions(Object.values(runs), query), [runs, query]);

  return (
    <aside className={`sessions-pane ${collapsed ? "is-collapsed" : ""}`} aria-label="Sessions">
      <div className="sessions-pane-heading">
        {!collapsed && <h2>Sessions</h2>}
        <button className="sessions-pane-toggle" onClick={onToggle} aria-label={collapsed ? "Expand sessions" : "Collapse sessions"} aria-expanded={!collapsed} aria-controls="session-history" title={collapsed ? "Expand sessions" : "Collapse sessions"}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>
      <button onClick={() => navigate({ to: "/" })} className="sessions-new-chat" aria-label="New chat" title="New chat">
        <Plus size={16} />{!collapsed && <span>New chat</span>}
      </button>
      <div id="session-history" className="sessions-history" hidden={collapsed}>
        <label className="sessions-search">
          <Search size={14} />
          <input aria-label="Search sessions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={13} /></button>}
        </label>
        <div className="sessions-list">
          {!groups.length && <p className="sessions-empty">{query ? "No matching sessions." : "Your conversations will appear here."}</p>}
          {groups.map(group => <Group key={group.title} title={group.title} runs={group.runs} selected={selected} />)}
        </div>
      </div>
    </aside>
  );
}

function Group({ title, runs, selected }: { title?: string; runs: RunView[]; selected?: string }) {
  if (!runs.length) return null;
  return (
    <div>
      {title && (
        <h3 className="sessions-group-title">{title}</h3>
      )}
      {runs.map((run) => (
        <SessionCard key={run.id} run={run} selected={run.id === selected} />
      ))}
    </div>
  );
}

function SessionRemovalConfirmation({ title, error, removing, allowed, onConfirm, returnFocus }: { title: string; error: string; removing: boolean; allowed: boolean; onConfirm: () => void; returnFocus?: () => void }) {
  return <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm" /><Dialog.Content onCloseAutoFocus={event => { if (returnFocus) { event.preventDefault(); returnFocus(); } }} className="fixed left-1/2 top-1/2 z-[81] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-panel p-6 shadow-2xl">
    <Dialog.Title className="text-lg font-semibold text-fg">{sessionRemovalCopy.title}</Dialog.Title>
    <Dialog.Description className="mt-3 text-sm leading-relaxed text-fg-2">“{title}” — {sessionRemovalCopy.description}</Dialog.Description>
    {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
    <div className="mt-5 flex justify-end gap-3"><Dialog.Close asChild><Button disabled={removing}>Cancel</Button></Dialog.Close><Button disabled={removing || !allowed} onClick={onConfirm}>{removing ? "Deleting…" : "Delete session"}</Button></div>
  </Dialog.Content></Dialog.Portal>;
}

function SessionCard({ run, selected }: { run: RunView; selected: boolean }) {
  const [removing, setRemoving] = useState(false), [removeError, setRemoveError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const navigate = useNavigate();
  const remove = async () => {
    setRemoving(true); setRemoveError("");
    try { await removeSession(run.id, run.status); setConfirmRemove(false); if (selected) await navigate({ to: "/" }); }
    catch (error) { setRemoveError((error as Error).message); }
    finally { setRemoving(false); }
  };
  const limited = useLive((s) => s.crew.limited);
  const pause = pauseClock(run, limited);
  const status = sessionStatus(run, pause);
  return (
    <Dialog.Root open={confirmRemove} onOpenChange={open => { if (!removing) { setConfirmRemove(open); setRemoveError(""); } }}><div className="session-sidebar-row"><Link
      to="/sessions/$id"
      params={{ id: run.id }}
      className={`session-list-link ${selected ? "is-selected" : ""}`}
      aria-current={selected ? "page" : undefined}
      title={run.title || run.ask || "Untitled chat"}
    >
      <span className="session-list-title">{run.title || run.ask || "Untitled chat"}</span>
      <span className="session-list-meta"><span>{folderOf(run)}</span><time dateTime={new Date(run.updatedAt).toISOString()}>{clock(run.updatedAt)}</time></span>
      <span className="session-list-status" data-tone={status.tone}><i aria-hidden="true" />{status.label}</span>
    </Link><Dialog.Trigger asChild><button className="session-remove" aria-label={`Delete session: ${run.title}`} title={canRemoveSession(run.status) ? "Delete session from chat list" : "Stop this session before deleting it"} disabled={removing || !canRemoveSession(run.status)}><Trash2 size={14} /></button></Dialog.Trigger></div>
      <SessionRemovalConfirmation title={run.title} error={removeError} removing={removing} allowed={canRemoveSession(run.status)} onConfirm={() => void remove()} />
    </Dialog.Root>
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
  const [scrub, setScrub] = useState<number | null>(null);
  const [replay, setReplay] = useState(false);
  useEffect(() => (setScrub(null), setReplay(false)), [id]);
  const seqs = useMemo(() => (events ?? []).map((e) => e.seq), [events]);
  const items = useMemo(() => conversation(events ?? [], scrub ?? Number.POSITIVE_INFINITY), [events, scrub]);
  const [terminal, setTerminal] = useTerminal();
  if (!run) return <section className="flex items-center justify-center rounded-[14px] border border-line bg-panel text-fg-3">Loading…</section>;
  const working = WORKING.has(run.status) && !run.pendingApprovals.length;

  return (
    <section className="sheet flex min-h-0 flex-col" aria-label="Conversation">
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <h1 className="min-w-0 truncate text-[14px] font-semibold">{run.title}</h1>
        <StatusPill status={run.status} />
        {run.permission === "auto" && (
          <span className="shrink-0 text-[11.5px] text-amber" title="This session approves what policy would ask about. Deny rules still apply.">
            Autopilot
          </span>
        )}
        {run.lessons.length > 0 && (
          <Link to="/memory" className="shrink-0 text-[11.5px] text-fg-2 hover:text-amber" title="Lessons this session was given">
            {run.lessons.length === 1 ? "1 lesson" : `${run.lessons.length} lessons`}
          </Link>
        )}
        {(run.status === "paused" || (run.status === "queued" && run.statusReason?.startsWith("moved"))) && (
          <span className="truncate text-[11.5px] text-amber" title={run.statusReason}>
            {run.statusReason}
          </span>
        )}
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
          {seqs.length > 1 && (
            <IconButton title="Replay this session" onClick={() => (setReplay((v) => !v), setScrub(null))} active={replay}>
              <History size={15} />
            </IconButton>
          )}
          <IconButton title="Terminal (⌃`)" onClick={() => setTerminal((v) => !v)} active={terminal}>
            <SquareTerminal size={15} />
          </IconButton>
          <IconButton title={changes ? "Hide changes" : "Show changes"} onClick={onToggleChanges} active={changes}>
            <FileDiff size={15} />
          </IconButton>
          <SessionMenu run={run} working={working} />
        </div>
      </header>
      <Thread items={items} working={working && scrub === null} run={run} />
      {!replay && !run.labels.includes("buddy") && !run.labels.includes("crew-room") && <div className="shrink-0 px-4"><div className="mx-auto max-w-[var(--chat-width,820px)]"><Recommendations ask={run.ask} /></div></div>}
      {!replay && <ReviewBar run={run} />}
      {!replay && !run.labels.includes("crew-room") && <MessageQueue key={run.id} run={run.id} events={events ?? []} />}
      {replay ? (
        <div className="shrink-0 px-4 pb-3 pt-1">
          <div className="mx-auto max-w-[var(--chat-width,820px)]">
            <ReplayBar events={events ?? []} at={scrub} onChange={setScrub} onClose={() => (setReplay(false), setScrub(null))} title={run.title} />
          </div>
        </div>
      ) : run.labels.includes("crew-room") ? (
        <div className="shrink-0 px-4 pb-4 text-sm text-fg-3">This is a crew-room source conversation. <Link to="/rooms/$id" params={{ id: run.labels.find(label => label.startsWith("room:"))?.slice(5) ?? "" }}>Continue in the crew room →</Link></div>
      ) : (
        <Composer key={run.id} run={run} />
      )}
      {terminal && <Drawer run={run.id} onClose={() => setTerminal(false)} />}
    </section>
  );
}

/** The session's "…": inspect it in depth, or put it away. */
function SessionMenu({ run, working }: { run: RunView; working: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false), [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const archive = async () => {
    if (removing) return;
    setRemoving(true); setError("");
    try {
      await removeSession(run.id, run.status);
      setConfirmRemove(false);
      setOpen(false);
      navigate({ to: "/" });
    } catch (e) {
      setError((e as Error).message);
    } finally { setRemoving(false); }
  };
  return (
    <Dialog.Root open={confirmRemove} onOpenChange={next => { if (!removing) { setConfirmRemove(next); setError(""); } }}><div ref={menu} className="relative">
      <IconButton title="More" onClick={() => setOpen((v) => !v)} active={open}>
        <Ellipsis size={15} />
      </IconButton>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-[10px] border border-line-strong bg-raised py-1 text-[12.5px] shadow-[0_18px_50px_rgba(0,0,0,.35)]" role="menu">
          <Link to="/runs/$id" params={{ id: run.id }} role="menuitem" className="block px-3 py-1.5 hover:bg-ink">
            Inspect — timeline, graph, terminal, cost
          </Link>
          {run.status === "reviewing" && (
            <Link to="/review/$id" params={{ id: run.id }} role="menuitem" className="block px-3 py-1.5 hover:bg-ink">
              Review & merge
            </Link>
          )}
          <button role="menuitem" onClick={() => void navigator.clipboard?.writeText(run.id).then(() => setOpen(false))} className="block w-full px-3 py-1.5 text-left hover:bg-ink">
            Copy session id
          </button>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" disabled={!canRemoveSession(run.status)} onClick={() => { setOpen(false); setConfirmRemove(true); }} className="block w-full px-3 py-1.5 text-left text-bad hover:bg-ink disabled:text-fg-3" title={!canRemoveSession(run.status) ? "Stop it first" : undefined}>
            Delete session…
          </button>
          {error && <div className="px-3 pb-1.5 text-[11.5px] text-bad">{error}</div>}
        </div>
      )}
    </div><SessionRemovalConfirmation title={run.title} error={error} removing={removing} allowed={canRemoveSession(run.status)} onConfirm={() => void archive()} returnFocus={() => menu.current?.querySelector("button")?.focus()} /></Dialog.Root>
  );
}

/**
 * The end of the loop, in the conversation: when a session has changes ready, merge them, open a
 * PR, ask for changes, or reject — and teach it why. Shows what happened after, too.
 */
function ReviewBar({ run }: { run: RunView }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [lesson, setLesson] = useState("");
  const review = run.review;
  if (!run.worktree) return null;
  const landed = review?.landed;
  const ready = run.status === "reviewing" && !review?.decided;
  if (!ready && !landed && !review?.pr && review?.queued === undefined && !review?.failed) return null;
  const passed = run.checks.length ? run.checks[run.checks.length - 1]!.passed : undefined;
  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="mx-auto w-full max-w-[var(--chat-width,820px)] px-4">
      <div className={`review-bar ${landed ? "is-landed" : review?.failed ? "is-failed" : ""}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="review-dot" />
          <span className="text-[13px] font-semibold text-fg">
            {landed ? `Merged into ${run.worktree.base}` : review?.queued !== undefined ? "Merging…" : review?.failed ? "Merge didn't land" : "Ready for review"}
          </span>
          <span className="text-[12px] text-fg-3">
            {run.files.length} file{run.files.length === 1 ? "" : "s"}
            {passed !== undefined && <span className={passed ? "text-ok" : "text-bad"}> · checks {passed ? "passed" : "failed"}</span>}
            {landed && <span className="mono"> · {landed.slice(0, 7)}</span>}
          </span>
          {review?.pr && (
            <a href={review.pr} target="_blank" rel="noreferrer" className="issue-chip">
              PR #{review.pr.split("/").pop()}
            </a>
          )}
        </div>
        {review?.failed && <div className="mt-1.5 text-[12px] text-bad">{review.failed}</div>}
        {error && <div className="mt-1.5 text-[12px] text-bad">{error}</div>}
        {rejecting ? (
          <div className="mt-2.5 flex gap-2">
            <input
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
              autoFocus
              placeholder="What should it learn? (optional) — e.g. never change public APIs without asking"
              className="h-8 min-w-0 flex-1 rounded-[8px] border border-line-strong bg-ink px-2.5 text-[12.5px] outline-none focus:border-amber"
            />
            <Button size="s" variant="danger" onClick={() => void act("reject", () => api(`/api/runs/${run.id}/review`, { body: { approve: false, lesson } }).then(() => setRejecting(false)))}>
              Reject
            </Button>
            <Button size="s" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          (ready || review?.failed) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Button size="s" variant="primary" disabled={busy !== ""} onClick={() => void act("merge", () => api(`/api/runs/${run.id}/review`, { body: { approve: true } }))}>
                {busy === "merge" ? "Merging…" : `Merge into ${run.worktree.base}`}
              </Button>
              {!review?.pr && (
                <Button size="s" disabled={busy !== ""} onClick={() => void act("pr", () => api(`/api/runs/${run.id}/pr`, { body: {} }))} title="Push this branch and open a GitHub pull request (never force-pushes)">
                  {busy === "pr" ? "Opening PR…" : "Push & open PR"}
                </Button>
              )}
              <Link to="/review/$id" params={{ id: run.id }} className="inline-flex h-7 items-center rounded-[7px] px-2.5 text-[12px] text-fg-2 hover:bg-raised hover:text-fg">
                Review diff
              </Link>
              <Button
                size="s"
                variant="ghost"
                onClick={() => window.dispatchEvent(new CustomEvent("shuacrew:insert", { detail: "Before I merge, please change: " }))}
              >
                Request changes
              </Button>
              <Button size="s" variant="ghost" onClick={() => setRejecting(true)}>
                Reject…
              </Button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

/** How full the agent's context is: a ring that turns amber, then red, as it fills. */
function ContextMeter({ used, limit }: { used?: number; limit?: number }) {
  if (!used || !limit) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const color = pct > 85 ? "var(--bad)" : pct > 65 ? "var(--amber)" : "var(--text-3)";
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] text-fg-3" title={`${formatTokens(used)} of ${formatTokens(limit)} context used`}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
        <circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="2" strokeDasharray={`${(pct / 100) * 34.6} 34.6`} transform="rotate(-90 7 7)" strokeLinecap="round" />
      </svg>
      <span className="mono">{pct}%</span>
    </span>
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
  const runs = useLive(s => s.crew.runs), scope = useLive(s => s.scope);
  const recent = useMemo(() => recentWork(runs, scope), [runs, scope]);
  const [terminal, setTerminal] = useTerminal();
  const [seed, setSeed] = useState<{ text: string; n: number }>({ text: "", n: 0 });
  const ideas = [
    { icon: CheckCircle2, label: "Review changes", text: "Review uncommitted changes in my personal projects under ~/Developer/projects and tell me what's risky" },
    { icon: Bug, label: "Fix a failing test", text: "Find a failing test in one of my projects and fix it" },
    { icon: Telescope, label: "Catch me up", text: "Summarise what changed in my repos today" },
    { icon: Sparkles, label: "Plan what’s next", text: "Look at my most recent project and suggest the next three things to build" },
  ];
  return (
    <section className="sheet hero-sheet home-workbench flex min-h-0 min-w-0 flex-col" aria-label="New session">
      <div className="hero min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="hero-stack">
          <div className="hero-core">
          <NeedsYou />
          <div className="home-heading">
            <span className="home-eyebrow"><Sparkles size={14} aria-hidden /> YOUR WORKSPACE</span>
            <h1 className="hero-title">What’s next?</h1>
            <p className="hero-sub">Start something new, or pick up where you left off.</p>
          </div>
          <Composer seed={seed} hero />
          <div className="hero-ideas stagger">
            {ideas.map(({ icon: Icon, text, label }) => (
              <button key={text} onClick={() => setSeed((s) => ({ text, n: s.n + 1 }))} className="hero-idea" title={text}>
                <i className="hero-idea-icon"><Icon size={14} /></i>
                <span>{label}</span>
                <ArrowUpRight size={14} className="hero-idea-go" aria-hidden />
              </button>
            ))}
          </div>
          </div>
          <section className="home-recent" aria-label="Recent work">
            <div className="home-section-heading"><h2>Pick up where you left off</h2><span>{scope ? scope.split("/").filter(Boolean).pop() : "Recent work"}</span></div>
            {recent.length ? recent.map(run => (
              <Link key={run.id} to="/sessions/$id" params={{ id: run.id }} className="home-recent-row">
                <History size={16} aria-hidden />
                <span className="home-recent-copy"><strong>{run.title}</strong><small>{folderOf(run)} · {FRIENDLY[run.runtime] ?? run.runtime}</small></span>
                <StatusPill status={run.status} />
                <ArrowUpRight size={15} aria-hidden />
              </Link>
            )) : <p className="home-recent-empty">Your sessions will appear here as you work.</p>}
          </section>
          <TodayBriefing />
          <GettingStarted />
        </div>
      </div>
      {terminal && <Drawer onClose={() => setTerminal(false)} />}
    </section>
  );
}

// ── composer ────────────────────────────────────────────────────────────────────────────────

const COMMANDS = [
  { name: "agent", hint: "/agent Nova as Security reviewer: how they work — add a crew member", icon: Users },
  { name: "agents", hint: "List your crew", icon: Users },
  { name: "room", hint: "/room Launch week with @rhea @eli — open a crew room", icon: Users },
  { name: "effort", hint: "/effort high — how hard this session thinks", icon: Zap },
  { name: "budget", hint: "/budget 500k — daily token budget (off to clear)", icon: Zap },
  { name: "flow", hint: "Toggle Flow mode (⌘⇧F)", icon: Zap },
  { name: "task", hint: "Plan it into steps, check each one, retry what fails", icon: ListChecks },
  { name: "learn", hint: "Teach a lesson every future run is told", icon: Sparkles },
  { name: "schedule", hint: "/schedule weekdays 9am: triage new issues", icon: Zap },
  { name: "autopilot", hint: "Approve what policy would ask about (deny rules still apply)", icon: ShieldCheck },
  { name: "skill", hint: "/skill pdf summarise this — use an installed skill this turn", icon: BookOpen },
  { name: "mcp", hint: "/mcp github open my PRs — use a connected server this turn", icon: Cable },
];
const EFFORTS = ["low", "medium", "high", "max"];
const RECENT = "shuacrew.recentRepos";

let runtimeCache: Promise<RuntimeInfo[]> | null = null;
const loadRuntimes = () => (runtimeCache ??= api<RuntimeInfo[]>("/api/runtimes").catch(() => ((runtimeCache = null), [])));

const presetTitle = (p: Preset) => [p.runtime || "Auto agent", p.model || "auto model", p.effort || "auto effort", p.autopilot ? "Autopilot" : "Supervised", p.task ? "Task" : ""].filter(Boolean).join(" · ");

function Composer({ run, seed, hero }: { run?: RunView; seed?: { text: string; n: number }; hero?: boolean }) {
  const navigate = useNavigate();
  const sendShortcut = useLive((s) => s.appearance.sendShortcut);
  const spellcheck = useLive((s) => s.appearance.spellcheck);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // A new session starts from Settings → Session defaults; a follow-up inside a run never does.
  const defaults = run ? DEFAULT_WORKSPACE : getWorkspace();
  const [task, setTask] = useState(defaults.task);
  // Race: the same task to Claude and Codex at once, each in its own branch — keep the better one.
  const [race, setRace] = useState(false);
  const [autopilot, setAutopilot] = useState(defaults.autopilot);
  const [repo, setRepo] = useState("");
  const [runtime, setRuntime] = useState(run?.runtime ?? defaults.runtime);
  const [model, setModel] = useState(run?.model ?? defaults.model);
  const [effort, setEffort] = useState<string>(run?.effort ?? defaults.effort);
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  useEffect(() => {
    if (run) { setRuntime(run.runtime); setModel(run.model ?? ""); setEffort(run.effort ?? ""); }
  }, [run?.id, run?.runtime, run?.model, run?.effort]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [commandsDismissed, setCommandsDismissed] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const commandList = useRef<HTMLDivElement>(null);
  const [skills, setSkills] = useState<Array<{ name: string; status: string }>>([]);
  const [servers, setServers] = useState<Array<{ name: string }>>([]);
  const [files, setFiles] = useState<Array<{ key: string; name: string; size: number; preview?: string; done?: Attachment; failed?: string }>>([]);
  const [dropping, setDropping] = useState(false);
  const [media, setMedia] = useState<{ voice: boolean; video: boolean; missing: string[] }>({ voice: false, video: false, missing: [] });
  const [member, setMember] = useState("");
  const [suggested, setSuggested] = useState("");
  const members = useLive((s) => s.crew.members);
  const power = usePower();
  const picker = useRef<HTMLInputElement>(null);
  const uploading = files.some((f) => !f.done && !f.failed);

  /** Upload as soon as a file arrives, so sending is instant. */
  const attach = (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      setFiles((f) => [...f, { key, name: file.name || "pasted image", size: file.size, preview }]);
      upload(file)
        .then((done) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, done } : x))))
        .catch((e: Error) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, failed: e.message } : x))));
    }
    field.current?.focus();
  };
  // Drop files anywhere on the window.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
    const enter = (e: DragEvent) => hasFiles(e) && (depth++, setDropping(true));
    const leave = (e: DragEvent) => hasFiles(e) && --depth <= 0 && ((depth = 0), setDropping(false));
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDropping(false);
      if (e.dataTransfer?.files.length) attach(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);
  const field = useRef<HTMLTextAreaElement>(null);
  const working = run ? WORKING.has(run.status) : false;

  useEffect(() => {
    void loadRuntimes().then((list) => {
      setRuntimes(list);
      // A saved default agent/model that isn't available any more falls back to Auto rather than failing the send.
      if (!run) setRuntime((r) => (r && !list.some((x) => x.id === r) ? "" : r));
      if (!run) setModel((m) => (m && !list.some((x) => x.models.some((mm) => mm.id === m && !mm.unavailable)) ? "" : m));
    });
    void api<{ skills: Array<{ name: string; status: string }> }>("/api/memory").then((m) => setSkills(m.skills.filter((s) => s.status === "accepted"))).catch(() => undefined);
    void api<Array<{ name: string }>>("/api/mcp").then(setServers).catch(() => undefined);
    void api<{ voice: boolean; video: boolean; missing: string[] }>("/api/media").then(setMedia).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (seed?.text) {
      setText(seed.text);
      field.current?.focus();
    }
  }, [seed?.n]);
  // "Send to chat" from the terminal drops the selection into the message.
  useEffect(() => {
    const insert = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      setText((t) => (t ? `${t.trimEnd()}\n\n${text}` : text));
      field.current?.focus();
    };
    window.addEventListener("shuacrew:insert", insert);
    return () => window.removeEventListener("shuacrew:insert", insert);
  }, []);
  // ⌘N and "New Run…" land here.
  useEffect(() => {
    const focus = (e?: Event) => {
      const detail = e instanceof CustomEvent && typeof e.detail === "string" ? e.detail : "";
      if (detail) setText(detail);
      field.current?.focus();
    };
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

  // A new session: suggest the crew member whose triggers match what you're asking.
  useEffect(() => {
    if (run || member || text.trim().length < 12 || text.startsWith("/") || !Object.keys(members).length) return setSuggested("");
    const t = setTimeout(() => {
      void api<{ member: string | null }>(`/api/crew/route?ask=${encodeURIComponent(text)}`)
        .then((r) => setSuggested(r.member ?? ""))
        .catch(() => setSuggested(""));
    }, 350);
    return () => clearTimeout(t);
  }, [text, run, member, members]);

  const slashPrefix = /^\/(\w*)$/.exec(text.trim());
  const mention = !run ? /^@(\w*)$/.exec(text.trim()) : null;
  const named = /^\/(skill|mcp)\s+(\S*)$/.exec(text);
  const candidates = mention
    ? Object.values(members)
        .filter((m) => m.name.toLowerCase().startsWith(mention[1]!.toLowerCase()) || m.role.toLowerCase().startsWith(mention[1]!.toLowerCase()))
        .map((m) => ({ kind: "member" as const, name: m.id, label: `@${m.name}`, hint: m.role, icon: Users }))
    : slashPrefix && !text.includes(" ")
    ? [
        ...COMMANDS.filter((c) => c.name.startsWith(slashPrefix[1]!)).map((c) => ({ kind: "cmd" as const, name: c.name, hint: c.hint, icon: c.icon })),
        ...power.snippets.filter((sn) => sn.name.startsWith(slashPrefix[1]!)).map((sn) => ({ kind: "snippet" as const, name: sn.name, hint: sn.text, icon: Zap })),
      ]
    : named?.[1] === "skill"
      ? skills.filter((s) => s.name.toLowerCase().startsWith(named[2]!.toLowerCase())).map((s) => ({ kind: "skill" as const, name: s.name, hint: "Use this skill on the next message", icon: BookOpen }))
      : named?.[1] === "mcp"
        ? servers.filter((s) => s.name.toLowerCase().startsWith(named[2]!.toLowerCase())).map((s) => ({ kind: "mcp" as const, name: s.name, hint: "Use this server on the next message", icon: Cable }))
        : [];
  const slash = commandsDismissed ? [] : candidates;
  const activeCommand = Math.min(slashIndex, Math.max(0, slash.length - 1));
  useEffect(() => {
    const list = commandList.current;
    const row = list?.children[activeCommand] as HTMLElement | undefined;
    if (!list || !row) return;
    // Scroll only the tray, never the surrounding conversation or page.
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
  }, [activeCommand, slash.length]);
  const chosen = runtimes.find((r) => r.id === runtime);
  const recent = useMemo<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT) ?? "[]");
    } catch {
      return [];
    }
  }, []);

  /** A preset sets the whole launch at once; the prompt you already typed is kept after its prefix. */
  const applyPreset = (p: Preset) => {
    setRuntime(p.runtime && runtimes.some((r) => r.id === p.runtime) ? p.runtime : "");
    setModel(p.model); setEffort(p.effort); setAutopilot(p.autopilot); setTask(p.task);
    if (p.prefix) setText((t) => (t.startsWith(p.prefix) ? t : p.prefix + t));
    field.current?.focus();
  };
  const pick = (name: string, kind: "cmd" | "skill" | "mcp" | "member" | "snippet" = "cmd") => {
    if (kind === "snippet") setText(power.snippets.find((sn) => sn.name === name)?.text ?? "");
    else if (kind === "member") {
      setMember(name);
      setText("");
    } else if (kind === "skill") setText(`/skill ${name} `);
    else if (kind === "mcp") setText(`/mcp ${name} `);
    else if (name === "task") {
      setTask(true);
      setText("");
    } else if (name === "autopilot") {
      void cyclePermission();
      setText("");
    } else setText(`/${name} `);
    setSlashIndex(0);
    setCommandsDismissed(false);
    field.current?.focus();
  };

  const auto = run ? run.permission === "auto" : autopilot;
  const cyclePermission = async () => {
    if (!run) {
      setAutopilot((v) => !v);
      return;
    }
    await api(`/api/runs/${run.id}/permission`, { body: { mode: run.permission === "auto" ? "ask" : "auto" } });
  };

  const send = async () => {
    const ready = files.flatMap((f) => (f.done ? [f.done] : []));
    const message = withAttachments(text.trim(), ready).trim();
    if (!message || busy || uploading) return;
    setBusy(true);
    setError("");
    try {
      // Instant commands: done right here, no AI call.
      const action = parseChatAction(message);
      if (action) {
        if (action.kind === "error") { setError(action.message); return; }
        if (action.kind === "agent") {
          const m = await api<{ id: string; name: string; role: string }>("/api/crew/new", { body: action });
          setText(""); setError(`Added ${m.name} · ${m.role}. Talk to them with @${m.id}; turn on delegation in Crew to use them in rooms.`); return;
        }
        if (action.kind === "agents") {
          const list = Object.values(members);
          setError(list.length ? list.map((m) => `@${m.id} ${m.name} · ${m.role}${m.delegatable ? " · rooms" : ""}`).join("   ") : "No crew yet — try /agent Nova as Researcher");
          setText(""); return;
        }
        if (action.kind === "room") {
          const r = await api<{ id: string }>("/api/rooms", { body: { title: action.title, coordinator: action.members[0], members: action.members } });
          setText(""); void navigate({ to: "/rooms/$id", params: { id: r.id } }); return;
        }
        if (action.kind === "effort") { setEffort(action.value); setText(""); setError(`Effort for this session: ${action.value || "auto"}.`); return; }
        if (action.kind === "budget") { saveWorkspace({ dailyTokenBudget: action.tokens }); setText(""); setError(action.tokens ? `Daily budget set to ${action.tokens.toLocaleString()} tokens.` : "Daily budget off."); return; }
        if (action.kind === "flow") { savePower({ flow: !getPower().flow }); setText(""); return; }
      }
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
        const changed = runtime !== run.runtime || model !== (run.model ?? "") || effort !== (run.effort ?? "");
        await api(`/api/runs/${run.id}/followup`, {body:{text:message,...(changed ? {selection:{runtime:runtime || run.runtime,model:model || undefined,effort}} : {})}});
        setText("");
        setFiles([]);
        return;
      }
      const common = { repo: repo || undefined, runtime: runtime || undefined, model: model || undefined };
      if (race && !task) {
        const tag = `race:${Date.now().toString(36)}`, short = message.split("\n")[0]!.slice(0, 60);
        const [first] = await Promise.all((["claude", "codex"] as const).map((rt) => launchRun({ ask: message, repo: repo || undefined, runtime: rt, effort: effort || undefined, approveAll: auto, title: `Race · ${rt === "claude" ? "Claude" : "Codex"} · ${short}`, labels: [tag] })));
        setText(""); setFiles([]); setRace(false);
        navigate({ to: "/sessions/$id", params: { id: first!.id } });
        return;
      }
      const { id } = task
        ? await launchTask({ markdown: message.startsWith("#") ? message : `# ${message.split("\n")[0]}\n${message}`, ...common })
        : await launchRun({ ask: message, ...common, effort: effort || undefined, approveAll: auto, member: member || undefined });
      if (repo) localStorage.setItem(RECENT, JSON.stringify([repo, ...recent.filter((r) => r !== repo)].slice(0, 8)));
      setText("");
      setFiles([]);
      setTask(false);
      setMember("");
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
    <div className={hero ? "mt-7 min-w-0" : "shrink-0 px-4 pb-3 pt-1"}>
      <div className={`relative mx-auto min-w-0 ${hero ? "" : "max-w-[var(--chat-width,820px)]"}`}>
        {slash.length > 0 && (
          <section className="composer-commands" aria-label="Command suggestions">
            <header><span>Commands <small>{slash.length}</small></span><button onClick={() => { setCommandsDismissed(true); field.current?.focus(); }} aria-label="Dismiss commands">Esc <X size={12} /></button></header>
            <div ref={commandList} className="composer-command-list" id="session-commands" role="listbox" aria-label="Commands">
              {slash.map((c, i) => (
                <button key={`${c.kind}:${c.name}`} id={`session-command-${i}`} role="option" aria-selected={i === activeCommand}
                  tabIndex={-1} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setSlashIndex(i)} onClick={() => pick(c.name, c.kind)}>
                  <c.icon size={15} /><span><b>{"label" in c ? c.label : c.kind === "cmd" || c.kind === "snippet" ? `/${c.name}` : c.name}</b><small>{c.hint}</small></span>
                  {i === activeCommand && <kbd>↵</kbd>}
                </button>
              ))}
            </div>
          </section>
        )}
        {dropping && (
          <div className="drop-overlay" aria-hidden>
            <Paperclip size={22} />
            Drop to attach — the agent gets the file
          </div>
        )}
        {!run && power.presets.length > 0 && (
          <div className="preset-row" role="group" aria-label="Launch presets">
            {power.presets.map((p) => <button key={p.id} type="button" className="preset-chip" title={presetTitle(p)} onClick={() => applyPreset(p)}><Zap size={11} />{p.label}</button>)}
          </div>
        )}
        <div className={`composer-box chat-composer ${hero ? "is-hero" : ""}`}>
          {files.length > 0 && (
            <div className="mb-2.5 flex flex-wrap gap-2">
              {files.map((f) => (
                <div key={f.key} className={`attach-chip ${f.failed ? "is-failed" : ""}`} title={f.failed ?? f.name}>
                  {f.preview ? <img src={f.preview} alt="" className="attach-thumb" /> : <span className="attach-icon"><FileIcon size={15} /></span>}
                  <span className="min-w-0">
                    <span className="block max-w-[160px] truncate text-[12px] text-fg">{f.name}</span>
                    <span className="block text-[10.5px] text-fg-3">
                      {f.failed
                        ? "couldn't upload"
                        : !f.done
                          ? /\.(mov|mp4|m4v|mkv)$/i.test(f.name)
                            ? "reading the video…"
                            : /\.(m4a|mp3|wav|aac|ogg|webm|caf|aiff?)$/i.test(f.name)
                              ? "transcribing…"
                              : "uploading…"
                          : f.done.frames
                            ? `${f.done.frames} frames${f.done.duration ? ` · ${Math.floor(f.done.duration / 60)}:${String(f.done.duration % 60).padStart(2, "0")}` : ""}${f.done.transcript ? " · transcribed" : ""}`
                            : f.done.transcript
                              ? "transcribed"
                              : f.done.agentPath
                                ? "ready for the agent"
                                : fileSize(f.size)}
                    </span>
                  </span>
                  <button onClick={() => setFiles((all) => all.filter((x) => x.key !== f.key))} className="attach-x" aria-label={`Remove ${f.name}`}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {!run && (member || suggested) && (() => {
            const m = members[member || suggested];
            if (!m) return null;
            return (
              <div className="mb-2 flex items-center gap-2 text-[12px] text-fg-3">
                {member ? (
                  <span className="member-chip" style={{ "--member": m.color } as React.CSSProperties}>
                    <Glyph name={m.emoji} fallback={m.id} label={m.name} size={11} />
                    {m.name} · {m.role}
                    <button onClick={() => setMember("")} className="ml-0.5 text-fg-3 hover:text-fg" aria-label="Don't hand to a crew member">
                      <X size={11} />
                    </button>
                  </span>
                ) : (
                  <button onClick={() => (setMember(m.id), setSuggested(""))} className="member-chip opacity-80 hover:opacity-100" style={{ "--member": m.color } as React.CSSProperties} title="Their persona, model and lessons come with them">
                    <Glyph name={m.emoji} fallback={m.id} label={m.name} size={11} />
                    Hand to {m.name}?
                  </button>
                )}
              </div>
            );
          })()}
          <textarea
            ref={field}
            spellCheck={spellcheck === "on"}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSlashIndex(0);
              setCommandsDismissed(false);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
              if (e.key === "Escape" && slash.length) { e.preventDefault(); e.stopPropagation(); setCommandsDismissed(true); return; }
              if (e.key === "Tab" && !e.shiftKey && slash.length) { e.preventDefault(); pick(slash[activeCommand]!.name, slash[activeCommand]!.kind); return; }
              if (slash.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                setSlashIndex((i) => (i + (e.key === "ArrowDown" ? 1 : slash.length - 1)) % slash.length);
                return;
              }
              if (shouldSend(e.nativeEvent, slash.length && sendShortcut !== "button-only" ? "enter" : sendShortcut)) {
                e.preventDefault();
                if (slash.length) pick(slash[activeCommand]!.name, slash[activeCommand]!.kind);
                else void send();
              }
            }}
            rows={1}
            onPaste={(e) => {
              const pasted = [...e.clipboardData.files];
              if (pasted.length) {
                e.preventDefault();
                attach(pasted);
              }
            }}
            {...({ writingsuggestions: "false" } as object)}
            placeholder={run ? (working ? "Add to the queue — it's answered when this turn ends…" : "Reply, or ask for the next thing…") : "What do you want to build?  / for commands"}
            className="block max-h-[240px] w-full resize-none bg-transparent text-[14px] leading-relaxed text-fg outline-none placeholder:text-fg-3"
            aria-label="Message"
            aria-controls={slash.length ? "session-commands" : undefined}
            aria-activedescendant={slash.length ? `session-command-${activeCommand}` : undefined}
            aria-autocomplete="list"
          />
          <div className="composer-tools">
            <input ref={picker} type="file" multiple hidden onChange={(e) => (e.target.files && attach(e.target.files), (e.target.value = ""))} />
            <button onClick={() => picker.current?.click()} className="grid h-6 w-6 place-items-center rounded-full text-fg-3 hover:bg-raised hover:text-fg" title="Attach photos, videos, voice notes or files (or drop / paste them)" aria-label="Attach files">
              <Paperclip size={14} />
            </button>
            <Dictation available={media.voice} reason={media.missing[0]} onText={(t) => (setText((cur) => (cur.trim() ? `${cur.trimEnd()} ${t}` : t)), field.current?.focus())} />
            <Toggle on={auto} onClick={() => void cyclePermission()} icon={<ShieldCheck size={12} />} label={auto ? "Autopilot" : "Supervised"} title="Supervised asks before risky actions. Autopilot lets those through. Deny rules always apply. Click to switch this session." />
            {/* Agent · model · effort, always in reach (they used to sit behind Options, twice). For an open session they
                apply to your next message, and wait while a turn is running. */}
            <span className="composer-picks" title={run ? (working ? "Available when this turn finishes" : "Applies to your next message") : "For this new session"}>
              <Select label="Agent" disabled={!!run && (working || busy)} value={runtime} onChange={(v) => { setRuntime(v); setModel(""); }}
                options={[...(run ? [] : [{ value: "", label: "Auto agent" }]), ...runtimes.map((r) => ({ value: r.id, label: friendly(r) + (r.limitedUntil ? " · limited" : "") }))]} />
              <i aria-hidden="true">·</i>
              <Select label="Model" disabled={!!run && (working || busy)} value={model} onChange={setModel}
                options={[{ value: "", label: "Auto model" }, ...(chosen?.models ?? []).map((m) => ({ value: m.id, label: m.unavailable ? `${m.label} · ${m.unavailable}` : m.label, disabled: Boolean(m.unavailable) }))]} />
              <i aria-hidden="true">·</i>
              <Select label="Effort" disabled={!!run && (working || busy)} value={effort} onChange={setEffort} options={[{ value: "", label: "Auto effort" }, ...EFFORTS.map((e) => ({ value: e, label: `${e[0]!.toUpperCase()}${e.slice(1)} effort` }))]} />
            </span>
            <button className="composer-options-toggle" aria-expanded={optionsOpen} aria-controls="session-options" onClick={() => setOptionsOpen(v => !v)}>Options{race || task ? " · active" : ""} <ChevronDown size={12} /></button>
            <div className="ml-auto flex items-center gap-2">

              {working && !text.trim() && !files.length && run ? (
                <button onClick={() => void cancelRun(run.id)} className="grid h-8 w-8 place-items-center rounded-full bg-raised text-fg hover:bg-line-strong" title="Stop" aria-label="Stop">
                  <CircleStop size={15} />
                </button>
              ) : (
                <button
                  onClick={() => void send()}
                  disabled={(!text.trim() && !files.some((f) => f.done)) || busy || uploading}
                  className="grid h-8 w-8 place-items-center rounded-full bg-amber text-[var(--on-accent)] transition hover:brightness-110 disabled:bg-raised disabled:text-fg-3"
                  title={`${working ? "Queue" : "Send"}${sendShortcut === "button-only" ? "" : ` (${sendShortcut === "enter" ? "↵" : "⌘ / Ctrl + ↵"})`}`}
                  aria-label="Send"
                >
                  <ArrowUp size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
        {error && <div className="composer-feedback" role="status"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss message"><X size={13} /></button></div>}
        {optionsOpen && <div className="composer-options" id="session-options">
            <button className="rounded-full px-2 py-1 text-[11px] text-fg-2 hover:bg-raised" title="Talk with Shua or a crew member" onClick={() => window.dispatchEvent(new CustomEvent("shuacrew:voice", { detail: { runId: run?.member ? run.id : undefined, memberId: run?.member || member || "shua", runtime: run?.runtime || runtime || undefined } }))}>Voice mode</button>
            {!run && <Toggle on={race} onClick={() => setRace((v) => !v)} icon={<Swords size={12} />} label="Race" title="Send this to Claude and Codex at once, each in its own branch — compare and keep the better one" />}
            {!run && <Toggle on={task} onClick={() => setTask((v) => !v)} icon={<ListChecks size={12} />} label="Task" title="Plan into steps, validate each, retry failures, checkpoint as it goes" />}
            {run?.worktree && (
              <span className="mono flex items-center gap-1 text-[11.5px] text-fg-3" title={run.worktree.path}>
                <GitBranch size={12} /> {run.worktree.branch}
                {run.files.length > 0 && <span className="text-amber">· {run.files.length} changed</span>}
              </span>
            )}
            {run && <ContextMeter used={run.usage.contextUsed} limit={run.usage.contextLimit} />}
        </div>}
        {!run && (
          <div className="composer-meta">
            {isMac() ? (
              <button onClick={() => void chooseFolder()} className="flex items-center gap-1.5 hover:text-fg" title={repo || "Runs in ShuaCrew's own workspace"}>
                <Folder size={12} /> {repo ? repo.split("/").pop() : "default workspace"}
              </button>
            ) : (
              <label className="flex items-center gap-1.5">
                <Folder size={12} />
                <input list="composer-repos" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="default workspace" className="mono w-56 max-w-full min-w-0 bg-transparent text-[11.5px] text-fg outline-none placeholder:text-fg-3" />
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

function Select({ value, onChange, options, label, disabled }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; disabled?: boolean }>; label?: string; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled} className="cursor-pointer appearance-none bg-transparent text-[12px] text-fg-3 outline-none hover:text-fg disabled:cursor-default disabled:opacity-60">
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── changes panel ───────────────────────────────────────────────────────────────────────────

function ChangesPanel({ id }: { id: string }) {
  const run = useLive((s) => s.crew.runs[id]);
  const [file, setFile] = useState<{ path: string; line?: number } | null>(null);
  useEffect(() => {
    const open = (e: Event) => setFile((e as CustomEvent<{ path: string; line?: number }>).detail);
    window.addEventListener("shuacrew:open-file", open);
    return () => window.removeEventListener("shuacrew:open-file", open);
  }, []);
  useEffect(() => setFile(null), [id]);
  if (!run) return null;
  if (file) return <FileViewer run={id} file={file} onBack={() => setFile(null)} />;
  const tokens = run.usage.inputTokens + run.usage.outputTokens;
  return (
    <aside className="sheet flex min-h-0 flex-col max-[1150px]:hidden" aria-label="Changes">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="flex items-center gap-1.5 rounded-[7px] bg-[var(--amber-soft)] px-2 py-1 text-[12.5px] font-medium text-amber">
          <FileDiff size={13} /> Changes
        </span>
        {run.status === "reviewing" && (
          <Link to="/review/$id" params={{ id }} className="ml-auto rounded-[7px] bg-amber px-2.5 py-1 text-[12px] font-semibold text-[var(--on-accent)] hover:brightness-110">
            Review & merge
          </Link>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <Section title={`${run.files.length} file${run.files.length === 1 ? "" : "s"} changed`}>
          {run.files.length === 0 && <Empty>Nothing changed yet</Empty>}
          {run.files.map((f) => (
            <button key={f} onClick={() => setFile({ path: f })} className="flex w-full items-center gap-2 rounded-[6px] px-1.5 py-1 text-left text-[12px] hover:bg-raised" title={f}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
              <span className="mono min-w-0 flex-1 truncate [direction:rtl] text-left">{f}</span>
              <span className="text-[11px] text-fg-3">M</span>
            </button>
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

/** A file the session mentioned or changed, highlighted, scrolled to the line it named. */
function FileViewer({ run, file, onBack }: { run: string; file: { path: string; line?: number }; onBack: () => void }) {
  const [data, setData] = useState<{ relative: string; content: string } | { error: string } | null>(null);
  const [lines, setLines] = useState<import("../lib/highlight").Token[][] | null>(null);
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setData(null);
    setLines(null);
    api<{ relative: string; content: string }>(`/api/runs/${run}/file?path=${encodeURIComponent(file.path)}`)
      .then((d) => {
        setData(d);
        void import("../lib/highlight").then((m) => setLines(m.highlight(d.content, d.relative)));
      })
      .catch((e: Error) => setData({ error: e.message }));
  }, [run, file.path]);
  useEffect(() => {
    if (lines) target.current?.scrollIntoView({ block: "center" });
  }, [lines]);
  const plain: import("../lib/highlight").Token[][] = data && "content" in data ? data.content.split("\n").map((text) => [{ text }]) : [];
  const shown = lines ?? plain;
  return (
    <aside className="sheet flex min-h-0 flex-col max-[1150px]:hidden" aria-label="File">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <button onClick={onBack} className="rounded-[6px] px-1.5 py-1 text-[12px] text-fg-3 hover:bg-raised hover:text-fg">← Changes</button>
        <span className="mono min-w-0 flex-1 truncate text-right text-[12px] text-fg-2" title={file.path}>
          {data && "relative" in data ? data.relative : file.path}
          {file.line ? `:${file.line}` : ""}
        </span>
      </div>
      <div className="file-view min-h-0 flex-1 overflow-auto">
        {!data && <div className="p-4 text-[12px] text-fg-3">Opening…</div>}
        {data && "error" in data && <div className="p-4 text-[12px] text-bad">{data.error}</div>}
        {shown.map((tokens, n) => (
          <div key={n} ref={file.line === n + 1 ? target : undefined} className={`file-line ${file.line === n + 1 ? "is-target" : ""}`}>
            <span className="file-n">{n + 1}</span>
            <span className="file-code">{tokens.length ? tokens.map((t, j) => ("className" in t && t.className ? <span key={j} className={t.className}>{t.text}</span> : t.text)) : "\u200b"}</span>
          </div>
        ))}
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

// ── home: what needs you, and getting started ───────────────────────────────────────────────

/** Gates and approvals waiting on you, one tap away — the first thing you see when you open the app. */
function NeedsYou() {
  const plays = useLive((s) => s.crew.plays);
  const approvals = useLive((s) => s.crew.approvals);
  const runs = useLive((s) => s.crew.runs);
  const navigate = useNavigate();
  const gates = Object.values(plays).filter((p) => p.status === "waiting");
  const asks = Object.values(approvals);
  if (!gates.length && !asks.length) return null;
  return (
    <div className="needs-you">
      <span className="needs-dot" />
      <span className="text-[12px] font-semibold text-fg">Needs you</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {gates.slice(0, 3).map((p) => (
          <button key={p.id} className="needs-chip" onClick={() => navigate({ to: "/plays/$id", params: { id: p.id } })}>
            <Glyph name={p.emoji} fallback={p.playbook} label={p.name} size={11} /> {p.phases.find((x) => x.status === "review")?.name ?? "Review"} <span className="text-fg-3">· {p.title.split(" — ")[1] ?? p.name}</span>
          </button>
        ))}
        {asks.slice(0, 3).map((a) => (
          <button key={a.id} className="needs-chip" onClick={() => a.run && navigate({ to: "/sessions/$id", params: { id: a.run } })}>
            <ShieldCheck size={11} className="text-wait" /> Allow {a.tool}? <span className="text-fg-3">· {(a.run && runs[a.run]?.title) || "session"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const STARTED = "shuacrew.gettingStarted";

/** Five steps from a fresh install to a crew that can run your startup. Gone once done or dismissed. */
function GettingStarted() {
  const members = useLive((s) => Object.keys(s.crew.members).length);
  const ventures = useLive((s) => Object.keys(s.crew.ventures).length);
  const navigate = useNavigate();
  const [extra, setExtra] = useState<{ tools: number; skills: number; service: boolean } | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(STARTED) === "dismissed";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (hidden) return;
    void Promise.all([api<unknown[]>("/api/mcp").catch(() => []), api<unknown[]>("/api/skills").catch(() => []), api<{ service?: boolean }>("/api/health").catch(() => ({}) as { service?: boolean })]).then(([t, k, h]) =>
      setExtra({ tools: t.length, skills: k.length, service: Boolean(h.service) }),
    );
  }, [hidden]);
  if (hidden || !extra) return null;
  const steps = [
    { done: members > 0, label: "Add your crew", hint: "Researcher, Engineer, Designer, Marketer, Operator", to: "/crew" },
    { done: ventures > 0, label: "Start a venture", hint: "Your idea, from validation to revenue", to: "/ventures" },
    { done: extra.tools > 0, label: "Connect a tool", hint: "Playwright, Stripe, Linear, Supabase…", to: "/integrations" },
    { done: extra.skills > 0, label: "Install a skill", hint: "docx, pdf, frontend-design…", to: "/integrations", hash: "skills" },
    { done: extra.service, label: "Keep it always on", hint: "pnpm service install", to: "/settings" },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (!left) return null;
  return (
    <div className="getting-started">
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-semibold text-fg">Getting started</span>
        <span className="text-[11.5px] text-fg-3">
          {steps.length - left} of {steps.length}
        </span>
        <div className="gs-bar">
          <span style={{ width: `${((steps.length - left) / steps.length) * 100}%` }} />
        </div>
        <button className="text-[11.5px] text-fg-3 hover:text-fg" onClick={() => (setHidden(true), localStorage.setItem(STARTED, "dismissed"))}>
          Hide
        </button>
      </div>
      <div className="mt-2.5 grid gap-1">
        {steps.map((s) => (
          <button key={s.label} className={`gs-step ${s.done ? "is-done" : ""}`} onClick={() => navigate({ to: s.to, ...(s.hash ? { hash: s.hash } : {}) })} disabled={s.done}>
            <span className="gs-check">{s.done ? <CheckCircle2 size={15} /> : <span />}</span>
            <span className="text-[12.5px] font-medium">{s.label}</span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-3">{s.hint}</span>
            {!s.done && <span className="text-[11.5px] text-fg-3">→</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** This morning's briefing: what happened while you were away and what needs you, one tap each. */
function TodayBriefing() {
  const briefing = useLive((s) => s.crew.briefing);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const make = () => (setBusy(true), void api("/api/briefing", { body: {} }).finally(() => setBusy(false)));
  if (!briefing || briefing.day !== day) {
    return (
      <button className="brief-make" onClick={make} disabled={busy}>
        <Sunrise size={14} className="text-fg-3" /> {busy ? "Putting it together…" : "Make today's briefing"}
        <span className="ml-auto text-[11.5px] text-fg-3">it arrives by itself at 8:00</span>
      </button>
    );
  }
  const go = (href?: string) => {
    if (!href) return;
    const [path, hash] = href.split("#");
    navigate({ to: path!, ...(hash ? { hash } : {}) });
  };
  return (
    <section className="brief">
      <div className="flex items-center gap-2.5">
        <Sunrise size={15} className="shrink-0 text-fg-2" />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="block text-[12px] font-semibold uppercase tracking-[0.07em] text-fg-3">
            Today · {new Date(briefing.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
          <span className="block truncate text-[14px] font-semibold text-fg">{briefing.headline}</span>
        </button>
        <button className="member-icon" title="Refresh the briefing" aria-label="Refresh the briefing" onClick={make} disabled={busy}>
          <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
        </button>
        <button className="member-icon" onClick={() => setOpen((v) => !v)} aria-label={open ? "Collapse" : "Expand"}>
          <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && briefing.sections.length > 0 && (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 [overflow-wrap:anywhere]">
          {briefing.sections.map((section) => (
            <div key={section.title}>
              <div className="brief-title">{section.title}</div>
              <div className="grid gap-0.5">
                {section.items.map((item, i) => (
                  <button key={i} className={`brief-item is-${item.tone ?? "idle"}`} onClick={() => go(item.href)} disabled={!item.href}>
                    <span className="brief-dot" />
                    <span className="min-w-0 flex-1 truncate">{item.text}</span>
                    {item.href && <span className="brief-go">→</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
