import { expect, it } from "vitest";
import { HUBS, hubEntry, locate } from "./hubs";

it("puts every screen in exactly one hub", () => {
  expect(locate("/")?.hub.id).toBe("home");
  expect(locate("/sessions/r_1")?.tab.label).toBe("Sessions");
  expect(locate("/activity")?.tab.label).toBe("Today");
  expect(locate("/usage")?.tab.label).toBe("Insights");
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
