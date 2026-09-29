import { expect, it } from "vitest";
import { apply, emptyState } from "./projections.js";
import { parseBody, type AnyEvent, type Kind } from "./events.js";

function world() {
  const state = emptyState(); let seq = 0;
  const record = (kind: Kind, body: object, at = Date.now()) => apply(state, { seq: ++seq, at, kind, body: parseBody(kind, body), run: "r", session: null, prev: "", hash: "" } as AnyEvent);
  record("run.created", { title: "Actual usage", ask: "Public", runtime: "codex" });
  return { state, record };
}
it("excludes demo usage from real token totals while preserving the source sequence", () => {
  const { state, record } = world();
  record("usage.recorded", { runtime: "mock", inputTokens: 9000, outputTokens: 1000, costUsd: 99 });
  record("usage.recorded", { runtime: "codex", inputTokens: 12, outputTokens: 3 });
  expect(state.today.tokens).toBe(15);
  expect(state.runs.r!.usage.inputTokens).toBe(12);
  expect(state.head).toBe(3);
});
it("keeps missing and partial cost unknown instead of reporting zero or a partial bill", () => {
  const { state, record } = world();
  expect(state.runs.r!.usage.costUsd).toBeNull();
  record("usage.recorded", { runtime: "codex", inputTokens: 10, costUsd: 0 });
  expect(state.runs.r!.usage.costUsd).toBe(0);
  record("usage.recorded", { runtime: "codex", inputTokens: 20 });
  record("usage.recorded", { runtime: "codex", inputTokens: 30, costUsd: 1 });
  expect(state.runs.r!.usage.costUsd).toBeNull();
  expect(state.today.costUsd).toBeNull();
});
it("does not show yesterday's usage as today when replaying historical events", () => {
  const { state, record } = world();
  record("usage.recorded", { runtime: "codex", inputTokens: 123 }, Date.now() - 86400000);
  expect(state.today.tokens).toBe(0);
  expect(state.runs.r!.usage.inputTokens).toBe(123);
});
