import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { fold } from "@shuacrew/core";
import { MockRuntime } from "@shuacrew/runtimes";
import { EventStore } from "./store.js";
import { Supervisor } from "./runs.js";
import { GatewaySettingsSchema } from "./settings.js";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const c of cleanup.splice(0)) c(); });

it("holds scheduled work in the queue during quiet hours but runs your own sessions", async () => {
  const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
  const settings = GatewaySettingsSchema.parse({ quietHours: { enabled: true, start: (m + 1439) % 1440, end: (m + 2) % 1440 } });
  const store = new EventStore(":memory:");
  const supervisor = new Supervisor(store, new Map([["mock", new MockRuntime()]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-quiet-")), settings: () => settings });
  cleanup.push(() => { supervisor.shutdown(); store.close(); });
  const scheduled = supervisor.launch({ ask: "nightly check", runtime: "mock", labels: ["schedule", "s1"] });
  const mine = supervisor.launch({ ask: "hello", runtime: "mock" });
  await vi.waitFor(() => expect(fold(store.read(0)).runs[mine]?.status).not.toBe("queued"));
  expect(fold(store.read(0)).runs[scheduled]?.status).toBe("queued");
});

it("blocks agents from folders you protect, on top of the built-in ones", async () => {
  const { decide, normalise } = await import("@shuacrew/core");
  const settings = GatewaySettingsSchema.parse({ protectedPaths: ["/tmp/my-private"] });
  const store = new EventStore(":memory:");
  const supervisor = new Supervisor(store, new Map([["mock", new MockRuntime()]]), { workspace: "/tmp/ws", protectedFolders: ["/tmp/builtin-work"], settings: () => settings });
  cleanup.push(() => { supervisor.shutdown(); store.close(); });
  const policy = (supervisor as unknown as { policyFor(run: string, ws: string): { ctx: never; layers: () => never } }).policyFor("r_x", "/tmp/ws");
  const verdict = (file: string) => decide(normalise("Read", { file_path: file }), policy.ctx, policy.layers()).verdict;
  expect(verdict("/tmp/my-private/notes.txt")).toBe("deny");
  expect(verdict("/tmp/builtin-work/x.ts")).toBe("deny");
  expect(verdict("/tmp/ws/readme.md")).not.toBe("deny");
});

it("routes Auto sessions by your rules, runs your hook on finish, and stops at your token cap", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const dir = mkdtempSync(path.join(os.tmpdir(), "shua-hooks-")), marker = path.join(dir, "hook.txt");
  const settings = GatewaySettingsSchema.parse({
    router: [{ name: "quick", match: "typo", model: "fast-model", effort: "low" }],
    hooks: { onDone: `printf '%s|%s|%s' "$SHUA_STATUS" "$SHUA_RUN_ID" "$SHUA_TITLE" > ${JSON.stringify(marker)}` },
  });
  const store = new EventStore(":memory:");
  const supervisor = new Supervisor(store, new Map([["mock", new MockRuntime()]]), { workspace: dir, settings: () => settings });
  cleanup.push(() => { supervisor.shutdown(); store.close(); });
  const id = supervisor.launch({ ask: "Fix the typo in the README", runtime: "mock" });
  const created = store.forRun(id).find((e) => e.kind === "run.created");
  expect(created?.kind === "run.created" && created.body.labels).not.toContain("rule:quick"); // explicit runtime → rules don't apply
  const auto = supervisor.launch({ ask: "Fix the typo in the docs" });
  const autoCreated = store.forRun(auto).find((e) => e.kind === "run.created");
  expect(autoCreated?.kind === "run.created" && autoCreated.body).toMatchObject({ model: "fast-model", effort: "low", labels: ["rule:quick"] });
  await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 8000 });
  expect(readFileSync(marker, "utf8")).toMatch(/^done\|r_/);
});

it("stops a session that passes your token cap, with a clear reason", async () => {
  const settings = GatewaySettingsSchema.parse({ caps: { maxTokens: 1000 } });
  const store = new EventStore(":memory:");
  const supervisor = new Supervisor(store, new Map([["mock", new MockRuntime()]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-cap-")), settings: () => settings });
  cleanup.push(() => { supervisor.shutdown(); store.close(); });
  const id = supervisor.launch({ ask: "Investigate the upload timeout in parallel with subagents", runtime: "mock" });
  await vi.waitFor(() => expect(fold(store.read(0)).runs[id]?.status).toMatch(/cancelled|done|failed/), { timeout: 10000 });
  const used = store.forRun(id).reduce((n, e) => n + (e.kind === "usage.recorded" ? e.body.inputTokens + e.body.outputTokens : 0), 0);
  if (used > 1000) expect(fold(store.read(0)).runs[id]).toMatchObject({ status: "cancelled", statusReason: expect.stringContaining("token session cap") });
  else expect.fail(`mock reported only ${used} tokens — test can't exercise the cap`);
});
