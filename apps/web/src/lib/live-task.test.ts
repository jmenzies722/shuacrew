import { afterEach, expect, it, vi } from "vitest";
import { LiveTaskQueue, type LiveTaskResult } from "./live-task";

afterEach(() => vi.useRealTimers());
const completed: LiveTaskResult = { status: "completed", summary: "Verified result", outcomes: [] };

it("serializes work and reuses duplicate results", async () => {
  const queue = new LiveTaskQueue("call"), order: string[] = [];
  let release!: () => void;
  const first = queue.run("one", "first", async () => { order.push("first"); await new Promise<void>(resolve => { release = resolve; }); return completed; });
  const duplicate = queue.run("one", "first", async () => { throw new Error("duplicated"); });
  const second = queue.run("two", "second", async () => { order.push("second"); return completed; });
  await vi.waitFor(() => expect(order).toEqual(["first"]));
  release();
  expect(await first).toEqual(completed); expect(await duplicate).toEqual(completed); await second;
  expect(order).toEqual(["first", "second"]); expect(queue.size).toBe(0);
});

it("cancels pending work and rejects late completion", async () => {
  const queue = new LiveTaskQueue("call"); let signal!: AbortSignal;
  const pending = queue.run("one", "first", request => { signal = request.signal; return new Promise(() => {}); });
  await vi.waitFor(() => expect(signal).toBeDefined());
  queue.end();
  expect((await pending).status).toBe("cancelled"); expect(signal.aborted).toBe(true);
  const execute = vi.fn(async () => completed);
  expect((await queue.run("two", "second", execute)).status).toBe("cancelled"); expect(execute).not.toHaveBeenCalled();
});

it("times out and never treats empty output as success", async () => {
  vi.useFakeTimers(); const queue = new LiveTaskQueue("call");
  const pending = queue.run("one", "first", () => new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(120_000);
  expect((await pending).status).toBe("cancelled"); expect(vi.getTimerCount()).toBe(0);
  expect((await new LiveTaskQueue("fresh").run("two", "empty", async () => ({ ...completed, summary: "" }))).status).toBe("failed");
});

it("does not overlap a cancelled executor that has not released its hooks", async () => {
  const queue = new LiveTaskQueue("call");
  let started = false;
  const pending = queue.run("one", "first", () => { started = true; return new Promise(() => {}); });
  await vi.waitFor(() => expect(started).toBe(true)); queue.cancelAll(); await pending;
  const next = vi.fn(async () => completed);
  expect((await queue.run("two", "second", next)).status).toBe("unavailable"); expect(next).not.toHaveBeenCalled();
});

it("releases timers through 100 teardown cycles", async () => {
  vi.useFakeTimers();
  for (let cycle = 0; cycle < 100; cycle++) {
    const queue = new LiveTaskQueue(String(cycle));
    const pending = queue.run("task", "request", () => new Promise(() => {}));
    await Promise.resolve(); queue.end(); await pending;
    expect(queue.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  }
});
