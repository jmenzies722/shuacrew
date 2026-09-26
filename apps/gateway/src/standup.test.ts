import Fastify from "fastify";
import { expect, it } from "vitest";
import { STANDUP_SCHEDULE, standupRoutes } from "./standup.js";

it("turns the weekday standup schedule on and off, once", async () => {
  const app = Fastify(); let list: Array<{ id: string; when?: string; ask?: string }> = [];
  standupRoutes(app, { list: () => list, set: (s) => list.push({ id: s.id!, when: s.when, ask: s.ask }), remove: (id) => (list = list.filter((s) => s.id !== id)) });
  expect((await app.inject("/api/standup")).json()).toMatchObject({ on: false });
  await app.inject({ method: "POST", url: "/api/standup", payload: { on: true } });
  await app.inject({ method: "POST", url: "/api/standup", payload: { on: true } });
  expect(list).toHaveLength(1); expect(list[0]).toMatchObject({ id: STANDUP_SCHEDULE, when: "weekdays 8:30am" });
  expect(list[0]!.ask).toMatch(/never invent work/);
  expect((await app.inject("/api/standup")).json()).toMatchObject({ on: true });
  await app.inject({ method: "POST", url: "/api/standup", payload: { on: false } });
  expect(list).toHaveLength(0);
  await app.close();
});
