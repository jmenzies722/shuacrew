import { useSyncExternalStore } from "react";

/** Focus soundscapes, synthesized live (no audio files): brown noise, rain, café hum. */
export type Scape = "off" | "brown" | "rain" | "cafe";
export type ScapeMood = "quiet" | "working" | "review" | "failed";
let ctx: AudioContext | null = null, nodes: AudioNode[] = [], gain: GainNode | null = null, colour: BiquadFilterNode | null = null, current: Scape = "off", mood: ScapeMood = "quiet", volume = 0.5;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function noise(ctx: AudioContext, kind: "white" | "brown") {
  const len = ctx.sampleRate * 4, buffer = ctx.createBuffer(1, len, ctx.sampleRate), data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "brown") { last = (last + 0.02 * w) / 1.02; data[i] = last * 3.5; } else data[i] = w;
  }
  const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true; return src;
}

export function playScape(scape: Scape, nextVolume: number) {
  stopScape();
  current = scape;
  volume = nextVolume;
  if (scape === "off") return;
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    colour = ctx.createBiquadFilter(); colour.type = "lowpass"; colour.frequency.value = 18000;
    gain = ctx.createGain(); gain.gain.value = 0;
    colour.connect(gain); gain.connect(ctx.destination);
    gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)) * 0.5, ctx.currentTime + 1.2);
    if (scape === "brown") { const n = noise(ctx, "brown"); n.connect(colour); n.start(); nodes = [n]; }
    if (scape === "rain") {
      const n = noise(ctx, "white"), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 900; lp.type = "lowpass"; lp.frequency.value = 7000;
      const g = ctx.createGain(); g.gain.value = 0.35;
      n.connect(hp).connect(lp).connect(g).connect(colour); n.start(); nodes = [n, hp, lp, g];
    }
    if (scape === "cafe") {
      const n = noise(ctx, "brown"), bp = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), depth = ctx.createGain();
      bp.type = "bandpass"; bp.frequency.value = 420; bp.Q.value = 0.7;
      lfo.frequency.value = 0.13; depth.gain.value = 180; lfo.connect(depth).connect(bp.frequency);
      n.connect(bp).connect(colour); n.start(); lfo.start(); nodes = [n, bp, lfo, depth];
    }
    setScapeMood(mood);
    emit();
  } catch { current = "off"; emit(); }
}
export function setScapeVolume(next: number) {
  volume = next;
  if (gain && ctx) gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)) * 0.5 * moodGain(mood), ctx.currentTime, 0.2);
}
/** Colour the bed when a soundscape is already on. Never starts audio on its own. */
export function setScapeMood(next: ScapeMood) {
  mood = next;
  if (!ctx || !gain || !colour || current === "off") return;
  const t = ctx.currentTime;
  const hz = next === "failed" ? 900 : next === "review" ? 2400 : next === "working" ? 12000 : 18000;
  colour.frequency.setTargetAtTime(hz, t, 0.35);
  gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)) * 0.5 * moodGain(next), t, 0.35);
}
function moodGain(m: ScapeMood) { return m === "failed" ? 0.35 : m === "review" ? 0.55 : m === "working" ? 1.05 : 1; }
export function stopScape() {
  for (const n of nodes) { try { (n as AudioScheduledSourceNode).stop?.(); } catch { /* not a source */ } n.disconnect(); }
  nodes = []; colour?.disconnect(); colour = null; gain?.disconnect(); gain = null; current = "off";
  emit();
}
export function scapePlaying(): Scape { return current; }
export function useScape() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, scapePlaying, scapePlaying); }
