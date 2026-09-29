import { expect, it } from "vitest";
import { parseObservabilityPreferences, readObservabilityPreferences, saveObservabilityPreferences } from "./observability-preferences";
it("validates saved periods and cadence without trusting arbitrary storage", () => {
  expect(parseObservabilityPreferences({ refreshSeconds: -1, days: 999 })).toEqual({ refreshSeconds: 15, days: 7 });
  expect(parseObservabilityPreferences({ refreshSeconds: 0, days: 30 })).toEqual({ refreshSeconds: 0, days: 30 });
  let value = ""; const storage = { getItem: () => value, setItem: (_: string, v: string) => { value = v; } };
  expect(saveObservabilityPreferences({ refreshSeconds: 5, days: 0 }, storage)).toBe(true);
  expect(readObservabilityPreferences(storage)).toEqual({ refreshSeconds: 5, days: 0 });
});
it("survives unavailable storage", () => {
  const storage = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  expect(readObservabilityPreferences(storage)).toEqual({ refreshSeconds: 15, days: 7 });
  expect(saveObservabilityPreferences({ refreshSeconds: 15, days: 7 }, storage)).toBe(false);
});
