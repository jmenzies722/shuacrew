import Fastify from "fastify";
import { expect, it } from "vitest";
import { ROUTINES, routineRoutes } from "./routines.js";
import { parseCadence as cadence } from "@shuacrew/core";

it("every routine has a schedule the gateway understands and a brief that files its result honestly", () => {
  for (const r of ROUTINES) {
    expect(() => cadence(r.when)).not.toThrow();
    // A report goes to the Library; a note about you is only ever suggested (it waits in the Inbox for your answer).
    expect(r.ask).toMatch(r.id === "nightly-notes" ? /api\/notes/ : /api\/library\/artifacts/);
    expect(r.ask).toMatch(/unknown|Only what the data shows|read only|not a guess/i);
  }
  expect(ROUTINES.find((r) => r.id === "personal-wiki")!.ask).toMatch(/never read those/);
  const notes = ROUTINES.find((r) => r.id === "nightly-notes")!;
  expect(notes.ask).toMatch(/never edit my notes/);
  expect(notes.ask).not.toMatch(/-X PUT|api\/knowledge\/\w/); // it reads the files and never writes them
  expect(notes.catchUp).toBe(true); // a Mac asleep at 9pm still gets its notes
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
