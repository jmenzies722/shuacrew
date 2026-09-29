import { expect, it } from "vitest";
import { healthAlerts } from "./health-alerts.js";
const ok = { rssMb: 400, diskFreeGb: 120, speech: "ready", runtimesOut: [], battery: { pct: 80, charging: true } };
it("stays quiet when everything is fine", () => { expect(healthAlerts(ok)).toEqual([]); });
it("raises one alert per real problem, with a stable id", () => {
  const a = healthAlerts({ rssMb: 2600, diskFreeGb: 3.2, speech: "failed", runtimesOut: ["codex"], battery: { pct: 8, charging: false } });
  expect(a.map((x) => [x.id, x.level])).toEqual([["gateway-memory", "critical"], ["disk", "critical"], ["speech", "warn"], ["runtime-codex", "warn"], ["battery", "warn"]]);
  expect(healthAlerts({ ...ok, rssMb: 1600 })[0]).toMatchObject({ id: "gateway-memory", level: "warn" });
  expect(healthAlerts({ ...ok, battery: { pct: 8, charging: true } })).toEqual([]); // charging is fine
});
