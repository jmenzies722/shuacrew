/**
 * The gateway process: one long-running local daemon that owns sessions, runs, memory, schedules,
 * approvals and policy, and serves the dashboard. Everything it knows is in its event log, so a
 * restart is a replay: runs that were mid-flight are re-queued and resume their conversations.
 */
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { AcpRuntime, ClaudeRuntime, CodexRuntime, MockRuntime, type AuthMode, type Runtime } from "@shuacrew/runtimes";
import { Memory } from "./memory.js";
import { Crew } from "./crew.js";
import { Terminals } from "./terminals.js";
import { Uploads } from "./uploads.js";
import { Heartbeats, Scheduler, TaskRunner, Webhooks, secretsPath } from "./autonomy.js";
import { Mcp } from "./mcp.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";

export const VERSION = "0.1.0";

export function dataDir(): string {
  return process.env.SHUACREW_HOME ?? path.join(os.homedir(), ".shuacrew");
}

interface RuntimeConfig {
  claude?: { authMode?: AuthMode; enabled?: boolean };
  codex?: { authMode?: AuthMode; enabled?: boolean };
  /** ACP agents are opt-in: nothing launches one unless it is listed here. */
  acp?: Array<{ id: string; label: string; command: string; args?: string[]; authMode?: AuthMode }>;
}

function runtimeConfig(): RuntimeConfig {
  try {
    return JSON.parse(readFileSync(path.join(dataDir(), "runtimes.json"), "utf8")) as RuntimeConfig;
  } catch {
    return {};
  }
}

/**
 * Claude and Codex on the person's own subscriptions. The scripted mock exists only when asked for
 * (`SHUACREW_DEMO=1`, as `pnpm demo` and the screenshot scripts do) — never in real use.
 */
export async function registry(): Promise<Map<string, Runtime>> {
  const config = runtimeConfig();
  const runtimes = new Map<string, Runtime>();
  if (config.claude?.enabled !== false) runtimes.set("claude", new ClaudeRuntime({ authMode: config.claude?.authMode }));
  if (config.codex?.enabled !== false) runtimes.set("codex", new CodexRuntime({ authMode: config.codex?.authMode }));
  for (const agent of config.acp ?? []) {
    const id = agent.id.startsWith("acp:") ? agent.id : `acp:${agent.id}`;
    runtimes.set(id, new AcpRuntime({ id, label: agent.label, command: agent.command, args: agent.args ?? [], authMode: agent.authMode }));
  }
  if (process.env.SHUACREW_DEMO === "1") runtimes.set("mock", new MockRuntime());
  return runtimes;
}

export async function boot(options: { port?: number; host?: string } = {}) {
  const home = dataDir();
  const workspace = path.join(home, "workspace");
  mkdirSync(workspace, { recursive: true });
  const store = new EventStore(path.join(home, "shuacrew.db"));
  const runtimes = await registry();
  const memory = new Memory(store);
  const crew = new Crew(store);
  const mcp = new Mcp(store, path.join(home, "mcp-auth.json"));
  const terminals = new Terminals();
  const supervisor = new Supervisor(store, runtimes, {
    workspace,
    failover: true,
    memory,
    crew,
    mcpServers: (id) => (id === "codex" ? mcp.forCodex() : id.startsWith("acp:") ? mcp.forAcp() : mcp.forClaude()),
    mcpList: () => mcp.list(),
  });
  const autonomy = {
    scheduler: new Scheduler(store, supervisor, workspace),
    webhooks: new Webhooks(store, supervisor, secretsPath(home)),
    heartbeats: new Heartbeats(store, supervisor, workspace),
    tasks: new TaskRunner(store, supervisor),
  };
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
    autonomy,
    memory,
    mcp,
    crew,
    terminals,
    uploads: new Uploads(path.join(home, "uploads")),
  });
  store.append("gateway.started", { pid: process.pid, version: VERSION });
  const resumed = supervisor.recover();
  autonomy.tasks.recover();
  autonomy.scheduler.sync();
  autonomy.heartbeats.sync();
  memory.schedule();
  const port = options.port ?? Number(process.env.SHUACREW_PORT ?? 7420);
  const host = options.host ?? process.env.SHUACREW_HOST ?? "127.0.0.1";
  await app.listen({ port, host });
  return { app, hub, store, supervisor, autonomy, memory, crew, terminals, port, host, resumed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const gateway = await boot();
  console.log(`ShuaCrew gateway on http://${gateway.host}:${gateway.port} · log ${gateway.store.path}` + (gateway.resumed.length ? ` · resumed ${gateway.resumed.length} run(s)` : ""));
  const stop = async () => {
    gateway.supervisor.shutdown(); // runs stay "running" in the log; the next boot resumes them
    gateway.autonomy.scheduler.stop();
    gateway.autonomy.heartbeats.stop();
    gateway.memory.stop();
    gateway.crew?.stop();
    gateway.terminals.closeAll();
    gateway.hub.close();
    await gateway.app.close();
    gateway.store.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
