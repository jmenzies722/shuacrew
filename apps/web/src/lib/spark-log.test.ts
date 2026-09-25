import { expect, it } from "vitest";
import { summary } from "./spark-log";
it("summarises the last week honestly", () => {
  const now = Date.now();
  const list = [{ at: now, label: "Open Notes", ok: true, message: "" }, { at: now, label: "Press Send", ok: false, message: "not found" }, { at: now - 30 * 86_400_000, label: "old", ok: false, message: "" }];
  expect(summary(list)).toEqual({ total: 2, ok: 1, rate: 50 });
  expect(summary([])).toEqual({ total: 0, ok: 0, rate: null });
});
