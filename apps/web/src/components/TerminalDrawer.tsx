/**
 * The terminal: real shells that live in the gateway (close the drawer, reload, restart the app —
 * they keep running and come back with their scrollback), made smart by shell integration:
 * every command is a block with its exit status and time, in the scrollback and in a history you
 * can jump through, copy, re-run, or hand to the crew. Type what you want in English and get the
 * command. Split side by side, search, zoom. Loaded on first open (xterm.js is its own chunk).
 */
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XTerm, type IDecoration, type IMarker } from "@xterm/xterm";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  ChevronRight,
  ClipboardCopy,
  Copy,
  CornerDownLeft,
  Eraser,
  Folder,
  GitBranch,
  History,
  House,
  Loader2,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  SquareSplitHorizontal,
  SquareTerminal,
  Star,
  TerminalSquare,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PALETTE } from "../lib/ansi";
import { api, followUp, launchRun } from "../lib/api";
import { conversation } from "../lib/conversation";
import { repoName } from "../lib/crew";
import { useLive } from "../lib/live";

interface Where {
  cwd: string;
  branch?: string;
}
interface TerminalInfo {
  id: string;
  title: string;
  cwd: string;
  run?: string;
  exited?: number;
  where?: Where;
}
interface Block {
  id: number;
  command: string;
  cwd: string;
  branch?: string;
  startedAt: number;
  endedAt?: number;
  exit?: number;
}
interface View {
  term: XTerm;
  fit: FitAddon;
  search: SearchAddon;
  send: (data: string) => void;
  markers: IMarker[];
}

const FONT = '"JetBrains Mono Variable", "Hack Nerd Font Mono", "Symbols Nerd Font Mono", "MesloLGS NF", Menlo, monospace';
const AGENT = "agent";
const SIZE_KEY = "shuacrew.terminalFont";

/** The terminal's colours come from the app's palette, so Frost Black and every theme match. */
function themeFromPalette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const raw = v("--amber", "#ffb020");
  // xterm parses colours itself: hand it plain hex (with alpha) rather than CSS functions.
  const accent = /^#[0-9a-f]{6}$/i.test(raw) ? raw : /^#[0-9a-f]{3}$/i.test(raw) ? "#" + [...raw.slice(1)].map((c) => c + c).join("") : "#ffb020";
  return {
    background: v("--term-bg", "#0a0c0f"),
    foreground: v("--term-fg", "#d5dae1"),
    cursor: accent,
    cursorAccent: "#0a0c0f",
    selectionBackground: `${accent}47`,
    selectionInactiveBackground: `${accent}24`,
    scrollbarSliderBackground: "rgba(255, 255, 255, 0.10)",
    scrollbarSliderHoverBackground: "rgba(255, 255, 255, 0.18)",
    overviewRulerBorder: "transparent", // xterm's default is a white line down the right edge
    black: PALETTE[0], red: PALETTE[1], green: PALETTE[2], yellow: PALETTE[3], blue: PALETTE[4], magenta: PALETTE[5], cyan: PALETTE[6], white: PALETTE[7],
    brightBlack: PALETTE[8], brightRed: PALETTE[9], brightGreen: PALETTE[10], brightYellow: PALETTE[11], brightBlue: PALETTE[12], brightMagenta: PALETTE[13], brightCyan: PALETTE[14], brightWhite: PALETTE[15],
  };
}

const took = (b: Block) => {
  if (!b.endedAt) return "";
  const ms = b.endedAt - b.startedAt;
  return ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
};
const home = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");

