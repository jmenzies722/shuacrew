export type PointerReceipt = { ok: boolean; message: string; cancelled?: boolean };

export function requestPointer(
  payload: Record<string, unknown>,
  send: (message: Record<string, unknown>) => void,
  events: EventTarget,
  signal?: AbortSignal,
): Promise<PointerReceipt> {
  return new Promise(resolve => {
    const id = crypto.randomUUID();
    const finish = (receipt: PointerReceipt) => {
      clearTimeout(timer);
      events.removeEventListener("shuacrew:pointer", receive);
      signal?.removeEventListener("abort", cancel);
      resolve(receipt);
    };
    const cancel = () => finish({ ok: false, cancelled: true, message: "Highlight cancelled." });
    const receive = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.id !== id || typeof detail.ok !== "boolean") return;
      finish({ ok: detail.ok, message: detail.ok
        ? "Highlight displayed. Target placement is not independently verified."
        : typeof detail.message === "string" ? detail.message : "The Mac could not display the highlight." });
    };
    const timer = setTimeout(() => finish({ ok: false, message: "The Mac did not confirm the highlight. Find the target again." }), 3000);
    if (signal?.aborted) { cancel(); return; }
    events.addEventListener("shuacrew:pointer", receive);
    signal?.addEventListener("abort", cancel, { once: true });
    try { send({ ...payload, id }); }
    catch { finish({ ok: false, message: "Could not reach the Mac overlay." }); }
  });
}
