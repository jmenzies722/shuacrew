import { afterEach, expect, it, vi } from "vitest";
import { analyticsPolling } from "./observability-polling";
afterEach(() => vi.useRealTimers());
it("coalesces live invalidations and refreshes again if an event arrives during a request", async () => {
  vi.useFakeTimers(); let resolve!: (value: number) => void;
  const report = vi.fn().mockImplementationOnce(() => new Promise<number>(r => { resolve = r; })).mockResolvedValue(2);
  const poller = analyticsPolling(report, async () => [], () => {}, 15);
  const pending = poller.start(); poller.invalidate(); poller.invalidate();
  await vi.advanceTimersByTimeAsync(1000); expect(report).toHaveBeenCalledTimes(1);
  resolve(1); await pending;
  await vi.advanceTimersByTimeAsync(1000); expect(report).toHaveBeenCalledTimes(2);
  poller.stop(); await vi.advanceTimersByTimeAsync(15000); expect(report).toHaveBeenCalledTimes(2);
});
it("bounds event-triggered reads to one per second during streaming", async () => {
  vi.useFakeTimers(); const report = vi.fn().mockResolvedValue(1);
  const poller = analyticsPolling(report, async () => [], () => {}, 15);
  await poller.start();
  for (let i = 0; i < 9; i++) { poller.invalidate(); await vi.advanceTimersByTimeAsync(100); }
  expect(report).toHaveBeenCalledTimes(1); poller.stop();
});
it("does not turn manual-only mode into an automatic event stream", async () => {
  vi.useFakeTimers(); const report = vi.fn().mockResolvedValue(1);
  const poller = analyticsPolling(report, async () => [], () => {}, 0);
  await poller.start(); poller.invalidate(); await vi.advanceTimersByTimeAsync(1000);
  expect(report).toHaveBeenCalledTimes(1); poller.stop();
});
it("refreshes provider health on the same cadence as metrics", async () => {
  vi.useFakeTimers(); const metrics = vi.fn().mockResolvedValue({ head: 1 });
  const providers = vi.fn().mockResolvedValueOnce(["connected"]).mockResolvedValue(["limited"]);
  const states: any[] = [], poller = analyticsPolling(metrics, providers, s => states.push(s), 5);
  await poller.start(); expect(states.at(-1).providers).toEqual(["connected"]);
  await vi.advanceTimersByTimeAsync(5000); expect(states.at(-1).providers).toEqual(["limited"]);
  expect(metrics).toHaveBeenCalledTimes(2); poller.stop();
});
it("keeps the last snapshot and provider evidence after manual refresh fails", async () => {
  const metrics = vi.fn().mockResolvedValueOnce({ head: 42 }).mockRejectedValue(new Error("offline"));
  const providers = vi.fn().mockResolvedValueOnce(["connected"]).mockRejectedValue(new Error("status unavailable"));
  const states: any[] = [], poller = analyticsPolling(metrics, providers, s => states.push(s), 0);
  await poller.start(); await poller.refresh();
  expect(states.at(-1)).toMatchObject({ report: { head: 42 }, providers: ["connected"], error: "offline", providerError: "status unavailable", loading: false });
  poller.stop();
});
it("does not publish late responses after filters switch away", async () => {
  let resolve!: (value: object) => void; const changed = vi.fn();
  const poller = analyticsPolling(() => new Promise(r => { resolve = r; }), async () => [], changed, 0);
  const pending = poller.start(); poller.stop(); resolve({ head: 99 }); await pending;
  expect(changed).toHaveBeenCalledTimes(1);
});
