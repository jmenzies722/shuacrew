import { useSyncExternalStore } from "react";
import { readSpeechStream } from "./speech-stream";
import { DEFAULT_VOICE, currentVoice } from "./voices";
import type { NarrationIdentity } from "./lesson-narration";

/** Spark's voice: on/off and which local voice, shared by the app's Settings and the desktop panel. */
export interface BuddyVoice { on: boolean; id: string; speed: number }
const KEY = "shuacrew.buddy.voice";
const DEFAULT: BuddyVoice = { on: true, id: DEFAULT_VOICE, speed: 1 };
const load = (): BuddyVoice => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<BuddyVoice>; return { on: typeof v.on === "boolean" ? v.on : DEFAULT.on, id: currentVoice(typeof v.id === "string" && /^[a-z0-9_-]{1,40}$/.test(v.id) ? v.id : undefined), speed: typeof v.speed === "number" && v.speed >= 0.8 && v.speed <= 1.3 ? v.speed : 1 }; } catch { return DEFAULT; } };
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

interface Line { key: number; text: string; voiceId: string; speed: number; narration?: NarrationIdentity; buffers: AudioBuffer[]; done: boolean; failed: boolean; started: boolean; heard?: boolean; shown?: boolean; dur: number }
/** A sentence for the captions. `durationMs` arrives once the whole sentence is generated, so words can keep time with the real audio. */
export interface CaptionLine { key: number; text: string; speed: number; durationMs?: number; narration?: NarrationIdentity }
let lineKeys = 0;

export class SpeechQueue {
  constructor(private audition = false) {}
  /** Suppress future utterances after “stop talking” without canceling the agent. */
  silenced = false;
  /** Held for a whole Live call: Shua does the talking, so Spark stays quiet even for turns it runs on Shua's behalf. */
  hush = false;
  private context?: AudioContext;
  private lines: Line[] = [];
  private active = 0;            // generations in flight
  private lead = LEAD;           // how far ahead we schedule; grows if generation ever falls behind
  /** Buffer before the first sound of a reply (seconds): bigger while the screen is being watched. */
  cushion = LEAD;
  private at = 0;                // where the next buffer goes on the timeline
  private sources = new Set<AudioBufferSourceNode>();
  private abort = new AbortController();
  private speaking = false;
  private idleTimer?: ReturnType<typeof setTimeout>;
  onSpeaking?: (speaking: boolean) => void;
  onError?: (message: string) => void;
  /** Every line asked to be spoken, and whether it was dropped as a repeat (self-tests log this to catch doubles). */
  onSay?: (text: string, repeat: boolean) => void;
  /** Each sentence the moment its sound starts (captions follow the voice, not the text stream); null when Spark stops. */
  onCaption?: (line: CaptionLine | null) => void;
  private captionOf(line: Line): CaptionLine { return { key: line.key, text: line.text, speed: line.speed, ...(line.narration ? { narration: line.narration } : {}), ...(line.done && !line.failed ? { durationMs: Math.round(line.dur * 1000) } : {}) }; }
  private captionTimers = new Set<ReturnType<typeof setTimeout>>();
  private quietTimers = new Set<ReturnType<typeof setTimeout>>();

