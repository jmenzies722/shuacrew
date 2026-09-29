import type { RunView } from "@shuacrew/core/projections";
import { describe, expect, it } from "vitest";
import { isTopLevelWork } from "./crew";

const run = (id: string, extra: Partial<RunView> = {}) => ({ id, status: "done", ...extra }) as RunView;

describe("isTopLevelWork", () => {
  it("shows a session you started", () => {
    const runs = { a: run("a") };
    expect(isTopLevelWork(runs.a, runs)).toBe(true);
  });
  it("folds a delegation into its live parent session", () => {
    const runs = { p: run("p"), c: run("c", { parent: "p" }) };
    expect(isTopLevelWork(runs.c, runs)).toBe(false);
  });
});

describe("isTopLevelWork with an archived parent", () => {
  it("hides the children of an archived session (the projection drops archived runs)", () => {
    const runs = { c: run("c", { parent: "archived-parent" }) };
    expect(isTopLevelWork(runs.c, runs)).toBe(false);
  });
});

describe("isTopLevelWork and learning", () => {
  it("keeps coach, course and drill sessions out of work views", () => {
    const runs = { l: run("l", { labels: ["learning", "learn-kind:coach"] }), w: run("w", { labels: [] }) };
    expect(isTopLevelWork(runs.l, runs)).toBe(false);
    expect(isTopLevelWork(runs.w, runs)).toBe(true);
  });
});
