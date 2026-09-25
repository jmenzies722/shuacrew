/**
 * Hands-free conversation: the mic stays open, Spark hears when you start and stop talking, transcribes each
 * turn on this Mac (whisper, via the gateway), and you can talk over it to interrupt. No buttons.
 */

export interface VadState { noise: number; speaking: boolean; voiced: number; quiet: number; spoke: number }
export interface VadOptions { startMs: number; endMs: number; minSpeechMs: number; ratio: number; floor: number }
export const VAD: VadOptions = { startMs: 140, endMs: 900, minSpeechMs: 350, ratio: 3.2, floor: 0.012 };
export const vadStart = (): VadState => ({ noise: 0.008, speaking: false, voiced: 0, quiet: 0, spoke: 0 });

/**
 * One analysis frame: `rms` (0–1) over `dt` ms. Learns the room's noise floor while you're quiet, starts a turn
 * after `startMs` above it, ends it after `endMs` of quiet. `strict` (while Spark talks) needs a louder voice,
 * so its own speech leaking past echo cancellation doesn't count as you.
 */
export function vadStep(s: VadState, rms: number, dt: number, o: VadOptions = VAD, strict = false): { state: VadState; event?: "start" | "end" | "discard" } {
  const threshold = Math.max(o.floor, s.noise * o.ratio) * (strict ? 2.4 : 1);
  const loud = rms > threshold;
  if (!s.speaking) {
    const noise = loud ? s.noise : s.noise * 0.97 + rms * 0.03;
    const voiced = loud ? s.voiced + dt : 0;
    if (voiced >= o.startMs) return { state: { noise, speaking: true, voiced, quiet: 0, spoke: voiced }, event: "start" };
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

export type Phase = "off" | "starting" | "listening" | "hearing" | "transcribing" | "error";

export class HandsFree {
  private stream?: MediaStream;
  private ctx?: AudioContext;
  private rec?: MediaRecorder;
  private chunks: Blob[] = [];
  private raf = 0;
  private state = vadStart();
  private last = 0;
  private paused = false;
  /** Spark is talking: listen harder (echo), and a real interruption stops it. */
  speaking = false;
  onPhase?: (p: Phase, detail?: string) => void;
  onLevel?: (level: number) => void;
  onTurn?: (text: string) => void;
  onBargeIn?: () => void;

  get active() { return !!this.stream; }

  async start() {
    if (this.stream) return;
    this.onPhase?.("starting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) { this.onPhase?.("error", (e as Error).message.includes("denied") || (e as Error).name === "NotAllowedError" ? "Microphone access is off for ShuaCrew." : "Couldn't open the microphone."); return; }
    this.ctx = new AudioContext();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    this.ctx.createMediaStreamSource(this.stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    this.state = vadStart(); this.last = performance.now();
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0; for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length), now = performance.now(), dt = now - this.last; this.last = now;
      this.onLevel?.(Math.min(1, rms * 12));
      if (!this.paused) {
        const r = vadStep(this.state, rms, dt, VAD, this.speaking);
        this.state = r.state;
        if (r.event === "start") this.begin();
        else if (r.event === "end") this.finish(true);
        else if (r.event === "discard") this.finish(false);
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
    this.onPhase?.("listening");
  }

  private begin() {
    if (!this.stream) return;
    if (this.speaking) this.onBargeIn?.();
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start();
    this.onPhase?.("hearing");
  }

  private finish(keep: boolean) {
    const rec = this.rec; this.rec = undefined;
    if (!rec || rec.state === "inactive") { this.onPhase?.("listening"); return; }
    rec.onstop = async () => {
      if (!keep || !this.chunks.length) { this.onPhase?.("listening"); return; }
      this.paused = true; this.onPhase?.("transcribing");
      try {
        const blob = new Blob(this.chunks, { type: rec.mimeType || "audio/webm" });
        const r = await fetch(`/api/transcribe?voice=1&name=turn.${rec.mimeType.includes("mp4") ? "m4a" : "webm"}`, { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/octet-stream" }, body: blob });
        const { text = "", error } = await r.json() as { text?: string; error?: string };
        if (error) this.onPhase?.("error", error);
        else if (meaningful(text)) this.onTurn?.(text.trim());
      } catch { this.onPhase?.("error", "Couldn't transcribe that. Still listening."); }
      finally { this.paused = false; if (this.stream) this.onPhase?.("listening"); }
    };
    rec.stop();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    if (this.rec && this.rec.state !== "inactive") { this.rec.onstop = null; this.rec.stop(); }
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.stream = undefined; this.ctx = undefined; this.rec = undefined;
    this.onPhase?.("off");
  }
}
