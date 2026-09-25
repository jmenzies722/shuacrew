/**
 * The Mac app's side of the bridge. In a browser none of this exists and every call is a no-op,
 * so the page works the same in both.
 */
type Message = { type: "saveFile"; name: string; text: string } | { type: "pickFolder" } | { type: "noDrag"; rects: number[][] } | { type: "composeEmail"; subject: string; body: string; to?: string } | { type: "notificationSettings"; requestId: string; preferences?: NativeNotificationPreferences } | { type: "voiceSettings"; requestId: string; action: "read" | "save" | "preview" | "stop"; preferences?: NativeVoicePreferences };

export interface NativeVoicePreferences { voiceID: string; speed: number }
export interface NativeVoiceSnapshot {
  requestId: string;
  preferences: NativeVoicePreferences;
  voices: Array<{ id: string; name: string; language: string; gender: string; quality: number }>;
  selectedID?: string;
  speaking: boolean;
  error?: string;
}

export function voiceSettings(action: "read" | "save" | "preview" | "stop" = "read", preferences?: NativeVoicePreferences): string | null {
  const native = handler();
  if (!native) return null;
  const requestId = crypto.randomUUID();
  native.postMessage({ type: "voiceSettings", requestId, action, preferences });
  return requestId;
}

export interface NativeNotificationPreferences {
  enabled: boolean;
  approvals: boolean;
  completions: boolean;
  reviews: boolean;
  briefings: boolean;
  sounds: boolean;
  quietHours: boolean;
  quietStart: number;
  quietEnd: number;
}

/** Reading never prompts; only explicitly enabling notifications asks macOS for permission. */
export function notificationSettings(preferences?: NativeNotificationPreferences): string | null {
  const native = handler();
  if (!native) return null;
  const requestId = crypto.randomUUID();
  native.postMessage({ type: "notificationSettings", requestId, preferences });
  return requestId;
}

/** A refresh is not an acknowledgement of a pending write/permission prompt. */
export function settleNotificationRequest(pending: string | null, responseId: string, nativeBusy: boolean) {
  const next = pending === responseId ? null : pending;
  return { pending: next, busy: next !== null || nativeBusy };
}

interface Handler {
  postMessage(message: Message | { type: "mobileSettings" }): void;
}

/** Opens a native window only; no key, credential or pairing authority crosses WebKit. */
export function openMobileSettings(): boolean {
  const native = handler();
  if (!native) return false;
  native.postMessage({ type: "mobileSettings" });
  return true;
}

const handler = (): Handler | undefined =>
  (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: Handler } } }).webkit?.messageHandlers?.shuacrew;

export const isMac = () => document.documentElement.dataset.shell === "mac";

let picked: ((path: string | null) => void) | null = null;

/** The native folder picker; null when cancelled, or outside the Mac app. */
export function pickFolder(): Promise<string | null> {
  const native = handler();
  if (!native) return Promise.resolve(null);
  return new Promise((resolve) => {
    picked = resolve;
    native.postMessage({ type: "pickFolder" });
  });
}

/** Called by the app when the panel closes. */
export function folderPicked(path: string | null) {
  picked?.(path);
  picked = null;
}

/**
 * The title bar is ours to draw, but the window has to know where it can be dragged. Tell it
 * where the controls are; everywhere else in the top strip moves the window.
 */
export function watchTitleBar(bar: HTMLElement): () => void {
  const native = handler();
  if (!native) return () => undefined;
  const report = () => {
    const rects = [...bar.querySelectorAll<HTMLElement>("button, a, input, [data-no-drag]")].map((el) => {
      const r = el.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height];
    });
    native.postMessage({ type: "noDrag", rects });
  };
  const observer = new ResizeObserver(report);
  observer.observe(bar);
  const mutations = new MutationObserver(report);
  mutations.observe(bar, { childList: true, subtree: true });
  window.addEventListener("resize", report);
  report();
  return () => {
    observer.disconnect();
    mutations.disconnect();
    window.removeEventListener("resize", report);
  };
}


/** A filled-in email in your mail app (in a browser: a mailto link, which is length-limited). */
export function composeEmail(subject: string, body: string, to = "") {
  const native = handler();
  if (native) return native.postMessage({ type: "composeEmail", subject, body, to });
  window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 1800))}`;
}

/** Save text to a file the user chooses. The Mac app shows its Save panel; a browser downloads it. */
export function saveTextFile(name: string, text: string, type = "application/json") {
  const native = handler();
  if (native) { native.postMessage({ type: "saveFile", name, text }); return; }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click(); URL.revokeObjectURL(a.href);
}

/** A native macOS notification (Mac app); in a browser, the Notification API if you've allowed it. */
export function notifyNative(title: string, body = "") {
  const native = handler();
  if (native) { native.postMessage({ type: "notify", title, body } as never); return; }
  try { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body }); } catch { /* ignore */ }
}
/** Your location once, from macOS Location (Mac app) or the browser — rounded to ~1 km. */
export function requestLocation(timeoutMs = 20_000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    const native = handler();
    if (native) {
      const t = setTimeout(() => { window.removeEventListener("shuacrew:location", on as EventListener); reject(new Error("Location timed out.")); }, timeoutMs);
      const on = (e: CustomEvent<{ lat?: number; lon?: number; error?: string }>) => {
        clearTimeout(t); window.removeEventListener("shuacrew:location", on as EventListener);
        if (typeof e.detail.lat === "number" && typeof e.detail.lon === "number") resolve({ lat: e.detail.lat, lon: e.detail.lon }); else reject(new Error(e.detail.error ?? "Location unavailable."));
      };
      window.addEventListener("shuacrew:location", on as EventListener);
      native.postMessage({ type: "location" } as never); return;
    }
    if (!navigator.geolocation) { reject(new Error("Location isn't available here.")); return; }
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }), (e) => reject(new Error(e.message)), { timeout: timeoutMs, maximumAge: 3_600_000 });
  });
}
