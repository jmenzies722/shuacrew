import { VoiceWaveform } from "./LiveMode";

export function NotchVoiceStatus({ state, held, readLevel }: { state: string; held: boolean; readLevel: () => number }) {
  if (state !== "listening" && state !== "speaking") return null;
  return <div className="notch-voice-status" role="status" aria-live="polite">
    <span><strong>{state === "speaking" ? "Speaking" : "Listening"}</strong>{held && <small>Release Fn to send</small>}</span>
    <VoiceWaveform state={state} readLevel={readLevel} />
  </div>;
}
