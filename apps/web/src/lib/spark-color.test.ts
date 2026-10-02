import { expect, it } from "vitest";
import { accentOf, cursorGradient, luminance, stops, validFinish } from "./spark-color";
it("understands solids, gradients and black", () => {
  expect(validFinish("#111114")).toBe(true);
  expect(validFinish("grad:#a78bfa:#60a5fa")).toBe(true);
  expect(validFinish("grad:red:blue")).toBe(false);
  expect(validFinish("url(x)")).toBe(false);
  expect(stops("grad:#a78bfa:#60a5fa")).toEqual({ from: "#a78bfa", to: "#60a5fa", gradient: true });
  expect(accentOf("#111114")).toBe("#d4d4d8");            // black never becomes a black button
  expect(accentOf("grad:#18181b:#7c3aed")).toBe("#7c3aed"); // a gradient's bright end
  expect(accentOf("#60a5fa")).toBe("#60a5fa");
});

it("keeps a gradient finish's own two ends", () => {
  expect(cursorGradient("grad:#a78bfa:#60a5fa")).toEqual(["#a78bfa", "#60a5fa"]);
});
it("runs a solid colour into ShuaCrew's pink blend, like the logo", () => {
  const [a, b] = cursorGradient("#60a5fa");
  expect(a).not.toBe(b);
  expect(luminance(a)).toBeGreaterThan(luminance("#60a5fa")); // the lit end
});
it("never draws an invisible cursor: white goes pearl, black and dark gradients go silver", () => {
  expect(cursorGradient("#e5e7eb")).toEqual(["#ffffff", "#b4bccc"]);
  expect(cursorGradient("#111114")).toEqual(["#f4f4f5", "#71717a"]);
  expect(cursorGradient("grad:#050506:#18181b")).toEqual(["#f4f4f5", "#71717a"]);
  expect(luminance(cursorGradient("grad:#18181b:#7c3aed")[0])).toBeGreaterThan(0.03); // Nebula's black end is lifted
});
