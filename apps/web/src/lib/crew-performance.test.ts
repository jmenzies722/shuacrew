import { expect, it } from "vitest";
import { crewPerformance } from "./crew-performance";

it("counts each member's own finished and failed work, ignoring Spark chats, learning and sub-tasks", () => {
  const t = 1_000_000;
  const runs = [
    { member: "eli", status: "done", createdAt: t, updatedAt: t + 10 * 60_000, usage: { inputTokens: 100, outputTokens: 50 } },
    { member: "eli", status: "merged", createdAt: t, updatedAt: t + 30 * 60_000 },
    { member: "eli", status: "failed", createdAt: t, updatedAt: t + 5 * 60_000 },
    { member: "eli", status: "done", labels: ["buddy"], createdAt: t, updatedAt: t },
    { member: "eli", status: "done", parent: "x", createdAt: t, updatedAt: t },
    { member: "rhea", status: "running", createdAt: t, updatedAt: t },
  ];
  const [eli, rhea] = crewPerformance(["eli", "rhea"], runs, { eli: 3 });
  expect(eli).toEqual({ member: "eli", finished: 2, failed: 1, successRate: 67, medianMinutes: 20, tokens: 150, lessons: 3 });
  expect(rhea).toMatchObject({ finished: 0, failed: 0, successRate: null, medianMinutes: null });
});
