import { expect, it } from "vitest";
import { parseCalculatorRequest, calculatorSequence } from "./mac-calculator";

it("accepts only bounded multiplication requests, not appended instructions", () => {
  expect(parseCalculatorRequest("Open Calculator and calculate 128 × 47.")).toEqual({ left: "128", right: "47", expected: "6016" });
  expect(parseCalculatorRequest("Open Calculator and calculate 128 × 47 then send it")).toBeNull();
  expect(parseCalculatorRequest("calculate 12345 times 67890")).toBeNull();
});
it("prebinds RPN stack changes and requires an independently observed product", () => {
  const steps = calculatorSequence({ left: "128", right: "47", expected: "6016" });
  expect(steps.map(step => step.label)).toEqual(["Open Calculator", "All Clear", "1", "2", "8", "Enter", "4", "7", "Multiply"]);
  expect(steps[5]?.expected).toEqual(["128", "128"]);
  expect(steps[7]?.expected).toEqual(["128", "47"]);
  expect(steps.at(-1)?.expected).toEqual(["6016"]);
});
