import * as Dialog from "@radix-ui/react-dialog";
import { AudioLines, Mic, MicOff, Square, X, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { AnyEvent } from "@shuacrew/core/events";
import type { CrewMember } from "@shuacrew/core/projections";
import { api, cancelRun, decideApproval } from "../lib/api";
import { useLive } from "../lib/live";
import { conversation } from "../lib/conversation";
import { VoiceController, type VoicePhase } from "../lib/voice-controller";
import { VoiceCapture } from "../lib/voice-capture";
import { VoicePlayback } from "../lib/voice-playback";
import { NativeVoice } from "../lib/native-voice";
import { loadVoicePreferences } from "../lib/voice-preferences";
import "./voice-conversation.css";

type Request = { runId?: string; memberId?: string; runtime?: string; key?: string };
type Runtime = { id: string; label: string; authMode: string; status: { installed: boolean; signedIn: boolean | null; overridingKeys: string[] } };
const LABEL: Record<VoicePhase, string> = { idle: "Ready when you are", starting: "Connecting your microphone", listening: "Listening", transcribing: "Turning speech into words", submitting: "Sending your request", thinking: "Working on it", generating: "Preparing a spoken reply", speaking: "Speaking", approval: "Needs your approval", interrupting: "Stopping work", muted: "Microphone off", error: "Let's fix that" };

/** Mounted above route content so opening the created thread never restarts the voice loop. */
export function VoiceConversationHost() {
  const [request, setRequest] = useState<Request>();
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const open = (event: Event) => { trigger.current = document.activeElement as HTMLElement; setRequest({ ...(event as CustomEvent<Request>).detail, key: crypto.randomUUID() }); };
    window.addEventListener("shuacrew:voice", open);
    return () => window.removeEventListener("shuacrew:voice", open);
  }, []);
  return <Dialog.Root open={Boolean(request)} onOpenChange={open => { if (!open) setRequest(undefined); }}><Dialog.Portal><Dialog.Overlay className="voice-backdrop" /><Dialog.Content className="voice-dialog" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
    {request && <VoiceConversation key={request.key} request={request} close={() => setRequest(undefined)} switchConversation={() => setRequest({ key: crypto.randomUUID() })} />}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function VoiceConversation({ request, close, switchConversation }: { request: Request; close: () => void; switchConversation: () => void }) {
  const members = useLive(s => s.crew.members);
  const connection = useLive(s => s.connection);
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [runtime, setRuntime] = useState(request.runtime ?? "");
  const [memberId, setMemberId] = useState(request.memberId || "shua");
  const [voiceId, setVoiceId] = useState(members[memberId]?.voice?.voiceId ?? "aiden");
  const [ready, setReady] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [warm, setWarm] = useState(false);
  const [level, setLevel] = useState(0);
  const [events, setEvents] = useState<AnyEvent[]>([]);
  const navigate = useNavigate();
  const capture = useMemo(() => new VoiceCapture(), []);
  const playback = useMemo(() => new VoicePlayback(), []);
  const nativeAudio = useMemo(() => new NativeVoice(), []);
  const [voicePreferences] = useState(loadVoicePreferences);
  const nativeConversation = voicePreferences.mode === "conversation" && NativeVoice.available();
  const selectedProviderReady = runtimes.some(p => p.id === runtime);
  const config = useRef({ runtime, memberId, voiceId, speed: 1, selectedProviderReady }); config.current = { runtime, memberId, voiceId, speed: members[memberId]?.voice?.speed ?? 1, selectedProviderReady };
  const controller = useMemo(() => new VoiceController({
    continuousCapture: nativeConversation,
    interruptWhileSpeaking: voicePreferences.automaticInterruption,
    prepare: async (signal, reconnect) => {
      if (!config.current.selectedProviderReady) throw new Error("The selected provider is unavailable. Choose a connected subscription or start a new voice conversation.");
      if (!nativeConversation) await playback.prepare(); signal.throwIfAborted();
      if (request.runId && !reconnect) {
        const current = useLive.getState().crew.runs[request.runId];
        if (!current || current.pendingApprovals.length || !["done", "failed", "cancelled", "reviewing"].includes(current.status)) throw new Error("This session is busy or awaiting approval. Open its thread before starting voice.");
        if (current.permission !== "ask") throw new Error("Switch the session to supervised before starting voice.");
      }
      if (!useLive.getState().crew.members[config.current.memberId]) {
        const response = await fetch("/api/voice/initialize", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify({ runtime: config.current.runtime }), signal });
        const result = await response.json(); signal.throwIfAborted();
        if (!response.ok) throw new Error(result.error ?? "Could not initialize Shua.");
      }
    },
    identity: () => ({ runtime: config.current.runtime, memberId: config.current.memberId }),
    capture: (signal, onUtterance, onError) => nativeConversation
      ? nativeAudio.start(signal, onUtterance, onError, setLevel, () => { if (voicePreferences.automaticInterruption) void controller.userSpeech(); }, voicePreferences.endpoint)
      : capture.start(signal, onUtterance, onError, setLevel),
    transcribe: async (blob, signal) => {
      const name = blob.type.includes("wav") ? "voice.wav" : blob.type.includes("mp4") ? "voice.mp4" : "voice.webm";
      const response = await fetch(`/api/transcribe?voice=1&name=${name}`, { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/octet-stream" }, body: blob, signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Transcription failed.");
      return result.text;
    },
    submit: async (text, requestId, runId, signal, identity) => {
      const body = { text, requestId, runId, ...identity };
      // Retry the same id only: a lost response must not duplicate a tool-enabled turn.
      for (let attempt = 0; ; attempt++) {
        try {
          const response = await fetch("/api/voice/utterances", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
          const result = await response.json();
          if (!response.ok) throw Object.assign(new Error(result.error ?? "Voice submission failed."), { definitive: true });
          return result;
        } catch (error) { if (signal.aborted || attempt >= 2 || (error as { definitive?: boolean }).definitive) throw error; }
      }
    },
    speak: (text, signal, started, received) => nativeConversation ? nativeAudio.speak(text, config.current.voiceId, config.current.speed, signal, started, received) : playback.speak(text, config.current.voiceId, config.current.speed, signal, started, received),
    cancel: async id => {
      await cancelRun(id);
      for (let i = 0; i < 60; i++) { if ((await api<{ idle: boolean }>(`/api/voice/runs/${id}/idle`)).idle) return; await new Promise(resolve => setTimeout(resolve, 250)); }
      throw new Error("Work is still stopping. Check its session before resuming.");
    },
  }, request.runId), []);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const run = useLive(s => state.runId ? s.crew.runs[state.runId] : undefined);
  const approvals = useLive(s => s.crew.approvals);
  const pending = Object.values(approvals).filter(a => a.run === state.runId);
  const editable = state.phase === "idle" && !state.runId && !state.pending;
  const member = members[memberId];
  useEffect(() => {
    let cancelled = false;
    Promise.all([api<Runtime[]>("/api/runtimes"), api<{ state: string; error?: string }>("/api/speech/status"), api<{ voice: boolean; missing: string[] }>("/api/media")]).then(([providers, speech, media]) => {
      if (cancelled) return;
      const connected = providers.filter(p => p.authMode === "subscription" && p.status.installed && p.status.signedIn !== false && !p.status.overridingKeys.length && p.id !== "mock");
      setRuntimes(connected);
      if (!runtime) setRuntime(connected[0]?.id ?? "");
      setReady(speech.state === "ready" && media.voice && connected.length > 0);
      if (speech.state !== "ready") setSetupError(speech.error ?? "Set up local voices in Settings first.");
      else if (!media.voice) setSetupError(`Local recognition needs ${media.missing.join(", ")}.`);
      else if (!connected.length) setSetupError("Connect Claude or Codex with your subscription in Settings → Agents.");
    }).catch(error => { if (!cancelled) setSetupError(error.message); });
    return () => { cancelled = true; controller.end(); playback.close(); nativeAudio.close(); };
  }, []);
  useEffect(() => {
    if (!state.runId) return;
    const abort = new AbortController(); let polling = false;
    const refresh = async () => {
      if (polling) return; polling = true;
      try {
        const response = await fetch(`/api/runs/${state.runId}/events`, { signal: abort.signal });
        if (!response.ok) throw new Error("Could not read the voice session.");
        const next = await response.json() as AnyEvent[];
        if (abort.signal.aborted) return;
        setEvents(next);
        const fresh = next.filter(e => e.seq > controller.snapshot().after);
        const items = conversation(fresh);
        controller.stream(state.runId!, items.flatMap(item => item.kind === "prose" ? [{ seq: item.seq, text: item.text }] : []));
        const completed = fresh.findLast(e => e.kind === "turn.completed");
        const lastStatus = fresh.findLast(e => e.kind === "run.status");
        if (lastStatus?.kind === "run.status" && ["failed", "cancelled"].includes(lastStatus.body.status) && ["thinking", "approval"].includes(controller.snapshot().phase)) controller.fail(lastStatus.body.reason ?? "The agent stopped. Check the conversation and retry.");
        else if (completed?.kind === "turn.completed") {
          const text = items.filter(item => item.kind === "prose" && item.turn === completed.body.turn).map(item => item.kind === "prose" ? item.text : "").join("\n");
          void controller.complete(state.runId!, completed.seq, text);
        }
      } catch (error) { if (!abort.signal.aborted) controller.fail(error instanceof Error ? error.message : "Connection lost."); }
      finally { polling = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 250);
    return () => { abort.abort(); clearInterval(timer); };
  }, [state.runId]);
  useEffect(() => { controller.approval(pending.length > 0); }, [pending.length]);
  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    setWarm(false);
    const warmVoice = () => { void fetch("/api/speech/warm", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify({ voiceId, warmMinutes: voicePreferences.warmMinutes }), signal: abort.signal }).then(async response => { if (!response.ok) throw new Error((await response.json()).error ?? "Voice warmup failed."); if (!abort.signal.aborted) setWarm(true); }).catch(error => { if (!abort.signal.aborted) setSetupError(error.message); }); };
    warmVoice(); const keepWarm = setInterval(warmVoice, (voicePreferences.warmMinutes * 60 - 30) * 1000);
    return () => { abort.abort(); clearInterval(keepWarm); };
  }, [voiceId, ready]);
  const start = async () => {
    try {
      setSetupError("");
      await controller.start();
    } catch (error) { setSetupError(error instanceof Error ? error.message : "Could not start voice."); }
  };
  const returnToChat = () => { controller.end(); playback.close(); close(); if (state.runId) void navigate({ to: "/sessions/$id", params: { id: state.runId } }); };
  const currentTool = [...events].reverse().find(e => e.kind === "tool.called");
  return <>
    <header className="voice-heading"><div><span className="voice-kicker">YOUR CREW, IN CONVERSATION</span><Dialog.Title>{member?.name ?? "Shua"}</Dialog.Title><Dialog.Description>Talk naturally. See the work. Stay in control.</Dialog.Description></div><button aria-label="End voice and close" onClick={() => { controller.end(); playback.close(); close(); }}><X size={20} /></button></header>
    <div className="voice-layout"><section className="voice-stage" aria-label="Voice controls">
      <div className={`voice-orb is-${state.phase}`} style={{ "--voice-level": level } as React.CSSProperties} aria-hidden="true"><AudioLines size={52} strokeWidth={1.25} /></div>
      <h2 role="status" aria-live="polite">{LABEL[state.phase]}</h2>
      <p className="voice-state-detail">{state.phase === "listening" ? "Microphone on · pause to send, or finish below" : state.phase === "speaking" ? nativeConversation ? voicePreferences.automaticInterruption ? "Microphone on · experimental interruption enabled" : "Microphone on · use Interrupt to stop the reply" : "Microphone off while Shua speaks" : state.phase === "thinking" ? "Your agent is working. You can interrupt at any time." : warm ? "Voice warmed up · ready for conversation" : "Warming the local voice in the background…"}</p>
      <p className="voice-state-detail">{nativeConversation ? "Native audio · echo processing · acoustic testing pending" : "Turn-based microphone · manual interruption"}</p>
      <div className="voice-selectors">
        <label>Speaking with<select value={memberId} disabled={!editable} onChange={event => { setMemberId(event.target.value); setVoiceId(members[event.target.value]?.voice?.voiceId ?? "aiden"); const provider = members[event.target.value]?.runtime; if (provider) setRuntime(provider); }}><option value="shua">{members.shua?.name ?? "Shua"}</option>{Object.values(members).filter(m => m.id !== "shua").map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label>Intelligence<select value={runtime} disabled={!editable} onChange={event => setRuntime(event.target.value)}>{!selectedProviderReady && <option value={runtime}>{runtime || "No provider"} · unavailable</option>}{runtimes.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label>Voice<select value={voiceId} disabled={!["idle", "muted", "error"].includes(state.phase)} onChange={event => setVoiceId(event.target.value)}><option value="aiden">Aiden · US</option><option value="charles">Charles · UK</option>{!["aiden", "charles"].includes(voiceId) && <option value={voiceId}>Saved voice · choose Aiden or Charles to audition</option>}</select></label>
      </div>
      {(setupError || state.error) && <p role="alert" className="voice-error">{setupError || state.error}</p>}
      <div className="voice-actions">
        {["idle", "muted", "error"].includes(state.phase) && !state.pending && <button className="voice-primary" disabled={!ready || !selectedProviderReady || connection !== "live"} onClick={() => void start()}><Mic size={17} /> {state.phase === "idle" ? "Start conversation" : "Resume conversation"}</button>}
        {state.pending && ["idle", "muted", "error"].includes(state.phase) && <button onClick={() => void controller.recoverSubmission()}>Recover original request</button>}
        {state.retrySpeech && (nativeConversation ? state.phase === "listening" : ["idle", "muted", "error"].includes(state.phase)) && <button onClick={() => void controller.retrySpeech()}>Replay spoken reply</button>}
        {state.retrySpeech && nativeConversation && ["idle", "muted", "error"].includes(state.phase) && <p className="voice-state-detail">Resume voice to enable replay. Your agent request will not be sent again.</p>}
        {state.phase === "listening" && <button className="voice-primary" onClick={() => nativeConversation ? nativeAudio.finish() : capture.finish?.()}>Finish speaking</button>}
        {(state.phase === "listening" || nativeConversation && !["idle", "muted", "error", "approval"].includes(state.phase)) && <button onClick={() => controller.mute()}><MicOff size={16} /> Mute</button>}
        {["thinking", "generating", "speaking", "approval"].includes(state.phase) && <button onClick={() => void controller.interrupt()}><Square size={16} /> Interrupt & stop work</button>}
        {state.phase !== "idle" && <button onClick={() => { controller.end(); playback.close(); }}>End voice</button>}
      </div>
      {(state.runId || !selectedProviderReady) && <button className="mt-2 text-[12px] text-fg-2 underline" disabled={state.pending} onClick={() => { controller.end(); playback.close(); switchConversation(); }}>New conversation / switch crew member</button>}
      <p className="voice-privacy">Speech stays on this Mac. Your transcript goes to {runtime || "your provider"}. Subscription limits apply. End voice releases the microphone; it does not stop agent work.</p>
    </section><aside className="voice-transcript" aria-label="Conversation and work"><div className="voice-transcript-head"><span>CONVERSATION</span><button disabled={!state.runId} onClick={returnToChat}>Open thread <ArrowUpRight size={14} /></button></div>
      {state.transcript ? <div className="voice-bubble is-you"><small>YOU</small><p>{state.transcript}</p></div> : <div className="voice-empty">Start with what's on your mind.<br />Your conversation will appear here.</div>}
      {state.pendingTranscript && <div className="voice-work"><span>HELD · NOT SENT</span><label>Next instruction<textarea value={state.pendingTranscript} maxLength={8000} onChange={event => controller.editPendingTranscript(event.target.value)} /></label><p>The previous task must stop before this instruction is sent.</p><button disabled={state.phase === "interrupting"} onClick={() => void controller.recoverCancellation()}>Confirm stop & send instruction</button></div>}
      {state.answer && <div className="voice-bubble"><small>{member?.name ?? "SHUA"}</small><p>{state.answer}</p></div>}
      {currentTool?.kind === "tool.called" && <div className="voice-work"><span>{run?.status === "running" ? "LATEST ACTIVITY" : "LAST ACTIVITY"}</span><strong>{currentTool.body.tool}</strong><small>Open the thread to inspect tool details and results.</small></div>}
      {pending.map(a => <div className="voice-work" key={a.id}><span>YOUR APPROVAL NEEDED</span><strong>{a.tool}</strong><p>{a.reason}</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px]">{JSON.stringify(a.input, null, 2)}</pre><div className="voice-actions"><button onClick={() => void decideApproval(a.id, false).catch(e => setSetupError(e.message))}>Deny</button><button onClick={() => void decideApproval(a.id, true).catch(e => setSetupError(e.message))}>Allow once</button></div></div>)}
    </aside></div>
  </>;
}
