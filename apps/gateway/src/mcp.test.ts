import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EventStore } from "./store.js";
import { Mcp, discover } from "./mcp.js";
import { skillName } from "./memory.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("skill install name", () => {
  it("prefers frontmatter, then the heading", () => {
    expect(skillName("---\nname: retry-upload\n---\n# Other", "x.md")).toBe("retry-upload");
    expect(skillName("# Clock", "/tmp/SKILL.md")).toBe("Clock");
  });
});

describe("mcp config", () => {
  it("installs a command server and keeps tokens out of the log", () => {
    const store = new EventStore(":memory:");
    const secrets = path.join(mkdtempSync(path.join(os.tmpdir(), "shua-mcp-")), "auth.json");
    const mcp = new Mcp(store, secrets);
    cleanups.push(() => store.close());
    const server = mcp.add({ name: "files", command: "true" });
    expect(server.auth).toBe("none");
    expect(mcp.forClaude().files).toEqual({ command: "true", args: [] });
    expect(mcp.forCodex().shua_files).toEqual({ command: "true", args: [] });
    expect(mcp.forAcp()).toEqual([{ name: "files", command: "true", args: [] }]);
    mcp.remove(server.id);
    expect(mcp.list()).toEqual([]);
    const logged = JSON.stringify([...store.read(0)]);
    expect(logged).not.toContain("access_token");
  });

  it("reads a sign-in server from its metadata", async () => {
    const meta = await discover("https://example.com/mcp", async () => new Response(JSON.stringify({ authorization_endpoint: "https://example.com/auth", token_endpoint: "https://example.com/token" })));
    expect(meta.authorization_endpoint).toBe("https://example.com/auth");
  });

  it("follows a server's protected-resource metadata to its authorization server", async () => {
    const seen: string[] = [];
    const meta = await discover("https://mcp.example.com/mcp", async (u) => {
      seen.push(String(u));
      if (String(u) === "https://mcp.example.com/.well-known/oauth-protected-resource/mcp") return new Response(JSON.stringify({ authorization_servers: ["https://auth.example.com"] }));
      if (String(u) === "https://auth.example.com/.well-known/oauth-authorization-server") return new Response(JSON.stringify({ authorization_endpoint: "https://auth.example.com/authorize", token_endpoint: "https://auth.example.com/token", registration_endpoint: "https://auth.example.com/register" }));
      return new Response("", { status: 404 });
    });
    expect(meta.registration_endpoint).toBe("https://auth.example.com/register");
    expect(seen[0]).toBe("https://mcp.example.com/.well-known/oauth-protected-resource/mcp");
  });

  it("connects to a real server and lists its tools", async () => {
    const store = new EventStore(":memory:");
    const mcp = new Mcp(store, path.join(mkdtempSync(path.join(os.tmpdir(), "shua-mcp-")), "auth.json"));
    cleanups.push(() => store.close());
    // A tiny stdio MCP server, spoken to by the real SDK client.
    const server = path.join(mkdtempSync(path.join(import.meta.dirname, "..", "node_modules", ".shua-mcp-srv-")), "server.mjs"); // where it can import the SDK
    writeFileSync(server, `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const s = new McpServer({ name: "tiny", version: "1.2.3" });
s.registerTool("echo", { description: "Say it back", annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: "text", text: "hi" }] }));
await s.connect(new StdioServerTransport());`);
    cleanups.push(() => rmSync(path.dirname(server), { recursive: true, force: true }));
    const added = mcp.add({ name: "tiny", command: process.execPath, args: [server] });
    const result = await mcp.tools(added.id);
    expect(result).toMatchObject({ ok: true, server: { name: "tiny", version: "1.2.3" }, tools: [{ name: "echo", description: "Say it back", readOnly: true }] });
    const broken = mcp.add({ name: "broken", command: "false" });
    expect((await mcp.tools(broken.id)).ok).toBe(false);
  }, 30_000);
});

describe("servers in Spark", () => {
  it("only the servers you let Spark use go to its quick turns, and the switch survives a restart", () => {
    const store = new EventStore(":memory:"), auth = path.join(mkdtempSync(path.join(os.tmpdir(), "shua-mcp-")), "auth.json");
    const mcp = new Mcp(store, auth);
    const memory = mcp.add({ name: "memory", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] });
    mcp.add({ name: "notion", url: "https://mcp.notion.com/mcp", auth: "oauth" });
    expect(mcp.forClaude("spark")).toEqual({});
    expect(Object.keys(mcp.forClaude())).toEqual(["memory", "notion"]); // the crew still gets everything
    expect(mcp.setSpark(memory.id, true).spark).toBe(true);
    expect(Object.keys(new Mcp(store, auth).forClaude("spark"))).toEqual(["memory"]);
    mcp.setSpark(memory.id, false);
    expect(mcp.forClaude("spark")).toEqual({});
    expect(() => mcp.setSpark("m_nope", true)).toThrow("no such server");
  });
});

it("gives Codex companion only opted-in MCP tools and revokes them immediately", () => {
  const store = new EventStore(":memory:"); cleanups.push(() => store.close());
  const mcp = new Mcp(store, path.join(mkdtempSync(path.join(os.tmpdir(), "shua-mcp-scope-")), "auth.json"));
  const server = mcp.add({ name: "Music tools", command: "true" });
  expect(mcp.forCodex("spark")).toEqual({});
  mcp.setSpark(server.id, true);
  expect(mcp.forCodex("spark")).toEqual({ shua_Music_tools: { command: "true", args: [] } });
  mcp.setSpark(server.id, false); expect(mcp.forCodex("spark")).toEqual({});
});

describe("GitHub with the GitHub CLI's login", () => {
  const url = "https://api.githubcopilot.com/mcp/";
  const setup = (login: () => string | undefined) => {
    const store = new EventStore(":memory:");
    const secrets = path.join(mkdtempSync(path.join(os.tmpdir(), "shua-mcp-")), "auth.json");
    cleanups.push(() => store.close());
    return { store, secrets, mcp: new Mcp(store, secrets, () => undefined, login) };
  };

  it("uses gh's login live, and never stores or logs it", () => {
    let login: string | undefined = "gho_example_not_real";
    const { store, secrets, mcp } = setup(() => login);
    const server = mcp.add({ name: "github", url, auth: "gh" });
    expect(server).toMatchObject({ auth: "gh", signedIn: true });
    expect(mcp.forClaude().github).toEqual({ type: "http", url, headers: { Authorization: "Bearer gho_example_not_real" } });
    // Named shua_github for Codex: a "github" in your own ~/.codex/config.toml must never merge with it.
    expect(mcp.forCodex().shua_github).toEqual({ url, http_headers: { Authorization: "Bearer gho_example_not_real" } });
    expect(mcp.forCodex().github).toBeUndefined();
    expect(existsSync(secrets)).toBe(false);
    expect(JSON.stringify([...store.read(0)])).not.toContain("gho_example_not_real");
    // Logged out of gh: no header, and it says so.
    login = undefined;
    expect(mcp.list()[0]!.signedIn).toBe(false);
    expect(mcp.forClaude().github).toEqual({ type: "http", url });
  });

  it("points sign-in at `gh auth login` instead of an OAuth flow", async () => {
    const { mcp } = setup(() => undefined);
    const server = mcp.add({ name: "github", url, auth: "gh" });
    await expect(mcp.signIn(server.id)).rejects.toThrow(/gh auth login/);
  });

  it("only a hosted server can use it", () => {
    const { mcp } = setup(() => "x");
    expect(mcp.add({ name: "local", command: "true", auth: "gh" }).auth).toBe("none");
  });
});
