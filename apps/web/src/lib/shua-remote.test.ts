import { expect, it } from "vitest";
import { fromPhone } from "./shua-remote";

it("tells Shua the ask came from the iPhone", () => {
  expect(fromPhone("play some jazz")).toBe("From my iPhone: play some jazz");
});
