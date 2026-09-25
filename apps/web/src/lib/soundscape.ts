/** Focus soundscapes, synthesized live (no audio files): brown noise, rain, café hum. */
export type Scape = "off" | "brown" | "rain" | "cafe";
let ctx: AudioContext | null = null, nodes: AudioNode[] = [], gain: GainNode | null = null, current: Scape = "off";

function noise(ctx: AudioContext, kind: "white" | "brown") {
  const len = ctx.sampleRate * 4, buffer = ctx.createBuffer(1, len, ctx.sampleRate), data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "brown") { last = (last + 0.02 * w) / 1.02; data[i] = last * 3.5; } else data[i] = w;
  }
  const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true; return src;
}

export function playScape(scape: Scape, volume: number) {
  stopScape();
  current = scape;
  if (scape === "off") return;
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
    gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)) * 0.5, ctx.currentTime + 1.2); // fade in
    if (scape === "brown") { const n = noise(ctx, "brown"); n.connect(gain); n.start(); nodes = [n]; }
    if (scape === "rain") {
      const n = noise(ctx, "white"), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 900; lp.type = "lowpass"; lp.frequency.value = 7000;
      const g = ctx.createGain(); g.gain.value = 0.35;
      n.connect(hp).connect(lp).connect(g).connect(gain); n.start(); nodes = [n, hp, lp, g];
    }
    if (scape === "cafe") {
      const n = noise(ctx, "brown"), bp = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), depth = ctx.createGain();
      bp.type = "bandpass"; bp.frequency.value = 420; bp.Q.value = 0.7;
      lfo.frequency.value = 0.13; depth.gain.value = 180; lfo.connect(depth).connect(bp.frequency); // slow murmur
      n.connect(bp).connect(gain); n.start(); lfo.start(); nodes = [n, bp, lfo, depth];
    }
  } catch { current = "off"; }
}
export function setScapeVolume(volume: number) { if (gain && ctx) gain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)) * 0.5, ctx.currentTime, 0.2); }
export function stopScape() {
  for (const n of nodes) { try { (n as AudioScheduledSourceNode).stop?.(); } catch { /* not a source */ } n.disconnect(); }
  nodes = []; gain?.disconnect(); gain = null; current = "off";
}
export function scapePlaying(): Scape { return current; }
