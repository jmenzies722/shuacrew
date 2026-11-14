import { expect, it } from "vitest";
import { verdictOf } from "@shuacrew/ui";

it("labels a session at rest by what was proven, not just 'Done'", () => {
  expect(verdictOf("reviewing", { state: "verified", command: "pnpm test" })).toEqual({ label: "Verified", tone: "ok", title: "pnpm test passed after the last edit" });
  expect(verdictOf("done", { state: "unverified" })).toMatchObject({ label: "Unverified", tone: "wait" });
  expect(verdictOf("done", { state: "failing", command: "pnpm typecheck" })).toMatchObject({ label: "Checks failing", tone: "bad" });
  expect(verdictOf("merged", { state: "verified" })?.label).toBe("Verified");
});

it("says when the agent had to be asked for proof", () => {
  expect(verdictOf("done", { state: "verified", command: "pnpm test", nudged: true })?.title).toBe("pnpm test passed after the last edit (asked for proof once)");
  expect(verdictOf("done", { state: "unverified", nudged: true })?.title).toMatch(/even after being asked for proof/);
  expect(verdictOf("done", { state: "failing", nudged: true })?.title).toMatch(/still failed when asked to fix it/);
});

it("stays out of the way while a session works, and when there was nothing to verify", () => {
  for (const status of ["queued", "planning", "running", "awaiting_approval", "paused", "failed", "cancelled"]) expect(verdictOf(status, { state: "verified" }), status).toBeNull();
  expect(verdictOf("done")).toBeNull();
  expect(verdictOf("done", null)).toBeNull();
});
