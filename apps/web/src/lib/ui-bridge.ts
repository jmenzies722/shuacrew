/**
 * Shua's hands inside ShuaCrew itself. A screen look reads other apps' controls through accessibility, never
 * ShuaCrew's own (when ShuaCrew's window is on top the look says so — `shuacrewWindow`). Instead the notch asks the
 * main window, over a same-origin channel, to press a button, tab or link — or type into a field — by its visible
 * name, exactly, in the page's own DOM. Anything that deletes, approves, merges, sends or signs out is refused: those
 * have their own checked actions, or are yours.
 */
const CHANNEL = "shuacrew-ui";
export interface Pressable { name: string; role: string }
/** A text field Shua can type into (by its label or placeholder). */
export const FIELD = "field";
export type UiResult = { ok: boolean; message: string };

/** Controls Shua never presses by name: they lose work, decide for you, or leave this Mac. */
const RISKY = /\b(delete|remove|erase|factory reset|reset (all|everything|settings|to defaults)|discard|clear all|approve|allow|always allow|deny|reject|merge|push|publish|send|sign out|log out|disconnect|revoke|uninstall|quit|stop all|cancel run)\b/i;
export const risky = (name: string) => RISKY.test(name);

// Names as Shua quotes them, copied off the screen: “Find a tool.” is the field “Find a tool”; quotes and a trailing
// full stop or ellipsis aren't part of the name (they made every press of a placeholder or a sentence-like label fail).
const norm = (s: string) => s.replace(/\s+/g, " ").trim().replace(/^["“”'‘’«]+|[\s.…:;!?"“”'‘’»]+$/g, "").toLowerCase();
/**
 * Which control a name means: an exact name first, then the one whose name starts with it, then contains it — and only
 * when exactly one fits. Returns its index, or why not.
 */
export function pickPressable(list: Pressable[], wanted: string): { index: number } | { error: string } {
  const w = norm(wanted);
  if (!w) return { error: "Say which control to press." };
  for (const test of [(n: string) => n === w, (n: string) => n.startsWith(w), (n: string) => n.includes(w)]) {
    const hits = list.map((c, i) => ({ c, i })).filter(({ c }) => test(norm(c.name)));
    // Typing into a field never sends anything by itself, so a field may be named "Send a message".
    if (hits.length === 1) return risky(hits[0]!.c.name) && hits[0]!.c.role !== FIELD ? { error: `“${hits[0]!.c.name}” isn't something I press for you: use its own action or do it yourself.` } : { index: hits[0]!.i };
    if (hits.length > 1) {
      // The same control twice (a label and its icon button) is still one choice.
      const names = new Set(hits.map(({ c }) => norm(c.name) + "|" + c.role));
      if (names.size === 1 && !risky(hits[0]!.c.name)) return { index: hits[0]!.i };
      return { error: `More than one control matches “${wanted}” (${[...new Set(hits.map(({ c }) => c.name))].slice(0, 4).join(", ")}). Use the exact name.` };
    }
  }
  return { error: `There's no “${wanted}” on this ShuaCrew page.` };
}

const FIELDS = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]):not([type=color]):not([type=file]), textarea, [contenteditable=true], [role=searchbox], [role=textbox]";
/** A field's name: its aria-label, its <label>, its placeholder. */
function fieldName(el: HTMLElement): string {
  const id = el.getAttribute("id"), labelled = el.getAttribute("aria-labelledby");
  return (el.getAttribute("aria-label") || (labelled && el.ownerDocument.getElementById(labelled)?.textContent) || (id && el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent)
    || el.closest("label")?.textContent || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name") || "");
}
/** What's pressable on the page right now, in order: visible buttons, links, tabs and toggles, then text fields, by name. */
function pressables(root: Document): Array<Pressable & { el: HTMLElement }> {
  const usable = (el: HTMLElement) => el.getClientRects().length > 0 && !(el as HTMLButtonElement).disabled && !el.closest("[aria-hidden=true], [inert]");
  const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 120);
  const controls = [...root.querySelectorAll<HTMLElement>("button, a[href], [role=button], [role=tab], [role=link], [role=menuitem], [role=switch], [role=option], summary")].filter(usable)
    .map((el) => ({ el, name: clean(el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || ""), role: el.getAttribute("role") || el.tagName.toLowerCase() }));
  const fields = [...root.querySelectorAll<HTMLElement>(FIELDS)].filter((el) => usable(el) && !(el as HTMLInputElement).readOnly)
    .map((el) => ({ el, name: clean(fieldName(el)), role: FIELD }));
  return [...controls, ...fields].filter((c) => c.name);
}

