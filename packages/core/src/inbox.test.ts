import { expect, it } from "vitest";
import { inbox, inboxCount } from "./inbox.js";
import { emptyState, type CrewState, type RunView } from "./projections.js";

const NOW = 1_800_000_000_000, HOUR = 3_600_000, DAY = 24 * HOUR;
function run(id: string, over: Partial<RunView> = {}): RunView {
  return { id, title: `Session ${id}`, ask: "x", runtime: "claude", labels: [], incognito: false, status: "done", permission: "ask", createdAt: NOW - HOUR, updatedAt: NOW - HOUR,
    priority: 0, turns: 1, ticker: "", tail: "", toolCalls: 0, failedTools: 0, files: [], checks: [], pendingApprovals: [], lessons: [], subagents: [], checkpoints: [], ...over } as RunView;
}
function state(runs: RunView[], more: Partial<CrewState> = {}): CrewState {
  return { ...emptyState(), runs: Object.fromEntries(runs.map((r) => [r.id, r])), ...more };
}
const kinds = (s: CrewState) => inbox(s, NOW).map((i) => `${i.kind}:${i.run ?? ""}`);

it("is empty when nothing is waiting on you", () => {
  expect(inbox(state([run("a"), run("b", { status: "running" }), run("c", { status: "merged", verification: { state: "verified", turn: 1, files: 1, nudged: false } })]), NOW)).toEqual([]);
});

it("lists what blocks most first: approvals, then failures, then unproven work, then your calls, then good news", () => {
  const s = state([
    run("ready", { status: "reviewing", verification: { state: "verified", turn: 1, files: 2, command: "pnpm test", nudged: false }, reviewPass: { state: "passed", runtime: "codex", run: "rv" } }),
    run("unverified", { status: "reviewing", verification: { state: "unverified", turn: 1, files: 1, nudged: true } }),
    run("failing", { status: "reviewing", verification: { state: "failing", turn: 1, files: 1, command: "pnpm typecheck", nudged: true } }),
    run("failed", { status: "failed", statusReason: "codex exited\nstack…" }),
    run("asking", { status: "awaiting_approval" }),
    run("unclear", { status: "done", reviewPass: { state: "unclear", runtime: "codex", run: "rv2" } }),
  ], { approvals: { ap1: { id: "ap1", run: "asking", tool: "Bash", input: {}, risk: "high", reason: "pushes to origin", rule: "git.push", at: NOW - 60_000, seq: 9 } } });
  expect(kinds(s)).toEqual(["approval:asking", "failed:failed", "failing:failing", "unverified:unverified", "review:rv2", "ready:ready"]);
  const items = inbox(s, NOW);
  expect(items[0]).toMatchObject({ title: "Allow Bash?", detail: "Session asking · pushes to origin", tone: "wait" });
  expect(items[1]).toMatchObject({ detail: "codex exited", tone: "bad" }); // the first line of why, not a stack
  expect(items[2]!.detail).toBe("pnpm typecheck fails after its last edit.");
  expect(items.at(-1)).toMatchObject({ kind: "ready", detail: "Verified by pnpm test, review passed. Ready for you to merge.", tone: "ok" });
  expect(inboxCount(items)).toBe(5); // "ready" is good news, not a decision owed
});

it("shows a tied race once, not once per side, and a lost side is not offered for merging", () => {
  const tie = { id: "race_1", rivalRuntime: "codex", outcome: "open" as const, reason: "Both proved their change. Compare the two and keep the one you prefer." };
  const verified = { state: "verified" as const, turn: 1, files: 1, nudged: false };
  const s = state([
    run("a", { title: "Race · Claude · Add a clock", status: "reviewing", verification: verified, race: { ...tie, rival: "b" } }),
    run("b", { title: "Race · Codex · Add a clock", status: "reviewing", verification: verified, race: { ...tie, rival: "a", rivalRuntime: "claude" } }),
    run("won", { status: "reviewing", verification: verified, race: { id: "race_2", rival: "lost", rivalRuntime: "codex", outcome: "won", reason: "…" } }),
    run("lost", { status: "reviewing", verification: verified, race: { id: "race_2", rival: "won", rivalRuntime: "claude", outcome: "lost", reason: "…" } }),
  ]);
  const items = inbox(s, NOW);
  expect(items.filter((i) => i.kind === "race")).toHaveLength(1);
  expect(items.find((i) => i.kind === "race")).toMatchObject({ title: "Race: Add a clock", detail: tie.reason });
  expect(items.filter((i) => i.kind === "ready").map((i) => i.run)).toEqual(["won"]);
});

it("leaves out what isn't yours to act on, and what has gone stale", () => {
  const unverified = { state: "unverified" as const, turn: 1, files: 1, nudged: true };
  expect(inbox(state([
    run("shua", { labels: ["buddy"], status: "failed" }),
    run("reviewer", { labels: ["review"], status: "failed" }),
    run("step", { parent: "task", status: "failed" }),
    run("archived", { status: "failed", ...({ archived: true } as object) }),
    run("old-failure", { status: "failed", updatedAt: NOW - 4 * DAY }),
    run("old-work", { status: "reviewing", verification: unverified, updatedAt: NOW - 8 * DAY }),
  ]), NOW)).toEqual([]);
});

it("includes notes Shua suggested, with what would be added", () => {
  const s = state([], { suggestions: { n1: { id: "n1", file: "projects", text: "- Harbor ships its widget on Friday.", why: "You said so twice today.", run: "r9", at: NOW - HOUR } } });
  expect(inbox(s, NOW)).toEqual([{ id: "note:n1", kind: "note", title: "Add to projects?", detail: "You said so twice today.", run: "r9", at: NOW - HOUR, tone: "idle", note: { id: "n1", file: "projects", text: "- Harbor ships its widget on Friday." } }]);
});
