import { mkdtempSync } from "node:fs";
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
    expect(mcp.forCodex().files).toEqual({ command: "true", args: [] });
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
});
