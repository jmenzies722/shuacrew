import { Button, Chip, StatusGlyph } from "@shuacrew/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bot, Check, ChevronRight, FilePen, FileText, Globe, GitCommitHorizontal, Search, ShieldAlert, SquareTerminal, Wrench, X } from "lucide-react";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { decideApproval } from "../lib/api";
import type { Item } from "../lib/conversation";
import { describe } from "../shell/CommandPalette";
import { Markdown } from "./Markdown";

/** A run's conversation, virtualised so a thousand-turn session scrolls like a short one. */
export function Thread({ items, working, empty }: { items: Item[]; working: boolean; empty?: ReactNode }) {
  const parent = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parent.current,
    estimateSize: (i) => (items[i]?.kind === "prose" ? 90 : items[i]?.kind === "ask" ? 70 : 38),
    overscan: 12,
    getItemKey: (i) => items[i]?.seq ?? i,
  });
  const last = items[items.length - 1];
  const lastLength = last?.kind === "prose" ? last.text.length : 0;

  useEffect(() => {
    if (stick.current && items.length) virtualizer.scrollToIndex(items.length - 1, { align: "end" });
  }, [items.length, lastLength, virtualizer]);

  return (
    <div
      ref={parent}
      className="min-h-0 flex-1 overflow-y-auto"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {items.length === 0 && empty}
      <div className="relative mx-auto w-full max-w-[820px]" style={{ height: virtualizer.getTotalSize() + 16 }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div key={row.key} data-index={row.index} ref={virtualizer.measureElement} className="absolute left-0 right-0 px-6 py-1.5" style={{ transform: `translateY(${row.start + 12}px)` }}>
            <Row item={items[row.index]!} />
          </div>
        ))}
      </div>
      {working && (
        <div className="mx-auto flex max-w-[820px] items-center gap-2 px-6 pb-6 text-[12.5px] text-amber" role="status">
          <span className="thinking-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          Thinking…
        </div>
      )}
    </div>
  );
}

const TOOL_ICONS: Array<[RegExp, typeof Wrench]> = [
  [/^(bash|shell|commandexecution|exec)/i, SquareTerminal],
  [/^(read|view|cat)/i, FileText],
  [/^(edit|write|multiedit|filechange|apply_patch|str_replace)/i, FilePen],
  [/^(grep|glob|search|find|ls)/i, Search],
  [/^(web|fetch|browse)/i, Globe],
  [/^(task|agent|spawn)/i, Bot],
];
const iconFor = (tool: string) => TOOL_ICONS.find(([re]) => re.test(tool))?.[1] ?? Wrench;

export const Row = memo(function Row({ item }: { item: Item }) {
  switch (item.kind) {
    case "ask":
      return (
        <div className="mt-5 flex justify-end">
          <div className="max-w-[78%] whitespace-pre-wrap rounded-[16px] rounded-br-[6px] bg-raised px-4 py-2.5 text-[14px] leading-relaxed text-fg">{item.text}</div>
        </div>
      );
    case "prose":
      return (
        <div className="py-1 text-[14px] leading-[1.65] text-fg">
          <Markdown text={item.text} />
          {item.streaming && <span className="ml-0.5 inline-block h-3.5 w-[7px] translate-y-0.5 bg-amber align-baseline" style={{ animation: "pulse-dot 1s steps(2) infinite" }} />}
        </div>
      );
    case "tool":
      return <ToolBlock item={item} />;
    case "files":
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-2">
          <FilePen size={13} className="text-amber" />
          <span className="text-fg-3">Edited</span>
          {item.paths.map((p) => (
            <Chip key={p} mono title={p}>
              {p.split("/").pop()}
            </Chip>
          ))}
        </div>
      );
    case "check":
      return (
        <div className="flex items-center gap-2 text-[12.5px]">
          {item.passed ? <Check size={14} className="text-ok" /> : <X size={14} className="text-bad" />}
          <span className={`font-medium ${item.passed ? "text-ok" : "text-bad"}`}>{item.passed ? "Checks passed" : "Checks failed"}</span>
          <span className="mono truncate text-[12px] text-fg-3">{item.command}</span>
        </div>
      );
    case "subagent":
      return (
        <div className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-line-strong px-3 py-2 text-[12.5px]">
          <Bot size={14} className={item.done ? (item.ok ? "text-ok" : "text-bad") : "text-amber"} />
          <span className="font-medium text-fg">{item.name}</span>
          <span className="min-w-0 flex-1 truncate text-fg-2">{item.done ? item.summary || item.task : item.task}</span>
          {!item.done && <span className="text-[11px] text-amber">working</span>}
        </div>
      );
    case "approval":
      return <ApprovalCard item={item} />;
    case "denied":
      return (
        <div className="flex items-center gap-2 rounded-[10px] bg-[color-mix(in_srgb,var(--bad)_8%,transparent)] px-3 py-2 text-[12.5px] text-bad">
          <ShieldAlert size={14} /> Blocked {item.tool} — {item.reason}
          <span className="mono ml-auto text-[11px] opacity-80">{item.rule}</span>
        </div>
      );
    case "checkpoint":
      return (
        <div className="flex items-center gap-2 py-1 text-[11px] text-fg-3">
          <span className="h-px flex-1 bg-line" />
          <GitCommitHorizontal size={12} />
          checkpoint {item.commit && <span className="mono">{item.commit.slice(0, 7)}</span>}
          <span className="h-px flex-1 bg-line" />
        </div>
      );
    case "note":
      return <div className={`text-[12.5px] ${item.tone === "bad" ? "text-bad" : item.tone === "live" ? "text-amber" : item.tone === "wait" ? "text-wait" : "text-fg-3"}`}>{item.text}</div>;
    case "finished":
      return (
        <div className="pb-2 text-[11px] text-fg-3">
          {item.route}
          {item.durationMs !== undefined && ` · ${fmtMs(item.durationMs)}`}
        </div>
      );
  }
});

