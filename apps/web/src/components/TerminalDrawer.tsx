/**
 * The terminal: real shells in tabs, living in the gateway. Close the drawer, reload the page,
 * restart the app — the shells keep running and come back with their scrollback. Loaded on first
 * open (xterm.js is its own chunk).
 */
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XTerm } from "@xterm/xterm";
import { useNavigate } from "@tanstack/react-router";
import { Bot, Eraser, MessageSquarePlus, Plus, Sparkles, SquareTerminal, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PALETTE } from "../lib/ansi";
import { api, followUp, launchRun } from "../lib/api";
import { conversation } from "../lib/conversation";
import { useLive } from "../lib/live";

interface TerminalInfo {
  id: string;
  title: string;
  cwd: string;
  run?: string;
  exited?: number;
}

const FONT = '"JetBrains Mono Variable", "Hack Nerd Font Mono", "Symbols Nerd Font Mono", "MesloLGS NF", Menlo, monospace';

const THEME = {
  background: "#0a0c0f",
  foreground: "#d5dae1",
  cursor: "#ffb020",
  cursorAccent: "#0a0c0f",
  selectionBackground: "rgba(255, 176, 32, 0.28)",
  selectionInactiveBackground: "rgba(255, 176, 32, 0.14)",
  scrollbarSliderBackground: "rgba(255, 255, 255, 0.10)",
  scrollbarSliderHoverBackground: "rgba(255, 255, 255, 0.18)",
  black: PALETTE[0], red: PALETTE[1], green: PALETTE[2], yellow: PALETTE[3], blue: PALETTE[4], magenta: PALETTE[5], cyan: PALETTE[6], white: PALETTE[7],
  brightBlack: PALETTE[8], brightRed: PALETTE[9], brightGreen: PALETTE[10], brightYellow: PALETTE[11], brightBlue: PALETTE[12], brightMagenta: PALETTE[13], brightCyan: PALETTE[14], brightWhite: PALETTE[15],
};

const AGENT = "agent";

