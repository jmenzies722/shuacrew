import { expect, it } from "vitest";
import { apply, emptyState, parseBody, type AnyEvent, type Kind } from "@shuacrew/core";
import { asking, crewBrief } from "./brief.js";

const now = new Date(2026, 9, 6, 15, 0).getTime();
function stateOf(steps: Array<[Kind, unknown, string | null, number]>) {
  const state = emptyState(); let seq = 0;
  for (const [kind, body, run, at] of steps) apply(state, { seq: ++seq, at, run, kind, body: parseBody(kind, body), session: null, prev: "", hash: "" } as AnyEvent);
  return state;
}

it("says what's working, what's waiting and why, what finished and failed, and what's next", () => {
  const state = stateOf([
    ["run.created", { runtime: "codex", title: "Fix login bug", ask: "fix it" }, "r1", now - 10 * 60_000],
    ["run.status", { status: "running" }, "r1", now - 9 * 60_000],
    ["run.created", { runtime: "claude", title: "Ship landing page", ask: "ship" }, "r2", now - 30 * 60_000],
    ["approval.requested", { id: "a1", tool: "Bash", input: { command: "git push origin main" }, risk: "high", reason: "outward-facing", rule: "ask.outward" }, "r2", now - 60_000],
    ["run.created", { runtime: "codex", title: "Summarize platform plan", ask: "sum" }, "r3", now - 120 * 60_000],
    ["run.status", { status: "done" }, "r3", now - 100 * 60_000],
    ["run.created", { runtime: "codex", title: "Old flaky job", ask: "x" }, "r4", now - 90 * 60_000],
    ["run.status", { status: "failed", reason: "tests kept failing" }, "r4", now - 80 * 60_000],
  ]);
  const b = crewBrief({ state, now, schedules: [{ name: "Morning standup", paused: false, next: [now + 17 * 3_600_000] }, { name: "Paused one", paused: true, next: [now + 60_000] }] });
  expect(b.headline).toBe("1 thing needs you, 1 working");
  expect(b.waiting[0]).toMatchObject({ title: "Ship landing page", what: "push to GitHub", why: "it reaches beyond this Mac or is hard to undo", command: "git push origin main" });
  expect(b.working[0]).toMatchObject({ title: "Fix login bug", who: "Codex" });
  expect(b.finished.map((f) => f.title)).toEqual(["Summarize platform plan"]);
  expect(b.failed[0]).toEqual({ id: "r4", title: "Old flaky job", why: "tests kept failing" });
  expect(b.next.map((n) => n.name)).toEqual(["Morning standup"]); // paused schedules stay out
  expect(b.text).toContain("WAITING ON YOU (1):");
  expect(b.text).toContain("NEXT ON ITS OWN: Morning standup");
});

it("is honest when nothing is happening", () => {
  const b = crewBrief({ state: emptyState(), now });
  expect(b.headline).toBe("All quiet");
  expect(b.text).toMatch(/^HEADLINE: All quiet\.\nTODAY: 0 tokens across 0 sessions\.$/);
});

it("describes what an approval wants to do", () => {
  expect(asking("Edit", { file_path: "/a/b/auth.ts" })).toBe("change auth.ts");
  expect(asking("mcp__notion__create_page", {})).toBe("use notion · create_page");
});

it("says what a command is for, the way a person would", async () => {
  const { plainly, because } = await import("./brief.js");
  expect(plainly(`/bin/zsh -lc "pwd && rg --files -g '*.swift'"`)).toBe("look through the project's files");
  expect(plainly("pnpm test")).toBe("run the tests");
  expect(plainly("git add -A && git commit -m x && git push")).toBe("push to GitHub");
  expect(plainly("rm -rf build && npm run build")).toBe("delete files");
  expect(plainly("ffmpeg -i a.mov b.mp4")).toBe("run a command");
  expect(because("default.ask", "no rule covers this call, so a person decides")).toBe("it hasn't asked to do this before");
  expect(because("custom", "matches your rule")).toBe("matches your rule");
});