/** Commands you keep: saved from history or from English-to-command, kept on this Mac. */
interface Snippet { id: string; command: string; label?: string; savedAt: number }
const SNIPPETS_KEY = "shuacrew.terminalSnippets";
const readSnippets = (): Snippet[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(SNIPPETS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => x && typeof x.command === "string") : [];
  } catch {
    return [];
  }
};
function useSnippets() {
  const [list, setList] = useState<Snippet[]>(readSnippets);
  useEffect(() => {
    const sync = () => setList(readSnippets());
    window.addEventListener("shuacrew:snippets", sync);
    return () => window.removeEventListener("shuacrew:snippets", sync);
  }, []);
  const write = (next: Snippet[]) => {
    try {
      localStorage.setItem(SNIPPETS_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked: keep them for this visit */
    }
    setList(next);
    window.dispatchEvent(new Event("shuacrew:snippets"));
  };
  return {
    list,
    has: (command: string) => list.some((x) => x.command === command),
    save: (command: string) => !list.some((x) => x.command === command) && write([{ id: `${Date.now()}`, command, savedAt: Date.now() }, ...list]),
    remove: (command: string) => write(list.filter((x) => x.command !== command)),
  };
}

export default function TerminalDrawer({ scope, onClose, full }: { scope: { run?: string }; onClose: () => void; full?: boolean }) {
  const [terms, setTerms] = useState<TerminalInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [split, setSplit] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [exited, setExited] = useState<Record<string, number>>({});
  const [blocks, setBlocks] = useState<Record<string, Block[]>>({});
  const [where, setWhere] = useState<Record<string, Where>>({});
  const [side, setSide] = useState(Boolean(full));
  const [panel, setPanel] = useState<"history" | "snippets">("history");
  const [picking, setPicking] = useState(false);
  const runs = useLive((s) => s.crew.runs);
  const [searching, setSearching] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    try {
      return Number(localStorage.getItem(SIZE_KEY)) || 12.5;
    } catch {
      return 12.5;
    }
  });
  const views = useRef(new Map<string, View>());
  const key = scope.run ?? "home";
  const target = focused && (focused === active || focused === split) ? focused : active;

  const open = async (cwd?: string): Promise<TerminalInfo> => {
    const created = await api<TerminalInfo>("/api/terminals", { body: { run: scope.run, cwd } });
    setTerms((t) => [...t, created]);
    return created;
  };

  useEffect(() => {
    let cancelled = false;
    void api<TerminalInfo[]>(`/api/terminals?run=${encodeURIComponent(key)}`).then(async (list) => {
      if (cancelled) return;
      if (list.length) {
        setTerms(list);
        setActive(list[list.length - 1]!.id);
        setWhere(Object.fromEntries(list.filter((t) => t.where).map((t) => [t.id, t.where!])));
      } else if (!scope.run) setActive((await open()).id);
      else setActive(AGENT); // a session's terminal opens on what the agent is doing
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // ⌘F search, ⌘+/⌘- size — only while you're in the terminal.
  const box = useRef<HTMLDivElement>(null);
  const shortcut = useRef({ newHere: () => undefined as void, split: () => undefined as void });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!box.current?.contains(document.activeElement)) return;
      if (e.metaKey && e.key.toLowerCase() === "f") (e.preventDefault(), e.stopPropagation(), setSearching(true));
      if (e.metaKey && (e.key === "=" || e.key === "+")) (e.preventDefault(), setFontSize((s) => Math.min(20, s + 1)));
      if (e.metaKey && e.key === "-") (e.preventDefault(), setFontSize((s) => Math.max(9, s - 1)));
      if (e.metaKey && e.key === "0") (e.preventDefault(), setFontSize(12.5));
      // ⌘T new terminal here, ⌘D split, ⌘⇧H the side panel (⌘W stays the window's).
      if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "t") (e.preventDefault(), e.stopPropagation(), shortcut.current.newHere());
      if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "d") (e.preventDefault(), e.stopPropagation(), shortcut.current.split());
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "h") (e.preventDefault(), e.stopPropagation(), setSide((v) => !v));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SIZE_KEY, String(fontSize));
    } catch {
      /* fine */
    }
    for (const v of views.current.values()) {
      v.term.options.fontSize = fontSize;
      v.fit.fit();
    }
  }, [fontSize]);

  // The terminal follows the app's palette (Frost Black, Mono accent, light themes…).
  const appearance = useLive((s) => s.appearance);
  useEffect(() => {
    const t = setTimeout(() => {
      for (const v of views.current.values()) v.term.options.theme = themeFromPalette();
    }, 50);
    return () => clearTimeout(t);
  }, [appearance]);

  const close = async (id: string) => {
    await api(`/api/terminals/${id}`, { method: "DELETE" }).catch(() => undefined);
    views.current.delete(id);
    if (split === id) setSplit(null);
    setTerms((t) => {
      const next = t.filter((x) => x.id !== id);
      if (active === id) setActive(next.filter((x) => x.id !== split)[next.length - 1]?.id ?? next[0]?.id ?? null);
      if (!next.length && !scope.run) onClose();
      return next;
    });
  };

  const toggleSplit = async () => {
    if (split) return setSplit(null);
    const other = terms.find((t) => t.id !== active && t.id !== AGENT) ?? (await open());
    setSplit(other.id);
    setFocused(other.id);
  };

  const run = (command: string, execute = true) => {
    const v = target ? views.current.get(target) : undefined;
    if (!v) return;
    v.send(command + (execute ? "\r" : ""));
    v.term.focus();
  };

  const jump = (terminal: string, block: Block) => {
    const v = views.current.get(terminal);
    const list = blocks[terminal] ?? [];
    if (!v) return;
    // Markers exist for what's still in scrollback: match them to blocks from the newest back.
    const index = v.markers.length - (list.length - list.findIndex((b) => b.id === block.id));
    const marker = v.markers[index];
    if (marker && !marker.isDisposed && marker.line >= 0) v.term.scrollToLine(Math.max(0, marker.line - 2));
    v.term.focus();
  };

  const current = target && target !== AGENT ? views.current.get(target) : undefined;
  const here = target ? where[target] : undefined;
  const history = target && target !== AGENT ? (blocks[target] ?? []) : [];
  const last = [...history].reverse().find((b) => b.exit !== undefined);
  const running = history.at(-1) && history.at(-1)!.exit === undefined ? history.at(-1) : undefined;
  const newIn = (cwd?: string) => void open(cwd).then((t) => setActive(t.id));
  shortcut.current = { newHere: () => newIn(here?.cwd), split: () => void toggleSplit() };
  // Where a new terminal can open: your project repos and the folders you've worked in lately.
  const folders = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of Object.values(runs)) if (r.repo) seen.set(r.repo, repoName(r.repo));
    for (const list of Object.values(blocks)) for (const b of list.slice(-40)) if (b.cwd && home(b.cwd) !== "~" && !seen.has(b.cwd)) seen.set(b.cwd, home(b.cwd).split("/").pop() || "~");
    return [...seen].slice(0, 12);
  }, [runs, blocks]);

  return (
    <div className="terminal-drawer" ref={box}>
      <div className="terminal-bar">
        <SquareTerminal size={14} className="text-[var(--term-fg)] opacity-70" />
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto" role="tablist" aria-label="Terminals">
          {scope.run && (
            <div role="tab" aria-selected={active === AGENT} className={`terminal-tab ${active === AGENT ? "is-active" : ""}`} onClick={() => setActive(AGENT)} title="What the agent is running, live">
              <Bot size={12} />
              <span>Agent</span>
            </div>
          )}
          {terms.map((t) => (
            <div key={t.id} role="tab" aria-selected={t.id === active || t.id === split} className={`terminal-tab ${t.id === active || t.id === split ? "is-active" : ""}`} onClick={() => (t.id !== split ? setActive(t.id) : setFocused(t.id))}>
              <span className={`terminal-tab-dot ${exited[t.id] !== undefined || t.exited !== undefined ? "is-off" : ""}`} />
              <span className="mono truncate">{home(where[t.id]?.cwd ?? t.cwd).split("/").pop() || "~"}</span>
              {where[t.id]?.branch && <span className="terminal-tab-branch mono truncate"><GitBranch size={10} />{where[t.id]!.branch}</span>}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void close(t.id);
                }}
                className="terminal-tab-x"
                aria-label={`Close ${t.title}`}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
        <div className="term-new">
          <button onClick={() => newIn(here?.cwd)} className="terminal-action" title="New terminal here (⌘T)" aria-label="New terminal">
            <Plus size={14} />
          </button>
          <button onClick={() => setPicking((v) => !v)} className={`terminal-action term-new-more ${picking ? "is-on" : ""}`} title="New terminal in a folder" aria-label="New terminal in a folder" aria-expanded={picking}>
            <Folder size={13} />
          </button>
          <AnimatePresence>
            {picking && (
              <motion.div className="term-folders" role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} onMouseLeave={() => setPicking(false)}>
                <div className="term-folders-head">Open a terminal in</div>
                <button role="menuitem" onClick={() => (setPicking(false), newIn(undefined))}>
                  <House size={13} /> <span>Home</span> <small className="mono">~</small>
                </button>
                {folders.map(([path, name]) => (
                  <button key={path} role="menuitem" onClick={() => (setPicking(false), newIn(path))} title={path}>
                    <Folder size={13} /> <span>{name}</span> <small className="mono">{home(path)}</small>
                  </button>
                ))}
                {!folders.length && <p>Projects you work on with the crew show up here.</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <span className="flex-1" />
        <div className="term-tools">
        <button className={`terminal-action ${split ? "is-on" : ""}`} title={split ? "One pane (⌘D)" : "Split side by side (⌘D)"} aria-label="Split" onClick={() => void toggleSplit()}>
          <SquareSplitHorizontal size={14} />
        </button>
        <button className="terminal-action" title="Search (⌘F)" aria-label="Search" onClick={() => setSearching(true)}>
          <Search size={14} />
        </button>
        <button
          className="terminal-action"
          title="Send the selection to the chat"
          aria-label="Send selection to chat"
          onClick={() => {
            const text = current?.term.getSelection();
            if (text) window.dispatchEvent(new CustomEvent("shuacrew:insert", { detail: "```\n" + text.trimEnd() + "\n```\n" }));
          }}
        >
          <MessageSquarePlus size={14} />
        </button>
        <button className="terminal-action" title="Clear" aria-label="Clear" onClick={() => current?.term.clear()}>
          <Eraser size={14} />
        </button>
        <button className={`terminal-action ${side ? "is-on" : ""}`} title="History and snippets (⌘⇧H)" aria-label="History and snippets" onClick={() => setSide((v) => !v)}>
          <History size={14} />
        </button>
        </div>
        {!full && (
          <button className="terminal-action" title="Hide (shells keep running) — ⌃`" aria-label="Hide terminal" onClick={onClose}>
            <X size={15} />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          {scope.run && <AgentView run={scope.run} visible={active === AGENT} fontSize={fontSize} />}
          {terms.map((t) => {
            const pane = t.id === active ? (split ? "left" : "full") : t.id === split ? "right" : "hidden";
            return (
              <TerminalView
                key={t.id}
                info={t}
                pane={pane}
                focused={Boolean(split) && target === t.id}
                fontSize={fontSize}
                onFocus={() => setFocused(t.id)}
                onReady={(view) => views.current.set(t.id, view)}
                onExit={(code) => setExited((e) => ({ ...e, [t.id]: code }))}
                onBlocks={(list) => setBlocks((b) => ({ ...b, [t.id]: list }))}
                onBlock={(block) =>
                  setBlocks((b) => {
                    const list = b[t.id] ?? [];
                    const i = list.findIndex((x) => x.id === block.id);
                    return { ...b, [t.id]: i === -1 ? [...list, block].slice(-300) : list.map((x) => (x.id === block.id ? block : x)) };
                  })
                }
                onWhere={(w) => setWhere((all) => ({ ...all, [t.id]: w }))}
                blocksRef={() => blocks[t.id] ?? []}
              />
            );
          })}
          <AnimatePresence>{searching && current && <SearchBox search={current.search} onClose={() => (setSearching(false), current.term.focus())} />}</AnimatePresence>
        </div>
        <AnimatePresence initial={false}>
          {side && target && target !== AGENT && (
            <motion.aside className="term-side" initial={{ width: 0, opacity: 0 }} animate={{ width: 300, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
              <div className="flex h-full min-w-[300px] flex-col">
                <div className="term-side-tabs" role="tablist" aria-label="Side panel">
                  <button role="tab" aria-selected={panel === "history"} className={panel === "history" ? "is-on" : ""} onClick={() => setPanel("history")}>
                    <History size={12} /> History <em>{history.length}</em>
                  </button>
                  <button role="tab" aria-selected={panel === "snippets"} className={panel === "snippets" ? "is-on" : ""} onClick={() => setPanel("snippets")}>
                    <Star size={12} /> Snippets
                  </button>
                </div>
                {panel === "history" ? (
                  <HistoryList terminal={target} blocks={history} onJump={(b) => jump(target, b)} onRun={(c) => run(c)} run={scope.run} />
                ) : (
                  <SnippetList onRun={(c, go) => run(c, go)} />
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {active !== AGENT && (
        <div className="term-status">
          <span className="term-chip min-w-0" title={here?.cwd}>
            <Folder size={11} /> <span className="mono truncate">{here ? home(here.cwd) : "…"}</span>
          </span>
          {here?.branch && (
            <span className="term-chip">
              <GitBranch size={11} /> <span className="mono">{here.branch}</span>
            </span>
          )}
          <span className="flex-1" />
          {running ? (
            <span className="term-chip is-running">
              <Loader2 size={11} className="animate-spin" /> <span className="mono max-w-[240px] truncate">{running.command}</span>
            </span>
          ) : last ? (
            <span className={`term-chip ${last.exit === 0 ? "is-ok" : "is-bad"}`}>
              {last.exit === 0 ? <Check size={11} /> : <X size={11} />}
              <span className="mono">{last.exit === 0 ? took(last) : `exit ${last.exit} · ${took(last)}`}</span>
            </span>
          ) : null}
          <span className="mono opacity-60">{fontSize}px</span>
        </div>
      )}

      <AskBar
        run={scope.run}
        cwd={here?.cwd ?? terms.find((t) => t.id === target)?.cwd}
        branch={here?.branch}
        last={last}
        onRun={run}
        context={() => {
          if (!current) return "";
          const selected = current.term.getSelection();
          if (selected.trim()) return selected;
          const buffer = current.term.buffer.active;
          const lines: string[] = [];
          for (let i = Math.max(0, buffer.length - 60); i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
          return lines.join("\n").trim();
        }}
        full={full}
      />
    </div>
  );
}

/** Every command you ran here: status, time, and what you can do with it. */
function HistoryList({ terminal, blocks, onJump, onRun, run }: { terminal: string; blocks: Block[]; onJump: (b: Block) => void; onRun: (command: string) => void; run?: string }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [copiedOut, setCopiedOut] = useState<number | null>(null);
  const snippets = useSnippets();
  const copyOutput = async (b: Block) => {
    const { output } = await api<{ output: string }>(`/api/terminals/${terminal}/blocks/${b.id}`);
    await navigator.clipboard.writeText(output.trimEnd()).catch(() => undefined);
    setCopiedOut(b.id);
    setTimeout(() => setCopiedOut(null), 1000);
  };
  const hand = async (b: Block, why: "explain" | "fix") => {
    setBusy(b.id);
    try {
      const { output } = await api<{ output: string }>(`/api/terminals/${terminal}/blocks/${b.id}`);
      const ask =
        why === "fix"
          ? `This command failed (exit ${b.exit}). Find out why and fix it.\n\n\`\`\`\n$ ${b.command}\n${output.slice(-6000)}\n\`\`\``
          : `Explain what this command did and what its output means, briefly.\n\n\`\`\`\n$ ${b.command}\n${output.slice(-6000)}\n\`\`\``;
      if (run) await followUp(run, ask);
      else {
        const { id } = await launchRun({ ask, repo: b.cwd });
        navigate({ to: "/sessions/$id", params: { id } });
      }
    } finally {
      setBusy(null);
    }
  };
  const q = filter.trim().toLowerCase();
  const list = [...blocks].reverse().filter((b) => !q || b.command.toLowerCase().includes(q) || b.cwd.toLowerCase().includes(q));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="term-filter">
        <Search size={12} />
        <input id="term-history-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter commands" aria-label="Filter commands" />
        {filter && <button onClick={() => setFilter("")} aria-label="Clear filter"><X size={11} /></button>}
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {!blocks.length && <div className="term-empty">Commands you run show up here with how they went. Click one to jump to it; a failed one gets a Fix button.</div>}
        {blocks.length > 0 && !list.length && <div className="term-empty">Nothing matches “{filter}”.</div>}
        {list.map((b) => (
          <div key={b.id} className={`term-block ${b.exit === undefined ? "is-running" : b.exit === 0 ? "is-ok" : "is-bad"}`}>
            <button className="flex w-full min-w-0 items-start gap-2 text-left" onClick={() => onJump(b)} title="Jump to it">
              <span className="term-block-icon">{b.exit === undefined ? <Loader2 size={11} className="animate-spin" /> : b.exit === 0 ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}</span>
              <span className="min-w-0 flex-1">
                <span className="mono line-clamp-2 break-all text-[12px] text-[var(--term-fg)]">{b.command}</span>
                <span className="mono mt-0.5 block truncate text-[10.5px] text-[var(--term-dim)]">
                  {home(b.cwd).split("/").slice(-2).join("/")}
                  {b.branch ? ` · ${b.branch}` : ""}
                  {b.exit !== undefined ? ` · ${b.exit === 0 ? "" : `exit ${b.exit} · `}${took(b)}` : " · running"}
                </span>
              </span>
            </button>
            <div className="term-block-actions">
              <button title="Copy the command" aria-label="Copy the command" onClick={() => void navigator.clipboard.writeText(b.command).then(() => (setCopied(b.id), setTimeout(() => setCopied(null), 1000)))}>
                {copied === b.id ? <Check size={11} /> : <Copy size={11} />}
              </button>
              <button title="Run it again" aria-label="Run it again" onClick={() => onRun(b.command)}>
                <RotateCcw size={11} />
              </button>
              <button className={snippets.has(b.command) ? "is-saved" : ""} title={snippets.has(b.command) ? "Saved to snippets" : "Save as a snippet"} aria-label="Save as a snippet" onClick={() => (snippets.has(b.command) ? snippets.remove(b.command) : snippets.save(b.command))}>
                <Star size={11} />
              </button>
              {b.exit !== undefined && (
                <button title="Copy the output" aria-label="Copy the output" onClick={() => void copyOutput(b)}>
                  {copiedOut === b.id ? <Check size={11} /> : <ClipboardCopy size={11} />}
                </button>
              )}
              {b.exit !== undefined && (
                <button title="Explain with the crew" aria-label="Explain" onClick={() => void hand(b, "explain")} disabled={busy === b.id}>
                  <Sparkles size={11} />
                </button>
              )}
              {b.exit !== undefined && b.exit !== 0 && (
                <button className="is-fix" title="Hand it to the crew to fix" aria-label="Fix" onClick={() => void hand(b, "fix")} disabled={busy === b.id}>
                  {busy === b.id ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} Fix
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Saved commands: one click runs it here, or put it at the prompt to edit first. */
function SnippetList({ onRun }: { onRun: (command: string, execute: boolean) => void }) {
  const snippets = useSnippets();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
      {!snippets.list.length && (
        <div className="term-empty">
          Save commands you reach for often. Use the <Star size={11} className="inline" /> on any command in History, or <b>Save</b> on a command written from English.
        </div>
      )}
      {snippets.list.map((x) => (
        <div key={x.id} className="term-block term-snippet">
          <button className="flex w-full min-w-0 items-start gap-2 text-left" onClick={() => onRun(x.command, false)} title="Put it at the prompt">
            <span className="term-block-icon is-star"><Star size={11} /></span>
            <span className="mono line-clamp-3 min-w-0 flex-1 break-all text-[12px] text-[var(--term-fg)]">{x.command}</span>
          </button>
          <div className="term-block-actions">
            <button className="is-run" title="Run it" aria-label="Run it" onClick={() => onRun(x.command, true)}>
              <CornerDownLeft size={11} /> Run
            </button>
            <button title="Put it at the prompt to edit" aria-label="Insert" onClick={() => onRun(x.command, false)}>
              Insert
            </button>
            <button title="Copy" aria-label="Copy" onClick={() => void navigator.clipboard.writeText(x.command).catch(() => undefined)}>
              <Copy size={11} />
            </button>
            <button title="Remove" aria-label="Remove snippet" onClick={() => snippets.remove(x.command)}>
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchBox({ search, onClose }: { search: SearchAddon; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [count, setCount] = useState<{ index: number; total: number } | null>(null);
  useEffect(() => {
    const sub = search.onDidChangeResults((r) => setCount(r ? { index: r.resultIndex, total: r.resultCount } : null));
    return () => (sub.dispose(), search.clearDecorations());
  }, [search]);
  const opts = { decorations: { matchBackground: "#ffffff30", activeMatchBackground: "#ffffffaa", matchOverviewRuler: "#ffffff80", activeMatchColorOverviewRuler: "#ffffff" } };
  const find = (next = true) => (next ? search.findNext(q, opts) : search.findPrevious(q, opts));
  return (
    <motion.div className="term-search" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
      <Search size={12} className="opacity-60" />
      <input
        autoFocus
        value={q}
        onChange={(e) => (setQ(e.target.value), e.target.value ? search.findNext(e.target.value, { ...opts, incremental: true }) : search.clearDecorations())}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.preventDefault(), find(!e.shiftKey));
          if (e.key === "Escape") onClose();
        }}
        placeholder="Find in terminal"
        aria-label="Find in terminal"
      />
      <span className="mono text-[10.5px] opacity-60">{q && count ? (count.total ? `${count.index + 1}/${count.total}` : "0") : ""}</span>
      <button onClick={() => find(false)} aria-label="Previous match">
        <ArrowUp size={12} />
      </button>
      <button onClick={() => find(true)} aria-label="Next match">
        <ArrowDown size={12} />
      </button>
      <button onClick={onClose} aria-label="Close search">
        <X size={12} />
      </button>
    </motion.div>
  );
}

/**
 * Two ways to use the bar: describe a command in plain English and get it (Command), or ask the
 * crew about what's on screen (Ask). Start with # to switch to Command on the fly.
 */
function AskBar({ run, cwd, branch, last, onRun, context, full }: { run?: string; cwd?: string; branch?: string; last?: Block; onRun: (command: string, execute?: boolean) => void; context: () => string; full?: boolean }) {
  const [mode, setMode] = useState<"command" | "ask">(run ? "ask" : "command");
  const [text, setText] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const navigate = useNavigate();
  const field = useRef<HTMLInputElement>(null);
  const snippets = useSnippets();

  const ask = async (question: string) => {
    const screen = context();
    const message = screen ? `${question}\n\nFrom my terminal${cwd ? ` (in ${cwd})` : ""}:\n\`\`\`\n${screen.slice(-6000)}\n\`\`\`` : question;
    if (run) {
      await followUp(run, message);
      setSent("Sent to the session");
    } else {
      const { id } = await launchRun({ ask: message, repo: cwd });
      navigate({ to: "/sessions/$id", params: { id } });
    }
    setText("");
    setTimeout(() => setSent(""), 2000);
  };
  const suggest = async (prompt: string) => {
    setBusy(true);
    setError("");
    try {
      const { command } = await api<{ command: string }>("/api/terminals/suggest", { body: { prompt, cwd, branch, last: last ? { command: last.command, exit: last.exit } : undefined } });
      setSuggestion(command);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (mode === "command" || value.startsWith("#")) void suggest(value);
    else void ask(value);
  };
  const accept = (execute: boolean) => {
    if (!suggestion) return;
    onRun(suggestion, execute);
    setSuggestion(null);
    setText("");
  };

  return (
    <div className={`terminal-ask-wrap ${full ? "is-full" : ""}`}>
      <AnimatePresence>
        {suggestion && (
          <motion.div className="term-suggest" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
            <TerminalSquare size={13} className="shrink-0 opacity-70" />
            <code className="mono min-w-0 flex-1 whitespace-pre-wrap break-all">{suggestion}</code>
            <button className="term-suggest-go" onClick={() => accept(true)} title="Run it (↵)">
              <CornerDownLeft size={11} /> Run
            </button>
            <button onClick={() => accept(false)} title="Put it at the prompt to edit (⇥)">
              Insert
            </button>
            <button onClick={() => snippets.save(suggestion)} title={snippets.has(suggestion) ? "Saved to snippets" : "Save as a snippet"} className={snippets.has(suggestion) ? "is-saved" : ""}>
              <Star size={11} /> {snippets.has(suggestion) ? "Saved" : "Save"}
            </button>
            <button onClick={() => void navigator.clipboard.writeText(suggestion)} title="Copy" aria-label="Copy">
              <Copy size={11} />
            </button>
            <button onClick={() => setSuggestion(null)} title="Dismiss (Esc)" aria-label="Dismiss">
              <X size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="terminal-ask">
        <div className="term-mode" role="tablist" aria-label="What the bar does">
          <button role="tab" aria-selected={mode === "command"} className={mode === "command" ? "is-on" : ""} onClick={() => (setMode("command"), field.current?.focus())} title="Describe a command in plain English">
            <ChevronRight size={11} /> Command
          </button>
          <button role="tab" aria-selected={mode === "ask"} className={mode === "ask" ? "is-on" : ""} onClick={() => (setMode("ask"), field.current?.focus())} title="Ask the crew about what's on screen">
            <Sparkles size={11} /> Ask
          </button>
        </div>
        <input
          id="term-ask"
          ref={field}
          value={text}
          onChange={(e) => (setText(e.target.value), setError(""))}
          onKeyDown={(e) => {
            if (suggestion && e.key === "Enter") (e.preventDefault(), accept(true));
            else if (suggestion && e.key === "Tab") (e.preventDefault(), accept(false));
            else if (suggestion && e.key === "Escape") setSuggestion(null);
            else if (e.key === "Enter") submit();
          }}
          placeholder={mode === "command" ? "Describe a command… e.g. find files over 100MB, kill whatever is on port 3000" : run ? "Ask the agent about what's on screen…" : "Ask the crew — it starts a session right here, with this output…"}
          aria-label={mode === "command" ? "Describe a command" : "Ask the crew"}
        />
        {busy ? (
          <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--term-dim)]">
            <Loader2 size={12} className="animate-spin" /> Writing the command…
          </span>
        ) : error ? (
          <span className="max-w-[260px] truncate text-[11.5px] text-bad" title={error}>
            {error}
          </span>
        ) : sent ? (
          <span className="text-[11.5px] text-ok">{sent}</span>
        ) : mode === "ask" ? (
          <>
            <button onClick={() => void ask("Explain what happened here, briefly.")} className="terminal-chip" title="Explain the selection or the last screen">
              Explain
            </button>
            <button onClick={() => void ask("This failed — find out why and fix it.")} className="terminal-chip" title="Hand the error to an agent to fix">
              <Wand2 size={11} /> Fix this
            </button>
          </>
        ) : (
          <span className="term-hint"><kbd>↵</kbd> write it</span>
        )}
      </div>
    </div>
  );
}

/** The agent's own shell, read-only: every command it runs and what came back, as it happens. */
function AgentView({ run, visible, fontSize }: { run: string; visible: boolean; fontSize: number }) {
  const events = useLive((s) => s.runEvents[run]);
  const steps = useMemo(
    () =>
      conversation(events ?? []).flatMap((i) => {
        if (i.kind !== "tool" || !/^(bash|shell|commandexecution|exec)/i.test(i.tool)) return [];
        const input = (i.input ?? {}) as Record<string, unknown>;
        return [{ key: i.seq, command: typeof input.command === "string" ? input.command : JSON.stringify(i.input), output: i.output, ok: i.ok }];
      }),
    [events],
  );
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<XTerm | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const shown = useRef<Map<number, boolean>>(new Map());

  useEffect(() => {
    if (!host.current) return;
    const theme = themeFromPalette();
    const t = new XTerm({ fontFamily: FONT, fontSize, lineHeight: 1.18, disableStdin: true, cursorBlink: false, convertEol: true, scrollback: 20_000, allowTransparency: true, theme: { ...theme, cursor: "transparent" } });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current);
    f.fit();
    term.current = t;
    fit.current = f;
    shown.current = new Map();
    const observer = new ResizeObserver(() => host.current?.offsetParent && f.fit());
    observer.observe(host.current);
    return () => (observer.disconnect(), t.dispose());
  }, [run]);

  useEffect(() => {
    const t = term.current;
    if (!t) return;
    if (!steps.length && !shown.current.size) {
      t.write("\x1b[38;2;123;132;148mThe agent's commands appear here as it runs them.\x1b[0m\r\n");
      shown.current.set(-1, true);
    }
    for (const step of steps) {
      const done = step.ok !== undefined;
      const before = shown.current.get(step.key);
      if (before === undefined) t.write(`\r\n\x1b[38;2;170;176;190m❯\x1b[0m \x1b[1m${step.command}\x1b[0m\r\n`);
      if (done && before !== true) {
        if (step.output) t.write(step.output.replace(/\n$/, "") + "\r\n");
        t.write(step.ok ? "\x1b[38;2;74;222;128m✓ done\x1b[0m\r\n" : "\x1b[38;2;255;107;107m✗ failed\x1b[0m\r\n");
      }
      shown.current.set(step.key, done);
    }
  }, [steps]);

  useEffect(() => {
    if (term.current) {
      term.current.options.fontSize = fontSize;
      fit.current?.fit();
    }
  }, [fontSize]);
  useEffect(() => {
    if (visible) requestAnimationFrame(() => fit.current?.fit());
  }, [visible]);

  return <div ref={host} className="terminal-host" style={{ visibility: visible ? "visible" : "hidden" }} aria-label="Agent's commands" />;
}

function TerminalView({
  info,
  pane,
  focused,
  fontSize,
  onFocus,
  onReady,
  onExit,
  onBlocks,
  onBlock,
  onWhere,
  blocksRef,
}: {
  info: TerminalInfo;
  pane: "full" | "left" | "right" | "hidden";
  focused: boolean;
  fontSize: number;
  onFocus: () => void;
  onReady: (v: View) => void;
  onExit: (code: number) => void;
  onBlocks: (list: Block[]) => void;
  onBlock: (block: Block) => void;
  onWhere: (w: Where) => void;
  blocksRef: () => Block[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const latest = useRef(blocksRef);
  latest.current = blocksRef;

  useEffect(() => {
    if (!host.current) return;
    const term = new XTerm({
      // Named outright (a CSS variable means nothing to a canvas). Nerd Font second, so prompts and
      // `ls` icons from the person's own shell setup render instead of boxes.
      fontFamily: FONT,
      fontSize,
      lineHeight: 1.18,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      scrollback: 20_000,
      macOptionIsMeta: true,
      allowProposedApi: true,
      allowTransparency: true,
      overviewRuler: { width: 8 },
      theme: themeFromPalette(),
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, "_blank", "noopener")));
    term.open(host.current);
    void document.fonts.load(`${fontSize}px "JetBrains Mono Variable"`).then(() => {
      term.options.fontFamily = FONT;
      fit.fit();
    });
    let gpu = false;
    try {
      gpu = localStorage.getItem("shuacrew.terminalRenderer") === "gpu";
    } catch {
      /* storage blocked */
    }
    if (gpu)
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch {
        /* the DOM renderer is fine */
      }
    // ⌘-shortcuts belong to the app (⌘K, ⌘N, ⌘F…); ⌘C/⌘V go through the browser's copy and paste.
    term.attachCustomKeyEventHandler((e) => !e.metaKey);

    // Shell integration: a marker where each command starts, and a badge when it ends.
    const markers: IMarker[] = [];
    let pending: { marker: IMarker; at: number; dot?: IDecoration } | undefined;
    term.parser.registerOscHandler(6973, (data) => {
      const kind = data[0];
      if (kind === "C") {
        // preexec runs after Enter: the cursor is already one row below the command.
        const marker = term.registerMarker(-1);
        if (marker) {
          markers.push(marker);
          const dot = term.registerDecoration({ marker, x: 0, width: 1, layer: "top" });
          dot?.onRender((el) => el.classList.add("term-gutter", "is-running"));
          pending = { marker, at: Date.now(), dot };
        }
      } else if (kind === "D" && pending) {
        const code = Number(data.split(";")[1] ?? 0);
        const ok = code === 0;
        const { marker, at, dot } = pending;
        pending = undefined;
        dot?.dispose();
        const ms = Date.now() - at;
        const time = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
        // Keep xterm's own classes (they position the element); ours only colour it. No inline
        // badge: it would sit on top of a right-hand prompt (RPROMPT), so the time is on hover.
        // One bar down the whole block: the command and everything it printed.
        const buffer = term.buffer.active;
        const rows = Math.max(1, Math.min(buffer.baseY + buffer.cursorY - marker.line, 500));
        const mark = term.registerDecoration({ marker, x: 0, width: 1, height: rows, layer: "top", overviewRulerOptions: { color: ok ? "#4ade80aa" : "#ff6b6bcc", position: "right" } });
        mark?.onRender((el) => {
          el.classList.add("term-gutter", ok ? "is-ok" : "is-bad");
          el.title = ok ? `Succeeded in ${time}` : `Failed (exit ${code}) after ${time}`;
        });
      }
      return true; // handled: nothing to draw
    });

    fitRef.current = fit;
    termRef.current = term;
    const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/terminal/${info.id}`);
    const send = (m: object) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(m));
    onReady({ term, fit, search, markers, send: (data) => send({ type: "input", data }) });
    socket.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as { type: string; data?: string; replay?: string; code?: number; blocks?: Block[]; block?: Block; where?: Where };
      if (m.type === "ready") {
        if (m.blocks) onBlocks(m.blocks);
        if (m.replay) term.write(m.replay);
        fit.fit();
        send({ type: "resize", cols: term.cols, rows: term.rows });
      } else if (m.type === "data" && m.data) term.write(m.data);
      else if (m.type === "block") {
        if (m.block) onBlock(m.block);
        if (m.where) onWhere(m.where);
      } else if (m.type === "exit") {
        term.write(`\r\n\x1b[38;2;107;116;130m[process exited${m.code ? ` with ${m.code}` : ""}]\x1b[0m\r\n`);
        onExit(m.code ?? 0);
      }
    };
    const input = term.onData((data) => send({ type: "input", data }));
    const resize = term.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
    const focusIn = () => onFocus();
    host.current.addEventListener("focusin", focusIn);
    const observer = new ResizeObserver(() => {
      if (host.current?.offsetParent && host.current.clientWidth > 0) fit.fit();
    });
    observer.observe(host.current);
    const el = host.current;
    return () => {
      observer.disconnect();
      el.removeEventListener("focusin", focusIn);
      input.dispose();
      resize.dispose();
      socket.close();
      term.dispose();
    };
  }, [info.id]);

  useEffect(() => {
    if (pane !== "hidden") {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        if (pane === "full") termRef.current?.focus();
      });
    }
  }, [pane]);

  return (
    <div
      ref={host}
      className={`terminal-host is-${pane} ${focused ? "is-focused" : ""}`}
      style={{ visibility: pane === "hidden" ? "hidden" : "visible" }}
      aria-label={`Terminal ${info.title}`}
      onMouseDown={onFocus}
    />
  );
}
