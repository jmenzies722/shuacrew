import { describe, expect, it } from "vitest";
import { frameAction, meaningful, yesOrNo, vadStart, vadStep, type VadState } from "./handsfree";

const run = (s: VadState, rms: number, ms: number, strict = false) => {
  const events: string[] = [];
  for (let t = 0; t < ms; t += 20) { const r = vadStep(s, rms, 20, undefined, strict); s = r.state; if (r.event) events.push(r.event); }
  return { s, events };
};

it("hears a turn start and end, and ignores room noise and blips", () => {
  let { s } = run(vadStart(), 0.004, 2000); // learns a quiet room
  let r = run(s, 0.1, 600); expect(r.events).toEqual(["start"]);
  r = run(r.s, 0.004, 900); expect(r.events).toEqual([]); // a natural pause mid-thought doesn't cut you off
  r = run(r.s, 0.1, 400); r = run(r.s, 0.004, 1300); expect(r.events).toEqual(["end"]);
  // a cough: loud long enough to start, too short to be a turn
  r = run(r.s, 0.1, 160); r = run(r.s, 0.004, 1300); expect(r.events).toEqual(["discard"]);
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

it("encodes a 16 kHz mono WAV from 48 kHz audio", async () => {
  const { toWav } = await import("./handsfree");
  const second = new Float32Array(48000).map((_, i) => Math.sin(i / 10) * 0.5);
  const wav = toWav([second], 48000);
  const head = new DataView(await wav.arrayBuffer());
  expect(head.getUint32(24, true)).toBe(16000);          // sample rate
  expect(head.getUint16(22, true)).toBe(1);              // mono
  expect(head.getUint32(40, true)).toBe(16000 * 2);      // one second of 16-bit samples
});

it("ignores Spark's own voice echoing back, but still hears a real interruption", () => {
  const { s } = run(vadStart(), 0.004, 2000);
  expect(run(s, 0.05, 300, true).events).toEqual([]);        // a short loud blip while Spark talks: echo, not you
  expect(run(s, 0.05, 700, true).events).toEqual(["start"]); // you, clearly and for more than half a second
});

import { STEADY, steady } from "./handsfree";
it("keeps live captions steady: words lock once two guesses agree, and locked words never flicker", () => {
  let s = steady(STEADY, "Can you turn the");
  expect(s.shown).toBe("Can you turn the");
  s = steady(s, "Can you turn the radio of"); // agrees on the first four: those lock
  expect(s.locked).toEqual(["Can", "you", "turn", "the"]);
  s = steady(s, "Can you learn the radio off and"); // a wobble in a locked word is ignored
  expect(s.shown).toBe("Can you turn the radio off and");
  s = steady(s, "Can you"); // a shorter guess never takes words away
  expect(s.shown).toBe("Can you turn the");
});

describe("each mic frame", () => {
  const f = { turn: true, speaking: false, yielded: false, talk: 0, captionDue: false };
  it("ends your turn even when a live caption falls due on the same frame (it used to be lost: you had to repeat yourself)", () => {
    expect(frameAction("end", { ...f, captionDue: true })).toBe("finish");
    expect(frameAction("discard", { ...f, captionDue: true })).toBe("discard");
  });
  it("still captions mid-turn and yields when you talk over Spark", () => {
    expect(frameAction(undefined, { ...f, captionDue: true })).toBe("caption");
    expect(frameAction(undefined, { ...f, speaking: true, talk: 650, captionDue: true })).toBe("yield");
    expect(frameAction(undefined, { ...f, turn: false, captionDue: true })).toBeNull();
  });
});

describe("answering a yes-or-no out loud", () => {
  it("hears yes, no, and anything else as neither", () => {
    for (const y of ["Yes.", "yeah", "yes please", "do it", "delete it", "Go ahead!"]) expect(yesOrNo(y)).toBe(true);
    for (const n of ["No.", "nope", "keep it", "cancel", "never mind", "don't"]) expect(yesOrNo(n)).toBe(false);
    expect(yesOrNo("what's the weather")).toBeNull();
  });
});

describe("noise that isn't a request", () => {
  it("drops lone filler words Whisper makes of key clicks, but keeps yes and no", () => {
    for (const w of ["and", "And.", "so", "the", "Okay.", "mm", "Bye-bye."]) expect(meaningful(w)).toBe(false);
    for (const w of ["yes", "No.", "and then play Drake", "pause"]) expect(meaningful(w)).toBe(true);
  });
});
