import { plain } from "../lib/plain";
import type { AnyEvent } from "@shuacrew/core/events";
import type { RunView } from "@shuacrew/core/projections";
import { Button, formatTokens, since } from "@shuacrew/ui";
import { useNavigate } from "@tanstack/react-router";
import { Bot, CircleX, FilePen, FileText, Globe, Hand, ListTree, Search, ShieldAlert, SquareTerminal, Wrench, Check, Layers3 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo, useEffect, useMemo, useState } from "react";
import { decideApproval } from "../lib/api";
import { inScope, runRepo } from "../lib/crew";
import { useLive } from "../lib/live";
import { describe } from "../shell/CommandPalette";
import { Glyph } from "../lib/glyphs";
import { CrewWorkspace } from "../components/CrewWorkspace";
import { selectRooms } from "../lib/room-view";
import { CrewStudio3D } from "../components/CrewStudio3D";
import { isTopLevelWork } from "../lib/crew";
import { PaneHeader } from "../components/Pane";

/**
 * The crew floor: every agent at work, live. Pods show what each is doing this second, the last
 * few steps, its subagents and anything waiting on you; the swimlanes show the last ten minutes;
 * the feed is every step across the crew as it happens.
 */

const WORKING = new Set(["running", "planning", "queued", "awaiting_approval"]);
const LINGER = 90_000; // finished pods stay on the floor this long, settled

type Kind = "read" | "edit" | "shell" | "test" | "web" | "agent" | "wait" | "other";
const KIND_COLOR: Record<Kind, string> = {
  read: "#6cb6ff",
  edit: "var(--amber)",
  shell: "#9ba3ae",
  test: "var(--ok)",
  web: "#56d4dd",
  agent: "#f778ba",
  wait: "var(--wait)",
  other: "#7b8494",
};
const KIND_LABEL: Record<Kind, string> = { read: "Reading", edit: "Editing", shell: "Running", test: "Testing", web: "On the web", agent: "Delegating", wait: "Waiting on you", other: "Working" };
const KIND_ICON: Record<Kind, typeof Wrench> = { read: FileText, edit: FilePen, shell: SquareTerminal, test: Check, web: Globe, agent: Bot, wait: Hand, other: Wrench };

function kindOf(tool: string, input: unknown): Kind {
  const command = typeof (input as { command?: unknown })?.command === "string" ? ((input as { command: string }).command) : "";
  if (/^(bash|shell|commandexecution|exec)/i.test(tool)) return /\b(test|vitest|jest|pytest|go test|cargo test|swift test)\b/.test(command) ? "test" : "shell";
  if (/^(read|view|cat|grep|glob|ls|find|search)/i.test(tool)) return "read";
  if (/^(edit|write|multiedit|filechange|apply_patch|str_replace|create)/i.test(tool)) return "edit";
  if (/^(web|fetch|browse)/i.test(tool)) return "web";
  if (/^(task|agent|spawn)/i.test(tool)) return "agent";
  return "other";
}

