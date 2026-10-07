import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { EventStore } from "./store.js";
import { freshStartPending, performFreshStart, requestFreshStart } from "./fresh-start.js";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "shua-fresh-"));
const base = { ask: "my secret plan", runtime: "codex", labels: [] as string[], incognito: false, title: "t" };

it("erases what you made, keeps your setup, and loses nothing on the way", () => {
  const home = tmp(), codex = tmp();
  const store = new EventStore(path.join(home, "shuacrew.db"));
  store.append("crew.member.set", { id: "eli", name: "Eli", role: "builder", persona: "Ships small, tested changes.", runtime: "codex" });
  store.append("run.created", base, { run: "r_1" });
  store.append("run.session", { runtime: "codex", id: "01a116c4-0d2e-7440-8c7d-daabdec05221" }, { run: "r_1" });
  store.append("agent.message", { turn: 1, text: "secret reply" }, { run: "r_1" });
  store.append("mcp.set", { id: "gh", name: "github", url: "https://example.com/mcp" });
  store.close();
  for (const f of ["learning.json", "screen-memory.jsonl", "personal-setup.json"]) writeFileSync(path.join(home, f), "content");
  mkdirSync(path.join(home, "uploads", "u1"), { recursive: true }); writeFileSync(path.join(home, "uploads", "u1", "a.png"), "img");
  writeFileSync(path.join(home, "settings.json"), '{"theme":"dark"}'); writeFileSync(path.join(home, "shua-look.json"), "{}");
  writeFileSync(path.join(home, "gateway.log"), "old log lines");
  const day = path.join(codex, "sessions", "2026", "10", "06"); mkdirSync(day, { recursive: true });
  writeFileSync(path.join(day, "rollout-x-01a116c4-0d2e-7440-8c7d-daabdec05221.jsonl"), "{}");
  writeFileSync(path.join(day, "rollout-x-other-session-0000.jsonl"), "{}");
  requestFreshStart(home);
  expect(freshStartPending(home)).toBe(true);

  const out = performFreshStart(home, { codexHome: codex, claudeDirs: [] });
  expect(freshStartPending(home)).toBe(false);
  expect(out).toMatchObject({ kept: 2, erased: 3, transcripts: 1 });
  // The fresh log: only setup, verifiable, no trace of the session.
  const fresh = new EventStore(path.join(home, "shuacrew.db"));
  const events = [...fresh.read(0)];
  expect(events.map((e) => e.kind)).toEqual(["crew.member.set", "mcp.set"]);
  expect(JSON.stringify(events)).not.toContain("secret");
  expect(fresh.verify()).toMatchObject({ ok: true });
  fresh.close();
  // Content moved, setup untouched, the log emptied in place, a new epoch.
  for (const f of ["learning.json", "screen-memory.jsonl", "personal-setup.json", "uploads"]) { expect(existsSync(path.join(home, f)), f).toBe(false); expect(existsSync(path.join(out.backup, f)), f).toBe(true); }
  expect(readFileSync(path.join(home, "settings.json"), "utf8")).toBe('{"theme":"dark"}');
  expect(existsSync(path.join(home, "shua-look.json"))).toBe(true);
  expect(readFileSync(path.join(home, "gateway.log"), "utf8")).toBe("");
  expect(readFileSync(path.join(out.backup, "gateway.log"), "utf8")).toBe("old log lines");
  expect(JSON.parse(readFileSync(path.join(home, "content-epoch.json"), "utf8")).epoch).toMatch(/^fresh-[\w-]+$/);
  // The old database is kept whole in the backup (a consistent copy) and the session's transcript went with it.
  const old = new EventStore(path.join(out.backup, "shuacrew.db"));
  expect([...old.read(0)]).toHaveLength(5); old.close();
  expect(existsSync(path.join(day, "rollout-x-other-session-0000.jsonl"))).toBe(true);
  expect(readFileSync(path.join(out.backup, "README.txt"), "utf8")).toContain("To undo");
});

it("a fresh home with no database yet still starts clean", () => {
  const home = tmp();
  const out = performFreshStart(home, { codexHome: tmp(), claudeDirs: [] });
  expect(out).toMatchObject({ kept: 0, erased: 0 });
  const fresh = new EventStore(path.join(home, "shuacrew.db"));
  expect([...fresh.read(0)]).toHaveLength(0); fresh.close();
});

it("the fresh log is owner-only, like the one it replaced", () => {
  const home = tmp();
  performFreshStart(home, { codexHome: tmp(), claudeDirs: [] });
  new EventStore(path.join(home, "shuacrew.db")).close();
  expect(statSync(path.join(home, "shuacrew.db")).mode & 0o777).toBe(0o600);
});
