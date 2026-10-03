import { expect, it } from "vitest";
import { sessionTitle } from "./projections.js";

const ask = "Find my Sable terminal application project. Audit its architecture, UX, performance and reliability.";
it("ends a sliced title at a whole word with an ellipsis", () => {
  expect(sessionTitle(ask.slice(0, 80), ask)).toBe("Find my Sable terminal application project. Audit its architecture, UX…");
  expect(sessionTitle("Find my Sable terminal ", ask)).toBe("Find my Sable terminal…");
});
it("leaves real titles, full asks and already-shortened titles alone", () => {
  expect(sessionTitle("Sable audit", ask)).toBe("Sable audit");
  expect(sessionTitle(ask, ask)).toBe(ask);
  expect(sessionTitle("Find my Sable…", ask)).toBe("Find my Sable…");
  expect(sessionTitle("Spark · what's on my calendar", "what's on my calendar today")).toBe("Spark · what's on my calendar…"); // it was cut
});
it("judges the ask after a launcher's name, even when the prompt has instructions first", () => {
  const prompt = "<spark-system>\nrules\n</spark-system>\nThe user says: write the numbers 1 through 500 in words";
  expect(sessionTitle("Shua · write the numbers 1 thro", prompt)).toBe("Shua · write the numbers 1…");
  expect(sessionTitle("Shua · write the numbers 1 through 500 in words", prompt)).toBe("Shua · write the numbers 1 through 500 in words");
  expect(sessionTitle("Rhea · market scan", "Look at the market")).toBe("Rhea · market scan");
});
