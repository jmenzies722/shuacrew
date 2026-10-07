import { expect, it } from "vitest";
import { DEFAULT_RATE, LivePace } from "./live-pace";

const reply = "Pick one task, set a 25-minute timer, and silence every notification until it rings.";

it("reveals the reply as the voice says it, whole words, never ahead", () => {
  const p = new LivePace();
  expect(p.tick(reply, 50, false)).toBeNull(); // text arrived, voice not audible yet: nothing heard
  let heard = "";
  for (let t = 0; t < 1000; t += 50) heard = p.tick(reply, 50, true) ?? heard;
  // One second of voice at ~14.5 chars/s: about the first 14 characters, on a word boundary.
  expect(heard).toBe("Pick one task,");
  expect(reply.startsWith(heard)).toBe(true);
  for (let t = 0; t < 600; t += 50) expect(p.tick(reply, 50, false)).toBeNull(); // a pause: it waits for the voice
  for (let t = 0; t < 10_000; t += 50) heard = p.tick(reply, 50, true) ?? heard;
  expect(heard).toBe(reply); // all of it, once the voice has said it
});

it("learns the voice's real rate from a finished reply, within sane bounds", () => {
  const p = new LivePace();
  for (let t = 0; t < 8000; t += 50) p.tick(reply, 50, true); // 8 s to say 85 characters: slower than the default
  expect(p.finish(reply)).toBe(reply);
  expect(p.rate).toBeLessThan(DEFAULT_RATE);
  expect(p.rate).toBeGreaterThan(0.008);
});

it("a new reply starts from the beginning", () => {
  const p = new LivePace();
  for (let t = 0; t < 3000; t += 50) p.tick(reply, 50, true);
  expect(p.tick("Tokyo is on Japan Standard Time.", 50, true)).toBeNull(); // nothing heard of the new one yet
});
