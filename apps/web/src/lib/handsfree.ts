/**
 * Hands-free conversation: the mic stays open, Spark hears when you start and stop talking, transcribes each
 * turn on this Mac (whisper, via the gateway), and you can talk over it to interrupt. No buttons.
 */

export interface VadState { noise: number; speaking: boolean; voiced: number; quiet: number; spoke: number }
export interface VadOptions { startMs: number; endMs: number; minSpeechMs: number; ratio: number; floor: number }
export const VAD: VadOptions = { startMs: 140, endMs: 1100, minSpeechMs: 350, ratio: 3.2, floor: 0.012 }; // 1.1 s of quiet ends a turn: natural pauses don't cut you off
export const vadStart = (): VadState => ({ noise: 0.008, speaking: false, voiced: 0, quiet: 0, spoke: 0 });

/**
 * One analysis frame: `rms` (0–1) over `dt` ms. Learns the room's noise floor while you're quiet, starts a turn
 * after `startMs` above it, ends it after `endMs` of quiet. `strict` (while Spark talks) needs a louder voice,
 * so its own speech leaking past echo cancellation doesn't count as you.
 */
export function vadStep(s: VadState, rms: number, dt: number, o: VadOptions = VAD, strict = false): { state: VadState; event?: "start" | "end" | "discard" } {
  // While Spark talks, its own voice leaks back through the speakers: only a clearly louder, sustained voice (half a
  // second) counts as you interrupting — so echo never makes Spark cut in and out.
  const threshold = Math.max(o.floor, s.noise * o.ratio) * (strict ? 3.2 : 1);
  const loud = rms > threshold;
  if (!s.speaking) {
    const noise = loud || strict ? s.noise : s.noise * 0.97 + rms * 0.03; // don't learn Spark's voice as "room noise"
    const voiced = loud ? s.voiced + dt : 0;
    if (voiced >= (strict ? Math.max(o.startMs, 500) : o.startMs)) return { state: { noise, speaking: true, voiced, quiet: 0, spoke: voiced }, event: "start" };
    return { state: { ...s, noise, voiced } };
  }
  const quiet = loud ? 0 : s.quiet + dt, spoke = s.spoke + dt;
  if (quiet >= o.endMs) {
    const next = { noise: s.noise, speaking: false, voiced: 0, quiet: 0, spoke: 0 };
    return { state: next, event: spoke - quiet >= o.minSpeechMs ? "end" : "discard" };
  }
  return { state: { ...s, quiet, spoke } };
}

/** Whisper invents words from silence and breath; these aren't turns. */
export function meaningful(text: string) {
  const t = text.trim().replace(/[.!?,…\s]+$/g, "").toLowerCase();
  if (t.length < 2) return false;
  return !/^(you|thank you|thanks|thanks for watching|bye|okay|ok|um+|uh+|hmm+|\[.*\]|\(.*\))$/.test(t);
}

/** 16 kHz mono 16-bit WAV from float samples at `rate`: what Whisper is trained on, and small to upload. */
export function toWav(chunks: Float32Array[], rate: number, target = 16000): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0), ratio = rate / target, out = new Int16Array(Math.floor(total / ratio));
  let i = 0, carry = 0, acc = 0, count = 0;
  for (const c of chunks) for (const v of c) {
    acc += v; count++; carry++;
    if (carry >= ratio) { const x = Math.max(-1, Math.min(1, acc / count)); if (i < out.length) out[i++] = x < 0 ? x * 0x8000 : x * 0x7fff; carry -= ratio; acc = 0; count = 0; }
  }
  const buf = new ArrayBuffer(44 + i * 2), d = new DataView(buf);
  const w = (o: number, t: string) => { for (let k = 0; k < t.length; k++) d.setUint8(o + k, t.charCodeAt(k)); };
  w(0, "RIFF"); d.setUint32(4, 36 + i * 2, true); w(8, "WAVE"); w(12, "fmt "); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, target, true); d.setUint32(28, target * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, "data"); d.setUint32(40, i * 2, true);
  new Int16Array(buf, 44, i).set(out.subarray(0, i));
  return new Blob([buf], { type: "audio/wav" });
}

export type Phase = "off" | "starting" | "listening" | "hearing" | "transcribing" | "error";

export class HandsFree {
  private stream?: MediaStream;
  private ctx?: AudioContext;
  private node?: ScriptProcessorNode;
  private state = vadStart();
  private paused = false;
  /** The last ~0.4 s before speech starts, so the first word is never clipped. */
  private preroll: Float32Array[] = [];
  private turn: Float32Array[] | null = null;
  /** Live captions: one quick transcription of the words so far at a time; results for an old turn are dropped. */
  private turnId = 0;
  private captionBusy = false;
  private captionAt = 0;
  /** Spark is talking: listen harder (echo), and a real interruption stops it. */
  speaking = false;
  /** "auto": open mic, turns start and end on your voice. "hold": push-to-talk — a turn is exactly while you hold. */
  mode: "auto" | "hold" = "auto";
  /** "en", or "auto" for any language (the quick caption model only knows English, so captions pause then). */
  lang: "en" | "auto" = "en";
  private holding = false;
  onPhase?: (p: Phase, detail?: string) => void;
  onLevel?: (level: number) => void;
  onTurn?: (text: string) => void;
  /** Your words so far, while you're still talking ("" when a turn starts or ends). */
  onPartial?: (text: string) => void;
  onBargeIn?: () => void;
  /** What sounded like a start wasn't words (a cough, the speakers, noise): whatever reacted to it can carry on. */
  onDropped?: () => void;

