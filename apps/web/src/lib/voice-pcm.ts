export function decodeVoiceWav(bytes: ArrayBuffer): { sampleRate: number; pcm: Uint8Array } {
  if (bytes.byteLength < 44 || bytes.byteLength > 8 * 1024 * 1024) throw new Error("Invalid speech audio size.");
  const view = new DataView(bytes);
  const tag = (at: number) => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || view.getUint32(4, true) + 8 !== bytes.byteLength) throw new Error("Invalid speech audio container.");
  let rate = 0, pcm: Uint8Array | undefined;
  for (let at = 12; at + 8 <= bytes.byteLength;) {
    const size = view.getUint32(at + 4, true), start = at + 8;
    if (start + size > bytes.byteLength) throw new Error("Truncated speech audio.");
    if (tag(at) === "fmt ") {
      if (size < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 2, true) !== 1 || view.getUint16(start + 14, true) !== 16) throw new Error("Speech audio must be mono PCM16.");
      rate = view.getUint32(start + 4, true);
    } else if (tag(at) === "data") pcm = new Uint8Array(bytes.slice(start, start + size));
    at = start + size + size % 2;
  }
  if (rate < 8000 || rate > 48000 || !pcm?.length || pcm.length % 2 || pcm.length / 2 / rate > 20) throw new Error("Unsupported speech audio.");
  return { sampleRate: rate, pcm };
}
