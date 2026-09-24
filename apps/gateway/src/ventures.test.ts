import { mkdtempSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockRuntime, type Runtime, type RunSpec } from "@shuacrew/runtimes";
import { afterEach, describe, expect, it } from "vitest";
import { Crew } from "./crew.js";
import { Plays } from "./plays.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";
import { parseMoney, summarise, verdictOf, Ventures } from "./ventures.js";

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

/** A tiny Stripe: two active subscriptions and three charges, paged one per request. */
function fakeStripe(seen: string[]) {
  const subs = [
    { id: "sub_1", customer: "cus_1", currency: "usd", items: { data: [{ quantity: 1, price: { unit_amount: 1200, currency: "usd", recurring: { interval: "month", interval_count: 1 } } }] } },
    { id: "sub_2", customer: "cus_2", currency: "usd", items: { data: [{ quantity: 2, price: { unit_amount: 9900, currency: "usd", recurring: { interval: "year", interval_count: 1 } } }] } },
  ];
  const charges = [
    { id: "ch_1", paid: true, status: "succeeded", amount_captured: 1200, amount_refunded: 0, currency: "usd", customer: "cus_1" },
    { id: "ch_2", paid: true, status: "succeeded", amount_captured: 19800, amount_refunded: 1000, currency: "usd", customer: "cus_2" },
    { id: "ch_3", paid: false, status: "failed", amount_captured: 0, amount_refunded: 0, currency: "usd", customer: "cus_3" },
  ];
  return (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    seen.push(`${u.pathname} ${(init?.headers as Record<string, string>).Authorization}`);
    const page = <T extends { id: string }>(all: T[]) => {
      const after = u.searchParams.get("starting_after");
      const i = after ? all.findIndex((x) => x.id === after) + 1 : 0;
      return { data: all.slice(i, i + 1), has_more: i + 1 < all.length };
    };
    const body = u.pathname === "/v1/account" ? { error: { message: "The provided key does not have the required permissions" } } : u.pathname === "/v1/balance" ? { available: [] } : u.pathname === "/v1/subscriptions" ? page(subs) : page(charges);
    return new Response(JSON.stringify(body), { status: u.pathname === "/v1/account" ? 403 : 200 });
  }) as typeof fetch;
}

