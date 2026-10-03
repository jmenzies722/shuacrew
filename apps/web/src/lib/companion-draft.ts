import { useSyncExternalStore } from "react";

const KEY = "shuacrew.companionDraft";
type Draft = { text: string; revision: string };
function readStoredDraft(): Draft | undefined {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return { text: "", revision: "empty" };
    try {
      const value = JSON.parse(raw) as Partial<Draft>;
      if (typeof value?.text === "string" && typeof value.revision === "string") return value as Draft;
    } catch { /* Migrate the first version's plain-text drafts. */ }
    return { text: raw, revision: `legacy:${raw}` };
  } catch { return undefined; }
}
let draft: Draft = readStoredDraft() ?? { text: "", revision: "empty" };
let persistedRevision = draft.revision, dirty = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const refresh = () => {
  const stored = readStoredDraft();
  // Failed persistence must not replace a new edit with the unchanged disk record.
  if (stored && !(dirty && stored.revision === persistedRevision) && stored.revision !== draft.revision) {
    draft = stored; persistedRevision = stored.revision; dirty = false; notify();
  }
};
const receive = (event: StorageEvent) => {
  if (event.key === KEY || event.key === null) refresh();
};

export function getCompanionDraft() { return draft.text; }
export function getCompanionDraftRevision() { refresh(); return draft.revision; }
export function acceptCompanionDraft(text: string) {
  const revision = getCompanionDraftRevision();
  clearCompanionDraft(text, revision);
  return getCompanionDraftRevision();
}
export function setCompanionDraft(next: string | ((current: string) => string)) {
  refresh();
  const text = typeof next === "function" ? next(draft.text) : next;
  if (text === draft.text) return;
  draft = { text, revision: crypto.randomUUID() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
    persistedRevision = draft.revision; dirty = false;
  } catch { dirty = true; /* Keep editing if storage is unavailable. */ }
  notify();
}
/** Delayed completion must not erase a later edit, even if it has identical text. */
export function clearCompanionDraft(submitted: string, revision: string) {
  refresh();
  if (draft.revision === revision && draft.text === submitted) setCompanionDraft("");
}
/** A failed spoken turn becomes editable unless the user changed the draft meanwhile. */
export function restoreCompanionDraft(text: string, revision: string) {
  refresh();
  if (draft.revision === revision && !draft.text) setCompanionDraft(text);
}
export function subscribeCompanionDraft(listener: () => void) {
  if (!listeners.size && typeof window !== "undefined") {
    window.addEventListener("storage", receive);
    refresh(); // The app panel can be unmounted while the desktop companion keeps editing.
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== "undefined") window.removeEventListener("storage", receive);
  };
}
export function useCompanionDraft() {
  return [useSyncExternalStore(subscribeCompanionDraft, getCompanionDraft, () => ""), setCompanionDraft] as const;
}
