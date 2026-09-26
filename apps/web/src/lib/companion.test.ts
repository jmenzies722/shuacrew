import { expect, it } from "vitest";
import { companionPose, parseCompanion, celebrateCompletion } from "./companion";
it("defaults to off and validates presentation without changing authority", () => {
  expect(parseCompanion(null).enabled).toBe(false);
  expect(parseCompanion({ enabled: "true", nickname: "x".repeat(50), accessory: "laser", volume: 2 })).toMatchObject({ enabled: false, nickname: "x".repeat(40), accessory: "none", volume: 0.25 });
  expect(companionPose({ connected: false, needsApproval: false, failed: false, active: true })).toBe("offline");
  expect(companionPose({ connected: true, needsApproval: true, failed: true, active: true })).toBe("review");
  expect(companionPose({ connected: true, needsApproval: false, failed: true, active: true })).toBe("failed");
});
it("never celebrates hydration, duplicates, stale state or closely spaced completions", () => {
  const first = { seen: [] as string[], watermark: 100, lastCelebratedAt: 0 };
  expect(celebrateCompletion(first, { id: "old", seq: 99 }, 20000, "idle").celebrate).toBe(false);
  const fresh = celebrateCompletion(first, { id: "new", seq: 101 }, 20000, "idle");
  expect(fresh.celebrate).toBe(true);
  expect(celebrateCompletion(fresh.state, { id: "new", seq: 101 }, 40000, "idle").celebrate).toBe(false);
  expect(celebrateCompletion(fresh.state, { id: "next", seq: 102 }, 21000, "idle").celebrate).toBe(false);
  expect(celebrateCompletion(first, { id: "new", seq: 101 }, 20000, "offline").celebrate).toBe(false);
});

it("listens with an open mic by default and keeps push-to-talk when chosen", () => {
  expect(parseCompanion(null).listen).toBe("auto");
  expect(parseCompanion({ listen: "hold" }).listen).toBe("hold");
  expect(parseCompanion({ listen: "shout" }).listen).toBe("auto");
});

it("keeps the desktop Spark off the top of your work unless you pin it", () => {
  expect(parseCompanion(null).onTop).toBe(false);
  expect(parseCompanion({ onTop: true }).onTop).toBe(true);
  expect(parseCompanion({ onTop: "yes" }).onTop).toBe(false);
});
