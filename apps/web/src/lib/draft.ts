import { useSyncExternalStore } from "react";

/**
 * What you're typing to Spark, outside React state: each keystroke re-rendered the whole notch (header, character,
 * every message). Now only the text box and the send button listen; everything else reads it when it sends.
 */
let value = "";
const subs = new Set<() => void>();
export const draft = {
  get: () => value,
  set: (next: string | ((current: string) => string)) => {
    const v = typeof next === "function" ? next(value) : next;
    if (v === value) return;
    value = v;
    subs.forEach((f) => f());
  },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
};
export const useDraft = () => useSyncExternalStore(draft.subscribe, draft.get, draft.get);
