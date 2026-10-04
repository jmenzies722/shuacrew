import { afterEach, beforeEach, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as Array<{ options: { onEvent: (event: unknown) => void; mode?: string }; start: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; press: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn>; acceptHold: ReturnType<typeof vi.fn>; talk: ReturnType<typeof vi.fn>; stopSpeaking: ReturnType<typeof vi.fn> }>);
vi.mock("./live-voice", () => ({ LiveCall: class {
  start = vi.fn();
  press = vi.fn();
  release = vi.fn();
  acceptHold = vi.fn();
  talk = vi.fn();
  stopSpeaking = vi.fn();
  end = vi.fn(() => this.options.onEvent({ type: "state", state: "ended" }));
  sendText = vi.fn(() => true);
  speak = vi.fn(() => true);
  approve = vi.fn();
  done = vi.fn();
  recordText = vi.fn();
  recordResult = vi.fn();
  constructor(public options: { onEvent: (event: unknown) => void }) { calls.push(this); }
} }));
vi.mock("../screens/spark/actions", () => ({ perform: vi.fn(), sparkHooks: {} }));
vi.mock("./buddy", () => ({ doVocabulary: () => "", parseActions: () => [], describeAction: () => "action" }));
vi.mock("./handsfree", () => ({ yesOrNo: (text: string) => text === "yes" ? true : text === "no" ? false : null }));
vi.mock("./paste-hint", () => ({ pasteTarget: () => null, copyForPaste: vi.fn() }));

beforeEach(() => {
  vi.resetModules(); calls.length = 0; vi.useFakeTimers();
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("location", { pathname: "/buddy" });
});
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
afterEach(async () => { const session = await import("./live-session"); session.endLive(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("acquires once and ignores previous-call events", async () => {
  const session = await import("./live-session");
  session.startLive(); session.startLive(); expect(calls).toHaveLength(1);
  session.endLive(); session.startLive();
  calls[0]!.options.onEvent({ type: "state", state: "error", detail: "old" });
  expect(session.getLiveSnapshot().active).toBe(true);
});

it("uses one hold connection across Fn presses and enables Talk only explicitly", async () => {
  const session = await import("./live-session");
  session.liveFn("down"); session.liveFn("hold"); session.liveFn("release");
  expect(calls).toHaveLength(1);
  expect(calls[0]!.options.mode).toBe("hold");
  expect(calls[0]!.acceptHold).toHaveBeenCalledOnce();
  expect(calls[0]!.release).toHaveBeenCalledWith(false);
  session.liveFn("down");
  expect(calls[0]!.press).toHaveBeenCalledOnce();
  expect(calls[0]!.talk).not.toHaveBeenCalled();
  session.startLive();
  expect(calls[0]!.talk).toHaveBeenCalledOnce();
  session.liveFn("release");
  expect(calls[0]!.release).toHaveBeenCalledTimes(1);
});

it("stops playback without ending or replacing the subscription connection", async () => {
  const session = await import("./live-session"); session.startLive();
  session.stopLiveSpeech();
  expect(calls[0]!.stopSpeaking).toHaveBeenCalledOnce();
  expect(calls[0]!.end).not.toHaveBeenCalled();
  expect(calls).toHaveLength(1);
});

it("starts spoken typed requests without microphone capture", async () => {
  const session = await import("./live-session");
  expect(session.queueLiveText("Hello")).toBe(true);
  expect(calls[0]!.options.mode).toBe("silent");
  expect(calls[0]!.talk).not.toHaveBeenCalled();
  calls[0]!.options.onEvent({ type: "state", state: "error", detail: "Connection failed" });
  expect(session.getLiveSnapshot().detail).toContain("Pending messages were not sent");
  expect(session.getLiveSnapshot().feed).toContainEqual({ kind: "line", role: "user", text: "Hello", final: true });
});

it("prepares the native notch and clears a previous setup error on retry", async () => {
  const postMessage = vi.fn();
  Object.assign(window, { webkit: { messageHandlers: { shuacrew: { postMessage } } } });
  const session = await import("./live-session");
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ usable: true }) })));
  session.startLive();
  calls[0]!.options.onEvent({ type: "state", state: "error", detail: "Old failure" });
  session.startLive();
  expect(session.getLiveSnapshot().detail).toBeUndefined();
  await settle(); expect(calls).toHaveLength(2);
  expect(postMessage).toHaveBeenCalledWith({ type: "livePrepare" });
});

