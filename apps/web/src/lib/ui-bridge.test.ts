import { expect, it } from "vitest";
import { pickPressable, risky } from "./ui-bridge";

const page = [
  { name: "Studio", role: "button" }, { name: "Above", role: "button" }, { name: "Close", role: "button" },
  { name: "Reset the view", role: "button" }, { name: "Delete agent", role: "button" }, { name: "Agents", role: "a" }, { name: "Agents", role: "a" },
];

it("presses the one control a name means: exact, then starts-with, then contains", () => {
  expect(pickPressable(page, "Above")).toEqual({ index: 1 });
  expect(pickPressable(page, "  studio ")).toEqual({ index: 0 });
  expect(pickPressable(page, "Reset")).toEqual({ index: 3 });
  expect(pickPressable(page, "the view")).toEqual({ index: 3 });
  expect(pickPressable(page, "Agents")).toEqual({ index: 5 }); // the same link twice is one choice
});

it("refuses what's missing, ambiguous, or risky", () => {
  expect(pickPressable(page, "Below")).toEqual({ error: "There's no “Below” on this ShuaCrew page." });
  expect("error" in pickPressable([{ name: "Open session", role: "button" }, { name: "Open settings", role: "button" }], "Open")).toBe(true);
  expect(pickPressable(page, "Delete agent")).toMatchObject({ error: expect.stringContaining("isn't something I press") });
  for (const n of ["Approve", "Always allow", "Merge", "Push to GitHub", "Sign out", "Send", "Reset all settings", "Factory reset"]) expect(risky(n)).toBe(true);
  for (const n of ["Studio", "Above", "Open session", "Insights", "Reset the view"]) expect(risky(n)).toBe(false);
  expect(pickPressable(page, "")).toEqual({ error: "Say which control to press." });
});
