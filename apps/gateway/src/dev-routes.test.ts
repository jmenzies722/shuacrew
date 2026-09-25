import Fastify from "fastify";
import { afterEach, expect, it } from "vitest";
import { EventStore } from "./store.js";
import { devRoutes } from "./dev-routes.js";

const close: Array<() => unknown> = [];
afterEach(async () => { for (const c of close.splice(0)) await c(); });

it("tails events newest-first, filters by kind prefix and never returns secrets", async () => {
  const store = new EventStore(":memory:"), app = Fastify();
  close.push(() => app.close(), () => store.close());
  devRoutes(app, store);
  store.append("room.paused", { room: "r1", paused: true });
  store.append("room.message", { room: "r1", id: "m1", author: "you", text: "token = sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789" });
  store.append("room.paused", { room: "r1", paused: false });
  const all = (await app.inject("/api/dev/events?limit=2")).json();
  expect(all.events.map((e: { seq: number }) => e.seq)).toEqual([3, 2]);
  const rooms = (await app.inject("/api/dev/events?kind=room.message")).json();
  expect(rooms.events).toHaveLength(1);
  expect(rooms.events[0].body).not.toContain("abcdefghijklmnopqrstuvwxyz");
  const older = (await app.inject("/api/dev/events?before=2")).json();
  expect(older.events.map((e: { seq: number }) => e.seq)).toEqual([1]);
});
