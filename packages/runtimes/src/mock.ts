/**
 * The mock runtime: a deterministic, scripted agent.
 *
 * It behaves like a real one — reads, runs a failing check, edits, re-runs, delegates to
 * subagents, asks before pushing, reports usage — so the whole product can be built, tested and
 * demoed without spending a subscription's usage window. Words in the ask steer the script:
 * "push"/"ship" asks for approval, "parallel"/"subagents" delegates, "(fail)" ends in failure,
 * "limit" hits a usage window.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Runtime, RunContext, RunSpec, RuntimeEvent, RuntimeStatus } from "./runtime.js";

export interface MockOptions {
  /** Milliseconds between steps. 0 in tests, ~400 in demos. */
  pace?: number;
}

export class MockRuntime implements Runtime {
  readonly id = "mock";
  readonly label = "Mock (scripted, no usage)";
  readonly authMode = "subscription" as const;
  readonly capabilities = { subagents: true, checkpoints: true, cost: false, images: false, resume: true };
  readonly models = [
    { id: "mock-fast", label: "Mock Fast", tier: "fast" as const },
    { id: "mock-frontier", label: "Mock Frontier", tier: "frontier" as const },
  ];
  private pace: number;

  constructor(options: MockOptions = {}) {
    this.pace = options.pace ?? Number(process.env.SHUACREW_MOCK_PACE ?? 350);
  }

  async status(): Promise<RuntimeStatus> {
    return { installed: true, signedIn: true, account: "mock", version: "1", detail: "always available", overridingKeys: [] };
  }

  async *start(run: RunSpec, ctx: RunContext): AsyncIterable<RuntimeEvent> {
    const ask = run.ask.toLowerCase();
    const wait = () => sleep(this.pace, ctx.signal);
    const say = async function* (text: string): AsyncGenerator<RuntimeEvent> {
      for (const chunk of text.match(/.{1,18}(\s|$)|.+/g) ?? [text]) {
        yield { type: "text", text: chunk };
        await sleep(20, ctx.signal);
      }
    };
    let tokens = 0;
    const usage = (n: number): RuntimeEvent => {
      tokens += n;
      return { type: "usage", inputTokens: n, outputTokens: Math.round(n / 5), contextUsed: 8000 + tokens * 3, contextLimit: 200_000 };
    };

    yield { type: "session", id: run.resume ?? `mock-${run.id}` };
    if (ask.startsWith("break this task into")) {
      yield* say("Here's the plan:\n");
      yield { type: "done", text: "1. Reproduce the failure with a focused test\n2. Inject the clock into the retry helper\n3. Run the full suite and tidy up" };
      return;
    }
    // A usage window only interrupts fresh work: a run resumed after the window reset carries on.
    if (ask.includes("limit") && !run.resume) {
      yield { type: "limited", until: Date.now() + 60 * 60_000, message: "Mock usage limit reached — try again in an hour" };
      return;
    }
    yield* say("I'll look at how this is set up first, then reproduce the problem before changing anything.\n");
    yield usage(1800);
    await wait();

    yield { type: "tool-call", id: "t1", tool: "Read", input: { file_path: `${run.cwd}/package.json` } };
    await wait();
    yield { type: "tool-result", id: "t1", ok: true, output: '{ "name": "demo", "scripts": { "test": "vitest run" } }', durationMs: 12 };

    yield { type: "tool-call", id: "t2", tool: "Bash", input: { command: "pnpm test" } };
    const test1 = await ctx.approve("Bash", { command: "pnpm test" });
    await wait();
    if (test1.allow) {
      yield { type: "tool-result", id: "t2", ok: false, output: "FAIL src/upload.test.ts > retries twice\n  expected 2 attempts, got 3", durationMs: 1840 };
      yield { type: "check", command: "pnpm test", exitCode: 1, output: "1 failed, 41 passed" };
    }
    yield usage(2600);
    yield* say("Reproduced: the retry uses real timers while the test advances fake ones. ");

    if (/parallel|subagent|delegate/.test(ask)) {
      yield* say("I'll split the investigation across two subagents.\n");
      for (const [id, name, task] of [
        ["s1", "explorer", "Map every caller of the retry helper"],
        ["s2", "reviewer", "Check the other timers in the upload path"],
      ] as const) {
        yield { type: "subagent-start", id, name, task };
      }
      await wait();
      yield { type: "tool-call", id: "t3", tool: "Grep", input: { pattern: "retry(", path: run.cwd }, subagent: "s1" };
      await wait();
      yield { type: "tool-result", id: "t3", ok: true, output: "src/upload.ts:41\nsrc/sync.ts:12", durationMs: 40 };
      yield { type: "subagent-end", id: "s1", ok: true, summary: "Two callers: upload.ts and sync.ts" };
      await wait();
      yield { type: "subagent-end", id: "s2", ok: true, summary: "sync.ts has the same bug" };
      yield usage(3100);
    }

    yield* say("Switching both call sites to the injected clock.\n");
    // In a repo run the mock really writes, so diffs, review and the merge queue have real work.
    // Each run edits its own file (named from the ask), so parallel runs don't collide.
    const inRepo = existsSync(path.join(run.cwd, ".git"));
    const own = inRepo ? `src/${slug(run.ask)}.ts` : "src/upload.ts";
    yield { type: "tool-call", id: "t4", tool: "Edit", input: { file_path: `${run.cwd}/${own}` } };
    const edit = await ctx.approve("Edit", { file_path: `${run.cwd}/${own}` });
    await wait();
    if (edit.allow && inRepo) {
      mkdirSync(path.join(run.cwd, "src"), { recursive: true });
      writeFileSync(
        path.join(run.cwd, own),
        `// ${run.ask.split("\n")[0]}\nexport function retry(clock: { now(): number }, attempts = 2): number {\n  const started = clock.now();\n  for (let i = 0; i < attempts; i++) {\n    if (clock.now() - started > 5000) return i;\n  }\n  return attempts;\n}\n`,
      );
    }
    yield { type: "tool-result", id: "t4", ok: edit.allow, output: edit.allow ? `Edited ${own}` : edit.reason };
    if (edit.allow) yield { type: "file", path: own };
    if (/parallel|subagent/.test(ask)) yield { type: "file", path: "src/sync.ts" };
    yield { type: "checkpoint", note: "clock injected" };

    yield { type: "tool-call", id: "t5", tool: "Bash", input: { command: "pnpm test" } };
    await wait();
    const fails = ask.includes("(fail)"); // an explicit marker: ordinary words like "failed" must not trigger it
    yield { type: "tool-result", id: "t5", ok: !fails, output: fails ? "2 failed" : "42 passed", durationMs: 1712 };
    yield { type: "check", command: "pnpm test", exitCode: fails ? 1 : 0, output: fails ? "2 failed" : "42 passed" };
    yield usage(2200);

    if (/push|ship|pr\b|merge/.test(ask) && !fails) {
      yield { type: "tool-call", id: "t6", tool: "Bash", input: { command: "git push origin HEAD" } };
      const push = await ctx.approve("Bash", { command: "git push origin HEAD" });
      await wait();
      yield {
        type: "tool-result",
        id: "t6",
        ok: push.allow,
        output: push.allow ? "pushed" : `not pushed: ${push.reason}`,
      };
    }

    if (fails) {
      yield { type: "error", message: "Tests still fail after the change — stopping rather than guessing." };
      return;
    }
    yield { type: "done", text: "Fixed: the retry now takes its clock from the uploader, so tests and CI agree on time. 42/42 passing.", durationMs: 9000 };
  }
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "change";
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("cancelled"));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("cancelled"));
      },
      { once: true },
    );
  });
}
