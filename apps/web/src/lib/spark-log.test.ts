import { beforeEach, expect, it } from "vitest";

beforeEach(() => { const store = new Map<string, string>(); (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage; });

it("records what Spark saw and heard alongside what it did, and forgets it all on request", async () => {
  const { logAction, logSense, clearSparkLog, summary } = await import("./spark-log");
  logAction({ label: "Open Studio", ok: true, message: "" });
  logSense("saw", "Looked at your screen", "Safari · Docs");
  logSense("heard", "Heard you", "x".repeat(400));
  const saved = JSON.parse(localStorage.getItem("shuacrew.spark.log") ?? "[]") as Array<{ kind?: string; message: string }>;
  expect(saved.map((e) => e.kind ?? "did")).toEqual(["did", "saw", "heard"]);
  expect(saved[2]!.message).toHaveLength(280); // a transcript is trimmed, never kept whole
  expect(summary(saved as never).total).toBe(3);
  clearSparkLog();
  expect(localStorage.getItem("shuacrew.spark.log")).toBeNull();
});
