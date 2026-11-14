import { expect, it } from "vitest";
import { MergeQueue } from "./merge.js";
import { EventStore } from "./store.js";
import type { Worktrees } from "./worktrees.js";

/** A repository stand-in that records what was landed, in order. */
function world() {
  const store = new EventStore(":memory:");
  const landed: string[] = [];
  const worktrees = {
    land: async (_repo: string, tree: { branch: string }) => { landed.push(tree.branch); return { ok: true as const, commit: `c_${tree.branch}` }; },
    remove: async () => undefined,
  } as unknown as Worktrees;
  const session = (run: string) => {
    store.append("run.created", { title: run, ask: "x", runtime: "claude", repo: "/repo", labels: [] }, { run });
    store.append("run.worktree", { path: `/wt/${run}`, branch: `shua/${run}`, base: "main" }, { run });
    store.append("run.status", { status: "reviewing" }, { run });
  };
  const status = (run: string) => store.forRun(run).findLast((e) => e.kind === "run.status")?.body.status;
  return { store, landed, worktrees, session, status };
}

it("finishes a merge you asked for before the gateway restarted, in the order you asked", async () => {
  const { store, landed, worktrees, session, status } = world();
  for (const run of ["a", "b", "c"]) session(run);
  store.append("merge.queued", { position: 1 }, { run: "b" });
  store.append("merge.queued", { position: 2 }, { run: "a" });
  // …the gateway stops here. A new one starts with only the log:
  const merges = new MergeQueue(store, worktrees);
  expect(merges.recover()).toEqual(["b", "a"]);
  await merges.idle();
  expect(landed).toEqual(["shua/b", "shua/a"]);
  expect([status("a"), status("b"), status("c")]).toEqual(["merged", "merged", "reviewing"]);
  expect(merges.recover()).toEqual([]); // nothing is left to recover
  store.close();
});

it("does not redo a merge that finished, or one the session has moved on from", async () => {
  const { store, landed, worktrees, session } = world();
  for (const run of ["landed", "failed", "continued", "rejected", "cancelled"]) { session(run); store.append("merge.queued", { position: 1 }, { run }); }
  store.append("merge.landed", { commit: "abc", branch: "shua/landed" }, { run: "landed" });
  store.append("merge.failed", { reason: "checks failed after rebase: pnpm test" }, { run: "failed" });
  store.append("turn.started", { turn: 2, text: "one more thing", by: "you" }, { run: "continued" }); // you asked for more after queueing it
  store.append("run.status", { status: "failed", reason: "rejected in review" }, { run: "rejected" });
  store.append("run.status", { status: "cancelled" }, { run: "cancelled" });
  session("old"); store.append("merge.queued", { position: 1 }, { run: "old" });
  const merges = new MergeQueue(store, worktrees);
  expect(merges.recover(Date.now() + 25 * 3_600_000)).toEqual([]); // asked more than a day ago: it never lands by surprise
  expect(merges.recover()).toEqual(["old"]); // …while one asked just now does
  await merges.idle();
  expect(landed).toEqual(["shua/old"]);
  store.close();
});