/** What a step touched, said briefly: `~/app/src/upload.ts` → `src/upload.ts`, temp paths → the file. */
/** A shell command as you'd type it: without the /bin/zsh -lc '…' wrapper the runtimes add. */
export function plainCommand(cmd: string): string {
  const m = /^\s*(?:\/bin\/|\/usr\/bin\/)?(?:zsh|bash|sh)\s+-l?c\s+(['"])([\s\S]*)\1\s*$/.exec(cmd);
  return (m ? m[2]! : cmd).replace(/\s+/g, " ").trim();
}
/** What a tool touched: a file name for file edits (not the tool's own name), the plain command for shells. */
function target(tool: string, input: unknown): string {
  const o = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const changes = Array.isArray(o.changes) ? o.changes as Array<{ path?: unknown }> : null;
  if (changes?.length) { const first = String(changes[0]?.path ?? "").split("/").pop(); return changes.length > 1 ? `${first} and ${changes.length - 1} more` : first || "files"; }
  const text = brief(input);
  if (!text || text === tool || /^fileChange$/i.test(text)) return "files";
  return plainCommand(text);
}

function brief(input: unknown): string {
  const text = describe(input);
  return text.replace(/(?:\/private)?\/(?:tmp|var\/folders)\/\S*?\/((?:src|lib|app|test|tests)\/\S+|[^/\s]+)(?=\s|$)/g, "$1").replace(/\/Users\/[^/\s]+/g, "~").replace(/~\/Developer\/projects\//g, "");
}

const RUNTIME_COLOR: Record<string, string> = { claude: "#e8845c", codex: "#4ade80", mock: "#9ba3ae" };
const runtimeColor = (r: string) => RUNTIME_COLOR[r] ?? "#6cb6ff";

/** Re-render once a second, so timers and the playhead move. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function CrewFloor() {
  const rooms = useLive(s => selectRooms(s.crew));
  const [roomId, setRoomId] = useState("");
  const allRuns = useLive((s) => s.crew.runs);
  const scope = useLive((s) => s.scope);
  const runs = useMemo(() => {
    if (!scope) return allRuns;
    const out: Record<string, RunView> = {};
    for (const run of Object.values(allRuns)) if (inScope(runRepo(run, allRuns), scope)) out[run.id] = run;
    return out;
  }, [allRuns, scope]);
  const allApprovals = useLive((s) => s.crew.approvals);
  const approvals = useMemo(
    () => Object.fromEntries(Object.entries(allApprovals).filter(([, a]) => !scope || (a.run ? Boolean(runs[a.run]) : false))),
    [allApprovals, runs, scope],
  );
  const allActivity = useLive((s) => s.activity);
  // Spark chats and learning sessions are yours, not crew work: they stay off the floor.
  const activity = useMemo(() => allActivity.filter((e) => {
    const run = e.run ? allRuns[e.run] : undefined;
    if (run?.labels?.some((l) => l === "buddy" || l === "learning")) return false;
    return !scope || (e.run && runs[e.run]);
  }), [allActivity, allRuns, runs, scope]);
  const now = useNow();

  const onFloor = useMemo(
    () =>
      Object.values(runs)
        .filter((r) => isTopLevelWork(r, runs) && (WORKING.has(r.status) || now - r.updatedAt < LINGER))
        .sort((a, b) => Number(WORKING.has(b.status)) - Number(WORKING.has(a.status)) || a.createdAt - b.createdAt),
    [runs, Math.floor(now / 5000)],
  );
  const children = useMemo(() => {
    const byParent: Record<string, RunView[]> = {};
    for (const r of Object.values(runs)) if (r.parent) (byParent[r.parent] ??= []).push(r);
    return byParent;
  }, [runs]);
  const byRun = useMemo(() => {
    const out: Record<string, AnyEvent[]> = {};
    for (const e of activity) if (e.run) (out[e.run] ??= []).push(e);
    return out;
  }, [activity]);
  const working = onFloor.filter((r) => r.status === "running" || r.status === "planning").length;
  const waiting = Object.keys(approvals).length;
  const perMinute = activity.filter((e) => e.kind === "tool.called" && now - e.at < 60_000).length;

  return (
    <div className="crew-floor">
      <header className="floor-head">
        <PaneHeader eyebrow="Crew" icon={Layers3} title="Studio floor"
          status={waiting ? `${waiting} waiting on you${working ? ` · ${working} at work` : ""}` : working ? `${working} at work · ${perMinute} step${perMinute === 1 ? "" : "s"} in the last minute` : "Everyone's at their desk. Hand work over from Agents and watch it happen here."}
          tone={waiting ? "wait" : working ? "live" : "idle"} />
      </header>

      <div className="floor-body">
        <section className="floor-pods" aria-label="Agents">
          {!!Object.keys(rooms).length && <div className="mb-5"><label className="text-[12px] text-fg-3">Room workspace <select className="ml-2 rounded-lg border border-line bg-panel px-3 py-2" value={roomId} onChange={e => setRoomId(e.target.value)}><option value="">All activity below</option>{Object.values(rooms).filter(room => !scope || room.repo === scope).map(room => <option key={room.id} value={room.id}>{room.title}</option>)}</select></label>{rooms[roomId] && <div className="mt-3 max-h-[520px] overflow-auto rounded-2xl border border-line"><CrewWorkspace room={rooms[roomId]} /></div>}</div>}
          <CrewStudio3D runs={runs} activity={activity} approvals={approvals} now={now} />
          {onFloor.length === 0 ? null : (
            <div className="pods-grid">
              <AnimatePresence initial={false}>
                {onFloor.map((run) => (
                  <motion.div key={run.id} layout initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
                    <Pod run={run} events={byRun[run.id] ?? []} kids={children[run.id] ?? []} approvals={Object.values(approvals).filter((a) => a.run === run.id)} now={now} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
          <Swimlanes runs={runs} activity={activity} now={now} />
        </section>
        <Feed activity={activity} runs={runs} />
      </div>
    </div>
  );
}



// ── a pod: one agent at work ────────────────────────────────────────────────────────────────

const Pod = memo(function Pod({ run, events, kids, approvals, now }: { run: RunView; events: AnyEvent[]; kids: RunView[]; approvals: Array<{ id: string; tool: string; input: unknown; risk: string }>; now: number }) {
  const navigate = useNavigate();
  const active = WORKING.has(run.status);
  const waiting = approvals.length > 0;
  // Tool calls still open are what it's doing now; the last few finished ones are its trail.
  const { current, trail } = useMemo(() => {
    const open = new Map<string, { tool: string; input: unknown; at: number }>();
    const done: Array<{ key: number; tool: string; input: unknown; ok: boolean; at: number }> = [];
    for (const e of events) {
      if (e.kind === "tool.called") open.set(e.body.id, { tool: e.body.tool, input: e.body.input, at: e.at });
      if (e.kind === "tool.returned") {
        const call = open.get(e.body.id);
        open.delete(e.body.id);
        if (call) done.push({ key: e.seq, tool: call.tool, input: call.input, ok: e.body.ok, at: e.at });
      }
    }
    return { current: [...open.values()].pop(), trail: done.slice(-4).reverse() };
  }, [events]);
  const started = events.find((e) => e.kind === "turn.started")?.at ?? run.createdAt;
  const kind: Kind = waiting ? "wait" : current ? kindOf(current.tool, current.input) : "other";
  const Icon = KIND_ICON[kind];
  const member = useLive((s) => (run.member ? s.crew.members[run.member] : undefined));
  const color = member?.color ?? runtimeColor(run.runtime);
  const lastCheck = run.checks[run.checks.length - 1];
  const state = waiting ? "waiting" : active ? "active" : run.status === "failed" ? "failed" : "settled";

  return (
    <article className={`pod is-${state}`} style={{ "--agent": color } as React.CSSProperties} onClick={() => navigate({ to: "/sessions/$id", params: { id: run.id } })}>
      <div className="pod-top">
        <span className="pod-avatar" aria-hidden>
          <span className="pod-ring" />
          <span className="pod-face">{member ? <Glyph name={member.emoji} fallback={member.id} label={member.name} size={15} /> : run.runtime === "claude" ? "C" : run.runtime === "codex" ? "X" : run.runtime.slice(0, 1).toUpperCase()}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-fg">{run.title}</div>
          <div className="mono truncate text-[11px] text-fg-3">
            {member ? `${member.name} · ${member.role} · ` : ""}
            {run.runtime}
            {run.model ? ` · ${run.model}` : ""}
            {run.worktree ? ` · ${run.worktree.branch}` : ""}
          </div>
        </div>
        <span className="mono text-[11.5px] tabular-nums text-fg-3">{clock((active ? now : run.updatedAt) - started, active)}</span>
      </div>

      <div className={`pod-now kind-${kind}`}>
        <Icon size={14} style={{ color: KIND_COLOR[kind] }} />
        {waiting ? (
          <span className="min-w-0 flex-1 truncate text-wait">Needs you: {approvals[0]!.tool} {brief(approvals[0]!.input)}</span>
        ) : active ? (
          <span className="min-w-0 flex-1 truncate">
            <span className="shimmer-text font-medium">{current ? KIND_LABEL[kind] : "Thinking"}</span>
            <span className="mono ml-2 text-[11.5px] text-fg-3">{current ? brief(current.input) : plain(run.ticker)}</span>
          </span>
        ) : (
          <span className={`min-w-0 flex-1 truncate ${run.status === "failed" ? "text-bad" : "text-fg-2"}`}>
            {run.status === "reviewing" ? "Ready for review" : run.status === "failed" ? (run.statusReason ?? "Failed") : run.status === "merged" ? "Merged" : run.status === "cancelled" ? "Cancelled" : run.status === "paused" ? "Paused" : "Done"} — {run.ticker}
          </span>
        )}
      </div>

      {waiting && (
        <div className="pod-approval" onClick={(e) => e.stopPropagation()}>
          <ShieldAlert size={13} className="text-wait" />
          <span className="mono min-w-0 flex-1 truncate text-[11.5px]">{describe(approvals[0]!.input)}</span>
          <Button size="s" variant="primary" onClick={() => void decideApproval(approvals[0]!.id, true)}>
            Allow
          </Button>
          <Button size="s" variant="danger" onClick={() => void decideApproval(approvals[0]!.id, false)}>
            Deny
          </Button>
        </div>
      )}

      <ol className="pod-trail">
        <AnimatePresence initial={false}>
          {trail.map((step) => {
            const k = kindOf(step.tool, step.input);
            const StepIcon = KIND_ICON[k];
            return (
              <motion.li key={step.key} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <StepIcon size={12} style={{ color: step.ok ? KIND_COLOR[k] : "var(--bad)" }} />
                <span className="truncate">{brief(step.input) || step.tool}</span>
                {!step.ok && <CircleX size={11} className="text-bad" />}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      {(kids.length > 0 || run.subagents.length > 0) && (
        <div className="pod-kids">
          <svg className="pod-link" viewBox="0 0 12 28" preserveAspectRatio="none" aria-hidden>
            <path d="M6 0 V28" />
          </svg>
          <div className="flex flex-wrap gap-1.5">
            {run.subagents.map((a) => (
              <span key={a.id} className={`kid ${a.done ? (a.ok ? "is-ok" : "is-bad") : "is-live"}`} title={a.task}>
                <Bot size={11} /> {a.name}
              </span>
            ))}
            {kids.slice(-6).map((k) => (
              <span key={k.id} className={`kid ${WORKING.has(k.status) ? "is-live" : k.status === "failed" ? "is-bad" : "is-ok"}`} title={k.title}>
                <ListTree size={11} /> {k.title.slice(0, 26)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="pod-foot">
        {/* A task's own run just coordinates; the work — and the usage — is in its steps. */}
        <span className="mono">{formatTokens([run, ...kids].reduce((n, r) => n + r.usage.inputTokens + r.usage.outputTokens, 0))} tok</span>
        <span>{[run, ...kids].reduce((n, r) => n + r.toolCalls, 0)} steps</span>
        {run.files.length > 0 && <span className="text-amber">{run.files.length} files</span>}
        {lastCheck && <span className={lastCheck.passed ? "text-ok" : "text-bad"}>{lastCheck.passed ? "checks passed" : "checks failed"}</span>}
        {run.usage.contextUsed && run.usage.contextLimit ? <ContextBar used={run.usage.contextUsed} limit={run.usage.contextLimit} /> : null}
      </div>
    </article>
  );
});

function ContextBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <span className="ml-auto flex items-center gap-1.5" title={`${pct}% of context used`}>
      <span className="context-bar">
        <span style={{ width: `${pct}%`, background: pct > 85 ? "var(--bad)" : pct > 65 ? "var(--amber)" : "var(--text-3)" }} />
      </span>
      <span className="mono">{pct}%</span>
    </span>
  );
}

function clock(ms: number, running: boolean): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const text = s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return running ? text : `took ${text}`;
}

// ── the last ten minutes, one lane per agent ────────────────────────────────────────────────

const ZOOMS = [
  { label: "2m", ms: 2 * 60_000 },
  { label: "10m", ms: 10 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
];

function Swimlanes({ runs, activity, now }: { runs: Record<string, RunView>; activity: AnyEvent[]; now: number }) {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<number | null>(null);
  // Until you pick one, use the span that fits: a burst from the last two minutes gets 2m, not a
  // sliver of 10m. Decided once activity has loaded.
  const auto = useMemo(() => {
    const steps = activity.filter((e) => e.kind === "tool.called" && now - e.at < 10 * 60_000);
    return steps.length && steps.every((e) => now - e.at < 2 * 60_000) ? 0 : 1;
  }, [activity.length > 0, Math.floor(now / 60_000)]);
  const zoom = picked ?? auto;
  const setZoom = setPicked;
  const WINDOW = ZOOMS[zoom]!.ms;
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const lanes = useMemo(() => {
    const from = now - WINDOW;
    const byRun = new Map<string, Array<{ start: number; end: number; kind: Kind; label: string; open: boolean }>>();
    const open = new Map<string, { run: string; start: number; kind: Kind; label: string }>();
    for (const e of activity) {
      if (!e.run) continue;
      if (e.kind === "tool.called") open.set(e.body.id, { run: e.run, start: e.at, kind: kindOf(e.body.tool, e.body.input), label: `${e.body.tool} ${brief(e.body.input)}` });
      if (e.kind === "approval.requested") open.set(e.body.id, { run: e.run, start: e.at, kind: "wait", label: `Waiting on you: ${e.body.tool}` });
      if ((e.kind === "tool.returned" || e.kind === "approval.decided") && open.has(e.body.id)) {
        const o = open.get(e.body.id)!;
        open.delete(e.body.id);
        const kind = e.kind === "tool.returned" && !e.body.ok && o.kind !== "wait" ? o.kind : o.kind;
        if (e.at >= from) (byRun.get(o.run) ?? byRun.set(o.run, []).get(o.run)!).push({ start: Math.max(o.start, from), end: e.at, kind, label: o.label, open: false });
      }
    }
    for (const o of open.values()) (byRun.get(o.run) ?? byRun.set(o.run, []).get(o.run)!).push({ start: Math.max(o.start, from), end: now, kind: o.kind, label: o.label, open: true });
    return [...byRun.entries()]
      .filter(([id]) => runs[id])
      .map(([id, blocks]) => ({ run: runs[id]!, blocks }))
      .sort((a, b) => (a.run.parent ?? a.run.id).localeCompare(b.run.parent ?? b.run.id) || a.run.createdAt - b.run.createdAt)
      .slice(-12);
  }, [activity, runs, now, WINDOW]);
  const x = (t: number) => `${((t - (now - WINDOW)) / WINDOW) * 100}%`;

  return (
    <div className="swimlanes" onMouseLeave={() => setHover(null)}>
      <div className="swim-head">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">Timeline</span>
        <span className="zoom" role="radiogroup" aria-label="Timeline span">
          {ZOOMS.map((z, i) => (
            <button key={z.label} role="radio" aria-checked={zoom === i} className={zoom === i ? "is-on" : ""} onClick={() => setZoom(i)}>
              {z.label}
            </button>
          ))}
        </span>
        <span className="ml-auto flex flex-wrap gap-3 text-[11px] text-fg-3">
          {(Object.keys(KIND_LABEL) as Kind[]).filter((k) => k !== "other").map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: KIND_COLOR[k] }} />
              {KIND_LABEL[k]}
            </span>
          ))}
        </span>
      </div>
      {lanes.length === 0 && <div className="py-4 text-center text-[12px] text-fg-3">Nothing in this window.</div>}
      {lanes.map(({ run, blocks }) => (
        <div key={run.id} className="lane">
          <button className="lane-name" onClick={() => navigate({ to: "/sessions/$id", params: { id: run.parent ?? run.id } })} title={run.title}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: runtimeColor(run.runtime) }} />
            <span className="truncate">{run.parent ? "↳ " : ""}{run.title}</span>
          </button>
          <div className="lane-track">
            {[2, 4, 6, 8].map((m) => (
              <span key={m} className="lane-tick" style={{ left: `${m * 10}%` }} />
            ))}
            {blocks.map((b, i) => (
              <span
                key={i}
                className={`lane-block ${b.open ? "is-open" : ""}`}
                style={{ left: x(b.start), width: `max(3px, calc(${x(b.end)} - ${x(b.start)}))`, background: KIND_COLOR[b.kind] }}
                onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY, text: `${b.label} · ${Math.max(1, Math.round((b.end - b.start) / 1000))}s` })}
              />
            ))}
            <span className="lane-now" />
          </div>
        </div>
      ))}
      <div className="swim-scale">
        <span>−{ZOOMS[zoom]!.label}</span>
        <span>−{ZOOMS[zoom]!.label.replace(/\d+/, (n) => String(Number(n) / 2))}</span>
        <span>now</span>
      </div>
      {hover && (
        <div className="lane-tip" style={{ left: hover.x + 12, top: hover.y - 34 }}>
          {hover.text}
        </div>
      )}
    </div>
  );
}

