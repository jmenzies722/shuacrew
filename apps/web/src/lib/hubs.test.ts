import { expect, it } from "vitest";
import { HUBS, hubEntry, locate } from "./hubs";

it("puts every screen in exactly one hub", () => {
  expect(locate("/")?.hub.id).toBe("home");
  expect(locate("/sessions/r_1")?.tab.label).toBe("Sessions");
  expect(locate("/activity")?.tab.label).toBe("Today");
  expect(locate("/usage")?.tab.label).toBe("Usage");
  expect(locate("/developer")?.hub.id).toBe("intelligence");
  expect(locate("/plays/p1")?.tab.label).toBe("Playbooks");
  expect(locate("/settings")).toBeNull();
  expect(locate("/studio-x")).toBeNull();
  const all = HUBS.flatMap((h) => h.tabs.map((t) => t.to));
  expect(new Set(all).size).toBe(all.length);
});

it("reopens a hub where you left it", () => {
  const autopilot = HUBS.find((h) => h.id === "autopilot")!;
  expect(hubEntry(autopilot, {})).toBe("/schedules");
  expect(hubEntry(autopilot, { autopilot: "/board" })).toBe("/board");
  expect(hubEntry(autopilot, { autopilot: "/library" })).toBe("/schedules"); // not this hub's
});

it("has four primary destinations, led by intelligence and autopilot, and preserves every deep link", () => {
  expect(HUBS.filter(h => h.id !== "system").map(h => h.label)).toEqual(["Home", "Intelligence", "Autopilot", "Crew"]);
  expect(locate("/floor")?.hub.id).toBe("crew");
  expect(locate("/learn")).toBeNull();
  expect(locate("/plays/saved")?.hub.id).toBe("autopilot");
  expect(locate("/runs/r_1")?.hub.id).toBe("autopilot");
  expect(locate("/memory")?.hub.id).toBe("intelligence");
  expect(locate("/library")?.hub.id).toBe("intelligence");
  // Nothing was removed: the rest is one fold away, under More.
  for (const to of ["/ventures", "/ventures/v1", "/specs", "/studio", "/integrations", "/policy", "/terminal"]) expect(locate(to)?.hub.id, to).toBe("system");
});
