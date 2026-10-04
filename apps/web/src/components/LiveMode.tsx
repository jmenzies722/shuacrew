import { AudioLines, Check, PhoneOff, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { liveTranscript } from "../lib/live-transcript";
import { voiceEnvelope } from "../lib/voice-envelope";
import { useLive, useLiveLevels, startLive, endLive, stopLiveWork, stopLiveSpeech, answer, type LiveView } from "../lib/live-session";
import { LiveVoiceSelect } from "./LiveVoiceSelect";
export { liveActive, liveUsable, startLive, endLive, useLive, liveVoice, setLiveVoice, LIVE_VOICES } from "../lib/live-session";
import "./live-mode.css";

const LABEL: Record<LiveView["state"], string> = { off: "Live", ready: "Mic off · hold Fn or enable Talk", connecting: "Connecting…", listening: "Listening", speaking: "Speaking", working: "Working on it", ended: "Call ended", error: "Couldn't connect" };

export function LiveButton({ compact = false }: { compact?: boolean }) {
  const live = useLive();
  return (
    <button type="button" className={`live-btn${live.active ? " is-on" : ""}${compact ? " is-compact" : ""}`} aria-pressed={live.active}
      title={live.active ? "End the live call" : "Talk live: interrupt any time, like a call"} aria-label={live.active ? "End live call" : "Start live call"}
      onClick={() => (live.active ? endLive() : startLive())}>
      {live.active ? <PhoneOff size={compact ? 13 : 14} /> : <AudioLines size={compact ? 13 : 14} />}
      {!compact && <span>{live.active ? "End" : "Live"}</span>}
    </button>
  );
}

export function LiveWaveform({ compact = false }: { compact?: boolean }) {
  const live = useLive(), levels = useLiveLevels();
  return <VoiceWaveform compact={compact} state={live.state} readLevel={() => live.state === "speaking" ? levels.voice : levels.mic} />;
}

export function VoiceWaveform({ compact = false, state, readLevel }: { compact?: boolean; state: string; readLevel: () => number }) {
  const root = useRef<HTMLSpanElement>(null), sample = useRef(readLevel);
  const active = state === "listening" || state === "speaking";
  sample.current = active ? readLevel : () => 0;
  const normalize = (value: number) => Math.min(1, Math.sqrt(Math.max(0, Number.isFinite(value) ? value : 0)) * 3);
  const energy = normalize(sample.current());
  useEffect(() => {
    const bars = Array.from(root.current?.children ?? []) as HTMLElement[];
    if (!active) { bars.forEach(bar => { bar.style.height = "3px"; bar.style.transform = "none"; }); return; }
    const weights = [0.35, 0.6, 0.85, 0.65, 1, 0.7, 0.9, 0.55, 0.3];
    const range = compact ? 15 : 29, height = range + 3;
    let frame = 0, previous = performance.now(), envelope = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const tick = (now: number) => {
      const target = normalize(sample.current());
      envelope = reduced.matches || document.documentElement.dataset.motion === "reduced" ? target : voiceEnvelope(envelope, target, now - previous);
      previous = now;
      bars.forEach((bar, index) => { bar.style.height = `${height}px`; bar.style.transform = `scaleY(${(3 + envelope * weights[index]! * range) / height})`; });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [compact, active]);
  return <span ref={root} className={`live-waveform is-${state}${compact ? " is-compact" : ""}`} role="img" aria-label={`${state === "speaking" ? "Voice" : "Microphone"} waveform`}>
    {[0.35, 0.6, 0.85, 0.65, 1, 0.7, 0.9, 0.55, 0.3].map((weight, index) => <i key={index} style={{ height: `${3 + energy * weight * (compact ? 15 : 29)}px`, animationDelay: `${index * 65}ms` }} />)}
  </span>;
}

function CallStatus({ live }: { live: LiveView }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!live.tasks && live.state !== "working") return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [live.tasks, live.state]);
  const working = !!live.tasks || live.state === "working";
  return <span className="live-status">{live.muted ? "Voice stopped · speak to resume" : live.approval ? "Needs your approval" : live.capturing && live.mode === "hold" ? "Listening · release Fn to send" : working ? `Working · ${Math.max(0, Math.floor((now - (live.workStartedAt ?? now)) / 1000))}s` : LABEL[live.state]}</span>;
}

function Approval({ live, compact }: { live: LiveView; compact?: boolean }) {
  const a = live.approval; if (!a) return null;
  return (
    <div className={`live-approval${compact ? " is-compact" : ""}`} role="alertdialog" aria-label="Shua needs your OK">
      <ShieldAlert size={14} />
      <span><b>{a.kind === "command" ? "Run this?" : a.kind === "action" ? "OK to do this?" : "Change files?"}</b> <code title={a.text}>{a.text}</code>{!compact && a.why && <small>{a.why}</small>}<small>Say yes or no</small></span>
      <button type="button" className="is-yes" onClick={() => answer(true)}><Check size={13} />Allow</button>
      <button type="button" onClick={() => answer(false)}><X size={13} />Deny</button>
    </div>
  );
}

export function LiveTranscript({ live }: { live: LiveView }) {
  const lines = liveTranscript(live.feed), list = useRef<HTMLOListElement>(null), follow = useRef(true);
  const latest = lines.at(-1)?.text;
  useEffect(() => { if (follow.current && list.current) list.current.scrollTop = list.current.scrollHeight; }, [latest, lines.length]);
  return <ol ref={list} className="live-conversation" aria-label="Conversation transcript" aria-live="polite" onScroll={() => { const el = list.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 36; }}>
    {lines.map((line, index) => <li key={index} className={`is-${line.role}${line.partial ? " is-partial" : ""}`}><span>{line.role === "user" ? "You" : "Shua"}{line.partial ? " · transcribing" : line.corrected ? " · updated result" : ""}</span><p>{line.text}</p></li>)}
  </ol>;
}

/** The island row while a call is on: orb, what's happening, and the line being said. */
export function LiveIsland({ expanded = false }: { expanded?: boolean } = {}) {
  const live = useLive();
  if (!live.active) return null;
  const last = live.feed.at(-1);
  if (expanded) return <section className="live-island is-expanded" aria-label="Live conversation">
    <header><LiveWaveform compact /><CallStatus live={live} /><span className="live-spacer" />{live.state === "speaking" && <button type="button" className="live-btn" onClick={stopLiveSpeech}>Stop voice</button>}{!!live.tasks && <button type="button" className="live-btn" onClick={stopLiveWork}>Stop work</button>}<LiveButton compact /></header>
    <LiveTranscript live={live} /><Approval live={live} compact />
  </section>;
  return (
    <div className="live-island">
      {live.approval ? <Approval live={live} compact /> : <>
        <LiveWaveform />
        <CallStatus live={live} />
        {live.state === "speaking" && <button type="button" className="live-btn" onClick={stopLiveSpeech}>Stop voice</button>}
        <span className={`live-island-text${last?.kind === "step" ? " is-step" : ""}`}>{last?.kind === "line" && last.role === "assistant" ? live.spokenText ?? "" : last?.text ?? ""}</span>
        {!!live.tasks && <button type="button" className="live-btn" onClick={stopLiveWork}>Stop work</button>}
        <LiveButton compact />
      </>}
    </div>
  );
}

/** The card while a call is on: the conversation, what the hands are doing, the result, and approvals. */
export function LivePanel() {
  const live = useLive();
  if (!live.active && live.state !== "error") return null;
  return (
    <section className={`live-panel is-${live.state}`} aria-label="Live call">
      <header>
        <LiveWaveform />
        <div><strong><CallStatus live={live} /></strong><small>{live.state === "error" ? `${(live.detail ?? "Live isn't available right now").replace(/[.!?]?\s*$/, ".")} You can keep typing or retry the call.` : live.detail || (live.usage !== undefined && live.usage >= 80 ? `Reported plan usage: ${Math.round(live.usage)}%.` : "One conversation · voice, screen and teaching")}</small></div>
        {!!live.tasks && <button type="button" className="live-btn" onClick={stopLiveWork}>Stop work</button>}
        {live.active ? <><button type="button" className="live-btn" onClick={stopLiveSpeech}>Stop voice</button><LiveButton /></> : <button type="button" className="live-btn" onClick={() => startLive()}>Try again</button>}
      </header>
      <LiveTranscript live={live} />
      <Approval live={live} />
      {live.active && (
        <label className="live-voice">Shua's voice · powered by OpenAI
          <LiveVoiceSelect />
        </label>
      )}
    </section>
  );
}
