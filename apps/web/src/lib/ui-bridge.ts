/**
 * Shua's hands inside ShuaCrew itself. Its screen view always looks at the app behind ShuaCrew (talking to Shua brings
 * ShuaCrew forward), so it can't see or click ShuaCrew's own window. Instead the notch asks the main window, over a
 * same-origin channel, to press a button, tab or link by its visible name — exactly, in the page's own DOM. Anything
 * that deletes, approves, merges, sends or signs out is refused: those have their own checked actions, or are yours.
 */
const CHANNEL = "shuacrew-ui";
export interface Pressable { name: string; role: string }
export type UiResult = { ok: boolean; message: string };

/** Controls Shua never presses by name: they lose work, decide for you, or leave this Mac. */
const RISKY = /\b(delete|remove|erase|factory reset|reset (all|everything|settings|to defaults)|discard|clear all|approve|allow|always allow|deny|reject|merge|push|publish|send|sign out|log out|disconnect|revoke|uninstall|quit|stop all|cancel run)\b/i;
export const risky = (name: string) => RISKY.test(name);

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
/**
 * Which control a name means: an exact name first, then the one whose name starts with it, then contains it — and only
 * when exactly one fits. Returns its index, or why not.
 */
export function pickPressable(list: Pressable[], wanted: string): { index: number } | { error: string } {
  const w = norm(wanted);
  if (!w) return { error: "Say which control to press." };
  for (const test of [(n: string) => n === w, (n: string) => n.startsWith(w), (n: string) => n.includes(w)]) {
    const hits = list.map((c, i) => ({ c, i })).filter(({ c }) => test(norm(c.name)));
    if (hits.length === 1) return risky(hits[0]!.c.name) ? { error: `“${hits[0]!.c.name}” isn't something I press for you: use its own action or do it yourself.` } : { index: hits[0]!.i };
    if (hits.length > 1) {
      // The same control twice (a label and its icon button) is still one choice.
      const names = new Set(hits.map(({ c }) => norm(c.name) + "|" + c.role));
      if (names.size === 1 && !risky(hits[0]!.c.name)) return { index: hits[0]!.i };
      return { error: `More than one control matches “${wanted}” (${[...new Set(hits.map(({ c }) => c.name))].slice(0, 4).join(", ")}). Use the exact name.` };
    }
  }
  return { error: `There's no “${wanted}” on this ShuaCrew page.` };
}

/** What's pressable on the page right now, in order: visible buttons, links, tabs and toggles, by accessible name. */
function pressables(root: Document): Array<Pressable & { el: HTMLElement }> {
  const els = [...root.querySelectorAll<HTMLElement>("button, a[href], [role=button], [role=tab], [role=link], [role=menuitem], [role=switch], summary")];
  return els.filter((el) => el.getClientRects().length > 0 && !(el as HTMLButtonElement).disabled && !el.closest("[aria-hidden=true], [inert]"))
    .map((el) => ({ el, name: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 80), role: el.getAttribute("role") || el.tagName.toLowerCase() }))
    .filter((c) => c.name);
}

/** In the main window: answer the notch's press requests. Waits briefly for a page that's still drawing. */
export function installUiBridge(): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = async (e: MessageEvent<{ type: string; id: string; press: string }>) => {
    if (e.data?.type === "list") {
      await new Promise((r) => setTimeout(r, 350)); // a page that just opened finishes drawing first
      const names = [...new Set(pressables(document).map((c) => c.name).filter((n) => !risky(n)))].slice(0, 80);
      channel.postMessage({ type: "listed", id: e.data.id, page: { title: document.title.replace(/\s*[·|–-]\s*ShuaCrew\s*$/i, ""), path: location.pathname, controls: names } });
      return;
    }
    if (e.data?.type !== "press") return;
    let result: UiResult = { ok: false, message: "" };
    for (let attempt = 0; attempt < 8; attempt++) {
      const list = pressables(document), pick = pickPressable(list, e.data.press);
      if ("index" in pick) {
        const c = list[pick.index]!;
        c.el.scrollIntoView({ block: "nearest" }); c.el.click();
        result = { ok: true, message: `Pressed “${c.name}” on ${document.title.replace(/\s*[·|–-]\s*ShuaCrew\s*$/i, "") || location.pathname}` };
        break;
      }
      result = { ok: false, message: pick.error };
      if (!pick.error.startsWith("There's no")) break; // ambiguous or refused: waiting won't change it
      await new Promise((r) => setTimeout(r, 200));
    }
    channel.postMessage({ type: "pressed", id: e.data.id, ...result });
  };
  return () => channel.close();
}

/** From the notch: press a control in ShuaCrew's main window by name. */
export function pressInShuaCrew(press: string, timeout = 2500): Promise<UiResult> {
  if (typeof BroadcastChannel === "undefined") return Promise.resolve({ ok: false, message: "This window can't reach ShuaCrew's main window." });
  const channel = new BroadcastChannel(CHANNEL), id = Math.random().toString(36).slice(2);
  return new Promise<UiResult>((resolve) => {
    const done = (r: UiResult) => { clearTimeout(timer); channel.close(); resolve(r); };
    const timer = setTimeout(() => done({ ok: false, message: "ShuaCrew's main window didn't answer. Open it (⌘1) and try again." }), timeout);
    channel.onmessage = (e: MessageEvent<{ type: string; id: string } & UiResult>) => { if (e.data?.type === "pressed" && e.data.id === id) done({ ok: e.data.ok, message: e.data.message }); };
    channel.postMessage({ type: "press", id, press });
  });
}

export interface ShuaCrewPage { title: string; path: string; controls: string[] }
/** From the notch: what ShuaCrew's main window is showing and what can be pressed there, or null if it didn't answer. */
export function listShuaCrew(timeout = 1500): Promise<ShuaCrewPage | null> {
  if (typeof BroadcastChannel === "undefined") return Promise.resolve(null);
  const channel = new BroadcastChannel(CHANNEL), id = Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    const done = (p: ShuaCrewPage | null) => { clearTimeout(timer); channel.close(); resolve(p); };
    const timer = setTimeout(() => done(null), timeout);
    channel.onmessage = (e: MessageEvent<{ type: string; id: string; page: ShuaCrewPage }>) => { if (e.data?.type === "listed" && e.data.id === id) done(e.data.page); };
    channel.postMessage({ type: "list", id });
  });
}
/** ShuaCrew's window, in words for Shua: the page and the exact names it can press there. */
export function shuacrewPageText(p: ShuaCrewPage): string {
  return `SHUACREW WINDOW NOW: “${p.title || p.path}” (${p.path}). Press its controls with ui by these exact names: ${p.controls.length ? p.controls.join(" · ") : "(none visible)"}.`;
}