it("forwards main-window commands without acquiring media", async () => {
  const postMessage = vi.fn();
  Object.assign(window, { webkit: { messageHandlers: { shuacrew: { postMessage } } } });
  vi.stubGlobal("location", { pathname: "/activity" });
  const session = await import("./live-session"); session.startLive();
  expect(calls).toHaveLength(0);
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "liveCommand", action: "start" }));
});

it("keeps an active task alive past the idle timeout and cancels on end", async () => {
  const session = await import("./live-session"); let signal!: AbortSignal;
  session.registerExecutor(async request => { signal = request.signal; return new Promise(() => {}); });
  session.startLive(); calls[0]!.options.onEvent({ type: "state", state: "listening" });
  calls[0]!.options.onEvent({ type: "task", id: "task", request: "explain" });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(calls[0]!.end).not.toHaveBeenCalled();
  session.endLive(); expect(signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(0);
});

it("lets expired usage and explicit retries reconnect", async () => {
  localStorage.setItem("shuacrew.live.usage", "99");
  const session = await import("./live-session"); expect(session.liveUsable()).toBe(true);
  session.startLive(); calls[0]!.options.onEvent({ type: "state", state: "error" });
  expect(session.liveUsable()).toBe(false);
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ usable: true }) })));
  session.startLive(); await settle(); expect(calls).toHaveLength(2);
});

it("does not publish a whole conversation snapshot for each audio frame", async () => {
  const session = await import("./live-session"); session.startLive();
  const before = session.getLiveSnapshot();
  calls[0]!.options.onEvent({ type: "levels", mic: 0.3, voice: 0.2 });
  expect(session.getLiveSnapshot()).toBe(before);
});

it("ignores out-of-order native snapshots and releases bridge listeners", async () => {
  Object.assign(window, { webkit: { messageHandlers: { shuacrew: { postMessage: vi.fn() } } } });
  vi.stubGlobal("location", { pathname: "/activity" });
  const session = await import("./live-session"), release = session.connectLiveBridge();
  const send = (revision: number, active: boolean) => window.dispatchEvent(new CustomEvent("shuacrew:liveSnapshot", { detail: { revision, snapshot: { active, state: active ? "listening" : "ended", feed: [], mic: 0, voice: 0 } } }));
  send(2, true); send(1, false); expect(session.getLiveSnapshot().active).toBe(true);
  release(); send(3, false); expect(session.getLiveSnapshot().active).toBe(true);
});

it("denies a local approval on end and ignores a late yes", async () => {
  const session = await import("./live-session");
  const { sparkHooks } = await import("../screens/spark/actions");
  let allowed: boolean | undefined;
  session.registerExecutor(async () => { allowed = await sparkHooks.confirmDelete!("Delete a test item"); return { status: "cancelled", summary: "Not run", outcomes: [] }; });
  session.startLive(); calls[0]!.options.onEvent({ type: "task", id: "one", request: "delete" });
  await vi.advanceTimersByTimeAsync(0);
  expect(session.getLiveSnapshot().approval).toBeDefined(); session.endLive();
  calls[0]!.options.onEvent({ type: "caption", role: "user", text: "yes", final: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(allowed).toBe(false); expect(vi.getTimerCount()).toBe(0);
});

it("routes typed call prompts through the executor and publishes its real result", async () => {
  const session = await import("./live-session"), execute = vi.fn(async () => ({ status: "completed" as const, summary: "The lesson is ready.", outcomes: [], visualId: "lesson" }));
  session.registerExecutor(execute); session.startLive();
  calls[0]!.options.onEvent({ type: "state", state: "listening" });
  expect(session.sendLiveText("Build a lesson")).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ text: "Build a lesson" }));
  expect(session.getLiveSnapshot().feed).toEqual(expect.arrayContaining([{ kind: "result", text: "The lesson is ready." }]));
});


it("while Codex is at its limit, a press says so at once and opens no call", async () => {
  const resetsAt = new Date(2026, 9, 9, 20, 28).getTime();
  localStorage.setItem("shuacrew.live.down", String(resetsAt));
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ usable: false, resetsAt }) })));
  const session = await import("./live-session");
  session.startLive("hold"); await settle();
  expect(calls).toHaveLength(0);
  expect(session.getLiveSnapshot().state).toBe("error");
  expect(session.getLiveSnapshot().detail).toMatch(/Codex voice is at its usage limit until/);
});

it("once Codex allows calls again, the same press connects", async () => {
  localStorage.setItem("shuacrew.live.down", String(Date.now() + 86_400_000));
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ usable: true, usedPercent: 0 }) })));
  const session = await import("./live-session");
  session.startLive("hold"); await settle();
  expect(calls).toHaveLength(1);
  expect(session.liveUsable()).toBe(true);
});
