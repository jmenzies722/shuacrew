import { api } from "./api";
export type VoiceStamps = Partial<Record<"endpoint" | "transcribed" | "firstText" | "firstAudio" | "playback", number>>;
export function voiceDurations(stamps: VoiceStamps) {
  const interval = (start: keyof VoiceStamps, end: keyof VoiceStamps): number | null => {
    const a = stamps[start], b = stamps[end];
    return a !== undefined && b !== undefined && Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round(b - a) : null;
  };
  return { transcriptionMs: interval("endpoint", "transcribed"), providerMs: interval("transcribed", "firstText"), synthesisMs: interval("firstText", "firstAudio"), playbackMs: interval("firstAudio", "playback"), firstAudioMs: interval("endpoint", "playback") };
}
export function voiceTimingSummary(rows: Array<{ firstAudioMs: number | null }>) {
  const values = rows.flatMap(row => row.firstAudioMs !== null && Number.isFinite(row.firstAudioMs) && row.firstAudioMs >= 0 ? [row.firstAudioMs] : []).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return { count: values.length, medianMs: values.length ? values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2 : null, p95Ms: values.length ? values[Math.ceil(values.length * .95) - 1]! : null };
}
type Measurement = ReturnType<typeof voiceDurations> & { at: number };
let history: Measurement[] = [];
const listeners = new Set<() => void>();
export function recordVoiceTiming(stamps: VoiceStamps, mode: "live" | "push" = "push") {
  const m = { ...voiceDurations(stamps), at: Date.now() };
  history = [...history.slice(-19), m]; listeners.forEach(listener => listener());
  // Kept by the gateway too, so voice speed is measured across days, not just this window.
  if (m.firstAudioMs !== null && m.firstAudioMs >= 50) void api("/api/shua/voice", { body: { ms: m.firstAudioMs, mode } }).catch(() => {});
}
export const voiceTimingSnapshot = () => history;
export const subscribeVoiceTimings = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
