import { expect, it } from "vitest";
import { validateManifest, validateSpeechRequest, SpeechService } from "./speech.js";
import { fileURLToPath } from "node:url";
import manifest from "../speech/manifest.json" with { type: "json" };
import { EventStore } from "./store.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

it("rejects empty, duplicate, foreign-language and unsafe manifests", () => {
  expect(validateManifest(manifest).voices).toHaveLength(4);
  for (const voices of [[], [manifest.voices[0], manifest.voices[0]], [{ ...manifest.voices[0], accent: "fr-FR" }]]) expect(() => validateManifest({ ...manifest, voices })).toThrow();
  expect(() => validateManifest({ ...manifest, models: { ...manifest.models, qwen: { ...manifest.models.qwen, directory: "../bad" } } })).toThrow();
});
it("protects speech routes and validates requests before starting synthesis", async () => {
  const store = new EventStore(":memory:");
  const supervisor = new Supervisor(store, new Map(), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-speech-")) });
  const speech = new SpeechService({ home: "/tmp", command: process.execPath, args: [fileURLToPath(new URL("./fixtures/speech-worker.mjs", import.meta.url))] });
  const { app } = await createServer({ store, supervisor, runtimes: new Map(), speech });
  try {
    expect((await app.inject({ method: "POST", url: "/api/speech/synthesize", payload: {} })).statusCode).toBe(403);
    const post = (body: unknown) => app.inject({ method: "POST", url: "/api/speech/synthesize", headers: { "x-shuacrew": "1" }, payload: body as object });
    const input = { id: "route", generation: 1, voiceId: "aiden", text: "Hello", speed: 1 };
    expect((await post({ ...input, voiceId: "../../bad" })).statusCode).toBe(400);
    expect((await post({ ...input, text: "x".repeat(601) })).statusCode).toBe(400);
    const response = await post(input);
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.trim().split("\n").map(line => JSON.parse(line).type)).toEqual(["audio", "done"]);
    const status = await app.inject("/api/speech/status");
    expect(status.json().voices.map((v: { accent: string }) => v.accent)).toEqual(["en-US", "en-US", "en-GB", "en-GB"]);
  } finally { await app.close(); supervisor.shutdown(); store.close(); speech.close(); }
});
it("recovers after crash, malformed protocol and timeout without accepting stale audio", async () => {
  // Includes spawning Node: allow scheduling headroom when the full suite runs concurrently.
  const service = new SpeechService({ home: "/tmp", timeoutMs: 1000, command: process.execPath, args: [fileURLToPath(new URL("./fixtures/speech-worker.mjs", import.meta.url))] });
  const consume = async (text: string) => { const types = []; for await (const c of service.synthesize({ id: text, generation: 1, voiceId: "aiden", text, speed: 1 }, new AbortController().signal)) types.push(c.type); return types; };
  try {
    for (const [text, error] of [["crash", /process stopped/], ["malformed", /JSON/], ["hang", /timed out/]] as const) {
      await expect(consume(text)).rejects.toThrow(error);
      expect(await consume("Hello")).toEqual(["audio", "done"]);
    }
  } finally { service.close(); }
});
it("limits synthesis input and rejects unknown voice IDs", () => {
  const input = { id: "preview", generation: 1, voiceId: "aiden", text: "Hello", speed: 1 };
  expect(validateSpeechRequest(input, validateManifest(manifest)).text).toBe("Hello");
  for (const change of [{ text: "a".repeat(601) }, { voiceId: "Daniel" }, { speed: 9 }, { generation: -1 }]) expect(() => validateSpeechRequest({ ...input, ...change }, validateManifest(manifest))).toThrow();
});
it("warms a selected engine without returning audible chunks", async () => {
  const service = new SpeechService({ home: "/tmp", command: process.execPath, args: [fileURLToPath(new URL("./fixtures/speech-worker.mjs", import.meta.url))] });
  try { await expect(service.warm("aiden", new AbortController().signal)).resolves.toEqual({ ready: true }); }
  finally { service.close(); }
});
it("rejects unbounded warm retention before starting a worker", async () => {
  const service = new SpeechService({ home: "/tmp", command: "must-not-run" });
  try { await expect(service.warm("aiden", new AbortController().signal, 999)).rejects.toThrow(/retention/i); }
  finally { service.close(); }
});
it("streams bounded audio, cancels a stuck worker and can start again", async () => {
  const service = new SpeechService({ home: "/tmp", command: process.execPath, args: [fileURLToPath(new URL("./fixtures/speech-worker.mjs", import.meta.url))] });
  try {
    const input = { id: "a", generation: 1, voiceId: "aiden", text: "Hello", speed: 1 };
    const chunks = [];
    for await (const chunk of service.synthesize(input, new AbortController().signal)) chunks.push(chunk);
    expect(chunks.map(c => c.type)).toEqual(["audio", "done"]);
    const abort = new AbortController();
    const waiting = (async () => { for await (const _ of service.synthesize({ ...input, id: "b", text: "hang" }, abort.signal)) {} })();
    setTimeout(() => abort.abort(), 40);
    await expect(waiting).rejects.toThrow();
    const after = [];
    for await (const chunk of service.synthesize({ ...input, id: "c" }, new AbortController().signal)) after.push(chunk.type);
    expect(after).toEqual(["audio", "done"]);
  } finally { service.close(); }
});
