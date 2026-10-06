import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { CodexRuntime } from "./codex.js";
import type { RunSpec, RuntimeEvent } from "./runtime.js";

// A stand-in `codex app-server`: speaks the same newline JSON-RPC, logs each spawn, and answers with its own pid.
const dir = mkdtempSync(path.join(os.tmpdir(), "fake-codex-"));
const log = path.join(dir, "spawns.log");
const bin = path.join(dir, "codex");
writeFileSync(bin, `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(log)}, process.pid + "\\n");
const send = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  if (m.method === "thread/resume") return send({ id: m.id, result: { thread: { id: m.params.threadId } } });
  if (m.method === "thread/start") return send({ id: m.id, result: { thread: { id: "t-new" } } });
  if (m.method !== "turn/start") return send({ id: m.id, result: {} });
  send({ id: m.id, result: { turn: { id: "u1" } } });
  send({ method: "turn/started", params: { turn: { id: "u1" } } });
  send({ method: "item/completed", params: { item: { id: "m1", type: "agentMessage", text: "pid " + process.pid } } });
  send({ method: "turn/completed", params: { turn: { id: "u1", status: "completed" } } });
});
`);
chmodSync(bin, 0o755);
const spawns = () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
const spec = (over: Partial<RunSpec> = {}): RunSpec => ({ id: "r", ask: "Again", cwd: dir, resume: "thread-1", ...over }) as RunSpec;
async function turn(rt: CodexRuntime, run: RunSpec): Promise<string> {
  const ctrl = new AbortController();
  let text = "";
  for await (const e of rt.start(run, { signal: ctrl.signal, env: process.env, approve: async () => ({ allow: true }) } as never) as AsyncIterable<RuntimeEvent>) {
    if (e.type === "text") text += e.text;
    if (e.type === "done" || e.type === "error") break;
  }
  return text.trim();
}
const runtimes: CodexRuntime[] = [];
afterEach(() => { writeFileSync(log, ""); });

it("a follow-up prepared ahead of time runs on that same process instead of starting a new one", async () => {
  writeFileSync(log, "");
  const rt = new CodexRuntime({ binary: bin }); runtimes.push(rt);
  rt.prepare(spec({ ask: "" }), process.env);
  await new Promise((r) => setTimeout(r, 300));
  expect(rt.warmed).toBe(true);
  const reply = await turn(rt, spec());
  expect(spawns()).toHaveLength(1);
  expect(reply).toBe(`pid ${spawns()[0]}`);
  expect(rt.warmed).toBe(false); // used up, not kept
});

it("a turn that differs from what was prepared starts fresh and lets the spare go", async () => {
  writeFileSync(log, "");
  const rt = new CodexRuntime({ binary: bin }); runtimes.push(rt);
  rt.prepare(spec({ ask: "", model: "model-a" }), process.env);
  await new Promise((r) => setTimeout(r, 300));
  const reply = await turn(rt, spec({ model: "model-b" }));
  expect(spawns()).toHaveLength(2);
  expect(reply).toBe(`pid ${spawns()[1]}`);
  expect(rt.warmed).toBe(false);
});

it("nothing is prepared for a brand-new conversation (its instructions depend on the ask)", () => {
  const rt = new CodexRuntime({ binary: bin }); runtimes.push(rt);
  rt.prepare(spec({ ask: "", resume: undefined }), process.env);
  expect(rt.warmed).toBe(false);
});
