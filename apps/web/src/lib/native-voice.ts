import { readSpeechStream } from "./speech-stream";
import { decodeVoiceWav } from "./voice-pcm";

type NativeEvent = { kind: string; sessionId: string; generation: number; requestId?: string; wav?: string; level?: number; error?: string };
export class NativeVoice {
  private sessionId = "";
  private generation = 0;
  private closeCapture?: () => void;
  private plays = new Map<string, { resolve(): void; reject(error: Error): void; started(): void }>();
  static available() { return typeof document !== "undefined" && document.documentElement.dataset.nativeVoice === "1"; }
  private post(action: string, extra: Record<string, unknown> = {}) {
    const native = (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: { postMessage(message: unknown): void } } } }).webkit?.messageHandlers?.shuacrew;
    if (!native) throw new Error("Native voice is unavailable. Choose push-to-talk.");
    native.postMessage({ type: "voiceAudio", action, requestId: crypto.randomUUID(), sessionId: this.sessionId, ...(action !== "start" ? { generation: this.generation } : {}), ...extra });
  }
  async start(signal: AbortSignal, utterance: (blob: Blob) => void, error: (message: string) => void, level: (value: number) => void, speechStarted: () => void, endpoint: "quick" | "balanced" | "patient" = "balanced"): Promise<() => void> {
    signal.throwIfAborted(); this.close();
    this.sessionId = crypto.randomUUID(); this.generation = 0;
    const session = this.sessionId, request = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      let ready = false, closed = false;
      const timer = setTimeout(() => { reject(new Error("Microphone setup timed out. Resume when ready.")); cleanup(); }, 60_000);
      const cleanup = () => {
        if (closed) return; closed = true;
        clearTimeout(timer); signal.removeEventListener("abort", abort); window.removeEventListener("shuacrew:voiceAudio", receive);
        if (this.sessionId === session) this.post(this.generation ? "end" : "cancelStart");
        for (const pending of this.plays.values()) pending.reject(new Error("Voice ended.")); this.plays.clear();
        level(0); if (this.closeCapture === cleanup) this.closeCapture = undefined;
      };
      const abort = () => { reject(new DOMException("Voice cancelled", "AbortError")); cleanup(); };
      const receive = (raw: Event) => {
        const event = (raw as CustomEvent<NativeEvent>).detail;
        if (closed || !event || event.sessionId !== session || !Number.isSafeInteger(event.generation) || event.generation < 1) return;
        if (event.kind === "starting" && event.requestId === request) this.generation = event.generation;
        if (event.generation !== this.generation) return;
        if (event.kind === "ready" && event.requestId === request) { ready = true; clearTimeout(timer); resolve(cleanup); }
        else if (event.kind === "level" && typeof event.level === "number" && Number.isFinite(event.level)) level(Math.max(0, Math.min(1, event.level)));
        else if (event.kind === "speechStarted" && ready) speechStarted();
        else if (event.kind === "utterance" && ready && typeof event.wav === "string" && event.wav.length <= 8 * 1024 * 1024) {
          try { const bytes = Uint8Array.from(atob(event.wav), c => c.charCodeAt(0)); utterance(new Blob([bytes], { type: "audio/wav" })); }
          catch { error("Invalid captured audio. Resume voice to retry."); cleanup(); }
        } else if (event.kind === "playing" && event.requestId) this.plays.get(event.requestId)?.started();
        else if (event.kind === "played" && event.requestId) { this.plays.get(event.requestId)?.resolve(); this.plays.delete(event.requestId); }
        else if (event.kind === "error") {
          const failure = new Error(event.error ?? "Native audio failed.");
          if (event.requestId && this.plays.has(event.requestId)) { this.plays.get(event.requestId)!.reject(failure); this.plays.delete(event.requestId); }
          else { reject(failure); if (ready) error(failure.message); cleanup(); }
        } else if (event.kind === "ended") { reject(new Error("Native voice ended.")); if (ready) error("Audio stopped. Resume voice when ready."); cleanup(); }
      };
      this.closeCapture = cleanup;
      window.addEventListener("shuacrew:voiceAudio", receive); signal.addEventListener("abort", abort, { once: true });
      try { this.post("start", { requestId: request, endpoint }); } catch (failure) { reject(failure); cleanup(); }
    });
  }
  finish() { if (this.generation && this.closeCapture) this.post("finish"); }
  close() { this.closeCapture?.(); }
  async speak(text: string, voiceId: string, speed: number, signal: AbortSignal, started: () => void, received?: () => void) {
    signal.throwIfAborted();
    if (!this.closeCapture || !this.generation) throw new Error("Native audio is off. Resume conversation before playback.");
    const id = crypto.randomUUID(), generation = this.generation;
    let first = true;
    const stop = () => {
      if (this.closeCapture && this.generation === generation) this.post("stopPlayback");
      for (const pending of this.plays.values()) pending.reject(new DOMException("Speech cancelled", "AbortError")); this.plays.clear();
    };
    signal.addEventListener("abort", stop, { once: true });
    try {
      const response = await fetch("/api/speech/synthesize", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify({ id, generation, voiceId, text, speed }), signal });
      if (!response.ok || !response.body) throw new Error("Speech unavailable. The answer remains in your conversation.");
      await readSpeechStream(response.body, { id, generation }, signal, async data => {
        signal.throwIfAborted();
        received?.();
        const audio = decodeVoiceWav(data), requestId = crypto.randomUUID();
        let binary = ""; for (let at = 0; at < audio.pcm.length; at += 8192) binary += String.fromCharCode(...audio.pcm.subarray(at, at + 8192));
        // Await actual playback acknowledgment: native and HTTP buffers never accumulate a whole reply.
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { this.plays.delete(requestId); reject(new Error("Audio playback did not finish. Resume voice to retry.")); }, 25_000);
          this.plays.set(requestId, { resolve: () => { clearTimeout(timer); resolve(); }, reject: e => { clearTimeout(timer); reject(e); }, started: () => { if (first) { first = false; started(); } } });
          try { this.post("play", { requestId, sampleRate: Math.min(48000, audio.sampleRate * speed), pcm: btoa(binary) }); }
          catch (e) { this.plays.get(requestId)?.reject(e as Error); this.plays.delete(requestId); }
        });
      });
    } finally { signal.removeEventListener("abort", stop); }
  }
}
