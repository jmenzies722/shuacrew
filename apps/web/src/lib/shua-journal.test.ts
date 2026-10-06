import { expect, it } from "vitest";
import { howFound } from "./shua-journal";

it("names how each step found its target", () => {
  expect(howFound({ type: "click", x: .5, y: .5, label: "Reply", target: "#2" })).toBe("target");
  expect(howFound({ type: "press", label: "Send" })).toBe("name");
  expect(howFound({ type: "type", text: "hi", label: "Search" })).toBe("name");
  expect(howFound({ type: "click", x: .2, y: .3, label: "" })).toBe("position");
  expect(howFound({ type: "key", keys: "cmd+l", label: "" })).toBe("none");
});
