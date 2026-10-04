import { useEffect, useRef, useState } from "react";
import { VoiceComparison as Comparison, NARRATION_SAMPLE, type ComparisonSnapshot } from "../lib/voice-comparison";
import { saveBuddyVoice } from "../lib/buddy-voice";

export function VoiceComparison({ voices, ready = false, engine = "Local speech", error }: { voices: Array<{ id: string; name: string }>; ready?: boolean; engine?: string; error?: string }) {
  const available = ready ? voices : [];
  const [snapshot, setSnapshot] = useState<ComparisonSnapshot>({ voiceId: null, status: "idle", firstAudioMs: null, error: null });
  const [saved, setSaved] = useState("");
  const controller = useRef<Comparison | null>(null);
  const voiceChannel = useRef<BroadcastChannel | null>(null);
  const voiceIds = available.map(voice => voice.id).join(",");
  useEffect(() => {
    const comparison = new Comparison(voiceIds.split(",").filter(Boolean), () => setSnapshot(comparison.snapshot()));
    controller.current = comparison;
    const stop = () => comparison.stop();
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("shuacrew-voice-focus") : null;
    voiceChannel.current = channel;
    if (channel) channel.onmessage = stop;
    window.addEventListener("shuacrew:voice-active", stop);
    return () => { controller.current = null; comparison.dispose(); voiceChannel.current = null; channel?.close(); window.removeEventListener("shuacrew:voice-active", stop); };
  }, [voiceIds]);
  return <section className="voice-comparison" aria-label="Compare narration voices">
    <h4>Compare narration voices</h4><p>{engine} · same architecture passage · natural 1× pace. Previewing does not change your saved voice.</p>
    {!ready && <p role="status">{error || "The local voice engine is not ready. Install or repair it below before comparing voices."}</p>}
    <blockquote>{NARRATION_SAMPLE}</blockquote>
    <div className="architecture-followups">{available.map(voice => <button key={voice.id} type="button" aria-pressed={snapshot.voiceId === voice.id && snapshot.status !== "idle"} onClick={() => { setSaved(""); voiceChannel.current?.postMessage("preview"); void controller.current?.play(voice.id); }}>Hear {voice.name}</button>)}<button type="button" disabled={!available.length || snapshot.status === "idle"} onClick={() => controller.current?.stop()}>Stop sample</button></div>
    <p role="status">{snapshot.error || (snapshot.status === "loading" ? "Preparing the selected voice…" : snapshot.status === "playing" ? "Playing the selected voice" : "Ready to compare")}{snapshot.firstAudioMs !== null && ` · First audio: ${snapshot.firstAudioMs} ms`}</p>
    <button type="button" className="setting-input" disabled={!snapshot.voiceId || snapshot.firstAudioMs === null || !!snapshot.error || !available.some(voice => voice.id === snapshot.voiceId)} onClick={() => { if (snapshot.voiceId) { saveBuddyVoice({ id: snapshot.voiceId, speed: 1 }); setSaved("Selected for Shua's calls, chat, and teaching."); } }}>Use as Shua's voice</button>
    {saved && <p role="status">{saved}</p>}
    <p>One voice for calls and chat, generated on this Mac. OpenAI handles the live conversation and receives call audio.</p>
  </section>;
}
