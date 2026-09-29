import { expect, it } from "vitest";
import { VoiceController, type VoiceAdapters } from "./voice-controller";
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; };
const tick = () => new Promise(r => setTimeout(r, 0));
function world(overrides: Partial<VoiceAdapters> = {}) {
  let utterance!: (blob: Blob) => void;
  const submitted: string[] = [], spoken: string[] = [];
  let stopped = 0;
  const controller = new VoiceController({
    capture: async (_signal, onUtterance) => { utterance = onUtterance; return () => { stopped++; }; },
    transcribe: async () => "Hello", submit: async text => { submitted.push(text); return { runId: "run" }; },
    speak: async text => { spoken.push(text); }, cancel: async () => {}, ...overrides,
  });
  return { controller, submitted, spoken, say: () => utterance(new Blob(["audio"])), stopped: () => stopped };
}
it("does not submit a transcript that arrives after End", async () => {
  const pending = deferred<string>(); const w = world({ transcribe: () => pending.promise });
  await w.controller.start(); w.say(); w.controller.end(); pending.resolve("Do something"); await tick();
  expect(w.controller.snapshot().phase).toBe("idle"); expect(w.submitted).toEqual([]); expect(w.stopped()).toBe(1);
});
it("releases microphone acquired after End and never enters listening", async () => {
  const pending = deferred<() => void>(); let stopped = 0;
  const w = world({ capture: () => pending.promise }); const starting = w.controller.start();
  await tick(); w.controller.end(); pending.resolve(() => { stopped++; }); await starting;
  expect(stopped).toBe(1); expect(w.controller.snapshot().phase).toBe("idle");
});
it("submits only once, speaks a completed turn once, and resumes listening", async () => {
  const w = world(); await w.controller.start(); w.say(); w.say(); await tick();
  expect(w.submitted).toEqual(["Hello"]);
  await w.controller.complete("run", 10, "Hello back.");
  await w.controller.complete("run", 10, "Hello back.");
  expect(w.spoken).toEqual(["Hello back."]); expect(w.controller.snapshot().phase).toBe("listening");
  w.controller.end();
});
it("waits for cancellation acknowledgement before restarting capture", async () => {
  const cancellation = deferred<void>(); const w = world({ cancel: () => cancellation.promise });
  await w.controller.start(); w.say(); await tick(); const interrupt = w.controller.interrupt();
  expect(w.controller.snapshot().phase).toBe("interrupting");
  await w.controller.start(); expect(w.controller.snapshot().phase).toBe("interrupting");
  cancellation.resolve(); await interrupt; expect(w.controller.snapshot().phase).toBe("muted");
  w.controller.end();
});
it("ignores wrong runs and does not restart capture after late playback", async () => {
  const speech = deferred<void>(); const w = world({ speak: () => speech.promise });
  await w.controller.start(); w.say(); await tick();
  await w.controller.complete("other", 1, "Wrong"); expect(w.controller.snapshot().phase).toBe("thinking");
  const reply = w.controller.complete("run", 2, "Right"); w.controller.end(); speech.resolve(); await reply;
  expect(w.controller.snapshot().phase).toBe("idle");
});
it("does not speak historical answers while a new submission is awaiting acknowledgement", async () => {
  const pending = deferred<{ runId: string; after: number }>();
  const spoken: string[] = [];
  let say!: (blob: Blob) => void;
  const c = new VoiceController({ capture: async (_s, callback) => { say = callback; return () => {}; }, transcribe: async () => "New request", submit: () => pending.promise, speak: async text => { spoken.push(text); }, cancel: async () => {} }, "old-run");
  await c.start(); say(new Blob(["audio"])); await tick();
  await c.complete("old-run", 50, "Old answer");
  expect(spoken).toEqual([]);
  pending.resolve({ runId: "old-run", after: 100 }); await tick();
  await c.complete("old-run", 50, "Old answer"); expect(spoken).toEqual([]);
  c.end();
});
it("retries an uncertain submission with the same id and transcript", async () => {
  const requests: Array<{ text: string; id: string }> = [];
  const w = world({ submit: async (text, id) => { requests.push({ text, id }); if (requests.length === 1) throw new Error("Network lost"); return { runId: "run" }; } });
  await w.controller.start(); w.say(); await tick();
  expect(w.controller.snapshot().phase).toBe("error");
  await w.controller.recoverSubmission(); expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  expect(w.controller.snapshot().phase).toBe("thinking"); w.controller.end();
});
it("never acquires the microphone after End during pre-start setup", async () => {
  const setup = deferred<void>(); let captures = 0;
  const w = world({ prepare: () => setup.promise, capture: async () => { captures++; return () => {}; } });
  const starting = w.controller.start(); w.controller.end(); setup.resolve(); await starting;
  expect(captures).toBe(0); expect(w.controller.snapshot().phase).toBe("idle");
});
it("recovers a tracked answer after connection loss before listening again", async () => {
  const w = world(); await w.controller.start(); w.say(); await tick(); w.controller.fail("Connection lost");
  await w.controller.start(); expect(w.controller.snapshot().phase).toBe("thinking");
  await w.controller.complete("run", 10, "Recovered answer"); expect(w.spoken).toEqual(["Recovered answer"]); w.controller.end();
});
it("requires explicit uncertain-submit recovery and retains the original identity", async () => {
  let target = { runtime: "claude", memberId: "shua" }; const sent: unknown[] = [];
  const w = world({ identity: () => target, submit: async (_text, _id, _run, _signal, identity) => { sent.push(identity); throw new Error("Lost"); } });
  await w.controller.start(); w.say(); await tick(); w.controller.end(); target = { runtime: "codex", memberId: "eli" };
  await w.controller.start(); expect(sent).toHaveLength(1);
  await w.controller.recoverSubmission(); expect(sent).toEqual([{ runtime: "claude", memberId: "shua" }, { runtime: "claude", memberId: "shua" }]); w.controller.end();
});
it("holds existing approvals without opening the microphone and stops listening for new ones", async () => {
  const w = world(); w.controller.approval(true); await w.controller.start();
  expect(w.controller.snapshot().phase).toBe("approval"); expect(w.stopped()).toBe(0);
  w.controller.approval(false); await w.controller.start(); expect(w.controller.snapshot().phase).toBe("listening");
  w.controller.approval(true); expect(w.stopped()).toBe(1); expect(w.controller.snapshot().phase).toBe("approval"); w.controller.end();
});
it("retries only speech after synthesis failure, without resubmitting agent work", async () => {
  let attempt = 0; const w = world({ speak: async () => { if (++attempt === 1) throw new Error("Synthesis failed"); } });
  await w.controller.start(); w.say(); await tick(); await w.controller.complete("run", 10, "An answer");
  await w.controller.retrySpeech(); expect(attempt).toBe(2); expect(w.submitted).toEqual(["Hello"]); w.controller.end();
});
it("speaks streamed sentences before completion without repeating the final answer", async () => {
  const w = world(); await w.controller.start(); w.say(); await tick();
  w.controller.stream("run", [{ seq: 2, text: "Hello there. More" }]); await tick();
  expect(w.spoken).toEqual(["Hello there."]);
  expect(w.controller.snapshot().phase).not.toBe("listening");
  w.controller.stream("run", [{ seq: 2, text: "Hello there. More help is here." }]);
  await w.controller.complete("run", 10, "Hello there. More help is here.");
  expect(w.spoken.join(" ")).toBe("Hello there. More help is here.");
  expect(w.controller.snapshot().phase).toBe("listening"); w.controller.end();
});
it("bounds queued streaming sentences and ignores streams after End", async () => {
  const speech = deferred<void>(); const spoken: string[] = [];
  const w = world({ speak: async text => { spoken.push(text); await speech.promise; } });
  await w.controller.start(); w.say(); await tick();
  w.controller.stream("run", [{ seq: 2, text: "One. Two. Three. Four. Five. Six. " }]);
  w.controller.end(); speech.resolve(); await tick();
  w.controller.stream("run", [{ seq: 2, text: "More after end. " }]);
  expect(spoken).toEqual(["One."]);
});
it("keeps native capture alive while replying and holds a follow-up until cancellation settles", async () => {
  const cancellation = deferred<void>();
  const w = world({ continuousCapture: true, cancel: () => cancellation.promise });
  await w.controller.start(); w.say(); await tick();
  expect(w.stopped()).toBe(0);
  void w.controller.userSpeech(); w.say(); await tick();
  expect(w.submitted).toEqual(["Hello"]);
  cancellation.resolve(); await tick(); await tick();
  expect(w.submitted).toEqual(["Hello", "Hello"]);
  w.controller.end(); expect(w.stopped()).toBe(1);
});
it("retains a transcript when cancellation is uncertain without submitting overlapping work", async () => {
  const w = world({ continuousCapture: true, cancel: async () => { throw new Error("offline"); } });
  await w.controller.start(); w.say(); await tick();
  void w.controller.userSpeech(); w.say(); await tick();
  expect(w.submitted).toEqual(["Hello"]);
  expect(w.controller.snapshot().pendingTranscript).toBe("Hello");
  await w.controller.start(); expect(w.submitted).toEqual(["Hello"]);
  w.controller.end();
});
it("reacquires native audio before resuming a tracked reply", async () => {
  const ready = world({ continuousCapture: true });
  await ready.controller.start(); ready.say(); await tick(); ready.controller.mute();
  await ready.controller.start();
  expect(ready.controller.snapshot().audio.capture).toBe("listening");
  expect(ready.controller.snapshot().phase).toBe("thinking");
  ready.controller.end();
});
it("serializes cancellation recovery so repeated clicks cannot submit twice", async () => {
  const settled = deferred<void>(); let attempts = 0;
  const w = world({ continuousCapture: true, cancel: async () => { if (++attempts === 1) throw new Error("offline"); await settled.promise; } });
  await w.controller.start(); w.say(); await tick(); void w.controller.userSpeech(); w.say(); await tick();
  const first = w.controller.recoverCancellation(), second = w.controller.recoverCancellation();
  settled.resolve(); await Promise.all([first, second]);
  expect(attempts).toBe(2); expect(w.submitted).toEqual(["Hello", "Hello"]); w.controller.end();
});
it("does not play a native reply after approval until audio is explicitly resumed", async () => {
  const w = world({ continuousCapture: true });
  await w.controller.start(); w.say(); await tick(); w.controller.approval(true); w.controller.approval(false);
  expect(w.controller.snapshot().phase).toBe("muted");
  await w.controller.complete("run", 10, "Answer"); expect(w.spoken).toEqual([]);
  await w.controller.start(); await w.controller.complete("run", 10, "Answer"); expect(w.spoken).toEqual(["Answer"]); w.controller.end();
});
it("replays native speech only after explicit audio resume and never submits microphone input during replay", async () => {
  let attempt = 0;
  const w = world({ continuousCapture: true, speak: async () => { if (++attempt === 1) throw new Error("Synthesis failed"); w.say(); await tick(); } });
  await w.controller.start(); w.say(); await tick(); await w.controller.complete("run", 10, "Answer");
  await w.controller.retrySpeech(); expect(attempt).toBe(1);
  await w.controller.start(); await w.controller.retrySpeech();
  expect(attempt).toBe(2); expect(w.submitted).toEqual(["Hello"]); expect(w.controller.snapshot().phase).toBe("muted");
  w.controller.end();
});
it("releases native capture when an empty transcript reports muted", async () => {
  const w = world({ continuousCapture: true, transcribe: async () => "" });
  await w.controller.start(); w.say(); await tick();
  expect(w.controller.snapshot().phase).toBe("muted"); expect(w.stopped()).toBe(1);
  expect(w.controller.snapshot().audio.capture).toBe("muted"); w.controller.end();
});
