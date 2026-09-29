import { expect, it } from "vitest";
import { achievements, streak } from "./achievements";
import { localDay } from "./morning";

const day = (offset: number, from = new Date(2026, 8, 26, 12)) => { const d = new Date(from); d.setDate(d.getDate() - offset); return localDay(d); };
const now = new Date(2026, 8, 26, 12);

it("counts a streak up to today, and keeps it alive until today ends", () => {
  expect(streak(new Set([day(0), day(1), day(2)]), now)).toBe(3);
  expect(streak(new Set([day(1), day(2)]), now)).toBe(2); // not yet today: still alive
  expect(streak(new Set([day(2), day(3)]), now)).toBe(0); // missed yesterday
});

it("earns only what really happened, and shows progress for the rest", () => {
  const list = achievements({ shippedDays: new Set([day(0)]), shipped: 3, learnDays: new Set([day(0), day(1)]), reviewed: 40, ventures: 0, earning: 0, members: 5 }, now);
  const get = (id: string) => list.find((a) => a.id === id)!;
  expect(get("first-ship")).toMatchObject({ earned: true });
  expect(get("ten-ships")).toMatchObject({ earned: false, progress: "3/10" });
  expect(get("full-crew").earned).toBe(true);
  expect(get("learn-7")).toMatchObject({ earned: false, progress: "2/7" });
  expect(get("first-venture").earned).toBe(false);
});
