import { expect, it } from "vitest";
import { lingerNext } from "./linger";

it("opens at once, rides out short gaps, and closes only after a real pause", () => {
  let s = { on: false, offAt: null as number | null };
  s = lingerNext(s, true, 0, 900); expect(s.on).toBe(true);
  s = lingerNext(s, false, 100, 900); expect(s.on).toBe(true);           // a gap between sentences…
  s = lingerNext(s, true, 400, 900); expect(s).toEqual({ on: true, offAt: null }); // …bridged, timer reset
  s = lingerNext(s, false, 500, 900); s = lingerNext(s, false, 1300, 900); expect(s.on).toBe(true);
  s = lingerNext(s, false, 1400, 900); expect(s.on).toBe(false);         // 900 ms of quiet: now it tucks away
  expect(lingerNext({ on: false, offAt: null }, false, 2000, 900)).toEqual({ on: false, offAt: null });
});
