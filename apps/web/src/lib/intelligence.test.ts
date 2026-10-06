import { afterEach, describe, expect, it, vi } from "vitest";
import { turnDisposition } from "./intelligence";
it("resumes only a compatible completed conversation and never reuses a foreign session", () => {
  expect(turnDisposition({ runtime: "claude", model: "c", status: "done" }, { runtime: "claude", model: "c" })).toBe("resume");
  expect(turnDisposition({ runtime: "claude", model: "c", status: "done" }, { runtime: "codex", model: "x" })).toBe("new");
  expect(turnDisposition({ runtime: "local", model: "l", status: "done" }, { runtime: "claude", model: "c" })).toBe("new");
  expect(turnDisposition({ runtime: "claude", model: "c", status: "done" }, { runtime: "local", model: "l" })).toBe("new");
  expect(turnDisposition({ runtime: "claude", model: "c", status: "done" }, { runtime: "claude", model: "other" })).toBe("new");
});
it("failed, unknown and paused turns cannot masquerade as healthy conversations", () => {
  for (const status of ["failed", "paused", undefined]) expect(turnDisposition({ runtime: "local", model: "l", status }, { runtime: "local", model: "l" })).toBe("new");
});
it("a turn you talked over is still the same conversation (verified live: resumed after a stop mid-search)", () => {
  expect(turnDisposition({ runtime: "claude", model: "c", status: "cancelled" }, { runtime: "claude", model: "c" })).toBe("resume");
  expect(turnDisposition({ runtime: "claude", model: "c", status: "cancelled" }, { runtime: "claude", model: "other" })).toBe("new");
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

it("keeps compatible history when refreshed instructions are supplied", () => {
  const done = { runtime: "claude", model: "c", status: "done" };
  expect(turnDisposition({ ...done, rules: "a" }, { runtime: "claude", model: "c", rules: "a" })).toBe("resume");
  expect(turnDisposition({ ...done, rules: "a" }, { runtime: "claude", model: "c", rules: "b" })).toBe("resume");
  expect(turnDisposition(done, { runtime: "claude", model: "c", rules: "b" })).toBe("resume"); // started before fingerprints
});

import { selectIntelligence, type IntelligenceRequest } from "./intelligence";

const base: IntelligenceRequest = { ask: "hi", mode: "auto", purpose: "conversation", images: false, tier: "fast" };
const limited = { runtime: null, reason: "No eligible connected model is available.", retryAt: Date.UTC(2026, 9, 11, 19, 38), checkedAt: 1 };
const claude = { runtime: "claude", model: "claude-haiku-4-5", acceptsImages: true, checkedAt: 1, verification: "unverified", reason: "Connected provider order · Claude" };

/** Answers like the gateway: Codex is limited, anything else picks Claude. */
function gateway(claudeUp = true) {
  const calls: IntelligenceRequest[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as IntelligenceRequest;
    calls.push(body);
    const answer = body.preferredRuntime === "codex" || !claudeUp ? limited : claude;
    return new Response(JSON.stringify(answer), { status: 200 });
  }));
  return calls;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("selectIntelligence", () => {
  it("falls back from a limited preferred provider on Auto, and says why", async () => {
    const calls = gateway();
    const choice = await selectIntelligence({ ...base, preferredRuntime: "codex" });
    expect(choice.runtime).toBe("claude");
    expect(choice.reason).toMatch(/^Codex is at its usage limit until .+ · Connected provider order/);
    expect(calls.map((c) => c.preferredRuntime)).toEqual(["codex", undefined]);
  });
  it("keeps a model picked by name strict", async () => {
    const calls = gateway();
    const choice = await selectIntelligence({ ...base, preferredRuntime: "codex", preferredModel: "gpt-5.6-sol" });
    expect(choice.runtime).toBeNull();
    expect(calls).toHaveLength(1);
  });
  it("reports the original reason when nothing else is up either", async () => {
    gateway(false);
    const choice = await selectIntelligence({ ...base, preferredRuntime: "codex" });
    expect(choice).toMatchObject({ runtime: null, reason: limited.reason });
  });
});
