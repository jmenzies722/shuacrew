import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
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
  const dir = mkdtempSync(path.join(os.tmpdir(), "shua-race-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString().trim();
  git("init", "-q", "-b", "main");
  writeFileSync(path.join(dir, "README.md"), "hello\n");
  git("add", "README.md");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
  return dir;
}

/** What one side does: change a file, and (or not) run a passing check. `checks` is per turn, so a proof turn can differ. */
type Side = { checks: Array<0 | 1 | null>; fail?: boolean };

function world(sides: Record<string, Side>) {
  process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
  const store = new EventStore(":memory:");
  const turns: Record<string, number> = {};
  const provider = (id: string): Runtime => Object.assign(Object.create(new MockRuntime({ pace: 0 })), {
    id,
    async *start(run: RunSpec) {
      const turn = (turns[run.id] = (turns[run.id] ?? 0) + 1), side = sides[id]!;
      yield { type: "session", id: `conv-${run.id}` } as const;
      if (side.fail) { yield { type: "error", message: `${id} broke` } as const; return; }
      if (turn === 1) { writeFileSync(path.join(run.cwd, `${id}.ts`), "export {};\n"); yield { type: "file", path: `${id}.ts` } as const; }
      const check = side.checks[turn - 1];
      if (check !== null && check !== undefined) yield { type: "check", command: "pnpm test", exitCode: check } as const;
      yield { type: "checkpoint", note: "work" } as const;
      yield { type: "done", text: "Finished." } as const;
    },
  });
  const supervisor = new Supervisor(store, new Map<string, Runtime>(Object.keys(sides).map((id) => [id, provider(id)])), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [] });
  cleanups.push(() => { supervisor.shutdown(); store.close(); });
  const view = (run: string) => fold(store.read(0)).runs[run];
  const decided = async (run: string) => {
    const deadline = Date.now() + 15_000;
    while (!view(run)?.race?.outcome) { if (Date.now() > deadline) throw new Error(`race not decided: ${view(run)?.status}`); await new Promise((r) => setTimeout(r, 15)); }
  };
  return { store, supervisor, view, decided };
}

it("gives the task to both providers, each in its own branch, and the one that proved its change wins", async () => {
  // Claude checks its change. Codex doesn't, is asked once for proof, and still doesn't.
  const { store, supervisor, view, decided } = world({ claude: { checks: [0] }, codex: { checks: [null, null] } });
  const { race, runs } = supervisor.race({ ask: "Add a clock module", repo: repo() });
  const [a, b] = runs;
  expect(view(a)?.runtime).toBe("claude");
  expect(view(b)?.runtime).toBe("codex");
  expect(view(a)?.race).toEqual({ id: race, rival: b, rivalRuntime: "codex" }); // no outcome while they work
  await decided(a); await decided(b);
  expect(view(a)?.worktree?.path).not.toBe(view(b)?.worktree?.path); // neither can touch the other's files
  expect(view(a)?.race).toMatchObject({ outcome: "won", reason: "Claude proved its change (pnpm test); Codex did not check its change." });
  expect(view(b)?.race).toMatchObject({ outcome: "lost" });
  expect(view(b)?.verification).toMatchObject({ state: "unverified", nudged: true }); // it had its one chance to prove it
  for (const run of runs) expect(store.forRun(run).filter((e) => e.kind === "race.decided")).toHaveLength(1); // said once
});

it("does not pick between two proven changes", async () => {
  const { supervisor, view, decided } = world({ claude: { checks: [0] }, codex: { checks: [0] } });
  const { runs } = supervisor.race({ ask: "Add a clock module", repo: repo() });
  await decided(runs[0]); await decided(runs[1]);
  for (const run of runs) expect(view(run)?.race).toMatchObject({ outcome: "open", reason: "Both proved their change. Compare the two and keep the one you prefer." });
});

it("a side that breaks loses to one that finished", async () => {
  const { supervisor, view, decided } = world({ claude: { checks: [], fail: true }, codex: { checks: [0] } });
  const { runs } = supervisor.race({ ask: "Add a clock module", repo: repo() });
  await decided(runs[0]); await decided(runs[1]);
  expect(view(runs[1])?.race).toMatchObject({ outcome: "won", reason: "Codex proved its change (pnpm test); Claude did not finish." });
  expect(view(runs[0])?.race?.outcome).toBe("lost");
});

it("needs two providers and a project", () => {
  const one = world({ claude: { checks: [0] } });
  expect(() => one.supervisor.race({ ask: "Add a clock", repo: repo() })).toThrow(/needs two providers with room; only claude has it/);
  const two = world({ claude: { checks: [0] }, codex: { checks: [0] } });
  expect(() => two.supervisor.race({ ask: "Add a clock", repo: "" })).toThrow(/needs a project/);
  expect(() => two.supervisor.race({ ask: "  ", repo: repo() })).toThrow(/Say what to race on/);
});
