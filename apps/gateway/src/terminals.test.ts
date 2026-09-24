import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";
import { Terminals } from "./terminals.js";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function gateway() {
  const store = new EventStore(":memory:");
  const supervisor = new Supervisor(store, new Map(), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
  const terminals = new Terminals();
  const { app } = await createServer({ store, supervisor, runtimes: new Map(), terminals });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as { port: number };
  cleanups.push(async () => (terminals.closeAll(), await app.close(), supervisor.shutdown(), store.close()));
  return { app, terminals, base: `127.0.0.1:${address.port}` };
}

function listen(ws: WebSocket) {
  const got = { text: "", messages: [] as Array<Record<string, unknown>> };
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    got.messages.push(m);
    if (m.type === "data") got.text += m.data;
    if (m.type === "ready") got.text += m.replay;
  };
  return got;
}

async function until(check: () => boolean, ms = 10000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("terminals", () => {
  it("runs a real shell, and a reattaching page gets its scrollback", async () => {
    const { base } = await gateway();
    const dir = mkdtempSync(path.join(os.tmpdir(), "shua-term-"));
    const created = await (await fetch(`http://${base}/api/terminals`, { method: "POST", headers: { "Content-Type": "application/json", "X-ShuaCrew": "1" }, body: JSON.stringify({ cwd: dir, cols: 80, rows: 24 }) })).json() as { id: string };
    const first = new WebSocket(`ws://${base}/ws/terminal/${created.id}`);
    const a = listen(first);
    await new Promise((r) => (first.onopen = r));
    first.send(JSON.stringify({ type: "input", data: "echo marker-$((6*7)); stty size; pwd\r" }));
    await until(() => a.text.includes("marker-42") && a.text.includes(dir.split("/").pop()!));
    first.send(JSON.stringify({ type: "resize", cols: 132, rows: 40 }));
    first.send(JSON.stringify({ type: "input", data: "stty size\r" }));
    await until(() => a.text.includes("40 132"));
    first.close();

    const again = new WebSocket(`ws://${base}/ws/terminal/${created.id}`);
    const b = listen(again);
    await until(() => b.messages.some((m) => m.type === "ready"));
    expect(b.text).toContain("marker-42"); // the page came back to the same shell
    again.close();
  });

  it("refuses sockets from other sites and hosts that rebind to loopback", async () => {
    const { app } = await gateway();
    const cross = await app.inject({ url: "/ws/terminal/t_x", headers: { upgrade: "websocket", connection: "upgrade", origin: "https://evil.example", host: "127.0.0.1:7420" } });
    expect(cross.statusCode).toBe(403);
    const rebound = await app.inject({ url: "/api/snapshot", headers: { host: "evil.example:7420" } });
    expect(rebound.statusCode).toBe(421);
    expect((await app.inject({ url: "/api/health", headers: { host: "localhost:7420" } })).statusCode).toBe(200);
  });
});
