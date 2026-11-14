import { expect, it } from "vitest";
import type { AnyEvent } from "./events.js";
import { VERIFY_BY, nextTurnBy, verifyAsk, verifyDecision } from "./verification.js";

/** A run's events, in order: each gets the next seq. Only the fields the rule reads matter. */
function log(...items: Array<[kind: string, body: Record<string, unknown>]>): AnyEvent[] {
  return items.map(([kind, body], i) => ({ seq: i + 1, at: i, kind, run: "r1", session: null, body, prev: "", hash: "" }) as unknown as AnyEvent);
}
const ask = (turn = 1, by = "you"): [string, Record<string, unknown>] => ["turn.started", { turn, text: "do it", by }];
const edit = (path = "src/a.ts"): [string, Record<string, unknown>] => ["file.changed", { path, change: "modified" }];
const check = (exitCode = 0, command = "pnpm test"): [string, Record<string, unknown>] => ["check.ran", { command, exitCode, output: "" }];

it("has nothing to verify when no code changed", () => {
  expect(verifyDecision(log(ask()))).toMatchObject({ state: "none", nudge: false, files: 0 });
  expect(verifyDecision(log(ask(), check()))).toMatchObject({ state: "none", nudge: false });
  // Prose isn't covered by a test suite: a docs-only change needs no check.
  expect(verifyDecision(log(ask(), edit("README.md"), edit("docs/plan.mdx")))).toMatchObject({ state: "none", nudge: false, files: 0 });
});

it("is verified only when a check passed after the last edit", () => {
  expect(verifyDecision(log(ask(), edit(), check()))).toEqual({ state: "verified", nudge: false, files: 1, command: "pnpm test", nudged: false });
  // A check that ran before the last edit proves nothing about that edit.
  expect(verifyDecision(log(ask(), edit(), check(), edit("src/b.ts")))).toMatchObject({ state: "unverified", nudge: true, files: 2 });
  // The last check decides, not the best one.
  expect(verifyDecision(log(ask(), edit(), check(1), check(0)))).toMatchObject({ state: "verified", nudge: false });
  expect(verifyDecision(log(ask(), edit(), check(0), check(1, "pnpm typecheck")))).toMatchObject({ state: "failing", nudge: true, command: "pnpm typecheck" });
});

it("asks for proof once, and never twice", () => {
  const unproven = log(ask(), edit());
  expect(verifyDecision(unproven)).toMatchObject({ state: "unverified", nudge: true, nudged: false });
  // The gateway asked; the agent ran the tests and they pass.
  expect(verifyDecision(log(ask(), edit(), ask(2, VERIFY_BY), check()))).toMatchObject({ state: "verified", nudge: false, nudged: true });
  // The gateway asked; the agent still ran nothing. It ends unverified rather than looping.
  expect(verifyDecision(log(ask(), edit(), ask(2, VERIFY_BY)))).toMatchObject({ state: "unverified", nudge: false, nudged: true });
  // The gateway asked; the check still fails. Same: one ask, then the honest verdict.
  expect(verifyDecision(log(ask(), edit(), check(1), ask(2, VERIFY_BY), check(1)))).toMatchObject({ state: "failing", nudge: false, nudged: true });
});

it("judges the work since your last ask, so an old verified turn doesn't cover a new change", () => {
  const events = log(ask(1), edit(), check(), ask(2), edit("src/b.ts"));
  expect(verifyDecision(events)).toMatchObject({ state: "unverified", nudge: true, files: 1, nudged: false });
  // A new ask of yours resets the one-ask allowance.
  expect(verifyDecision(log(ask(1), edit(), ask(2, VERIFY_BY), ask(3), edit("src/c.ts")))).toMatchObject({ state: "unverified", nudge: true, nudged: false });
  // A later ask that changes nothing has nothing to verify, whatever happened before.
  expect(verifyDecision(log(ask(1), edit(), ask(2)))).toMatchObject({ state: "none", nudge: false });
});

it("words the request for the case at hand, and never invites a claim without a check", () => {
  const unverified = verifyAsk({ state: "unverified", nudge: true, files: 2, nudged: false });
  expect(unverified).toContain("changed 2 files");
  expect(unverified).toMatch(/ran no check/);
  const failing = verifyAsk({ state: "failing", nudge: true, files: 1, command: "pnpm test", nudged: false });
  expect(failing).toContain("pnpm test");
  expect(failing).toMatch(/changed 1 file(?!s)/); // singular
  for (const text of [unverified, failing]) expect(text).toMatch(/do not claim/);
});

it("says the next turn is the gateway's only when its request is all that is queued", () => {
  const followup = (by: string, id: string): [string, Record<string, unknown>] => ["run.followup", { id, text: "x", by }];
  expect(nextTurnBy(log(ask()))).toBe("you");
  expect(nextTurnBy(log(ask(), followup(VERIFY_BY, "f1")))).toBe(VERIFY_BY);
  // You also said something: the turn is yours, and it answers both.
  expect(nextTurnBy(log(ask(), followup(VERIFY_BY, "f1"), followup("you", "f2")))).toBe("you");
  // A request already answered by a turn doesn't carry over.
  expect(nextTurnBy(log(ask(), followup(VERIFY_BY, "f1"), ask(2, VERIFY_BY)))).toBe("you");
  expect(nextTurnBy(log(ask(), followup(VERIFY_BY, "f1"), ["run.followup.withdrawn", { id: "f1" }]))).toBe("you");
});
