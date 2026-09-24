import type { RunView } from "@shuacrew/core/projections";
import { Button, Chip, Eyebrow, Gauge, Kbd, StatusGlyph, StatusPill, formatTokens, since } from "@shuacrew/ui";
import { Link, useParams } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, GitBranch, Undo2 } from "lucide-react";
import { motion } from "motion/react";
import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Thread, fmtMs } from "../components/Thread";
import { cancelRun, decideApproval, followUp, launchRun } from "../lib/api";
import { conversation, type Item } from "../lib/conversation";
import { useLive } from "../lib/live";
import { describe } from "../shell/CommandPalette";

const TerminalReplay = lazy(() => import("../components/Terminal"));

const TABS = ["Plan", "Timeline", "Diff", "Terminal", "Graph", "Cost"] as const;
type Tab = (typeof TABS)[number];

export function RunDetail() {
  const { id } = useParams({ from: "/runs/$id" });
  const run = useLive((s) => s.crew.runs[id]);
  const events = useLive((s) => s.runEvents[id]);
  const loadRun = useLive((s) => s.loadRun);
  const [tab, setTab] = useState<Tab>("Timeline");
  const isTask = run?.labels.includes("task") ?? false;
  useEffect(() => {
    if (isTask) setTab("Plan");
  }, [isTask]);
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    void loadRun(id);
  }, [id, loadRun]);

  const items = useMemo(() => conversation(events ?? [], scrub ?? Number.POSITIVE_INFINITY), [events, scrub]);

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center text-fg-3">
        No run {id}. <Link to="/" className="ml-2 text-amber">Back to sessions</Link>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_360px] max-[1100px]:grid-cols-1">
      <section className="flex min-h-0 flex-col" aria-label="Conversation">
        <RunHeader run={run} />
        {scrub !== null && (
          <div className="flex items-center gap-3 border-b border-line bg-[var(--amber-soft)] px-6 py-2 text-[12.5px] text-amber">
            Replaying up to event #{scrub} — the run is unchanged.
            <button onClick={() => setScrub(null)} className="ml-auto underline">
              Back to live
            </button>
          </div>
        )}
        <Thread items={items} working={run.status === "running" && scrub === null} />
        {scrub === null && <Composer run={run} />}
      </section>
      <aside className="flex min-h-0 flex-col border-l border-line bg-panel max-[1100px]:hidden" aria-label="Run details">
        <div role="tablist" className="flex gap-1 border-b border-line px-3 pt-3">
          {TABS.filter((t) => t !== "Plan" || isTask).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`relative px-2.5 pb-2.5 text-[12.5px] ${tab === t ? "text-fg" : "text-fg-3 hover:text-fg-2"}`}
            >
              {t}
              {tab === t && <motion.span layoutId="tab-underline" className="absolute bottom-[-1px] left-0 right-0 h-[2px] rounded-full bg-amber" />}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "Plan" && <Plan events={events ?? []} />}
          {tab === "Timeline" && <Timeline run={run} events={events?.length ?? 0} scrub={scrub} onScrub={setScrub} seqs={(events ?? []).map((e) => e.seq)} />}
          {tab === "Diff" && <Files run={run} />}
          {tab === "Terminal" && (
            <Suspense fallback={<div className="text-fg-3">Loading terminal…</div>}>
              <TerminalReplay
                steps={items
                  .filter((i): i is Extract<Item, { kind: "tool" }> => i.kind === "tool" && ["Bash", "shell", "commandExecution"].includes(i.tool))
                  .map((i) => ({ command: describe(i.input), output: i.output, ok: i.ok }))}
              />
            </Suspense>
          )}
          {tab === "Graph" && <Graph run={run} items={items} />}
          {tab === "Cost" && <Cost run={run} />}
        </div>
      </aside>
    </div>
  );
}

