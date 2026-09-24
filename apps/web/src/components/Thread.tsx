import { Button, Chip } from "@shuacrew/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Bot,
  Brain,
  Check,
  ChevronRight,
  CircleX,
  Copy,
  FilePen,
  FilePlus2,
  FileText,
  GitCommitHorizontal,
  Globe,
  ListTree,
  LoaderCircle,
  Search,
  ShieldAlert,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { parseAnsi } from "../lib/ansi";
import { decideApproval } from "../lib/api";
import type { Item } from "../lib/conversation";
import { describe } from "../shell/CommandPalette";
import { CodeBlock, Markdown } from "./Markdown";

type Step = Extract<Item, { kind: "tool" | "files" | "check" | "subagent" | "denied" | "checkpoint" | "thought" }>;
type Block = { kind: "item"; key: string; item: Item } | { kind: "work"; key: string; steps: Step[]; live: boolean };
const STEP = new Set(["tool", "files", "check", "subagent", "denied", "checkpoint", "thought"]);

/** Consecutive steps fold into one "work" block between what the agent says. */
function toBlocks(items: Item[], working: boolean): Block[] {
  const out: Block[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (STEP.has(item.kind)) {
      if (last?.kind === "work") last.steps.push(item as Step);
      else out.push({ kind: "work", key: `w${item.seq}`, steps: [item as Step], live: false });
    } else out.push({ kind: "item", key: `i${item.seq}`, item });
  }
  const tail = out[out.length - 1];
  if (working && tail?.kind === "work") tail.live = true;
  return out;
}

/** A run's conversation, virtualised so a thousand-turn session scrolls like a short one. */
export function Thread({ items, working, empty }: { items: Item[]; working: boolean; empty?: ReactNode }) {
  const blocks = useMemo(() => toBlocks(items, working), [items, working]);
  const parent = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const virtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => parent.current,
    estimateSize: (i) => (blocks[i]?.kind === "work" ? 56 : 90),
    overscan: 8,
    getItemKey: (i) => blocks[i]?.key ?? i,
  });
  const last = items[items.length - 1];
  const growth = last?.kind === "prose" ? last.text.length : last?.kind === "tool" ? (last.output?.length ?? 0) : 0;

  useEffect(() => {
    if (stick.current && blocks.length) virtualizer.scrollToIndex(blocks.length - 1, { align: "end" });
  }, [blocks.length, growth, virtualizer]);

  const waiting = working && (!last || last.kind === "ask");
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
        {virtualizer.getVirtualItems().map((row) => {
          const block = blocks[row.index]!;
          return (
            <div key={row.key} data-index={row.index} ref={virtualizer.measureElement} className="absolute left-0 right-0 px-6 py-1.5" style={{ transform: `translateY(${row.start + 12}px)` }}>
              {block.kind === "work" ? <WorkGroup steps={block.steps} live={block.live} /> : <Row item={block.item} />}
            </div>
          );
        })}
      </div>
      {waiting && (
        <div className="mx-auto flex max-w-[820px] items-center gap-2.5 px-6 pb-6 text-[13px]" role="status">
          <span className="thinking-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className="shimmer-text">Thinking…</span>
        </div>
      )}
    </div>
  );
}

// ── what the agent says ─────────────────────────────────────────────────────────────────────

export const Row = memo(function Row({ item }: { item: Item }) {
  switch (item.kind) {
    case "ask":
      return (
        <div className="mt-6 flex justify-end">
          <div className="max-w-[78%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] border border-line bg-raised px-4 py-2.5 text-[14px] leading-relaxed text-fg shadow-[0_1px_0_rgba(255,255,255,.03)_inset]">{item.text}</div>
        </div>
      );
    case "prose":
      return (
        <div className={`agent-prose py-1 ${item.streaming ? "is-streaming" : ""}`}>
          <Markdown text={item.text} streaming={item.streaming} />
          {item.streaming && <span className="stream-caret" aria-hidden />}
        </div>
      );
    case "approval":
      return <ApprovalCard item={item} />;
    case "note":
      return <div className={`text-[12.5px] ${item.tone === "bad" ? "text-bad" : item.tone === "live" ? "text-amber" : item.tone === "wait" ? "text-wait" : "text-fg-3"}`}>{item.text}</div>;
    case "finished":
      return <Finished item={item} />;
    default:
      return <StepRow step={item as Step} />;
  }
});

function Finished({ item }: { item: Extract<Item, { kind: "finished" }> }) {
  return (
    <div className="flex items-center gap-2 pb-3 pt-0.5 text-[11.5px] text-fg-3">
      <span className="h-1 w-1 rounded-full bg-fg-3" />
      <span className="mono">{item.route}</span>
      {item.durationMs !== undefined && <span>· {fmtMs(item.durationMs)}</span>}
    </div>
  );
}

