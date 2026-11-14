import { expect, it } from "vitest";
import { HUBS, hubEntry, locate } from "./hubs";

it("puts every screen in exactly one hub", () => {
  expect(locate("/")?.hub.id).toBe("home");
  expect(locate("/sessions/r_1")?.tab.label).toBe("Sessions");
  expect(locate("/activity")?.tab.label).toBe("Today");
  expect(locate("/usage")?.tab.label).toBe("Usage");
  expect(locate("/developer")?.hub.id).toBe("system");
  expect(locate("/settings")).toBeNull();
  expect(locate("/studio-x")).toBeNull();
  const all = HUBS.flatMap((h) => h.tabs.map((t) => t.to));
  expect(new Set(all).size).toBe(all.length);
});

it("reopens a hub where you left it", () => {
  const knowledge = HUBS.find((h) => h.id === "knowledge")!;
  expect(hubEntry(knowledge, {})).toBe("/memory");
  expect(hubEntry(knowledge, { knowledge: "/library" })).toBe("/library");
  expect(hubEntry(knowledge, { knowledge: "/schedules" })).toBe("/memory"); // not this hub's
});

it("has four primary places, and the removed ones are gone", () => {
  expect(HUBS.filter(h => h.id !== "system").map(h => h.label)).toEqual(["Home", "Knowledge", "Autopilot", "Crew"]);
  expect(locate("/floor")?.hub.id).toBe("crew");
  expect(locate("/memory")?.hub.id).toBe("knowledge");
  expect(locate("/library")?.hub.id).toBe("knowledge");
  expect(locate("/schedules")?.hub.id).toBe("autopilot");
  // Projects, playbooks, rooms, the music page and the guide were removed (2026-11-13).
  for (const gone of ["/ventures", "/ventures/v1", "/playbooks", "/plays/p1", "/rooms", "/rooms/r1", "/studio", "/guide", "/learn"]) expect(locate(gone), gone).toBeNull();
});

it("keeps the Board and Agents reachable without giving them a place in the sidebar", () => {
  // The Board became Home's status filter; its deep links (a run, a review) still light up Home.
  for (const to of ["/board", "/runs/r_1", "/review/r_1"]) expect(locate(to)?.tab.label, to).toBe("Sessions");
  expect(locate("/crew")?.tab.label).toBe("Live");
  expect(HUBS.flatMap((h) => h.tabs.map((t) => t.to))).not.toContain("/board");
});
