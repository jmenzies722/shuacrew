import type { RunView } from "@shuacrew/core/projections";
import { Button, Chip, Eyebrow, Gauge, Kbd, StatusGlyph, StatusPill, formatTokens, since } from "@shuacrew/ui";
import { Link, useParams } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, GitBranch, Undo2 } from "lucide-react";
import { motion } from "motion/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "../components/Markdown";
import { cancelRun, decideApproval, followUp, launchRun } from "../lib/api";
import { conversation, type Item } from "../lib/conversation";
import { useLive } from "../lib/live";
import { describe } from "../shell/CommandPalette";

const TABS = ["Timeline", "Files", "Graph", "Cost"] as const;
type Tab = (typeof TABS)[number];

export function RunDetail() {
  const { id } = useParams({ from: "/runs/$id" });
  const run = useLive((s) => s.crew.runs[id]);
  const events = useLive((s) => s.runEvents[id]);
  const loadRun = useLive((s) => s.loadRun);
  const [tab, setTab] = useState<Tab>("Timeline");
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    void loadRun(id);
  }, [id, loadRun]);

  const items = useMemo(() => conversation(events ?? [], scrub ?? Number.POSITIVE_INFINITY), [events, scrub]);

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center text-fg-3">
        No run {id}. <Link to="/" className="ml-2 text-amber">Back to Mission Control</Link>
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
        <Conversation items={items} live={run.status === "running" && scrub === null} />
        {scrub === null && <Composer run={run} />}
      </section>
      <aside className="flex min-h-0 flex-col border-l border-line bg-panel max-[1100px]:hidden" aria-label="Run details">
        <div role="tablist" className="flex gap-1 border-b border-line px-3 pt-3">
          {TABS.map((t) => (
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
          {tab === "Timeline" && <Timeline run={run} events={events?.length ?? 0} scrub={scrub} onScrub={setScrub} seqs={(events ?? []).map((e) => e.seq)} />}
          {tab === "Files" && <Files run={run} />}
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
          <Link to="/" className="hover:text-fg-2">Mission Control</Link>
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
function Conversation({ items, live }: { items: Item[]; live: boolean }) {
  const parent = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parent.current,
    estimateSize: (i) => (items[i]?.kind === "prose" ? 90 : items[i]?.kind === "ask" ? 70 : 36),
    overscan: 12,
    getItemKey: (i) => items[i]?.seq ?? i,
  });

  useEffect(() => {
    if (stick.current && items.length) virtualizer.scrollToIndex(items.length - 1, { align: "end" });
  }, [items.length, items[items.length - 1]?.kind === "prose" ? (items[items.length - 1] as { text: string }).text.length : 0, virtualizer]);

  return (
    <div
      ref={parent}
      className="min-h-0 flex-1 overflow-y-auto"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      <div className="relative mx-auto w-full max-w-[860px]" style={{ height: virtualizer.getTotalSize() + 24 }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div key={row.key} data-index={row.index} ref={virtualizer.measureElement} className="absolute left-0 right-0 px-6 py-1.5" style={{ transform: `translateY(${row.start + 12}px)` }}>
            <Row item={items[row.index]!} />
          </div>
        ))}
      </div>
      {live && (
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-6 pb-6 text-[12px] text-amber">
          <StatusGlyph tone="live" size={7} /> working…
        </div>
      )}
    </div>
  );
}

