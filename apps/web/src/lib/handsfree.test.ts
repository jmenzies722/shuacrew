import { expect, it } from "vitest";
import { meaningful, vadStart, vadStep, type VadState } from "./handsfree";

const run = (s: VadState, rms: number, ms: number, strict = false) => {
  const events: string[] = [];
  for (let t = 0; t < ms; t += 20) { const r = vadStep(s, rms, 20, undefined, strict); s = r.state; if (r.event) events.push(r.event); }
  return { s, events };
};

it("hears a turn start and end, and ignores room noise and blips", () => {
  let { s } = run(vadStart(), 0.004, 2000); // learns a quiet room
  let r = run(s, 0.1, 600); expect(r.events).toEqual(["start"]);
  r = run(r.s, 0.004, 1000); expect(r.events).toEqual(["end"]);
  // a cough: loud long enough to start, too short to be a turn
  r = run(r.s, 0.1, 160); r = run(r.s, 0.004, 1000); expect(r.events).toEqual(["discard"]);
  // steady hum raises the floor instead of triggering
  ({ s } = run(vadStart(), 0.006, 4000)); expect(run(s, 0.006, 2000).events).toEqual([]);
});

it("needs a louder voice while Spark is talking, so its own echo isn't you", () => {
  const { s } = run(vadStart(), 0.004, 2000);
  expect(run(s, 0.03, 600, true).events).toEqual([]);
  expect(run(s, 0.03, 600, false).events).toEqual(["start"]);
});

it("drops whisper's silence hallucinations", () => {
  expect(meaningful("Thank you.")).toBe(false);
  expect(meaningful("you")).toBe(false);
  expect(meaningful("[BLANK_AUDIO]")).toBe(false);
  expect(meaningful("open my projects folder")).toBe(true);
});
