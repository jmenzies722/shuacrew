import { Button, Chip, formatTokens } from "@shuacrew/ui";
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
import type { RunView } from "@shuacrew/core/projections";
import { Columns2, GitFork, Pencil, RotateCcw, Rows2, Sparkles, X } from "lucide-react";
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { parseAnsi } from "../lib/ansi";
import { api, decideApproval, followUp } from "../lib/api";
import { policyLine } from "../lib/crew";
import type { Item } from "../lib/conversation";
import { suggestions } from "../lib/followups";
import { splitAttachments } from "../lib/attachments";
import { DiffView, diffStat } from "./DiffView";
import { describe } from "../shell/CommandPalette";
import { CodeBlock, Markdown } from "./Markdown";

/** What every card in a thread may need: the session it belongs to, and whether it's working. */
const ThreadContext = createContext<{ run?: RunView; working: boolean }>({ working: false });

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
export function Thread({ items, working, empty, run }: { items: Item[]; working: boolean; empty?: ReactNode; run?: RunView }) {
  const blocks = useMemo(() => toBlocks(items, working), [items, working]);
  const context = useMemo(() => ({ run, working }), [run, working]);
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

  // Stay pinned to the bottom as content grows — every frame of a smooth reveal, not per chunk —
  // unless you've scrolled up to read.
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = parent.current;
    const inner = list.current;
    if (!el || !inner) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (stick.current) el.scrollTop = el.scrollHeight;
      });
    };
    const observer = new ResizeObserver(follow);
    observer.observe(inner);
    for (const child of inner.children) observer.observe(child);
    const mutations = new MutationObserver(() => {
      for (const child of inner.children) observer.observe(child);
      follow();
    });
    mutations.observe(inner, { childList: true });
    follow();
    return () => (observer.disconnect(), mutations.disconnect(), cancelAnimationFrame(frame));
  }, []);
  useEffect(() => {
    if (stick.current && blocks.length) virtualizer.scrollToIndex(blocks.length - 1, { align: "end" });
  }, [blocks.length, virtualizer]);
  void growth;

  const waiting = working && (!last || last.kind === "ask");
  // The last reply's own options, as pills — only once the turn has finished.
  const pills = useMemo(() => {
    if (working || !run || last?.kind !== "finished") return [];
    const reply = [...items].reverse().find((i): i is Extract<Item, { kind: "prose" }> => i.kind === "prose");
    return reply ? suggestions(reply.text) : [];
  }, [items, working, run, last]);
  const turns = useMemo(() => blocks.flatMap((b, index) => (b.kind === "item" && b.item.kind === "ask" ? [{ index, text: b.item.text, turn: b.item.turn }] : [])), [blocks]);

  return (
    <ThreadContext.Provider value={context}>
    <div className="relative flex min-h-0 flex-1">
    {turns.length > 1 && <Minimap turns={turns} onJump={(index) => ((stick.current = false), virtualizer.scrollToIndex(index, { align: "start" }))} />}
    <Find blocks={blocks} scroller={parent} onJump={(index) => ((stick.current = false), virtualizer.scrollToIndex(index, { align: "center" }))} />
    <div
      ref={parent}
      className="min-h-0 flex-1 overflow-y-auto"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {items.length === 0 && empty}
      <div ref={list} className="relative mx-auto w-full max-w-[820px]" style={{ height: virtualizer.getTotalSize() + 16 }}>
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
      {pills.length > 0 && run && <FollowUps options={pills} run={run} />}
    </div>
    </div>
    </ThreadContext.Provider>
  );
}

/** One click sends the reply's own suggestion as your next message. */
function FollowUps({ options, run }: { options: string[]; run: RunView }) {
  const [sent, setSent] = useState<string | null>(null);
  return (
    <div className="mx-auto flex max-w-[820px] flex-wrap gap-2 px-6 pb-6">
      {options.map((o) => (
        <button
          key={o}
          disabled={sent !== null}
          onClick={() => {
            setSent(o);
            void followUp(run.id, o).catch(() => setSent(null));
          }}
          className={`followup-pill ${sent === o ? "is-sent" : ""}`}
        >
          <Sparkles size={12} />
          {o}
        </button>
      ))}
    </div>
  );
}

