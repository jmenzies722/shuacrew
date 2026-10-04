import { expect, it } from "vitest";
import { LatencyRecorder } from "./interaction-latency";
it("requires ordered finite timestamps and caps retained interactions", () => {
  const r = new LatencyRecorder();
  r.mark("a", "down", 10); r.mark("a", "paint", 32);
  expect(r.duration("a", "down", "paint")).toBe(22);
  expect(r.duration("a", "paint", "down")).toBeUndefined();
  expect(r.duration("a", "down", "missing")).toBeUndefined();
  r.mark("a", "bad", NaN); expect(r.duration("a", "down", "bad")).toBeUndefined();
  for (let i = 0; i < 256; i++) r.mark(String(i), "down", i);
  expect(r.duration("a", "down", "paint")).toBeUndefined();
  r.mark("255", "paint", 270); expect(r.duration("255", "down", "paint")).toBe(15);
  r.clear("255"); expect(r.duration("255", "down", "paint")).toBeUndefined();
});
