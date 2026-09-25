import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUp, Check, ChevronRight, Compass, Eye, EyeOff, LayoutGrid, Maximize2, MessageCircle, MousePointer2, RotateCcw, Send, Volume2, VolumeX, X } from "lucide-react";
import type { AnyEvent } from "@shuacrew/core/events";
import { api, followUp, launchRun } from "../lib/api";
import { useLive } from "../lib/live";
import { isTopLevelWork } from "../lib/crew";
import { upload, withAttachments } from "../lib/attachments";
import { buddyPrompt, describeAction, guideFollowUp, nextSentences, parseActions, parseGuide, parsePoint, speakable, type Action, type GuideStep } from "../lib/buddy";
import { saveBuddyVoice, SpeechQueue, useBuddyVoice } from "../lib/buddy-voice";
import { remainingFocusMs, setFocus, startFocus, useFocusTimer } from "../lib/focus-timer";
import { saveNote, useNote } from "../lib/widgets";
import { useCompanion } from "../lib/companion";
import { SparkCharacter } from "../components/SparkCharacter";
import { Dictation } from "../components/Dictation";
import { Markdown } from "../components/Markdown";
import { SparkWidgets, type WidgetCtx } from "../components/TopBarWidgets";
import "../components/companion.css";
import "./buddy.css";

type Native = { postMessage(m: unknown): void };
const native = (): Native | undefined => (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Native } } }).webkit?.messageHandlers?.shuacrew;
const post = (m: Record<string, unknown>) => native()?.postMessage(m);
const KEY = "shuacrew.buddy";
const ctx: WidgetCtx = { go: (path) => post({ type: "buddyOpen", path }) };

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

/** Mac actions go to the app (which checks them again); the rest happen right here. */
function perform(a: Action): Promise<{ ok: boolean; message: string; run?: string }> {
  if (a.type === "focus") { setFocus(startFocus(a.minutes)); return Promise.resolve({ ok: true, message: `${a.minutes}-minute focus started` }); }
  if (a.type === "note") { const n = localStorage.getItem("shuacrew.widgets.note") ?? ""; saveNote(n ? `${n}\n${a.text}` : a.text); return Promise.resolve({ ok: true, message: "Added to your note" }); }
  if (a.type === "crew") return launchRun({ ask: a.ask }).then((r) => ({ ok: true, message: "The crew is on it", run: r.id }), (e: Error) => ({ ok: false, message: e.message }));
  return new Promise((resolve) => {
    if (!native()) { resolve({ ok: false, message: "Only in the Mac app" }); return; }
    const id = crypto.randomUUID();
    const t = setTimeout(() => { window.removeEventListener("shuacrew:did", on as EventListener); resolve({ ok: false, message: "No answer from the Mac" }); }, 8000);
    const on = (e: CustomEvent<{ id: string; ok: boolean; message: string }>) => { if (e.detail.id !== id) return; clearTimeout(t); window.removeEventListener("shuacrew:did", on as EventListener); resolve(e.detail); };
    window.addEventListener("shuacrew:did", on as EventListener);
    post({ type: "buddyDo", id, action: a });
  });
}

type Done = { label: string; ok: boolean; message: string; run?: string };

