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
