import { expect, it } from "vitest";
import { uncited } from "./runs.js";

it("drops web-search citation markers from a recorded reply, and leaves everything else", () => {
  expect(uncited("Philadelphia won by 23. citeturn1reddit16")).toBe("Philadelphia won by 23.");
  expect(uncited("A citeturn0search1 and B citeturn0news2.")).toBe("A and B.");
  expect(uncited("plain <text> stays")).toBe("plain <text> stays");
});
