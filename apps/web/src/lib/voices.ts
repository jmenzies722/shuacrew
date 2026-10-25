/**
 * Spark's voice cast (Kokoro-82M, on this Mac): one list for every picker. It mirrors the gateway's speech manifest;
 * retired voices map to their closest successor, so a saved choice never breaks.
 */
export const VOICE_CAST = [
  { id: "michael", name: "Michael", accent: "American", about: "clear, calm and friendly" },
  { id: "heart", name: "Heart", accent: "American", about: "warm, the most natural" },
  { id: "puck", name: "Puck", accent: "American", about: "upbeat and lively" },
  { id: "bella", name: "Bella", accent: "American", about: "bright and expressive" },
  { id: "fenrir", name: "Fenrir", accent: "American", about: "deep and confident" },
  { id: "emma", name: "Emma", accent: "British", about: "crisp and warm" },
  { id: "george", name: "George", accent: "British", about: "measured" },
  { id: "daniel", name: "Daniel", accent: "British", about: "relaxed" },
] as const;
export const DEFAULT_VOICE = "michael";
const RETIRED: Record<string, string> = { aiden: "michael", ryan: "puck", serena: "heart", vivian: "bella", charles: "george", paul: "daniel" };
/** The Mac's own Premium/Enhanced voices (listed live by the gateway's /api/speech/status, e.g. "apple-zoe-premium"). */
export const isAppleVoice = (id: string) => /^apple-[a-z0-9-]{1,34}$/.test(id);
/** A saved voice id as it is today (retired ids become their successor; unknown ids fall back to the default). */
export function currentVoice(id: string | undefined): string {
  const v = id ? RETIRED[id] ?? id : DEFAULT_VOICE;
  return isAppleVoice(v) || VOICE_CAST.some((x) => x.id === v) ? v : DEFAULT_VOICE;
}
/** The voice Shua should switch to once: the first Apple Premium voice installed (the gateway lists them first). */
export function bestAppleVoice(voices: ReadonlyArray<{ id: string; engine?: string; quality?: string }>): string | undefined {
  return voices.find((v) => v.engine === "apple" && v.quality === "premium")?.id;
}
