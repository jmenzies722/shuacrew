import { expect, it } from "vitest";
import { missionRequest } from "./assistant-mission";
it("builds an explicit Codex mission without blanket approval or repository side effects", () => {
  const request = missionRequest("Compare three approaches to my personal project");
  expect(request.runtime).toBe("codex"); expect(request.labels).toContain("mission");
  expect(request.ask).toContain("Do not commit or push"); expect(request.ask).toContain("unknown outcome");
  expect(request).not.toHaveProperty("approveAll"); expect(request).not.toHaveProperty("repo");
});
it("rejects empty and oversized briefs", () => {
  expect(() => missionRequest(" ")).toThrow(); expect(() => missionRequest("x".repeat(6001))).toThrow();
});
