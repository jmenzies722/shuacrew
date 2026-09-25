import { expect, it } from "vitest";
import { accentOf, stops, validFinish } from "./spark-color";
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
