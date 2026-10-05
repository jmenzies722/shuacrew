import { afterEach, expect, it, vi } from "vitest";
import { LiveCall } from "./live-voice";
const narration = vi.hoisted(() => ({ say: vi.fn(), stop: vi.fn(), dispose: vi.fn(), beginTurn: vi.fn(), unlock: vi.fn(), queue: {} as { onCaption?: (line: { text: string } | null) => void; onSpeaking?: (on: boolean) => void } }));
vi.mock("./buddy-voice", () => ({ SpeechQueue: class {
  constructor() { narration.queue = this; }
  onCaption?: (line: { text: string } | null) => void;
  onSpeaking?: (on: boolean) => void;
  unlock = narration.unlock;
  say = narration.say; stop = narration.stop; dispose = narration.dispose; beginTurn = narration.beginTurn;
  level = () => 0;
} }));

it("does not synthesize call transcripts through the local voice", async () => {
  const wire = host(), onEvent = vi.fn();
  const call = new LiveCall({ onEvent });
  await call.start();
  expect(narration.unlock).not.toHaveBeenCalled();
  wire.receive({ type: "transcript", role: "assistant", text: "Ready." });
  expect(onEvent).not.toHaveBeenCalledWith({ type: "playback", text: "Ready." });
  expect(narration.say).not.toHaveBeenCalled();
  call.end();
});

it("holds assistant captions until native audio is measured", async () => {
  const wire = host(), onEvent = vi.fn(), call = new LiveCall({ onEvent });
  await call.start(); wire.ready();
  wire.receive({ type: "delta", role: "assistant", text: "Hello" });
  expect(onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "caption", role: "assistant" }));
  wire.level(0.04); await vi.advanceTimersByTimeAsync(50);
  expect(onEvent).toHaveBeenCalledWith({ type: "caption", role: "assistant", text: "Hello", final: false });
  call.end();
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("never opens a microphone for spoken typed replies", async () => {
  host();
  const acquire = vi.spyOn(navigator.mediaDevices, "getUserMedia");
  const call = new LiveCall({ mode: "silent", onEvent: () => {} });
  await call.start();
  expect(acquire).not.toHaveBeenCalled();
  call.end();
});

it("closes hold capture immediately on release and does not reopen on service readiness", async () => {
  const stop = vi.fn();
  const wire = host(Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream));
  const onEvent = vi.fn(), call = new LiveCall({ mode: "hold", onEvent });
  await call.start(); call.acceptHold(); call.release();
  expect(stop).toHaveBeenCalledOnce();
  wire.ready();
  expect(onEvent).toHaveBeenCalledWith({ type: "state", state: "ready", detail: undefined });
  expect(onEvent.mock.calls.filter(([event]) => event.type === "capture").at(-1)?.[0]).toMatchObject({ on: false, mode: "hold" });
  call.end();
});

it("discards a late microphone after Fn release during setup", async () => {
  let resolve!: (stream: MediaStream) => void;
  const pending = new Promise<MediaStream>(done => { resolve = done; });
  host(pending);
  const stop = vi.fn(), onEvent = vi.fn(), call = new LiveCall({ mode: "hold", onEvent });
  const starting = call.start();
  call.acceptHold(); call.release();
  resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  await starting;
  expect(stop).toHaveBeenCalledOnce();
  expect(onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "capture", on: true }));
  call.end();
});
it("narrates commands through the native connection, not a second voice", async () => {
  const wire = host(), call = new LiveCall({ onEvent: () => {} });
  expect(call.announce("Run tests")).toBe(false);
  await call.start(); wire.ready();
  expect(call.announce("Eli requested to run the tests.")).toBe(true);
  expect(wire).toContainEqual({ type: "say", text: "Eli requested to run the tests." });
  expect(narration.say).not.toHaveBeenCalled();
  call.end();
  expect(call.announce("Late announcement")).toBe(false);
});

