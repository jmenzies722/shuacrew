import { readSpeechStream } from "./speech-stream";

export class VoicePlayback {
  private context?: AudioContext;
  async prepare() { this.context ??= new AudioContext(); await this.context.resume(); }
  close() { const context = this.context; this.context = undefined; if (context && context.state !== "closed") void context.close().catch(() => {}); }
  async speak(text: string, voiceId: string, speed: number, signal: AbortSignal, started: () => void, received?: () => void) {
    signal.throwIfAborted();
    await this.prepare();
    const context = this.context!;
    const sources = new Set<AudioBufferSourceNode>();
    const endings: Promise<void>[] = [];
    let at = 0, first = true;
    const stop = () => { for (const source of sources) { try { source.stop(); } catch {} source.disconnect(); } sources.clear(); };
    signal.addEventListener("abort", stop, { once: true });
    const id = crypto.randomUUID();
    try {
      const response = await fetch("/api/speech/synthesize", { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify({ id, generation: 1, voiceId, text, speed }), signal });
      if (!response.ok || !response.body) throw new Error("Speech unavailable. Your text answer is still in the conversation.");
      await readSpeechStream(response.body, { id, generation: 1 }, signal, async data => {
        received?.();
        const buffer = await context.decodeAudioData(data);
        signal.throwIfAborted();
        const source = context.createBufferSource(); source.buffer = buffer;
        source.playbackRate.value = speed; source.connect(context.destination); sources.add(source);
        endings.push(new Promise<void>(resolve => {
          const done = () => { signal.removeEventListener("abort", done); sources.delete(source); resolve(); };
          source.onended = () => { source.disconnect(); done(); };
          signal.addEventListener("abort", done, { once: true });
        }));
        at = Math.max(at, context.currentTime); source.start(at); at += buffer.duration / speed;
        if (first) { first = false; started(); }
      });
      await Promise.all(endings);
      signal.throwIfAborted();
    } finally { signal.removeEventListener("abort", stop); stop(); }
  }
}
