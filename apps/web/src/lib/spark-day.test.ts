import { beforeEach, expect, it } from "vitest";
beforeEach(() => { const m = new Map<string, string>(); (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage; });
it("remembers today's asks (without hidden context), newest last, no repeats", async () => {
  const { rememberAsk, earlierToday } = await import("./spark-day");
  expect(earlierToday()).toBe("");
  rememberAsk("What does ECONNREFUSED mean?\n\n[screen] big hidden context");
  rememberAsk("put on lofi jazz"); rememberAsk("What does ECONNREFUSED mean?");
  const text = earlierToday();
  expect(text).toMatch(/EARLIER TODAY/); expect(text).not.toMatch(/hidden context/);
  expect(text.indexOf("lofi jazz")).toBeLessThan(text.indexOf("ECONNREFUSED"));
  expect(text.match(/ECONNREFUSED/g)).toHaveLength(1);
});
