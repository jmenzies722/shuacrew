import { describe, expect, it } from "vitest";
import { DEFAULT_WIDGETS, daysUntil, moveWidget, parseWidgets, placed, streak, WIDGETS } from "./widgets";

describe("widgets", () => {
  it("repairs anything stored", () => {
    expect(parseWidgets(null)).toEqual(DEFAULT_WIDGETS);
    const p = parseWidgets({ order: ["note", "bogus", "note"], topbar: ["clock", 3], zones: ["Europe/London", "Mars/Base", 1], countdown: { label: " Launch ", date: "2026-12-01" } });
    expect(p.order[0]).toBe("note");
    expect(p.order).toHaveLength(WIDGETS.length); // unknown dropped, the rest appended
    expect(p.topbar).toEqual(["playing", "clock"]);
    expect(parseWidgets({ version: 2, order: ["playing", "crew"], spark: ["playing", "crew"] }).spark).toEqual(["playing", "crew", "mix", "setlist"]);
    expect(p.zones).toEqual(["Europe/London"]);
    expect(p.countdown).toEqual({ label: "Launch", date: "2026-12-01" });
    expect(parseWidgets({ countdown: { label: "x", date: "soon" } }).countdown).toBeNull();
  });
  it("places in your order and moves", () => {
    const p = parseWidgets({ order: ["focus", "weather", ...WIDGETS], topbar: ["weather", "focus"] });
    expect(placed(p, "topbar")).toEqual(["focus", "weather"]);
    expect(moveWidget(["a", "b", "c"] as never, "c" as never, -1)).toEqual(["a", "c", "b"]);
    expect(moveWidget(["a", "b"] as never, "a" as never, -1)).toEqual(["a", "b"]);
  });
  it("counts days and streaks", () => {
    const now = new Date(2026, 8, 25, 15);
    expect(daysUntil("2026-09-25", now)).toBe(0);
    expect(daysUntil("2026-10-01", now)).toBe(6);
    expect(daysUntil("2026-09-20", now)).toBe(-5);
    expect(streak([{ day: "2026-09-23", reviews: 2 }, { day: "2026-09-24", reviews: 1 }, { day: "2026-09-25", reviews: 0 }])).toBe(2);
    expect(streak([{ day: "2026-09-22", reviews: 2 }, { day: "2026-09-23", reviews: 0 }, { day: "2026-09-24", reviews: 3 }, { day: "2026-09-25", reviews: 1 }])).toBe(2);
  });
});