function host(acquire = Promise.resolve({ getTracks: () => [], getAudioTracks: () => [] } as unknown as MediaStream)) {
  vi.clearAllMocks();
  vi.useFakeTimers();
  const sent: unknown[] = [];
  let socket: { onmessage?: (event: { data: string }) => void };
  let peer: { ontrack?: (event: { streams: unknown[] }) => void; connectionState?: string; onconnectionstatechange?: () => void };
  const events: { onmessage?: (event: { data: string }) => void } = {};
  let analyserCount = 0, remoteLevel = 0;
  const node = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), fftSize: 8, getFloatTimeDomainData: vi.fn(), stream: { getAudioTracks: () => [{}] } };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => acquire } });
  vi.stubGlobal("location", { protocol: "http:", host: "localhost" });
  vi.stubGlobal("AudioContext", class {
    sampleRate = 10;
    close = vi.fn(async () => {});
    createMediaStreamDestination = () => node;
    createMediaStreamSource = () => node;
    createAnalyser = () => { const voice = analyserCount++ > 0; return { ...node, getFloatTimeDomainData: (buffer: Float32Array) => buffer.fill(voice ? remoteLevel : 0) }; };
    createScriptProcessor = () => ({ ...node });
    createBufferSource = () => ({ ...node });
    createBuffer = () => ({ getChannelData: () => new Float32Array(20) });
  });
  vi.stubGlobal("RTCPeerConnection", class {
    ontrack?: (event: { streams: unknown[] }) => void;
    constructor() { peer = this; }
    iceGatheringState = "complete";
    localDescription = { sdp: "offer" };
    addTrack() {}
    createDataChannel() { return events; }
    async createOffer() { return {}; }
    async setLocalDescription() {}
    close() {}
  });
  vi.stubGlobal("WebSocket", class {
    static OPEN = 1;
    readyState = 1;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    constructor() { socket = this; Promise.resolve().then(() => this.onopen?.()); }
    send(text: string) { sent.push(JSON.parse(text)); }
    close() { this.readyState = 3; }
  });
  return Object.assign(sent, { level: (value: number) => { remoteLevel = value; }, receive: (message: unknown) => socket.onmessage?.({ data: JSON.stringify(message) }), ready: () => events.onmessage?.({ data: JSON.stringify({ type: "session.started" }) }), track: () => peer.ontrack?.({ streams: [{}] }), connection: (state: string) => { peer.connectionState = state; peer.onconnectionstatechange?.(); } });
}

it("reports a persistent media disconnect instead of silently remaining listening", async () => {
  const wire = host(), onEvent = vi.fn(), call = new LiveCall({ onEvent });
  await call.start(); wire.ready();
  wire.connection("disconnected");
  await vi.advanceTimersByTimeAsync(5000);
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "state", state: "error", detail: expect.stringMatching(/connection/i) }));
  expect(call.sendText("should not send on a broken call")).toBe(false);
  call.end();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps the same call when a brief media disconnect recovers", async () => {
  const wire = host(), onEvent = vi.fn(), call = new LiveCall({ onEvent });
  await call.start(); wire.ready();
  wire.connection("disconnected");
  await vi.advanceTimersByTimeAsync(2000);
  wire.connection("connected");
  await vi.advanceTimersByTimeAsync(4000);
  expect(onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "state", state: "error" }));
  expect(call.sendText("same connection")).toBe(true);
  call.end();
  expect(vi.getTimerCount()).toBe(0);
});

it("plays native audio and immediately silences it on Stop without reconnecting", async () => {
  const wire = host(), audio = { muted: false, autoplay: false, srcObject: null, play: vi.fn(async () => {}), pause: vi.fn() };
  vi.stubGlobal("Audio", class { constructor() { return audio; } });
  const call = new LiveCall({ onEvent: () => {} });
  await call.start(); wire.track();
  expect(audio.muted).toBe(false);
  wire.receive({ type: "delta", role: "assistant", text: "Twelve. " });
  wire.receive({ type: "transcript", role: "assistant", text: "Twelve." });
  expect(narration.say).not.toHaveBeenCalled();
  call.stopSpeaking();
  expect(audio.muted).toBe(true);
  expect(audio.srcObject).toBeNull();
  expect(wire).not.toContainEqual({ type: "stop" });
  expect(call.sendText("Still connected")).toBe(true);
  call.end();
  expect(narration.dispose).not.toHaveBeenCalled();
});

it("sends distinct user text and spoken announcements", async () => {
  const sent = host(), call = new LiveCall({ onEvent: () => {} });
  await call.start();
  expect(call.sendText("user question")).toBe(true);
  expect(call.speak("approval question")).toBe(true);
  expect(sent.slice(-2)).toEqual([{ type: "text", text: "user question" }, { type: "say", text: "approval question" }]);
  call.end();
});

