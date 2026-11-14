import { expect, it } from "vitest";
import type { AnyEvent } from "./events.js";
import { REVIEW_BY, clipDiff, parseReview, reviewAsk, reviewFollowUp } from "./review.js";
import { ROLES, readOnlyRules } from "./roles.js";
import { VERIFY_BY, nextTurnBy } from "./verification.js";

it("reads a reviewer's verdict from its first line, however it is dressed", () => {
  expect(parseReview("VERDICT: PASS")).toEqual({ state: "passed", findings: "" });
  expect(parseReview("\n**VERDICT: PASS**\nLooks right.")).toEqual({ state: "passed", findings: "" });
  expect(parseReview("`VERDICT: CHANGES`\n1. src/a.ts:12 off by one; use <= .")).toEqual({ state: "changes", findings: "1. src/a.ts:12 off by one; use <= ." });
  expect(parseReview("verdict: changes\n\n1. a\n2. b").state).toBe("changes");
});

it("does not act on a reply it cannot read", () => {
  expect(parseReview("I think this is mostly fine but...").state).toBe("unclear");
  expect(parseReview("VERDICT: CHANGES").state).toBe("unclear"); // changes wanted, none named
  expect(parseReview("").state).toBe("unclear");
  expect(parseReview("The VERDICT: PASS line is required").state).toBe("unclear"); // not at the start of a line
});

it("gives the reviewer the ask, the proof and the diff, and a shape to reply in", () => {
  const ask = reviewAsk({ ask: "Add a clock module", base: "main", diff: "+export const now = () => Date.now();", proof: "pnpm test passed after the last edit." });
  expect(ask).toContain("You cannot edit anything");
  expect(ask).toContain("Add a clock module");
  expect(ask).toContain("pnpm test passed after the last edit.");
  expect(ask).toContain("```diff\n+export const now");
  expect(ask).toContain("`VERDICT: PASS` or `VERDICT: CHANGES`");
  expect(ask).toMatch(/Do not list style/);
});

it("cuts a long diff at a line and says so", () => {
  const long = Array.from({ length: 5000 }, (_, i) => `+line ${i}`).join("\n");
  const { text, clipped } = clipDiff(long, 1000);
  expect(clipped).toBe(true);
  expect(text.length).toBeLessThanOrEqual(1000);
  expect(text.endsWith("\n")).toBe(false);
  expect(text.split("\n").at(-1)).toMatch(/^\+line \d+$/); // whole lines only
  expect(clipDiff("short")).toEqual({ text: "short", clipped: false });
  expect(reviewAsk({ ask: "x", base: "main", diff: "y".repeat(70_000), proof: "none" })).toContain("cut short because it is long");
});

it("tells the builder what to fix, and that disagreeing is allowed", () => {
  const text = reviewFollowUp("Codex", "1. src/a.ts:12 off by one.");
  expect(text).toContain("A reviewer (Codex)");
  expect(text).toContain("1. src/a.ts:12 off by one.");
  expect(text).toMatch(/say why in a line/);
  expect(text).toMatch(/run the checks again/);
});

it("roles that don't write are refused every write, and the builder is not", () => {
  const write = { tool: "Edit", kind: "write" as const, paths: ["src/a.ts"], raw: {} };
  const read = { tool: "Read", kind: "read" as const, paths: ["src/a.ts"], raw: {} };
  for (const id of ["reviewer", "researcher", "operator"] as const) {
    const [rule] = readOnlyRules(ROLES[id]);
    expect(rule!.verdict).toBe("deny");
    expect(rule!.matches(write, {} as never)).toBe(true);
    expect(rule!.matches(read, {} as never)).toBe(false);
  }
  expect(readOnlyRules(ROLES.builder)).toEqual([]);
});

it("a turn queued only by a reviewer is the reviewer's; one you also spoke in is yours", () => {
  const log = (...items: Array<[string, Record<string, unknown>]>) => items.map(([kind, body], i) => ({ seq: i + 1, at: i, kind, run: "r1", session: null, body, prev: "", hash: "" }) as unknown as AnyEvent);
  const followup = (by: string, id: string): [string, Record<string, unknown>] => ["run.followup", { id, text: "x", by }];
  expect(nextTurnBy(log(followup(REVIEW_BY, "f1")))).toBe(REVIEW_BY);
  expect(nextTurnBy(log(followup(REVIEW_BY, "f1"), followup("you", "f2")))).toBe("you");
  expect(nextTurnBy(log(followup(REVIEW_BY, "f1"), followup(VERIFY_BY, "f2")))).toBe("you"); // two sources: not one author
  expect(nextTurnBy(log(followup("crew results", "f1")))).toBe("you"); // a room's results are a turn of yours, as before
});
