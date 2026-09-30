/**
 * Spark's sounds: short, clear, and placed where Spark lives — up at the notch, a little in front of you. Each note is
 * a struck-glass tone: a fundamental plus a few overtones that die away faster than it does (that's what makes a
 * sound feel rich rather than a beep), through a gentle compressor so nothing clips, with a small bright room behind
 * it. With headphones the HRTF panner makes them properly spatial; on the Mac's speakers they still read as "up there".
 *
 * Every sound uses notes of one chord (E major), so they sound like one family, and none lasts longer than ~0.5 s.
 */

export type Earcon = "listen" | "sent" | "off" | "done" | "error";
export type SoundStyle = "spatial" | "simple" | "off";

/** One note: frequency (Hz), when it starts (s), how long it rings (s), loudness (0–1), an optional pitch glide. */
export interface Note { f: number; at: number; dur: number; gain: number; glide?: number; soft?: boolean }
/** A sound: its notes, and where it moves (metres from your head: x right, y up, z towards you). */
export interface Cue { notes: Note[]; from: [number, number, number]; to: [number, number, number]; air?: number }

const E4 = 329.63, GS4 = 415.3, B4 = 493.88, E5 = 659.25, GS5 = 830.61, B5 = 987.77, E6 = 1318.51;

/** The sound design, as data (tested). Listening comes down to you from the notch; sent rises back up to it. */
export const CUES: Record<Earcon, Cue> = {
  // You're live: a quick rising shimmer (root, fifth, octave) drifting down towards you, with a breath of air.
  listen: { notes: [{ f: E5, at: 0, dur: 0.24, gain: 0.6 }, { f: B5, at: 0.045, dur: 0.26, gain: 0.5 }, { f: E6, at: 0.09, dur: 0.34, gain: 0.32 }], from: [0, 1.2, -1.4], to: [0, 0.5, -0.6], air: 0.05 },
  // Heard you, on its way: two notes settling as it lifts back up to the notch.
  sent: { notes: [{ f: B5, at: 0, dur: 0.14, gain: 0.42 }, { f: E5, at: 0.055, dur: 0.26, gain: 0.46 }], from: [0, 0.5, -0.6], to: [0, 1.4, -1.8] },
  // Voice mode off: one low, closing note with a slight fall.
  off: { notes: [{ f: B4, at: 0, dur: 0.12, gain: 0.3 }, { f: GS4, at: 0.05, dur: 0.3, gain: 0.4, glide: 0.97 }], from: [0, 1, -1], to: [0, 1.2, -1.6] },
  // It worked: a bright arpeggio that opens out left to right.
  done: { notes: [{ f: E5, at: 0, dur: 0.2, gain: 0.42 }, { f: GS5, at: 0.055, dur: 0.2, gain: 0.4 }, { f: B5, at: 0.11, dur: 0.22, gain: 0.4 }, { f: E6, at: 0.165, dur: 0.33, gain: 0.32 }], from: [-0.5, 1, -1.2], to: [0.5, 1, -1.2] },
  // Didn't work: two soft low notes, rounded, never harsh.
  error: { notes: [{ f: GS4, at: 0, dur: 0.2, gain: 0.3, soft: true }, { f: E4, at: 0.13, dur: 0.32, gain: 0.33, soft: true }], from: [0, 1, -1], to: [0, 1, -1] },
};

/** Glass: each overtone (ratio to the fundamental, level, how much faster it dies away). Soft notes keep only the warm ones. */
const GLASS: Array<[number, number, number]> = [[1, 1, 1], [2, 0.32, 1.8], [3, 0.11, 2.6], [4.16, 0.05, 3.4]];
const WARM: Array<[number, number, number]> = [[1, 1, 1], [2, 0.14, 1.6]];

