export interface AnalyticsSnapshot<R, P> { report?: R; providers?: P; loading: boolean; error: string; providerError: string }
/** One refresh boundary; partial failures preserve the last evidence and surface staleness. */
export function analyticsPolling<R, P>(report: () => Promise<R>, providers: () => Promise<P>, changed: (state: AnalyticsSnapshot<R, P>) => void, seconds: number) {
  let state: AnalyticsSnapshot<R, P> = { loading: false, error: "", providerError: "" }, alive = true, inflight = false, timer: ReturnType<typeof setInterval> | undefined;
  let dirty = false, pending: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {
    if (!alive || seconds === 0) return;
    dirty = true;
    if (!pending) pending = setTimeout(() => { pending = undefined; if (!inflight) void refresh(); }, 1000);
  };
  const publish = () => { if (alive) changed({ ...state }); };
  const refresh = async () => {
    if (!alive || inflight) return; inflight = true; dirty = false; state = { ...state, loading: true }; publish();
    const [r, p] = await Promise.allSettled([report(), providers()]);
    inflight = false; if (!alive) return;
    state = { ...state, loading: false,
      ...(r.status === "fulfilled" ? { report: r.value, error: "" } : { error: String(r.reason?.message ?? r.reason) }),
      ...(p.status === "fulfilled" ? { providers: p.value, providerError: "" } : { providerError: String(p.reason?.message ?? p.reason) }),
    }; publish(); if (dirty) invalidate();
  };
  return { refresh, invalidate, start: () => { if (seconds > 0 && !timer) timer = setInterval(() => void refresh(), seconds * 1000); return refresh(); }, stop: () => { alive = false; clearTimeout(pending); if (timer) clearInterval(timer); } };
}
