import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { decide, defaultContext, defaultRules, fold, normalise } from "@shuacrew/core";
import { MockRuntime } from "@shuacrew/runtimes";
import { afterEach, describe, expect, it } from "vitest";
import { chunk, ftsQuery, Library } from "./library.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";
import { ToolServer } from "./toolserver.js";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function world() {
  const home = mkdtempSync(path.join(os.tmpdir(), "shua-lib-"));
  const store = new EventStore(":memory:");
  const library = new Library(store, path.join(home, "library"));
  const runtimes = new Map([["mock", new MockRuntime({ pace: 0 })]]);
  const supervisor = new Supervisor(store, runtimes, { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
  let state: () => ReturnType<typeof fold> = () => fold(store.read(0));
  const tools = new ToolServer(library, () => state());
  const server = await createServer({ store, supervisor, runtimes, library, tools });
  state = server.state;
  cleanups.push(async () => (await server.app.close(), library.stop(), supervisor.shutdown(), store.close()));
  return { home, store, library, tools, app: server.app, supervisor };
}

describe("the library", () => {
  it("versions artifacts, keeps the bytes private, and finds them by what they say", async () => {
    const { store, library } = await world();
    const first = library.save({ title: "Habit apps — pricing", content: "# Pricing\n\nStreaks charges $4.99 a month. Habitica is free with a subscription tier.", run: "r_1", member: "researcher" });
    expect(first).toMatchObject({ version: 1, kind: "doc", file: "habit-apps-pricing.md", member: "researcher", run: "r_1" });
    expect(statSync(library.fileOf(first.id)!).mode & 0o777).toBe(0o600);
    expect(statSync(path.join(path.dirname(library.fileOf(first.id)!), "../../../index.db")).mode & 0o777).toBe(0o600);

    const second = library.save({ id: first.id, title: "Habit apps — pricing", content: "# Pricing v2\n\nStreaks $4.99/mo; Fabulous $39.99/yr." });
    expect(second.version).toBe(2);
    expect(library.artifacts()).toHaveLength(1);
    expect(library.read(first.id).text).toContain("Fabulous"); // the index follows the latest version
    expect(library.search("streaks subscription pricing")[0]).toMatchObject({ id: first.id, type: "artifact" }); // falls back to any-word
    expect(fold(store.read(0)).artifacts[first.id]?.version).toBe(2);

    library.removeArtifact(first.id);
    expect(library.search("streaks")).toEqual([]);
  });

  it("indexes a folder of your docs, skipping secrets and junk, and notes you write", async () => {
    const { home, library } = await world();
    const docs = path.join(home, "startup");
    mkdirSync(path.join(docs, "node_modules", "x"), { recursive: true });
    writeFileSync(path.join(docs, "idea.md"), "# Idea\n\nA calm budgeting app for freelancers with irregular income.");
    writeFileSync(path.join(docs, "customers.txt"), "Interviewed 12 freelancers. Nine said invoicing delays are the worst part.");
    writeFileSync(path.join(docs, ".env"), "STRIPE_SECRET=sk_live_nope");
    writeFileSync(path.join(docs, "node_modules", "x", "readme.md"), "freelancers freelancers freelancers");
    const source = library.add(docs);
    expect(source).toMatchObject({ source: "folder", files: 2, title: "startup" });

    const hits = library.search("freelancers invoicing");
    expect(hits.map((h) => h.where)).toEqual(["customers.txt"]);
    expect(library.search("sk_live")).toEqual([]);
    expect(library.read(source.id, "idea.md").text).toContain("budgeting");

    const note = library.note("Pricing thought", "Charge $12/month, annual at $99.");
    expect(library.search("annual")[0]).toMatchObject({ id: note.id, type: "knowledge" });
    library.removeSource(source.id);
    expect(library.search("invoicing")).toEqual([]);
  });

  it("refuses to index secrets", async () => {
    const { library } = await world();
    expect(() => library.add(path.join(os.homedir(), ".ssh"))).toThrow(/can't add that/);
  });

  it("chunks by paragraph and builds safe FTS queries", () => {
    const parts = chunk(Array.from({ length: 30 }, (_, i) => `Paragraph ${i} `.repeat(12)).join("\n\n"));
    expect(parts.length).toBeGreaterThan(3);
    expect(parts.every((p) => p.length <= 2100)).toBe(true);
    expect(ftsQuery('who "pays" OR drop; table*')).toBe('"who"* "pays"* "or"* "drop"* "table"*');
  });
});

describe("the agents' tool server", () => {
  const rpc = (app: Awaited<ReturnType<typeof world>>["app"], token: string | undefined, body: object) =>
    app.inject({ method: "POST", url: "/mcp", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) }, payload: JSON.stringify(body) });

  it("speaks MCP, knows which run is calling, and saves into the library", async () => {
    const { app, tools, supervisor, library } = await world();
    const run = supervisor.launch({ ask: "research", runtime: "mock" });
    const token = tools.tokenFor(run);
    expect(tools.tokenFor(run)).toBe(token);

    expect((await rpc(app, undefined, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} })).statusCode).toBe(401);
    expect((await rpc(app, "forged", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} })).statusCode).toBe(401);

    const init = (await rpc(app, token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
    expect(init.result.serverInfo.name).toBe("shuacrew");
    expect((await rpc(app, token, { jsonrpc: "2.0", method: "notifications/initialized" })).statusCode).toBe(202);
    const list = (await rpc(app, token, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["save_artifact", "search_library", "read_library", "list_artifacts"]);

    const saved = (await rpc(app, token, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "save_artifact", arguments: { title: "Landing page", content: "<h1>Calm money</h1>", filename: "landing.html" } } })).json();
    expect(saved.result.content[0].text).toMatch(/Saved "Landing page"/);
    const art = library.artifacts()[0]!;
    expect(art).toMatchObject({ kind: "page", run, by: "agent" });
    expect(library.read(art.id).text).toBe("<h1>Calm money</h1>"); // agents read the source back
    expect(library.search("calm")[0]?.snippet).not.toContain("<h1>"); // search sees the words

    const found = (await rpc(app, token, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_library", arguments: { query: "calm money" } } })).json();
    expect(found.result.content[0].text).toContain(art.id);
    const bad = (await rpc(app, token, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "read_library", arguments: { id: "nope" } } })).json();
    expect(bad.result.isError).toBe(true);

    // The page is served sandboxed, and the web API still rejects header-less writes.
    const raw = await app.inject({ method: "GET", url: `/api/library/artifacts/${art.id}/raw` });
    expect(raw.headers["content-security-policy"]).toMatch(/^sandbox allow-scripts;.*connect-src 'none'/);
    expect((await app.inject({ method: "POST", url: "/api/library/artifacts", headers: { "content-type": "application/json" }, payload: "{}" })).statusCode).toBe(403);
  });

  it("lets agents use the library without asking, and nothing else under that name", () => {
    const ctx = defaultContext("/tmp/ws");
    const verdict = (tool: string) => decide(normalise(tool, {}), ctx, [{ name: "global", rules: defaultRules() }]).verdict;
    expect(verdict("mcp__shuacrew__save_artifact")).toBe("allow");
    expect(verdict("mcp__shuacrew__search_library")).toBe("allow");
    expect(verdict("mcp__shuacrew__delete_everything")).not.toBe("allow");
    expect(verdict("Skill")).toBe("allow"); // loading an installed skill is just reading its instructions
  });
});
