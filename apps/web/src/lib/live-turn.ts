import type { LiveTaskRequest, LiveTaskResult } from "./live-task";

export function requestsDesktopAction(text: string) {
  const ask = text.replace(/\b(?:do not|don't|without|never)\s+(?:click(?:ing)?|typ(?:e|ing)|scroll(?:ing)?|press(?:ing)?|open(?:ing)?|past(?:e|ing))\b/gi, "");
  if (/\b(?:how (?:do|can|should)|where (?:do|can|should)|describe|explain|show me where)\b/i.test(ask)) return false;
  return /\b(?:click|double-click|right-click|type|paste|scroll|press|open)\b/i.test(ask);
}

export type LiveTurnState = { pending: boolean; summary: string; outcomes: LiveTaskResult["outcomes"]; error?: string; visualId?: string };
export function executeLiveTurn(request: LiveTaskRequest, adapter: { screenAllowed: boolean; needsScreen: boolean; dispatch: () => Promise<void>; state: () => LiveTurnState; cancel: () => void; subscribe: (listener: () => void) => () => void }): Promise<LiveTaskResult> {
  if (adapter.needsScreen && !adapter.screenAllowed) return Promise.resolve({ status: "unavailable", summary: "Screen access is off. Enable the eye control before asking me to look or act on screen.", outcomes: [] });
  return new Promise(resolve => {
    let settled = false, dispatched = false;
    let unsubscribe: (() => void) | undefined;
    const finish = (result: LiveTaskResult) => {
      if (settled) return;
      settled = true; unsubscribe?.(); unsubscribe = undefined; request.signal.removeEventListener("abort", abort); resolve(result);
    };
    const abort = () => { adapter.cancel(); finish({ status: "cancelled", summary: "Stopped. Earlier actions may already have taken effect.", outcomes: adapter.state().outcomes }); };
    const check = () => {
      if (settled) return;
      const state = adapter.state();
      if (dispatched && state.error) { finish({ status: "failed", summary: state.error, outcomes: state.outcomes }); return; }
      if (dispatched && !state.pending && state.summary.trim()) {
        finish({ status: state.outcomes.some(outcome => !outcome.ok) ? "failed" : requestsDesktopAction(request.text) && !state.outcomes.length ? "unavailable" : "completed", summary: state.summary, outcomes: state.outcomes, visualId: state.visualId }); return;
      }

    };
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) { abort(); return; }
    try {
      unsubscribe = adapter.subscribe(check);
      if (settled || request.signal.aborted) { unsubscribe?.(); unsubscribe = undefined; return; }
      void adapter.dispatch().then(() => { dispatched = true; check(); }, error => finish({ status: "failed", summary: error instanceof Error ? error.message : String(error), outcomes: adapter.state().outcomes }));
    } catch (error) { finish({ status: "failed", summary: error instanceof Error ? error.message : String(error), outcomes: adapter.state().outcomes }); }
  });
}
