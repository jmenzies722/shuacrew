import { afterEach, expect, it, vi } from "vitest";
import { NativeVoice } from "./native-voice";

afterEach(() => vi.unstubAllGlobals());
function host() {
  const events = new EventTarget();
  const messages: Record<string, unknown>[] = [];
  vi.stubGlobal("window", Object.assign(events, { webkit: { messageHandlers: { shuacrew: { postMessage: (message: Record<string, unknown>) => messages.push(message) } } } }));
  return { messages, emit: (detail: Record<string, unknown>) => events.dispatchEvent(new CustomEvent("shuacrew:voiceAudio", { detail })) };
}
it("ends a pending native acquisition and ignores late utterances", async () => {
  const h = host(), audio = new NativeVoice(), abort = new AbortController(), heard: Blob[] = [];
  const start = audio.start(abort.signal, b => heard.push(b), () => {}, () => {}, () => {});
  const request = h.messages[0]!;
  h.emit({ kind: "starting", sessionId: request.sessionId, generation: 1, requestId: request.requestId });
  abort.abort();
  await expect(start).rejects.toThrow();
  h.emit({ kind: "utterance", sessionId: request.sessionId, generation: 1, wav: "aGVsbG8=" });
  expect(heard).toEqual([]);
  expect(h.messages.at(-1)).toMatchObject({ action: "end", generation: 1 });
});
it("does not accept readiness from another session", async () => {
  const h = host(), audio = new NativeVoice(), abort = new AbortController();
  let ready = false;
  const start = audio.start(abort.signal, () => {}, () => {}, () => {}, () => {}).then(release => { ready = true; return release; });
  const request = h.messages[0]!;
  h.emit({ kind: "ready", sessionId: "other", generation: 1, requestId: request.requestId });
  await Promise.resolve(); expect(ready).toBe(false);
  h.emit({ kind: "starting", sessionId: request.sessionId, generation: 2, requestId: request.requestId });
  h.emit({ kind: "ready", sessionId: request.sessionId, generation: 2, requestId: request.requestId });
  const release = await start; expect(ready).toBe(true); release();
});
it("cancels acquisition even before native reports its generation", async () => {
  const h = host(), audio = new NativeVoice(), abort = new AbortController();
  const start = audio.start(abort.signal, () => {}, () => {}, () => {}, () => {});
  abort.abort(); await expect(start).rejects.toThrow();
  expect(h.messages.at(-1)).toMatchObject({ action: "cancelStart", sessionId: h.messages[0]!.sessionId });
});
