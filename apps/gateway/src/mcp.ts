/**
 * MCP servers ShuaCrew adds. The log records the server. An OAuth token lives in a 0600 file,
 * never in an event. A remote server signs in through its own authorization server (PKCE).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import type { AnyEvent } from "@shuacrew/core";
import type { EventStore } from "./store.js";
import { listTools, type Connection } from "./mcp-client.js";
import { mcpPackage, resolveMcpBrand } from "./mcp-brand.js";

export interface McpServer {
  id: string;
  name: string;
  command?: string;
  args: string[];
  url?: string;
  auth: "none" | "oauth";
  signedIn: boolean;
  /** Spark may use it too (off by default: every server's tools load up front and slow Spark's first word a little). */
  spark?: boolean;
  brand?: ReturnType<typeof resolveMcpBrand>;
}

interface Token {
  access: string;
  refresh?: string;
  clientId?: string;
  tokenEndpoint?: string;
  expiresAt?: number;
  resource?: string;
}

interface AuthMeta {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
}

export class Mcp {
  constructor(
    private store: EventStore,
    private secretsFile: string,
    private openBrowser: (url: string) => void = openUrl,
  ) {}

  private connections = new Map<string, Connection>();
  private timer?: NodeJS.Timeout;

  /** Keep sign-ins alive: refresh tokens a few minutes before they expire, so agents never hit a dead one. */
  keepFresh() {
    this.timer = setInterval(() => void this.refreshDue(), 4 * 60_000);
    this.timer.unref();
    void this.refreshDue();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async refreshDue() {
    for (const [id, token] of Object.entries(this.tokens())) {
      if (token.refresh && token.expiresAt && token.expiresAt - Date.now() < 10 * 60_000) await this.refresh(id).catch(() => undefined);
    }
  }

  private async refresh(id: string): Promise<boolean> {
    const token = this.tokens()[id];
    if (!token?.refresh || !token.tokenEndpoint || !token.clientId) return false;
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refresh, client_id: token.clientId, ...(token.resource ? { resource: token.resource } : {}) });
    const response = await fetch(token.tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return false;
    const json = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!json.access_token) return false;
    this.writeTokens({ ...this.tokens(), [id]: { ...token, access: json.access_token, refresh: json.refresh_token ?? token.refresh, expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined } });
    return true;
  }

  /** Connect to the server like an agent would and list its tools (cached until asked again). */
  async tools(id: string, fresh = false): Promise<Connection> {
    const server = this.servers().get(id);
    if (!server) throw new Error("no such server");
    const cached = this.connections.get(id);
    if (cached && !fresh) return cached;
    let result = await listTools({ command: server.command, args: server.args, url: server.url, token: this.tokens()[id]?.access });
    if (!result.ok && result.error === "needs sign-in" && (await this.refresh(id).catch(() => false))) {
      result = await listTools({ url: server.url, token: this.tokens()[id]?.access });
    }
    this.connections.set(id, result);
    return result;
  }

  /** What's already known about each server's tools, without connecting. */
  /**
   * The servers, from just their own events (the kind index) — it used to fold the WHOLE log (26k events, ~100 ms)
   * on every call, and every Spark follow-up called it twice (profiled: ~205 ms of each follow-up's 210 ms).
   */
  private servers() {
    const events = [...this.store.ofKinds("mcp.set"), ...this.store.ofKinds("mcp.removed"), ...this.store.ofKinds("mcp.spark")];
    return fold(events.sort((a, b) => a.seq - b.seq));
  }

  known(): Record<string, Connection> {
    return Object.fromEntries(this.connections);
  }

  list(): McpServer[] {
    const tokens = this.tokens();
    return [...this.servers().values()].map((s) => ({ ...s, signedIn: s.auth === "none" || Boolean(tokens[s.id]?.access), brand: resolveMcpBrand({ name: s.name, url: s.url, packageId: mcpPackage(s.command, s.args) }) }));
  }

  /** Let Spark use a server's tools (or stop). */
  setSpark(id: string, on: boolean): McpServer {
    if (!this.servers().has(id)) throw new Error("no such server");
    this.store.append("mcp.spark", { id, on });
    return this.list().find((s) => s.id === id)!;
  }

  /** What Claude should be given (only the servers you've let Spark use, for `spark`). Headers carry the bearer; callers must not log this. */
  forClaude(only: "spark" | "all" = "all"): Record<string, { command: string; args: string[] } | { type: "http"; url: string; headers?: Record<string, string> }> {
    const tokens = this.tokens();
    const out: Record<string, { command: string; args: string[] } | { type: "http"; url: string; headers?: Record<string, string> }> = {};
    for (const server of this.servers().values()) {
      if (only === "spark" && !server.spark) continue;
      if (server.command) out[server.name] = { command: server.command, args: server.args };
      else if (server.url) {
        const access = tokens[server.id]?.access;
        out[server.name] = { type: "http", url: server.url, ...(access ? { headers: { Authorization: `Bearer ${access}` } } : {}) };
      }
    }
    return out;
  }

  /** Codex config.toml `mcp_servers`: command+args, or url + http_headers. */
  forCodex(only: "spark" | "all" = "all"): Record<string, { command: string; args: string[] } | { url: string; http_headers?: Record<string, string> }> {
    const tokens = this.tokens();
    const out: Record<string, { command: string; args: string[] } | { url: string; http_headers?: Record<string, string> }> = {};
    for (const server of this.servers().values()) {
      if (only === "spark" && !server.spark) continue;
      const name = server.name.replace(/[^A-Za-z0-9_-]/g, "_") || "server";
      if (server.command) out[name] = { command: server.command, args: server.args };
      else if (server.url) {
        const access = tokens[server.id]?.access;
        out[name] = { url: server.url, ...(access ? { http_headers: { Authorization: `Bearer ${access}` } } : {}) };
      }
    }
    return out;
  }

  /** ACP session list: stdio or HTTP, same names. */
  forAcp(): Array<{ name: string; command?: string; args?: string[]; type?: "http"; url?: string; headers?: Array<{ name: string; value: string }> }> {
    const tokens = this.tokens();
    const out: Array<{ name: string; command?: string; args?: string[]; type?: "http"; url?: string; headers?: Array<{ name: string; value: string }> }> = [];
    for (const server of this.servers().values()) {
      if (server.command) out.push({ name: server.name, command: server.command, args: server.args });
      else if (server.url) {
        const access = tokens[server.id]?.access;
        out.push({ name: server.name, type: "http", url: server.url, ...(access ? { headers: [{ name: "Authorization", value: `Bearer ${access}` }] } : {}) });
      }
    }
    return out;
  }

  add(input: { name: string; command?: string; args?: string[]; url?: string; auth?: "none" | "oauth" }): McpServer {
    const name = input.name.trim();
    const command = input.command?.trim();
    const url = input.url?.trim();
    if (!name) throw new Error("a server needs a name");
    if (name.toLowerCase() === "shuacrew") throw new Error("\"shuacrew\" is ShuaCrew's own tool server — pick another name");
    if (!command && !url) throw new Error("give a command or a url");
    if (command && url) throw new Error("a server is a command or a url, not both");
    const id = `m_${randomUUID().slice(0, 8)}`;
    this.store.append("mcp.set", { id, name, command, args: input.args ?? [], url, auth: url && input.auth === "oauth" ? "oauth" : "none" });
    return this.list().find((s) => s.id === id)!;
  }

  remove(id: string): void {
    if (!this.servers().has(id)) throw new Error("no such server");
    this.store.append("mcp.removed", { id });
    const tokens = this.tokens();
    if (tokens[id]) {
      delete tokens[id];
      this.writeTokens(tokens);
    }
  }

  async probe(id: string): Promise<{ ok: boolean; detail: string }> {
    const server = this.servers().get(id);
    if (!server) throw new Error("no such server");
    if (server.command) return probeCommand(server.command, server.args);
    const headers: Record<string, string> = {};
    const access = this.tokens()[id]?.access;
    if (access) headers.Authorization = `Bearer ${access}`;
    try {
      const response = await fetch(server.url!, { headers, signal: AbortSignal.timeout(2500) });
      if (response.status === 401) return { ok: false, detail: "needs sign-in" };
      return { ok: response.ok, detail: `${response.status}` };
    } catch (error) {
      return { ok: false, detail: (error as Error).message.split("\n")[0] ?? "unreachable" };
    }
  }

  /** Authorization-code + PKCE against the server's own metadata. Resolves when the browser returns. */
  async signIn(id: string): Promise<void> {
    const server = this.servers().get(id);
    if (!server?.url || server.auth !== "oauth") throw new Error("this server doesn't sign in");
    const meta = await discover(server.url);
    const redirect = await listenOnce();
    const clientId = await register(meta, redirect.url);
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(16).toString("base64url");
    const auth = new URL(meta.authorization_endpoint);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("redirect_uri", redirect.url);
    auth.searchParams.set("code_challenge", challenge);
    auth.searchParams.set("code_challenge_method", "S256");
    auth.searchParams.set("state", state);
    auth.searchParams.set("resource", server.url);
    this.openBrowser(auth.toString());
    const code = await redirect.code(state);
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect.url, client_id: clientId, code_verifier: verifier, resource: server.url });
    const token = await fetch(meta.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!token.ok) throw new Error(`sign-in failed (${token.status})`);
    const json = (await token.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error("sign-in returned no token");
    this.writeTokens({
      ...this.tokens(),
      [id]: { access: json.access_token, refresh: json.refresh_token, clientId, tokenEndpoint: meta.token_endpoint, resource: server.url, expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined },
    });
    this.connections.delete(id);
  }

  private tokens(): Record<string, Token> {
    try {
      return JSON.parse(readFileSync(this.secretsFile, "utf8")) as Record<string, Token>;
    } catch {
      return {};
    }
  }

  private writeTokens(tokens: Record<string, Token>): void {
    writeFileSync(this.secretsFile, JSON.stringify(tokens), { mode: 0o600 });
    chmodSync(this.secretsFile, 0o600); // `mode` only applies when the file is created
  }
}

