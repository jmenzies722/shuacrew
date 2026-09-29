import { beforeEach, describe, expect, it } from "vitest";
import { due, formatLeft, parseDuration, getTimers, leftLine, ringLine, setTimers, spokenLength, timerOp } from "./timers";

const now = new Date(2026, 8, 29, 17, 0, 0).getTime();
beforeEach(() => setTimers([]));

describe("timers like Siri's", () => {
  it("sets any length, named or not, several at once", () => {
    expect(timerOp({ op: "start", seconds: 420 }, now).message).toBe("Timer set for 7 minutes");
    expect(timerOp({ op: "start", seconds: 540, label: "pasta" }, now).message).toBe("Pasta timer set for 9 minutes");
    expect(getTimers()).toHaveLength(2);
    expect(timerOp({ op: "start", seconds: 0 }, now).ok).toBe(false);
  });
  it("says what's left, soonest first, and rings each one once", () => {
    timerOp({ op: "start", seconds: 540, label: "pasta" }, now); timerOp({ op: "start", seconds: 90 }, now);
    expect(leftLine(getTimers(), now + 30_000)).toBe("1 minute left. pasta: 8 minutes and 30 seconds left.");
    const { rang, left } = due(getTimers(), now + 91_000);
    expect(rang.map(ringLine)).toEqual(["Your 1 minute and 30 seconds timer is done."]);
    expect(left.map((t) => t.label)).toEqual(["pasta"]);
  });
  it("pauses, resumes and cancels by name", () => {
    timerOp({ op: "start", seconds: 600, label: "laundry" }, now);
    timerOp({ op: "pause", label: "laundry" }, now + 60_000);
    expect(due(getTimers(), now + 3_600_000).rang).toEqual([]); // paused: never rings
    timerOp({ op: "resume" }, now + 120_000);
    expect(getTimers()[0]!.endsAt).toBe(now + 120_000 + 540_000);
    expect(timerOp({ op: "cancel", label: "the laundry timer" }, now).message).toBe("Cancelled the laundry timer");
    expect(timerOp({ op: "cancel" }, now).ok).toBe(false);
  });
  it("sets an alarm for a clock time, tomorrow if it's passed", () => {
    expect(timerOp({ op: "alarm", at: "18:30", label: "gym" }, now).message).toMatch(/^Alarm set for 6:30\sPM$/);
    expect(timerOp({ op: "alarm", at: "07:00" }, now).message).toMatch(/^Alarm set for 7:00\sAM tomorrow$/);
    expect(ringLine(getTimers()[0]!)).toBe("It's time: gym.");
  });
  it("formats time for the notch and for speech", () => {
    expect(formatLeft(65_000)).toBe("1:05");
    expect(formatLeft(3_725_000)).toBe("1:02:05");
    expect(spokenLength(5_400_000)).toBe("1 hour and 30 minutes");
  });
});

describe("lengths the way you say them", () => {
  it("reads spoken durations", () => {
    expect(parseDuration("7 minutes")).toBe(420);
    expect(parseDuration("an hour and a half")).toBe(5400);
    expect(parseDuration("1 hour 30 min")).toBe(5400);
    expect(parseDuration("90 seconds")).toBe(90);
    expect(parseDuration("half an hour")).toBe(1800);
    expect(parseDuration("two and a half minutes")).toBe(150);
    expect(parseDuration("pasta")).toBeNull();
  });
});
