import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold } from "@shuacrew/core";
import { REVIEW_BY } from "@shuacrew/core/review";
import { MockRuntime, type Runtime, type RunSpec } from "@shuacrew/runtimes";
import { afterEach, expect, it } from "vitest";
import { Supervisor } from "./runs.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const c of cleanups.splice(0)) c(); });

function repo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "shua-review-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString().trim();
  git("init", "-q", "-b", "main");
  writeFileSync(path.join(dir, "README.md"), "hello\n");
  git("add", "README.md");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
  return dir;
}

/** A builder that writes one file per turn and checks it, and a reviewer that replies with what the test gives it. */
function world(reviewerSays: string[]) {
  process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
  const store = new EventStore(":memory:");
  const builderAsks: string[] = [], reviewerAsks: string[] = [];
  const agent: Runtime = Object.assign(Object.create(new MockRuntime({ pace: 0 })), {
    id: "mock",
    async *start(run: RunSpec) {
      yield { type: "session", id: `conv-${run.id}` } as const;
      if (run.ask.startsWith("You are reviewing a change")) {
        reviewerAsks.push(run.ask);
        const reply = reviewerSays[reviewerAsks.length - 1] ?? "VERDICT: PASS";
        if (reply === "<crash>") { yield { type: "error", message: "reviewer crashed" } as const; return; }
        yield { type: "done", text: reply } as const;
        return;
      }
      builderAsks.push(run.ask);
      const file = `src-${builderAsks.length}.ts`;
      writeFileSync(path.join(run.cwd, file), `export const n = ${builderAsks.length};\n`);
      yield { type: "file", path: file } as const;
      yield { type: "check", command: "pnpm test", exitCode: 0 } as const;
      yield { type: "checkpoint", note: "work" } as const;
      yield { type: "done", text: "Finished." } as const;
    },
  });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["mock", agent]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const view = (run: string) => fold(store.read(0)).runs[run];
  const until = async (ok: () => boolean, what: string) => {
    const deadline = Date.now() + 15_000;
    while (!ok()) { if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`); await new Promise((r) => setTimeout(r, 15)); }
  };
  const built = (run: string, turns: number) => until(() => store.forRun(run).filter((e) => e.kind === "turn.completed").length >= turns && ["reviewing", "done"].includes(view(run)?.status ?? ""), `${turns} builder turn(s)`);
  const reported = (run: string, n = 1) => until(() => store.forRun(run).filter((e) => e.kind === "review.reported").length >= n, "the review to report");
  return { store, supervisor, builderAsks, reviewerAsks, view, built, reported };
}

it("a passing review is recorded on the session and asks nothing more of the builder", async () => {
  const { store, supervisor, builderAsks, reviewerAsks, view, built, reported } = world(["VERDICT: PASS"]);
  const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: repo() });
  await built(run, 1);
  const { reviewRun } = await supervisor.review(run);
  expect(view(run)?.reviewPass).toMatchObject({ state: "running", run: reviewRun });
  await reported(run);
  expect(view(run)?.reviewPass).toMatchObject({ state: "passed", run: reviewRun });
  // The reviewer saw the ask, the proof and the diff, and worked without the repository.
  expect(reviewerAsks[0]).toContain("Add a clock module");
  expect(reviewerAsks[0]).toContain("pnpm test passed after the last edit.");
  expect(reviewerAsks[0]).toContain("+export const n = 1;");
  expect(view(reviewRun)?.worktree).toBeUndefined();
  expect(view(reviewRun)?.title).toBe(`Review: ${view(run)?.title}`);
  await new Promise((r) => setTimeout(r, 200));
  expect(builderAsks).toHaveLength(1);
  expect(store.forRun(run).some((e) => e.kind === "run.followup")).toBe(false);
});

it("requested changes go back to the builder once, as the reviewer's turn, and the fix is verified again", async () => {
  const { store, supervisor, builderAsks, view, built, reported } = world(["VERDICT: CHANGES\n1. src-1.ts:1 exports the wrong constant; export `now` instead."]);
  const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: repo() });
  await built(run, 1);
  await supervisor.review(run);
  await reported(run);
  await built(run, 2);
  expect(view(run)?.reviewPass?.state).toBe("changes");
  expect(builderAsks[1]).toMatch(/^A reviewer \(mock\) read your change and asked for these fixes:/);
  expect(builderAsks[1]).toContain("src-1.ts:1 exports the wrong constant");
  expect(store.forRun(run).flatMap((e) => (e.kind === "turn.started" ? [e.body.by] : []))).toEqual(["you", REVIEW_BY]);
  expect(view(run)?.verification).toMatchObject({ state: "verified", turn: 2 }); // the fix went through the same gate
});

it("does not act on a reply it cannot read, or on a reviewer that failed", async () => {
  const { supervisor, builderAsks, view, built, reported } = world(["Looks mostly fine to me, maybe rename things.", "<crash>"]);
  const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: repo() });
  await built(run, 1);
  await supervisor.review(run);
  await reported(run, 1);
  expect(view(run)?.reviewPass).toMatchObject({ state: "unclear", text: "Looks mostly fine to me, maybe rename things." });
  await supervisor.review(run);
  await reported(run, 2);
  expect(view(run)?.reviewPass).toMatchObject({ state: "unclear", text: "The reviewer stopped before it finished." });
  await new Promise((r) => setTimeout(r, 200));
  expect(builderAsks).toHaveLength(1); // nothing was passed on
});

it("refuses a review that makes no sense", async () => {
  const { supervisor, built, reported } = world(["VERDICT: PASS"]);
  await expect(supervisor.review("r_missing")).rejects.toThrow(/no run/);
  const loose = supervisor.launch({ ask: "Scratch", runtime: "mock" });
  await built(loose, 1);
  await expect(supervisor.review(loose)).rejects.toThrow(/its own branch/);
  const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: repo() });
  await expect(supervisor.review(run)).rejects.toThrow(/Wait for this turn to finish/);
  await built(run, 1);
  const { reviewRun } = await supervisor.review(run);
  await expect(supervisor.review(run)).rejects.toThrow(/already running/);
  await reported(run);
  await expect(supervisor.review(reviewRun)).rejects.toThrow(/its own branch|not itself reviewed/);
});

it("your next ask clears the old review, because it was about old work", async () => {
  const { supervisor, view, built, reported } = world(["VERDICT: PASS"]);
  const run = supervisor.launch({ ask: "Add a clock module", runtime: "mock", repo: repo() });
  await built(run, 1);
  await supervisor.review(run);
  await reported(run);
  expect(view(run)?.reviewPass?.state).toBe("passed");
  supervisor.followUp(run, "Now add a timezone");
  await built(run, 2);
  expect(view(run)?.reviewPass).toBeUndefined();
});
