/**
 * The phone door: Spark on your iPhone reaches this Mac here, over Tailscale and nothing else.
 *
 * A second, separate listener, so the main gateway keeps its loopback-only CSRF rules untouched. It
 * binds to this Mac's tailnet address (100.64.0.0/10) only, so the café Wi-Fi never sees a port, and
 * it opens only once you've paired (~/.shuacrew/phone-key exists, 0600, shown as a QR in Settings).
 * WireGuard encrypts the wire; the key decides who's allowed. Every request is forwarded to the main
 * app with app.inject, so validation, policy and audit are the app's own, and only routes on the
 * allowlist below get through at all.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import type { Hub } from "./hub.js";

const KEY_FILE = "phone-key";

export function readPhoneKey(home: string): string | undefined {
  const file = path.join(home, KEY_FILE);
  if (!existsSync(file)) return undefined;
  const key = readFileSync(file, "utf8").trim();
  return key.length >= 32 ? key : undefined;
}

export function makePhoneKey(home: string): string {
  const existing = readPhoneKey(home);
  if (existing) return existing;
  const key = randomBytes(32).toString("base64url");
  const file = path.join(home, KEY_FILE);
  writeFileSync(file, key, { mode: 0o600 });
  chmodSync(file, 0o600);
  return key;
}

/** This Mac's Tailscale IPv4 (the 100.64.0.0/10 CGNAT range Tailscale hands out), if it's up. */
export function tailnetAddress(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): string | undefined {
  for (const list of Object.values(interfaces)) {
    for (const i of list ?? []) {
      if (i.family !== "IPv4" || i.internal) continue;
      const [a, b] = i.address.split(".").map(Number);
      if (a === 100 && b! >= 64 && b! <= 127) return i.address;
    }
  }
  return undefined;
}

/**
 * Which main-app routes the phone may reach. `path` is the /api/... path without its query string.
 * An allowlist, so a new gateway route stays off the phone until it's added here on purpose. A phone
 * can be lost: it reads the crew, decides what's waiting, starts and steers runs, and stops one.
 * Settings, policy, files, terminals and pairing stay on the Mac.
 */
const ID = "[A-Za-z0-9_-]+";
const PHONE_ROUTES: Array<[method: string, pattern: RegExp]> = [
  ["GET", /^\/api\/snapshot$/],
  ["GET", /^\/api\/activity$/],
  ["GET", new RegExp(`^/api/runs/${ID}/events$`)],
  ["POST", new RegExp(`^/api/approvals/${ID}$`)],
  ["POST", /^\/api\/runs$/],
  ["POST", new RegExp(`^/api/runs/${ID}/followup$`)],
  ["POST", new RegExp(`^/api/runs/${ID}/cancel$`)],
  ["POST", /^\/api\/speech\/synthesize$/],
];

export function phoneAllowed(method: string, path: string): boolean {
  return PHONE_ROUTES.some(([m, pattern]) => m === method && pattern.test(path));
}

export interface PhoneDoorOptions {
  app: FastifyInstance;
  hub: Hub;
  home: string;
  port: number;
  /** Where to listen; defaults to the tailnet address. Tests and the simulator pass 127.0.0.1. */
  host?: () => string | undefined;
  /** The main app's bearer, when it was started with one. */
  token?: string;
  every?: number;
}

export class PhoneDoor {
  private door?: FastifyInstance;
  private bound?: string;
  private boundPort?: number;
  private timer?: NodeJS.Timeout;
  private busy = Promise.resolve();

  constructor(private options: PhoneDoorOptions) {}

  /** Open, move or close the door to match the pairing and the tailnet address; safe to call often. */
  refresh(): Promise<void> {
    this.busy = this.busy.then(() => this.sync()).catch(() => undefined);
    return this.busy;
  }

  start(): void {
    void this.refresh();
    // Tailscale comes and goes (sleep, a new network); follow it rather than needing a restart.
    this.timer = setInterval(() => void this.refresh(), this.options.every ?? 30_000);
    this.timer.unref();
  }

