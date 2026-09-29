import { expect, it } from "vitest";
import { eveningRecap, localDay, morningBrief, shouldBrief, shouldRecap } from "./morning";
const at = (h: number) => new Date(2026, 8, 26, h, 5);
it("offers once a day, not before 5am", () => {
  expect(shouldBrief(null, at(4))).toBe(false);
  expect(shouldBrief(null, at(8))).toBe(true);
  expect(shouldBrief(localDay(at(8)), at(9))).toBe(false);
  expect(localDay(new Date(2026, 8, 26, 23, 30))).toBe("2026-09-26"); // late evening is still today, whatever UTC says
});
it("says only what's real, and ends with one next step", () => {
  const b = morningBrief({ now: at(8), goal: "AI Platform Engineer", finished: ["the repo summary"], waiting: 1, due: 3, ventures: [{ name: "Leash", stage: "validating" }], running: 0 });
  expect(b).toBe("Good morning. Your crew finished the repo summary. 1 decision is waiting on you. You have 3 review cards due on the road to AI Platform Engineer. Leash is in validating. Want to clear the decisions first?");
  expect(morningBrief({ now: at(14), finished: [], waiting: 0, due: 0, ventures: [], running: 0 })).toBe("Good afternoon. It's a clean slate. What should we build today?");
});

it("recaps the evening once, from 6pm, with only what really happened", () => {
  expect(shouldRecap(null, at(17))).toBe(false); expect(shouldRecap(null, at(18))).toBe(true); expect(shouldRecap(localDay(at(18)), at(21))).toBe(false);
  expect(eveningRecap({ finished: ["the landing page", "the pricing research"], failed: 1, reviewed: 4, tomorrow: ["Leash MVP"], waiting: 0 }))
    .toBe("Here's your day. The crew shipped 2 things, including the landing page and the pricing research. 1 session hit a problem worth a look. You reviewed 4 learning cards. Lined up for tomorrow: Leash MVP. Good work today.");
  expect(eveningRecap({ finished: [], failed: 0, reviewed: 0, tomorrow: [], waiting: 0 })).toBe("Here's your day. A quiet one — sometimes that's exactly right. Rest up.");
});

it("plans around the calendar when it's connected", () => {
  expect(morningBrief({ now: at(8), finished: [], waiting: 0, due: 0, ventures: [], running: 0, meetings: [{ title: "Standup", time: "10:00 AM" }, { title: "1:1", time: "2:00 PM" }] }))
    .toBe("Good morning. 2 meetings today; the first is Standup at 10:00 AM. What should we build today?");
});
