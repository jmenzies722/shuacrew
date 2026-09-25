import { expect, it } from "vitest";
import { decodeVoiceWav } from "./voice-pcm";
function wav() {
  const bytes = new ArrayBuffer(48), v = new DataView(bytes), u = new Uint8Array(bytes);
  for (const [at, text] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]] as const) for (let i = 0; i < text.length; i++) u[at + i] = text.charCodeAt(i);
  v.setUint32(4, 40, true); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 24000, true); v.setUint16(34, 16, true); v.setUint32(40, 4, true); v.setInt16(44, 100, true); v.setInt16(46, -100, true);
  return bytes;
}
it("passes only bounded mono PCM to native playback", () => {
  const result = decodeVoiceWav(wav());
  expect(result.sampleRate).toBe(24000); expect(result.pcm).toEqual(new Uint8Array([100, 0, 156, 255]));
  const bad = wav(); new DataView(bad).setUint32(40, 999999, true);
  expect(() => decodeVoiceWav(bad)).toThrow();
  const stereo = wav(); new DataView(stereo).setUint16(22, 2, true);
  expect(() => decodeVoiceWav(stereo)).toThrow();
});
