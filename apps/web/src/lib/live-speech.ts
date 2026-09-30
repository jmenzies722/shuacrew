/**
 * Your words live, through the Mac app's on-device streaming recognizer (Apple SpeechAnalyzer). HandsFree streams the
 * mic frames it already has; captions arrive as you speak and the turn's final is ready ~0.1 s after you stop.
 *
 * Measured on 20 real Spark asks: Apple 7.9% of words wrong vs Whisper's 2.8%, but every Apple result whose least
 * certain word was ≥ 0.85 was right. So its final is used only when that sure; otherwise Whisper decides, as before.
 */
export const LIVE_CONFIDENT = 0.85;

export interface LiveFinal { text: string; confidence: number; ms: number }
export interface LiveSpeech {
  begin(turn: number, rate: number): void;
  push(turn: number, frame: Float32Array): void;
  /** The turn's final transcript, or null if it isn't there within `timeoutMs` (Whisper then decides). */
  end(turn: number, timeoutMs?: number): Promise<LiveFinal | null>;
  cancel(turn: number): void;
  /** Whether this turn is being transcribed live (the Mac said its model is ready). */
  live(turn: number): boolean;
  /** For calibration: what each engine heard and which was used. */
  verdict(v: { apple: string; confidence: number; whisper?: string; used: "apple" | "whisper"; ms: number }): void;
  onText?: (turn: number, text: string) => void;
}

/** Use the instant on-device final only when it's sure of every word. */
export function trustLive(final: LiveFinal | null): boolean {
  return !!final && final.confidence >= LIVE_CONFIDENT && /[a-z0-9]/i.test(final.text) && final.text.trim().split(/\s+/).length >= 1;
}

/** Float samples → 16-bit little-endian PCM, base64. */
export function pcm16(frame: Float32Array): string {
  const bytes = new Uint8Array(frame.length * 2), view = new DataView(bytes.buffer);
  for (let i = 0; i < frame.length; i++) view.setInt16(i * 2, Math.max(-1, Math.min(1, frame[i]!)) * 0x7fff, true);
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

type Native = { postMessage(message: unknown): void };
/** The Mac app's recognizer, or null outside the Mac app. `names` = words it should expect (your crew, ventures). */
export function nativeLiveSpeech(names: () => string[]): LiveSpeech | null {
  const native = (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Native } } }).webkit?.messageHandlers?.shuacrew;
  if (!native) return null;
  const ready = new Map<number, boolean>(), finals = new Map<number, (f: LiveFinal) => void>();
  const api: LiveSpeech = {
    begin(turn, rate) { ready.set(turn, true); native.postMessage({ type: "buddyAudio", op: "begin", turn, rate, names: names().slice(0, 50) }); },
    push(turn, frame) { if (ready.get(turn)) native.postMessage({ type: "buddyAudio", op: "chunk", turn, pcm: pcm16(frame) }); },
    end(turn, timeoutMs = 700) {
      if (!ready.get(turn)) return Promise.resolve(null);
      return new Promise((resolve) => {
        const t = setTimeout(() => { finals.delete(turn); resolve(null); }, timeoutMs);
        finals.set(turn, (f) => { clearTimeout(t); resolve(f); });
        native.postMessage({ type: "buddyAudio", op: "end", turn });
      });
    },
    cancel(turn) { ready.delete(turn); native.postMessage({ type: "buddyAudio", op: "cancel", turn }); },
    live: (turn) => ready.get(turn) === true,
    verdict(v) { native.postMessage({ type: "buddyAudio", op: "verdict", turn: 0, ...v }); },
  };
  window.addEventListener("shuacrew:speech", (e) => {
    const d = (e as CustomEvent<{ turn: number; text?: string; final?: boolean; confidence?: number; ms?: number; ready?: boolean }>).detail;
    if (d.ready === false) { ready.set(d.turn, false); return; } // the model isn't there yet: Whisper handles this turn
    if (d.final) { const done = finals.get(d.turn); finals.delete(d.turn); ready.delete(d.turn); done?.({ text: d.text ?? "", confidence: d.confidence ?? 0, ms: d.ms ?? -1 }); return; }
    if (d.text) api.onText?.(d.turn, d.text);
  });
  return api;
}
