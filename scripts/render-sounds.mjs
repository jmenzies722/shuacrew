// Renders Spark's sounds (apps/web/src/lib/earcons.ts) through Chromium's real Web Audio engine, offline and silent:
// prints peak/RMS/length per sound (clipping check) and writes WAVs you can audition with afplay.
// Usage: node scripts/render-sounds.mjs <bundled earcons.js> <outDir>
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [bundle, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addScriptTag({ content: readFileSync(bundle, "utf8") });
const results = await page.evaluate(async () => {
  const rate = 48000, all = [];
  for (const style of ["spatial", "simple"]) for (const kind of Object.keys(E.CUES)) {
    const ctx = new OfflineAudioContext(2, rate * 1.2, rate);
    E.schedule(ctx, kind, style, 0.7, 0.02);
    const buf = await ctx.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0, sum = 0, last = 0;
    for (let i = 0; i < L.length; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); peak = Math.max(peak, v); sum += (L[i] ** 2 + R[i] ** 2) / 2; if (v > 0.001) last = i; }
    const pcm = new Int16Array(L.length * 2); for (let i = 0; i < L.length; i++) { pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    all.push({ kind, style, peak, rms: Math.sqrt(sum / L.length), audible: last / rate, pcm: Array.from(pcm) });
  }
  return all;
});
await browser.close();
for (const r of results) {
  const data = Buffer.from(new Int16Array(r.pcm).buffer), h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(48000, 24); h.writeUInt32LE(48000 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path.join(out, `${r.style}-${r.kind}.wav`), Buffer.concat([h, data]));
  console.log(`${r.style.padEnd(7)} ${r.kind.padEnd(6)} peak ${(20 * Math.log10(r.peak)).toFixed(1).padStart(6)} dBFS  rms ${(20 * Math.log10(r.rms)).toFixed(1).padStart(6)} dB  audible ${r.audible.toFixed(2)} s`);
}
