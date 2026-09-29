import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { ScreenMemory, screenMemoryRoutes, search, terms } from "./screen-memory.js";

it("keeps meaningful words, not filler", () => {
  expect(terms("what was that error from earlier, the ECONNREFUSED one?")).toEqual(["error", "econnrefused", "one"]);
});

it("finds the moment that mentions what you ask about, preferring recent ones", () => {
  const now = Date.UTC(2026, 8, 26, 15);
  const moments = [
    { at: now - 3 * 3_600_000, app: "Terminal", window: "zsh", text: "npm ERR! code ECONNREFUSED connect ECONNREFUSED 127.0.0.1:5432" },
    { at: now - 10 * 60_000, app: "Safari", window: "Stripe", text: "Monthly revenue $1,240 — 38 customers" },
  ];
  const r = search(moments, "what was that ECONNREFUSED error", now);
  expect(r).toHaveLength(1); expect(r[0]).toMatchObject({ app: "Terminal" }); expect(r[0]!.excerpt).toContain("127.0.0.1:5432");
  expect(search(moments, "how much revenue", now)[0]).toMatchObject({ app: "Safari" });
  expect(search(moments, "the", now)).toEqual([]);
});

it("stores text only, skips unchanged screens, forgets after 3 days, and clears on request", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "screenmem-")), file = path.join(dir, "m.jsonl");
  try {
    const mem = new ScreenMemory(file), now = Date.now();
    expect(mem.add({ at: now - 4 * 86_400_000, app: "Old", window: "", text: "something from four days ago, long enough" }, now)).toBe(true);
    expect(mem.add({ at: now, app: "Xcode", window: "Build", text: "error: cannot find 'Foo' in scope — line 42" }, now)).toBe(true);
    expect(mem.add({ at: now + 1, app: "Xcode", window: "Build", text: "error: cannot find 'Foo' in scope — line 42" }, now)).toBe(false);
    expect(mem.add({ at: now, app: "X", window: "", text: "too short" }, now)).toBe(false);
    expect(mem.all(now).map((m) => m.app)).toEqual(["Xcode"]);
    const app = Fastify(); screenMemoryRoutes(app, mem);
    expect((await app.inject("/api/screen-memory/search?q=cannot%20find%20Foo")).json().results[0]).toMatchObject({ app: "Xcode" });
    await app.inject({ method: "DELETE", url: "/api/screen-memory" });
    expect(mem.all()).toEqual([]);
    await app.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
