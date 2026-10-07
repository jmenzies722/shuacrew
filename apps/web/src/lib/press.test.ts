import { describe, expect, it } from "vitest";
import { pressDepth } from "./press";

describe("pressDepth", () => {
  it("gives small controls a clear dip and big surfaces only a touch", () => {
    expect(pressDepth(30, 30)).toBe(0.92);
    expect(pressDepth(44, 44)).toBeCloseTo(0.92, 2);
    expect(pressDepth(140, 40)).toBeCloseTo(0.95, 2);
    expect(pressDepth(600, 60)).toBe(0.985);
  });
  it("never inverts or collapses on a zero-size box", () => {
    expect(pressDepth(0, 0)).toBe(0.92);
  });
});
