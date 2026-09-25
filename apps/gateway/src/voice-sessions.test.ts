import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { fold } from "@shuacrew/core";
import { MockRuntime } from "@shuacrew/runtimes";
import { EventStore } from "./store.js";
import { Crew } from "./crew.js";
import { Supervisor } from "./runs.js";
import { VoiceSessions } from "./voice-sessions.js";
import { createServer } from "./server.js";

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(f => f()));
function world() {
  const store = new EventStore(":memory:");
  const crew = new Crew(store);
  const runtime = Object.assign(Object.create(new MockRuntime({ pace: 0 })), { id: "claude" }) as MockRuntime;
  const runtimes = new Map([["claude", runtime]]);
  const supervisor = new Supervisor(store, runtimes, { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-voice-")), crew, concurrency: { claude: 0 } });
  const sessions = new VoiceSessions(store, supervisor, crew, runtimes);
  cleanup.push(() => { supervisor.shutdown(); crew.stop(); store.close(); });
  sessions.initialize("claude");
  return { sessions, store, crew, supervisor, runtimes };
}
it("accepts an utterance once across controller recreation and rejects changed retry", () => {
  const { sessions, store, crew, supervisor, runtimes } = world();
  const input = { requestId: randomUUID(), memberId: "shua", runtime: "claude", text: "Hello" };
  const first = sessions.submit(input);
  const reopened = new VoiceSessions(store, supervisor, crew, runtimes);
  expect(reopened.submit(input)).toEqual(first);
  expect(Object.values(fold(store.read(0)).runs)).toHaveLength(1);
  expect(() => sessions.submit({ ...input, text: "Different" })).toThrow(/already/);
});
it("exposes supervised voice sessions and preserves saved voice through crew updates", async () => {
  const w = world();
  const { app } = await createServer({ ...w });
  cleanup.push(() => { void app.close(); });
  const post = (url: string, payload: object) => app.inject({ method: "POST", url, headers: { "x-shuacrew": "1" }, payload });
  const response = await post("/api/voice/utterances", { requestId: randomUUID(), memberId: "shua", runtime: "claude", text: "hello" });
  expect(response.statusCode).toBe(200);
  expect(response.json().after).toBeGreaterThan(0);
  const member = w.crew.get("shua")!;
  const voice = { voiceId: "aiden", speed: 1, personality: "warm" };
  expect((await post("/api/crew", { ...member, voice })).statusCode).toBe(200);
  expect(w.crew.get("shua")?.voice).toEqual(voice);
  expect((await post("/api/crew", { ...member, voice: { ...voice, voiceId: "daniel" } })).statusCode).toBe(400);
});
it("refuses busy, autopilot and wrong-member sessions without changing the log", () => {
  const { sessions, store } = world();
  const runId = sessions.submit({ requestId: randomUUID(), memberId: "shua", runtime: "claude", text: "hello" }).runId;
  const input = { requestId: randomUUID(), runId, memberId: "shua", runtime: "claude", text: "yes" };
  expect(() => sessions.submit(input)).toThrow(/busy/);
  store.append("run.status", { status: "done" }, { run: runId });
  store.append("run.permission", { mode: "auto" }, { run: runId });
  const head = store.head;
  expect(() => sessions.submit(input)).toThrow(/supervised/);
  expect(() => sessions.submit({ ...input, memberId: "stranger" })).toThrow();
  expect(store.head).toBe(head);
});
it("preserves an existing Shua and stores voice independently from persona", () => {
  const { sessions, crew } = world();
  crew.set({ ...crew.get("shua")!, persona: "My own instructions", voice: { voiceId: "ryan", speed: 0.9, personality: "direct" } });
  sessions.initialize("claude");
  expect(crew.get("shua")?.persona).toBe("My own instructions");
  expect(crew.get("shua")?.voice?.speed).toBe(0.9);
  expect(() => crew.set({ ...crew.get("shua")!, voice: { voiceId: "ryan", speed: 9, personality: "direct" } })).toThrow();
});
it("refuses mock intelligence even though its fixture auth mode says subscription", () => {
  const { sessions, runtimes } = world(); runtimes.set("mock", new MockRuntime());
  expect(() => sessions.initialize("mock")).toThrow(/subscription/);
  expect(() => sessions.submit({ requestId: randomUUID(), memberId: "shua", runtime: "mock", text: "Hello" })).toThrow(/subscription/);
});
