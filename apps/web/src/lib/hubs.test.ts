import { expect, it } from "vitest";
import { HUBS, hubEntry, locate } from "./hubs";

it("puts every screen in exactly one hub", () => {
  expect(locate("/")?.hub.id).toBe("home");
  expect(locate("/sessions/r_1")?.tab.label).toBe("Sessions");
  expect(locate("/activity")?.tab.label).toBe("Today");
  expect(locate("/usage")?.tab.label).toBe("Usage");
  expect(locate("/developer")?.hub.id).toBe("system");
  expect(locate("/plays/p1")?.tab.label).toBe("Playbooks");
  expect(locate("/settings")).toBeNull();
  expect(locate("/studio-x")).toBeNull();
  const all = HUBS.flatMap((h) => h.tabs.map((t) => t.to));
  expect(new Set(all).size).toBe(all.length);
});

it("reopens a hub where you left it", () => {
  const build = HUBS.find((h) => h.id === "build")!;
  expect(hubEntry(build, {})).toBe("/ventures");
  expect(hubEntry(build, { build: "/board" })).toBe("/board");
  expect(hubEntry(build, { build: "/library" })).toBe("/ventures"); // not this hub's
});

it("has six primary destinations and preserves every deep link", () => {
  expect(HUBS.filter(h => h.id !== "system").map(h => h.label)).toEqual(["Home", "Projects", "Crew", "Learn", "Automations", "Library"]);
  expect(locate("/floor")?.hub.id).toBe("crew");
  expect(locate("/teach")?.hub.id).toBe("know");
  expect(locate("/plays/saved")?.hub.id).toBe("automations");
  expect(locate("/library")?.hub.id).toBe("library");
});
