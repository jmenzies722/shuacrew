/**
 * The Mac app's side of the bridge. In a browser none of this exists and every call is a no-op,
 * so the page works the same in both.
 */
type Message = { type: "pickFolder" } | { type: "noDrag"; rects: number[][] };

interface Handler {
  postMessage(message: Message): void;
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
