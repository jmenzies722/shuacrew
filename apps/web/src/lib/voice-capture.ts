/** Energy endpointing, not speech recognition: short noises never submit a turn. */
export class SpeechBoundary {
  private loudSince?: number;
  private lastLoud = 0;
  private heard = false;
  constructor(private began: number) {}
  sample(energy: number, now: number): "continue" | "finish" | "silent" {
    if (energy > .018) { this.loudSince ??= now; this.lastLoud = now; if (now - this.loudSince >= 250) this.heard = true; }
    else this.loudSince = undefined;
    if (this.heard && (now - this.lastLoud >= 900 || now - this.began >= 30_000)) return "finish";
    if (!this.heard && now - this.began >= 20_000) return "silent";
    return "continue";
  }
}

export class VoiceCapture {
  finish?: () => void;
  async start(signal: AbortSignal, utterance: (blob: Blob) => void, error: (message: string) => void, level: (value: number) => void): Promise<() => void> {
    signal.throwIfAborted();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (signal.aborted) { stream.getTracks().forEach(t => t.stop()); signal.throwIfAborted(); }
    const context = new AudioContext();
    let recorder: MediaRecorder | undefined, timer: ReturnType<typeof setInterval> | undefined, ended = false, deliver = false, bytes = 0;
    const pieces: Blob[] = [];
    const cleanup = () => {
      if (ended) return; ended = true; this.finish = undefined;
      clearInterval(timer); signal.removeEventListener("abort", cleanup);
      stream.getTracks().forEach(t => { t.onended = null; t.stop(); });
      if (recorder?.state === "recording") recorder.stop();
      void context.close().catch(() => {}); level(0);
    };
    try {
      await context.resume(); signal.throwIfAborted();
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = event => { bytes += event.data.size; if (bytes > 8 * 1024 * 1024) { deliver = false; cleanup(); error("Recording is too large. Try a shorter sentence."); } else if (event.data.size) pieces.push(event.data); };
      recorder.onstop = () => { if (deliver && !signal.aborted) utterance(new Blob(pieces, { type: recorder!.mimeType })); };
      recorder.onerror = () => { cleanup(); error("Recording failed. Check your microphone and retry."); };
      stream.getTracks().forEach(t => { t.onended = () => { cleanup(); error("Microphone disconnected. Reconnect it and try again."); }; });
      const source = context.createMediaStreamSource(stream), analyser = context.createAnalyser();
      analyser.fftSize = 1024; source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize), boundary = new SpeechBoundary(performance.now());
      this.finish = () => { if (!ended) { deliver = true; cleanup(); } };
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const energy = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        level(Math.min(1, energy * 8));
        const result = boundary.sample(energy, performance.now());
        if (result === "finish") this.finish?.();
        if (result === "silent") { cleanup(); error("No speech detected. Microphone released—resume when ready."); }
      }, 50);
      signal.addEventListener("abort", cleanup, { once: true });
      recorder.start(250);
      return cleanup;
    } catch (failure) { cleanup(); throw failure; }
  }
}
