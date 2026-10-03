import { afterEach, expect, it, vi } from "vitest";
import { SpeechQueue } from "./buddy-voice";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function audioEnvironment(decode = async () => ({ duration: 1 })) {
  const starts: number[] = [];
  class AudioContext {
    currentTime = 0;
    state = "running";
    destination = {};
    close() { this.state = "closed"; return Promise.resolve(); }
    decodeAudioData = decode;
    createGain() { return { connect() {}, gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} } }; }
    createAnalyser() { return { fftSize: 1024 }; }
    createBufferSource() {
      const source = { onended: null as (() => void) | null, connect() {}, disconnect() {}, stop() { queueMicrotask(() => source.onended?.()); }, start(at: number) { starts.push(at); } };
      return source;
    }
  }
  vi.stubGlobal("AudioContext", AudioContext);
  return starts;
}
function response(body: string, done = true) {
  const request = JSON.parse(body);
  return new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "audio", id: request.id, generation: 1, data: "AA==" }) + "\n"));
    if (done) controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "done", id: request.id, generation: 1 }) + "\n"));
    controller.close();
  } }));
}

it("does not replay a sentence after its first audio chunk has already played", async () => {
  vi.useFakeTimers();
  const starts = audioEnvironment();
  vi.stubGlobal("fetch", async (_url: string, options: { body: string }) => response(options.body, false));
  const queue = new SpeechQueue();
  queue.say("A partially generated answer.");
  await vi.waitFor(() => expect(starts.length).toBeGreaterThan(0));
  await vi.advanceTimersByTimeAsync(100);
  expect(starts).toHaveLength(1);
  queue.stop();
});


it("ignores audio decoded after the user stops a reply", async () => {
  vi.useFakeTimers();
  let finish!: (value: { duration: number }) => void;
  let decoding = false;
  const starts = audioEnvironment(() => { decoding = true; return new Promise(resolve => { finish = resolve; }); });
  vi.stubGlobal("fetch", async (_url: string, options: { body: string }) => response(options.body));
  const queue = new SpeechQueue();
  queue.say("This reply was interrupted.");
  await vi.waitFor(() => expect(decoding).toBe(true));
  queue.stop();
  queue.say("The new reply.");
  finish({ duration: 1 });
  await vi.advanceTimersByTimeAsync(100);
  expect(starts).toEqual([]);
  queue.stop();
});


it("does not start a follow-up over a long spoken reply when its wait expires", async () => {
  vi.useFakeTimers();
  audioEnvironment();
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  const queue = new SpeechQueue();
  queue.say("A long reply.");
  const follow = vi.fn();
  queue.whenQuiet(follow, 1000);
  await vi.advanceTimersByTimeAsync(1200);
  expect(follow).not.toHaveBeenCalled();
  queue.stop();
});


it("cancels a waiting follow-up when the user stops speech", async () => {
  vi.useFakeTimers();
  audioEnvironment();
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  const queue = new SpeechQueue(), follow = vi.fn();
  queue.say("A pending reply.");
  queue.whenQuiet(follow);
  queue.stop();
  await vi.advanceTimersByTimeAsync(500);
  expect(follow).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  queue.stop();
});


it("starts the replacement reply even when cancelled audio decoding is still pending", async () => {
  vi.useFakeTimers();
  const pending: Array<(value: { duration: number }) => void> = [];
  let decoding = 0;
  const starts = audioEnvironment(() => {
    decoding++;
    return decoding <= 2 ? new Promise(resolve => pending.push(resolve)) : Promise.resolve({ duration: 1 });
  });
  vi.stubGlobal("fetch", async (_url: string, options: { body: string }) => response(options.body));
  const queue = new SpeechQueue();
  queue.say("Old first sentence."); queue.say("Old second sentence.");
  await vi.advanceTimersByTimeAsync(0);
  expect(pending).toHaveLength(2);
  queue.stop(); queue.say("Replacement reply.");
  await vi.advanceTimersByTimeAsync(300);
  expect(starts).toHaveLength(1);
  pending.forEach(resolve => resolve({ duration: 1 }));
  await vi.advanceTimersByTimeAsync(300);
  expect(starts).toHaveLength(1);
  queue.stop();
});


it("schedules sentences contiguously in their original order despite reversed generation", async () => {
  vi.useFakeTimers();
  const starts = audioEnvironment();
  let finishFirst!: () => void;
  vi.stubGlobal("fetch", async (_url: string, options: { body: string }) => {
    if (JSON.parse(options.body).text === "First sentence.") await new Promise<void>(resolve => { finishFirst = resolve; });
    return response(options.body);
  });
  const queue = new SpeechQueue(), captions: string[] = [];
  queue.onCaption = caption => { if (caption) captions.push(caption.text); };
  queue.say("First sentence."); queue.say("Second sentence.");
  await vi.advanceTimersByTimeAsync(0);
  expect(starts).toEqual([]);
  finishFirst();
  await vi.advanceTimersByTimeAsync(1500);
  expect(starts).toEqual([0.18, 1.18]);
  expect(captions).toEqual(["First sentence.", "Second sentence."]);
  queue.stop();
});