it("waits for a visible document before requesting the microphone and cancels the wait", async () => {
  host();
  const page = Object.assign(new EventTarget(), { hidden: true });
  vi.stubGlobal("document", page);
  const acquire = vi.spyOn(navigator.mediaDevices, "getUserMedia");
  const call = new LiveCall({ onEvent: () => {} });
  const starting = call.start();
  expect(acquire).not.toHaveBeenCalled();
  call.end(); await starting;
  page.hidden = false; page.dispatchEvent(new Event("visibilitychange"));
  expect(acquire).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("acquires once when a hidden notch becomes visible", async () => {
  host();
  const page = Object.assign(new EventTarget(), { hidden: true });
  vi.stubGlobal("document", page);
  const acquire = vi.spyOn(navigator.mediaDevices, "getUserMedia");
  const call = new LiveCall({ onEvent: () => {} });
  const starting = call.start();
  page.hidden = false; page.dispatchEvent(new Event("visibilitychange"));
  await starting;
  page.dispatchEvent(new Event("visibilitychange"));
  expect(acquire).toHaveBeenCalledTimes(1);
  call.end();
  expect(vi.getTimerCount()).toBe(0);
});

it("ends a call that never opens its socket instead of hanging forever", async () => {
  host();
  vi.stubGlobal("WebSocket", class { static OPEN = 1; readyState = 0; close() {} });
  const onEvent = vi.fn(), call = new LiveCall({ onEvent });
  const pending = call.start();
  await vi.advanceTimersByTimeAsync(20_000);
  await pending;
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "state", state: "error" }));
  expect(vi.getTimerCount()).toBe(0);
});

it("does not send before connection or after termination", async () => {
  const sent = host(), call = new LiveCall({ onEvent: () => {} });
  expect(call.sendText("early")).toBe(false);
  await call.start(); call.end();
  const count = sent.length;
  expect(call.speak("late")).toBe(false);
  call.done("old", "done"); call.approve("old", true);
  expect(sent).toHaveLength(count);
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds setup when the service never returns an answer", async () => {
  host();
  const onEvent = vi.fn(), call = new LiveCall({ onEvent });
  await call.start();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "state", state: "error" }));
  expect(vi.getTimerCount()).toBe(0);
});

it("releases a microphone that arrives after cancellation", async () => {
  let resolve!: (stream: MediaStream) => void;
  const pending = new Promise<MediaStream>(done => { resolve = done; });
  const sent = host(pending), stop = vi.fn(), call = new LiveCall({ onEvent: () => {} });
  const starting = call.start(); call.end();
  resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  await starting;
  expect(stop).toHaveBeenCalledTimes(1);
  expect(sent).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not inject a stop request or mute playback when Fn starts an idle warm turn", async () => {
  const wire = host(), onEvent = vi.fn(), call = new LiveCall({ mode: "hold", onEvent });
  await call.start(); call.acceptHold(); call.release(); wire.ready();
  call.press();
  expect(wire.filter(message => (message as { type: string }).type === "text")).toEqual([]);
  expect(onEvent).not.toHaveBeenCalledWith({ type: "muted", on: true });
  call.end();
});

it("still silences audible output immediately when Fn interrupts", async () => {
  const wire = host(), onEvent = vi.fn(), call = new LiveCall({ mode: "hold", onEvent });
  await call.start(); call.acceptHold(); call.release(); wire.ready();
  wire.level(.04); await vi.advanceTimersByTimeAsync(50);
  call.press();
  expect(onEvent).toHaveBeenCalledWith({ type: "muted", on: true });
  expect(wire).toContainEqual(expect.objectContaining({ type: "text", text: expect.stringContaining("Stop speaking") }));
  call.end();
});

it("shares a pending microphone open across rapid release and re-press", async () => {
  let resolve!: (stream: MediaStream) => void;
  const pending = new Promise<MediaStream>(done => {resolve=done;});
  host(pending);
  const acquire=vi.spyOn(navigator.mediaDevices,"getUserMedia"), stop=vi.fn(), onEvent=vi.fn();
  const call=new LiveCall({mode:"silent",onEvent});
  await call.start();
  call.press(); call.acceptHold();
  await Promise.resolve();
  call.release(); call.press(); call.acceptHold();
  await Promise.resolve();
  expect(acquire).toHaveBeenCalledTimes(1);
  resolve({getTracks:()=>[{stop}]} as unknown as MediaStream);
  await vi.advanceTimersByTimeAsync(0);
  expect(stop).not.toHaveBeenCalled();
  expect(onEvent.mock.calls.filter(([e])=>e.type === "capture" && e.on)).toHaveLength(1);
  call.release(); expect(stop).toHaveBeenCalledTimes(1); call.end();
});
