import { expect, it } from "vitest";
import { crewDetail, crewFinished, crewRef, statuses, whatItDoes } from "./crew-voice";
import { isDestructive, parseActions } from "./buddy";

const runs = {
  r1: { id: "r1", title: "Add dark mode", status: "running", member: "m1", labels: [] },
  r2: { id: "r2", title: "Fix login bug", status: "reviewing", member: "m2", labels: [] },
  r3: { id: "r3", title: "Spark · hi", status: "running", labels: ["buddy"] },
};
const approvals = { ap9: { id: "ap9", run: "r1", tool: "Bash", input: { command: "npm test -- --run" }, risk: "medium" } };
const names = { m1: "Eli", m2: "Rhea" };

it("tells Spark what's waiting, working and ready — with refs it can act on, never Spark's own turns", () => {
  const text = crewDetail(runs, approvals, names);
  expect(text).toContain("WAITING ON YOU: A1 — Eli wants Bash: npm test -- --run in “Add dark mode” (risk medium)");
  expect(text).toContain("WORKING: S1 “Add dark mode” (Eli, running)");
  expect(text).toContain("READY FOR REVIEW: S2 “Fix login bug” (Rhea, ready for review)");
  expect(text).not.toContain("Spark · hi");
  expect(crewRef("a1")).toBe("ap9"); expect(crewRef("S2")).toBe("r2"); expect(crewRef("r_real")).toBe("r_real");
  expect(crewDetail({}, {})).toBe("");
});

it("summarises a tool call in a few words", () => {
  expect(whatItDoes("Edit", { file_path: "src/app.ts" })).toBe("Edit: src/app.ts");
  expect(whatItDoes("mcp__github__create_pr", { title: "x" })).toMatch(/^create_pr: /);
});

it("announces crew work the moment it finishes, once, and only real crew work", () => {
  const before = statuses(runs);
  const after = { ...runs, r1: { ...runs.r1, status: "reviewing" }, r3: { ...runs.r3, status: "done" } };
  expect(crewFinished(before, after, names)).toEqual([{ ok: true, line: "Eli finished “Add dark mode”. It's ready for your review." }]);
  expect(crewFinished(statuses(after), after, names)).toEqual([]); // already said
  const failed = { ...runs, r1: { ...runs.r1, status: "failed", reason: "tests failed" } };
  expect(crewFinished(before, failed, names)[0]).toEqual({ ok: false, line: "“Add dark mode” hit a problem: tests failed." });
  expect(crewFinished({}, after, names)).toEqual([]); // new runs appearing finished aren't news
});

it("parses the voice actions, and stopping a session needs a yes", () => {
  const acts = parseActions('```do [{"type":"crew_decide","ref":"A1","allow":true},{"type":"crew_stop","ref":"S1"},{"type":"crew_open","ref":"S2"},{"type":"crew_decide","ref":"A1"}]```');
  expect(acts).toEqual([{ type: "crew_decide", ref: "A1", allow: true }, { type: "crew_stop", ref: "S1" }, { type: "crew_open", ref: "S2" }]);
  expect(isDestructive(acts[1]!)).toBe(true); expect(isDestructive(acts[0]!)).toBe(false);
});
