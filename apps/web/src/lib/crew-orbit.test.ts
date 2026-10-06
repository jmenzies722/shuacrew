import { expect, it } from "vitest";
import { doing, orbitPositions } from "../components/CrewOrbit";

it("says what an agent is doing, in words", () => {
  expect(doing({ name: "Edit", detail: "Sessions.tsx" })).toBe("Editing Sessions.tsx");
  expect(doing({ name: "Bash", detail: "npm test" })).toBe("Running npm test");
  expect(doing({ name: "Read", detail: "" })).toBe("Reading");
  expect(doing({ name: "WebFetch", detail: "x" })).toBe("Reading the web");
  expect(doing({ name: "mcp__notion__search", detail: "" })).toBe("Using notion");
  expect(doing(undefined)).toBe("");
});

it("places agents evenly around you, the first at the top, all inside the floor", () => {
  const p = orbitPositions(6);
  expect(p).toHaveLength(6);
  expect(p[0]).toEqual({ x: 50, y: 16 });
  for (const { x, y } of p) { expect(x).toBeGreaterThan(5); expect(x).toBeLessThan(95); expect(y).toBeGreaterThan(5); expect(y).toBeLessThan(95); }
  expect(orbitPositions(0)).toEqual([]);
});
