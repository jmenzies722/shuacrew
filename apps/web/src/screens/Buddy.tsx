import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Eye, EyeOff, Maximize2, MousePointer2, RotateCcw, X } from "lucide-react";
import type { AnyEvent } from "@shuacrew/core/events";
import { api, followUp } from "../lib/api";
import { useLive } from "../lib/live";
import { upload, withAttachments } from "../lib/attachments";
import { buddyPrompt, parsePoint, speakable } from "../lib/buddy";
import { useCompanion } from "../lib/companion";
import { SparkArt } from "../components/Companion";
import { Dictation } from "../components/Dictation";
import { Markdown } from "../components/Markdown";
import "../components/companion.css";
import "./buddy.css";

type Native = { postMessage(m: unknown): void };
const native = (): Native | undefined => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Native } } }).webkit?.messageHandlers?.shuacrew;
const post = (m: Record<string, unknown>) => native()?.postMessage(m);
const KEY = "shuacrew.buddy";

/** Ask the Mac for one screenshot of the display you're on (never stored beyond this question's session). */
function capture(): Promise<{ file: File; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (!native()) { reject(new Error("Screen questions work in the ShuaCrew Mac app.")); return; }
    const t = setTimeout(() => { window.removeEventListener("shuacrew:capture", on as EventListener); reject(new Error("Screenshot timed out.")); }, 15_000);
    const on = (e: CustomEvent<{ data?: string; width?: number; height?: number; error?: string }>) => {
      clearTimeout(t); window.removeEventListener("shuacrew:capture", on as EventListener);
      const d = e.detail; if (!d.data) { reject(new Error(d.error ?? "Couldn't capture the screen.")); return; }
      const bytes = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
      resolve({ file: new File([bytes], "screen.jpg", { type: "image/jpeg" }), width: d.width ?? 0, height: d.height ?? 0 });
    };
    window.addEventListener("shuacrew:capture", on as EventListener);
    post({ type: "buddyCapture" });
  });
}

