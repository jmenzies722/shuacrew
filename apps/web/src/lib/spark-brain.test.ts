import { expect, it } from "vitest";
import { sparkBrain } from "./spark-brain";
const now = 1_000_000, later = { until: now + 60_000 }, past = { until: now - 1 };
it("uses Claude normally and switches to this Mac only when Spark's Claude model is out", () => {
  expect(sparkBrain("auto", {}, "claude-haiku-4-5", now)).toBe("claude");
  expect(sparkBrain("auto", { "claude · claude-haiku-4-5": later }, "claude-haiku-4-5", now)).toBe("local");
  expect(sparkBrain("auto", { claude: later }, "claude-sonnet-5", now)).toBe("local");
  expect(sparkBrain("auto", { "codex · gpt-6-astra": later }, "claude-haiku-4-5", now)).toBe("claude"); // Codex being out doesn't matter
  expect(sparkBrain("auto", { "claude · claude-opus-5-5": later }, "claude-haiku-4-5", now)).toBe("claude"); // a different Claude model
  expect(sparkBrain("auto", { "claude · claude-haiku-4-5": past }, "claude-haiku-4-5", now)).toBe("claude"); // the limit already lifted
  expect(sparkBrain("local", {}, "claude-haiku-4-5", now)).toBe("local");
});
