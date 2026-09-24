import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyState } from "@shuacrew/core";
import { MockRuntime } from "@shuacrew/runtimes";
import { afterEach, describe, expect, it } from "vitest";
import { compose, localDay } from "./briefing.js";
import { Crew } from "./crew.js";
import { Library } from "./library.js";
import { Plays } from "./plays.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";
import { Ventures } from "./ventures.js";

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

describe("the morning briefing", () => {
  it("says what needs you, what finished, what was made and how each venture moved — without a model", async () => {
    const store = new EventStore(":memory:");
    const home = mkdtempSync(path.join(os.tmpdir(), "shua-brief-"));
    const runtimes = new Map([["mock", new MockRuntime({ pace: 0 })]]);
    const crew = new Crew(store);
    for (const m of crew.starter()) crew.set({ ...m, runtime: "mock", model: undefined });
    const supervisor = new Supervisor(store, runtimes, { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [], crew });
    const plays = new Plays(store, supervisor);
    const ventures = new Ventures(store, path.join(home, "keys.json"));
    const library = new Library(store, path.join(home, "library"));
    const { app, state, briefing } = await createServer({ store, supervisor, runtimes, crew, plays, ventures, library });
    cleanups.push(async () => (await app.close(), plays.stop(), ventures.stop(), library.stop(), crew.stop(), supervisor.shutdown(), store.close()));

    const start = Date.now();
    const run = supervisor.launch({ ask: "Fix the retry", runtime: "mock", title: "Fix the retry" });
    await until(() => ["done", "reviewing"].includes(state().runs[run]?.status ?? ""));
    library.save({ title: "Fern — pricing", content: "# Pricing", run, member: "researcher" });
    const play = plays.start({ playbook: "validate-idea", inputs: { idea: "Fern" } });
    await until(() => state().plays[play.id]?.status === "waiting");
    ventures.set({ name: "Fern", emoji: "sprout", goal: "$1k MRR" });
    ventures.stage("fern", "launching");
    ventures.record("fern", { mrr: 132, customers: 11 });

    const b = compose(state(), Date.now(), start - 1);
    expect(b.day).toBe(localDay(Date.now()));
    const section = (title: string) => b.sections.find((s) => s.title === title)?.items.map((i) => i.text) ?? [];
    expect(section("Needs you")).toEqual(["Review “Customer pains” — Validate an idea — Fern"]);
    expect(section("Finished")).toContain("Fix the retry");
    expect(section("Saved to the Library")).toEqual(["Fern — pricing — Rhea"]);
    expect(section("Ventures")).toEqual(["Fern · launching · MRR $132 · 11 customers · 13% of goal", "Next for Fern: Plan the launch"]);
    expect(b.headline).toMatch(/^1 thing needs you · \d+ sessions? finished · 1 saved to the Library · MRR \$132$/);

    // Made through the API, it lands in the state everyone sees (and the menu bar's status).
    const made = (await app.inject({ method: "POST", url: "/api/briefing", headers: { "x-shuacrew": "1", "content-type": "application/json" }, payload: "{}" })).json();
    expect(made.headline).toBe(b.headline);
    expect((await app.inject({ method: "GET", url: "/api/status" })).json().briefing).toMatchObject({ id: made.id, headline: b.headline });
    expect(briefing).toBeDefined();
  });

  it("is honest when nothing happened", () => {
    const empty = compose(emptyState(), Date.now(), 0);
    expect(empty).toMatchObject({ headline: "All quiet — nothing waiting on you", sections: [] });
  });
});