/** Type into a field the way React hears it: the native value setter, then input + change. */
function fill(el: HTMLElement, text: string) {
  el.focus();
  if (el.isContentEditable) { el.textContent = text; el.dispatchEvent(new InputEvent("input", { bubbles: true })); return; }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** In the main window: answer the notch's press requests. Waits briefly for a page that's still drawing. */
export function installUiBridge(): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = async (e: MessageEvent<{ type: string; id: string; press: string; text?: string }>) => {
    if (e.data?.type === "list") {
      await new Promise((r) => setTimeout(r, 350)); // a page that just opened finishes drawing first
      const all = pressables(document);
      const names = [...new Set(all.filter((c) => c.role !== FIELD).map((c) => c.name).filter((n) => !risky(n)))].slice(0, 80);
      const fields = [...new Set(all.filter((c) => c.role === FIELD).map((c) => c.name))].slice(0, 20);
      channel.postMessage({ type: "listed", id: e.data.id, page: { title: document.title.replace(/\s*[·|–-]\s*ShuaCrew\s*$/i, ""), path: location.pathname, controls: names, fields } });
      return;
    }
    if (e.data?.type !== "press") return;
    const text = typeof e.data.text === "string" ? e.data.text : undefined;
    let result: UiResult = { ok: false, message: "" };
    for (let attempt = 0; attempt < 8; attempt++) {
      // Typing looks only at fields; pressing at everything (a field pressed is clicked into).
      const all = pressables(document), list = text === undefined ? all : all.filter((c) => c.role === FIELD), pick = pickPressable(list, e.data.press);
      if ("index" in pick) {
        const c = list[pick.index]!, where = document.title.replace(/\s*[·|–-]\s*ShuaCrew\s*$/i, "") || location.pathname;
        c.el.scrollIntoView({ block: "nearest" });
        if (text !== undefined) { fill(c.el, text); result = { ok: true, message: `Typed “${text.slice(0, 60)}” into “${c.name}” on ${where}` }; }
        else if (c.role === FIELD) { c.el.focus(); result = { ok: true, message: `Clicked into “${c.name}” on ${where}` }; }
        else { c.el.click(); result = { ok: true, message: `Pressed “${c.name}” on ${where}` }; }
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

/** From the notch: press a control in ShuaCrew's main window by name — or, with `text`, type into the field of that name. */
export function pressInShuaCrew(press: string, timeout = 2500, text?: string): Promise<UiResult> {
  if (typeof BroadcastChannel === "undefined") return Promise.resolve({ ok: false, message: "This window can't reach ShuaCrew's main window." });
  const channel = new BroadcastChannel(CHANNEL), id = Math.random().toString(36).slice(2);
  return new Promise<UiResult>((resolve) => {
    const done = (r: UiResult) => { clearTimeout(timer); channel.close(); resolve(r); };
    const timer = setTimeout(() => done({ ok: false, message: "ShuaCrew's main window didn't answer. Open it (⌘1) and try again." }), timeout);
    channel.onmessage = (e: MessageEvent<{ type: string; id: string } & UiResult>) => { if (e.data?.type === "pressed" && e.data.id === id) done({ ok: e.data.ok, message: e.data.message }); };
    channel.postMessage({ type: "press", id, press, ...(text !== undefined ? { text } : {}) });
  });
}

export interface ShuaCrewPage { title: string; path: string; controls: string[]; fields?: string[] }
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
  return `SHUACREW WINDOW NOW: “${p.title || p.path}” (${p.path}). Press its controls with ui by these exact names: ${p.controls.length ? p.controls.join(" · ") : "(none visible)"}.${p.fields?.length ? ` Type into its fields with ui {"press": field name, "text": what to type}: ${p.fields.join(" · ")}.` : ""}`;
}