  address(): { host: string; port: number } | undefined {
    return this.bound && this.boundPort !== undefined ? { host: this.bound, port: this.boundPort } : undefined;
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.busy;
    await this.shut();
  }

  private async sync(): Promise<void> {
    const key = readPhoneKey(this.options.home);
    const host = key ? (this.options.host ?? tailnetAddress)() : undefined;
    if (host === this.bound) return;
    await this.shut();
    if (!host || !key) return;
    const door = await this.build();
    await door.listen({ host, port: this.options.port });
    this.door = door;
    this.bound = host;
    this.boundPort = (door.server.address() as { port: number }).port;
  }

  private async shut(): Promise<void> {
    const door = this.door;
    this.door = undefined;
    this.bound = undefined;
    this.boundPort = undefined;
    await door?.close();
  }

  private async build(): Promise<FastifyInstance> {
    const { app, hub, home, token } = this.options;
    const door = Fastify({ logger: false, bodyLimit: 1024 * 1024, forceCloseConnections: true });
    await door.register(fastifyWebsocket);
    door.addHook("onRequest", async (request, reply) => {
      // Read per request: unpairing deletes the file and the door turns everyone away at once.
      const key = readPhoneKey(home);
      const given = Buffer.from(String(request.headers["x-shuacrew-key"] ?? ""));
      if (!key || given.length !== Buffer.byteLength(key) || !timingSafeEqual(given, Buffer.from(key))) {
        return reply.code(401).send({ error: "this iPhone isn't paired: scan the code in ShuaCrew → Settings → Mobile on your Mac" });
      }
    });
    door.get("/phone/hello", async () => ({ ok: true, name: os.hostname().replace(/\.local$/, "") }));
    // Every fact as it happens, the same stream the dashboard reads: subscribe with the last seq you have.
    door.get("/phone/ws", { websocket: true }, (socket) => hub.attach(socket));
    door.all("/phone/api/*", async (request, reply) => {
      const url = request.url.slice("/phone".length);
      const bare = url.split("?")[0]!;
      if (!phoneAllowed(request.method, bare)) return reply.code(403).send({ error: "not open to the phone" });
      const headers: Record<string, string> = { "x-shuacrew": "1" };
      if (token) headers.authorization = `Bearer ${token}`;
      const r = await app.inject({ method: request.method as "GET", url, headers, payload: request.body as object | undefined });
      const type = r.headers["content-type"];
      if (type) void reply.header("content-type", type);
      return reply.code(r.statusCode).send(r.rawPayload);
    });
    return door;
  }
}

/** The main app's side: Settings asks for the pairing code, or forgets the phone. Same-origin only. */
export function phonePairingRoutes(app: FastifyInstance, door: PhoneDoor, home: string) {
  const local = (request: { headers: Record<string, string | string[] | undefined> }) => {
    const origin = request.headers.origin as string | undefined;
    return request.headers["x-shuacrew"] === "1" && (!origin || new URL(origin).host === request.headers.host);
  };
  app.get("/api/phone/status", async () => ({ paired: !!readPhoneKey(home), door: door.address() ?? null, tailnet: tailnetAddress() ?? null }));
  app.post("/api/phone/pair", async (request, reply) => {
    if (!local(request)) return reply.code(403).send({ error: "not for other origins" });
    const key = makePhoneKey(home);
    await door.refresh();
    const at = door.address();
    if (!at) return reply.code(409).send({ error: "Tailscale isn't up on this Mac — start it, then pair again", key: null });
    // What the QR carries: everything the phone needs, nothing it doesn't.
    return { v: 1, host: at.host, port: at.port, key, name: os.hostname().replace(/\.local$/, "") };
  });
  app.post("/api/phone/unpair", async (request, reply) => {
    if (!local(request)) return reply.code(403).send({ error: "not for other origins" });
    rmSync(path.join(home, KEY_FILE), { force: true });
    await door.refresh();
    return { ok: true };
  });
}
