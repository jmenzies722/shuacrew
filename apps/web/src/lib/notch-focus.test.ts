import { describe, expect, it } from "vitest";
import { notchFocus, pausedLine, reviewMinutes, shortTrack, type FocusInputs } from "./notch-focus";

const quiet: FocusInputs = { approvals: 0, working: 0, justFinished: null, due: 0, weakest: null, hour: 14 };

describe("notchFocus", () => {
  it("puts you blocking the crew first", () => {
    const f = notchFocus({ ...quiet, approvals: 2, working: 1, due: 12 });
    expect(f).toMatchObject({ tone: "needs", text: "2 things waiting on you", sub: "1 working" });
  });
  it("then work in progress, then what just landed", () => {
    expect(notchFocus({ ...quiet, working: 3, due: 5 }).text).toBe("3 sessions working");
    const done = notchFocus({ ...quiet, justFinished: { id: "r_1", title: "Plan Failure Arcade" }, due: 5 });
    expect(done.tone).toBe("done");
    expect(done.ask).toContain("Plan Failure Arcade");
  });
  it("turns due cards into a quiz on the weakest track", () => {
    const f = notchFocus({ ...quiet, due: 12, weakest: "AWS DOP-C02" });
    expect(f).toMatchObject({ tone: "learn", text: "12 cards due", sub: "AWS DOP-C02 · ~5 min", ask: "Quiz me on AWS DOP-C02" });
    expect(notchFocus({ ...quiet, due: 1 }).text).toBe("1 card due");
  });
  it("keeps learning out of the small hours", () => {
    expect(notchFocus({ ...quiet, due: 12, hour: 23 }).tone).toBe("calm");
    expect(notchFocus({ ...quiet, due: 12, hour: 3 }).text).toBe("Working late");
  });
  it("never says a review takes 0 minutes", () => {
    expect(reviewMinutes(1)).toBe(1);
  });
  it("says long track names short", () => {
    expect(shortTrack("AWS DOP-02 for AI Platform and Enablement Engineers")).toBe("AWS DOP-02");
    expect(shortTrack("AWS DevOps Engineer Professional (DOP-C02): Foundations to AI Platform Operations")).toBe("AWS DevOps Engineer Professional");
    expect(shortTrack("Rust")).toBe("Rust");
  });
  it("says a paused turn plainly instead of going quiet", () => {
    expect(pausedLine("claude-opus-5-5 usage window — resumes 10:50 PM")).toEqual({ text: "I'll answer at 10:50 PM", sub: "Claude's usage window is full right now" });
    expect(pausedLine(undefined).text).toBe("Paused for now");
  });
});
