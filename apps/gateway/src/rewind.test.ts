import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold } from "@shuacrew/core";
import { MockRuntime, type Runtime, type RunSpec } from "@shuacrew/runtimes";
import { afterEach, expect, it } from "vitest";
import { Supervisor } from "./runs.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const c of cleanups.splice(0)) c(); });

function repo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "shua-rewind-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString().trim();
  git("init", "-q", "-b", "main");
  writeFileSync(path.join(dir, "README.md"), "hello\n");
  git("add", "README.md");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
  return dir;
}

/** An agent that really writes files in its worktree: each turn applies that turn's `{ file: contents }`, then checkpoints. */
function world(turns: Array<Record<string, string>>) {
  process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
  const store = new EventStore(":memory:");
  const asks: string[] = [];
  let cwd = "";
  const agent: Runtime = Object.assign(Object.create(new MockRuntime({ pace: 0 })), {
    id: "mock",
    async *start(run: RunSpec) {
      asks.push(run.ask);
      cwd = run.cwd;
      yield { type: "session", id: `conv-${run.id}` } as const; // a conversation to resume, as real runtimes have
      for (const [file, text] of Object.entries(turns[asks.length - 1] ?? {})) {
        writeFileSync(path.join(run.cwd, file), text);
        yield { type: "file", path: file } as const;
      }
      yield { type: "check", command: "pnpm test", exitCode: 0 } as const; // verified, so no proof turn gets in the way
      yield { type: "checkpoint", note: "work" } as const;
      yield { type: "done", text: "Finished." } as const;
    },
  });
  const supervisor = new Supervisor(store, new Map<string, Runtime>([["mock", agent]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const view = (run: string) => fold(store.read(0)).runs[run];
  const settled = async (run: string, n: number) => {
    const deadline = Date.now() + 15_000;
    while (store.forRun(run).filter((e) => e.kind === "turn.completed").length < n || !["reviewing", "done"].includes(view(run)?.status ?? "")) {
      if (Date.now() > deadline) throw new Error(`timed out: ${view(run)?.status}`);
      await new Promise((r) => setTimeout(r, 15));
    }
  };
  const tree = () => ({ read: (f: string) => readFileSync(path.join(cwd, f), "utf8"), has: (f: string) => existsSync(path.join(cwd, f)), git: (...a: string[]) => execFileSync("git", a, { cwd, stdio: "pipe" }).toString().trim() });
  return { store, supervisor, asks, view, settled, tree };
}

it("puts the files back as they were when a turn ended: edits undone, and files created since removed", async () => {
  const { store, supervisor, view, settled, tree } = world([{ "a.ts": "one\n" }, { "a.ts": "two\n", "b.ts": "new\n" }]);
  const run = supervisor.launch({ ask: "Write a", runtime: "mock", repo: repo() });
  await settled(run, 1);
  supervisor.followUp(run, "Change a and add b");
  await settled(run, 2);
  expect(tree().read("a.ts")).toBe("two\n");
  expect(tree().has("b.ts")).toBe(true);
  expect(view(run)?.verification?.state).toBe("verified");

  const result = await supervisor.rewind(run, 1);
  expect(result.turn).toBe(1);
  expect(tree().read("a.ts")).toBe("one\n");
  expect(tree().has("b.ts")).toBe(false); // created after turn 1, so it goes
  expect(tree().read("README.md")).toBe("hello\n"); // untouched files stay
  expect(tree().git("status", "--porcelain")).toBe(""); // and the tree is clean: the rewind is committed

  // Nothing is lost: turn 2's work is still in history, and the rewind is one more checkpoint on top.
  const log = tree().git("log", "--format=%s");
  expect(log.split("\n")[0]).toBe("rewind to turn 1");
  expect(tree().git("show", "HEAD~1:b.ts")).toBe("new");
  const kinds = store.forRun(run).map((e) => e.kind);
  expect(kinds.filter((k) => k === "run.rewound")).toHaveLength(1);
  expect(store.forRun(run).findLast((e) => e.kind === "checkpoint.created")).toMatchObject({ body: { note: "Rewound to turn 1" } });
  expect(view(run)?.verification).toBeUndefined(); // the old verdict was about files that are gone
});

it("tells the agent on its next turn, once, that its files changed under it", async () => {
  const { supervisor, asks, settled } = world([{ "a.ts": "one\n" }, { "a.ts": "two\n" }, {}, {}]);
  const run = supervisor.launch({ ask: "Write a", runtime: "mock", repo: repo() });
  await settled(run, 1);
  supervisor.followUp(run, "Change a");
  await settled(run, 2);
  await supervisor.rewind(run, 1);
  supervisor.followUp(run, "Carry on");
  await settled(run, 3);
  expect(asks[2]).toMatch(/^Note from ShuaCrew: since your last turn, this session's files were put back to how they were at the end of turn 1\./);
  expect(asks[2]!.endsWith("Carry on")).toBe(true);
  supervisor.followUp(run, "And again");
  await settled(run, 4);
  expect(asks[3]).toBe("And again"); // told once
});

it("can undo a rewind, because every state is a checkpoint you can name", async () => {
  const { store, supervisor, settled, tree } = world([{ "a.ts": "one\n" }, { "a.ts": "two\n", "b.ts": "new\n" }]);
  const run = supervisor.launch({ ask: "Write a", runtime: "mock", repo: repo() });
  await settled(run, 1);
  supervisor.followUp(run, "Change a and add b");
  await settled(run, 2);
  const turnTwo = store.forRun(run).findLast((e) => e.kind === "checkpoint.created");
  const commit = turnTwo?.kind === "checkpoint.created" ? turnTwo.body.commit! : "";
  await supervisor.rewind(run, 1);
  expect(tree().read("a.ts")).toBe("one\n");
  expect(tree().has("b.ts")).toBe(false);
  // Back to exactly where turn 2 left things, by naming that checkpoint.
  await supervisor.rewind(run, { commit });
  expect(tree().read("a.ts")).toBe("two\n");
  expect(tree().read("b.ts")).toBe("new\n");
  // By turn number, a rewind's own checkpoint is skipped: "turn 2" still means the work of turn 2.
  await supervisor.rewind(run, 1);
  await supervisor.rewind(run, 2);
  expect(tree().read("a.ts")).toBe("two\n");
  // A commit that isn't one of this session's checkpoints is refused, whatever it is.
  await expect(supervisor.rewind(run, { commit: tree().git("rev-parse", "main") })).rejects.toThrow(/does not belong to this session/);
});

it("refuses when there is nothing safe to rewind", async () => {
  const { supervisor, settled } = world([{ "a.ts": "one\n" }]);
  const loose = supervisor.launch({ ask: "Scratch", runtime: "mock" }); // no repo: no branch of its own
  await settled(loose, 1);
  await expect(supervisor.rewind(loose, 1)).rejects.toThrow(/no files of its own/);
  await expect(supervisor.rewind("r_missing", 1)).rejects.toThrow(/no run/);
  const run = supervisor.launch({ ask: "Write a", runtime: "mock", repo: repo() });
  await expect(supervisor.rewind(run, 1)).rejects.toThrow(/Wait for this turn to finish/); // still queued or running
  await settled(run, 1);
  await expect(supervisor.rewind(run, 0)).rejects.toThrow(/No checkpoint at or before turn 0/);
});
