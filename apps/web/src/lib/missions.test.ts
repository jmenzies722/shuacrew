import { describe, expect, it } from "vitest";
import { MAX_ROUNDS, asksToContinue, missionBrief, missionTask, nextMove, summary } from "./missions";

describe("missionTask", () => {
  it("takes the task after an agent trigger, with or without Spark's name", () => {
    expect(missionTask("agent: build a landing page for Leash")).toBe("build a landing page for Leash");
    expect(missionTask("Spark agent research three competitors")).toBe("research three competitors");
    expect(missionTask("hey spark, agent — clean up my downloads folder")).toBe("clean up my downloads folder");
    expect(missionTask("Nova agent write the release notes", "Nova")).toBe("write the release notes");
  });
  it("leaves ordinary questions alone", () => {
    expect(missionTask("what does an agent do?")).toBeNull();
    expect(missionTask("agent")).toBeNull();
    expect(missionTask("tell the agent hi")).toBeNull();
  });
});

describe("nextMove", () => {
  const base = { rounds: 0, title: "Landing page", lastText: "" };
  it("waits while the crew works", () => {
    for (const status of ["queued", "planning", "running", "reviewing", "paused"]) expect(nextMove({ ...base, status }).kind).toBe("wait");
  });
  it("never answers an approval for you", () => {
    expect(nextMove({ ...base, status: "awaiting_approval" }).kind).toBe("needs-you");
  });
  it("tells the crew to keep going when it stops to ask", () => {
    const m = nextMove({ ...base, status: "done", lastText: "I set up the page. Would you like me to add a pricing section?" });
    expect(m.kind).toBe("continue");
  });
  it("tells the crew to fix a failure and keep going, a bounded number of times", () => {
    expect(nextMove({ ...base, status: "failed" }).kind).toBe("continue");
    const out = nextMove({ ...base, status: "failed", rounds: MAX_ROUNDS });
    expect(out).toMatchObject({ kind: "report", ok: false });
  });
  it("reports a finished mission with a short summary", () => {
    const m = nextMove({ ...base, status: "done", lastText: "Built the page and deployed it. Verified the form submits. Extra detail here." });
    expect(m).toMatchObject({ kind: "report", ok: true });
    expect(m.kind === "report" && m.say).toContain("Built the page and deployed it.");
  });
  it("stops pushing after the last round even if the agent still asks", () => {
    expect(nextMove({ ...base, status: "done", rounds: MAX_ROUNDS, lastText: "Should I continue?" }).kind).toBe("report");
  });
});

describe("helpers", () => {
  it("spots a turn that ends with a question", () => {
    expect(asksToContinue("Done. Want me to also add tests?")).toBe(true);
    expect(asksToContinue("All done. Tests pass.")).toBe(false);
  });
  it("keeps summaries speakable", () => {
    expect(summary("```js\ncode\n```\n## Result\nIt works. Second. Third.")).toBe("Result It works. Second.");
    expect(summary("x".repeat(400)).length).toBeLessThanOrEqual(220);
  });
  it("briefs the crew to finish end to end", () => {
    expect(missionBrief("do it")).toMatch(/end to end/);
  });
});