/** The shared chain on a context: compressor → output, and a bright, short room fed from it. */
function chain(a: BaseAudioContext): { dry: AudioNode; wet: AudioNode } {
  const comp = a.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.002; comp.release.value = 0.12;
  comp.connect(a.destination);
  // A small room: 0.5 s of stereo noise, decaying fast, 12 ms after the note, with the lows cut so it never muddies.
  const len = Math.floor(a.sampleRate * 0.5), ir = a.createBuffer(2, len, a.sampleRate), pre = Math.floor(a.sampleRate * 0.012);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = pre; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i - pre) / (len - pre), 4); }
  const room = a.createConvolver(); room.buffer = ir;
  const hp = a.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 500;
  const wet = a.createGain(); wet.gain.value = 0.16;
  room.connect(hp).connect(wet).connect(comp);
  return { dry: comp, wet: room };
}

/** Schedule one sound on any context (live, or offline for rendering and tests of the real output). */
export function schedule(a: BaseAudioContext, kind: Earcon, style: Exclude<SoundStyle, "off">, volume: number, t0 = a.currentTime + 0.01, out = chain(a)) {
  const cue = CUES[kind], end = t0 + Math.max(...cue.notes.map((n) => n.at + n.dur)) + 0.05;
  // Spatial loses ~6 dB to distance and the HRTF: made up here so both styles sound equally loud (measured offline).
  const bus = a.createGain(); bus.gain.value = Math.min(1, Math.max(0, volume)) * 0.42 * (style === "spatial" ? 1.9 : 1);
  // Round off the very top: clear, never fizzy.
  const tone = a.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 7000; tone.Q.value = 0.5;
  bus.connect(tone);
  if (style === "spatial") {
    const p = a.createPanner(); p.panningModel = "HRTF"; p.distanceModel = "inverse"; p.refDistance = 1; p.rolloffFactor = 0.5;
    const [fx, fy, fz] = cue.from, [tx, ty, tz] = cue.to;
    p.positionX.setValueAtTime(fx, t0); p.positionY.setValueAtTime(fy, t0); p.positionZ.setValueAtTime(fz, t0);
    p.positionX.linearRampToValueAtTime(tx, end); p.positionY.linearRampToValueAtTime(ty, end); p.positionZ.linearRampToValueAtTime(tz, end);
    tone.connect(p); p.connect(out.dry); p.connect(out.wet);
  } else { tone.connect(out.dry); tone.connect(out.wet); }
  for (const n of cue.notes) {
    const at = t0 + n.at;
    for (const [ratio, level, faster] of n.soft ? WARM : GLASS) {
      const o = a.createOscillator(), g = a.createGain(), ring = n.dur / faster;
      o.type = "sine"; o.frequency.setValueAtTime(n.f * ratio, at);
      if (n.glide) o.frequency.exponentialRampToValueAtTime(n.f * ratio * n.glide, at + n.dur);
      // A 4 ms attack (a strike, no click) and an exponential ring-out; overtones fade first, like real glass.
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(n.gain * level, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + ring);
      o.connect(g).connect(bus); o.start(at); o.stop(at + ring + 0.02);
    }
  }
  if (cue.air && style === "spatial") { // a breath: band-passed noise swelling in and out under the shimmer
    const len = Math.floor(a.sampleRate * 0.22), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
    const src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; bp.type = "bandpass"; bp.frequency.value = 4200; bp.Q.value = 1.1; g.gain.value = cue.air;
    src.connect(bp).connect(g).connect(bus); src.start(t0);
  }
  return end;
}

let live: { ctx: AudioContext; out: { dry: AudioNode; wet: AudioNode } } | null = null;

/** Play a sound now. `volume` 0–1 on top of each note's own level; "simple" skips the 3-D placement and the breath. */
export function earcon(kind: Earcon, style: SoundStyle = "spatial", volume = 0.7) {
  if (style === "off" || volume <= 0) return;
  try {
    if (!live) { const ctx = new AudioContext(); live = { ctx, out: chain(ctx) }; }
    if (live.ctx.state === "suspended") void live.ctx.resume();
    schedule(live.ctx, kind, style, volume, live.ctx.currentTime + 0.01, live.out);
  } catch { /* no audio: the notch still shows it */ }
}