export default function TerminalDrawer({ scope, onClose, full }: { scope: { run?: string }; onClose: () => void; full?: boolean }) {
  const [terms, setTerms] = useState<TerminalInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [exited, setExited] = useState<Record<string, number>>({});
  const views = useRef(new Map<string, { term: XTerm; fit: FitAddon }>());
  const key = scope.run ?? "home";

  const open = async () => {
    const created = await api<TerminalInfo>("/api/terminals", { body: { run: scope.run } });
    setTerms((t) => [...t, created]);
    setActive(created.id);
  };

  useEffect(() => {
    let cancelled = false;
    void api<TerminalInfo[]>(`/api/terminals?run=${encodeURIComponent(key)}`).then(async (list) => {
      if (cancelled) return;
      if (list.length) {
        setTerms(list);
        setActive(list[list.length - 1]!.id);
      } else if (!scope.run) await open();
      else setActive(AGENT); // a session's terminal opens on what the agent is doing
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const close = async (id: string) => {
    await api(`/api/terminals/${id}`, { method: "DELETE" }).catch(() => undefined);
    views.current.delete(id);
    setTerms((t) => {
      const next = t.filter((x) => x.id !== id);
      if (active === id) setActive(next[next.length - 1]?.id ?? null);
      if (!next.length && !scope.run) onClose();
      return next;
    });
  };

  const current = active ? views.current.get(active) : undefined;
  return (
    <div className="terminal-drawer">
      <div className="terminal-bar">
        <SquareTerminal size={14} className="text-amber" />
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist" aria-label="Terminals">
          {scope.run && (
            <div role="tab" aria-selected={active === AGENT} className={`terminal-tab ${active === AGENT ? "is-active" : ""}`} onClick={() => setActive(AGENT)} title="What the agent is running, live">
              <Bot size={12} className="text-amber" />
              <span>Agent</span>
            </div>
          )}
          {terms.map((t) => (
            <div key={t.id} role="tab" aria-selected={t.id === active} className={`terminal-tab ${t.id === active ? "is-active" : ""}`} onClick={() => setActive(t.id)}>
              <span className={`h-1.5 w-1.5 rounded-full ${exited[t.id] !== undefined || t.exited !== undefined ? "bg-fg-3" : "bg-ok"}`} />
              <span className="mono truncate">{t.title}</span>
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
          <button onClick={() => void open()} className="terminal-action" title="New terminal" aria-label="New terminal">
            <Plus size={14} />
          </button>
        </div>
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
        {!full && (
          <button className="terminal-action" title="Hide (shells keep running) — ⌃`" aria-label="Hide terminal" onClick={onClose}>
            <X size={15} />
          </button>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {scope.run && <AgentView run={scope.run} visible={active === AGENT} />}
        {terms.map((t) => (
          <TerminalView
            key={t.id}
            info={t}
            visible={t.id === active}
            onReady={(view) => views.current.set(t.id, view)}
            onExit={(code) => setExited((e) => ({ ...e, [t.id]: code }))}
          />
        ))}
      </div>
      <AskBar
        run={scope.run}
        cwd={terms.find((t) => t.id === active)?.cwd}
        context={() => {
          const view = active && active !== AGENT ? views.current.get(active) : undefined;
          if (!view) return "";
          const selected = view.term.getSelection();
          if (selected.trim()) return selected;
          const buffer = view.term.buffer.active;
          const lines: string[] = [];
          for (let i = Math.max(0, buffer.length - 60); i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
          return lines.join("\n").trim();
        }}
        full={full}
      />
    </div>
  );
}

/**
 * Ask the crew from the terminal: your words plus what's on screen (the selection, or the last
 * screenful). In a session it becomes your next message; on its own it starts a session here.
 */
function AskBar({ run, cwd, context, full }: { run?: string; cwd?: string; context: () => string; full?: boolean }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState("");
  const navigate = useNavigate();
  const send = async (ask: string) => {
    const screen = context();
    const message = screen ? `${ask}\n\nFrom my terminal${cwd ? ` (in ${cwd})` : ""}:\n\`\`\`\n${screen.slice(-6000)}\n\`\`\`` : ask;
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
  return (
    <div className={`terminal-ask ${full ? "is-full" : ""}`}>
      <Sparkles size={13} className="shrink-0 text-amber" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && text.trim() && void send(text.trim())}
        placeholder={run ? "Ask the agent about what's on screen…" : "Ask the crew — it starts a session right here, with this output…"}
        aria-label="Ask the crew"
      />
      {sent ? (
        <span className="text-[11.5px] text-ok">{sent}</span>
      ) : (
        <>
          <button onClick={() => void send("Explain what happened here, briefly.")} className="terminal-chip" title="Explain the selection or the last screen">
            Explain
          </button>
          <button onClick={() => void send("This failed — find out why and fix it.")} className="terminal-chip" title="Hand the error to an agent to fix">
            <Wand2 size={11} /> Fix this
          </button>
        </>
      )}
    </div>
  );
}

/** The agent's own shell, read-only: every command it runs and what came back, as it happens. */
function AgentView({ run, visible }: { run: string; visible: boolean }) {
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
  const shown = useRef<Map<number, boolean>>(new Map()); // seq → finished?

  useEffect(() => {
    if (!host.current) return;
    const t = new XTerm({ fontFamily: FONT, fontSize: 12.5, lineHeight: 1.15, disableStdin: true, cursorBlink: false, convertEol: true, scrollback: 20_000, theme: { ...THEME, cursor: THEME.background } });
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
      if (before === undefined) t.write(`\r\n\x1b[38;2;255;176;32m❯\x1b[0m \x1b[1m${step.command}\x1b[0m\r\n`);
      if (done && before !== true) {
        if (step.output) t.write(step.output.replace(/\n$/, "") + "\r\n");
        t.write(step.ok ? "\x1b[38;2;74;222;128m✓ done\x1b[0m\r\n" : "\x1b[38;2;255;107;107m✗ failed\x1b[0m\r\n");
      }
      shown.current.set(step.key, done);
    }
  }, [steps]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => fit.current?.fit());
  }, [visible]);

  return <div ref={host} className="terminal-host" style={{ visibility: visible ? "visible" : "hidden" }} aria-label="Agent's commands" />;
}

function TerminalView({ info, visible, onReady, onExit }: { info: TerminalInfo; visible: boolean; onReady: (v: { term: XTerm; fit: FitAddon }) => void; onExit: (code: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const term = new XTerm({
      // Named outright (a CSS variable means nothing to a canvas). Nerd Font second, so prompts and
      // `ls` icons from the person's own shell setup render instead of boxes.
      fontFamily: FONT,
      fontSize: 12.5,
      lineHeight: 1.15,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      scrollback: 20_000,
      macOptionIsMeta: true,
      allowProposedApi: true,
      theme: THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, "_blank", "noopener")));
    term.open(host.current);
    // Cells are measured from the font; measure again once the web font has actually loaded.
    void document.fonts.load(`12.5px "JetBrains Mono Variable"`).then(() => {
      term.options.fontFamily = FONT;
      fit.fit();
    });
    // The DOM renderer is crisp and correctly scaled everywhere; the GPU one mis-scaled on Retina
    // in testing, so it's opt-in (localStorage "shuacrew.terminalRenderer" = "gpu").
    let gpu = false;
    try {
      gpu = localStorage.getItem("shuacrew.terminalRenderer") === "gpu";
    } catch {
      /* storage blocked: keep the default */
    }
    if (gpu) try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl); // GPU rendering: smooth at any output rate
    } catch {
      /* the DOM renderer is fine */
    }
    // ⌘-shortcuts belong to the app (⌘K, ⌘N, ⌘C/⌘V go through the browser's copy and paste).
    term.attachCustomKeyEventHandler((e) => !e.metaKey);
    fitRef.current = fit;
    termRef.current = term;
    onReady({ term, fit });

    const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/terminal/${info.id}`);
    const send = (m: object) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(m));
    socket.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as { type: string; data?: string; replay?: string; code?: number };
      if (m.type === "ready") {
        if (m.replay) term.write(m.replay);
        fit.fit();
        send({ type: "resize", cols: term.cols, rows: term.rows });
      } else if (m.type === "data" && m.data) term.write(m.data);
      else if (m.type === "exit") {
        term.write(`\r\n\x1b[38;2;107;116;130m[process exited${m.code ? ` with ${m.code}` : ""}]\x1b[0m\r\n`);
        onExit(m.code ?? 0);
      }
    };
    const input = term.onData((data) => send({ type: "input", data }));
    const resize = term.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
    const observer = new ResizeObserver(() => {
      if (host.current?.offsetParent) fit.fit();
    });
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      input.dispose();
      resize.dispose();
      socket.close();
      term.dispose();
    };
  }, [info.id]);

  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        termRef.current?.focus();
      });
    }
  }, [visible]);

  return <div ref={host} className="terminal-host" style={{ visibility: visible ? "visible" : "hidden" }} aria-label={`Terminal ${info.title}`} />;
}
