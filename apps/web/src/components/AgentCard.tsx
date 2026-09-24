import type { RunView } from "@shuacrew/core/projections";
import { Chip, Gauge, StatusPill, formatTokens, since } from "@shuacrew/ui";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { memo } from "react";
import { pauseClock } from "../lib/crew";
import { useLive } from "../lib/live";

/**
 * A live agent at a glance: breathing while it works, its current tool, the last line it wrote,
 * how full its context is, and what it has used — without opening anything.
 */
export const AgentCard = memo(function AgentCard({ run, compact = false }: { run: RunView; compact?: boolean }) {
  const limited = useLive((s) => s.crew.limited);
  const live = run.status === "running" || run.status === "planning";
  const waiting = run.status === "awaiting_approval";
  const pause = pauseClock(run, limited);
  const tokens = run.usage.inputTokens + run.usage.outputTokens;
  const subagents = run.subagents.filter((s) => !s.done).length;
  return (
    <motion.div layout layoutId={`run-${run.id}`} transition={{ type: "spring", stiffness: 500, damping: 40 }}>
      <div
        className={`group relative rounded-[var(--radius-l)] border bg-panel p-3.5 transition-colors hover:border-line-strong ${live ? "breathing border-transparent" : waiting ? "border-[color-mix(in_srgb,var(--wait)_45%,transparent)]" : "border-line"}`}
        style={{ boxShadow: live ? undefined : "var(--shadow)" }}
      >
        <Link to="/sessions/$id" params={{ id: run.id }} className="absolute inset-0 z-0 rounded-[inherit]" aria-label={`${run.title}, ${run.status}`} />
        <div className="pointer-events-none relative z-10">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className={`text-[13.5px] font-medium text-fg ${compact ? "line-clamp-2" : "truncate"}`}>{run.title}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-fg-3">
              {compact && <StatusPill status={run.status} reason={run.statusReason} />}
              <span className="mono">{run.runtime}</span>
              {run.model && <span className="mono truncate">· {run.model}</span>}
              {run.worktree && <span className="mono truncate">· {run.worktree.branch}</span>}
            </div>
          </div>
          {!compact && <StatusPill status={run.status} reason={run.statusReason} />}
        </div>

        {!compact && (
          <div className="mono mt-3 h-[34px] overflow-hidden text-[12px] leading-[17px] text-fg-2" aria-live="off">
            {run.ticker ? <span className="line-clamp-2">{run.ticker}</span> : <span className="text-fg-3">{run.status === "queued" ? "Waiting for a free slot…" : run.statusReason ?? "—"}</span>}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {run.currentTool && (
            <Chip tone="live" mono>
              ▸ {run.currentTool}
            </Chip>
          )}
          {waiting && <Chip tone="wait">{run.pendingApprovals.length} awaiting you</Chip>}
          {pause && <Chip tone="live">{pause}</Chip>}
          {run.lessons.length > 0 && (
            <Link to="/memory" className="pointer-events-auto relative" title="Lessons this run was given">
              <Chip>{run.lessons.length === 1 ? "1 lesson" : `${run.lessons.length} lessons`}</Chip>
            </Link>
          )}
          {subagents > 0 && <Chip mono>{subagents} subagents</Chip>}
          {run.checks.length > 0 && (
            <Chip tone={run.checks[run.checks.length - 1]?.passed ? "ok" : "bad"} mono>
              {run.checks[run.checks.length - 1]?.passed ? "✓" : "✗"} checks
            </Chip>
          )}
          {run.files.length > 0 && <Chip mono>{run.files.length} files</Chip>}
          <span className="ml-auto flex items-center gap-3">
            <Gauge used={run.usage.contextUsed} limit={run.usage.contextLimit} />
            <span className="mono text-[11px] tabular-nums text-fg-2" title="Tokens used by this run">
              {formatTokens(tokens)}
              {run.usage.costUsd > 0 && <> · ${run.usage.costUsd.toFixed(2)}</>}
            </span>
            <span className="text-[11px] text-fg-3">{since(run.updatedAt)}</span>
          </span>
        </div>
        </div>
      </div>
    </motion.div>
  );
});
