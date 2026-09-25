import { useSyncExternalStore } from "react";
export interface CompanionPreferences {
  version: 1; enabled: boolean; kind: "spark" | "crew"; nickname: string;
  face: "calm" | "curious" | "bright"; accessory: "none" | "cap" | "headphones" | "scarf" | "glasses" | "antenna" | "badge";
  presence: "interaction" | "subtle" | "playful"; placement: "corner" | "room-header";
  celebration: "off" | "subtle" | "expressive"; sound: boolean; volume: number; focus: "hide" | "still";
}
export function parseCompanion(value: unknown): CompanionPreferences {
  const v = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const choice = <T extends string>(key: string, options: readonly T[], fallback: T): T => options.includes(v[key] as T) ? v[key] as T : fallback;
  return { version: 1, enabled: v.enabled === true, kind: choice("kind", ["spark", "crew"], "spark"), nickname: typeof v.nickname === "string" ? [...v.nickname.trim()].slice(0, 40).join("") || "Spark" : "Spark",
    face: choice("face", ["calm", "curious", "bright"], "calm"), accessory: choice("accessory", ["none", "cap", "headphones", "scarf", "glasses", "antenna", "badge"], "none"),
    presence: choice("presence", ["interaction", "subtle", "playful"], "subtle"), placement: choice("placement", ["corner", "room-header"], "corner"), celebration: choice("celebration", ["off", "subtle", "expressive"], "subtle"),
    sound: v.sound === true, volume: typeof v.volume === "number" && Number.isFinite(v.volume) && v.volume >= 0 && v.volume <= 1 ? v.volume : 0.25, focus: choice("focus", ["hide", "still"], "still") };
}
export type CompanionPose = "offline" | "review" | "failed" | "working" | "idle";
export function companionPose(input: { connected: boolean; needsApproval: boolean; failed: boolean; active: boolean }): CompanionPose {
  return !input.connected ? "offline" : input.needsApproval ? "review" : input.failed ? "failed" : input.active ? "working" : "idle";
}
export function celebrateCompletion(state: { seen: string[]; watermark: number; lastCelebratedAt: number }, event: { id: string; seq: number }, now: number, pose: CompanionPose) {
  const fresh = event.seq > state.watermark && !state.seen.includes(event.id);
  const celebrate = fresh && pose === "idle" && now - state.lastCelebratedAt >= 10000;
  return { celebrate, state: { seen: [...state.seen.filter(id => id !== event.id), event.id].slice(-200), watermark: Math.max(state.watermark, event.seq), lastCelebratedAt: celebrate ? now : state.lastCelebratedAt } };
}
function load() { try { return parseCompanion(JSON.parse(localStorage.getItem("shuacrew.companion") ?? "null")); } catch { return parseCompanion(null); } }
let preferences = load(); const listeners = new Set<() => void>();
export function saveCompanion(next: CompanionPreferences): boolean {
  preferences = parseCompanion(next); let saved = true;
  try { localStorage.setItem("shuacrew.companion", JSON.stringify(preferences)); } catch { saved = false; }
  listeners.forEach(listener => listener()); return saved;
}
export function useCompanion() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => preferences, () => preferences); }
