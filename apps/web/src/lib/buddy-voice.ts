import { useSyncExternalStore } from "react";
import { readSpeechStream } from "./speech-stream";

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

/**
 * Spark's voice, gapless. Every sentence starts generating the moment it arrives (up to AHEAD at once), so the next
 * one is ready before the current one ends, and all audio plays on ONE timeline with a small lead-in buffer — no
 * silence between sentences and no stutter when a chunk arrives a beat late. stop() silences everything at once
 * (barge-in).
 */
const AHEAD = 2;          // sentences generating in parallel (more lets the engine finish them out of order)
const LEAD = 0.18;        // seconds of buffer before the first sound; absorbs network/generation jitter
const REBUFFER = 0.08;    // if we ever fall behind, restart this far ahead instead of clipping

interface Line { text: string; voiceId: string; speed: number; buffers: AudioBuffer[]; done: boolean; failed: boolean; started: boolean }

export class SpeechQueue {
  private context?: AudioContext;
  private lines: Line[] = [];
  private active = 0;            // generations in flight
  private at = 0;                // where the next buffer goes on the timeline
  private sources = new Set<AudioBufferSourceNode>();
  private abort = new AbortController();
  private speaking = false;
  private idleTimer?: ReturnType<typeof setTimeout>;
  onSpeaking?: (speaking: boolean) => void;

  private master?: GainNode;
  private ctx() { this.context ??= new AudioContext({ latencyHint: "interactive" }); if (this.context.state === "suspended") void this.context.resume().catch(() => {}); return this.context; }
  private out() { const c = this.ctx(); if (!this.master) { this.master = c.createGain(); this.master.connect(c.destination); } return this.master; }
  /** Soft barge-in: drop to a murmur while we find out whether you're really talking; stop() if you are. */
  duck(on: boolean) { const g = this.out().gain, t = this.ctx().currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0.45 : 1, t, 0.08); }

  /** Speak a sentence — in Spark's voice, or `as` a crew member's own voice. */
  say(text: string, as?: { voiceId: string; speed: number }) {
    const v = getBuddyVoice();
    if (!v.on || !text.trim()) return;
    this.lines.push({ text, voiceId: as?.voiceId ?? v.id, speed: as?.speed ?? v.speed, buffers: [], done: false, failed: false, started: false });
    this.pump();
  }

  /** Keep up to AHEAD sentences generating, in order. */
  private pump() {
    for (const line of this.lines) {
      if (this.active >= AHEAD) break;
      if (line.started) continue;
      line.started = true; this.active++;
      void this.generate(line).finally(() => { this.active--; this.pump(); });
    }
  }

  private async generate(line: Line) {
    const signal = this.abort.signal, id = crypto.randomUUID(), context = this.ctx();
    try {
      const response = await fetch("/api/speech/synthesize", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify({ id, generation: 1, voiceId: line.voiceId, text: line.text, speed: line.speed }), signal });
      if (!response.ok || !response.body) throw new Error("speech unavailable");
      await readSpeechStream(response.body, { id, generation: 1 }, signal, async (data) => {
        line.buffers.push(await context.decodeAudioData(data));
        this.schedule();
      });
    } catch { line.failed = true; }
    line.done = true;
    this.schedule();
  }

  /** Put every ready buffer on the timeline, strictly in sentence order. */
  private schedule() {
    if (this.abort.signal.aborted) return;
    const context = this.ctx();
    while (this.lines.length) {
      const line = this.lines[0]!;
      while (line.buffers.length) {
        const buffer = line.buffers.shift()!;
        const now = context.currentTime;
        if (!this.speaking) { this.at = now + LEAD; this.setSpeaking(true); }
        else if (this.at < now) this.at = now + REBUFFER;
        const source = context.createBufferSource();
        source.buffer = buffer; source.connect(this.out()); // the engine already spoke at the chosen speed
        source.onended = () => { this.sources.delete(source); source.disconnect(); this.maybeIdle(); };
        source.start(this.at); this.sources.add(source);
        this.at += buffer.duration;
      }
      if (!line.done) return;       // wait for more of this sentence before moving on
      this.lines.shift();           // finished (or failed): the next sentence may already be waiting
    }
    this.maybeIdle();
  }

  private maybeIdle() {
    clearTimeout(this.idleTimer);
    if (this.sources.size || this.lines.length) return;
    // A short grace period so a sentence arriving right after the last one doesn't flicker "speaking" off and on.
    this.idleTimer = setTimeout(() => { if (!this.sources.size && !this.lines.length) this.setSpeaking(false); }, 250);
  }
  private setSpeaking(on: boolean) { if (this.speaking !== on) { this.speaking = on; this.onSpeaking?.(on); } }

  stop() {
    this.abort.abort(); this.abort = new AbortController();
    this.lines = []; clearTimeout(this.idleTimer);
    for (const s of this.sources) { try { s.stop(); } catch { /* already ended */ } s.disconnect(); }
    this.sources.clear(); this.setSpeaking(false);
    if (this.master) this.master.gain.value = 1; // the next reply starts at full voice
  }
  /** Browsers only let a page start audio after a click or key; call this from one. */
  unlock() { this.ctx(); }
}
