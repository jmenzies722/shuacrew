import { expect, it } from "vitest";
import { emptyArchitectureSession, reduceArchitectureSession, architectureContext } from "./architecture-session";
import { normalizeArchitecture } from "./notch-lesson";
it("bounds revisions and announcement history and rejects stale replacements", () => {
  let state = emptyArchitectureSession();
  const base = { title: "Video", summary: "Proposed", example: "Film", nodes: [{ id: "api", label: "API" }, { id: "cdn", label: "CDN" }], edges: [{ from: "api", to: "cdn" }], steps: [{ title: "Watch", body: "Fetch", focus: ["cdn"] }] };
  for (let revision = 1; revision <= 100; revision++) {
    state = reduceArchitectureSession(state, { type: "receive", lesson: normalizeArchitecture({ ...base, id: "video", revision })! });
    state = reduceArchitectureSession(state, { type: "announce" });
  }
  expect(state.history.length).toBeLessThanOrEqual(5);
  expect(state.announced.length).toBeLessThanOrEqual(20);
  expect(reduceArchitectureSession(state, { type: "receive", lesson: normalizeArchitecture({ ...base, id: "video", revision: 1 })! })).toBe(state);
  expect(architectureContext(state)).toContain("video");
  state = reduceArchitectureSession(state, { type: "dismiss" });
  expect(state.current).toBeNull();
  expect(reduceArchitectureSession(state, { type: "receive", lesson: normalizeArchitecture({ ...base, id: "video", revision: 100 })! }).current).toBeNull();
  expect(architectureContext(reduceArchitectureSession(state, { type: "reset" }))).toBe("");
  expect(reduceArchitectureSession(state, { type: "reset" })).toEqual(emptyArchitectureSession());
});