// ── every step, as it happens ───────────────────────────────────────────────────────────────

function Feed({ activity, runs }: { activity: AnyEvent[]; runs: Record<string, RunView> }) {
  const navigate = useNavigate();
  const items = useMemo(
    () =>
      activity
        .slice(-160)
        .reverse()
        .flatMap((e) => {
          const run = e.run ? runs[e.run] : undefined;
          // A delegated step isn't a "new session" of yours (same rule as Board and Today).
          if (run && e.kind === "run.created" && !isTopLevelWork(run, runs)) return [];
          const line = feedLine(e);
          return line && run ? [{ e, run, ...line }] : [];
        })
        .slice(0, 80),
    [activity, runs],
  );
  return (
    <aside className="floor-feed" aria-label="Activity feed">
      {/* "Live" only while something is running; otherwise it's the record of what happened, with how long ago. */}
      <div className="px-4 pb-2 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{Object.values(runs).some((r) => ["running", "planning"].includes(r.status)) ? "Live activity" : "Recent activity"}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {items.length === 0 && <div className="px-2 py-6 text-center text-[12px] text-fg-3">Steps from every agent appear here as they happen.</div>}
        <AnimatePresence initial={false}>
          {items.map(({ e, run, icon: Icon, color, text }) => (
            <motion.button
              key={e.seq}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="feed-row"
              onClick={() => navigate({ to: "/sessions/$id", params: { id: run.parent ?? run.id } })}
            >
              <Icon size={13} style={{ color }} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-fg">{text}</span>
                <span className="flex items-center gap-1.5 text-[10.5px] text-fg-3">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: runtimeColor(run.runtime) }} />
                  <span className="truncate">{run.title}</span>
                </span>
              </span>
              <span className="shrink-0 text-[10.5px] tabular-nums text-fg-3" title={new Date(e.at).toLocaleString()}>{since(e.at)}</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </aside>
  );
}

function feedLine(e: AnyEvent): { icon: typeof Wrench; color: string; text: string } | null {
  switch (e.kind) {
    case "tool.called": {
      const k = kindOf(e.body.tool, e.body.input);
      return { icon: KIND_ICON[k], color: KIND_COLOR[k], text: `${KIND_LABEL[k]} ${target(e.body.tool, e.body.input)}` };
    }
    case "check.ran":
      return { icon: e.body.exitCode === 0 ? Check : CircleX, color: e.body.exitCode === 0 ? "var(--ok)" : "var(--bad)", text: `${e.body.exitCode === 0 ? "Checks passed" : "Checks failed"} · ${plainCommand(e.body.command)}` };
    case "approval.requested":
      return { icon: Hand, color: "var(--wait)", text: `Asked you: ${e.body.tool} ${describe(e.body.input)}` };
    case "approval.decided":
      return { icon: ShieldAlert, color: e.body.allow ? "var(--ok)" : "var(--bad)", text: `${e.body.allow ? "Allowed" : "Denied"} by ${e.body.by}` };
    case "subagent.started":
      return { icon: Bot, color: KIND_COLOR.agent, text: `Started ${e.body.name}: ${e.body.task}` };
    case "run.created":
      return { icon: Search, color: "var(--amber)", text: `New session: ${e.body.title}` };
    case "merge.landed":
      return { icon: Check, color: "var(--ok)", text: `Merged into ${e.body.branch}` };
    case "pr.opened":
      return { icon: Globe, color: "var(--ok)", text: `Opened a PR` };
    case "run.status":
      return e.body.status === "failed" ? { icon: CircleX, color: "var(--bad)", text: `Failed: ${e.body.reason ?? ""}` } : e.body.status === "reviewing" ? { icon: Check, color: "var(--wait)", text: "Ready for review" } : null;
    default:
      return null;
  }
}
