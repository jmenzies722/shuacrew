export function requestMacTask(payload: Record<string, unknown>, send: (message: Record<string, unknown>) => void, events: EventTarget, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const finish = (result?: Record<string, unknown>, error?: string) => {
      clearTimeout(timer); events.removeEventListener("shuacrew:macTask", receive); signal?.removeEventListener("abort", cancel);
      if (error) reject(new Error(error)); else resolve(result!);
    };
    const cancel = () => finish(undefined, "Stopped.");
    const receive = (event: Event) => {
      const result = (event as CustomEvent).detail;
      if (result?.id !== id) return;
      if (result.ok !== true) finish(undefined, typeof result.message === "string" ? result.message : "Native task failed.");
      else finish(result);
    };
    const timer = setTimeout(() => finish(undefined, "Native response timed out; action outcome may be unknown."), 5000);
    if (signal?.aborted) { cancel(); return; }
    events.addEventListener("shuacrew:macTask", receive); signal?.addEventListener("abort", cancel, { once: true });
    try { send({ ...payload, type: "buddyMacTask", id }); } catch { finish(undefined, "Native task bridge unavailable."); }
  });
}
