import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockRuntime, type Runtime, type RunSpec } from "@shuacrew/runtimes";
import { afterEach, describe, expect, it } from "vitest";
import { Crew } from "./crew.js";
import { LIBRARY, Plays } from "./plays.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});
async function until(check: () => boolean, ms = 10000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 15));
  }
}

async function world() {
  const store = new EventStore(":memory:");
  const seen: RunSpec[] = [];
  const mock = new MockRuntime({ pace: 0 });
  const spy: Runtime = Object.assign(Object.create(mock), { start: (run: RunSpec, ctx: Parameters<Runtime["start"]>[1]) => (seen.push(run), mock.start(run, ctx)) });
  const crew = new Crew(store);
  for (const m of crew.starter()) crew.set({ ...m, runtime: "mock", model: undefined });
  const supervisor = new Supervisor(store, new Map([["mock", spy]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [], crew });
  const plays = new Plays(store, supervisor);
  const { app } = await createServer({ store, supervisor, runtimes: new Map([["mock", spy]]), crew, plays });
  cleanups.push(async () => (await app.close(), plays.stop(), crew.stop(), supervisor.shutdown(), store.close()));
  return { store, plays, supervisor, app, seen };
}
const post = (app: Awaited<ReturnType<typeof world>>["app"], url: string, body: object) =>
  app.inject({ method: "POST", url, headers: { "x-shuacrew": "1", "content-type": "application/json" }, payload: JSON.stringify(body) });

describe("playbooks", () => {
  it("runs phases in order through the crew, carrying context and stopping at gates", async () => {
    const { plays, seen, app } = await world();
    expect(() => plays.start({ playbook: "validate-idea", inputs: {} })).toThrow(/The idea is needed/);
    const play = plays.start({ playbook: "validate-idea", inputs: { idea: "Steady paychecks for freelancers" } });
    expect(play.title).toBe("Validate an idea — Steady paychecks for freelancers");

    // Phase 1 is automatic; phase 2 starts by itself and knows what phase 1 said.
    await until(() => plays.get(play.id)!.phases[1]!.status === "review");
    const [one, two] = plays.get(play.id)!.phases;
    expect(one).toMatchObject({ status: "done", member: "researcher" });
    expect(one!.output).toBeTruthy();
    expect(plays.get(play.id)!.status).toBe("waiting");
    const brief = seen.find((r) => r.id === two!.run)!;
    expect(brief.ask).toContain('phase 2 of 3, "Customer pains"');
    expect(brief.ask).toContain("What the earlier phases produced");
    expect(brief.ask).toContain("save_artifact");
    expect(brief.system).toContain("the crew's Researcher"); // the member's persona came along

    // Ask for changes: the same session revises, then it's back for review.
    plays.revise(play.id, 1, "Focus on US freelancers only");
    expect(plays.get(play.id)!.phases[1]!.status).toBe("running");
    await until(() => plays.get(play.id)!.phases[1]!.status === "review");
    expect(plays.get(play.id)!.phases[1]!.runs).toHaveLength(1);

    // The menu bar sees the gate (once per round), and no "finished" noise for phase sessions.
    const status = (await app.inject({ method: "GET", url: "/api/status" })).json();
    expect(status.reviews).toEqual([expect.objectContaining({ play: play.id, index: 1, phase: "Customer pains", status: "review", who: "🔎 Rhea", last: false })]);
    expect(status.recent.filter((r: { id: string }) => plays.get(play.id)!.phases.some((p) => p.run === r.id))).toEqual([]);

    plays.approve(play.id, 1);
    await until(() => plays.get(play.id)!.phases[2]!.status === "review");
    expect(plays.get(play.id)!.phases[2]!.member).toBe("operator");
    plays.approve(play.id, 2);
    expect(plays.get(play.id)!.status).toBe("done");

    // Restart from phase 2: it and everything after run again, with a new session.
    plays.restart(play.id, 1);
    const again = plays.get(play.id)!;
    expect(again.phases.map((p) => p.status)).toEqual(["done", "running", "pending"]);
    expect(again.phases[1]!.runs).toHaveLength(2);
    await until(() => plays.get(play.id)!.phases[1]!.status === "review");
    plays.skip(play.id, 1);
    await until(() => plays.get(play.id)!.phases[2]!.status === "review");
    plays.cancel(play.id);
    expect(plays.get(play.id)!.status).toBe("cancelled");
  });

  it("keeps your own playbooks next to the built-in library", async () => {
    const { plays, app } = await world();
    expect(plays.playbooks().map((p) => p.id)).toEqual(LIBRARY.map((p) => p.id));
    expect(() => plays.save({ name: "Empty", phases: [] })).toThrow(/isn't complete/);
    const mine = plays.save({ name: "Blog post", phases: [{ name: "Draft", member: "marketer", prompt: "Write about {{topic}}", gate: "auto" }], inputs: [{ key: "topic", label: "Topic" }] });
    expect(mine).toMatchObject({ id: "blog-post", phases: [{ id: "phase-1" }] });
    expect(plays.playbooks().find((p) => p.id === "blog-post")?.builtin).toBe(false);
    expect(() => plays.remove("validate-idea")).toThrow(/can't be removed/);

    const started = await post(app, "/api/plays", { playbook: "blog-post", inputs: { topic: "pricing" } });
    expect(started.statusCode).toBe(200);
    await until(() => plays.get(started.json().id)!.status === "done");
    expect((await post(app, `/api/plays/${started.json().id}/approve`, { index: 0 })).json().error).toMatch(/isn't waiting/);
  });
});
