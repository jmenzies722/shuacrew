import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { fold } from "@shuacrew/core";
import { EventStore } from "./store.js";
import { ABOUT_A_SESSION, forgetRun, leftovers } from "./forget.js";

const base = { ask: "a", runtime: "claude", labels: [] as string[], incognito: false, title: "t" };
const tmp = () => mkdtempSync(path.join(os.tmpdir(), "shua-forget-"));

it("purges a session's events and re-links the chain: it still verifies, and keeps chaining after", () => {
  const store = new EventStore(":memory:");
  store.append("run.created", { ...base, title: "keep me" }, { run: "r_keep" });
  store.append("run.created", { ...base, title: "secret plan" }, { run: "r_gone" });
  store.append("agent.message", { turn: 1, text: "the secret" }, { run: "r_gone" });
  store.append("agent.message", { turn: 1, text: "hello" }, { run: "r_keep" });
  // A lesson drawn from it goes (allowlisted kind); a venture that merely mentions it stays (yours).
  store.append("lesson.learned", { id: "l1", text: "from r_gone", scope: "global", origin: "stated" }, { run: "r_gone" });
  store.append("venture.set", { id: "v1", name: "Biz", pitch: 'see "r_gone"' });
  const removed = store.purgeRun("r_gone", ABOUT_A_SESSION);
  expect(removed).toBe(3);
  expect(store.verify()).toMatchObject({ ok: true });
  const left = [...store.read(0)];
  expect(left.map((e) => e.kind)).toEqual(["run.created", "agent.message", "venture.set"]);
  expect(JSON.stringify(left)).not.toContain("secret");
  store.append("run.deleted", {}, { run: "r_gone" });
  store.append("agent.message", { turn: 2, text: "still going" }, { run: "r_keep" });
  expect(store.verify()).toMatchObject({ ok: true });
  expect(Object.keys(fold(store.read(0)).runs)).toEqual(["r_keep"]);
  store.close();
});

it("an unknown or malformed id purges nothing", () => {
  const store = new EventStore(":memory:");
  store.append("run.created", base, { run: "r_1" });
  expect(store.purgeRun("r_nope")).toBe(0);
  expect(() => store.purgeRun("r_1' OR 1=1 --")).toThrow();
  expect([...store.read(0)]).toHaveLength(1);
  store.close();
});

it("finds what a session left behind: uploads inside ShuaCrew only, artifacts, transcripts, worktrees", () => {
  const home = "/h/.shuacrew";
  const left = leftovers([
    { seq: 1, at: 1, kind: "run.created", run: "r", session: null, prev: "", hash: "", body: { ...base, ask: "look\n\nAttached files:\n- /h/.shuacrew/uploads/u1/a.png (image/png, 2 KB) · u1\n- /etc/passwd (x)" } },
    { seq: 2, at: 2, kind: "run.session", run: "r", session: null, prev: "", hash: "", body: { runtime: "codex", id: "01a116c4-0d2e-7440-8c7d-daabdec05221" } },
    { seq: 3, at: 3, kind: "run.worktree", run: "r", session: null, prev: "", hash: "", body: { path: "/h/.shuacrew/worktrees/app/r", branch: "shua/r", base: "main" } },
    { seq: 4, at: 4, kind: "artifact.saved", run: "r", session: null, prev: "", hash: "", body: { id: "a_1" } },
  ] as never, home);
  expect(left.uploads).toEqual(["/h/.shuacrew/uploads/u1/a.png"]);
  expect(left.sessions).toEqual([{ runtime: "codex", id: "01a116c4-0d2e-7440-8c7d-daabdec05221" }]);
  expect(left.worktrees).toEqual([{ path: "/h/.shuacrew/worktrees/app/r", branch: "shua/r" }]);
  expect(left.artifacts).toEqual(["a_1"]);
});

it("the route refuses a running session and deletes a finished one", async () => {
  const Fastify = (await import("fastify")).default;
  const home = tmp(), store = new EventStore(path.join(home, "shuacrew.db"));
  const app = Fastify();
  const state = { runs: {} as Record<string, { status: string }> };
  // The real route lives in server.ts; this mirrors its guard + call, so the contract stays pinned here.
  app.delete<{ Params: { id: string } }>("/api/runs/:id", async (req, reply) => {
    const run = state.runs[req.params.id];
    if (run && ["running", "queued"].includes(run.status)) return reply.code(409).send({ error: "Stop the session before deleting it." });
    return { ok: true, ...forgetRun(req.params.id, { store, home, codexHome: tmp(), claudeDirs: [] }) };
  });
  store.append("run.created", base, { run: "r_live" }); state.runs.r_live = { status: "running" };
  expect((await app.inject({ method: "DELETE", url: "/api/runs/r_live" })).statusCode).toBe(409);
  state.runs.r_live = { status: "done" };
  expect((await app.inject({ method: "DELETE", url: "/api/runs/r_live" })).json()).toMatchObject({ ok: true, events: 1 });
  await app.close(); store.close();
});
