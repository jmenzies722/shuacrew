import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { decodeEnvelope, MobileConfigSchema, MobileDeviceSchema, parseStrictJSON } from "@shuacrew/core/mobile";
import type { MobileAuthority } from "./authority.js";

export interface MobileRoutesOptions { authority: MobileAuthority; bridgeCredential: string }
export type MobileRoutesSource = MobileRoutesOptions | (() => MobileRoutesOptions | undefined);
export function mobileRoutes(app: FastifyInstance, options?: MobileRoutesSource) {
  if (!options) return; // no credential/configuration means no remote command surface
  if (typeof options !== "function" && Buffer.byteLength(options.bridgeCredential) < 32) throw new Error("Mobile bridge credential must be at least 32 bytes");
  const authorized = new WeakMap<FastifyRequest, MobileAuthority>();
  const authority = (request: FastifyRequest) => authorized.get(request)!;
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip)) return reply.code(403).send({ error: "Native loopback bridge only" });
    let resolved: MobileRoutesOptions | undefined;
    try { resolved = typeof options === "function" ? options() : options; } catch { /* provisioning invalid: fail closed */ }
    if (!resolved || Buffer.byteLength(resolved.bridgeCredential) < 32) return reply.code(503).send({ error: "Native mobile setup required" });
    const expected = Buffer.from(resolved.bridgeCredential);
    const value = request.headers["x-shuacrew-mobile-bridge"];
    const supplied = Buffer.from(typeof value === "string" ? value : "");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply.code(401).send({ error: "Native bridge credential required" });
    authorized.set(request, resolved.authority);
  };
  const local = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers["x-shuacrew-mobile-local-action"] !== "1") return reply.code(403).send({ error: "Explicit local action required" });
  };
  const body = (request: FastifyRequest) => parseStrictJSON((request as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(request.body ?? {}), 32768);
  const guarded = { onRequest: guard };
  const mutation = { onRequest: [guard, local], bodyLimit: 32768 };
  app.get("/api/mobile/config", guarded, async request => authority(request).config());
  app.post("/api/mobile/config", mutation, async (request, reply) => {
    try { authority(request).configure(MobileConfigSchema.parse(body(request))); return authority(request).config(); }
    catch { return reply.code(400).send({ error: "Invalid mobile configuration" }); }
  });
  app.get("/api/mobile/devices", guarded, async request => authority(request).devices());
  app.get<{ Params: { after: string } }>("/api/mobile/revocations/:after", guarded, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    try {
      if (!/^(0|[1-9][0-9]{0,15})$/.test(request.params.after)) throw new Error("Invalid cursor");
      return authority(request).revocations(Number(request.params.after));
    } catch { return reply.code(400).send({ error: "Invalid revocation cursor" }); }
  });
  app.post("/api/mobile/devices", mutation, async (request, reply) => {
    try { authority(request).pair(MobileDeviceSchema.parse(body(request))); return { ok: true }; }
    catch { return reply.code(400).send({ error: "Device pairing rejected" }); }
  });
  app.post<{ Params: { id: string } }>("/api/mobile/devices/:id/revoke", mutation, async (request, reply) => {
    try {
      const parsed = body(request);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length) throw new Error("Unexpected fields");
      authority(request).revoke(request.params.id); return { ok: true };
    } catch { return reply.code(400).send({ error: "Device revocation rejected" }); }
  });
  app.get<{ Params: { id: string } }>("/api/mobile/snapshot/:id", guarded, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    try { return authority(request).snapshot(request.params.id); }
    catch { return reply.code(409).send({ error: "Snapshot unavailable; check local mobile setup" }); }
  });
  app.post("/api/mobile/commands", { onRequest: guard, bodyLimit: 32768 }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    let envelope;
    try { envelope = decodeEnvelope(body(request)); }
    catch { return reply.code(400).send({ error: "Invalid command envelope" }); }
    try { return authority(request).receive(envelope); }
    catch { return reply.code(409).send({ error: "Command not acknowledged; retain its original ID and inspect the Mac" }); }
  });
}
