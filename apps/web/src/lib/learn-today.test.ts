import { expect, it } from "vitest";
import { weakestSkill, weekRhythm } from "./learn-today";

const t = (id: string, accuracy: number | null, reviews: number, lapses = 0) => ({ id, name: id, accuracy, reviews, lapses });

it("picks the skill that really needs work, never one you're acing or have barely tried", () => {
  expect(weakestSkill([t("aws", 1, 3), t("tf", 0.5, 4), t("k8s", 0, 1)])?.id).toBe("tf"); // k8s: 1 answer isn't enough
  expect(weakestSkill([t("aws", 1, 6), t("tf", 0.9, 5)])).toBeNull(); // nothing is weak
  expect(weakestSkill([t("a", 0.6, 5, 1), t("b", 0.6, 5, 4)])?.id).toBe("b"); // a tie goes to the one you slip on more
});

it("lays out the last seven days, today last, counting days practised rather than a streak", () => {
  const today = new Date(2026, 9, 7);
  const w = weekRhythm([{ day: "2026-10-07", reviews: 6 }, { day: "2026-10-05", reviews: 3 }, { day: "2026-09-30", reviews: 9 }], today);
  expect(w.days).toHaveLength(7);
  expect(w.days.at(-1)).toMatchObject({ day: "2026-10-07", reviews: 6, today: true });
  expect(w.days[0]!.day).toBe("2026-10-01"); // Sept 30 is outside the week
  expect(w.practised).toBe(2);
  expect(w.reviews).toBe(9);
});

it("turns your goal sentence into a role for headings", async () => {
  const { goalRole, article } = await import("./learn-today");
  expect(goalRole("Become an AI Platform Engineer / AI Enablement Engineer, dedicating 12 hours per week to learning and hands-on projects.")).toBe("AI Platform Engineer / AI Enablement Engineer");
  expect(goalRole("I want to become a staff engineer while working full time")).toBe("staff engineer");
  expect(goalRole("Cloud architect")).toBe("Cloud architect");
  expect(article("AI Platform Engineer")).toBe("an");
  expect(article("staff engineer")).toBe("a");
});
