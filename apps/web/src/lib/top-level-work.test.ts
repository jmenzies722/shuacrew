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
