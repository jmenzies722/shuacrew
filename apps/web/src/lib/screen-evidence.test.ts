import { expect, it } from "vitest";
import { screenEvidence, matchesCapture } from "./screen-evidence";
it("does not confuse enabled access with a fresh observation", () => {
  expect(screenEvidence(true, undefined, 10000).status).toBe("unobserved");
  expect(screenEvidence(false, { observedAt: 9900, app: "Music" }, 10000).status).toBe("off");
  expect(screenEvidence(true, { observedAt: 9900, app: "Music", display: 1 }, 10000)).toMatchObject({ status: "fresh", label: "Music · display 1" });
  expect(screenEvidence(true, { observedAt: 1000 }, 10000).status).toBe("stale");
  expect(screenEvidence(true, { observedAt: 11000 }, 10000).status).toBe("stale");
});
it("rejects timed-out capture replies and invalid dimensions", () => {
  expect(matchesCapture("new", { requestId: "old", width: 100, height: 100 })).toBe(false);
  expect(matchesCapture("new", { requestId: "new", width: 0, height: 100 })).toBe(false);
  expect(matchesCapture("new", { requestId: "new", width: 100, height: 100 })).toBe(true);
});
