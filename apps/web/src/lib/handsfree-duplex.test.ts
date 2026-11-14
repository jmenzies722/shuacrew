import { expect, it } from "vitest";
import { END_MS, VAD, endAfterMs, endsSentence, learnCoupling, pauseKind, vadStart, vadStep, type VadState } from "./handsfree";

const run = (rms: number, ms: number, echo?: number) => {
  let s: VadState = vadStart(); let event: string | undefined;
  for (let t = 0; t < ms; t += 20) { const r = vadStep(s, rms, 20, undefined, true, echo); s = r.state; if (r.event) event = r.event; }
  return event;
};

it("with Spark's echo measured, a normal voice interrupts in about a quarter second", () => {
  expect(run(0.12, 300, 0.03)).toBe("start");        // you, clearly above the echo
  expect(run(0.12, 200, 0.03)).toBeUndefined();      // not yet: a blip isn't an interruption
});

it("Spark's own voice coming back through the speakers never counts as you", () => {
  expect(run(0.05, 3000, 0.04)).toBeUndefined();     // echo-level sound, however long
});

it("without a measured echo it stays cautious (louder and sustained)", () => {
  expect(run(0.05, 300)).toBeUndefined();
});

it("learns how much of Spark reaches the mic, and ignores silence between words", () => {
  let c = 0.6;
  for (let i = 0; i < 2000; i++) c = learnCoupling(c, 0.02, 0.2);  // quiet room: 10% comes back
  expect(c).toBeCloseTo(0.15, 2);                                    // settles at the floor, never below it
  expect(learnCoupling(0.2, 0.16, 0.2)).toBeGreaterThan(0.3);        // a loud echo syllable raises it at once
  expect(learnCoupling(0.3, 0.5, 0.001)).toBe(0.3);
});

it("a finished-sounding sentence lets the turn end sooner", () => {
  expect(endsSentence("Can you open my calendar?")).toBe(true);
  expect(endsSentence("so what I was thinking")).toBe(false);
});

it("a false start that goes quiet never builds up enough real speech to cut Spark off", () => {
  let s: VadState = vadStart(); let talk = 0;
  for (let t = 0; t < 300; t += 20) s = vadStep(s, 0.2, 20, undefined, true, 0.02).state;   // a blip starts a turn
  for (let t = 0; t < 900; t += 20) { s = vadStep(s, 0.01, 20, undefined, true, 0.02).state; talk = s.talk; } // then quiet
  expect(talk).toBeLessThan(600);
});

it("gives you time to finish a thought, and answers a finished one quickly", () => {
  // Left hanging: a connective, a filler, an article, a trailing comma. You are about to say more.
  for (const said of ["so what I want is to", "Open my calendar and", "can you check the, um", "I was thinking that maybe we could move my", "first open Safari,", "and then…", "it should be kind of"]) expect(pauseKind(said), said).toBe("hanging");
  // Finished: answered after a short pause.
  for (const said of ["Can you open my calendar?", "Open Safari.", "That's it!"]) expect(pauseKind(said), said).toBe("finished");
  // Neither: no punctuation yet, and nothing says more is coming.
  for (const said of ["open my calendar", "what time is it", "who is that for", "what does it look like", "call her", "I want that", ""]) expect(pauseKind(said), said).toBe("open");
  expect([endAfterMs("Open Safari."), endAfterMs("open my calendar"), endAfterMs("open my calendar and")]).toEqual([END_MS.finished, END_MS.open, END_MS.hanging]);
});

it("a two-second pause in the middle of a sentence no longer ends your turn", () => {
  const frame = 20, talk = (s: VadState, ms: number, endMs: number) => { let state = s, ended = false; for (let t = 0; t < ms; t += frame) { const r = vadStep(state, 0.2, frame, { ...VAD, endMs }); state = r.state; ended ||= r.event === "end"; } return { state, ended }; };
  const hush = (s: VadState, ms: number, endMs: number) => { let state = s, ended = false; for (let t = 0; t < ms; t += frame) { const r = vadStep(state, 0.001, frame, { ...VAD, endMs }); state = r.state; ended ||= r.event === "end" || r.event === "discard"; } return { state, ended }; };
  const spoke = talk(vadStart(), 1500, VAD.endMs).state;
  expect(hush(spoke, 2000, VAD.endMs).ended).toBe(true); // before: 1.1 s of quiet ended it
  const held = hush(spoke, 2000, endAfterMs("so what I want is to"));
  expect(held.ended).toBe(false); // now: still your turn
  expect(talk(held.state, 600, endAfterMs("so what I want is to open the report")).state.speaking).toBe(true); // and you carry on in the same turn
  expect(hush(spoke, 3000, endAfterMs("so what I want is to")).ended).toBe(true); // but it does not wait forever
});
