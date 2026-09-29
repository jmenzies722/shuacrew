import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { parseBattery, systemRoutes } from "./system-routes.js";

describe("system widget", () => {
  it("reads pmset output", () => {
    expect(parseBattery("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t82%; discharging; 5:12 remaining present: true")).toEqual({ pct: 82, charging: false, source: "battery", remaining: "5:12" });
    expect(parseBattery("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining present: true")?.charging).toBe(true);
    expect(parseBattery("Now drawing from 'AC Power'")).toBeNull();
  });
  it("reports this machine", async () => {
    const app = Fastify(); systemRoutes(app);
    const body = (await app.inject({ url: "/api/system" })).json();
    expect(body.cores).toBeGreaterThan(0);
    expect(body.memory.total).toBeGreaterThan(body.memory.used - 1);
    expect(body.cpu).toBeGreaterThanOrEqual(0);
  });
});

import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installedApps } from "./system-routes.js";
it("lists the apps really installed (so Spark never promises one you don't have)", () => {
  const home = mkdtempSync(join(tmpdir(), "apps-")); mkdirSync(join(home, "Applications", "Zeta Tool.app"), { recursive: true });
  const apps = installedApps(home);
  expect(apps).toContain("Zeta Tool");
  expect(apps).toContain("Calculator"); // from /System/Applications
  expect(apps).not.toContain("Definitely Not Installed");
});
