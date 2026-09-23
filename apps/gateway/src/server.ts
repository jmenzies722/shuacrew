/**
 * The HTTP + WebSocket surface.
 *
 * Loopback by default. Binding anywhere else requires a token on every request. State-changing
 * requests must carry `X-ShuaCrew: 1` and come from the gateway's own origin: a web page on
 * another site can't set that header without a CORS preflight this server never approves, which is
 * the CSRF defence. The dashboard is served with a strict CSP (no inline script, no remote origins).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { apply, decide, defaultContext, defaultRules, emptyState, normalise, type CrewState } from "@shuacrew/core";
import type { Runtime } from "@shuacrew/runtimes";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { Hub } from "./hub.js";
import type { Supervisor } from "./runs.js";
import type { EventStore } from "./store.js";

export interface ServerOptions {
  store: EventStore;
  supervisor: Supervisor;
  runtimes: Map<string, Runtime>;
  host?: string;
  port?: number;
  token?: string; // required when host is not loopback
  webRoot?: string;
  version?: string;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

export async function createServer(options: ServerOptions): Promise<{ app: FastifyInstance; hub: Hub; state: () => CrewState }> {
  const { store, supervisor } = options;
  const host = options.host ?? "127.0.0.1";
  if (!LOOPBACK.has(host) && !options.token) {
    throw new Error(`refusing to listen on ${host} without a token — set SHUACREW_TOKEN`);
  }

  // The live projection, kept current as facts arrive: the snapshot a client loads first.
  const state = emptyState();
  for (const event of store.read(0)) apply(state, event);
  store.subscribe((event) => apply(state, event));

  const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });
  const hub = new Hub(store);
  await app.register(fastifyWebsocket);

  app.addHook("onRequest", async (request, reply) => {
    if (options.token && !authorised(request, options.token)) {
      return reply.code(401).send({ error: "token required" });
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const origin = request.headers.origin;
      const sameOrigin = !origin || new URL(origin).host === request.headers.host;
      if (request.headers["x-shuacrew"] !== "1" || !sameOrigin) {
        return reply.code(403).send({ error: "missing X-ShuaCrew header or cross-origin request" });
      }
    }
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'",
    );
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    return payload;
  });

  app.get("/ws", { websocket: true }, (socket) => hub.attach(socket));

  app.get("/api/health", async () => ({
    ok: true,
    head: store.head,
    clients: hub.size,
    version: options.version ?? "0.1.0",
    rssMb: Math.round(process.memoryUsage().rss / 1e6),
    pendingApprovals: Object.keys(state.approvals).length,
  }));

  app.get("/api/snapshot", async () => state);

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>("/api/runs/:id/events", async (request) =>
    store.forRun(request.params.id, Number(request.query.after ?? 0)),
  );

  app.post<{ Body: { ask?: string; title?: string; repo?: string; project?: string; runtime?: string; model?: string; effort?: string; approveAll?: boolean; labels?: string[] } }>(
    "/api/runs",
    async (request, reply) => {
      const body = request.body ?? {};
      if (!body.ask?.trim()) return reply.code(400).send({ error: "say what you want done" });
      if (body.runtime && !options.runtimes.has(body.runtime)) return reply.code(400).send({ error: `no runtime ${body.runtime}` });
      const id = supervisor.launch({ ...body, ask: body.ask });
      return { id };
    },
  );

  app.post<{ Params: { id: string }; Body: { text?: string } }>("/api/runs/:id/followup", async (request, reply) => {
    const text = request.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: "empty message" });
    try {
      supervisor.followUp(request.params.id, text);
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/runs/:id/cancel", async (request) => {
    supervisor.cancel(request.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { priority?: number } }>("/api/runs/:id/priority", async (request) => {
    store.append("run.priority", { priority: Number(request.body?.priority ?? 0) }, { run: request.params.id });
    supervisor.pump();
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { allow?: boolean; always?: boolean; comment?: string; by?: string } }>(
    "/api/approvals/:id",
    async (request, reply) => {
      const b = request.body ?? {};
      const ok = supervisor.decideApproval(request.params.id, Boolean(b.allow), b.by ?? "you", Boolean(b.always), b.comment);
      return ok ? { ok } : reply.code(404).send({ error: "nothing is waiting on that approval" });
    },
  );

  app.post<{ Body: { tool?: string; input?: unknown; workspace?: string } }>("/api/policy/explain", async (request) => {
    const b = request.body ?? {};
    const call = normalise(b.tool ?? "Bash", b.input ?? {});
    return decide(call, defaultContext(b.workspace ?? process.cwd()), [{ name: "global", rules: defaultRules() }]);
  });

  app.get("/api/audit/verify", async () => store.verify());

  app.get("/api/runtimes", async () =>
    Promise.all(
      [...options.runtimes.values()].map(async (runtime) => ({
        id: runtime.id,
        label: runtime.label,
        authMode: runtime.authMode,
        capabilities: runtime.capabilities,
        models: runtime.models,
        status: await runtime.status().catch((error: Error) => ({ installed: false, signedIn: null, detail: error.message, overridingKeys: [] })),
        limitedUntil: supervisor.limitedUntil(runtime.id) || null,
      })),
    ),
  );

  app.get<{ Params: { id: string } }>("/api/runs/:id/diff", async (request, reply) => {
    const tree = store.forRun(request.params.id).find((e) => e.kind === "run.worktree");
    if (!tree || tree.kind !== "run.worktree") return reply.code(404).send({ error: "this run has no worktree" });
    const files = await supervisor.worktrees.files(tree.body.path, tree.body.base);
    const detailed = await Promise.all(
      files.map(async (file) => ({
        ...file,
        before: await supervisor.worktrees.show(tree.body.path, tree.body.base, file.path),
        after: await supervisor.worktrees.show(tree.body.path, "HEAD", file.path).then(async (committed) => {
          const { readFile } = await import("node:fs/promises");
          return readFile(path.join(tree.body.path, file.path), "utf8").catch(() => committed);
        }),
      })),
    );
    return { base: tree.body.base, branch: tree.body.branch, files: detailed };
  });

  if (options.webRoot && existsSync(options.webRoot)) {
    await app.register(fastifyStatic, { root: options.webRoot, prefix: "/", wildcard: false, maxAge: "1h", immutable: false });
    // Client-side routes all load the app shell.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.url.startsWith("/ws")) return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html");
    });
  }

  return { app, hub, state: () => state };
}

function authorised(request: FastifyRequest, token: string): boolean {
  const header = request.headers.authorization;
  if (header === `Bearer ${token}`) return true;
  const query = request.query as { token?: string } | undefined;
  return query?.token === token;
}
