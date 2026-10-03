import { expect, it } from "vitest";
import { groupSessions, sessionStatus } from "./session-list";

const now = new Date(2026, 9, 2, 0, 30).getTime();
const session = (id: string, updatedAt: number) => ({ id, updatedAt, title: id, ask: "", ticker: "", labels: [] });

it("groups by local calendar date and keeps newest first", () => {
  const groups = groupSessions([
    session("older", new Date(2026, 8, 1).getTime()),
    session("yesterday", new Date(2026, 9, 1, 23, 50).getTime()),
    session("today", now),
    session("earlier", new Date(2026, 9, 2, 0, 10).getTime()),
    session("week", new Date(2026, 8, 28).getTime()),
  ], "", now);
  expect(groups.map(group => [group.title, group.runs.map(run => run.id)])).toEqual([
    ["Today", ["today", "earlier"]], ["Yesterday", ["yesterday"]], ["Previous 7 days", ["week"]], ["Older", ["older"]],
  ]);
});

it("searches older sessions and excludes archived, child, Spark and learning work", () => {
  const base = { ...session("old", 0), title: "Fix Search" };
  expect(groupSessions([
    base,
    { ...base, id: "archived", archived: true },
    { ...base, id: "child", parent: "old" },
    { ...base, id: "spark", labels: ["buddy"] },
    { ...base, id: "learning", labels: ["learning"] },
  ], " SEARCH ", now).flatMap(group => group.runs.map(run => run.id))).toEqual(["old"]);
});

it("uses actual lifecycle state instead of stale activity text", () => {
  expect(sessionStatus({ status: "done", pendingApprovals: [], ticker: "Thinking…" })).toEqual({ label: "Completed", tone: "quiet" });
  expect(sessionStatus({ status: "queued", pendingApprovals: [] }).label).toBe("Queued");
  expect(sessionStatus({ status: "paused", pendingApprovals: [] }, "Paused · resumes at 4pm").label).toBe("Paused · resumes at 4pm");
  expect(sessionStatus({ status: "running", pendingApprovals: ["approval"] }).label).toBe("Needs approval");
});