// ── what the agent does ─────────────────────────────────────────────────────────────────────

const VERBS: Array<[RegExp, string, string, typeof Wrench]> = [
  // pattern, past tense, present tense, icon
  [/^(bash|shell|commandexecution|exec)/i, "Ran", "Running", SquareTerminal],
  [/^(read|view|cat)/i, "Read", "Reading", FileText],
  [/^(write|create)/i, "Wrote", "Writing", FilePlus2],
  [/^(edit|multiedit|filechange|apply_patch|str_replace)/i, "Edited", "Editing", FilePen],
  [/^(grep|search)$/i, "Searched", "Searching", Search],
  [/^(glob|ls|find|list)/i, "Listed", "Listing", ListTree],
  [/^websearch/i, "Searched the web", "Searching the web", Globe],
  [/^(web|fetch|browse)/i, "Fetched", "Fetching", Globe],
  [/^(task|agent|spawn)/i, "Delegated", "Delegating", Bot],
];
function verbOf(tool: string): { past: string; doing: string; Icon: typeof Wrench } {
  const hit = VERBS.find(([re]) => re.test(tool));
  return hit ? { past: hit[1], doing: hit[2], Icon: hit[3] } : { past: tool, doing: tool, Icon: Wrench };
}
const isShell = (tool: string) => /^(bash|shell|commandexecution|exec)/i.test(tool);
const isEdit = (tool: string) => /^(edit|multiedit|write|create|filechange|apply_patch|str_replace)/i.test(tool);

