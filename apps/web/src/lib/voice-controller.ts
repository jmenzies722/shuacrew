import { spokenText, SpeechSegmenter } from "./voice-text";
import { initialVoiceState, reduceVoice, type VoiceEvent } from "./voice-session-state";
import { recordVoiceTiming, type VoiceStamps } from "./voice-timing";
export type VoicePhase = "idle" | "starting" | "listening" | "transcribing" | "submitting" | "thinking" | "generating" | "speaking" | "approval" | "interrupting" | "muted" | "error";
export interface VoiceAdapters {
  continuousCapture?: boolean;
  interruptWhileSpeaking?: boolean;
  prepare?(signal: AbortSignal, reconnect: boolean): Promise<void>;
  identity?(): { memberId: string; runtime: string };
  capture(signal: AbortSignal, utterance: (blob: Blob) => void, error: (message: string) => void): Promise<() => void>;
  transcribe(blob: Blob, signal: AbortSignal): Promise<string>;
  submit(text: string, requestId: string, runId: string | undefined, signal: AbortSignal, identity?: { memberId: string; runtime: string }): Promise<{ runId: string; after?: number }>;
  speak(text: string, signal: AbortSignal, started: () => void, received?: () => void): Promise<void>;
  cancel(runId: string): Promise<void>;
}
export class VoiceController {
  private state: { phase: VoicePhase; runId?: string; after: number; transcript: string; answer: string; error?: string; pending: boolean; retrySpeech: boolean; pendingTranscript: string; audio: ReturnType<typeof initialVoiceState> } = { phase: "idle", after: 0, transcript: "", answer: "", pending: false, retrySpeech: false, pendingTranscript: "", audio: initialVoiceState() };
  private listeners = new Set<() => void>();
  private generation = new AbortController();
  private captureGeneration = new AbortController();
  private cancellation?: Promise<boolean>;
  private cancellationUncertain = false;
  private recoveringCancellation = false;
  private release?: () => void;
  private completed = 0;
  private muted = false;
  private pending?: { text: string; id: string; runId?: string; identity?: { memberId: string; runtime: string } };
  private awaitingReply = false;
  private blocked = false;
  private streams = new Map<number, { text: string; segmenter: SpeechSegmenter }>();
  private speechQueue: string[] = [];
  private speechTask?: Promise<void>;
  private speechCharacters = 0;
  private stamps: VoiceStamps = {};
  constructor(private adapters: VoiceAdapters, runId?: string) { this.state.runId = runId; }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(change: Partial<typeof this.state>) { this.state = { ...this.state, ...change }; this.listeners.forEach(f => f()); }
  private audio(event: VoiceEvent) { this.set({ audio: reduceVoice(this.state.audio, event) }); }
  private invalidate(keepCapture = false) {
    this.generation.abort(); this.generation = new AbortController();
    if (!keepCapture) { this.captureGeneration.abort(); this.captureGeneration = new AbortController(); this.release?.(); this.release = undefined; }
    this.streams.clear(); this.speechQueue = []; this.speechTask = undefined; this.speechCharacters = 0;
  }
  async start() {
    if (this.cancellationUncertain || this.cancellation) { this.set({ phase: "error", error: "Confirm the previous work stopped before sending another instruction." }); return; }
    if (this.blocked) { this.set({ phase: "approval" }); return; }
    if (!["idle", "muted", "error"].includes(this.state.phase)) return;
    if (this.pending) { this.set({ phase: "error", error: "Submission is uncertain. Recover the original request before starting another." }); return; }
    this.muted = false; this.invalidate();
    const signal = this.generation.signal;
    this.set({ phase: "starting", error: undefined });
    try {
      await this.adapters.prepare?.(signal, this.awaitingReply);
      if (signal.aborted) return;
      if (this.awaitingReply) { if (this.adapters.continuousCapture) await this.listen(); if (!signal.aborted) this.set({ phase: "thinking" }); return; }
      await this.listen();
    } catch (error) { if (!signal.aborted) this.fail(error instanceof Error ? error.message : "Voice setup failed."); }
  }
  async recoverSubmission() { if (!this.pending || this.blocked || !["idle", "muted", "error"].includes(this.state.phase)) return; this.invalidate(); await this.submitPending(); }
  private async listen() {
    if (this.release && this.adapters.continuousCapture) { this.set({ phase: "listening" }); return; }
    const signal = this.generation.signal;
    this.set({ phase: "starting", error: undefined });
    try {
      const captureSignal = this.captureGeneration.signal;
      const release = await this.adapters.capture(captureSignal, blob => { if (!captureSignal.aborted) void this.accept(blob); }, message => { if (!captureSignal.aborted) this.fail(message); });
      if (signal.aborted) { release(); return; }
      this.release = release; this.audio({ type: "start" }); this.set({ phase: "listening" });
    } catch (error) { if (!signal.aborted) this.fail(error instanceof Error ? error.message : "Microphone unavailable."); }
  }
  private async accept(blob: Blob) {
    if (this.muted) return;
    if (this.adapters.continuousCapture && this.adapters.interruptWhileSpeaking === false && ["thinking", "generating", "speaking"].includes(this.state.phase)) return;
    if (this.adapters.continuousCapture && ["thinking", "generating", "speaking"].includes(this.state.phase)) void this.userSpeech();
    if (this.state.phase !== "listening" && !(this.adapters.continuousCapture && (this.state.phase === "interrupting" || this.cancellationUncertain))) return;
    const cancellation = this.cancellation;
    const signal = this.generation.signal;
    this.stamps = { endpoint: performance.now() };
    this.set({ phase: "transcribing", answer: "" });
    this.streams.clear(); this.speechQueue = []; this.speechCharacters = 0;
    if (!this.adapters.continuousCapture) { this.release?.(); this.release = undefined; }
    try {
      const text = (await this.adapters.transcribe(blob, signal)).trim();
      if (signal.aborted) return;
      if (!text) { this.muted = true; this.invalidate(); this.audio({ type: "mute" }); this.set({ phase: "muted", error: "No speech detected. Try again." }); return; }
      this.stamps.transcribed = performance.now();
      this.set({ transcript: text });
      if (cancellation) await cancellation;
      if (signal.aborted) return;
      if (this.cancellationUncertain) {
        this.set({ pendingTranscript: text.slice(0, 8_000), phase: "error", error: "The previous work may still be running. Your new instruction is saved, not sent." });
        this.audio({ type: "cancellationUnknown", transcript: text });
        this.captureGeneration.abort(); this.release?.(); this.release = undefined;
        return;
      }
      this.pending = { text, id: crypto.randomUUID(), runId: this.state.runId, identity: this.adapters.identity?.() };
      this.set({ pending: true });
      await this.submitPending();
    } catch (error) { if (!signal.aborted) this.fail(error instanceof Error ? error.message : "Voice request failed."); }
  }
  private async submitPending() {
    const pending = this.pending;
    if (!pending) return;
    const signal = this.generation.signal;
    this.set({ phase: "submitting", error: undefined });
    try {
      const result = await this.adapters.submit(pending.text, pending.id, pending.runId, signal, pending.identity);
      if (this.pending === pending) this.pending = undefined;
      this.awaitingReply = true;
      this.audio({ type: "waiting" });
      this.set({ runId: result.runId, after: result.after ?? this.state.after, pending: false, ...(!signal.aborted ? { phase: "thinking" as const } : {}) });
    } catch (error) {
      if ((error as { definitive?: boolean }).definitive) { this.pending = undefined; this.set({ pending: false }); }
      if (!signal.aborted) this.fail(error instanceof Error ? error.message : "Submission uncertain. Resume retries the same request.");
    }
  }
  stream(runId: string, prose: Array<{ seq: number; text: string }>) {
    if (this.blocked || !this.awaitingReply || runId !== this.state.runId || !["thinking", "generating", "speaking"].includes(this.state.phase)) return;
    for (const item of prose) {
      if (item.seq <= this.state.after) continue;
      if (item.text.trim()) this.stamps.firstText ??= performance.now();
      const part = this.streams.get(item.seq) ?? { text: "", segmenter: new SpeechSegmenter() };
      if (!item.text.startsWith(part.text)) continue; // do not retract or replay revised text
      for (const sentence of part.segmenter.push(item.text.slice(part.text.length))) this.enqueueSpeech(sentence);
      part.text = item.text; this.streams.set(item.seq, part);
    }
    this.set({ answer: prose.map(p => p.text).join("\n") });
    void this.pumpSpeech();
  }
  private enqueueSpeech(text: string) {
    for (const chunk of text.match(/.{1,500}(?:\s|$)|\S{1,500}/g) ?? []) {
      if (this.speechQueue.length >= 2 || this.speechCharacters + chunk.length > 1800) break;
      this.speechCharacters += chunk.length; this.speechQueue.push(chunk.trim());
    }
  }
  private pumpSpeech(): Promise<void> {
    if (this.speechTask) return this.speechTask;
    const signal = this.generation.signal;
    const task = (async () => {
      try {
        while (this.speechQueue.length) {
          signal.throwIfAborted(); this.set({ phase: "generating" });
          const text = this.speechQueue.shift()!;
          await this.speakMeasured(text, signal);
        }
        if (!signal.aborted && this.awaitingReply) this.set({ phase: "thinking" });
      } catch (error) { if (!signal.aborted) this.fail(error instanceof Error ? error.message : "Speech failed."); }
    })();
    this.speechTask = task;
    void task.finally(() => { if (this.speechTask === task) this.speechTask = undefined; });
    return task;
  }
  async complete(runId: string, seq: number, text: string) {
    if (this.blocked || runId !== this.state.runId || seq <= Math.max(this.completed, this.state.after) || !["thinking", "generating", "speaking"].includes(this.state.phase)) return;
    this.completed = seq;
    if (text.trim()) this.stamps.firstText ??= performance.now();
    this.awaitingReply = false;
    this.set({ answer: text, retrySpeech: true });
    if (this.streams.size) {
      const signal = this.generation.signal;
      for (const part of this.streams.values()) for (const sentence of part.segmenter.finish()) this.enqueueSpeech(sentence);
      await this.pumpSpeech();
      if (!signal.aborted) { this.set({ retrySpeech: false }); if (this.muted) this.set({ phase: "muted" }); else await this.listen(); }
      return;
    }
    await this.speakAnswer();
  }
  async retrySpeech() {
    if (!this.state.retrySpeech || this.blocked || !["error", "muted", "idle", ...(this.adapters.continuousCapture ? ["listening"] : [])].includes(this.state.phase)) return;
    if (this.adapters.continuousCapture && !this.release) { this.set({ error: "Resume native voice before replaying this answer." }); return; }
    this.invalidate(Boolean(this.adapters.continuousCapture)); this.muted = true;
    await this.speakAnswer();
    if (this.adapters.continuousCapture && this.state.phase === "muted") { this.invalidate(); this.audio({ type: "mute" }); }
  }
  private async speakAnswer() {
    const signal = this.generation.signal;
    const safe = spokenText(this.state.answer);
    this.set({ phase: "generating", error: undefined });
    try {
      // Keep spoken answers bounded; the full answer remains in the existing thread.
      const excerpt = safe.length > 1600 ? safe.slice(0, 1500).replace(/\s+\S*$/, "") + ". The rest is in the conversation." : safe;
      const chunks = excerpt.match(/.{1,500}(?:\s|$)|\S{1,500}/g) ?? [];
      for (const chunk of chunks) {
        signal.throwIfAborted();
        await this.speakMeasured(chunk.trim(), signal);
      }
      if (!signal.aborted) { this.set({ retrySpeech: false }); if (this.muted) this.set({ phase: "muted" }); else await this.listen(); }
    } catch (error) { if (!signal.aborted) this.fail(error instanceof Error ? error.message : "Speech failed. The answer is in your conversation."); }
  }
  private async speakMeasured(text: string, signal: AbortSignal) {
    this.audio({ type: "buffering" });
    const generation = this.state.audio.generation;
    await this.adapters.speak(text, signal, () => {
      if (signal.aborted) return;
      if (this.stamps.playback === undefined) { this.stamps.playback = performance.now(); recordVoiceTiming(this.stamps); }
      this.audio({ type: "audioChunk", generation }); this.set({ phase: "speaking" });
    }, () => { if (!signal.aborted) this.stamps.firstAudio ??= performance.now(); });
    if (!signal.aborted) this.audio({ type: "playbackEnded" });
  }
  approval(waiting: boolean) {
    this.blocked = waiting;
    if (waiting) { this.invalidate(); this.audio({ type: "approval" }); this.set({ phase: "approval" }); }
    else if (this.state.phase === "approval") {
      this.audio({ type: this.awaitingReply ? "waiting" : "cancellationSettled" });
      this.set({ phase: this.awaitingReply && !this.adapters.continuousCapture ? "thinking" : "muted" });
    }
  }
  fail(message: string) { this.invalidate(); this.set({ phase: "error", error: message }); }
  mute() {
    this.muted = true;
    this.audio({ type: "mute" });
    if (this.adapters.continuousCapture) { this.invalidate(); this.set({ phase: "muted" }); return; }
    if (["listening", "starting"].includes(this.state.phase)) { this.invalidate(); this.set({ phase: "muted" }); }
  }
  async userSpeech() {
    if (!this.adapters.continuousCapture || this.muted || this.blocked || this.cancellation || !["thinking", "generating", "speaking"].includes(this.state.phase)) return;
    this.audio({ type: "userSpeech" });
    this.invalidate(true);
    const signal = this.generation.signal, run = this.state.runId;
    this.set({ phase: "interrupting" });
    const cancellation = (async () => {
      try {
        if (run && this.awaitingReply) await this.adapters.cancel(run);
        if (signal.aborted) return false;
        this.awaitingReply = false; this.cancellationUncertain = false;
        this.audio({ type: "cancellationSettled" });
        if (this.state.phase === "interrupting") this.set({ phase: "listening" });
        return true;
      } catch {
        if (!signal.aborted) { this.cancellationUncertain = true; this.audio({ type: "cancellationUnknown" }); this.set({ phase: "error", error: "Cancellation is unconfirmed. Finish speaking; your next instruction will be held." }); }
        return false;
      }
    })();
    this.cancellation = cancellation;
    await cancellation;
    if (this.cancellation === cancellation) this.cancellation = undefined;
  }
  editPendingTranscript(text: string) { this.set({ pendingTranscript: text.slice(0, 8_000) }); }
  async recoverCancellation() {
    if (!this.cancellationUncertain || this.cancellation || this.recoveringCancellation || this.blocked) return;
    this.recoveringCancellation = true;
    const signal = this.generation.signal;
    this.set({ phase: "interrupting" });
    try {
      if (this.state.runId) await this.adapters.cancel(this.state.runId);
      if (signal.aborted) return;
      this.cancellationUncertain = false; this.awaitingReply = false;
      this.audio({ type: "cancellationSettled" });
      const text = this.state.pendingTranscript.trim();
      if (!text) { this.set({ phase: "muted", error: undefined }); return; }
      this.pending = { text, id: crypto.randomUUID(), runId: this.state.runId, identity: this.adapters.identity?.() };
      this.set({ pending: true, pendingTranscript: "", transcript: text });
      await this.submitPending();
    } catch { if (!signal.aborted) this.set({ phase: "error", error: "Still unable to confirm cancellation. Your instruction has not been sent." }); }
    finally { this.recoveringCancellation = false; }
  }
  async interrupt() {
    if (this.state.phase === "interrupting") return;
    const run = this.state.runId;
    this.invalidate(); this.muted = true;
    const signal = this.generation.signal;
    this.set({ phase: "interrupting" });
    try { if (run) await this.adapters.cancel(run); this.awaitingReply = false; if (!signal.aborted) this.set({ phase: "muted", error: undefined }); }
    catch (error) { if (!signal.aborted) this.set({ phase: "error", error: error instanceof Error ? error.message : "Work has not stopped yet." }); }
  }
  end() { this.invalidate(); this.audio({ type: "end" }); this.muted = true; this.set({ phase: "idle", error: undefined }); }
}
