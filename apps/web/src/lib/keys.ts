import { useSyncExternalStore } from "react";

/** Your own "g then key" navigation shortcuts. Overrides only; the built-in key is the default. */
const KEY = "shuacrew.keys";
type Overrides = Record<string, string>; // route → key
function load(): Overrides {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>; return Object.fromEntries(Object.entries(v).filter(([, k]) => typeof k === "string" && validKey(k))) as Overrides; } catch { return {}; }
}
let current = load();
const listeners = new Set<() => void>();
export function validKey(k: string) { return /^[a-z0-9,.;/\[\]-]$/.test(k) && k !== "g"; }
export function navKey(item: { to: string; key: string }) { return current[item.to] ?? item.key; }
/** Which route already uses `key` (so the editor can explain a clash). */
export function keyOwner(items: Array<{ to: string; key: string; label: string }>, key: string, except: string) { return items.find((n) => n.to !== except && navKey(n) === key); }
export function setNavKey(to: string, key: string | null, defaults: Array<{ to: string; key: string }>) {
  const next = { ...current };
  const builtIn = defaults.find((d) => d.to === to)?.key;
  if (key === null || key === builtIn) delete next[to]; else if (validKey(key)) next[to] = key;
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* this session only */ }
  listeners.forEach((l) => l());
}
export function resetNavKeys() { current = {}; try { localStorage.removeItem(KEY); } catch { /* ignore */ } listeners.forEach((l) => l()); }
export function useNavKeys() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => current); }