/** One block of work: a live progress line while it runs, a one-line summary once it's done. */
function WorkGroup({ steps, live }: { steps: Step[]; live: boolean }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? live;
  const tools = steps.filter((s): s is Extract<Step, { kind: "tool" }> => s.kind === "tool");
  const failed = tools.filter((t) => t.ok === false).length;
  const edited = new Set([...tools.filter((t) => isEdit(t.tool)).map((t) => pathOf(t.input)).filter(Boolean), ...steps.flatMap((s) => (s.kind === "files" ? s.paths : []))]);
  const checks = steps.filter((s): s is Extract<Step, { kind: "check" }> => s.kind === "check");
  const lastCheck = checks[checks.length - 1];
  const ms = tools.reduce((n, t) => n + (t.durationMs ?? 0), 0);
  const current = [...tools].reverse().find((t) => t.ok === undefined) ?? tools[tools.length - 1];
  const doing = current ? verbOf(current.tool).doing : "Working";

  if (steps.length === 1 && steps[0]!.kind !== "tool") return <StepRow step={steps[0]!} />;
  return (
    <div className={`work-group ${live ? "is-live" : ""}`}>
      <button onClick={() => setOpen(!expanded)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px]" aria-expanded={expanded}>
        {live ? <LoaderCircle size={15} className="animate-spin text-amber" /> : failed && !lastCheck?.passed ? <CircleX size={15} className="text-bad" /> : <Check size={15} className="text-ok" />}
        {live ? (
          <span className="min-w-0 flex-1 truncate">
            <span className="shimmer-text font-medium">{doing}</span>
            {current && <span className="mono ml-2 text-[12px] text-fg-3">{describe(current.input)}</span>}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-fg-2">
            <span className="font-medium text-fg">Worked{ms >= 1000 ? ` for ${fmtMs(ms)}` : ""}</span>
            <span className="text-fg-3"> · {tools.length} step{tools.length === 1 ? "" : "s"}</span>
          </span>
        )}
        <span className="flex shrink-0 items-center gap-1.5">
          {edited.size > 0 && <Chip mono>{`${edited.size} file${edited.size === 1 ? "" : "s"}`}</Chip>}
          {lastCheck && <span className={`rounded-full px-2 py-0.5 text-[11px] ${lastCheck.passed ? "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok" : "bg-[color-mix(in_srgb,var(--bad)_14%,transparent)] text-bad"}`}>{lastCheck.passed ? "checks passed" : "checks failed"}</span>}
          {failed > 0 && <span className="text-[11px] text-bad">{failed} failed</span>}
          <ChevronRight size={14} className={`text-fg-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </span>
      </button>
      {expanded && (
        <div className="work-steps">
          {steps.map((step) => (
            <div key={step.seq} className="work-step">
              <StepRow step={step} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  switch (step.kind) {
    case "tool":
      if (isShell(step.tool)) return <ShellCard step={step} />;
      if (isEdit(step.tool)) return <FileCard step={step} />;
      return <ToolLine step={step} />;
    case "thought":
      return <Thought step={step} />;
    case "files":
      return (
        <div className="flex flex-wrap items-center gap-1.5 py-0.5 text-[12px] text-fg-2">
          <FilePen size={13} className="text-amber" />
          <span className="text-fg-3">Changed</span>
          {step.paths.map((p) => (
            <Chip key={p} mono title={p}>
              {p.split("/").pop()}
            </Chip>
          ))}
        </div>
      );
    case "check":
      return (
        <div className="flex items-center gap-2 py-0.5 text-[12.5px]">
          {step.passed ? <Check size={14} className="text-ok" /> : <CircleX size={14} className="text-bad" />}
          <span className={`font-medium ${step.passed ? "text-ok" : "text-bad"}`}>{step.passed ? "Checks passed" : "Checks failed"}</span>
          <span className="mono truncate text-[12px] text-fg-3">{step.command}</span>
        </div>
      );
    case "subagent":
      return (
        <div className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-line-strong px-3 py-2 text-[12.5px]">
          <Bot size={14} className={step.done ? (step.ok ? "text-ok" : "text-bad") : "text-amber"} />
          <span className="font-medium text-fg">{step.name}</span>
          <span className="min-w-0 flex-1 truncate text-fg-2">{step.done ? step.summary || step.task : step.task}</span>
          {!step.done && <span className="shimmer-text text-[11px]">working</span>}
        </div>
      );
    case "denied":
      return (
        <div className="flex items-center gap-2 rounded-[10px] bg-[color-mix(in_srgb,var(--bad)_8%,transparent)] px-3 py-2 text-[12.5px] text-bad">
          <ShieldAlert size={14} /> Blocked {step.tool} — {step.reason}
          <span className="mono ml-auto text-[11px] opacity-80">{step.rule}</span>
        </div>
      );
    case "checkpoint":
      return (
        <div className="flex items-center gap-2 py-0.5 text-[11.5px] text-fg-3">
          <GitCommitHorizontal size={13} />
          Checkpoint {step.commit && <span className="mono text-fg-2">{step.commit.slice(0, 7)}</span>}
        </div>
      );
  }
}

/** A command, shown the way it ran: prompt, colours, exit status. */
function ShellCard({ step }: { step: Extract<Step, { kind: "tool" }> }) {
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const input = (step.input ?? {}) as Record<string, unknown>;
  const command = typeof input.command === "string" ? input.command : describe(step.input);
  const output = (step.output ?? "").replace(/\n+$/, "");
  const lines = output ? output.split("\n") : [];
  const clipped = !full && lines.length > 12;
  const runs = useMemo(() => parseAnsi(clipped ? lines.slice(-12).join("\n") : output), [output, clipped]);
  return (
    <div className={`shell-card ${step.ok === false ? "is-failed" : ""}`}>
      <div className="shell-head">
        <span className="shell-prompt">❯</span>
        <span className="mono min-w-0 flex-1 truncate text-fg">{command}</span>
        <button onClick={() => void navigator.clipboard?.writeText(command).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)))} className="shell-icon" aria-label="Copy command">
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
        {step.ok === undefined ? (
          <LoaderCircle size={13} className="animate-spin text-amber" />
        ) : (
          <span className={`mono text-[11px] ${step.ok ? "text-ok" : "text-bad"}`}>{step.ok ? "✓" : "✗ exit"}</span>
        )}
        {step.durationMs !== undefined && <span className="mono text-[11px] tabular-nums text-fg-3">{fmtMs(step.durationMs)}</span>}
      </div>
      {output && (
        <div className="shell-body">
          {clipped && <button onClick={() => setFull(true)} className="shell-more">{`↑ ${lines.length - 12} earlier lines`}</button>}
          <pre>
            {runs.map((r, i) => (
              <span
                key={i}
                style={{ color: r.fg, background: r.bg, fontWeight: r.bold ? 600 : undefined, opacity: r.dim ? 0.65 : undefined, fontStyle: r.italic ? "italic" : undefined, textDecoration: r.underline ? "underline" : undefined }}
              >
                {r.text}
              </span>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}

/** An edit, as a file card: where, how much, and the change itself. */
function FileCard({ step }: { step: Extract<Step, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const input = (step.input ?? {}) as Record<string, unknown>;
  const file = pathOf(step.input) ?? "file";
  const before = typeof input.old_string === "string" ? input.old_string : "";
  const after = typeof input.new_string === "string" ? input.new_string : typeof input.content === "string" ? input.content : "";
  const removed = before ? before.split("\n").length : 0;
  const added = after ? after.split("\n").length : 0;
  const created = /^(write|create)/i.test(step.tool) && !before;
  const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
  const name = file.slice(dir.length);
  const Icon = created ? FilePlus2 : FilePen;
  return (
    <div className={`file-card ${step.ok === false ? "is-failed" : ""}`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px]" aria-expanded={open}>
        <Icon size={14} className={step.ok === undefined ? "text-amber" : step.ok ? "text-fg-2" : "text-bad"} />
        <span className="text-fg-3">{created ? "Created" : "Edited"}</span>
        <span className="mono min-w-0 flex-1 truncate">
          <span className="text-fg-3">{dir}</span>
          <span className="text-fg">{name}</span>
        </span>
        {(added > 0 || removed > 0) && (
          <span className="mono shrink-0 text-[11.5px]">
            <span className="text-ok">+{added}</span> <span className="text-bad">−{removed}</span>
          </span>
        )}
        {step.ok === undefined && <LoaderCircle size={13} className="animate-spin text-amber" />}
        <ChevronRight size={13} className={`text-fg-3 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open &&
        (before ? (
          <pre className="diff-body">
            {before.split("\n").map((l, i) => (
              <div key={`-${i}`} className="diff-del">
                <span className="diff-sign">−</span>
                {l}
              </div>
            ))}
            {after.split("\n").map((l, i) => (
              <div key={`+${i}`} className="diff-add">
                <span className="diff-sign">+</span>
                {l}
              </div>
            ))}
          </pre>
        ) : (
          <div className="px-2 pb-2">
            <CodeBlock code={after} lang={name} label={name} maxLines={30} />
          </div>
        ))}
      {step.ok === false && step.output && <div className="mono border-t border-line px-3 py-1.5 text-[11.5px] text-bad">{step.output.split("\n")[0]}</div>}
    </div>
  );
}

