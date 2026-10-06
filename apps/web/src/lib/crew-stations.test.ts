import { expect, it } from "vitest";
import { doing } from "../components/CrewStations";

it("says what an agent is doing, in words", () => {
  expect(doing({ name: "Edit", detail: "Sessions.tsx" })).toBe("Editing Sessions.tsx");
  expect(doing({ name: "Bash", detail: "npm test" })).toBe("Running npm test");
  expect(doing({ name: "Read", detail: "" })).toBe("Reading");
  expect(doing({ name: "WebFetch", detail: "x" })).toBe("Reading the web");
  expect(doing({ name: "mcp__notion__search", detail: "" })).toBe("Using notion");
  expect(doing(undefined)).toBe("");
});