/** One tool call: what it did at a glance, everything it did one click away. */
function ToolBlock({ item }: { item: Extract<Item, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const Icon = iconFor(item.tool);
  const input = (item.input ?? {}) as Record<string, unknown>;
  const edit = typeof input.old_string === "string" && typeof input.new_string === "string" ? { before: input.old_string, after: input.new_string } : null;
  const detail = describe(item.input) || JSON.stringify(item.input);
  return (
    <div className={`overflow-hidden rounded-[10px] border bg-panel ${item.ok === false ? "border-[color-mix(in_srgb,var(--bad)_35%,transparent)]" : "border-line"}`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] hover:bg-raised" aria-expanded={open}>
        <Icon size={14} className={item.ok === undefined ? "text-amber" : item.ok ? "text-fg-2" : "text-bad"} />
        <span className="font-medium text-fg">{item.tool}</span>
        <span className="mono min-w-0 flex-1 truncate text-[12px] text-fg-2">{detail}</span>
        {item.subagent && <Chip mono>{item.subagent}</Chip>}
        {item.ok === undefined ? <StatusGlyph tone="live" size={7} /> : item.durationMs !== undefined && <span className="mono text-[11px] tabular-nums text-fg-3">{fmtMs(item.durationMs)}</span>}
        <ChevronRight size={13} className={`text-fg-3 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-line bg-ink">
          {edit ? (
            <pre className="mono max-h-80 overflow-auto px-3 py-2 text-[11.5px] leading-relaxed">
              {edit.before.split("\n").map((l, i) => (
                <div key={`-${i}`} className="bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] text-bad">- {l}</div>
              ))}
              {edit.after.split("\n").map((l, i) => (
                <div key={`+${i}`} className="bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-ok">+ {l}</div>
              ))}
            </pre>
          ) : (
            <pre className="mono max-h-80 overflow-auto whitespace-pre-wrap break-all px-3 py-2 text-[11.5px] leading-relaxed text-fg-2">{typeof input.command === "string" ? `$ ${input.command}` : JSON.stringify(item.input, null, 2)}</pre>
          )}
          {item.output !== undefined && item.output !== "" && (
            <pre className="mono max-h-80 overflow-auto whitespace-pre-wrap break-all border-t border-line px-3 py-2 text-[11.5px] leading-relaxed text-fg-3">{item.output}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ item }: { item: Extract<Item, { kind: "approval" }> }) {
  return (
    <div className="rounded-[12px] border border-[color-mix(in_srgb,var(--wait)_45%,transparent)] bg-[color-mix(in_srgb,var(--wait)_6%,transparent)] p-3.5">
      <div className="flex items-center gap-2 text-[13px]">
        <ShieldAlert size={15} className="text-wait" />
        <span className="font-semibold">{item.decided ? (item.decided.allow ? "Allowed" : "Denied") : "Needs your approval"}</span>
        <span className="text-fg-3">{item.tool}</span>
        {item.decided && <span className="text-fg-3">· by {item.decided.by}</span>}
        <span className="ml-auto rounded-full border border-line-strong px-2 text-[10.5px] uppercase tracking-wide text-fg-3">{item.risk}</span>
      </div>
      <pre className="mono mt-2.5 whitespace-pre-wrap break-all rounded-[8px] bg-ink px-3 py-2 text-[12px] text-fg">{describe(item.input) || JSON.stringify(item.input)}</pre>
      <div className="mt-2 text-[12px] text-fg-3">{item.reason}</div>
      {!item.decided && (
        <div className="mt-3 flex gap-1.5">
          <Button variant="primary" size="s" onClick={() => void decideApproval(item.id, true)}>
            Allow
          </Button>
          <Button size="s" onClick={() => void decideApproval(item.id, true, { always: true })}>
            Always allow
          </Button>
          <Button variant="danger" size="s" onClick={() => void decideApproval(item.id, false)}>
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
