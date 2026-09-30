// Renders Spark's sounds (apps/web/src/lib/earcons.ts) through Chromium's real Web Audio engine, offline and silent —
// exactly the buffers the app plays — and checks their quality: peak (clipping), length, clicks (spikes in the
// second difference; a smooth tone keeps it tiny), and silent edges. Writes WAVs to audition with afplay.
// Usage: node scripts/render-sounds.mjs <earcons bundle (esbuild --format=iife --global-name=E)> <outDir>
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [bundle, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addScriptTag({ content: readFileSync(bundle, "utf8") });
const results = await page.evaluate(async () => {
  const measure = (buf) => {
    const L = buf.getChannelData(0), R = buf.getChannelData(1); let peak = 0, spike = 0, last = 0;
    for (let i = 2; i < L.length; i++) for (const d of [L, R]) {
      peak = Math.max(peak, Math.abs(d[i])); spike = Math.max(spike, Math.abs(d[i] - 2 * d[i - 1] + d[i - 2]));
      if (Math.abs(d[i]) > 0.001) last = i;
    }
    return { peak, spike, audible: last / buf.sampleRate, edge: Math.max(Math.abs(L[0]), Math.abs(L.at(-1)), Math.abs(R[0]), Math.abs(R.at(-1))), L, R };
  };
  const all = [];
  for (const kind of Object.keys(E.CUES)) {
    // Before: a source sliding through 3-D space, built live.
    const ctx = new OfflineAudioContext(2, 48000 * 0.75, 48000); E.schedule(ctx, kind, "spatial", 1, 0.004, undefined, true);
    const old = measure(await ctx.startRendering());
    for (const style of ["spatial", "simple"]) {
      const m = measure(await E.render(kind, style));
      const pcm = new Int16Array(m.L.length * 2); for (let i = 0; i < m.L.length; i++) { pcm[2 * i] = m.L[i] * 32767; pcm[2 * i + 1] = m.R[i] * 32767; }
      all.push({ kind, style, peak: m.peak, spike: m.spike, oldSpike: style === "spatial" ? old.spike : null, audible: m.audible, edge: m.edge, pcm: Array.from(pcm) });
    }
  }
  return all;
});
await browser.close();
const db = (v) => (20 * Math.log10(Math.max(v, 1e-9))).toFixed(1).padStart(6);
for (const r of results) {
  const data = Buffer.from(new Int16Array(r.pcm).buffer), h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(48000, 24); h.writeUInt32LE(48000 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path.join(out, `${r.style}-${r.kind}.wav`), Buffer.concat([h, data]));
  console.log(`${r.style.padEnd(7)} ${r.kind.padEnd(6)} peak ${db(r.peak)} dBFS  clicks ${db(r.spike)} dB${r.oldSpike !== null ? ` (moving source was ${db(r.oldSpike)})` : ""}  edges ${db(r.edge)} dB  ${r.audible.toFixed(2)} s`);
}
