import { afterEach, expect, it, vi } from "vitest";
import { executeLiveTurn, type LiveTurnState } from "./live-turn";

afterEach(() => vi.useRealTimers());
const idle: LiveTurnState = { pending: false, summary: "", outcomes: [] };

it("does not capture when a screen request lacks permission", async () => {
  const dispatch = vi.fn(), abort = new AbortController();
  const result = await executeLiveTurn({ callId: "call", taskId: "task", text: "point", signal: abort.signal }, { screenAllowed: false, needsScreen: true, dispatch, state: () => idle, subscribe: () => () => {}, cancel: vi.fn() });
  expect(result.status).toBe("unavailable"); expect(dispatch).not.toHaveBeenCalled();
});

it("waits for action completion and preserves actual outcomes", async () => {
  vi.useFakeTimers(); let changed = () => {}; let state = { ...idle, pending: true, summary: "Opening" };
  const abort = new AbortController();
  const pending = executeLiveTurn({ callId: "call", taskId: "task", text: "open", signal: abort.signal }, { screenAllowed: true, needsScreen: false, dispatch: async () => {}, state: () => state, subscribe: listener => { changed = listener; return () => {}; }, cancel: vi.fn() });
  let resolved = false; void pending.then(() => { resolved = true; });
  await vi.advanceTimersByTimeAsync(300); expect(resolved).toBe(false);
  state = { pending: false, summary: "Could not open", outcomes: [{ description: "Open", ok: false, message: "Missing app" }] };
  changed(); await Promise.resolve();
  expect(await pending).toMatchObject({ status: "failed", outcomes: state.outcomes });
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels immediately and never accepts a late successful reply", async () => {
  vi.useFakeTimers(); const abort = new AbortController(), cancel = vi.fn();
  const pending = executeLiveTurn({ callId: "call", taskId: "task", text: "teach", signal: abort.signal }, { screenAllowed: false, needsScreen: false, dispatch: () => new Promise(() => {}), state: () => idle, subscribe: () => () => {}, cancel });
  abort.abort();
  expect((await pending).status).toBe("cancelled"); expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});

it("counts changed task evidence as progress, not repeated UI renders", async () => {
  const abort = new AbortController(), progress = vi.fn(); let changed = () => {};
  let state: LiveTurnState = {...idle,pending:true,progress:1};
  const pending = executeLiveTurn({callId:"call",taskId:"task",text:"task",signal:abort.signal,progress}, {screenAllowed:true,needsScreen:false,dispatch:async()=>{},state:()=>state,subscribe:listener=>{changed=listener;return()=>{};},cancel:vi.fn()});
  await Promise.resolve(); changed();changed();
  expect(progress).toHaveBeenCalledTimes(1);
  state={...state,progress:2};changed();expect(progress).toHaveBeenCalledTimes(2);
  abort.abort();await pending;
});
