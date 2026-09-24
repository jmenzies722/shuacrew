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
import type { Heartbeats, Scheduler, TaskRunner, Webhooks } from "./autonomy.js";
import { Hub } from "./hub.js";
import type { Memory } from "./memory.js";
import { MergeQueue } from "./merge.js";
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
  autonomy?: { scheduler: Scheduler; webhooks: Webhooks; heartbeats: Heartbeats; tasks: TaskRunner };
  memory?: Memory;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

export async function createServer(options: ServerOptions): Promise<{ app: FastifyInstance; hub: Hub; merges: MergeQueue; state: () => CrewState }> {
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
  const merges = new MergeQueue(store, supervisor.worktrees);
  // Keep the raw body: webhook signatures are computed over the exact bytes that were sent.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    (request as FastifyRequest & { rawBody?: string }).rawBody = String(body);
    try {
      done(null, body ? JSON.parse(String(body)) : {});
    } catch (error) {
      done(error as Error, undefined);
    }
  });
  const hub = new Hub(store);
  await app.register(fastifyWebsocket);

  app.addHook("onRequest", async (request, reply) => {
    if (options.token && !authorised(request, options.token)) {
      return reply.code(401).send({ error: "token required" });
    }
    // Webhooks come from other systems and are authenticated by their HMAC signature instead.
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !request.url.startsWith("/hooks/")) {
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

  // Review: inline comments go back to the agent as one follow-up turn.
  app.post<{ Params: { id: string }; Body: { comments?: Array<{ file: string; line: number; text: string }> } }>(
    "/api/runs/:id/comments",
    async (request, reply) => {
      const comments = (request.body?.comments ?? []).filter((c) => c.text?.trim());
      if (!comments.length) return reply.code(400).send({ error: "no comments" });
      for (const c of comments) store.append("review.comment", { file: c.file, line: c.line, text: c.text }, { run: request.params.id });
      const text = [
        "Review comments on your changes — address each one, then re-run the checks:",
        ...comments.map((c) => `- ${c.file}:${c.line} — ${c.text}`),
      ].join("\n");
      try {
        supervisor.followUp(request.params.id, text, "you (review)");
      } catch (error) {
        return reply.code(409).send({ error: (error as Error).message });
      }
      return { ok: true, sent: comments.length };
    },
  );

  // Approve → the merge queue. Reject → what should it learn?
  app.post<{ Params: { id: string }; Body: { approve?: boolean; lesson?: string } }>("/api/runs/:id/review", async (request, reply) => {
    const run = request.params.id;
    const approve = Boolean(request.body?.approve);
    const status = supervisor.status(run);
    if (approve && status && ["queued", "planning", "running", "awaiting_approval"].includes(status)) {
      return reply.code(409).send({ error: "the agent is still working on this run — review it when the turn finishes" });
    }
    const lesson = request.body?.lesson?.trim() || undefined;
    store.append("review.decided", { approve, lesson }, { run });
    if (!approve) {
      store.append("run.status", { status: "failed", reason: lesson ? `rejected: ${lesson}` : "rejected in review" }, { run });
      if (lesson) {
        const created = store.forRun(run).find((e) => e.kind === "run.created");
        const project = created?.kind === "run.created" ? (created.body.project ?? created.body.repo) : undefined;
        store.append(
          "lesson.learned",
          { id: `l_${run}`, text: lesson, scope: project ? "project" : "global", project, origin: "review", confidence: 0.7, evidence: [store.head] },
          { run },
        );
      }
      return { ok: true };
    }
    return { ok: true, position: merges.enqueue(run) };
  });

  app.get("/api/merge-queue", async () => ({ pending: merges.pending }));

  const auto = options.autonomy;
  if (auto) {
    const fail = (reply: { code(n: number): { send(b: unknown): unknown } }, error: unknown) =>
      reply.code((error as { status?: number }).status ?? 400).send({ error: (error as Error).message });

    app.get("/api/schedules", async () => auto.scheduler.list());
    app.get<{ Querystring: { when?: string } }>("/api/schedules/preview", async (request, reply) => {
      try {
        const { parseCadence } = await import("@shuacrew/core");
        const cadence = parseCadence(request.query.when ?? "");
        return { ...cadence, next: auto.scheduler.preview(cadence.cron, cadence.timezone, 5) };
      } catch (error) {
        return fail(reply, error);
      }
    });
    app.post<{ Body: { id?: string; name?: string; when?: string; ask?: string; script?: string; project?: string; runtime?: string; paused?: boolean } }>(
      "/api/schedules",
      async (request, reply) => {
        try {
          return auto.scheduler.set({ ...request.body, when: request.body?.when ?? "" });
        } catch (error) {
          return fail(reply, error);
        }
      },
    );
    app.post<{ Params: { id: string } }>("/api/schedules/:id/run", async (request) => ({ run: await auto.scheduler.fire(request.params.id) }));
    app.delete<{ Params: { id: string } }>("/api/schedules/:id", async (request) => (auto.scheduler.remove(request.params.id), { ok: true }));

    app.get("/api/webhooks", async () => auto.webhooks.list());
    app.post<{ Body: { name?: string; ask?: string; project?: string; runtime?: string } }>("/api/webhooks", async (request, reply) => {
      if (!request.body?.name || !request.body.ask) return reply.code(400).send({ error: "a webhook needs a name and an ask" });
      return auto.webhooks.create({ name: request.body.name, ask: request.body.ask, project: request.body.project, runtime: request.body.runtime });
    });
    app.delete<{ Params: { id: string } }>("/api/webhooks/:id", async (request) => (auto.webhooks.remove(request.params.id), { ok: true }));
    app.post<{ Params: { id: string } }>("/hooks/:id", async (request, reply) => {
      try {
        const run = auto.webhooks.receive(
          request.params.id,
          { signature: request.headers["x-shuacrew-signature"] as string | undefined, timestamp: request.headers["x-shuacrew-timestamp"] as string | undefined },
          (request as FastifyRequest & { rawBody?: string }).rawBody ?? "",
        );
        return reply.code(202).send({ run });
      } catch (error) {
        return fail(reply, error);
      }
    });

    app.get("/api/heartbeats", async () => auto.heartbeats.list());
    app.post<{ Body: { id?: string; name?: string; command?: string; everyMinutes?: number; threshold?: number; ask?: string } }>("/api/heartbeats", async (request, reply) => {
      const b = request.body ?? {};
      if (!b.name || !b.command || !b.everyMinutes) return reply.code(400).send({ error: "a heartbeat needs a name, a command and everyMinutes" });
      return { id: auto.heartbeats.set({ ...b, name: b.name, command: b.command, everyMinutes: b.everyMinutes }) };
    });
    app.post<{ Params: { id: string } }>("/api/heartbeats/:id/check", async (request) => auto.heartbeats.check(request.params.id));
    app.delete<{ Params: { id: string } }>("/api/heartbeats/:id", async (request) => (auto.heartbeats.remove(request.params.id), { ok: true }));

    app.post<{ Body: { markdown?: string; path?: string; repo?: string; runtime?: string; model?: string } }>("/api/tasks", async (request, reply) => {
      const b = request.body ?? {};
      let markdown = b.markdown;
      if (!markdown && b.path) {
        const { readFile } = await import("node:fs/promises");
        markdown = await readFile(b.path, "utf8").catch(() => undefined);
      }
      if (!markdown?.trim()) return reply.code(400).send({ error: "give a TASK.md (markdown or path)" });
      return { id: auto.tasks.start({ markdown, repo: b.repo, runtime: b.runtime, model: b.model }) };
    });
  }

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

  if (options.memory) {
    const memory = options.memory;
    app.get("/api/memory", async () => ({
      lessons: Object.values(memory.view.lessons).sort((a, b) => b.learnedAt - a.learnedAt),
      skills: Object.values(memory.view.skills).sort((a, b) => b.at - a.at),
      lastEvolve: memory.lastEvolve ?? null,
    }));
    app.post<{ Body: { text?: string; project?: string } }>("/api/memory/lessons", async (request, reply) => {
      const text = request.body?.text?.trim();
      if (!text) return reply.code(400).send({ error: "say what it should learn" });
      return { id: memory.teach(text, request.body.project?.trim() || undefined) };
    });
    app.delete<{ Params: { id: string } }>("/api/memory/lessons/:id", async (request, reply) => {
      try {
        memory.retire(request.params.id);
        return { ok: true };
      } catch (error) {
        return reply.code(404).send({ error: (error as Error).message });
      }
    });
    app.post<{ Params: { id: string }; Body: { accept?: boolean } }>("/api/memory/skills/:id", async (request, reply) => {
      try {
        memory.decideSkill(request.params.id, request.body?.accept === true);
        return { ok: true };
      } catch (error) {
        return reply.code(404).send({ error: (error as Error).message });
      }
    });
    app.post("/api/memory/evolve", async () => memory.evolve());
    app.get<{ Querystring: { ask?: string; project?: string } }>("/api/memory/recall", async (request) => {
      const { recall } = await import("@shuacrew/memory");
      return recall(memory.view, request.query.ask ?? "", request.query.project || undefined).map((r) => ({ id: r.lesson.id, text: r.lesson.text, score: r.score, shared: r.shared }));
    });
  }

  if (options.webRoot && existsSync(options.webRoot)) {
    await app.register(fastifyStatic, { root: options.webRoot, prefix: "/", wildcard: false, maxAge: "1h", immutable: false });
    // wildcard:false indexes files at startup, so assets from a rebuild made while running land here:
    // serve them if they exist now. A missing asset is a 404, never the HTML shell.
    const webRoot = options.webRoot;
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.url.startsWith("/ws")) return reply.code(404).send({ error: "not found" });
      const pathname = decodeURIComponent(request.url.split("?")[0]!);
      if (path.extname(pathname)) {
        const file = path.resolve(webRoot, "." + pathname);
        if (file.startsWith(webRoot + path.sep) && existsSync(file)) return reply.sendFile(path.relative(webRoot, file));
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return { app, hub, merges, state: () => state };
}

function authorised(request: FastifyRequest, token: string): boolean {
  const header = request.headers.authorization;
  if (header === `Bearer ${token}`) return true;
  const query = request.query as { token?: string } | undefined;
  return query?.token === token;
}
