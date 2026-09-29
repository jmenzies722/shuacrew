import { expect, it } from "vitest";
import { EventStore } from "./store.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
it("refuses to hide usage-paused work that may resume, and preserves completed audit history", async () => {
  const store = new EventStore(":memory:"), supervisor = new Supervisor(store, new Map(), { workspace: "/tmp", roots: [] });
  const { app } = await createServer({ store, supervisor, runtimes: new Map() });
  try {
    store.append("run.created", { title: "Archive fixture", ask: "Public fixture", runtime: "codex", labels: [] }, { run: "r_archive" });
    store.append("run.status", { status: "paused" }, { run: "r_archive" });
    const request = () => app.inject({ method: "POST", url: "/api/runs/r_archive/archive", headers: { "x-shuacrew": "1" }, payload: {} });
    expect((await request()).statusCode).toBe(409);
    expect(store.ofKinds("run.archived")).toHaveLength(0);
    store.append("run.status", { status: "done" }, { run: "r_archive" });
    expect((await request()).statusCode).toBe(200);
    expect(store.ofKinds("run.created")).toHaveLength(1);
    expect(store.ofKinds("run.archived")).toHaveLength(1);
  } finally { await app.close(); supervisor.shutdown(); store.close(); }
});
