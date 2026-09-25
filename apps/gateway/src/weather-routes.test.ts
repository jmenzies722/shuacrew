import Fastify from "fastify";
import { expect, it } from "vitest";
import { weatherRoutes } from "./weather-routes.js";

it("validates input, rounds coordinates, and caches upstream calls", async () => {
  const calls: string[] = [];
  const app = Fastify();
  weatherRoutes(app, (async (url: string) => { calls.push(url); return new Response(JSON.stringify({ ok: 1 }), { status: 200 }); }) as never);
  expect((await app.inject("/api/weather/forecast?lat=40.71234&lon=-73.9876&unit=f")).json()).toEqual({ ok: 1 });
  await app.inject("/api/weather/forecast?lat=40.71&lon=-73.99&unit=f");
  expect(calls).toHaveLength(1); expect(calls[0]).toContain("latitude=40.71&longitude=-73.99"); expect(calls[0]).toContain("fahrenheit");
  expect((await app.inject("/api/weather/forecast?lat=abc&lon=1")).statusCode).toBe(400);
  expect((await app.inject("/api/weather/geocode?q=" + encodeURIComponent("<script>"))).statusCode).toBe(400);
  expect((await app.inject("/api/weather/geocode?q=Brooklyn")).statusCode).toBe(200);
  await app.close();
});
