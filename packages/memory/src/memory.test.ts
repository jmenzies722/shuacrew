import type { AnyEvent } from "@shuacrew/core";
import { describe, expect, it } from "vitest";
import { correctionIn, foldMemory, live, runRecallEval, skillCandidates, terms } from "./index.js";

let seq = 0;
const ev = (kind: string, body: object, run: string | null = null) => ({ seq: ++seq, at: Date.now(), kind, body, run }) as unknown as AnyEvent;
const learned = (id: string, text: string, confidence = 0.6) =>
  ev("lesson.learned", { id, text, scope: "global", origin: "stated", confidence, evidence: [] });

describe("memory", () => {
  it("moves a lesson's confidence with the reviews of the runs it was used in", () => {
    const m = foldMemory([
      learned("l1", "Use the injected clock"),
      ev("lesson.applied", { id: "l1" }, "r1"),
      ev("review.decided", { approve: true }, "r1"),
      ev("lesson.applied", { id: "l1" }, "r2"),
      ev("review.decided", { approve: false }, "r2"),
    ]);
    expect(m.lessons.l1).toMatchObject({ applied: 2, wins: 1, losses: 1, confidence: 0.53 });
  });

  it("drops lessons that are retired, expired or argued down", () => {
    const m = foldMemory([learned("a", "x y"), learned("b", "x y", 0.2), ev("lesson.learned", { id: "c", text: "x", scope: "global", origin: "stated", confidence: 0.9, expires: 1, evidence: [] }), learned("d", "x"), ev("lesson.retired", { id: "d", reason: "wrong" })]);
    expect(Object.values(m.lessons).filter((l) => live(l)).map((l) => l.id)).toEqual(["a"]);
  });

  it("hears a correction in a follow-up, and ignores an ordinary one", () => {
    expect(correctionIn("no, use pnpm not npm. Also the tests are in src/")).toBe("Use pnpm not npm.");
    expect(correctionIn("No — never commit straight to main, open a branch.")).toBe("Never commit straight to main, open a branch.");
    expect(correctionIn("Always run the linter before you say you're done")).toBe("Always run the linter before you say you're done.");
    expect(correctionIn("also add a test for the empty case")).toBeUndefined();
  });

  it("proposes a skill once the same kind of ask comes back three times", () => {
    const m = foldMemory([
      ev("run.created", { title: "", ask: "Bump the stale dependencies and fix the build", runtime: "mock", labels: [], incognito: false }, "r1"),
      ev("run.created", { title: "", ask: "Bump stale dependencies, fix whatever build breaks", runtime: "mock", labels: [], incognito: false }, "r2"),
      ev("run.created", { title: "", ask: "Rename the README title", runtime: "mock", labels: [], incognito: false }, "r3"),
      ev("run.created", { title: "", ask: "bump stale dependencies and fix the build again", runtime: "mock", labels: [], incognito: false }, "r4"),
      ev("run.created", { title: "", ask: "Bump the stale dependencies and fix the build", runtime: "mock", labels: [], incognito: true }, "r5"),
    ]);
    const [skill, ...rest] = skillCandidates(m);
    expect(rest).toEqual([]);
    expect(skill?.from).toEqual(["r1", "r2", "r4"]);
    expect(skill?.name).toBe("bump-stale-dependencies-fix");
  });

  it("stems words so tests, testing and tested meet", () => {
    expect(terms("Testing the tests we tested")).toEqual(["test", "test", "test"]);
  });
});

describe("recall eval", () => {
  it("gives each run the lessons it needs and little else", () => {
    const result = runRecallEval();
    const misses = result.cases.filter((c) => c.got.join() !== c.want.join());
    // Measured 89% / 89% on 2026-09-23. Known misses, both limits of keyword recall:
    // - "fix the flaky upload test" should also get the injected-Clock lesson; they share only "test".
    // - the column name "users.last_seen" matches "user-visible change" and drags in the changelog lesson.
    expect({ recall: result.recall >= 0.85, precision: result.precision >= 0.85, misses: misses.map((m) => m.ask) }).toEqual({
      recall: true,
      precision: true,
      misses: ["Fix the flaky upload retry test on CI", "Add a users.last_seen column and migrate existing rows"],
    });
  });
});
