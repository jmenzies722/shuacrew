import { afterEach, expect, it, vi } from "vitest";
import { HandsFree } from "./handsfree";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function environment() {
  const processors: Array<{ onaudioprocess?: (event: { inputBuffer: { getChannelData: () => Float32Array } }) => void }> = [];
  const mediaDevices = new EventTarget();
  const tracks: Array<EventTarget & { stop: ReturnType<typeof vi.fn> }> = [];
  const capture = async () => {
    const track = Object.assign(new EventTarget(), { stop: vi.fn() });
    tracks.push(track);
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  };
  const getUserMedia = vi.fn(capture);
  Object.assign(mediaDevices, { getUserMedia, enumerateDevices: async () => [] });
  vi.stubGlobal("navigator", { mediaDevices });
  vi.stubGlobal("AudioContext", class {
    sampleRate = 48000;
    state = "running";
    destination = {};
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { const processor = { onaudioprocess: undefined as typeof processors[number]["onaudioprocess"], connect() {}, disconnect() {} }; processors.push(processor); return processor; }
    async close() {}
    async resume() {}
  });
  return { mediaDevices, tracks, getUserMedia, capture, processors };
}

it("closes push-to-talk capture before transcription completes", async () => {
  const env = environment();
  vi.useFakeTimers();
  let complete!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { complete = resolve; })));
  const mic = new HandsFree(), onTurn = vi.fn();
  let level = 0;
  mic.onLevel = value => { level = value; };
  mic.mode = "hold"; mic.onTurn = onTurn;
  await mic.press();
  for (let frame = 0; frame < 24; frame++) env.processors[0]?.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0.1) } });
  expect(level).toBeGreaterThan(0);
  mic.release();
  await vi.advanceTimersByTimeAsync(HandsFree.TAIL_MS);
  expect(env.tracks[0]!.stop).toHaveBeenCalledOnce();
  expect(level).toBe(0);
  expect(onTurn).not.toHaveBeenCalled();
  complete(new Response(JSON.stringify({ text: "Explain the result" })));
  await vi.advanceTimersByTimeAsync(0);
  expect(onTurn).toHaveBeenCalledWith("Explain the result");
  mic.stop();
});

it("releases a microphone that opens after listening was stopped", async () => {
  const env = environment();
  let release!: (stream: Awaited<ReturnType<typeof env.capture>>) => void;
  env.getUserMedia.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const mic = new HandsFree();
  const starting = mic.start();
  await vi.waitFor(() => expect(release).toBeDefined());
  mic.stop();
  release(await env.capture());
  await starting;
  expect(mic.active).toBe(false);
  expect(env.tracks[0]!.stop).toHaveBeenCalledOnce();
});

it("recovers listening when the selected microphone disconnects", async () => {
  vi.useFakeTimers();
  const env = environment();
  const mic = new HandsFree();
  await mic.start();
  env.tracks[0]!.dispatchEvent(new Event("ended"));
  await vi.advanceTimersByTimeAsync(1000);
  expect(env.tracks).toHaveLength(2);
  expect(mic.active).toBe(true);
  mic.stop();
  env.mediaDevices.dispatchEvent(new Event("devicechange"));
  await vi.advanceTimersByTimeAsync(1000);
  expect(mic.active).toBe(false);
  expect(env.tracks).toHaveLength(2);
});

it("resumes after a temporarily unavailable device returns without restarting voice mode", async () => {
  vi.useFakeTimers();
  const env = environment();
  const mic = new HandsFree();
  await mic.start();
  env.getUserMedia.mockRejectedValueOnce(new DOMException("Device unavailable", "NotFoundError"));
  env.tracks[0]!.dispatchEvent(new Event("ended"));
  await vi.advanceTimersByTimeAsync(500);
  expect(mic.active).toBe(false);
  env.mediaDevices.dispatchEvent(new Event("devicechange"));
  await vi.advanceTimersByTimeAsync(500);
  expect(mic.active).toBe(true);
  mic.stop();
  expect(vi.getTimerCount()).toBe(0);
});

it("releases capture and reports an error when audio graph setup fails", async () => {
  const env = environment();
  vi.stubGlobal("AudioContext", class { constructor() { throw new Error("Audio device unavailable"); } });
  const mic = new HandsFree(), phase = vi.fn();
  mic.onPhase = phase;
  await expect(mic.start()).resolves.toBeUndefined();
  expect(mic.active).toBe(false);
  expect(env.tracks[0]!.stop).toHaveBeenCalledOnce();
  expect(phase).toHaveBeenLastCalledWith("error", expect.any(String));
  mic.stop();
});

it("releases capture and recovery timers across 100 disconnect cycles", async () => {
  vi.useFakeTimers();
  const env = environment();
  for (let index = 0; index < 100; index++) {
    const mic = new HandsFree();
    await mic.start();
    env.tracks.at(-1)!.dispatchEvent(new Event("ended"));
    await vi.advanceTimersByTimeAsync(500);
    expect(mic.active).toBe(true);
    mic.stop();
  }
  env.mediaDevices.dispatchEvent(new Event("devicechange"));
  await vi.advanceTimersByTimeAsync(500);
  expect(env.tracks).toHaveLength(200);
  expect(env.tracks.every(track => track.stop.mock.calls.length === 1)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
