export function teachingNative(message: Record<string, unknown>): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID(),
      event = "shuacrew:teaching",
      timer = setTimeout(
        () => {
          window.removeEventListener(event, on);
          reject(new Error("Native teaching capability did not respond"));
        },
        message.type === "buddyTeachExport" ? 120000 : 20000,
      );
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener(event, on);
      d.error ? reject(new Error(d.error)) : resolve(d);
    };
    window.addEventListener(event, on);
    const bridge = (window as any).webkit?.messageHandlers?.shuacrew;
    if (!bridge) {
      clearTimeout(timer);
      window.removeEventListener(event, on);
      reject(new Error("This capability requires the Mac app"));
      return;
    }
    bridge.postMessage({ ...message, requestId });
  });
}