  private master?: GainNode;
  /** Measures what Spark is actually playing (after ducking), so the mic can tell its echo from you. */
  private analyser?: AnalyserNode;
  private levelBuf?: Float32Array<ArrayBuffer>;
  private ctx() { this.context ??= new AudioContext({ latencyHint: "interactive" }); if (this.context.state === "suspended") void this.context.resume().catch(() => {}); return this.context; }
  private out() {
    const c = this.ctx();
    if (!this.master) { this.master = c.createGain(); this.master.connect(c.destination); this.analyser = c.createAnalyser(); this.analyser.fftSize = 1024; this.master.connect(this.analyser); }
    return this.master;
  }
  /** How loud Spark's voice is right now (RMS, 0–1); 0 when it's quiet or not talking. */
  level(): number {
    if (!this.speaking || !this.analyser) return 0;
    this.levelBuf ??= new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0; for (const v of this.levelBuf) sum += v * v;
    return Math.sqrt(sum / this.levelBuf.length);
  }
  /** Soft barge-in: drop to a murmur while we find out whether you're really talking; stop() if you are. */
  duck(on: boolean) { const g = this.out().gain, t = this.ctx().currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0.45 : 1, t, 0.08); }

  /** Speak a sentence — in Spark's voice, or `as` a crew member's own voice. */
  /** What Spark said lately (for telling its own echo from you). */
  private said: Array<{ text: string; at: number }> = [];
  private utterances = new Set<string>();
  beginTurn() { this.utterances.clear(); }
  recent(ms: number): string[] { const since = Date.now() - ms; return this.said.filter((x) => x.at >= since).map((x) => x.text); }
  say(text: string, as?: { voiceId?: string; speed?: number; narration?: NarrationIdentity }) {
    if (this.silenced || this.hush) return;
    const v = getBuddyVoice();
    if ((!v.on && !this.audition) || !text.trim()) return;
    const identity = as?.narration ? JSON.stringify(as.narration) : "";
    const utterance = `${as?.voiceId ?? v.id}:${identity}:${text.trim().toLowerCase().replace(/\s+/g, " ")}`;
    if (this.utterances.has(utterance)) { this.onSay?.(text, true); return; }
    this.onSay?.(text, false);
    this.utterances.add(utterance);
    this.said = [...this.said.filter((x) => x.at > Date.now() - 30_000), { text, at: Date.now() }];
    this.lines.push({ key: ++lineKeys, text, voiceId: as?.voiceId ?? v.id, speed: as?.speed ?? v.speed, narration: as?.narration, buffers: [], done: false, failed: false, started: false, dur: 0 });
    this.pump();
  }

  /** Keep up to AHEAD sentences generating, in order. */
  private pump() {
    for (const line of this.lines) {
      if (this.active >= AHEAD) break;
      if (line.started) continue;
      line.started = true; this.active++;
      const signal = this.abort.signal;
      void this.generate(line).finally(() => { if (signal === this.abort.signal && !signal.aborted) { this.active--; this.pump(); } });
    }
  }

  private async generate(line: Line, attempt = 0): Promise<void> {
    const signal = this.abort.signal, id = crypto.randomUUID(), context = this.ctx();
    try {
      const response = await fetch("/api/speech/synthesize", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify({ id, generation: 1, voiceId: line.voiceId, text: line.text, speed: line.speed }), signal });
      if (!response.ok || !response.body) throw new Error("speech unavailable");
      await readSpeechStream(response.body, { id, generation: 1 }, signal, async (data) => {
        const buffer = await context.decodeAudioData(data);
        if (signal.aborted) return;
        line.buffers.push(buffer);
        this.schedule();
      });
    } catch {
      // A hiccup in the voice engine: try the sentence once more (if none of it has played) rather than skip it —
      // a skipped sentence sounds like Spark cutting out.
      if (attempt === 0 && !signal.aborted && !line.heard && !line.buffers.length) return this.generate(line, 1);
      if (signal.aborted) return;
      line.failed = true;
      this.onError?.("Voice playback was interrupted. The full answer is in chat; you can ask me to repeat it.");
    }
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
        if (!this.speaking) { this.at = now + this.cushion; this.lead = this.cushion; this.setSpeaking(true); }
        // Fell behind (the voice model was busy): start again further ahead, and stay further ahead for the rest of this
        // answer, so one slow moment doesn't become a stutter every sentence.
        else if (this.at < now) { this.lead = Math.min(0.9, this.lead + 0.3); this.at = now + this.lead; }
        const source = context.createBufferSource();
        source.buffer = buffer; source.connect(this.out()); // the engine already spoke at the chosen speed
        source.onended = () => { this.sources.delete(source); source.disconnect(); this.maybeIdle(); };
        source.start(this.at); this.sources.add(source);
        // The caption goes up the moment its sound starts; read at that time, so it carries the length if it's known by then.
        if (!line.heard) { line.heard = true; const t = setTimeout(() => { this.captionTimers.delete(t); line.shown = true; this.onCaption?.(this.captionOf(line)); }, Math.max(0, (this.at - now) * 1000)); this.captionTimers.add(t); }
        this.at += buffer.duration; line.dur += buffer.duration;
      }
      if (!line.done) return;       // wait for more of this sentence before moving on
      if (line.shown && !line.failed) this.onCaption?.(this.captionOf(line)); // already on screen: now with its real length
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
  private setSpeaking(on: boolean) { if (this.speaking !== on) { this.speaking = on; this.onSpeaking?.(on); if (!on) this.onCaption?.(null); } }

  stop() {
    this.abort.abort(); this.abort = new AbortController();
    this.active = 0;
    this.lines = []; clearTimeout(this.idleTimer);
    for (const t of this.captionTimers) clearTimeout(t); this.captionTimers.clear();
    for (const timer of this.quietTimers) clearTimeout(timer); this.quietTimers.clear();
    // A quick fade (60 ms), not a hard cut mid-sound: stopping sounds deliberate, never like a glitch.
    const playing = [...this.sources]; this.sources.clear(); this.setSpeaking(false);
    const c = this.context, g = this.master?.gain;
    if (c && g && playing.length) {
      const t = c.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.06);
      setTimeout(() => { for (const s of playing) { try { s.stop(); } catch { /* already ended */ } s.disconnect(); } if (this.master) { this.master.gain.cancelScheduledValues(0); this.master.gain.value = 1; } }, 70);
    } else if (this.master) this.master.gain.value = 1; // the next reply starts at full voice
  }
  /** Still talking, or has more queued to say. */
  get busy() { return this.speaking || this.lines.length > 0; }
  /** Run `then` once Spark has finished what it's saying (so a follow-up turn never cuts its own sentence off). */
  whenQuiet(then: () => void, maxMs = 30_000) {
    const until = Date.now() + maxMs, signal = this.abort.signal;
    const check = () => {
      if (signal.aborted) return;
      if (!this.busy) then();
      else if (Date.now() < until) {
        const timer = setTimeout(() => { this.quietTimers.delete(timer); check(); }, 150);
        this.quietTimers.add(timer);
      }
    };
    check();
  }
  /** Browsers only let a page start audio after a click or key; call this from one. */
  unlock() { this.ctx(); }
  dispose() {
    this.silenced = true;
    this.abort.abort();
    this.lines = [];
    clearTimeout(this.idleTimer);
    for (const timer of this.captionTimers) clearTimeout(timer);
    this.captionTimers.clear();
    for (const timer of this.quietTimers) clearTimeout(timer);
    this.quietTimers.clear();
    for (const source of this.sources) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
    this.sources.clear();
    this.onCaption = undefined; this.onSpeaking = undefined; this.onError = undefined;
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
  }
}