const Row = memo(function Row({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  switch (item.kind) {
    case "ask":
      return (
        <div className="mt-4 flex justify-end">
          <div className="max-w-[80%] rounded-[var(--radius-l)] border border-line bg-raised px-4 py-2.5 text-[13.5px] leading-relaxed">
            {item.text}
            <div className="mt-1 text-right text-[10.5px] text-fg-3">
              {item.by} · turn {item.turn}
            </div>
          </div>
        </div>
      );
    case "prose":
      return (
        <div className="py-1 text-[13.5px] text-fg">
          <Markdown text={item.text} />
          {item.streaming && <span className="ml-0.5 inline-block h-3.5 w-[7px] translate-y-0.5 bg-amber align-baseline" style={{ animation: "pulse-dot 1s steps(2) infinite" }} />}
        </div>
      );
    case "tool":
      return (
        <div className="rounded-[var(--radius-m)] border border-line bg-panel">
          <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px]" aria-expanded={open}>
            <StatusGlyph tone={item.ok === undefined ? "live" : item.ok ? "ok" : "bad"} size={7} />
            <span className="mono font-medium text-fg">{item.tool}</span>
            <span className="mono min-w-0 flex-1 truncate text-fg-2">{describe(item.input) || JSON.stringify(item.input)}</span>
            {item.subagent && <Chip mono>{item.subagent}</Chip>}
            {item.durationMs !== undefined && <span className="mono text-[11px] tabular-nums text-fg-3">{fmtMs(item.durationMs)}</span>}
            <ChevronRight size={13} className={`text-fg-3 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
          {open && (
            <pre className="mono max-h-72 overflow-auto border-t border-line px-3 py-2 text-[11.5px] leading-relaxed text-fg-2">
              {JSON.stringify(item.input, null, 2)}
              {item.output !== undefined && `\n\n→ ${item.output}`}
            </pre>
          )}
        </div>
      );
    case "files":
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-2">
          <span className="text-fg-3">edited</span>
          {item.paths.map((p) => (
            <Chip key={p} mono title={p}>
              {p.split("/").pop()}
            </Chip>
          ))}
        </div>
      );
    case "check":
      return (
        <div className="flex items-center gap-2 text-[12px]">
          <StatusGlyph tone={item.passed ? "ok" : "bad"} />
          <span className={item.passed ? "text-ok" : "text-bad"}>{item.passed ? "Checks passed" : "Checks failed"}</span>
          <span className="mono truncate text-fg-3">{item.command}</span>
          <span className="mono ml-auto truncate text-[11px] text-fg-3">{item.output.split("\n")[0]}</span>
        </div>
      );
    case "subagent":
      return (
        <div className="flex items-center gap-2 rounded-[var(--radius-m)] border border-dashed border-line-strong px-3 py-1.5 text-[12px]">
          <StatusGlyph tone={!item.done ? "live" : item.ok ? "ok" : "bad"} size={7} />
          <span className="mono text-fg">{item.name}</span>
          <span className="truncate text-fg-2">{item.done ? item.summary || item.task : item.task}</span>
        </div>
      );
    case "approval":
      return <ApprovalInline item={item} />;
    case "denied":
      return (
        <div className="flex items-center gap-2 rounded-[var(--radius-m)] bg-[color-mix(in_srgb,var(--bad)_8%,transparent)] px-3 py-1.5 text-[12px] text-bad">
          <StatusGlyph tone="bad" /> Blocked {item.tool} — {item.reason} <span className="mono ml-auto text-[11px]">{item.rule}</span>
        </div>
      );
    case "checkpoint":
      return (
        <div className="flex items-center gap-2 text-[11px] text-fg-3">
          <span className="h-px flex-1 bg-line" />
          checkpoint · turn {item.turn}
          {item.commit && <span className="mono">{item.commit.slice(0, 8)}</span>}
          <span className="h-px flex-1 bg-line" />
        </div>
      );
    case "note":
      return (
        <div className={`text-[12px] ${item.tone === "bad" ? "text-bad" : item.tone === "live" ? "text-amber" : "text-fg-3"}`}>
          {item.text}
        </div>
      );
    case "finished":
      return (
        <div className="pb-2 text-[11px] text-fg-3">
          — {item.route}
          {item.durationMs !== undefined && ` · ${fmtMs(item.durationMs)}`}
        </div>
      );
  }
});

function ApprovalInline({ item }: { item: Extract<Item, { kind: "approval" }> }) {
  return (
    <div className="rounded-[var(--radius-m)] border border-[color-mix(in_srgb,var(--wait)_40%,transparent)] bg-[color-mix(in_srgb,var(--wait)_6%,transparent)] p-3">
      <div className="flex items-center gap-2 text-[12.5px]">
        <StatusGlyph tone="wait" />
        <span className="font-medium">{item.decided ? (item.decided.allow ? "Allowed" : "Denied") : "Needs your approval"}</span>
        {item.decided && <span className="text-fg-3">by {item.decided.by}</span>}
        <span className="ml-auto text-[11px] uppercase text-fg-3">{item.risk} risk</span>
      </div>
      <pre className="mono mt-2 whitespace-pre-wrap break-all text-[12px] text-fg">
        {item.tool}: {describe(item.input) || JSON.stringify(item.input)}
      </pre>
      <div className="mt-1 text-[11.5px] text-fg-3">
        {item.reason} · <span className="mono">{item.rule}</span>
      </div>
      {!item.decided && (
        <div className="mt-2.5 flex gap-1.5">
          <Button variant="primary" size="s" onClick={() => void decideApproval(item.id, true)}>
            Allow
          </Button>
          <Button size="s" onClick={() => void decideApproval(item.id, true, { always: true })}>
            Always
          </Button>
          <Button variant="danger" size="s" onClick={() => void decideApproval(item.id, false)}>
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}

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

function Files({ run }: { run: RunView }) {
  return (
    <div>
      <Eyebrow className="mb-3">{run.files.length} files changed</Eyebrow>
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

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
