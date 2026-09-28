import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, Play, RefreshCw, Square } from "lucide-react";
import { saveBuddyVoice, useBuddyVoice } from "../lib/buddy-voice";
import type { VoiceChoice } from "@shuacrew/core/voice";
import { api } from "../lib/api";
import { readSpeechStream } from "../lib/speech-stream";
import { VoiceCastPicker } from "./VoiceCastPicker";
import { useLive } from "../lib/live";
import type { MemberVoice } from "@shuacrew/core/voice";
import type { CrewMember } from "@shuacrew/core";
import { loadVoicePreferences, saveVoicePreferences, type VoicePreferences } from "../lib/voice-preferences";
import { NativeVoice } from "../lib/native-voice";

type Status = { state: string; voices: (VoiceChoice & { attribution?: string })[]; error?: string; step?: string };
const SAMPLE = "Hi, I'm Shua. You've got a few things on your mind. Let's pick the most important one, and take it from there. What would you like to get done?";

/** Audition only until the user qualifies the cast. No automatic microphone or audio. */
/** One voice everywhere: the companion's voice is also Shua's in Sessions voice mode, so the two never disagree. */
export async function setVoiceEverywhere(shua: CrewMember | undefined, voiceId: string, speed?: number) {
  saveBuddyVoice({ id: voiceId, ...(speed ? { speed } : {}) });
  if (shua) await api("/api/crew", { body: { ...shua, voice: { ...(shua.voice ?? { speed: 1, personality: "calm" }), voiceId, ...(speed ? { speed } : {}) } } }).catch(() => {});
}

