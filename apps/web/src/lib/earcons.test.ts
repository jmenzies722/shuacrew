import { expect, it } from "vitest";
import { CUES } from "./earcons";

it("keeps every sound short and soft, one chord family", () => {
  for (const [name, cue] of Object.entries(CUES)) {
    const end = Math.max(...cue.notes.map((n) => n.at + n.dur));
    expect(end, name).toBeLessThanOrEqual(0.5);
    for (const n of cue.notes) { expect(n.gain, name).toBeLessThanOrEqual(0.6); expect(n.f, name).toBeGreaterThan(300); expect(n.f, name).toBeLessThan(1400); }
  }
});
it("listening comes down to you from the notch; sent goes back up to it", () => {
  expect(CUES.listen.to[1]).toBeLessThan(CUES.listen.from[1]); expect(CUES.listen.to[2]).toBeGreaterThan(CUES.listen.from[2]);
  expect(CUES.sent.to[1]).toBeGreaterThan(CUES.sent.from[1]); expect(CUES.sent.to[2]).toBeLessThan(CUES.sent.from[2]);
  expect(CUES.listen.notes.at(-1)!.f).toBeGreaterThan(CUES.listen.notes[0]!.f); // rises
  expect(CUES.sent.notes.at(-1)!.f).toBeLessThan(CUES.sent.notes[0]!.f);       // settles
});
