import { expect, it } from "vitest";
import { readSpeechStream } from "./speech-stream";

const stream = (...parts: string[]) => new ReadableStream<Uint8Array>({ start(c) { parts.forEach(p => c.enqueue(new TextEncoder().encode(p))); c.close(); } });
it("decodes split lines and rejects errors or truncated speech", async () => {
  const received: string[] = [];
  await readSpeechStream(stream('{"type":"audio","id":"a","generation":1,"data":"UklG', 'Rg=="}\n{"type":"done","id":"a","generation":1}\n'), { id: "a", generation: 1 }, new AbortController().signal, async b => { received.push(new TextDecoder().decode(b)); });
  expect(received).toEqual(["RIFF"]);
  await expect(readSpeechStream(stream('{"type":"error","error":"Unavailable"}\n'), { id: "a", generation: 1 }, new AbortController().signal, async () => {})).rejects.toThrow("Unavailable");
  await expect(readSpeechStream(stream(""), { id: "a", generation: 1 }, new AbortController().signal, async () => {})).rejects.toThrow(/ended/);
});
it("never delivers cancelled or mismatched audio", async () => {
  const abort = new AbortController(); abort.abort();
  const received: ArrayBuffer[] = [];
  const audio = '{"type":"audio","id":"a","generation":1,"data":"UklGRg=="}\n';
  await expect(readSpeechStream(stream(audio), { id: "a", generation: 1 }, abort.signal, async b => { received.push(b); })).rejects.toThrow();
  await expect(readSpeechStream(stream(audio), { id: "b", generation: 2 }, new AbortController().signal, async b => { received.push(b); })).rejects.toThrow(/Unexpected/);
  expect(received).toEqual([]);
});
