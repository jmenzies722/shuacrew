/**
 * The gateway process: one long-running local daemon that owns sessions, runs, memory, schedules,
 * approvals and policy, and serves the dashboard. Everything it knows is in its event log, so a
 * restart is a replay: runs that were mid-flight are re-queued and resume their conversations.
 */
import { installRadioSkill } from "./radio.js";
import { copyFileSync, existsSync, mkdirSync, statSync, truncateSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { LocalRuntime, AcpRuntime, ClaudeRuntime, CodexRuntime, MockRuntime, type AuthMode, type Runtime } from "@shuacrew/runtimes";
import { Memory } from "./memory.js";
import { Crew } from "./crew.js";
import { Terminals } from "./terminals.js";
import { Uploads } from "./uploads.js";
import { Heartbeats, Scheduler, TaskRunner, Webhooks, secretsPath } from "./autonomy.js";
import { Mcp } from "./mcp.js";
import { Library } from "./library.js";
import { Plays } from "./plays.js";
import { Skills } from "./skills.js";
import { zshIntegration } from "./shell-integration.js";
import { Backups } from "./backup.js";
import { Ventures } from "./ventures.js";
import { LIBRARY_HINT, TOOL_SERVER, ToolServer } from "./toolserver.js";
import { Supervisor } from "./runs.js";
import { LatencyBook } from "./latency.js";
import { RoomCoordinator } from "./rooms.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";
import { nativeBridgeSource } from "./mobile/native-config.js";
import { GatewaySettings } from "./settings.js";
import { Learning } from "./learning.js";

export const VERSION = "0.1.0";

export function dataDir(): string {
  return process.env.SHUACREW_HOME ?? path.join(os.homedir(), ".shuacrew");
}

interface RuntimeConfig {
  claude?: { authMode?: AuthMode; enabled?: boolean };
  local?: { enabled?: boolean };
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
  // On this Mac (Ollama): opt-in only (`local: { enabled: true }` in the config). It answered in up to a minute and
  // couldn't do real work, so it no longer shows up in Settings, Usage or the model lists unless you turn it on.
  if (config.local?.enabled === true) runtimes.set("local", new LocalRuntime());
  if (process.env.SHUACREW_DEMO === "1") runtimes.set("mock", new MockRuntime());
  return runtimes;
}

/**
 * Under launchd the log is our stdout, opened for appending before we start, so it can't be renamed
 * away: past 20 MB, keep a copy and empty it in place (a crash loop can't fill the disk).
 */
function trimLog(file = process.env.SHUACREW_LOG) {
  try {
    if (!file || !existsSync(file) || statSync(file).size < 20 * 1024 * 1024) return;
    copyFileSync(file, `${file}.1`);
    truncateSync(file, 0);
  } catch {
    // a log we can't trim is not a reason not to start
  }
}

export async function boot(options: { port?: number; host?: string } = {}) {
  trimLog();
  const home = dataDir();
  const workspace = path.join(home, "workspace");
  mkdirSync(workspace, { recursive: true });
  const store = new EventStore(path.join(home, "shuacrew.db"));
  const runtimes = await registry();
  const memory = new Memory(store);
  const crew = new Crew(store);
  const mcp = new Mcp(store, path.join(home, "mcp-auth.json"));
  mcp.keepFresh();
  const library = new Library(store, path.join(home, "library"));
  setInterval(() => library.resync(), 15 * 60_000).unref(); // your folders, kept current
  const ventures = new Ventures(store, path.join(home, "venture-keys.json"));
  const skills = new Skills(store, path.join(home, "plugin"));
  installRadioSkill(path.join(home, "plugin")); // the radio is a skill every Claude session can use
  const backups = new Backups(store, home);
  const port = options.port ?? Number(process.env.SHUACREW_PORT ?? 7420);
  const host = options.host ?? process.env.SHUACREW_HOST ?? "127.0.0.1";
  // The library's tool server lives on this gateway; each run reaches it with its own token.
  let live: (() => import("@shuacrew/core").CrewState) | undefined;
  const tools = new ToolServer(library, () => live!());
  const self = `http://${host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host.includes(":") ? `[${host}]` : host}:${port}/mcp`;
  const withLibrary = (runtime: string, run: string) => {
    const auth = `Bearer ${tools.tokenFor(run)}`;
    if (runtime === "codex") return { ...mcp.forCodex(), [TOOL_SERVER]: { url: self, http_headers: { Authorization: auth } } };
    if (runtime.startsWith("acp:")) return [...mcp.forAcp(), { name: TOOL_SERVER, type: "http" as const, url: self, headers: [{ name: "Authorization", value: auth }] }];
    if (runtime === "mock") return mcp.forClaude();
    return { ...mcp.forClaude(), [TOOL_SERVER]: { type: "http" as const, url: self, headers: { Authorization: auth } } };
  };
  const terminals = new Terminals(zshIntegration(home));
  let rooms: RoomCoordinator;
  const settings = new GatewaySettings(path.join(home, "settings.json"));
  const builtinProtected = [path.join(os.homedir(), "Nectar-Work"), path.join(os.homedir(), "Developer/work")];
  // Seeded from this Mac's own Spark history, then kept current turn by turn.
  const latency = new LatencyBook().seed(store.read());
  const supervisor = new Supervisor(store, runtimes, {
    latency,
    settings: () => settings.get(),
    roots: [path.join(os.homedir(), "Developer/projects"), path.join(os.homedir(), "Developer/learn")],
    protectedFolders: builtinProtected,
    canStart: id => rooms?.canStart(id) ?? false,
    runHint: id => rooms?.hint(id),
    workspace,
    failover: true,
    memory,
    crew,
    mcpServers: withLibrary,
    sparkMcpServers: (runtime) => { if (runtime !== "claude") return undefined; const s = mcp.forClaude("spark"); return Object.keys(s).length ? s : undefined; },
    toolHint: LIBRARY_HINT,
    plugins: (runtime) => (runtime === "claude" ? skills.plugins() : undefined),
    ventureBrief: (id) => ventures.brief(id),
    mcpList: () => mcp.list(),
  });
  rooms = new RoomCoordinator(store, supervisor, crew, runtimes);
  tools.rooms = rooms;
  tools.crew = crew;
  tools.runtimeIds = () => [...runtimes.keys()].filter((id) => id !== "mock" && id !== "local");
  const plays = new Plays(store, supervisor);
  ventures.startPlay = (input) => plays.start(input);
  const autonomy = {
    scheduler: new Scheduler(store, supervisor, workspace),
    webhooks: new Webhooks(store, supervisor, secretsPath(home)),
    heartbeats: new Heartbeats(store, supervisor, workspace),
    tasks: new TaskRunner(store, supervisor),
  };
  const here = path.dirname(fileURLToPath(import.meta.url));
  const { SpeechService } = await import("./speech.js");
  const { app, hub, state, briefing } = await createServer({
    store,
    supervisor,
    runtimes,
    rooms,
    mobile: nativeBridgeSource(path.join(home, "mobile", "bridge.json"), store, supervisor, rooms),
    host: options.host ?? process.env.SHUACREW_HOST ?? "127.0.0.1",
    port: options.port,
    token: process.env.SHUACREW_TOKEN,
    webRoot: process.env.SHUACREW_WEB ?? path.resolve(here, "../../web/dist"),
    version: VERSION,
    autonomy,
    memory,
    mcp,
    crew,
    library,
    sitesRoot: path.join(home, "sites"),
    backups,
    tools,
    plays,
    ventures,
    skills,
    terminals,
    uploads: new Uploads(path.join(home, "uploads")),
    speech: new SpeechService({ home: path.join(home, "speech") }),
    settings,
    builtinProtected,
    learning: new Learning(path.join(home, "learning.json")),
  });
  live = state;
  store.append("gateway.started", { pid: process.pid, version: VERSION });
  const resumed = supervisor.recover();
  rooms.recover();
  app.addHook("onClose", async () => rooms.close());
  autonomy.tasks.recover();
  plays.recover();
  ventures.schedule();
  briefing?.schedule();
  backups.schedule();
  autonomy.scheduler.sync();
  autonomy.heartbeats.sync();
  memory.schedule();
  await app.listen({ port, host });
  return { app, hub, store, supervisor, autonomy, memory, crew, library, tools, plays, ventures, skills, briefing, backups, terminals, port, host, resumed };
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
    gateway.library.stop();
    gateway.plays.stop();
    gateway.ventures.stop();
    gateway.skills.stop();
    gateway.briefing?.stop();
    gateway.backups.stop();
    gateway.terminals.closeAll();
    gateway.hub.close();
    await gateway.app.close();
    gateway.store.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
