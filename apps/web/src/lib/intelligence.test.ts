import { expect, it } from "vitest";
import { turnDisposition } from "./intelligence";
it("resumes only a compatible completed conversation and never reuses a foreign session", () => {
  expect(turnDisposition({ runtime: "claude", model: "c", status: "done" }, { runtime: "claude", model: "c" })).toBe("resume");
  expect(turnDisposition({ runtime: "claude", model: "c", status: "done" }, { runtime: "codex", model: "x" })).toBe("new");
  expect(turnDisposition({ runtime: "local", model: "l", status: "done" }, { runtime: "claude", model: "c" })).toBe("new");
  expect(turnDisposition({ runtime: "claude", model: "c", status: "done" }, { runtime: "local", model: "l" })).toBe("new");
  expect(turnDisposition({ runtime: "claude", model: "c", status: "done" }, { runtime: "claude", model: "other" })).toBe("new");
});
it("failed, cancelled, unknown and paused turns cannot masquerade as healthy conversations", () => {
  for (const status of ["failed", "cancelled", "paused", undefined]) expect(turnDisposition({ runtime: "local", model: "l", status }, { runtime: "local", model: "l" })).toBe("new");
});
it("keeps an in-flight turn intact even when a preferred provider has returned", () => {
  for (const status of ["queued", "running", "planning", "awaiting_approval"]) expect(turnDisposition({ runtime: "codex", model: "x", status }, { runtime: "claude", model: "c" })).toBe("wait");
});

import { turnDisposition as dispose } from "./intelligence";
it("starts a fresh session (with a recap) before the conversation outgrows Claude's memory", () => {
  const same = { runtime: "claude", model: "claude-sonnet-5" };
  expect(dispose({ ...same, status: "done", contextUsed: 40_000 }, same)).toBe("resume");
  expect(dispose({ ...same, status: "done", contextUsed: 506_535 }, same)).toBe("new");
});