function RunHeader({ run }: { run: RunView }) {
  const live = ["running", "planning", "awaiting_approval", "queued", "paused"].includes(run.status);
  return (
    <motion.header layoutId={`run-${run.id}`} className="flex items-start gap-3 border-b border-line bg-panel px-6 py-4" transition={{ type: "spring", stiffness: 500, damping: 40 }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11.5px] text-fg-3">
          <Link to="/sessions/$id" params={{ id: run.id }} className="hover:text-fg-2">Session</Link>
          <ChevronRight size={12} />
          <span className="mono">{run.id}</span>
        </div>
        <h1 className="mt-1 truncate text-[18px] font-semibold tracking-[-0.015em]">{run.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill status={run.status} reason={run.statusReason} />
          <Chip mono>{run.runtime}{run.model ? ` · ${run.model}` : ""}</Chip>
          {run.worktree && (
            <Chip mono title={run.worktree.path}>
              <GitBranch size={11} /> {run.worktree.branch}
            </Chip>
          )}
          {run.statusReason && <span className="text-[12px] text-fg-3">{run.statusReason}</span>}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Gauge used={run.usage.contextUsed} limit={run.usage.contextLimit} />
        <span className="mono text-[12px] tabular-nums text-fg-2">{formatTokens(run.usage.inputTokens + run.usage.outputTokens)} tok</span>
        {run.worktree && run.files.length > 0 && (
          <Link to="/review/$id" params={{ id: run.id }}>
            <Button variant={run.status === "reviewing" ? "primary" : "quiet"} size="s">
              Review {run.files.length} file{run.files.length === 1 ? "" : "s"}
            </Button>
          </Link>
        )}
        {live && (
          <Button variant="danger" size="s" onClick={() => void cancelRun(run.id)}>
            Stop
          </Button>
        )}
      </div>
    </motion.header>
  );
}

/** The conversation, virtualised: a run with thousands of steps scrolls like a short one. */
function Composer({ run }: { run: RunView }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const busy = ["running", "planning", "awaiting_approval", "queued"].includes(run.status);
  const send = async () => {
    if (!text.trim() || busy) return;
    try {
      await followUp(run.id, text);
      setText("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="border-t border-line bg-panel px-6 py-3">
      <div className="mx-auto flex max-w-[860px] items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && void send()}
          rows={1}
          placeholder={busy ? "Working — you can type the next step…" : "Follow up in this run…"}
          className="max-h-40 min-h-[36px] flex-1 resize-y rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 py-2 text-[13.5px] outline-none placeholder:text-fg-3 focus:border-amber"
          aria-label="Follow-up message"
        />
        <Button variant="primary" onClick={() => void send()} disabled={busy || !text.trim()}>
          Send <Kbd>⌘↵</Kbd>
        </Button>
      </div>
      {error && <div className="mx-auto mt-1 max-w-[860px] text-[12px] text-bad">{error}</div>}
    </div>
  );
}

/** Drag through the run's history; fork a new run from any moment. */
function Timeline({ run, seqs, scrub, onScrub }: { run: RunView; events: number; seqs: number[]; scrub: number | null; onScrub: (seq: number | null) => void }) {
  const index = scrub === null ? seqs.length - 1 : Math.max(0, seqs.indexOf(scrub));
  const [forking, setForking] = useState(false);
  const fork = async () => {
    setForking(true);
    try {
      await launchRun({ ask: `Continue from ${run.id} at event #${scrub ?? run.lastSeq}: ${run.ask}`, repo: run.repo, runtime: run.runtime, model: run.model });
    } finally {
      setForking(false);
    }
  };
  return (
    <div>
      <Eyebrow className="mb-3">Timeline</Eyebrow>
      <input
        type="range"
        min={0}
        max={Math.max(0, seqs.length - 1)}
        value={index}
        onChange={(e) => {
          const i = Number(e.target.value);
          onScrub(i >= seqs.length - 1 ? null : (seqs[i] ?? null));
        }}
        className="w-full accent-[var(--amber)]"
        aria-label="Scrub through the run"
      />
      <div className="mt-1 flex justify-between text-[11px] text-fg-3">
        <span>start</span>
        <span className="mono">
          {index + 1} / {seqs.length}
        </span>
        <span>now</span>
      </div>
      <div className="mt-4 flex gap-2">
        <Button size="s" onClick={() => void fork()} disabled={forking}>
          <GitBranch size={12} /> Fork from here
        </Button>
        {scrub !== null && (
          <Button size="s" variant="ghost" onClick={() => onScrub(null)}>
            <Undo2 size={12} /> Live
          </Button>
        )}
      </div>
      <Eyebrow className="mb-2 mt-6">Checkpoints</Eyebrow>
      {run.checkpoints.length === 0 && <div className="text-[12px] text-fg-3">Each turn that changes files becomes a checkpoint.</div>}
      {run.checkpoints.map((c) => (
        <button key={c.seq} onClick={() => onScrub(c.seq)} className="mb-1.5 flex w-full items-center gap-2 rounded-[var(--radius-m)] border border-line px-2.5 py-2 text-left text-[12px] hover:border-line-strong">
          <StatusGlyph tone="ok" size={7} />
          turn {c.turn}
          <span className="mono ml-auto text-fg-3">{c.commit?.slice(0, 8) ?? `#${c.seq}`}</span>
        </button>
      ))}
    </div>
  );
}

/** A TASK.md run's steps, and where each one stands. */
function Plan({ events }: { events: import("@shuacrew/core/events").AnyEvent[] }) {
  const plan = events.find((e) => e.kind === "task.planned");
  const steps = plan?.kind === "task.planned" ? plan.body : undefined;
  const state = new Map<number, { status: string; run?: string; retries: number; detail: string }>();
  for (const e of events) {
    if (e.kind !== "task.step") continue;
    const s = state.get(e.body.index) ?? { status: "", retries: 0, detail: "" };
    s.status = e.body.status;
    if (e.body.run) s.run = e.body.run;
    if (e.body.status === "retrying") s.retries += 1;
    s.detail = e.body.detail;
    state.set(e.body.index, s);
  }
  if (!steps) return <div className="text-[12.5px] text-fg-3">Planning the steps…</div>;
  return (
    <div>
      <Eyebrow className="mb-3">{steps.steps.length} steps</Eyebrow>
      {steps.validate && (
        <div className="mb-3 text-[12px] text-fg-3">
          validated by <span className="mono text-fg-2">{steps.validate}</span> after each step
        </div>
      )}
      <ol className="flex flex-col gap-2">
        {steps.steps.map((text, i) => {
          const s = state.get(i);
          const tone = s?.status === "passed" ? "ok" : s?.status === "failed" ? "bad" : s?.status === "started" || s?.status === "retrying" ? "live" : "idle";
          return (
            <li key={i} className="rounded-[var(--radius-m)] border border-line bg-raised px-3 py-2 text-[12.5px]">
              <div className="flex items-start gap-2">
                <span className="mt-1">
                  <StatusGlyph tone={tone} size={7} />
                </span>
                <span className="min-w-0 flex-1">{text}</span>
                {s?.run && (
                  <Link to="/runs/$id" params={{ id: s.run }} className="text-[11px] text-amber hover:underline">
                    open
                  </Link>
                )}
              </div>
              {(s?.retries ?? 0) > 0 && <div className="mt-1 pl-4 text-[11px] text-amber">retried {s!.retries}×</div>}
              {s?.status === "failed" && <div className="mt-1 pl-4 text-[11px] text-bad">{s.detail}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Files({ run }: { run: RunView }) {
  return (
    <div>
      <div className="mb-3 flex items-center">
        <Eyebrow>{run.files.length} files changed</Eyebrow>
        {run.worktree && run.files.length > 0 && (
          <Link to="/review/$id" params={{ id: run.id }} className="ml-auto text-[12px] text-amber hover:underline">
            Open review →
          </Link>
        )}
      </div>
      {run.review?.landed && <div className="mb-3 text-[12px] text-ok">Merged · {run.review.landed.slice(0, 8)}</div>}
      {run.review?.failed && <div className="mb-3 text-[12px] text-bad">{run.review.failed}</div>}
      {run.files.length === 0 && <div className="text-[12px] text-fg-3">Nothing changed yet.</div>}
      {run.files.map((f) => (
        <div key={f} className="mono mb-1 truncate rounded-[var(--radius-s)] px-2 py-1 text-[12px] text-fg-2 hover:bg-raised" title={f}>
          {f}
        </div>
      ))}
      <Eyebrow className="mb-2 mt-6">Checks</Eyebrow>
      {run.checks.map((c) => (
        <div key={c.seq} className="mb-1 flex items-center gap-2 text-[12px]">
          <StatusGlyph tone={c.passed ? "ok" : "bad"} size={7} />
          <span className="mono truncate text-fg-2">{c.command}</span>
        </div>
      ))}
    </div>
  );
}

/** Parent → subagents → tools, as a small tree. (The full flow graph arrives with @xyflow.) */
function Graph({ run, items }: { run: RunView; items: Item[] }) {
  const tools = items.filter((i): i is Extract<Item, { kind: "tool" }> => i.kind === "tool");
  const own = tools.filter((t) => !t.subagent);
  return (
    <div className="text-[12px]">
      <Eyebrow className="mb-3">Orchestration</Eyebrow>
      <Node label={run.runtime} detail={`${own.length} tools`} tone={run.status === "running" ? "live" : "ok"} />
      <div className="ml-3 border-l border-line pl-3">
        {run.subagents.map((s) => (
          <div key={s.id} className="mt-2">
            <Node label={s.name} detail={s.task} tone={!s.done ? "live" : s.ok ? "ok" : "bad"} />
            <div className="ml-3 border-l border-line pl-3">
              {tools
                .filter((t) => t.subagent === s.id)
                .map((t) => (
                  <div key={t.id} className="mt-1.5">
                    <Node label={t.tool} detail={describe(t.input)} tone={t.ok === undefined ? "live" : t.ok ? "ok" : "bad"} small />
                  </div>
                ))}
            </div>
          </div>
        ))}
        {own.slice(-12).map((t) => (
          <div key={t.id} className="mt-1.5">
            <Node label={t.tool} detail={describe(t.input)} tone={t.ok === undefined ? "live" : t.ok ? "ok" : "bad"} small />
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({ label, detail, tone, small }: { label: string; detail: string; tone: "live" | "ok" | "bad"; small?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-[var(--radius-m)] border border-line bg-raised ${small ? "px-2 py-1" : "px-2.5 py-1.5"}`}>
      <StatusGlyph tone={tone} size={7} />
      <span className="mono text-fg">{label}</span>
      <span className="mono truncate text-fg-3">{detail}</span>
    </div>
  );
}

function Cost({ run }: { run: RunView }) {
  return (
    <div className="text-[12.5px]">
      <Eyebrow className="mb-3">Usage</Eyebrow>
      <Line label="Input tokens" value={run.usage.inputTokens.toLocaleString()} />
      <Line label="Output tokens" value={run.usage.outputTokens.toLocaleString()} />
      <Line label="Context" value={run.usage.contextUsed ? `${run.usage.contextUsed.toLocaleString()} / ${run.usage.contextLimit?.toLocaleString()}` : "—"} />
      <Line label="Spend" value={run.usage.costUsd > 0 ? `$${run.usage.costUsd.toFixed(4)}` : "on your plan"} />
      <Line label="Tool calls" value={`${run.toolCalls} (${run.failedTools} failed)`} />
      <Line label="Started" value={since(run.createdAt)} />
      <p className="mt-4 text-[12px] leading-relaxed text-fg-3">
        Subscription runtimes show tokens, not dollars: the scarce thing on a plan is the usage window, which the status bar watches.
      </p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-1.5">
      <span className="text-fg-3">{label}</span>
      <span className="mono tabular-nums text-fg">{value}</span>
    </div>
  );
}
