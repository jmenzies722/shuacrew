import { expect, it } from "vitest";
import { toolCard } from "./tool-card";
it("never infers tool success from result text and rejects negative durations", () => {
  const card = toolCard({ name: "example", status: "mystery", output: "success", startedAt: 20, endedAt: 10 });
  expect(card.status).toBe("unknown"); expect(card.durationMs).toBeNull();
});
it("bounds and redacts inspectable tool output", () => {
  const card = toolCard({ name: "mcp__test__read", status: "failed", output: { password: "short", token: "sensitive-value", text: "a".repeat(30000) }, startedAt: 10, endedAt: 40 });
  expect(card.text).not.toContain("sensitive-value"); expect(card.text).not.toContain("short");
  expect(card.text.length).toBeLessThanOrEqual(12050); expect(card.durationMs).toBe(30);
});
