/**
 * The HTTP + WebSocket surface.
 *
 * Loopback by default. Binding anywhere else requires a token on every request. State-changing
 * requests must carry `X-ShuaCrew: 1` and come from the gateway's own origin: a web page on
 * another site can't set that header without a CORS preflight this server never approves, which is
 * the CSRF defence. The dashboard is served with a strict CSP (no inline script, no remote origins).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { apply, decide, defaultContext, defaultRules, emptyState, normalise, type CrewState } from "@shuacrew/core";
import type { Runtime } from "@shuacrew/runtimes";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { Heartbeats, Scheduler, TaskRunner, Webhooks } from "./autonomy.js";
import { Hub } from "./hub.js";
import type { Memory } from "./memory.js";
import type { Terminals } from "./terminals.js";
import { MAX_UPLOAD, type Uploads } from "./uploads.js";
import { MergeQueue } from "./merge.js";
import type { Supervisor } from "./runs.js";
import { Specs } from "./specs.js";
import type { Mcp } from "./mcp.js";
import type { Crew, MemberInput } from "./crew.js";
import type { Library } from "./library.js";
import type { Plays } from "./plays.js";
import { NEXT, STAGES, type Ventures } from "./ventures.js";
import type { ToolServer } from "./toolserver.js";
import { fetchSkill, mcpCatalog, skillCatalog } from "./catalog.js";
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
  mcp?: Mcp;
  crew?: Crew;
  library?: Library;
  plays?: Plays;
  ventures?: Ventures;
  tools?: ToolServer;
  terminals?: Terminals;
  uploads?: Uploads;
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
    // /mcp is the agents' door to the library: it checks its own per-run bearer instead.
    const toolCall = request.url === "/mcp" || request.url.startsWith("/mcp?");
    if (options.token && !toolCall && !authorised(request, options.token)) {
      return reply.code(401).send({ error: "token required" });
    }
    // Without a token the gateway trusts where it's reached from, so only its own names may reach
    // it: a site that points its domain at 127.0.0.1 (DNS rebinding) is turned away here.
    if (!options.token && !loopbackHost(request.headers.host)) {
      return reply.code(421).send({ error: "unknown host" });
    }
    // Any web page may open a WebSocket to 127.0.0.1; only the gateway's own pages get one.
    if (request.headers.upgrade?.toLowerCase() === "websocket") {
      const origin = request.headers.origin;
      if (origin && new URL(origin).host !== request.headers.host) return reply.code(403).send({ error: "cross-origin socket" });
    }
    // Webhooks come from other systems and are authenticated by their HMAC signature instead.
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !request.url.startsWith("/hooks/") && !toolCall) {
      const origin = request.headers.origin;
      const sameOrigin = !origin || new URL(origin).host === request.headers.host;
      if (request.headers["x-shuacrew"] !== "1" || !sameOrigin) {
        return reply.code(403).send({ error: "missing X-ShuaCrew header or cross-origin request" });
      }
    }
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    // A route that set its own (stricter or sandboxed) policy keeps it.
    if (!reply.hasHeader("Content-Security-Policy")) reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'",
    );
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    return payload;
  });

  app.get("/ws", { websocket: true }, (socket) => hub.attach(socket));

  if (options.uploads) {
    const uploads = options.uploads;
    // Raw bytes, named in the query: no multipart parsing, no temp files.
    app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: MAX_UPLOAD }, (_request, body, done) => done(null, body));
    app.post<{ Querystring: { name?: string }; Body: Buffer }>("/api/uploads", { bodyLimit: MAX_UPLOAD }, async (request, reply) => {
      if (!Buffer.isBuffer(request.body) || !request.body.length) return reply.code(400).send({ error: "empty file" });
      return uploads.save(request.query.name ?? "file", request.body);
    });
    // Only what was uploaded here, only by id — for thumbnails and "open".
    app.get<{ Params: { id: string } }>("/api/uploads/:id", async (request, reply) => {
      const upload = uploads.get(request.params.id);
      if (!upload || !existsSync(upload.path)) return reply.code(404).send({ error: "no such file" });
      reply.header("Content-Type", upload.type).header("Cache-Control", "private, max-age=31536000, immutable");
      reply.header("Content-Disposition", `${upload.type.startsWith("image/") || upload.type === "application/pdf" ? "inline" : "attachment"}; filename="${upload.name}"`);
      if (upload.type === "image/svg+xml") reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'"); // SVG can carry script
      return reply.send(readFileSync(upload.path));
    });
  }

  if (options.terminals) {
    const terminals = options.terminals;
    app.get<{ Querystring: { run?: string } }>("/api/terminals", async (request) => terminals.list(request.query.run));
    // A session's terminal opens where that session works: its worktree, else its repo.
    app.post<{ Body: { run?: string; cwd?: string; cols?: number; rows?: number } }>("/api/terminals", async (request) => {
      const run = request.body?.run ? state.runs[request.body.run] : undefined;
      const cwd = request.body?.cwd ?? run?.worktree?.path ?? run?.repo;
      return terminals.create({ cwd, run: run?.id, cols: request.body?.cols, rows: request.body?.rows });
    });
    app.delete<{ Params: { id: string } }>("/api/terminals/:id", async (request, reply) =>
      terminals.close(request.params.id) ? { ok: true } : reply.code(404).send({ error: "no such terminal" }),
    );
    app.get<{ Params: { id: string } }>("/ws/terminal/:id", { websocket: true }, (socket, request) => terminals.attach(request.params.id, socket));
  }

  // Which web build is on disk now. Open pages compare it and reload themselves when it changes,
  // so an update never needs a manual refresh. Read per request: a rebuild needs no restart.
  const webBuild = () => {
    if (!options.webRoot) return "none";
    try {
      return String(Math.round(statSync(path.join(options.webRoot, "index.html")).mtimeMs));
    } catch {
      return "none";
    }
  };

  app.get("/api/health", async () => ({
    ok: true,
    build: webBuild(),
    head: store.head,
    clients: hub.size,
    version: options.version ?? "0.1.0",
    rssMb: Math.round(process.memoryUsage().rss / 1e6),
    pendingApprovals: Object.keys(state.approvals).length,
    // Run by the launchd agent (starts at login, restarts itself), or started by hand / the app.
    service: process.env.SHUACREW_SERVICE === "1",
    pid: process.pid,
    uptimeS: Math.round(process.uptime()),
  }));

  app.get("/api/snapshot", async () => state);

  // The crew's recent activity — what agents did, not every streamed token — for the live floor.
  const ACTIVITY = new Set(["run.created", "run.status", "turn.started", "turn.completed", "tool.called", "tool.returned", "file.changed", "check.ran", "subagent.started", "subagent.finished", "approval.requested", "approval.decided", "merge.landed", "merge.failed", "pr.opened", "agent.thinking"]);
  app.get<{ Querystring: { limit?: string } }>("/api/activity", async (request) => {
    const limit = Math.min(2000, Math.max(1, Number(request.query.limit ?? 800)));
    const out = [];
    for (const e of store.read(Math.max(0, store.head - 20_000))) if (ACTIVITY.has(e.kind)) out.push(e);
    return out.slice(-limit);
  });

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>("/api/runs/:id/events", async (request) =>
    store.forRun(request.params.id, Number(request.query.after ?? 0)),
  );

  app.post<{ Body: { ask?: string; title?: string; repo?: string; project?: string; runtime?: string; model?: string; effort?: string; approveAll?: boolean; labels?: string[]; member?: string; venture?: string } }>(
    "/api/runs",
    async (request, reply) => {
      const body = request.body ?? {};
      if (!body.ask?.trim()) return reply.code(400).send({ error: "say what you want done" });
      if (body.runtime && !options.runtimes.has(body.runtime)) return reply.code(400).send({ error: `no runtime ${body.runtime}` });
      const venture = body.venture ? options.ventures?.get(body.venture) : undefined;
      if (body.venture && !venture) return reply.code(400).send({ error: `no venture ${body.venture}` });
      const id = supervisor.launch({ ...body, ask: body.ask, repo: body.repo ?? venture?.repo });
      return { id };
    },
  );

  app.post<{ Params: { id: string }; Body: { text?: string } }>("/api/runs/:id/followup", async (request, reply) => {
    const text = request.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: "empty message" });
    try {
      return { ok: true, id: supervisor.followUp(request.params.id, text) };
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string; followup: string } }>("/api/runs/:id/followups/:followup/withdraw", async (request, reply) => {
    try {
      supervisor.withdraw(request.params.id, request.params.followup);
      return { ok: true };
    } catch (error) {
      return reply.code(409).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string }; Body: { turn?: number } }>("/api/runs/:id/fork", async (request, reply) => {
    const run = state.runs[request.params.id];
    if (!run) return reply.code(404).send({ error: "no such session" });
    return { id: supervisor.fork(run.id, Math.max(1, Math.floor(Number(request.body?.turn ?? run.turns)))) };
  });

  // A file a session mentions, for the side panel. Only inside that session's worktree or repo,
  // and only what the agent policy would let an agent read — never ~/.ssh, .env and the like.
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>("/api/runs/:id/file", async (request, reply) => {
    const run = state.runs[request.params.id];
    const asked = request.query.path;
    if (!run || !asked) return reply.code(404).send({ error: "no such file" });
    const roots = [run.worktree?.path, run.repo].filter((r): r is string => Boolean(r));
    if (!roots.length) return reply.code(404).send({ error: "this session has no project folder" });
    const expanded = asked.replace(/^~(?=\/|$)/, os.homedir());
    const candidates = path.isAbsolute(expanded) ? [expanded] : roots.map((root) => path.join(root, expanded));
    // A path the agent saw in its worktree may be named by the repo path, and the other way round.
    const mapped = candidates.flatMap((c) => (run.repo && run.worktree && c.startsWith(run.repo + path.sep) ? [path.join(run.worktree.path, c.slice(run.repo.length)), c] : [c]));
    const file = mapped.map((c) => path.resolve(c)).find((c) => roots.some((root) => c === root || c.startsWith(path.resolve(root) + path.sep)) && existsSync(c));
    if (!file) return reply.code(404).send({ error: "not in this session's project" });
    const verdict = decide(normalise("Read", { file_path: file }), defaultContext(roots[0]!), [{ name: "global", rules: defaultRules() }]);
    if (verdict.verdict === "deny") return reply.code(403).send({ error: verdict.reason });
    const size = statSync(file).size;
    if (size > 1_000_000) return reply.code(413).send({ error: "too large to preview" });
    return { path: file, relative: path.relative(roots.find((r) => file.startsWith(path.resolve(r)))!, file), content: readFileSync(file, "utf8") };
  });

  app.post<{ Params: { id: string } }>("/api/runs/:id/cancel", async (request) => {
    supervisor.cancel(request.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { mode?: "ask" | "auto" } }>("/api/runs/:id/permission", async (request, reply) => {
    const mode = request.body?.mode;
    if (mode !== "ask" && mode !== "auto") return reply.code(400).send({ error: "mode is ask or auto" });
    try {
      supervisor.setPermission(request.params.id, mode);
      return { ok: true, mode };
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>("/api/runs/:id/archive", async (request, reply) => {
    const run = state.runs[request.params.id];
    if (!run) return reply.code(404).send({ error: "no such session" });
    if (["running", "planning", "queued", "awaiting_approval"].includes(run.status)) {
      return reply.code(409).send({ error: "stop the session before archiving it" });
    }
    store.append("run.archived", { reason: "archived by you" }, { run: run.id });
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

  if (options.crew) {
    const crew = options.crew;
    app.get("/api/crew", async () => crew.list());
    app.post("/api/crew/starter", async () => crew.starter());
    app.post<{ Body: Partial<MemberInput> }>("/api/crew", async (request, reply) => {
      const b = request.body ?? {};
      try {
        return crew.set({
          id: b.id ?? b.name ?? "",
          name: b.name ?? "",
          role: b.role ?? "",
          persona: b.persona ?? "",
          runtime: b.runtime || undefined,
          model: b.model || undefined,
          color: b.color ?? "#ffb020",
          emoji: b.emoji ?? "",
          triggers: b.triggers ?? [],
        });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    });
    app.delete<{ Params: { id: string } }>("/api/crew/:id", async (request, reply) => {
      try {
        crew.remove(request.params.id);
        return { ok: true };
      } catch (error) {
        return reply.code(404).send({ error: (error as Error).message });
      }
    });
    app.get<{ Querystring: { ask?: string } }>("/api/crew/route", async (request) => ({ member: crew.route(request.query.ask ?? "")?.id ?? null }));
    // Talk to a member in its standing thread — the one conversation you keep with it.
    app.post<{ Params: { id: string }; Body: { text?: string; repo?: string } }>("/api/crew/:id/talk", async (request, reply) => {
      const member = crew.get(request.params.id);
      const text = request.body?.text?.trim();
      if (!member) return reply.code(404).send({ error: "no such crew member" });
      if (!text) return reply.code(400).send({ error: "say something" });
      const thread = member.thread && state.runs[member.thread] ? member.thread : undefined;
      if (thread) {
        supervisor.followUp(thread, text);
        return { run: thread };
      }
      return { run: supervisor.launch({ ask: text, title: `${member.name} · ${member.role}`, member: member.id, repo: request.body?.repo || undefined, labels: ["standing"] }) };
    });
  }

  if (options.library) {
    const library = options.library;
    const tools = options.tools;
    // Agents' MCP endpoint (streamable HTTP, stateless). Each run has its own bearer.
    if (tools) {
      app.post("/mcp", async (request, reply) => {
        const run = tools.runFor(request.headers.authorization);
        if (!run) return reply.code(401).send({ error: "unknown run token" });
        const body = request.body as Parameters<ToolServer["handle"]>[0] | undefined;
        if (!body || typeof body !== "object") return reply.code(400).send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
        const result = await tools.handle(body, run);
        if (result === undefined) return reply.code(202).send();
        return reply.header("Content-Type", "application/json").send(result);
      });
      app.get("/mcp", async (_request, reply) => reply.code(405).header("Allow", "POST").send({ error: "POST JSON-RPC here" }));
      app.delete("/mcp", async (_request, reply) => reply.code(405).header("Allow", "POST").send({ error: "stateless: nothing to end" }));
    }
    app.get<{ Querystring: { q?: string; type?: string; limit?: string } }>("/api/library/search", async (request) =>
      library.search(request.query.q ?? "", { limit: Number(request.query.limit) || 20, type: request.query.type === "artifact" || request.query.type === "knowledge" ? request.query.type : undefined }),
    );
    // The artifact itself. HTML is served sandboxed: scripts may run, but in an opaque origin that
    // can't reach the gateway or the network.
    app.get<{ Params: { id: string }; Querystring: { v?: string; download?: string } }>("/api/library/artifacts/:id/raw", async (request, reply) => {
      const a = library.artifact(request.params.id);
      const file = library.fileOf(request.params.id, Number(request.query.v) || undefined);
      if (!a || !file) return reply.code(404).send({ error: "no such artifact" });
      reply.header("Content-Type", `${a.mime}${a.mime.startsWith("text/") ? "; charset=utf-8" : ""}`).header("Cache-Control", "no-cache");
      reply.header("Content-Disposition", `${request.query.download ? "attachment" : "inline"}; filename="${a.file}"`);
      reply.header(
        "Content-Security-Policy",
        "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https:; img-src data: https:; font-src data: https:; connect-src 'none'; frame-ancestors 'self'",
      );
      return reply.send(readFileSync(file));
    });
    app.get<{ Params: { id: string }; Querystring: { v?: string } }>("/api/library/artifacts/:id/text", async (request, reply) => {
      const a = library.artifact(request.params.id);
      const file = library.fileOf(request.params.id, Number(request.query.v) || undefined);
      if (!a || !file) return reply.code(404).send({ error: "no such artifact" });
      if (a.kind === "image" || a.kind === "file") return reply.code(415).send({ error: "not text" });
      const text = readFileSync(file, "utf8");
      return { text: text.slice(0, 400_000), truncated: text.length > 400_000 };
    });
    app.post<{ Body: { title?: string; content?: string; filename?: string; run?: string; id?: string; summary?: string } }>("/api/library/artifacts", async (request, reply) => {
      const b = request.body ?? {};
      try {
        const run = b.run && state.runs[b.run] ? b.run : undefined;
        return library.save({ title: b.title ?? "", content: b.content ?? "", filename: b.filename, summary: b.summary, id: b.id, run, member: run ? state.runs[run]?.member : undefined, by: "you" });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    });
    app.delete<{ Params: { id: string } }>("/api/library/artifacts/:id", async (request, reply) => {
      try {
        library.removeArtifact(request.params.id);
        return { ok: true };
      } catch (error) {
        return reply.code(404).send({ error: (error as Error).message });
      }
    });
    app.post<{ Body: { path?: string; title?: string; note?: string; upload?: string } }>("/api/library/knowledge", async (request, reply) => {
      const b = request.body ?? {};
      try {
        if (b.note !== undefined) return library.note(b.title ?? "", b.note);
        if (b.upload) {
          const upload = options.uploads?.get(b.upload);
          if (!upload) return reply.code(404).send({ error: "no such upload" });
          return library.add(upload.path, b.title || upload.name);
        }
        if (b.path) return library.add(b.path, b.title);
        return reply.code(400).send({ error: "give a path, an upload or a note" });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    });
    app.get<{ Params: { id: string }; Querystring: { file?: string } }>("/api/library/knowledge/:id", async (request, reply) => {
      try {
        return library.read(request.params.id, request.query.file, 200_000);
      } catch (error) {
        return reply.code(404).send({ error: (error as Error).message });
      }
    });
    app.delete<{ Params: { id: string } }>("/api/library/knowledge/:id", async (request, reply) => {
      try {
        library.removeSource(request.params.id);
        return { ok: true };
      } catch (error) {
        return reply.code(404).send({ error: (error as Error).message });
      }
    });
  }

  if (options.plays) {
    const plays = options.plays;
    const attempt = async <T>(reply: FastifyReply, work: () => T) => {
      try {
        return (await work()) ?? { ok: true };
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    };
    app.get("/api/playbooks", async () => plays.playbooks());
    app.post("/api/playbooks", async (request, reply) => attempt(reply, () => plays.save(request.body)));
    app.delete<{ Params: { id: string } }>("/api/playbooks/:id", async (request, reply) => attempt(reply, () => plays.remove(request.params.id)));
    app.post<{ Body: { playbook?: string; inputs?: Record<string, string>; title?: string; repo?: string; venture?: string } }>("/api/plays", async (request, reply) =>
      attempt(reply, () => {
        const venture = request.body?.venture ? options.ventures?.get(request.body.venture) : undefined;
        if (request.body?.venture && !venture) throw new Error(`no venture ${request.body.venture}`);
        return plays.start({ playbook: request.body?.playbook ?? "", inputs: request.body?.inputs, title: request.body?.title, repo: request.body?.repo || venture?.repo, venture: venture?.id });
      }),
    );
    app.post<{ Params: { id: string }; Body: { index?: number } }>("/api/plays/:id/approve", async (request, reply) => attempt(reply, () => plays.approve(request.params.id, Number(request.body?.index))));
    app.post<{ Params: { id: string }; Body: { index?: number; feedback?: string } }>("/api/plays/:id/revise", async (request, reply) =>
      attempt(reply, () => plays.revise(request.params.id, Number(request.body?.index), request.body?.feedback ?? "")),
    );
    app.post<{ Params: { id: string }; Body: { from?: number } }>("/api/plays/:id/restart", async (request, reply) => attempt(reply, () => plays.restart(request.params.id, Number(request.body?.from ?? 0))));
    app.post<{ Params: { id: string }; Body: { index?: number } }>("/api/plays/:id/skip", async (request, reply) => attempt(reply, () => plays.skip(request.params.id, Number(request.body?.index))));
    app.post<{ Params: { id: string } }>("/api/plays/:id/cancel", async (request, reply) => attempt(reply, () => plays.cancel(request.params.id)));
  }

  if (options.ventures) {
    const ventures = options.ventures;
    const attempt = async <T>(reply: FastifyReply, work: () => T | Promise<T>) => {
      try {
        return (await work()) ?? { ok: true };
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    };
    app.get("/api/ventures/stages", async () => ({ stages: STAGES, next: NEXT }));
    app.post<{ Body: Parameters<Ventures["set"]>[0] }>("/api/ventures", async (request, reply) => attempt(reply, () => ventures.set(request.body ?? { name: "" })));
    app.delete<{ Params: { id: string } }>("/api/ventures/:id", async (request, reply) => attempt(reply, () => ventures.remove(request.params.id)));
    app.post<{ Params: { id: string }; Body: { stage?: string; note?: string } }>("/api/ventures/:id/stage", async (request, reply) =>
      attempt(reply, () => {
        const stage = request.body?.stage as Parameters<Ventures["stage"]>[1];
        if (![...STAGES, "paused", "stopped"].includes(stage)) throw new Error("unknown stage");
        return ventures.stage(request.params.id, stage, request.body?.note);
      }),
    );
    app.post<{ Params: { id: string }; Body: { mrr?: number; revenue30d?: number; customers?: number; currency?: string } }>("/api/ventures/:id/metrics", async (request, reply) =>
      attempt(reply, () => ventures.record(request.params.id, request.body ?? {})),
    );
    // The key is checked, written to a 0600 file and never echoed back.
    app.post<{ Params: { id: string }; Body: { key?: string } }>("/api/ventures/:id/stripe", async (request, reply) => attempt(reply, () => ventures.connect(request.params.id, request.body?.key ?? "")));
    app.delete<{ Params: { id: string } }>("/api/ventures/:id/stripe", async (request, reply) => attempt(reply, () => ventures.disconnect(request.params.id)));
    app.post<{ Params: { id: string } }>("/api/ventures/:id/sync", async (request, reply) => attempt(reply, () => ventures.sync(request.params.id)));
    // Ask the crew about this venture: a session that carries its brief.
    app.post<{ Params: { id: string }; Body: { text?: string; member?: string } }>("/api/ventures/:id/ask", async (request, reply) =>
      attempt(reply, () => {
        const v = ventures.get(request.params.id);
        if (!v) throw new Error("no such venture");
        const text = request.body?.text?.trim();
        if (!text) throw new Error("say what you want done");
        const member = request.body?.member || options.crew?.route(text)?.id;
        return { id: supervisor.launch({ ask: text, venture: v.id, member, repo: v.repo }) };
      }),
    );
  }

  // "Try now": lift a usage limit you believe has cleared. If it hasn't, the next call says so.
  app.post<{ Params: { runtime: string }; Body: { model?: string } }>("/api/runtimes/:runtime/restore", async (request) => {
    supervisor.restore(request.params.runtime, request.body?.model || undefined);
    return { ok: true };
  });

  // Ship it: push the session's branch and open a GitHub PR that explains itself.
  app.post<{ Params: { id: string } }>("/api/runs/:id/pr", async (request, reply) => {
    const run = state.runs[request.params.id];
    if (!run) return reply.code(404).send({ error: "no such session" });
    if (!run.worktree) return reply.code(409).send({ error: "this session didn't work in a repo branch" });
    if (["queued", "planning", "running", "awaiting_approval"].includes(run.status)) return reply.code(409).send({ error: "wait for the agent to finish this turn" });
    const events = store.forRun(run.id);
    const answer = [...events].reverse().find((e) => e.kind === "agent.message" && e.body.final);
    const asks = events.flatMap((e) => (e.kind === "turn.started" ? [e.body.text.split("\n")[0]!] : []));
    const body = [
      `## What was asked`,
      ...asks.map((a) => `- ${a}`),
      ``,
      `## What changed`,
      answer?.kind === "agent.message" ? answer.body.text.slice(0, 3000) : "_See the diff._",
      ``,
      `**Files:** ${run.files.map((f) => `\`${f}\``).join(", ") || "none"}`,
      run.checks.length ? `**Checks:** ${run.checks.map((c) => `${c.passed ? "✅" : "❌"} \`${c.command}\``).join(" · ")}` : "",
      ``,
      `<sub>Made with ShuaCrew · ${run.runtime}${run.model ? ` (${run.model})` : ""} · session ${run.id}</sub>`,
    ].join("\n");
    try {
      const url = await supervisor.worktrees.openPullRequest(run.worktree.path, run.worktree.branch, run.worktree.base, run.title, body);
      store.append("pr.opened", { url, branch: run.worktree.branch, base: run.worktree.base }, { run: run.id });
      return { url };
    } catch (error) {
      return reply.code(502).send({ error: (error as Error).message });
    }
  });

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

  const specs = new Specs(store, (spec) => supervisor.launch(spec));
  app.get("/api/specs", async () => specs.list());
  app.get<{ Params: { id: string } }>("/api/specs/:id", async (request, reply) => {
    const spec = specs.get(request.params.id);
    return spec ?? reply.code(404).send({ error: "no such spec" });
  });
  app.post<{ Body: { ask?: string; repo?: string } }>("/api/specs", async (request, reply) => {
    const ask = request.body?.ask?.trim();
    const repo = request.body?.repo?.trim();
    if (!ask) return reply.code(400).send({ error: "say what the spec is for" });
    if (!repo) return reply.code(400).send({ error: "pick a repo" });
    try {
      return specs.open(ask, repo);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });
  app.post<{ Params: { id: string }; Body: { line?: number; text?: string } }>("/api/specs/:id/comments", async (request, reply) => {
    const text = request.body?.text?.trim();
    const line = request.body?.line;
    if (!text || !line) return reply.code(400).send({ error: "a comment needs a line and some text" });
    try {
      return specs.comment(request.params.id, line, text);
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });
  app.post<{ Params: { id: string } }>("/api/specs/:id/revise", async (request, reply) => {
    try {
      return specs.revise(request.params.id);
    } catch (error) {
      const message = (error as Error).message;
      return reply.code(message === "no such spec" ? 404 : 400).send({ error: message });
    }
  });
  app.post<{ Params: { id: string } }>("/api/specs/:id/approve", async (request, reply) => {
    try {
      return specs.approve(request.params.id);
    } catch (error) {
      const message = (error as Error).message;
      return reply.code(message === "no such spec" ? 404 : 400).send({ error: message });
    }
  });

  app.post<{ Body: { tool?: string; input?: unknown; workspace?: string } }>("/api/policy/explain", async (request) => {
    const b = request.body ?? {};
    const call = normalise(b.tool ?? "Bash", b.input ?? {});
    return decide(call, defaultContext(b.workspace ?? process.cwd()), [{ name: "global", rules: defaultRules() }]);
  });

  app.get("/api/audit/verify", async () => store.verify());

  // Checking sign-in runs each CLI (~200ms); the answer holds for 30s unless asked fresh.
  const statusCache = new Map<string, { at: number; value: Promise<unknown> }>();
  const statusOf = (runtime: Runtime, fresh: boolean) => {
    const hit = statusCache.get(runtime.id);
    if (!fresh && hit && Date.now() - hit.at < 30_000) return hit.value;
    const value = runtime.status().catch((error: Error) => ({ installed: false, signedIn: null, detail: error.message, overridingKeys: [] }));
    statusCache.set(runtime.id, { at: Date.now(), value });
    return value;
  };
  app.get<{ Querystring: { fresh?: string } }>("/api/runtimes", async (request) =>
    Promise.all(
      [...options.runtimes.values()].map(async (runtime) => ({
        id: runtime.id,
        label: runtime.label,
        authMode: runtime.authMode,
        capabilities: runtime.capabilities,
        // Each model says if it can't be used right now ("needs credits", "out until …").
        models: runtime.models.map((m) => ({ ...m, unavailable: supervisor.unavailableModels(runtime.id)[m.id] })),
        status: await statusOf(runtime, request.query.fresh === "1"),
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

  // What a menu-bar icon or a notification needs, and nothing more: cheap to poll.
  app.get("/api/status", async () => {
    const runs = Object.values(state.runs);
    const summary = (input: unknown) => {
      const i = (input ?? {}) as Record<string, unknown>;
      const text = typeof i.command === "string" ? i.command : typeof i.file_path === "string" ? i.file_path : typeof i.path === "string" ? i.path : JSON.stringify(input ?? "");
      return text.length > 160 ? `${text.slice(0, 157)}…` : text;
    };
    return {
      running: runs.filter((r) => r.status === "running" || r.status === "planning").length,
      awaiting: Object.keys(state.approvals).length,
      reviewing: runs.filter((r) => r.status === "reviewing").length,
      approvals: Object.values(state.approvals)
        .sort((a, b) => a.seq - b.seq)
        .map((a) => ({ id: a.id, run: a.run, runTitle: (a.run && state.runs[a.run]?.title) || "", tool: a.tool, summary: summary(a.input), risk: a.risk, reason: a.reason })),
      // Only real usage windows; a model that needs paid credits isn't "limited", it's not in the plan.
      limited: Object.entries(state.limited).flatMap(([key, l]) => (l.credits ? [] : [key])),
      // What just finished, for "ready for review" / "failed" notifications.
      recent: runs
        // A playbook's phases announce themselves as reviews (below), not as finished sessions.
        .filter((r) => !r.parent && !r.labels.includes("play") && ["reviewing", "done", "failed", "merged"].includes(r.status) && Date.now() - r.updatedAt < 30 * 60_000)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 20)
        .map((r) => ({ id: r.id, title: r.title, status: r.status, reason: r.statusReason ?? "", files: r.files.length, at: r.updatedAt })),
      // Playbook phases waiting at a gate for you (and plays that stopped), for the menu bar and notifications.
      reviews: Object.values(state.plays).flatMap((play) =>
        play.phases.flatMap((phase, index) => {
          if (phase.status !== "review" && !(phase.status === "failed" && play.status === "failed")) return [];
          const member = phase.member ? state.members[phase.member] : undefined;
          return [{ play: play.id, index, key: `${play.id}:${index}:${phase.runs.length}:${phase.status}`, title: play.title, phase: phase.name, status: phase.status, who: member ? `${member.emoji} ${member.name}`.trim() : "", note: phase.note ?? "", last: index === play.phases.length - 1 }];
        }),
      ),
    };
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
    app.get("/api/skills/catalog", async (_request, reply) => {
      try {
        return await skillCatalog();
      } catch (error) {
        return reply.code(502).send({ error: (error as Error).message });
      }
    });
    app.post<{ Body: { name?: string } }>("/api/skills/install", async (request, reply) => {
      const name = request.body?.name?.trim();
      if (!name) return reply.code(400).send({ error: "name a skill" });
      try {
        const { writeFileSync } = await import("node:fs");
        const os = await import("node:os");
        const file = path.join(os.tmpdir(), `shuacrew-skill-${name}.md`);
        writeFileSync(file, await fetchSkill(name));
        return { id: memory.installSkill(file) };
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    });
    app.post<{ Body: { path?: string } }>("/api/memory/skills/install", async (request, reply) => {
      const file = request.body?.path?.trim();
      if (!file) return reply.code(400).send({ error: "give the path to a SKILL.md" });
      try {
        return { id: memory.installSkill(file) };
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
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

  if (options.mcp) {
    const mcp = options.mcp;
    app.get<{ Querystring: { q?: string } }>("/api/mcp/catalog", async (request, reply) => {
      try {
        return await mcpCatalog(request.query.q ?? "");
      } catch (error) {
        return reply.code(502).send({ error: (error as Error).message });
      }
    });
    app.get("/api/mcp", async () => mcp.list());
    app.post<{ Body: { name?: string; command?: string; args?: string[]; url?: string; auth?: "none" | "oauth" } }>("/api/mcp", async (request, reply) => {
      try {
        return mcp.add({ ...request.body, name: request.body?.name ?? "" });
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    });
    app.delete<{ Params: { id: string } }>("/api/mcp/:id", async (request, reply) => {
      try {
        mcp.remove(request.params.id);
        return { ok: true };
      } catch (error) {
        return reply.code(404).send({ error: (error as Error).message });
      }
    });
    app.post<{ Params: { id: string } }>("/api/mcp/:id/probe", async (request, reply) => {
      try {
        return await mcp.probe(request.params.id);
      } catch (error) {
        return reply.code(404).send({ error: (error as Error).message });
      }
    });
    app.post<{ Params: { id: string } }>("/api/mcp/:id/signin", async (request, reply) => {
      try {
        await mcp.signIn(request.params.id);
        return { ok: true };
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }
    });
  }

  if (options.webRoot && existsSync(options.webRoot)) {
    // The shell must always be revalidated so a new build shows up on the next load; the hashed
    // assets it points at never change, so they're cached for good.
    await app.register(fastifyStatic, {
      root: options.webRoot,
      prefix: "/",
      wildcard: false,
      cacheControl: false,
      setHeaders: (response, file) => {
        response.header("Cache-Control", file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
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

function loopbackHost(host: string | undefined): boolean {
  if (!host) return true; // HTTP/1.0 and tests send none; nothing to rebind
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return name === "127.0.0.1" || name === "localhost" || name === "[::1]";
}

function authorised(request: FastifyRequest, token: string): boolean {
  const header = request.headers.authorization;
  if (header === `Bearer ${token}`) return true;
  const query = request.query as { token?: string } | undefined;
  return query?.token === token;
}
