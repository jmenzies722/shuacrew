import { describe, expect, it } from "vitest";
import { ISLAND_OPEN, ISLAND_TUCK, springCurve, springSettle, springStep } from "./spring-easing";
import { vividTint } from "./music-meter";

describe("spring easing (page clip and native island share one curve)", () => {
  it("starts at 0 and ends at exactly 1", () => {
    const { easing } = springCurve(ISLAND_OPEN.duration, ISLAND_OPEN.bounce);
    const stops = easing.slice("linear(".length, -1).split(", ").map(Number);
    expect(stops[0]).toBe(0);
    expect(stops.at(-1)).toBe(1);
  });
  it("the open spring overshoots a little; the tuck never does", () => {
    const peak = (d: number, b: number) => Math.max(...Array.from({ length: 400 }, (_, i) => springStep(i / 400, d, b)));
    expect(peak(ISLAND_OPEN.duration, ISLAND_OPEN.bounce)).toBeGreaterThan(1.001);
    expect(peak(ISLAND_OPEN.duration, ISLAND_OPEN.bounce)).toBeLessThan(1.04);
    expect(peak(ISLAND_TUCK.duration, ISLAND_TUCK.bounce)).toBeLessThanOrEqual(1);
  });
  it("is mostly there early, so the island feels instant", () => {
    expect(springStep(0.15, ISLAND_OPEN.duration, ISLAND_OPEN.bounce)).toBeGreaterThan(0.6);
    expect(springStep(0.15, ISLAND_TUCK.duration, ISLAND_TUCK.bounce)).toBeGreaterThan(0.55);
  });
  it("settles within a sane time", () => {
    expect(springSettle(ISLAND_OPEN.duration, ISLAND_OPEN.bounce)).toBeLessThan(0.75);
    expect(springSettle(ISLAND_TUCK.duration, ISLAND_TUCK.bounce)).toBeLessThan(0.6);
  });
});

describe("album tint", () => {
  const pixels = (rgb: [number, number, number], n = 16) => Array.from({ length: n }, () => [...rgb, 255]).flat();
  it("a red cover tints red, bright enough for black", () => {
    expect(vividTint(pixels([200, 30, 30]))).toMatch(/^hsl\(0 \d+% (6[4-9]|7\d|80)%\)$/);
  });
  it("a grey cover stays near white instead of inventing a hue", () => {
    const tint = vividTint(pixels([120, 120, 120]))!;
    expect(Number(tint.match(/hsl\(\d+ (\d+)%/)![1])).toBeLessThan(15);
  });
  it("colourful pixels win over a black background", () => {
    const px = [...pixels([5, 5, 5], 60), ...pixels([40, 90, 230], 4)];
    const hue = Number(vividTint(px)!.match(/hsl\((\d+)/)![1]);
    expect(hue).toBeGreaterThan(200);
    expect(hue).toBeLessThan(240);
  });
});