export function Buddy() {
  const prefs = useCompanion();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(""), [see, setSee] = useState(true);
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const [convo, setConvo] = useState<{ run: string; first: string } | null>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } });
  const input = useRef<HTMLTextAreaElement>(null), thread = useRef<HTMLDivElement>(null), pointed = useRef<string>("");
  const loadRun = useLive((s) => s.loadRun), events = useLive((s) => (convo ? s.runEvents[convo.run] : undefined)), status = useLive((s) => (convo ? s.crew.runs[convo.run]?.status : undefined));
  useEffect(() => { if (convo) void loadRun(convo.run); }, [convo, loadRun]);
  // The native panel resizes to what's showing, so the transparent rest never blocks clicks on your apps.
  useEffect(() => { post({ type: "buddyExpand", open }); if (open) setTimeout(() => input.current?.focus(), 60); }, [open]);
  useEffect(() => {
    (window as unknown as { buddy: unknown }).buddy = { toggle: () => setOpen((o) => !o), focus: () => { setOpen(true); setTimeout(() => input.current?.focus(), 80); } };
  }, []);
  const messages = useMemo(() => {
    const out: Array<{ who: "you" | "spark"; text: string; live?: boolean; id?: number }> = convo ? [{ who: "you", text: convo.first }] : [];
    let streaming = "";
    for (const e of (events ?? []) as AnyEvent[]) {
      if (e.kind === "run.followup") { out.push({ who: "you", text: (e.body as { text: string }).text.split("\n\n[screen]")[0]! }); streaming = ""; }
      else if (e.kind === "agent.delta") streaming += e.body.text;
      else if (e.kind === "agent.message") { out.push({ who: "spark", text: e.body.text, id: e.seq }); streaming = ""; }
    }
    if (streaming) out.push({ who: "spark", text: streaming, live: true });
    return out;
  }, [events, convo]);
  // Point on screen the first time each answer arrives.
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.who === "spark" && !m.live);
    if (!last?.id || pointed.current === String(last.id)) return;
    pointed.current = String(last.id);
    const p = parsePoint(last.text); if (p) post({ type: "buddyPoint", ...p });
  }, [messages]);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" }); }, [messages.length, messages.at(-1)?.text.length]);
  const working = status === "running" || status === "planning" || status === "queued";

  const ask = async (text = draft) => {
    const q = text.trim(); if (!q) return;
    setError(""); setBusy(see ? "Looking at your screen…" : "Thinking…");
    try {
      let atts: Awaited<ReturnType<typeof upload>>[] = [], screen: { width: number; height: number } | null = null;
      if (see) { const shot = await capture(); atts = [await upload(shot.file)]; screen = { width: shot.width, height: shot.height }; }
      if (convo && status && !["failed", "cancelled"].includes(status)) {
        await followUp(convo.run, withAttachments(screen ? `${q}\n\n[screen] A fresh screenshot is attached (${screen.width}×${screen.height}). Point with a \`\`\`point block if it helps.` : q, atts));
      } else {
        const r = await api<{ id: string }>("/api/runs", { body: { ask: withAttachments(buddyPrompt(q, screen), atts), title: `Spark · ${q.slice(0, 60)}`, runtime: "claude", model: screen ? "claude-sonnet-5" : "claude-haiku-4-5", effort: "low", labels: ["buddy"] } });
        const next = { run: r.id, first: q }; setConvo(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      }
      setDraft("");
    } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(""); }
  };
  const reset = () => { setConvo(null); try { localStorage.removeItem(KEY); } catch { /* ignore */ } };

  return <div className={`buddy ${open ? "is-open" : ""}`}>
    {open && <section className="buddy-card" aria-label="Ask Spark">
      <header><strong>{prefs.nickname || "Spark"}</strong><span>{working ? "thinking…" : "on your desktop"}</span>
        {convo && <button type="button" aria-label="Open in ShuaCrew" title="Open in ShuaCrew" onClick={() => post({ type: "buddyOpen", run: convo.run })}><Maximize2 size={13} /></button>}
        {convo && <button type="button" aria-label="New conversation" title="New conversation" onClick={reset}><RotateCcw size={13} /></button>}
        <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={14} /></button></header>
      <div className="buddy-thread" ref={thread}>
        {!messages.length && <p className="buddy-hint">Ask me anything — about what's on your screen, a tool you're stuck in, or your work. I can point right at things. <kbd>⌃⌥Space</kbd> brings me up from anywhere.</p>}
        {messages.map((m, i) => { const p = m.who === "spark" && !m.live ? parsePoint(m.text) : null; return <div key={i} className={`buddy-msg is-${m.who}`}>
          {m.who === "spark" ? <><Markdown text={speakable(m.text)} streaming={m.live} />{p && <button type="button" className="buddy-point" onClick={() => post({ type: "buddyPoint", ...p })}><MousePointer2 size={11} /> {p.label || "Show me"} again</button>}</> : m.text}
        </div>; })}
        {(busy || (working && messages.at(-1)?.who === "you")) && <p className="buddy-typing"><span /><span /><span /> {busy}</p>}
      </div>
      {error && <p className="buddy-error">{error}</p>}
      <form className="buddy-input" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <button type="button" className={`buddy-see ${see ? "is-on" : ""}`} aria-pressed={see} title={see ? "I'll look at your screen when you ask (one screenshot, only then)" : "Screen off — I won't look"} onClick={() => setSee((v) => !v)}>{see ? <Eye size={14} /> : <EyeOff size={14} />}</button>
        <textarea ref={input} rows={1} value={draft} placeholder={see ? "Ask about your screen…" : "Ask me anything…"} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(); } if (e.key === "Escape") setOpen(false); }} aria-label="Ask Spark" />
        <Dictation available onText={(t) => void ask(t)} />
        <button className="buddy-send" disabled={!!busy || !draft.trim()} aria-label="Ask"><ArrowUp size={15} /></button>
      </form>
    </section>}
    <div className={`buddy-spark ${working || busy ? "is-thinking" : ""}`} aria-hidden="true"><SparkArt preferences={prefs} /><i className="buddy-shadow" /></div>
  </div>;
}
