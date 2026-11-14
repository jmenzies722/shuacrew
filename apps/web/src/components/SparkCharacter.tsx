import type { CompanionPreferences } from "../lib/companion";
import { ShuaMark, type MarkTone } from "./Mark";

export type Mood = "idle" | "thinking" | "speaking" | "happy" | "concerned" | "sleepy";
const TONE: Record<Mood, MarkTone> = { idle: "idle", thinking: "live", speaking: "live", happy: "idle", concerned: "wait", sleepy: "idle" };

/**
 * Shua's avatar. It used to be a character you dressed up; it is now the mark (components/Mark.tsx), whose dot shows
 * the mood: breathing blue while thinking or speaking, amber when something is wrong. The props are unchanged so every
 * place that drew a character draws the mark instead; `preferences` and `crop` no longer affect it.
 */
export function SparkCharacter({ mood = "idle", size = 24 }: { preferences?: CompanionPreferences; mood?: Mood; size?: number; crop?: "full" | "portrait" }) {
  return <ShuaMark size={size} tone={TONE[mood]} tile />;
}
