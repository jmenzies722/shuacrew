import Fastify from "fastify";
import { expect, it } from "vitest";
import { IDEA_SCHEDULE, ideaFrom, ideaRoutes } from "./ideas.js";

it("turns a spoken idea into a short name and the full pitch", () => {
  expect(ideaFrom("idea: a scheduling app for dog walkers — payments and trust built in")).toEqual({ name: "A scheduling app for dog walkers", pitch: "a scheduling app for dog walkers — payments and trust built in" });
  expect(ideaFrom("New idea - receipts ledger for verification claims. Needs an API")?.name).toBe("Receipts ledger for verification claims");
  expect(ideaFrom("idea:  ")).toBeNull();
});

it("files the idea as a venture and sets up nightly scoring once", async () => {
  const app = Fastify(), made: unknown[] = [], schedules: Array<{ id: string; when: string; ask?: string }> = [];
  ideaRoutes(app, { set: (v) => (made.push(v), { id: v.id ?? "x", name: v.name }) }, { list: () => schedules, set: (s) => schedules.push({ id: s.id!, when: s.when, ask: s.ask }) });
  const r = await app.inject({ method: "POST", url: "/api/ideas", payload: { text: "idea: dog walker CRM" } });
  expect(r.statusCode).toBe(200); expect(r.json()).toMatchObject({ venture: { name: "Dog walker CRM" }, scoring: true });
  await app.inject({ method: "POST", url: "/api/ideas", payload: { text: "idea: second one" } });
  expect(schedules).toHaveLength(1); expect(schedules[0]).toMatchObject({ id: IDEA_SCHEDULE, when: "daily 2am" });
  expect(schedules[0]!.ask).toMatch(/Never invent numbers/);
  expect((await app.inject({ method: "POST", url: "/api/ideas", payload: { text: "idea:" } })).statusCode).toBe(400);
  expect(made).toHaveLength(2);
  await app.close();
});
