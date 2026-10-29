import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ISLAND_OPEN, ISLAND_TUCK, SPRING, SPRING_TUCK, springCurve, springStep } from "./spring-easing";

const css = readFileSync(new URL("../design-tokens.css", import.meta.url), "utf8");
const token = (name: string) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();

describe("design tokens move like the notch", () => {
  it("--spring is the island's open spring, --ease-out its tuck", () => {
    expect(token("--spring")).toBe(springCurve(ISLAND_OPEN.duration, ISLAND_OPEN.bounce).easing);
    expect(token("--ease-out")).toBe(springCurve(ISLAND_TUCK.duration, ISLAND_TUCK.bounce).easing);
  });
  it("--t-spring is how long the open spring takes to rest", () => {
    expect(token("--t-spring")).toBe(`${springCurve(ISLAND_OPEN.duration, ISLAND_OPEN.bounce).ms}ms`);
  });
  it("the page's motion springs are the same physics (mass 1, SwiftUI's duration/bounce mapping)", () => {
    // A unit spring released from 0 with these constants, stepped numerically, lands where springStep says.
    for (const [physics, curve] of [[SPRING, ISLAND_OPEN], [SPRING_TUCK, ISLAND_TUCK]] as const) {
      let x = 0, v = 0;
      const dt = 1 / 4000;
      for (let t = 0; t < 0.15; t += dt) { v += (-physics.stiffness * (x - 1) - physics.damping * v) * dt; x += v * dt; }
      expect(x).toBeCloseTo(springStep(0.15, curve.duration, curve.bounce), 2);
    }
  });
});
