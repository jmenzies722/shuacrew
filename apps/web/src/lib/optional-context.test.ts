import { expect, it, vi } from "vitest";
import { optionalContext } from "./optional-context";

it("omits slow optional context rather than delaying submission or inventing status", async () => {
  vi.useFakeTimers();
  try {
    const pending = optionalContext(new Promise<string>(() => {}), 150);
    await vi.advanceTimersByTimeAsync(150);
    expect(await pending).toBe("");
    expect(vi.getTimerCount()).toBe(0);
    expect(await optionalContext(Promise.resolve("Playing a verified song"), 150)).toBe("Playing a verified song");
    expect(vi.getTimerCount()).toBe(0);
    expect(await optionalContext(Promise.reject(new Error("offline")), 150)).toBe("");
  } finally { vi.useRealTimers(); }
});
