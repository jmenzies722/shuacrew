import { expect, it } from "vitest";
import { notchActivity } from "./notch-activity";
const idle = { approval: false, failed: false, preparing: false, acting: false, working: false, listening: false, speaking: false, watching: false };
it("prioritizes pending permission over a live call or work", () => {
  expect(notchActivity({ ...idle, approval: true, working: true, listening: true })).toEqual({ label: "Needs permission", tone: "permission" });
});
it("shows background voice work even without a transcript or local action", () => {
  expect(notchActivity({ ...idle, working: true, listening: true })?.label).toBe("Working");
});
it("distinguishes observation from action and rests when idle", () => {
  expect(notchActivity({ ...idle, watching: true })?.label).toBe("Watching");
  expect(notchActivity({ ...idle, acting: true, watching: true })?.label).toBe("Acting");
  expect(notchActivity(idle)).toBeNull();
});
