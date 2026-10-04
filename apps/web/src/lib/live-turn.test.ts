import { expect, it, vi } from "vitest";
import { executeLiveTurn, type LiveTurnState } from "./live-turn";
it("completes from subscription without a polling tick and unsubscribes", async () => {
  let state: LiveTurnState = { pending: true, summary: "", outcomes: [] };
  let changed = () => {}; const off = vi.fn();
  const pending = executeLiveTurn({ callId: "c", taskId: "t", text: "hi", signal: new AbortController().signal }, {
    screenAllowed: false, needsScreen: false, dispatch: async () => {}, state: () => state, cancel: () => {}, subscribe: listener => { changed = listener; return off; },
  });
  await Promise.resolve();
  state = { pending: false, summary: "Answer ready", outcomes: [] }; changed();
  expect(off).toHaveBeenCalledOnce();
  expect((await pending).status).toBe("completed");
  expect(off).toHaveBeenCalledOnce(); changed(); expect(off).toHaveBeenCalledOnce();
});
it("checks updates arriving before dispatch resolves and handles synchronous throws", async () => {
  const state = { pending: false, summary: "Done", outcomes: [] };
  const adapter = { screenAllowed: false, needsScreen: false, state: () => state, cancel: vi.fn(), subscribe: () => () => {} };
  const request = { callId: "c", taskId: "t", text: "hi", signal: new AbortController().signal };
  expect((await executeLiveTurn(request, { ...adapter, dispatch: async () => {} })).status).toBe("completed");
  expect((await executeLiveTurn(request, { ...adapter, dispatch: () => { throw new Error("failed dispatch"); } })).status).toBe("failed");
});
it("never dispatches an already cancelled turn", async () => {
  const abort = new AbortController(); abort.abort(); const dispatch = vi.fn();
  const result = await executeLiveTurn({ callId: "c", taskId: "t", text: "hi", signal: abort.signal }, { screenAllowed: true, needsScreen: false, dispatch, state: () => ({ pending: false, summary: "", outcomes: [] }), cancel: () => {}, subscribe: () => () => {} });
  expect(result.status).toBe("cancelled"); expect(dispatch).not.toHaveBeenCalled();
});

it("does not label an action request completed when the executor supplies no action receipt", async () => {
  const result = await executeLiveTurn({ callId: "c", taskId: "t", text: "Open TextEdit, click the document and type testing Shua", signal: new AbortController().signal }, { screenAllowed: true, needsScreen: true, dispatch: async () => {}, state: () => ({ pending: false, summary: "I cannot click or type in this run.", outcomes: [] }), cancel: () => {}, subscribe: () => () => {} });
  expect(result.status).toBe("unavailable");
});
