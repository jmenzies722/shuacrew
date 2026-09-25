import { useSyncExternalStore } from "react";
import { VoicePlayback } from "./voice-playback";

/** Spark's voice: on/off and which local voice, shared by the app's Settings and the desktop panel. */
export interface BuddyVoice { on: boolean; id: string; speed: number }
const KEY = "shuacrew.buddy.voice";
const DEFAULT: BuddyVoice = { on: true, id: "aiden", speed: 1 };
const load = (): BuddyVoice => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<BuddyVoice>; return { on: typeof v.on === "boolean" ? v.on : DEFAULT.on, id: typeof v.id === "string" && /^[a-z0-9_-]{1,40}$/.test(v.id) ? v.id : DEFAULT.id, speed: typeof v.speed === "number" && v.speed >= 0.8 && v.speed <= 1.3 ? v.speed : 1 }; } catch { return DEFAULT; } };
let current = load();
const listeners = new Set<() => void>();
export function saveBuddyVoice(patch: Partial<BuddyVoice>) { current = { ...current, ...patch }; try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ } listeners.forEach((l) => l()); }
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) { current = load(); listeners.forEach((l) => l()); } });
export function useBuddyVoice() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => current); }
export function getBuddyVoice() { return current; }

/** Sentences are spoken in order, each as soon as it arrives; stop() silences everything at once. */
export class SpeechQueue {
  private playback = new VoicePlayback();
  private queue: string[] = [];
  private playing = false;
  private abort = new AbortController();
  onSpeaking?: (speaking: boolean) => void;
  say(text: string) {
    const v = getBuddyVoice();
    if (!v.on || !text) return;
    this.queue.push(text);
    if (!this.playing) void this.run();
  }
  private async run() {
    this.playing = true; this.onSpeaking?.(true);
    const signal = this.abort.signal;
    while (this.queue.length && !signal.aborted) {
      const text = this.queue.shift()!, v = getBuddyVoice();
      try { await this.playback.speak(text, v.id, v.speed, signal, () => {}); } catch { if (signal.aborted) break; }
    }
    this.playing = false; this.onSpeaking?.(false);
  }
  stop() { this.queue = []; this.abort.abort(); this.abort = new AbortController(); }
  /** Browsers only let a page start audio after a click or key; call this from one. */
  unlock() { void this.playback.prepare().catch(() => {}); }
}
