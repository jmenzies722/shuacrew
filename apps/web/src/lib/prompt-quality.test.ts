import { expect, it } from "vitest";
import { turnTier } from "./buddy";
import { VISUAL_GUIDE } from "./visual";
it("requires truthful architecture scope, narration identities and source coverage", () => {
  expect(VISUAL_GUIDE).toContain("12 nodes");
  expect(VISUAL_GUIDE).toContain("control plane");
  expect(VISUAL_GUIDE).toContain("revision");
  expect(VISUAL_GUIDE).toContain("research unavailable");
});

it.each(["Design a distributed architecture for my app", "Find the root cause of this race condition", "Build and test a complete authentication flow", "Think deeply about this migration", "Prove this algorithm is correct"])("routes complex requests to frontier: %s", prompt => {
  expect(turnTier(prompt, { screen: false, design: false })).toBe("frontier");
});
it("uses capable reasoning for short spoken teaching requests", () => {
  expect(turnTier("teach me caching", { screen: false, design: false })).toBe("balanced");
  expect(turnTier("explain this concept", { screen: false, design: false })).toBe("balanced");
});
it("keeps simple controls responsive", () => {
  expect(turnTier("pause music", { screen: false, design: false })).toBe("fast");
});
