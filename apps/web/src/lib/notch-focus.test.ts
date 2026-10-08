import { describe, expect, it } from "vitest";
import { notchFocus, pausedLine, type FocusInputs } from "./notch-focus";

const quiet: FocusInputs = { approvals: 0, working: 0, justFinished: null, hour: 14 };

describe("notchFocus", () => {
  it("puts you blocking the crew first", () => {
    const f = notchFocus({ ...quiet, approvals: 2, working: 1 });
    expect(f).toMatchObject({ tone: "needs", text: "2 things waiting on you", sub: "1 working" });
  });
  it("then work in progress, then what just landed", () => {
    expect(notchFocus({ ...quiet, working: 3 }).text).toBe("3 sessions working");
    const done = notchFocus({ ...quiet, justFinished: { id: "r_1", title: "Plan Failure Arcade" } });
    expect(done.tone).toBe("done");
    expect(done.ask).toContain("Plan Failure Arcade");
  });
  it("otherwise just says hello (Learn is gone: no cards-due nudges)", () => {
    expect(notchFocus(quiet).tone).toBe("calm");
    expect(notchFocus({ ...quiet, hour: 3 }).text).toBe("Working late");
  });
  it("says a paused turn plainly instead of going quiet", () => {
    expect(pausedLine("claude-opus-5-5 usage window — resumes 10:50 PM")).toEqual({ text: "I'll answer at 10:50 PM", sub: "Claude's usage window is full right now" });
    expect(pausedLine(undefined).text).toBe("Paused for now");
  });
});