function ToolLine({ step }: { step: Extract<Step, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const { past, doing, Icon } = verbOf(step.tool);
  return (
    <div className="tool-line">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 py-1 text-left text-[12.5px]" aria-expanded={open}>
        <Icon size={14} className={step.ok === undefined ? "text-amber" : step.ok ? "text-fg-3" : "text-bad"} />
        <span className={step.ok === undefined ? "shimmer-text" : "text-fg-2"}>{step.ok === undefined ? doing : past}</span>
        <span className="mono min-w-0 flex-1 truncate text-[12px] text-fg-3">{describe(step.input) || JSON.stringify(step.input)}</span>
        {step.subagent && <Chip mono>{step.subagent}</Chip>}
        {step.durationMs !== undefined && <span className="mono text-[11px] tabular-nums text-fg-3">{fmtMs(step.durationMs)}</span>}
      </button>
      {open && (
        <pre className="mono ml-6 mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-[8px] border border-line bg-ink px-3 py-2 text-[11.5px] leading-relaxed text-fg-2">
          {step.output !== undefined && step.output !== "" ? step.output : JSON.stringify(step.input, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Thought({ step }: { step: Extract<Step, { kind: "thought" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-0.5">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-[12.5px] text-fg-3 hover:text-fg-2" aria-expanded={open}>
        <Brain size={14} />
        <span className="italic">Thinking</span>
        <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="ml-6 mt-1 whitespace-pre-wrap border-l border-line pl-3 text-[12.5px] italic leading-relaxed text-fg-3">{step.text}</div>}
    </div>
  );
}

function ApprovalCard({ item }: { item: Extract<Item, { kind: "approval" }> }) {
  const input = (item.input ?? {}) as Record<string, unknown>;
  const command = typeof input.command === "string" ? input.command : describe(item.input) || JSON.stringify(item.input);
  return (
    <div className={`approval-card ${item.decided ? "is-decided" : ""}`}>
      <div className="flex items-center gap-2 text-[13px]">
        <ShieldAlert size={15} className={item.decided ? (item.decided.allow ? "text-ok" : "text-bad") : "text-wait"} />
        <span className="font-semibold">{item.decided ? (item.decided.allow ? "Allowed" : "Denied") : "Needs your approval"}</span>
        <span className="text-fg-3">{item.tool}</span>
        {item.decided && <span className="text-fg-3">· by {item.decided.by}</span>}
        <span className={`ml-auto rounded-full border px-2 text-[10.5px] uppercase tracking-wide ${item.risk === "critical" || item.risk === "high" ? "border-[color-mix(in_srgb,var(--bad)_45%,transparent)] text-bad" : "border-line-strong text-fg-3"}`}>{item.risk}</span>
      </div>
      <div className="shell-card mt-2.5">
        <div className="shell-head">
          <span className="shell-prompt">❯</span>
          <span className="mono min-w-0 flex-1 whitespace-pre-wrap break-all text-fg">{command}</span>
        </div>
      </div>
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

function pathOf(input: unknown): string | undefined {
  const i = (input ?? {}) as Record<string, unknown>;
  const p = i.file_path ?? i.path ?? i.filePath;
  return typeof p === "string" ? p.replace(/^\/Users\/[^/]+/, "~") : undefined;
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
