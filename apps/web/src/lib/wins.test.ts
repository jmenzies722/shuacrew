import type { RunView } from "@shuacrew/core/projections";
import { expect, it } from "vitest";
import { newWins } from "./wins";

const run = (id: string, status: string, parent?: string) => ({ id, status, parent, title: id }) as unknown as RunView;
it("celebrates only live transitions of top-level sessions into done or merged", () => {
  const first = newWins(null, { a: run("a", "done"), b: run("b", "running"), c: run("c", "running", "b") });
  expect(first.wins).toEqual([]);
  const second = newWins(first.next, { a: run("a", "merged"), b: run("b", "done"), c: run("c", "done", "b"), d: run("d", "done") });
  expect(second.wins.map((r) => r.id)).toEqual(["b"]);
});