/**
 * Where to sign in. The MCP way first (RFC 9728): the server names its authorization server in
 * protected-resource metadata; then that server's own metadata (RFC 8414, or OpenID). Older servers
 * keep the metadata at their own origin.
 */
export async function discover(resource: string, get: typeof fetch = fetch): Promise<AuthMeta> {
  const url = new URL(resource);
  const json = async (u: string) => {
    try {
      const r = await get(u, { signal: AbortSignal.timeout(8000) });
      return r.ok ? ((await r.json()) as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  };
  const path = url.pathname.replace(/\/$/, "");
  const prm = (await json(`${url.origin}/.well-known/oauth-protected-resource${path}`)) ?? (await json(`${url.origin}/.well-known/oauth-protected-resource`));
  const issuers = [...((prm?.authorization_servers as string[] | undefined) ?? []), url.origin];
  for (const issuer of issuers) {
    const i = new URL(issuer);
    const ipath = i.pathname.replace(/\/$/, "");
    for (const candidate of [
      `${i.origin}/.well-known/oauth-authorization-server${ipath}`,
      `${issuer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`,
      `${i.origin}/.well-known/openid-configuration${ipath}`,
      `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
    ]) {
      const meta = await json(candidate);
      if (meta?.authorization_endpoint && meta.token_endpoint) return meta as unknown as AuthMeta;
    }
  }
  throw new Error("this server has no sign-in");
}

async function register(meta: AuthMeta, redirect: string): Promise<string> {
  if (!meta.registration_endpoint) throw new Error("this server has no sign-in");
  const response = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "ShuaCrew", redirect_uris: [redirect], grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none" }),
  });
  if (!response.ok) throw new Error("couldn't register for sign-in");
  const json = (await response.json()) as { client_id?: string };
  if (!json.client_id) throw new Error("couldn't register for sign-in");
  return json.client_id;
}

function listenOnce(): Promise<{ url: string; code: (state: string) => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<p>Signed in. You can close this tab.</p>");
      server.close();
      if (code && state) pending(state, code);
    });
    const waiters = new Map<string, (code: string) => void>();
    const pending = (state: string, code: string) => waiters.get(state)?.(code);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("couldn't listen for sign-in"));
      resolve({
        url: `http://127.0.0.1:${address.port}/callback`,
        code: (state) =>
          new Promise((done, fail) => {
            const timer = setTimeout(() => fail(new Error("sign-in timed out")), 180_000);
            waiters.set(state, (value) => {
              clearTimeout(timer);
              done(value);
            });
          }),
      });
    });
  });
}

function probeCommand(command: string, args: string[]): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: true, detail: "running" });
    }, 400);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, detail: error.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true, detail: "exited 0" } : { ok: false, detail: `exited ${code}` });
    });
  });
}

function openUrl(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  execFile(command, args, () => undefined);
}

function fold(events: Iterable<AnyEvent>): Map<string, Omit<McpServer, "signedIn">> {
  const servers = new Map<string, Omit<McpServer, "signedIn">>();
  for (const event of events) {
    if (event.kind === "mcp.set") {
      servers.set(event.body.id, { id: event.body.id, name: event.body.name, command: event.body.command, args: event.body.args, url: event.body.url, auth: event.body.auth });
    }
    if (event.kind === "mcp.removed") servers.delete(event.body.id);
    if (event.kind === "mcp.spark") { const s = servers.get(event.body.id); if (s) servers.set(s.id, { ...s, spark: event.body.on }); }
  }
  return servers;
}
