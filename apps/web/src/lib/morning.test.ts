import { expect, it } from "vitest";
import { morningBrief, shouldBrief } from "./morning";
const at = (h: number) => new Date(2026, 8, 26, h, 5);
it("offers once a day, not before 5am", () => {
  expect(shouldBrief(null, at(4))).toBe(false);
  expect(shouldBrief(null, at(8))).toBe(true);
  expect(shouldBrief(at(8).toISOString().slice(0, 10), at(9))).toBe(false);
});
it("says only what's real, and ends with one next step", () => {
  const b = morningBrief({ now: at(8), goal: "AI Platform Engineer", finished: ["the repo summary"], waiting: 1, due: 3, ventures: [{ name: "Leash", stage: "validating" }], running: 0 });
  expect(b).toBe("Good morning. Your crew finished the repo summary. 1 decision is waiting on you. You have 3 review cards due on the road to AI Platform Engineer. Leash is in validating. Want to clear the decisions first?");
  expect(morningBrief({ now: at(14), finished: [], waiting: 0, due: 0, ventures: [], running: 0 })).toBe("Good afternoon. It's a clean slate. What should we build today?");
});
