export interface VoicePreferences {
  mode: "push-to-talk" | "conversation";
  automaticInterruption: boolean;
  endpoint: "quick" | "balanced" | "patient";
  warmMinutes: 2 | 5 | 10;
  verbosity: "short" | "balanced" | "detailed";
}
export function normalizeVoicePreferences(value: unknown): VoicePreferences {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { mode: raw.mode === "conversation" ? "conversation" : "push-to-talk", automaticInterruption: raw.automaticInterruption === true,
    endpoint: raw.endpoint === "quick" || raw.endpoint === "patient" ? raw.endpoint : "balanced",
    warmMinutes: raw.warmMinutes === 2 || raw.warmMinutes === 10 ? raw.warmMinutes : 5,
    verbosity: raw.verbosity === "short" || raw.verbosity === "detailed" ? raw.verbosity : "balanced" };
}
export function loadVoicePreferences(): VoicePreferences {
  try { return normalizeVoicePreferences(JSON.parse(localStorage.getItem("shuacrew.voiceConversation") ?? "null")); } catch { return normalizeVoicePreferences(null); }
}
export function saveVoicePreferences(preferences: VoicePreferences): boolean {
  try { localStorage.setItem("shuacrew.voiceConversation", JSON.stringify({ ...normalizeVoicePreferences(preferences), version: 1 })); return true; } catch { return false; }
}
