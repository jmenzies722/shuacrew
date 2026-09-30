import { describe, expect, it } from "vitest";
import { LIVE_CONFIDENT, pcm16, trustLive } from "./live-speech";

describe("using Apple's instant transcript only when it's sure", () => {
  it("trusts it at or above the bar measured on real asks (0.85), never below", () => {
    expect(LIVE_CONFIDENT).toBe(0.85);
    expect(trustLive({ text: "Set the volume to 80%.", confidence: 0.91, ms: 70 })).toBe(true);
    expect(trustLive({ text: "Show me an example of it.", confidence: 0.85, ms: 90 })).toBe(true);
    // Real misses from the benchmark all sat below the bar:
    expect(trustLive({ text: "What due today on my reminders?", confidence: 0.83, ms: 60 })).toBe(false);
    expect(trustLive({ text: "Remind me to call Maria at 3 PM tomorrow.", confidence: 0.3, ms: 70 })).toBe(false);
  });
  it("never trusts nothing", () => {
    expect(trustLive(null)).toBe(false);
    expect(trustLive({ text: "", confidence: 1, ms: 10 })).toBe(false);
    expect(trustLive({ text: " … ", confidence: 1, ms: 10 })).toBe(false);
  });
});

it("encodes mic samples as 16-bit little-endian PCM, clipping out-of-range values", () => {
  const bytes = Uint8Array.from(atob(pcm16(new Float32Array([0, 1, -1, 2]))), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  expect([0, 1, 2, 3].map((i) => view.getInt16(i * 2, true))).toEqual([0, 32767, -32767, 32767]);
});
