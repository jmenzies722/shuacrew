import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold } from "@shuacrew/core";
import { MockRuntime, type Runtime, type RunSpec } from "@shuacrew/runtimes";
import { afterEach, describe, expect, it } from "vitest";
import { Crew } from "./crew.js";
import { Memory } from "./memory.js";
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
  process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
  const store = new EventStore(":memory:");
  const seen: RunSpec[] = [];
  const mock = new MockRuntime({ pace: 0 });
  const spy: Runtime = Object.assign(Object.create(mock), { start: (run: RunSpec, ctx: Parameters<Runtime["start"]>[1]) => (seen.push(run), mock.start(run, ctx)) });
  const memory = new Memory(store);
  const crew = new Crew(store);
  const supervisor = new Supervisor(store, new Map([["mock", spy]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [], memory, crew });
  const { app } = await createServer({ store, supervisor, runtimes: new Map([["mock", spy]]), crew, memory });
  cleanups.push(async () => (await app.close(), crew.stop(), memory.stop(), supervisor.shutdown(), store.close()));
  return { store, crew, memory, supervisor, app, seen };
}
const status = (store: EventStore, run: string) => fold(store.read(0)).runs[run]?.status ?? "";
const post = (app: Awaited<ReturnType<typeof world>>["app"], url: string, body: object) =>
  app.inject({ method: "POST", url, headers: { "x-shuacrew": "1", "content-type": "application/json" }, payload: JSON.stringify(body) });

describe("the crew", () => {
  it("adds the starter team once, and routes work to the member it's for", async () => {
    const { crew } = await world();
    expect(crew.starter().map((m) => m.role)).toEqual(["Researcher", "Engineer", "Designer", "Marketer", "Operator"]);
    expect(crew.starter()).toHaveLength(5); // idempotent
    expect(crew.route("Research the market and the competitors for a habit tracker")?.id).toBe("researcher");
    expect(crew.route("Fix the failing test in the api")?.id).toBe("engineer");
    expect(crew.route("Write the launch headline and the waitlist email")?.id).toBe("marketer");
    expect(crew.route("Set up Stripe payments and pricing")?.id).toBe("operator");
    expect(crew.route("hello there")).toBeUndefined();
  });

  it("talks in one standing thread, with the member's persona and model, and its own lessons", async () => {
    const { store, crew, memory, app, seen } = await world();
    crew.set({ id: "sam", name: "Sam", role: "Tester", persona: "You break things on purpose.", runtime: "mock", model: "mock-fast", color: "#fff", emoji: "", triggers: [] });
    memory.teach("Always test the empty input first.", "crew:sam");
    const first = (await post(app, "/api/crew/sam/talk", { text: "Test the empty input of the upload form" })).json().run as string;
    await until(() => ["done", "reviewing"].includes(status(store, first)));
    const spec = seen.find((s) => s.id === first)!;
    expect(spec.system).toContain("You are Sam, the crew's Tester. You break things on purpose.");
    expect(spec.system).toContain("Always test the empty input first."); // the member's own lesson
    expect(spec.model).toBe("mock-fast");
    const again = (await post(app, "/api/crew/sam/talk", { text: "Now try a huge file" })).json().run;
    expect(again).toBe(first); // same standing thread
    expect(fold(store.read(0)).members.sam).toMatchObject({ thread: first, sessions: 1 });
  });
});
