import { expect, it, vi } from "vitest";
import { analyticsEventListener } from "./analytics-events";
it("remembers the head value before an in-place event projection mutation", () => {
  const state = { crew: { head: 1 }, connection: "live" }, invalidate = vi.fn();
  const listener = analyticsEventListener(state, invalidate);
  state.crew.head = 2; listener(state); listener(state);
  expect(invalidate).toHaveBeenCalledTimes(1);
  state.connection = "offline"; listener(state);
  expect(invalidate).toHaveBeenCalledTimes(2);
});
