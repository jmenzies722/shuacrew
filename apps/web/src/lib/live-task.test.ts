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
  expect((await pending).status).toBe("failed"); expect(vi.getTimerCount()).toBe(0);
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

it("continues while real progress arrives beyond two minutes", async () => {
  vi.useFakeTimers(); const queue = new LiveTaskQueue("call"); let progress!: () => void, finish!: (result: LiveTaskResult) => void;
  const pending = queue.run("one", "complex task", request => { progress = request.progress!; return new Promise(resolve => { finish = resolve; }); });
  await vi.advanceTimersByTimeAsync(90_000); progress();
  await vi.advanceTimersByTimeAsync(90_000); progress();
  expect(queue.size).toBe(1);
  finish(completed); expect(await pending).toEqual(completed);
  expect(vi.getTimerCount()).toBe(0);
});

it("reports a stalled task instead of calling a timeout user cancellation", async () => {
  vi.useFakeTimers(); const queue = new LiveTaskQueue("call");
  const pending = queue.run("one", "stuck task", () => new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(120_000);
  expect(await pending).toMatchObject({status:"failed",summary:expect.stringContaining("No progress")});
});

it("keeps an absolute limit even when progress keeps arriving", async () => {
  vi.useFakeTimers(); const queue = new LiveTaskQueue("call"); let progress!: () => void;
  const pending = queue.run("one", "task", request => { progress = request.progress!; return new Promise(() => {}); });
  await vi.advanceTimersByTimeAsync(0);
  for(let i=0;i<20;i++){await vi.advanceTimersByTimeAsync(60_000);progress();}
  expect(await pending).toMatchObject({status:"failed",summary:expect.stringContaining("20-minute")});
  expect(vi.getTimerCount()).toBe(0);
});

it("does not restart timers after completion from a late progress callback", async () => {
  vi.useFakeTimers();let progress!:()=>void;
  await new LiveTaskQueue("call").run("task","request",async request=>{progress=request.progress!;return completed;});
  progress();expect(vi.getTimerCount()).toBe(0);
});
