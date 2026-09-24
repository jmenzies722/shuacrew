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

export interface McpServer {
  id: string;
  name: string;
  command?: string;
  args: string[];
  url?: string;
  auth: "none" | "oauth";
  signedIn: boolean;
}

interface Token {
  access: string;
  refresh?: string;
  clientId?: string;
  tokenEndpoint?: string;
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

  list(): McpServer[] {
    const tokens = this.tokens();
    return [...fold(this.store.read(0)).values()].map((s) => ({ ...s, signedIn: s.auth === "none" || Boolean(tokens[s.id]?.access) }));
  }

  /** What Claude should be given. Headers carry the bearer; callers must not log this. */
  forClaude(): Record<string, { command: string; args: string[] } | { type: "http"; url: string; headers?: Record<string, string> }> {
    const tokens = this.tokens();
    const out: Record<string, { command: string; args: string[] } | { type: "http"; url: string; headers?: Record<string, string> }> = {};
    for (const server of fold(this.store.read(0)).values()) {
      if (server.command) out[server.name] = { command: server.command, args: server.args };
      else if (server.url) {
        const access = tokens[server.id]?.access;
        out[server.name] = { type: "http", url: server.url, ...(access ? { headers: { Authorization: `Bearer ${access}` } } : {}) };
      }
    }
    return out;
  }

  /** Codex config.toml `mcp_servers`: command+args, or url + http_headers. */
  forCodex(): Record<string, { command: string; args: string[] } | { url: string; http_headers?: Record<string, string> }> {
    const tokens = this.tokens();
    const out: Record<string, { command: string; args: string[] } | { url: string; http_headers?: Record<string, string> }> = {};
    for (const server of fold(this.store.read(0)).values()) {
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
    for (const server of fold(this.store.read(0)).values()) {
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
    if (!fold(this.store.read(0)).has(id)) throw new Error("no such server");
    this.store.append("mcp.removed", { id });
    const tokens = this.tokens();
    if (tokens[id]) {
      delete tokens[id];
      this.writeTokens(tokens);
    }
  }

  async probe(id: string): Promise<{ ok: boolean; detail: string }> {
    const server = fold(this.store.read(0)).get(id);
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
    const server = fold(this.store.read(0)).get(id);
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
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect.url, client_id: clientId, code_verifier: verifier });
    const token = await fetch(meta.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!token.ok) throw new Error(`sign-in failed (${token.status})`);
    const json = (await token.json()) as { access_token?: string; refresh_token?: string };
    if (!json.access_token) throw new Error("sign-in returned no token");
    this.writeTokens({ ...this.tokens(), [id]: { access: json.access_token, refresh: json.refresh_token, clientId, tokenEndpoint: meta.token_endpoint } });
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

export async function discover(resource: string, get: typeof fetch = fetch): Promise<AuthMeta> {
  const origin = new URL(resource).origin;
  const response = await get(`${origin}/.well-known/oauth-authorization-server`);
  if (!response.ok) throw new Error("this server has no sign-in");
  const meta = (await response.json()) as Partial<AuthMeta>;
  if (!meta.authorization_endpoint || !meta.token_endpoint) throw new Error("this server has no sign-in");
  return meta as AuthMeta;
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
  }
  return servers;
}