export function Buddy() {
  const prefs = useCompanion(), voice = useBuddyVoice(), note = useNote();
  const [open, setOpen] = useState(false), [tab, setTab] = useState<"chat" | "widgets">("chat"), [draft, setDraft] = useState(""), [see, setSee] = useState(true);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [speaking, setSpeaking] = useState(false);
  const [done, setDone] = useState<Record<number, Done[]>>({});
  const [bubble, setBubble] = useState<{ text: string; path: string } | null>(null);
  // Guide mode: the step Spark is spotlighting right now, waiting for you to do it.
  const [guide, setGuide] = useState<GuideStep | null>(null), [cheer, setCheer] = useState(false);
  const [convo, setConvo] = useState<{ run: string; first: string } | null>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; } });
  const input = useRef<HTMLTextAreaElement>(null), thread = useRef<HTMLDivElement>(null);
  const speech = useRef<SpeechQueue>(null as unknown as SpeechQueue); speech.current ??= new SpeechQueue();
  // Answers already on screen when the panel loaded were handled before; only new ones point, act and speak.
  const handled = useRef<number | null>(null), spokenUpto = useRef(0), streamId = useRef("");
  const crew = useLive((s) => s.crew), loadRun = useLive((s) => s.loadRun);
  const events = useLive((s) => (convo ? s.runEvents[convo.run] : undefined)), status = convo ? crew.runs[convo.run]?.status : undefined;
  const timer = useFocusTimer(), [now, setNow] = useState(Date.now());
  useEffect(() => { if (!timer) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [timer]);
  useEffect(() => { speech.current.onSpeaking = setSpeaking; }, []);
  useEffect(() => { if (convo) void loadRun(convo.run); }, [convo, loadRun]);
  // The native panel sizes itself to what's showing, so the clear rest never blocks your clicks.
  useEffect(() => { post({ type: "buddyExpand", open, peek: !open && (!!bubble || !!guide), size: prefs.size }); if (open) setTimeout(() => input.current?.focus(), 60); }, [open, bubble, guide, prefs.size]);
  useEffect(() => {
    (window as unknown as { buddy: unknown }).buddy = { perform, toggle: () => { speech.current.unlock(); setOpen((o) => !o); }, focus: () => { speech.current.unlock(); setOpen(true); setTab("chat"); setTimeout(() => input.current?.focus(), 80); } };
  }, []);

  const messages = useMemo(() => {
    const out: Array<{ who: "you" | "spark"; text: string; live?: boolean; id?: number }> = convo ? [{ who: "you", text: convo.first }] : [];
    let streaming = "";
    for (const e of (events ?? []) as AnyEvent[]) {
      if (e.kind === "run.followup") { out.push({ who: "you", text: (e.body as { text: string }).text.split("\n\n[screen]")[0]!.split("\n\n[attachments]")[0]! }); streaming = ""; }
      else if (e.kind === "agent.delta") streaming += e.body.text;
      else if (e.kind === "agent.message") { out.push({ who: "spark", text: e.body.text, id: e.seq }); streaming = ""; }
    }
    if (streaming) out.push({ who: "spark", text: streaming, live: true });
    return out;
  }, [events, convo]);

  // Speak in real time: each whole sentence as it streams in.
  const live = messages.at(-1)?.live ? messages.at(-1)!.text : "";
  useEffect(() => {
    if (!live || handled.current === null) return;
    const key = `${convo?.run}:${messages.length}`;
    if (streamId.current !== key) { streamId.current = key; spokenUpto.current = 0; }
    const next = nextSentences(live, spokenUpto.current);
    spokenUpto.current = next.upto; next.chunks.forEach((c) => speech.current.say(c));
  }, [live, convo, messages.length]);

  // A finished answer: speak what's left, point, and do what it asked.
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.who === "spark" && !m.live);
    if (events === undefined) return;
    if (handled.current === null) { handled.current = last?.id ?? 0; return; }
    if (!last?.id || last.id <= handled.current) return;
    handled.current = last.id;
    const key = `${convo?.run}:${messages.length}`;
    const rest = nextSentences(last.text, streamId.current === key ? spokenUpto.current : 0, true);
    rest.chunks.forEach((c) => speech.current.say(c)); streamId.current = ""; spokenUpto.current = 0;
    const p = parsePoint(last.text); if (p) post({ type: "buddyPoint", ...p, color: prefs.color });
    const g = parseGuide(last.text);
    if (g?.done) { setGuide(null); post({ type: "buddyGuideStop" }); setCheer(true); setTimeout(() => setCheer(false), 2400); }
    else if (g) { setGuide(g); post({ type: "buddyGuide", ...g, color: prefs.color, wait: prefs.guide === "click" }); }
    const actions = parseActions(last.text), id = last.id;
    if (actions.length) void (async () => {
      const results: Done[] = [];
      for (const a of actions) { const r = await perform(a); results.push({ label: describeAction(a), ...r }); setDone((d) => ({ ...d, [id]: [...results] })); }
    })();
  }, [messages, events, convo]);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" }); }, [messages.length, messages.at(-1)?.text.length, tab]);

  // Connected to the app: when your crew finishes, fails or needs you, Spark says so beside itself.
  const seen = useRef<Record<string, string> | null>(null);
  const approvals = Object.keys(crew.approvals).length;
  useEffect(() => {
    const work = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs));
    const prev = seen.current; seen.current = Object.fromEntries(work.map((r) => [r.id, r.status]));
    if (!prev) return;
    for (const r of work) {
      if (prev[r.id] === r.status || !prev[r.id]) continue;
      const who = r.member ? crew.members[r.member]?.name : null;
      if (r.status === "done") { setBubble({ text: `${who ?? "The crew"} finished “${r.title}”`, path: `/sessions/${r.id}` }); speech.current.say(`${who ?? "The crew"} finished ${r.title}.`); }
      else if (r.status === "failed") setBubble({ text: `“${r.title}” hit a problem`, path: `/sessions/${r.id}` });
      else if (r.status === "awaiting_approval") setBubble({ text: `“${r.title}” needs your OK`, path: `/sessions/${r.id}` });
    }
  }, [crew.runs, crew.members]);
  useEffect(() => { if (!bubble) return; const t = setTimeout(() => setBubble(null), 9000); return () => clearTimeout(t); }, [bubble]);

  const working = status === "running" || status === "planning" || status === "queued";
  /** You did the step: look again and ask Spark for the next one, from what's really on screen now. */
  const advance = async () => {
    const step = guide; if (!step || !convo) return;
    setGuide(null); post({ type: "buddyGuideStop" }); setBusy("Looking at what changed…"); setError("");
    try {
      await new Promise((r) => setTimeout(r, 700)); // let the app you clicked finish drawing
      const shot = await capture(), att = await upload(shot.file);
      await followUp(convo.run, withAttachments(guideFollowUp(step.label, { width: shot.width, height: shot.height }), [att]));
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const advanceRef = useRef(advance); advanceRef.current = advance;
  useEffect(() => { const on = () => void advanceRef.current(); window.addEventListener("shuacrew:guideClick", on); return () => window.removeEventListener("shuacrew:guideClick", on); }, []);
  const stopGuide = () => { setGuide(null); post({ type: "buddyGuideStop" }); speech.current.stop(); };
  const ask = async (text = draft) => {
    const q = text.trim(); if (!q) return;
    speech.current.unlock(); speech.current.stop();
    setError(""); setTab("chat"); setBusy(see ? "Looking at your screen…" : "Thinking…");
    try {
      let atts: Awaited<ReturnType<typeof upload>>[] = [], screen: { width: number; height: number } | null = null;
      if (see) { const shot = await capture(); atts = [await upload(shot.file)]; screen = { width: shot.width, height: shot.height }; }
      if (convo && status && !["failed", "cancelled"].includes(status)) {
        await followUp(convo.run, withAttachments(screen ? `${q}\n\n[screen] A fresh screenshot is attached (${screen.width}×${screen.height}). Point with a \`\`\`point block if it helps.` : q, atts));
      } else {
        const r = await api<{ id: string }>("/api/runs", { body: { ask: withAttachments(buddyPrompt(q, screen, { name: prefs.nickname || "Spark", tone: prefs.tone, length: prefs.length }), atts), title: `${prefs.nickname || "Spark"} · ${q.slice(0, 60)}`, runtime: "claude", model: screen ? "claude-sonnet-5" : "claude-haiku-4-5", effort: "low", labels: ["buddy"] } });
        const next = { run: r.id, first: q }; handled.current = 0; setConvo(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      }
      setDraft("");
    } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); } finally { setBusy(""); }
  };
  const reset = () => { stopGuide(); setConvo(null); setDone({}); try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
  const lastQuestion = [...messages].reverse().find((m) => m.who === "you")?.text;
  const focusPct = timer ? 1 - remainingFocusMs(timer, now) / timer.durationMs : 0;

  return <div className={`buddy ${open ? "is-open" : ""}`} style={{ "--spark-color": prefs.color } as CSSProperties}>
    {open && <section className="buddy-card" aria-label="Ask Spark">
      <header>
        <strong>{prefs.nickname || "Spark"}</strong><span>{speaking ? "speaking…" : working ? "thinking…" : "on your Mac"}</span>
        <button type="button" aria-label={voice.on ? "Mute Spark" : "Let Spark talk"} title={voice.on ? "Spark talks · click to mute" : "Muted · click to let Spark talk"} className={voice.on ? "is-on" : ""} onClick={() => { speech.current.unlock(); if (voice.on) speech.current.stop(); saveBuddyVoice({ on: !voice.on }); }}>{voice.on ? <Volume2 size={13} /> : <VolumeX size={13} />}</button>
        {convo && <button type="button" aria-label="Open in ShuaCrew" title="Open this conversation in ShuaCrew" onClick={() => post({ type: "buddyOpen", run: convo.run })}><Maximize2 size={13} /></button>}
        {convo && <button type="button" aria-label="New conversation" title="New conversation" onClick={reset}><RotateCcw size={13} /></button>}
        <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={14} /></button>
      </header>
      <nav className="buddy-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}><MessageCircle size={12} /> Chat</button>
        <button type="button" role="tab" aria-selected={tab === "widgets"} onClick={() => setTab("widgets")}><LayoutGrid size={12} /> Widgets{approvals > 0 && <em>{approvals}</em>}</button>
      </nav>
      {tab === "widgets" ? <div className="buddy-thread buddy-widgets"><SparkWidgets ctx={ctx} /></div> : <>
        <div className="buddy-thread" ref={thread}>
          {!messages.length && <div className="buddy-hint">
            <p>Ask me anything, or tell me to do something. I can see your screen, point at things, and talk you through it.</p>
            <div className="buddy-starters">{["Show me how to do this", "What am I looking at?", "Open Activity Monitor", "Open VS Code and my projects folder", "Start a 25 minute focus"].map((s) => <button key={s} type="button" onClick={() => void ask(s)}>{s}</button>)}</div>
            <p><kbd>⌃⌥Space</kbd> brings me up from any app.</p>
          </div>}
          {messages.map((m, i) => { const p = m.who === "spark" && !m.live ? parsePoint(m.text) : null, did = m.id ? done[m.id] : undefined; return <div key={i} className={`buddy-msg is-${m.who}`}>
            {m.who === "spark" ? <><Markdown text={speakable(m.text)} streaming={m.live} />
              {did && <div className="buddy-did">{did.map((d, j) => <button type="button" key={j} className={d.ok ? "is-ok" : "is-bad"} title={d.message} onClick={() => d.run && post({ type: "buddyOpen", run: d.run })}>{d.ok ? <Check size={11} /> : <X size={11} />} {d.ok ? d.message : `${d.label}: ${d.message}`}</button>)}</div>}
              {p && <button type="button" className="buddy-point" onClick={() => post({ type: "buddyPoint", ...p })}><MousePointer2 size={11} /> Show me {p.label ? `“${p.label}”` : ""} again</button>}</> : m.text}
          </div>; })}
          {(busy || (working && messages.at(-1)?.who === "you")) && <p className="buddy-typing"><span /><span /><span /> {busy}</p>}
          {convo && !working && !busy && lastQuestion && <button type="button" className="buddy-handoff" onClick={() => void perform({ type: "crew", ask: lastQuestion }).then((r) => r.run && post({ type: "buddyOpen", run: r.run }))}><Send size={11} /> Hand this to the crew as a full session</button>}
        </div>
        {error && <p className="buddy-error">{error}</p>}
      </>}
      {guide && <div className="buddy-guide"><Compass size={14} /><span><b>Step {guide.step}</b> {guide.label}</span>
        <button type="button" title={prefs.guide === "click" ? "Or just click the highlighted spot" : "Tell me when you've done it"} onClick={() => void advance()}>Done <ChevronRight size={12} /></button><button type="button" aria-label="Stop guiding" onClick={stopGuide}><X size={12} /></button></div>}
      <form className="buddy-input" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <button type="button" className={`buddy-see ${see ? "is-on" : ""}`} aria-pressed={see} title={see ? "I'll look at your screen when you ask (one screenshot, only then)" : "Screen off: I won't look"} onClick={() => setSee((v) => !v)}>{see ? <Eye size={14} /> : <EyeOff size={14} />}</button>
        <textarea ref={input} rows={1} value={draft} placeholder={see ? "Ask, or tell me to do something…" : "Ask me anything…"} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(); } if (e.key === "Escape") { speech.current.stop(); setOpen(false); } }} aria-label="Ask Spark" />
        <Dictation available onText={(t) => void ask(t)} />
        <button className="buddy-send" disabled={!!busy || !draft.trim()} aria-label="Ask"><ArrowUp size={15} /></button>
      </form>
      {note && tab === "chat" && <p className="buddy-note" title={note}>📝 {note.split("\n")[0]}</p>}
    </section>}
    {!open && guide && <div className="buddy-bubble is-guide"><span><Compass size={12} /> Step {guide.step}: {guide.label}</span>
      <div><button type="button" onClick={() => void advance()}>Done <ChevronRight size={11} /></button><button type="button" onClick={stopGuide}>Stop</button></div></div>}
    {!open && !guide && bubble && <button type="button" className="buddy-bubble" onClick={() => { post({ type: "buddyOpen", path: bubble.path }); setBubble(null); }}>{bubble.text}<small>Open in ShuaCrew</small></button>}
    <div className={`buddy-spark size-${prefs.size} ${working || busy ? "is-thinking" : ""} ${speaking ? "is-speaking" : ""}`} aria-hidden="true">
      {timer && <svg className="buddy-focus" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="46" className="fill" style={{ strokeDashoffset: `${289 * (1 - focusPct)}` }} /></svg>}
      <SparkCharacter preferences={prefs} mood={cheer ? "happy" : speaking ? "speaking" : working || busy ? "thinking" : "idle"} /><i className="buddy-shadow" />
      {approvals > 0 && <em className="buddy-badge">{approvals}</em>}
    </div>
  </div>;
}
