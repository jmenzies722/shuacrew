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
/** A saved voice id as it is today (retired ids become their successor; unknown ids fall back to the default). */
export function currentVoice(id: string | undefined): string {
  const v = id ? RETIRED[id] ?? id : DEFAULT_VOICE;
  return VOICE_CAST.some((x) => x.id === v) ? v : DEFAULT_VOICE;
}
