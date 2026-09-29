/**
 * The door for Spark in Chrome. The gateway otherwise refuses every cross-origin request (the CSRF
 * defence); these few routes accept one only from a Chrome extension that presents the pairing key —
 * a random secret in ~/.shuacrew/extension-key (0600), shown to you in Settings → Spark, pasted once
 * into the extension. The key never goes to a web page, and page text is handled as untrusted.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Ask } from "./terminal-ai.js";
import { crewBrief, validWebInput, webAnswer } from "./web-spark.js";
import { WebBridge, validWebCommand, type WebResult } from "./web-bridge.js";

export function extensionKey(home: string): string {
  const file = path.join(home, "extension-key");
  if (existsSync(file)) {
    const key = readFileSync(file, "utf8").trim();
    if (key.length >= 32) return key;
  }
  const key = randomBytes(24).toString("base64url");
  writeFileSync(file, key, { mode: 0o600 });
  chmodSync(file, 0o600);
  return key;
}

export function extRoutes(app: FastifyInstance, options: { home: string; ask?: Ask; bridge?: WebBridge }) {
  const bridge = options.bridge ?? new WebBridge();
  // Made on first use (not at startup), so a gateway that never pairs never writes a key.
  let made: string | undefined;
  const keyNow = () => (made ??= extensionKey(options.home));
  /** Only a Chrome extension holding the pairing key. */
  const paired = (request: FastifyRequest, reply: FastifyReply) => {
    const key = keyNow();
    const origin = String(request.headers.origin ?? "");
    const given = Buffer.from(String(request.headers["x-shuacrew-key"] ?? ""));
    const ok = origin.startsWith("chrome-extension://") && given.length === Buffer.byteLength(key) && timingSafeEqual(given, Buffer.from(key));
    if (!ok) void reply.code(401).send({ error: "Spark for Chrome isn't paired: paste the key from ShuaCrew → Settings → Spark" });
    return ok;
  };

  // For ShuaCrew's own Settings page only (same origin, with the app's header): the key to paste.
  app.get("/api/ext/key", async (request, reply) => {
    const origin = request.headers.origin;
    if (request.headers["x-shuacrew"] !== "1" || (origin && new URL(origin).host !== request.headers.host)) return reply.code(403).send({ error: "not for other origins" });
    return { key: keyNow() };
  });

  app.post("/api/ext/ping", async (request, reply) => (paired(request, reply) ? { ok: true, name: "ShuaCrew" } : reply));

  // Spark → Chrome: the extension collects commands here (a long poll) and answers each once.
  app.post("/api/ext/next", async (request, reply) => {
    if (!paired(request, reply)) return reply;
    const command = await bridge.next(20_000);
    return command ? { command } : {};
  });
  app.post<{ Body: { id?: string; result?: WebResult } }>("/api/ext/result", async (request, reply) => {
    if (!paired(request, reply)) return reply;
    const { id, result } = request.body ?? {};
    if (typeof id === "string" && result && typeof result === "object") bridge.answer(id, { found: result.found === true, name: typeof result.name === "string" ? result.name.slice(0, 200) : undefined, role: typeof result.role === "string" ? result.role.slice(0, 40) : undefined,
      rect: result.rect && [result.rect.x, result.rect.y, result.rect.w, result.rect.h].every((n) => typeof n === "number" && Number.isFinite(n)) ? result.rect : undefined, error: typeof result.error === "string" ? result.error.slice(0, 200) : undefined });
    return { ok: true };
  });
  // ShuaCrew's own pages (same origin; the usual CSRF guard applies): find, click or type into a page element by name.
  app.get("/api/web/status", async () => ({ connected: bridge.connected() }));
  app.post("/api/web/act", async (request, reply) => {
    const command = validWebCommand(request.body);
    if (!command) return reply.code(400).send({ error: "find, click or type, with the element's name" });
    if (!bridge.connected()) return reply.code(503).send({ error: "Spark for Chrome isn't connected" });
    const result = await bridge.send(command, 3000);
    return result ?? reply.code(504).send({ error: "Chrome didn't answer" });
  });

  app.post("/api/ext/act", async (request, reply) => {
    if (!paired(request, reply)) return reply;
    const input = validWebInput(request.body);
    if (typeof input === "string") return reply.code(400).send({ error: input });
    try {
      return { answer: await webAnswer(input, options.ask) };
    } catch (error) {
      return reply.code(502).send({ error: (error as Error).message });
    }
  });

  // Save and hand-off reuse the app's own routes, so the same validation and audit apply.
  app.post<{ Body: { text?: string; page?: { url?: string; title?: string } } }>("/api/ext/save", async (request, reply) => {
    if (!paired(request, reply)) return reply;
    const text = request.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: "nothing to save" });
    const page = request.body?.page ?? {};
    const note = `${text.slice(0, 50_000)}${page.url ? `\n\nSource: ${page.title ? `${page.title} — ` : ""}${page.url}` : ""}`;
    const r = await app.inject({ method: "POST", url: "/api/library/knowledge", headers: { "x-shuacrew": "1" }, payload: { title: (page.title ?? "From the web").slice(0, 120), note } });
    return reply.code(r.statusCode).send(r.json());
  });

  app.post<{ Body: { task?: string; text?: string; page?: { url?: string; title?: string } } }>("/api/ext/crew", async (request, reply) => {
    if (!paired(request, reply)) return reply;
    const task = request.body?.task?.trim();
    if (!task) return reply.code(400).send({ error: "what should the crew do?" });
    const r = await app.inject({ method: "POST", url: "/api/runs", headers: { "x-shuacrew": "1" }, payload: { ask: crewBrief(task, request.body?.text, request.body?.page), title: task.slice(0, 80), labels: ["mission"] } });
    return reply.code(r.statusCode).send(r.json());
  });
}