  get active() { return !!this.stream; }

  async start() {
    if (this.stream) return;
    this.onPhase?.("starting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) { this.stream = undefined; this.onPhase?.("error", (e as Error).name === "NotAllowedError" ? "Microphone access is off for ShuaCrew." : "Couldn't open the microphone."); return; }
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(2048, 1, 1);
    const frameMs = (2048 / this.ctx.sampleRate) * 1000, keep = Math.ceil(400 / frameMs);
    this.state = vadStart(); this.preroll = []; this.turn = null;
    this.node.onaudioprocess = (e) => {
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      let sum = 0; for (const v of data) sum += v * v;
      const rms = Math.sqrt(sum / data.length);
      this.onLevel?.(Math.min(1, rms * 12));
      if (this.paused) return;
      if (this.turn) this.turn.push(data); else { this.preroll.push(data); if (this.preroll.length > keep) this.preroll.shift(); }
      if (this.mode === "hold") { if (this.turn && !this.captionBusy && performance.now() - this.captionAt > 700) void this.caption(); return; }
      const r = vadStep(this.state, rms, frameMs, VAD, this.speaking);
      this.state = r.state;
      if (r.event === "start") { if (this.speaking) this.onBargeIn?.(); this.turn = [...this.preroll]; this.preroll = []; this.turnId++; this.captionAt = performance.now(); this.onPartial?.(""); this.onPhase?.("hearing"); }
      else if (this.turn && !this.captionBusy && performance.now() - this.captionAt > 700) void this.caption();
      else if (r.event === "end") void this.finish(true);
      else if (r.event === "discard") void this.finish(false);
    };
    source.connect(this.node);
    this.node.connect(this.ctx.destination); // required for onaudioprocess to run; the node outputs silence
    this.onPhase?.("listening");
  }

  /** Push-to-talk: start a turn now (keeping the last moment before you pressed, so the first word isn't clipped). */
  hold() {
    if (!this.stream || this.holding || this.paused) return;
    this.holding = true;
    if (this.speaking) this.onBargeIn?.();
    this.turn = [...this.preroll]; this.preroll = []; this.turnId++; this.captionAt = performance.now();
    this.onPartial?.(""); this.onPhase?.("hearing");
  }
  /** Push-to-talk: you let go — send what you said (a tap under ~0.3 s is ignored). */
  release() {
    if (!this.holding) return;
    this.holding = false;
    const frames = this.turn?.length ?? 0, seconds = this.ctx ? (frames * 2048) / this.ctx.sampleRate : 0;
    void this.finish(seconds > 0.3 + 0.4);
  }

  /** The words so far, quickly (the fast model); the accurate transcript still comes when you stop. */
  private async caption() {
    if (!this.turn || !this.ctx || this.lang !== "en") return;
    const id = this.turnId, audio = this.turn.slice(-Math.ceil((20 * this.ctx.sampleRate) / 2048)); // the last 20 s is plenty
    this.captionBusy = true; this.captionAt = performance.now();
    try {
      const r = await fetch("/api/transcribe?voice=1&fast=1&name=live.wav", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/octet-stream" }, body: toWav(audio, this.ctx.sampleRate) });
      const { text = "" } = await r.json() as { text?: string };
      if (id === this.turnId && this.turn && meaningful(text)) this.onPartial?.(text.trim());
    } catch { /* a missed caption is fine; the final transcript is what counts */ }
    finally { this.captionBusy = false; }
  }

  private async finish(keep: boolean) {
    const turn = this.turn; this.turn = null; this.turnId++;
    if (!keep || !turn?.length || !this.ctx) { this.onDropped?.(); this.onPhase?.("listening"); return; }
    this.paused = true; this.onPhase?.("transcribing");
    try {
      const r = await fetch(`/api/transcribe?voice=1&name=turn.wav&lang=${this.lang}`, { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/octet-stream" }, body: toWav(turn, this.ctx.sampleRate) });
      const { text = "", error } = await r.json() as { text?: string; error?: string };
      if (error) this.onPhase?.("error", error);
      else if (meaningful(text)) this.onTurn?.(text.trim());
      else this.onDropped?.();
      this.onPartial?.("");
    } catch { this.onPhase?.("error", "Couldn't transcribe that. Still listening."); }
    finally { this.paused = false; if (this.stream) this.onPhase?.("listening"); }
  }

  stop() {
    if (this.node) { this.node.onaudioprocess = null; this.node.disconnect(); }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.stream = undefined; this.ctx = undefined; this.node = undefined; this.turn = null; this.preroll = [];
    this.onPhase?.("off");
  }
}
