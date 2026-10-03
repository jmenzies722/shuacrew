import { SpeechQueue, type CaptionLine } from "./buddy-voice";
export const NARRATION_SAMPLE = "The viewer asks the API for permission to watch. The API returns a short-lived playback token. Video segments come from the content delivery network, not through the application server. This keeps playback close to viewers while protecting the library.";
export type PreviewPort = { say(text: string, options: { voiceId: string; speed: number }): void; unlock(): void; dispose(): void; onCaption?: (caption: CaptionLine | null) => void; onSpeaking?: (speaking: boolean) => void; onError?: (error: string) => void };
export type ComparisonSnapshot = { voiceId: string | null; status: "idle" | "loading" | "playing" | "error"; firstAudioMs: number | null; error: string | null };
export class VoiceComparison {
  private state: ComparisonSnapshot = { voiceId: null, status: "idle", firstAudioMs: null, error: null };
  private port?: PreviewPort;
  private generation = 0;
  private disposed = false;
  constructor(private voices: string[], private notify: () => void = () => {}, private create: () => PreviewPort = () => new SpeechQueue(true)) {}
  snapshot() { return this.state; }
  private update(patch: Partial<ComparisonSnapshot>) { this.state = { ...this.state, ...patch }; this.notify(); }
  async play(voiceId: string) {
    if (this.disposed) return;
    this.stop();
    if (!this.voices.includes(voiceId)) { this.update({ voiceId, status: "error", error: "This voice is not available in the local engine." }); return; }
    const generation = this.generation, started = performance.now();
    this.update({ voiceId, status: "loading", firstAudioMs: null, error: null });
    try {
      const port = this.create(); this.port = port;
      port.onCaption = caption => { if (generation !== this.generation || !caption) return; this.update({ status: "playing", firstAudioMs: this.state.firstAudioMs ?? Math.round(performance.now() - started) }); };
      port.onSpeaking = speaking => { if (generation === this.generation && !speaking && this.state.status !== "error") this.update({ status: "idle" }); };
      port.onError = error => { if (generation === this.generation) { this.update({ status: "error", error }); this.port?.dispose(); this.port = undefined; } };
      port.unlock(); port.say(NARRATION_SAMPLE, { voiceId, speed: 1 });
    } catch (error) { if (generation === this.generation) { this.update({ status: "error", error: error instanceof Error ? error.message : "Could not play this sample." }); this.port?.dispose(); this.port = undefined; } }
  }
  stop() { this.generation++; this.port?.dispose(); this.port = undefined; this.update({ status: "idle" }); }
  dispose() { this.stop(); this.disposed = true; this.notify = () => {}; }
}
