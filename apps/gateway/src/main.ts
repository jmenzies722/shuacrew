/**
 * The gateway process: one long-running local daemon that owns sessions, runs, memory, schedules,
 * approvals and policy, and serves the dashboard. Everything it knows is in its event log, so a
 * restart is a replay: runs that were mid-flight are re-queued and resume their conversations.
 */
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MockRuntime, type Runtime } from "@shuacrew/runtimes";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";

export const VERSION = "0.1.0";

export function dataDir(): string {
  return process.env.SHUACREW_HOME ?? path.join(os.homedir(), ".shuacrew");
}

export async function registry(): Promise<Map<string, Runtime>> {
  const runtimes = new Map<string, Runtime>();
  runtimes.set("mock", new MockRuntime());
  return runtimes;
}

export async function boot(options: { port?: number; host?: string } = {}) {
  const home = dataDir();
  const workspace = path.join(home, "workspace");
  mkdirSync(workspace, { recursive: true });
  const store = new EventStore(path.join(home, "shuacrew.db"));
  const runtimes = await registry();
  const supervisor = new Supervisor(store, runtimes, { workspace, failover: true });
  const here = path.dirname(fileURLToPath(import.meta.url));
  const { app, hub } = await createServer({
    store,
    supervisor,
    runtimes,
    host: options.host ?? process.env.SHUACREW_HOST ?? "127.0.0.1",
    port: options.port,
    token: process.env.SHUACREW_TOKEN,
    webRoot: process.env.SHUACREW_WEB ?? path.resolve(here, "../../web/dist"),
    version: VERSION,
  });
  store.append("gateway.started", { pid: process.pid, version: VERSION });
  const resumed = supervisor.recover();
  const port = options.port ?? Number(process.env.SHUACREW_PORT ?? 7420);
  const host = options.host ?? process.env.SHUACREW_HOST ?? "127.0.0.1";
  await app.listen({ port, host });
  return { app, hub, store, supervisor, port, host, resumed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const gateway = await boot();
  console.log(`ShuaCrew gateway on http://${gateway.host}:${gateway.port} · log ${gateway.store.path}` + (gateway.resumed.length ? ` · resumed ${gateway.resumed.length} run(s)` : ""));
  const stop = async () => {
    gateway.supervisor.shutdown(); // runs stay "running" in the log; the next boot resumes them
    gateway.hub.close();
    await gateway.app.close();
    gateway.store.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
