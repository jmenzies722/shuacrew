import { expect, it, vi } from "vitest";
import { crewDetail, crewFinished, crewRef, crewStatus, statuses, whatItDoes } from "./crew-voice";
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
  expect(crewRef("a1")).toBe("ap9"); expect(crewRef("S2")).toBe("r2"); expect(crewRef("r_real")).toBe("");
  expect(crewDetail({}, {})).toBe("");
});

it("summarises a tool call in a few words", () => {
  expect(whatItDoes("Edit", { file_path: "src/app.ts" })).toBe("Edit: src/app.ts");
  expect(whatItDoes("mcp__github__create_pr", { title: "x" })).toMatch(/^create_pr: /);
});

it("announces crew work the moment it finishes, once, and only real crew work", () => {
  const before = statuses(runs);
  const after = { ...runs, r1: { ...runs.r1, status: "reviewing" }, r3: { ...runs.r3, status: "done" } };
  expect(crewFinished(before, after, names)).toEqual([{ ok: true, line: "Eli finished “Add dark mode”. It's ready for your review — want me to merge it?", questionId: "r1" }]);
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

import { crewAsks, noteAsked } from "./crew-voice";
it("sees recent work and playbooks too, so 'delete the failed one' has something to point at", () => {
  const all = { ...runs, r4: { id: "r4", title: "Old spike", status: "failed", reason: "tests failed", updatedAt: 5, labels: [] }, r5: { id: "r5", title: "Gone", status: "done", archived: true, labels: [] } };
  const text = crewDetail(all, {}, names, { p1: { id: "p1", title: "Validate: dog app", name: "validate-idea", status: "waiting" } });
  expect(text).toContain("RECENT: S3 “Old spike” (the crew, failed: tests failed)");
  expect(text).not.toContain("Gone"); // archived sessions are gone for Spark too
  expect(text).toContain("PLAYBOOKS: “Validate: dog app” (waiting on you)");
  expect(crewRef("S3")).toBe("r4");
});

it("asks out loud when the crew needs an OK, and a bare yes then knows what it answers", () => {
  expect(crewAsks(new Set(), approvals, runs, names)).toEqual({ id: "ap9", line: "Eli wants to run npm test -- --run in “Add dark mode”. Approve it?" });
  expect(crewAsks(new Set(["ap9"]), approvals, runs, names)).toBeNull(); // only new requests
  noteAsked("Eli wants to run npm test. Approve it?", "ap9");
  expect(crewDetail(runs, approvals, names)).toContain('YOU JUST ASKED THEM, OUT LOUD: “Eli wants to run npm test. Approve it?” — a bare "yes"/"go ahead" or "no" answers that (A1).');
});

it("full control by voice: message, delete, review and PR — the irreversible ones ask first", () => {
  const acts = parseActions('```do [{"type":"crew_message","ref":"S1","text":"Add tests."},{"type":"crew_delete","ref":"S3"},{"type":"crew_review","ref":"S2","approve":true},{"type":"crew_review","ref":"S2","approve":false,"lesson":"Keep the old API."},{"type":"crew_pr","ref":"S2"}]```');
  expect(acts.map((a) => a.type)).toEqual(["crew_message", "crew_delete", "crew_review", "crew_review", "crew_pr"]);
  expect(acts.map((a) => isDestructive(a))).toEqual([false, true, true, false, true]); // rejecting doesn't need a yes
});


it("keeps a spoken session reference attached to the same work when statuses reorder", () => {
  const text = crewDetail(runs, approvals, names);
  const ref = text.match(/WORKING: (S\d+)/)![1]!;
  crewDetail({ ...runs, r1: { ...runs.r1, status: "reviewing" }, r2: { ...runs.r2, status: "running" } }, approvals, names);
  expect(crewRef(ref)).toBe("r1");
  crewDetail({}, {});
  expect(crewRef(ref)).toBe("");
  expect(crewStatus("r1")).toBe("");
});

it("asks about only one review at a time and returns its exact session id", () => {
  const updates = crewFinished({ r1: "running", r2: "running" }, { ...runs, r1: { ...runs.r1, status: "reviewing" } }, names);
  expect(updates.filter(n => n.line.includes("merge it?"))).toHaveLength(1);
  expect(updates.find(n => n.line.includes("merge it?"))).toMatchObject({ questionId: "r1" });
});

it("forgets a spoken review offer once that session is no longer awaiting review", () => {
  noteAsked("Want me to merge it?", "r2");
  expect(crewDetail(runs, {}, names)).toContain("YOU JUST ASKED");
  expect(crewDetail({ ...runs, r2: { ...runs.r2, status: "merged" } }, {}, names)).not.toContain("YOU JUST ASKED");
});

it("expires spoken offers after ninety seconds", () => {
  vi.useFakeTimers();
  try {
    noteAsked("Approve it?", "ap9");
    vi.advanceTimersByTime(90_001);
    expect(crewDetail(runs, approvals, names)).not.toContain("YOU JUST ASKED");
  } finally { vi.useRealTimers(); }
});
