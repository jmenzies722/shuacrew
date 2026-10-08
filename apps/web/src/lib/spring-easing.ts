/**
 * One spring, two engines. The notch's black island is drawn by the Mac app (Core Animation's
 * CASpringAnimation(perceptualDuration:bounce:)); what's inside it is clipped by the page. Both follow the same curve,
 * so the content and the shape move as one: this turns the same (duration, bounce) into a CSS `linear()` easing and
 * the time it takes to settle.
 *
 * SwiftUI/Core Animation's mapping: mass 1, stiffness (2π / duration)², damping ratio 1 − bounce.
 */
export interface SpringCurve { easing: string; ms: number }

export function springStep(t: number, duration: number, bounce: number): number {
  const w = (2 * Math.PI) / duration, zeta = 1 - bounce;
  if (zeta >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
}

/** When the spring is within `epsilon` of rest for good (its envelope, not a lucky zero crossing). */
export function springSettle(duration: number, bounce: number, epsilon = 0.001): number {
  const w = (2 * Math.PI) / duration, zeta = 1 - bounce;
  for (let t = 0; t < 5; t += 0.002) {
    const envelope = zeta >= 1 ? Math.exp(-w * t) * (1 + w * t) : Math.exp(-zeta * w * t) / Math.sqrt(1 - zeta * zeta);
    if (envelope < epsilon) return t;
  }
  return 5;
}

export function springCurve(duration: number, bounce: number, points = 48): SpringCurve {
  const settle = springSettle(duration, bounce);
  const stops: string[] = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * settle;
    const v = i === points ? 1 : springStep(t, duration, bounce);
    stops.push(`${+v.toFixed(4)}`);
  }
  return { easing: `linear(${stops.join(", ")})`, ms: Math.round(settle * 1000) };
}

/** The notch's two motions. The Mac app uses the same numbers (Buddy.swift, NotchIsland.openSpring / tuckSpring). */
export const ISLAND_OPEN = { duration: 0.42, bounce: 0.16 } as const;
export const ISLAND_TUCK = { duration: 0.34, bounce: 0 } as const;
