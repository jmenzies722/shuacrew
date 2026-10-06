import { expect, it } from "vitest";
import { autopilotWeek } from "./autopilot-week";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const now = at(6, 10);

it("lays the week out by day, skipping paused schedules and runs already past", () => {
  const week = autopilotWeek([
    { id: "standup", name: "Crew standup", paused: false, next: [at(7, 8, 30), at(8, 8, 30), at(6, 8, 30)] },
    { id: "report", name: "Weekly growth report", paused: false, next: [at(9, 17)], script: undefined },
    { id: "off", name: "Paused thing", paused: true, next: [at(7, 9)] },
    { id: "late", name: "Wiki", paused: false, next: [at(20, 20)] }, // beyond the week
  ], now);
  expect(week.map((d) => d.label.length > 0)).toHaveLength(7);
  expect(week[0]!.today).toBe(true);
  expect(week[0]!.runs).toEqual([]); // 8:30 today already happened
  expect(week[1]!.label).toBe("Tomorrow");
  expect(week[1]!.runs.map((r) => r.name)).toEqual(["Crew standup"]);
  expect(week[3]!.runs.map((r) => r.name)).toEqual(["Weekly growth report"]);
  expect(week.flatMap((d) => d.runs).some((r) => r.name === "Paused thing" || r.name === "Wiki")).toBe(false);
});
