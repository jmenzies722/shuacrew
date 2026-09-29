import Fastify from "fastify";
import { expect, it } from "vitest";
import { ROUTINES, routineRoutes } from "./routines.js";
import { parseCadence as cadence } from "@shuacrew/core";

it("every routine has a schedule the gateway understands and a brief that saves to the Library honestly", () => {
  for (const r of ROUTINES) {
    expect(() => cadence(r.when)).not.toThrow();
    expect(r.ask).toMatch(/api\/library\/artifacts/);
    expect(r.ask).toMatch(/unknown|Only what the data shows|read only/i);
  }
  expect(ROUTINES.find((r) => r.id === "personal-wiki")!.ask).toMatch(/never read those/);
});

it("switches routines on and off as schedules", async () => {
  const app = Fastify(); let list: Array<{ id: string }> = [];
  routineRoutes(app, { list: () => list, set: (s) => list.push({ id: s.id! }), remove: (id) => (list = list.filter((s) => s.id !== id)) });
  await app.inject({ method: "POST", url: "/api/routines/weekly-growth", payload: { on: true } });
  expect((await app.inject("/api/routines")).json().find((r: { id: string }) => r.id === "weekly-growth")).toMatchObject({ on: true });
  expect((await app.inject({ method: "POST", url: "/api/routines/nope", payload: { on: true } })).statusCode).toBe(404);
  await app.inject({ method: "POST", url: "/api/routines/weekly-growth", payload: { on: false } });
  expect(list).toEqual([]);
  await app.close();
});
