/**
 * A new build of ShuaCrew landed (the gateway now serves different scripts): each open window reloads onto it at
 * its next quiet moment, so a fix reaches the notch and the main window without relaunching the app. Never while
 * Shua is speaking, listening, writing or working, never in a Live call, never while you type, and the main window
 * only while it's in the background.
 */
const SCRIPT = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

/** The build a page runs: its main script's hashed name. */
export function buildOf(html: string): string | null { return html.match(SCRIPT)?.[0] ?? null; }

const busy = new Map<string, boolean>();
/** A part of the window says whether it's mid-something (the notch: speaking, listening, a call…). */
export function markBusy(part: string, on: boolean) { busy.set(part, on); }

export interface Quiet { busy: boolean; typing: boolean; foreground: boolean; notch: boolean }
/** Whether now is a good moment to reload onto a new build. */
export function quietNow(q: Quiet): boolean {
  if (q.busy || q.typing) return false;
  return q.notch || !q.foreground; // the notch reloads whenever it's idle; the main window only out of sight
}

function typingNow(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.value.trim().length > 0;
}

export function startFreshBuild(every = 45_000) {
  if (typeof window === "undefined" || typeof fetch === "undefined") return;
  const current = buildOf(document.documentElement.outerHTML);
  if (!current) return; // the dev server: nothing to compare
  const notch = location.pathname.startsWith("/buddy");
  let next = false;
  setInterval(async () => {
    if (!next) {
      try { const served = buildOf(await (await fetch("/", { cache: "no-store" })).text()); next = !!served && served !== current; }
      catch { return; } // the gateway may be restarting: the next look sees it
    }
    if (next && quietNow({ busy: [...busy.values()].some(Boolean), typing: typingNow(), foreground: document.visibilityState === "visible" && document.hasFocus(), notch })) location.reload();
  }, every);
}
