import { expect, it } from "vitest";
import { sessionTitle } from "./projections";

const ask = "Find my Sable terminal application project. Audit its architecture, UX, performance and reliability.";
it("ends a sliced title at a whole word with an ellipsis", () => {
  expect(sessionTitle(ask.slice(0, 80), ask)).toBe("Find my Sable terminal application project. Audit its architecture, UX…");
  expect(sessionTitle("Find my Sable terminal ", ask)).toBe("Find my Sable terminal…");
});
it("leaves real titles, full asks and already-shortened titles alone", () => {
  expect(sessionTitle("Sable audit", ask)).toBe("Sable audit");
  expect(sessionTitle(ask, ask)).toBe(ask);
  expect(sessionTitle("Find my Sable…", ask)).toBe("Find my Sable…");
  expect(sessionTitle("Spark · what's on my calendar", "what's on my calendar today")).toBe("Spark · what's on my calendar");
});
