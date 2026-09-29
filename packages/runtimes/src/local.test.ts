import { expect, it } from "vitest";
import { LocalRuntime, splitSystem } from "./local.js";

/** A fake Ollama: /api/tags lists models, /api/chat streams NDJSON and records what it was sent. */
function fakeOllama(installed: string[], reply: string[]) {
  const sent: Array<{ model: string; messages: Array<{ role: string; content: string }> }> = [];
  const http = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/api/tags")) return new Response(JSON.stringify({ models: installed.map((name) => ({ name })) }));
    if (u.endsWith("/api/chat")) {
      sent.push(JSON.parse(String(init!.body)));
      const lines = [...reply.map((c) => JSON.stringify({ message: { content: c }, done: false })), JSON.stringify({ message: { content: "" }, done: true, prompt_eval_count: 12, eval_count: 5 })];
      return new Response(new ReadableStream({ start(c) { for (const l of lines) c.enqueue(new TextEncoder().encode(l + "\n")); c.close(); } }));
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return { http, sent };
}
const ctx = { signal: new AbortController().signal, env: {}, approve: async () => ({ allow: true }) } as never;
const collect = async (it: AsyncIterable<unknown>) => { const out: Array<Record<string, unknown>> = []; for await (const e of it) out.push(e as Record<string, unknown>); return out; };

it("streams an answer from the best installed local model and remembers the conversation", async () => {
  const { http, sent } = fakeOllama(["llama3.2:3b", "gpt-oss:20b"], ["Postgres ", "isn't running."]);
  const rt = new LocalRuntime({ fetch: http });
  const first = await collect(rt.start({ id: "r1", ask: "why ECONNREFUSED?", cwd: "/", system: "You are Spark." }, ctx));
  expect(sent[0]!.model).toBe("gpt-oss:20b"); // smart first when it's there
  expect(first.filter((e) => e.type === "text").map((e) => e.text).join("")).toBe("Postgres isn't running.");
  expect(first.at(-1)).toMatchObject({ type: "done", text: "Postgres isn't running." });
  expect(first.find((e) => e.type === "usage")).toMatchObject({ inputTokens: 12, outputTokens: 5, costUsd: 0 });
  const session = first.find((e) => e.type === "session")!.id as string;
  await collect(rt.start({ id: "r1", ask: "how do I start it?", cwd: "/", resume: session, model: "llama3.2:3b" }, ctx));
  expect(sent[1]!.model).toBe("llama3.2:3b");
  expect(sent[1]!.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
});

it("says clearly when there's no local model to use", async () => {
  const { http } = fakeOllama([], []);
  const events = await collect(new LocalRuntime({ fetch: http }).start({ id: "r", ask: "hi", cwd: "/" }, ctx));
  expect(events).toEqual([{ type: "error", message: expect.stringMatching(/No local model/) }]);
  expect((await new LocalRuntime({ fetch: http }).status()).installed).toBe(false);
});

it("lifts Spark's instruction block into the system slot, and leaves plain asks alone", async () => {
  expect(splitSystem("<spark-system>\nYou are Spark.\n</spark-system>\nHello")).toEqual({ system: "You are Spark.", ask: "Hello" });
  expect(splitSystem("Hello")).toEqual({ ask: "Hello" });
  const { http, sent } = fakeOllama(["llama3.2:3b"], ["Hi"]);
  await collect(new LocalRuntime({ fetch: http }).start({ id: "r", ask: "<spark-system>\nYou are Spark.\n</spark-system>\nHello", cwd: "/" }, ctx));
  expect(sent[0]!.messages).toEqual([{ role: "system", content: "You are Spark." }, { role: "user", content: "Hello" }]);
});

it("rebuilds a forgotten conversation from the instruction block instead of answering without it", async () => {
  const { http, sent } = fakeOllama(["llama3.2:3b"], ["ok"]);
  await collect(new LocalRuntime({ fetch: http }).start({ id: "r", ask: "<spark-system>\nYou are Spark.\n</spark-system>\nand then?", cwd: "/", resume: "local-gone-after-restart" }, ctx));
  expect(sent[0]!.messages[0]).toEqual({ role: "system", content: "You are Spark." });
});