async function world() {
  const home = mkdtempSync(path.join(os.tmpdir(), "shua-venture-"));
  const store = new EventStore(":memory:");
  const seen: RunSpec[] = [];
  const calls: string[] = [];
  const mock = new MockRuntime({ pace: 0 });
  const spy: Runtime = Object.assign(Object.create(mock), { start: (run: RunSpec, ctx: Parameters<Runtime["start"]>[1]) => (seen.push(run), mock.start(run, ctx)) });
  const crew = new Crew(store);
  for (const m of crew.starter()) crew.set({ ...m, runtime: "mock", model: undefined });
  const ventures = new Ventures(store, path.join(home, "keys.json"), fakeStripe(calls));
  const supervisor = new Supervisor(store, new Map([["mock", spy]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [], crew, ventureBrief: (id) => ventures.brief(id) });
  const plays = new Plays(store, supervisor);
  ventures.startPlay = (input) => plays.start(input);
  const { app, state } = await createServer({ store, supervisor, runtimes: new Map([["mock", spy]]), crew, plays, ventures });
  cleanups.push(async () => (await app.close(), plays.stop(), ventures.stop(), crew.stop(), supervisor.shutdown(), store.close()));
  return { home, store, ventures, app, state, seen, calls, plays };
}
const post = (app: Awaited<ReturnType<typeof world>>["app"], url: string, body: object) =>
  app.inject({ method: "POST", url, headers: { "x-shuacrew": "1", "content-type": "application/json" }, payload: JSON.stringify(body) });

describe("ventures", () => {
  it("tracks a startup's stage and briefs every session working on it", async () => {
    const { ventures, app, state, seen } = await world();
    const v = ventures.set({ name: "Fern", pitch: "A steady weekly paycheck for freelancers", goal: "$1k MRR by March", customer: "US freelancers" });
    expect(v).toMatchObject({ id: "fern", stage: "idea", goalMrr: 1000, emoji: "🌱" });
    expect(ventures.set({ name: "Other", goal: "50 customers" }).goalMrr).toBeUndefined();
    ventures.stage("fern", "validating", "landing page is up");
    expect(ventures.get("fern")!.stages.map((s) => s.stage)).toEqual(["idea", "validating"]);

    // Asking about the venture routes to the right member and carries the venture's brief.
    const asked = await post(app, "/api/ventures/fern/ask", { text: "Research competitors and pricing" });
    const run = asked.json().id as string;
    await until(() => seen.some((r) => r.id === run));
    const spec = seen.find((r) => r.id === run)!;
    expect(spec.system).toContain('the venture "Fern" (stage: validating)');
    expect(spec.system).toContain("the crew's Researcher");
    expect(state().runs[run]).toMatchObject({ venture: "fern", member: "researcher" });

    // A playbook started for the venture tags every phase with it.
    const play = (await post(app, "/api/plays", { playbook: "competitor-teardown", venture: "fern", inputs: { competitor: "YNAB" } })).json();
    await until(() => Boolean(state().plays[play.id]?.phases[0]?.run));
    expect(state().plays[play.id]!.venture).toBe("fern");
    expect(state().runs[state().plays[play.id]!.phases[0]!.run!]!.venture).toBe("fern");
    expect((await post(app, "/api/plays", { playbook: "competitor-teardown", venture: "nope", inputs: { competitor: "x" } })).statusCode).toBe(400);
  });

  it("reads revenue from Stripe with a read-only key it keeps out of the log", async () => {
    const { ventures, store, home, calls, app } = await world();
    ventures.set({ name: "Fern" });
    await expect(ventures.connect("fern", "sk_live_abc123")).rejects.toThrow(/restricted key with read-only access/);
    await expect(ventures.connect("fern", "hello")).rejects.toThrow(/doesn't look like/);

    const res = await post(app, "/api/ventures/fern/stripe", { key: "rk_test_abc123" });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("rk_test");
    const v = ventures.get("fern")!;
    expect(v.stripe).toMatchObject({ connected: true, mode: "test" });
    // $12/mo + 2 × $99/yr = 12 + 16.50; charges 12 + (198 − 10); two paying customers.
    expect(v.metrics).toMatchObject({ source: "stripe", currency: "usd", mrr: 28.5, revenue30d: 200, customers: 2, subscriptions: 2 });
    expect(calls.every((c) => c.endsWith("Bearer rk_test_abc123"))).toBe(true);
    expect(calls.filter((c) => c.startsWith("/v1/charges"))).toHaveLength(3); // followed the pages

    const keys = path.join(home, "keys.json");
    expect(statSync(keys).mode & 0o777).toBe(0o600);
    expect(JSON.stringify([...store.read(0)])).not.toContain("rk_test_abc123");

    ventures.disconnect("fern");
    expect(readFileSync(keys, "utf8")).toBe("{}");
    await expect(ventures.sync("fern")).rejects.toThrow(/connect Stripe first/);
  });

  it("takes numbers you type in, and works the money out right", () => {
    expect(parseMoney("$2.5k MRR")).toBe(2500);
    expect(parseMoney("reach 100 users")).toBeUndefined();
    const yen = summarise([{ id: "s", customer: "c", currency: "jpy", items: { data: [{ price: { unit_amount: 1200, currency: "jpy", recurring: { interval: "month", interval_count: 3 } } }] } }], []);
    expect(yen).toMatchObject({ currency: "jpy", mrr: 400 }); // zero-decimal currency, quarterly price
  });

  it("records manual numbers", async () => {
    const { ventures } = await world();
    ventures.set({ name: "Fern" });
    expect(() => ventures.record("fern", {})).toThrow(/at least one number/);
    ventures.record("fern", { mrr: 84, customers: 7 });
    expect(ventures.get("fern")!.metrics).toMatchObject({ source: "manual", mrr: 84, customers: 7 });
    expect(ventures.get("fern")!.history).toHaveLength(1);
  });

  it("moves a venture on when its playbook finishes — and on autopilot, starts the next one", async () => {
    const { ventures, plays, state, store } = await world();
    ventures.set({ name: "Fern", pitch: "Steady paychecks", autopilot: true });
    const finish = (play: string, verdict: string) => {
      const p = state().plays[play]!;
      p.phases.forEach((_, i) => store.append("play.phase", { play, index: i, status: "done", output: i === p.phases.length - 1 ? verdict : "ok" }));
      store.append("play.status", { play, status: "done" });
    };
    const settle = () => new Promise((r) => setTimeout(r, 30));

    // A NO-GO keeps it where it is, and says why.
    const first = plays.start({ playbook: "validate-idea", venture: "fern", inputs: { idea: "Fern" } });
    plays.cancel(first.id);
    finish(first.id, "Scores… Finish: NO-GO — nobody pays for this.");
    await settle();
    expect(ventures.get("fern")!.stage).toBe("idea");
    expect(ventures.get("fern")!.stages.at(-1)?.note).toMatch(/NO-GO/);

    // A GO moves it to validating, and autopilot starts the landing page playbook.
    const second = plays.start({ playbook: "validate-idea", venture: "fern", inputs: { idea: "Fern" } });
    plays.cancel(second.id);
    finish(second.id, "Riskiest assumption… Verdict: GO");
    await settle();
    expect(ventures.get("fern")!.stage).toBe("validating");
    const landing = Object.values(state().plays).find((p) => p.playbook === "landing-page" && p.venture === "fern");
    expect(landing?.inputs.product).toBe("Fern — Steady paychecks");

    // First money in: launching -> earning; the Monday review starts once, not twice.
    ventures.stage("fern", "launching");
    ventures.record("fern", { mrr: 12 });
    await settle();
    expect(ventures.get("fern")!.stage).toBe("earning");
    await settle();
    ventures.weeklyReview();
    ventures.weeklyReview();
    expect(Object.values(state().plays).filter((p) => p.playbook === "growth-review")).toHaveLength(1);
  });

  it("reads a verdict by its last deciding word", () => {
    expect(verdictOf("Not a NO-GO at all. Final: GO")).toBe("go");
    expect(verdictOf("It could be GO later, but for now: NO-GO")).toBe("no-go");
    expect(verdictOf("PIVOT to agencies")).toBe("pivot");
    expect(verdictOf("going well")).toBeUndefined();
  });
});