/** One mark per turn down the left edge; hover to preview what you asked, click to jump there. */
function Minimap({ turns, onJump }: { turns: Array<{ index: number; text: string; turn: number }>; onJump: (index: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <nav className="minimap" aria-label="Turns">
      {turns.map((t, i) => (
        <button key={t.index} className="minimap-mark" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => onJump(t.index)} aria-label={`Turn ${t.turn}: ${t.text.slice(0, 60)}`}>
          <span />
          {hover === i && (
            <span className="minimap-preview">
              <span className="text-fg-3">Turn {t.turn}</span>
              {t.text.slice(0, 140)}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

/**
 * ⌘F inside a conversation: every match, next and previous, painted with the CSS Highlight API
 * so the text never reflows. Searches the whole thread, not just what's on screen.
 */
function Find({ blocks, scroller, onJump }: { blocks: Block[]; scroller: React.RefObject<HTMLDivElement | null>; onJump: (index: number) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const text = (b: Block) =>
    b.kind === "item"
      ? "text" in b.item ? String(b.item.text) : ""
      : b.steps.map((st) => (st.kind === "tool" ? `${describe(st.input)} ${st.output ?? ""}` : "text" in st ? String(st.text) : "")).join(" ");
  const hits = useMemo(() => (query.trim().length < 2 ? [] : blocks.flatMap((b, i) => (text(b).toLowerCase().includes(query.toLowerCase()) ? [i] : []))), [blocks, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && scroller.current?.closest("section")?.contains(document.activeElement ?? document.body)) {
        e.preventDefault();
        if (open) input.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scroller, open]);

  // Paint matches in whatever is rendered; repaint as rows scroll into view.
  useEffect(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!registry || !HighlightCtor) return;
    const paint = () => {
      const root = scroller.current;
      if (!open || !root || query.trim().length < 2) return registry.delete("find");
      const ranges: Range[] = [];
      const needle = query.toLowerCase();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const hay = node.textContent?.toLowerCase() ?? "";
        for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) {
          const r = document.createRange();
          r.setStart(node, i);
          r.setEnd(node, i + needle.length);
          ranges.push(r);
        }
      }
      registry.set("find", new HighlightCtor(...ranges));
    };
    paint();
    const el = scroller.current;
    el?.addEventListener("scroll", paint, { passive: true });
    return () => {
      el?.removeEventListener("scroll", paint);
      registry.delete("find");
    };
  }, [open, query, hits, at, scroller]);

  if (!open) return null;
  const go = (d: number) => {
    if (!hits.length) return;
    const next = (at + d + hits.length) % hits.length;
    setAt(next);
    onJump(hits[next]!);
  };
  return (
    <div className="find-bar" role="search">
      <Search size={13} className="text-fg-3" />
      <input
        ref={input}
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setAt(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") go(e.shiftKey ? -1 : 1);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Find in conversation"
        aria-label="Find in conversation"
      />
      <span className="mono text-[11px] text-fg-3">{query.trim().length < 2 ? "" : hits.length ? `${at + 1}/${hits.length}` : "0"}</span>
      <button onClick={() => go(-1)} aria-label="Previous match" className="find-btn">↑</button>
      <button onClick={() => go(1)} aria-label="Next match" className="find-btn">↓</button>
      <button onClick={() => setOpen(false)} aria-label="Close find" className="find-btn">
        <X size={12} />
      </button>
    </div>
  );
}

// ── what the agent says ─────────────────────────────────────────────────────────────────────

/** What a row shows, as a string: equal signatures mean nothing visible changed. */
function signature(item: Item): string {
  switch (item.kind) {
    case "prose":
    case "thought":
      return `${item.kind}${item.seq}:${item.text.length}:${item.streaming}`;
    case "tool":
      return `t${item.seq}:${item.ok}:${item.output?.length ?? -1}:${item.durationMs ?? -1}`;
    case "approval":
      return `a${item.seq}:${item.decided ? `${item.decided.allow}` : "open"}`;
    case "subagent":
      return `s${item.seq}:${item.done}:${item.ok}`;
    case "files":
      return `f${item.seq}:${item.paths.length}`;
    case "finished":
      return `d${item.seq}:${item.lessons.length}`;
    default:
      return `${item.kind}${item.seq}`;
  }
}

export const Row = memo(function Row({ item }: { item: Item }) {
  switch (item.kind) {
    case "ask":
      return <UserMessage item={item} />;
    case "compacted":
      return (
        <div className="compacted-card">
          <Sparkles size={13} className="text-amber" />
          <span className="font-medium text-fg-2">Context compacted</span>
          <span className="text-fg-3">— older turns were summarised so the agent keeps room to work</span>
        </div>
      );
    case "prose":
      return <Prose text={item.text} streaming={item.streaming} />;
    case "approval":
      return <ApprovalCard item={item} />;
    case "note":
      return <div className={`text-[12.5px] ${item.tone === "bad" ? "text-bad" : item.tone === "live" ? "text-amber" : item.tone === "wait" ? "text-wait" : "text-fg-3"}`}>{item.text}</div>;
    case "finished":
      return <Finished item={item} />;
    default:
      return <StepRow step={item as Step} />;
  }
}, (a, b) => signature(a.item) === signature(b.item));

/** What you asked — copy it, or edit it and send it again. */
function UserMessage({ item }: { item: Extract<Item, { kind: "ask" }> }) {
  const { run, working } = useContext(ThreadContext);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [copied, setCopied] = useState(false);
  const send = async () => {
    if (!run || !draft.trim()) return;
    await followUp(run.id, draft.trim());
    setEditing(false);
  };
  if (editing) {
    return (
      <div className="mt-6 flex justify-end">
        <div className="edit-bubble">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus rows={Math.min(8, draft.split("\n").length + 1)} onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), void send());
            if (e.key === "Escape") setEditing(false);
          }} aria-label="Edit your message" />
          <div className="flex items-center justify-end gap-1.5">
            <span className="mr-auto text-[11px] text-fg-3">Sends as a new message — the original stays in the history</span>
            <Button size="s" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="s" variant="primary" onClick={() => void send()} disabled={!draft.trim()}>{working ? "Queue" : "Send"}</Button>
          </div>
        </div>
      </div>
    );
  }
  const { body, files } = splitAttachments(item.text);
  return (
    <div className="group mt-6 flex flex-col items-end" data-turn={item.turn}>
      {files.length > 0 && (
        <div className="mb-1.5 flex max-w-[78%] flex-wrap justify-end gap-2">
          {files.map((f) =>
            f.type.startsWith("image/") ? (
              <a key={f.id} href={`/api/uploads/${f.id}`} target="_blank" rel="noreferrer" className="sent-image" title={f.name}>
                <img src={`/api/uploads/${f.id}`} alt={f.name} loading="lazy" />
              </a>
            ) : (
              <a key={f.id} href={`/api/uploads/${f.id}`} target="_blank" rel="noreferrer" className="attach-chip" title={f.path}>
                <span className="attach-icon">
                  <FileText size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[180px] truncate text-[12px] text-fg">{f.name}</span>
                  <span className="block text-[10.5px] uppercase text-fg-3">{f.name.split(".").pop()}</span>
                </span>
              </a>
            ),
          )}
        </div>
      )}
      {body.trim() && <div className="user-bubble">{body}</div>}
      <div className="msg-actions">
        <button onClick={() => void navigator.clipboard?.writeText(item.text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)))} title="Copy">
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
        {run && (
          <button onClick={() => (setDraft(item.text), setEditing(true))} title="Edit and send again">
            <Pencil size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

let lessonCache: Promise<Record<string, string>> | null = null; // id → text, loaded once
const lessonTexts = () =>
  (lessonCache ??= api<{ lessons: Array<{ id: string; text: string }> }>("/api/memory")
    .then((m) => Object.fromEntries(m.lessons.map((l) => [l.id, l.text])))
    .catch((): Record<string, string> => ((lessonCache = null), {})));

/** The end of a turn: who answered, how long it took, what it cost, what it was taught — and what next. */
/**
 * Text arrives in bursts — a network batch, several words per model chunk. Shown as it arrives it
 * lurches; here it flows: revealed every frame at a pace that rises with the backlog, so it's never
 * more than a fraction of a second behind, and never dumps a paragraph at once.
 */
function useSmoothText(target: string, active: boolean): string {
  // Finished text shows at once; text still being written starts from nothing and flows in.
  const shown = useRef(active ? 0 : target.length);
  const carry = useRef(0); // fractional characters owed between frames
  const arrivals = useRef<Array<{ t: number; n: number }>>([]);
  const [, paint] = useState(0);
  const reduce = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  if (shown.current > target.length) shown.current = target.length; // text replaced, not grown

  // How fast text is arriving (chars/ms over the last ~1.5s): the pace to reveal at, so each chunk
  // is spread across the gap before the next instead of landing all at once.
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const log = arrivals.current;
  if (!log.length || log[log.length - 1]!.n !== target.length) log.push({ t: now, n: target.length });
  while (log.length > 2 && now - log[0]!.t > 1500) log.shift();

  useEffect(() => {
    if (reduce) {
      shown.current = target.length;
      paint((n) => n + 1);
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const backlog = target.length - shown.current;
      if (backlog <= 0) return;
      const dt = Math.min(50, t - last);
      last = t;
      const span = log.length > 1 ? log[log.length - 1]!.t - log[0]!.t : 0;
      const incoming = span > 0 ? (log[log.length - 1]!.n - log[0]!.n) / span : 0.06;
      // Stream at the incoming pace, speeding up only when behind by more than ~350ms of text;
      // once the reply is complete, finish the last of it briskly.
      const speed = active ? Math.max(incoming, backlog / 350, 0.03) : Math.max(backlog / 90, 0.25);
      carry.current += speed * dt;
      const step = Math.floor(carry.current);
      if (step > 0) {
        carry.current -= step;
        shown.current = Math.min(target.length, shown.current + step);
        paint((n) => n + 1);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active, reduce]);
  let end = shown.current;
  if (end < target.length && /[\uD800-\uDBFF]/.test(target[end - 1] ?? "")) end -= 1; // never split a character pair
  return target.slice(0, end);
}

const Prose = memo(function Prose({ text, streaming }: { text: string; streaming: boolean }) {
  const shown = useSmoothText(text, streaming);
  const flowing = streaming || shown.length < text.length;
  return (
    <div className={`agent-prose py-1 ${flowing ? "is-streaming" : ""}`}>
      <Markdown text={shown} streaming={flowing} />
      {flowing && <span className="stream-caret" aria-hidden />}
    </div>
  );
});

function Finished({ item }: { item: Extract<Item, { kind: "finished" }> }) {
  const { run, working } = useContext(ThreadContext);
  const navigate = useNavigate();
  const [lessons, setLessons] = useState<string[]>([]);
  const [showLessons, setShowLessons] = useState(false);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (item.lessons.length) void lessonTexts().then((all) => setLessons(item.lessons.map((id) => all[id] ?? "a lesson since forgotten")));
  }, [item.lessons]);
  const retry = async () => {
    if (!run) return;
    setBusy("retry");
    await followUp(run.id, "Try that again — take a different approach this time.").finally(() => setBusy(""));
  };
  const fork = async () => {
    if (!run) return;
    setBusy("fork");
    try {
      const { id } = await api<{ id: string }>(`/api/runs/${run.id}/fork`, { body: { turn: item.turn } });
      navigate({ to: "/sessions/$id", params: { id } });
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="turn-footer group">
      <span className="turn-model">
        <span className="h-1.5 w-1.5 rounded-full bg-amber" />
        {item.runtime === "claude" ? "Claude" : item.runtime === "codex" ? "Codex" : item.runtime}
        {item.model && <span className="mono text-fg-3">{item.model}</span>}
      </span>
      {item.durationMs !== undefined && <span>{fmtMs(item.durationMs)}</span>}
      {item.tokens !== undefined && <span className="mono">{formatTokens(item.tokens)} tok</span>}
      {item.commit && <span className="mono" title="The checkpoint this turn committed">⎇ {item.commit.slice(0, 7)}</span>}
      {item.lessons.length > 0 && (
        <span className="relative">
          <button className="lesson-chip" onClick={() => setShowLessons((v) => !v)} aria-expanded={showLessons}>
            <Sparkles size={11} /> {item.lessons.length} lesson{item.lessons.length === 1 ? "" : "s"} applied
          </button>
          {showLessons && (
            <span className="lesson-pop" role="dialog" aria-label="Lessons this turn was given">
              {lessons.map((l, i) => (
                <span key={i} className="block py-0.5">• {l}</span>
              ))}
            </span>
          )}
        </span>
      )}
      {run && !working && (
        <span className="turn-actions">
          <button onClick={() => void retry()} disabled={busy !== ""} title="Ask it to try again">
            <RotateCcw size={12} /> Retry
          </button>
          <button onClick={() => void fork()} disabled={busy !== ""} title="Branch a new session from this point">
            <GitFork size={12} /> Fork from here
          </button>
        </span>
      )}
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
const WorkGroup = memo(WorkGroupView, (a, b) => a.live === b.live && a.steps.length === b.steps.length && a.steps.every((s, i) => signature(s) === signature(b.steps[i]!)));

function WorkGroupView({ steps, live }: { steps: Step[]; live: boolean }) {
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
          <span className="mono ml-auto text-[11px] opacity-80">{policyLine("deny", step.rule, step.layer)}</span>
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

/** What a command is, in a word — the way you'd describe it to someone. */
function shellKind(command: string): string | null {
  const c = command.replace(/^(cd\s+\S+\s*&&\s*)+/, "").trim();
  const git = /^git\s+(\w[\w-]*)/.exec(c);
  if (git) return `git ${git[1]}`;
  if (/\b(test|vitest|jest|pytest|go test|cargo test|swift test|xcodebuild test)\b/.test(c)) return "tests";
  if (/^(pnpm|npm|yarn|bun)\s+(i|install|add|ci)\b|^(pip|uv)\s+(install|add|sync)\b|^brew install\b/.test(c)) return "install";
  if (/\b(build|tsc|compile)\b/.test(c)) return "build";
  if (/\b(lint|eslint|ruff|prettier|fmt|clippy)\b/.test(c)) return "lint";
  if (/^(gh|glab)\s/.test(c)) return c.split(/\s+/).slice(0, 2).join(" ");
  if (/^(curl|wget)\b/.test(c)) return "network";
  return null;
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
        {shellKind(command) && <span className="shell-kind">{shellKind(command)}</span>}
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

/** An edit, as a file card: where, how much, and the change itself — unified or side by side. */
function FileCard({ step }: { step: Extract<Step, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const [split, setSplit] = useState(() => {
    try {
      return localStorage.getItem("shuacrew.diffSplit") === "1";
    } catch {
      return false;
    }
  });
  const { run } = useContext(ThreadContext);
  const input = (step.input ?? {}) as Record<string, unknown>;
  const absolute = pathOf(step.input, false) ?? "file";
  // Named from the project root, the way you'd say it — not the worktree's temp path.
  const root = [run?.worktree?.path, run?.repo].find((r) => r && absolute.startsWith(r + "/"));
  const file = root ? absolute.slice(root.length + 1) : (pathOf(step.input) ?? "file");
  const before = typeof input.old_string === "string" ? input.old_string : "";
  const after = typeof input.new_string === "string" ? input.new_string : typeof input.content === "string" ? input.content : "";
  const { added, removed } = useMemo(() => diffStat(before, after), [before, after]);
  const created = /^(write|create)/i.test(step.tool) && !before;
  const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
  const name = file.slice(dir.length);
  const Icon = created ? FilePlus2 : FilePen;
  const toggleSplit = () =>
    setSplit((v) => {
      try {
        localStorage.setItem("shuacrew.diffSplit", v ? "0" : "1");
      } catch {
        /* per-browser nicety only */
      }
      return !v;
    });
  return (
    <div className={`file-card ${step.ok === false ? "is-failed" : ""}`}>
      <div className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
        <button
          onClick={() => (before || after ? setOpen((v) => !v) : window.dispatchEvent(new CustomEvent("shuacrew:open-file", { detail: { path: absolute } })))}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-expanded={open}
        >
          <Icon size={14} className={step.ok === undefined ? "text-amber" : step.ok ? "text-fg-2" : "text-bad"} />
          <span className="text-fg-3">{created ? "Created" : "Edited"}</span>
          <span className="mono min-w-0 flex-1 truncate">
            <span className="text-fg-3">{dir}</span>
            <span className="text-fg">{name}</span>
          </span>
          {(added > 0 || removed > 0) && (
            <span className="diff-stat mono shrink-0">
              <span className="text-ok">+{added}</span>
              <span className="text-bad">−{removed}</span>
              <DiffBar added={added} removed={removed} />
            </span>
          )}
          {step.ok === undefined && <LoaderCircle size={13} className="animate-spin text-amber" />}
          <ChevronRight size={13} className={`shrink-0 text-fg-3 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        {open && before && (
          <button onClick={toggleSplit} className="file-tool" title={split ? "Unified diff" : "Side by side"} aria-label={split ? "Unified diff" : "Side by side"}>
            {split ? <Rows2 size={13} /> : <Columns2 size={13} />}
          </button>
        )}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("shuacrew:open-file", { detail: { path: absolute } }))}
          className="file-tool"
          title="Open the file"
          aria-label="Open the file"
        >
          <FileText size={13} />
        </button>
      </div>
      {open &&
        (before || after) &&
        (before ? (
          <DiffView before={before} after={after} file={name} split={split} />
        ) : (
          <div className="px-2 pb-2">
            <CodeBlock code={after} lang={name} label={name} maxLines={30} />
          </div>
        ))}
      {step.ok === false && step.output && <div className="mono border-t border-line px-3 py-1.5 text-[11.5px] text-bad">{step.output.split("\n")[0]}</div>}
    </div>
  );
}

/** Five blocks, GitHub-style: how much of the change was added vs removed. */
function DiffBar({ added, removed }: { added: number; removed: number }) {
  const total = added + removed || 1;
  const green = Math.round((added / total) * 5);
  return (
    <span className="diff-bar" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < green ? "bg-ok" : "bg-bad"} />
      ))}
    </span>
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
  const { working } = useContext(ThreadContext);
  const live = working && step.streaming;
  const preview = step.text.trim().split("\n").filter(Boolean).pop() ?? "";
  return (
    <div className="py-0.5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full min-w-0 items-center gap-2 text-left text-[12.5px] text-fg-3 hover:text-fg-2" aria-expanded={open}>
        <Brain size={14} className={live ? "text-amber" : undefined} />
        <span className={live ? "shimmer-text font-medium" : "italic"}>Thought process</span>
        {!open && preview && <span className="min-w-0 flex-1 truncate italic opacity-80">{preview}</span>}
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
      <div className="mono mt-1 text-[11.5px] text-fg-2">{policyLine("ask", item.rule, item.layer)}</div>
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

function pathOf(input: unknown, tidy = true): string | undefined {
  const i = (input ?? {}) as Record<string, unknown>;
  const p = i.file_path ?? i.path ?? i.filePath;
  return typeof p === "string" ? (tidy ? p.replace(/^\/Users\/[^/]+/, "~") : p) : undefined;
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