export function VoiceSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const chosen = useBuddyVoice();
  const [conversation, setConversation] = useState(loadVoicePreferences);
  const changeConversation = (next: VoicePreferences) => { setConversation(next); setSaved(saveVoicePreferences(next) ? "Conversation preferences saved. Apply when opening voice next." : "Storage unavailable. These preferences could not be saved."); };
  const shua = useLive(s => s.crew.members.shua);
  const [saved, setSaved] = useState("");
  const saveVoice = async (voice: MemberVoice) => {
    if (!shua) return;
    try { await api("/api/crew", { body: { ...shua, voice } }); setSaved("Shua's voice preferences saved."); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save voice."); }
  };
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [active, setActive] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const job = useRef<{ abort: AbortController; context: AudioContext } | undefined>(undefined);
  const mounted = useRef(true);
  const refresh = () => { setError(""); void api<Status>("/api/speech/status").then(s => { if (mounted.current) setStatus(s); }).catch(e => { if (mounted.current) setError(e.message); }); };
  const stop = () => {
    const current = job.current; job.current = undefined;
    current?.abort.abort();
    if (current && current.context.state !== "closed") void current.context.close().catch(() => {});
    if (mounted.current) { setActive(undefined); setPlaying(false); }
  };
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; stop(); }; }, []);
  useEffect(() => { if (status?.state !== "installing") return; const timer = setInterval(refresh, 1500); return () => clearInterval(timer); }, [status?.state]);
  const preview = async (voiceId: string) => {
    stop(); setError("");
    const current = { abort: new AbortController(), context: new AudioContext() };
    job.current = current; setActive(voiceId);
    const { signal } = current.abort;
    const id = crypto.randomUUID();
    let scheduled = 0;
    const endings: Promise<void>[] = [];
    try {
      await current.context.resume();
      signal.throwIfAborted();
      const response = await fetch("/api/speech/synthesize", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify({ id, generation: 1, voiceId, text: SAMPLE, speed: 1 }), signal });
      if (!response.ok || !response.body) throw new Error("Speech is unavailable. Refresh and try again.");
      await readSpeechStream(response.body, { id, generation: 1 }, signal, async data => {
        const audio = await current.context.decodeAudioData(data);
        signal.throwIfAborted();
        if (job.current !== current) return;
        const source = current.context.createBufferSource();
        source.buffer = audio; source.connect(current.context.destination);
        scheduled = Math.max(scheduled, current.context.currentTime);
        endings.push(new Promise<void>(resolve => {
          const done = () => { signal.removeEventListener("abort", done); resolve(); };
          source.onended = () => { source.disconnect(); done(); };
          signal.addEventListener("abort", done, { once: true });
        }));
        source.start(scheduled); scheduled += audio.duration;
        setPlaying(true);
      });
      await Promise.all(endings);
    } catch (e) { if (!signal.aborted && job.current === current && mounted.current) setError(e instanceof Error ? e.message : "Preview failed."); }
    finally { if (job.current === current) stop(); }
  };
  return <div className={embedded ? "voice-studio" : "settings-card"}>
    {!embedded && <div className="notification-status"><AudioLines size={24} /><div><span className="settings-kicker">SHUA · NEURAL VOICE STUDIO</span><strong>A voice worth talking to.</strong><p>A small English-only cast, generated on your Mac. These are audition candidates—not the old system voices.</p></div><button aria-label="Refresh voice availability" onClick={refresh}><RefreshCw size={15} /></button></div>}
    <div className="px-5 pb-5">
      <div className="mb-5 rounded-xl border border-line p-4">
        <h3 className="mb-3 text-[15px] font-semibold">Conversation controls</h3>
        <label className="preference-row"><span><strong>Audio mode</strong><small>Native conversation keeps capture and playback on one echo-processing graph.</small></span><select value={conversation.mode} onChange={e => changeConversation({ ...conversation, mode: e.target.value as VoicePreferences["mode"] })}><option value="push-to-talk">Turn-based · manual interrupt</option><option value="conversation" disabled={!NativeVoice.available()}>Native conversation</option></select></label>
        {!NativeVoice.available() && <p className="text-[12px] text-fg-3">Native conversation requires the updated Mac application. No microphone is opened by these settings.</p>}
        <label className="preference-row"><span><strong>Interrupt while Shua speaks · experimental</strong><small>Opt in only for testing. Speaker echo and double-talk still need real microphone verification. Existing tool effects cannot be undone.</small></span><input type="checkbox" checked={conversation.automaticInterruption} disabled={conversation.mode !== "conversation" || !NativeVoice.available()} onChange={e => changeConversation({ ...conversation, automaticInterruption: e.target.checked })} /></label>
        <label className="preference-row"><span><strong>Pause before sending</strong><small>Native endpoint target—not a measured response-time promise.</small></span><select value={conversation.endpoint} onChange={e => changeConversation({ ...conversation, endpoint: e.target.value as VoicePreferences["endpoint"] })}><option value="quick">Quick · 450 ms</option><option value="balanced">Balanced · 750 ms</option><option value="patient">Patient · 1,100 ms</option></select></label>
        <p role="status" className="text-[12px] text-fg-3">{saved}</p>
        <label className="preference-row"><span><strong>Keep local voice warm</strong><small>Release the worker this long after voice activity ends.</small></span><select value={conversation.warmMinutes} onChange={e => changeConversation({ ...conversation, warmMinutes: Number(e.target.value) as VoicePreferences["warmMinutes"] })}><option value={2}>2 minutes</option><option value={5}>5 minutes</option><option value={10}>10 minutes</option></select></label>
      </div>
      <div role="status" aria-live="polite" className="mb-4 text-[12px] text-fg-2">{active ? playing ? "Playing on this Mac…" : "Loading the local model and generating your preview…" : status?.state === "ready" ? "Ready to audition · no microphone needed · no voice API charges" : status?.error ?? "Checking local speech…"}</div>
      {error && <p role="alert" className="mb-4 text-[12px] text-bad">{error}</p>}
      {status && status.state !== "ready" && <div className="mb-5 rounded-xl border border-line p-4"><p className="mb-3 text-[12px] text-fg-2">{status.step || status.error}</p><button className="settings-reset" onClick={() => void api(`/api/speech/install${status.state === "installing" ? "/cancel" : ""}`, { body: {} }).then(refresh).catch(error => setError(error.message))}>{status.state === "installing" ? "Cancel setup" : "Download & set up local voices"}</button><p className="mt-3 text-[11px] text-fg-3">Downloads pinned models from Hugging Face and packages from PyPI using uv. No API key or voice subscription. Partial downloads are kept for retry.</p></div>}
      <div className="grid grid-cols-2 gap-3 max-[700px]:grid-cols-1">
        {status?.voices.map(voice => <article key={voice.id} className={`rounded-2xl border p-4 ${active === voice.id ? "border-[var(--amber)] bg-raised" : "border-line bg-sunken"}`}>
          <div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel text-[17px] font-medium">{voice.name.slice(0, 1)}</span><div><h3 className="text-[15px] font-semibold">{voice.name}</h3><span className="text-[11px] text-fg-3">{voice.accent === "en-US" ? "AMERICAN ENGLISH" : "BRITISH ENGLISH"}</span></div></div>
          <p className="mb-4 text-[12px] text-fg-2">{voice.description}</p>
          <button className="settings-reset w-full justify-center" disabled={status.state !== "ready"} onClick={() => active === voice.id ? stop() : void preview(voice.id)}>{active === voice.id ? <><Square size={14} /> Stop preview</> : <><Play size={14} /> Hear {voice.name}</>}</button>
          {embedded && <button className="settings-reset mt-2 w-full justify-center" aria-pressed={chosen.id === voice.id} disabled={chosen.id === voice.id} onClick={() => void setVoiceEverywhere(shua, voice.id)}>{chosen.id === voice.id ? <><Check size={14} /> Your companion's voice</> : "Use this voice"}</button>}
          <details className="mt-3 text-[10px] leading-relaxed text-fg-3"><summary className="cursor-pointer">Voice source & license</summary><p className="mt-2">{voice.attribution ?? "Qwen3-TTS custom voice preset."} <a href={voice.source} target="_blank" rel="noreferrer" className="underline">{voice.license}</a></p></details>
        </article>)}
      </div>
      {shua && !embedded && <div className="mt-5 border-t border-line pt-5"><VoiceCastPicker value={shua.voice ?? { voiceId: "michael", speed: 1, personality: "calm" }} onChange={voice => void saveVoice(voice)} /><p role="status" className="mt-2 text-[11px] text-fg-3">{saved || "Playback pace changes pitch too; 1× preserves the natural voice."}</p></div>}
      <p className="mt-5 text-[12px] leading-relaxed text-fg-3">Both previews use the same script. First playback can take longer while the model loads. Open Voice mode in Sessions to talk; your crew's voices and personalities are editable in Crew. Previewing never starts the microphone.</p>
    </div>
  </div>;
}
