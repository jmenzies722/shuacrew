import { useSyncExternalStore } from "react";

/** Your own /commands: typing `/name` in the composer inserts `text`. */
export interface Snippet { name: string; text: string }
/** One click sets up a new session: agent, model, effort, mode, and a prompt to start from. */
export interface Preset { id: string; label: string; runtime: string; model: string; effort: "" | "low" | "medium" | "high" | "max"; autopilot: boolean; task: boolean; prefix: string }
export interface PowerPrefs {
  version: 1;
  snippets: Snippet[];
  presets: Preset[];
  /** Hide the rail, top bar and side panels. ⌘⇧F toggles. */
  flow: boolean;
  /** A small celebration when a session finishes or merges. */
  wins: "off" | "subtle" | "party";
  winSound: boolean;
}
const KEY = "shuacrew.power";
const RESERVED = new Set(["skill", "mcp", "task", "autopilot", "plan", "model", "effort", "help"]);
export const DEFAULT_POWER: PowerPrefs = {
  version: 1, flow: false, wins: "off", winSound: false,
  snippets: [
    { name: "review", text: "Review the uncommitted changes in this repo. List real bugs first with file:line, then risky spots. Don't change anything." },
    { name: "tests", text: "Find the tests for what I just changed, run them, and fix any failure at its root cause. Show the command output." },
  ],
  presets: [
    { id: "ship", label: "Ship it", runtime: "", model: "", effort: "high", autopilot: false, task: true, prefix: "Build this end to end, test it, and get it ready to merge: " },
    { id: "quick", label: "Quick answer", runtime: "", model: "", effort: "low", autopilot: false, task: false, prefix: "" },
  ],
};

const name = (x: unknown) => (typeof x === "string" && /^[a-z0-9][a-z0-9-]{0,23}$/.test(x) && !RESERVED.has(x) ? x : null);
const id = (x: unknown) => (typeof x === "string" && /^[A-Za-z0-9._:-]{0,64}$/.test(x) ? x : "");
const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");

export function parsePower(value: unknown): PowerPrefs {
  const v = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!v) return structuredClone(DEFAULT_POWER);
  const seen = new Set<string>();
  const snippets = (Array.isArray(v.snippets) ? v.snippets : []).slice(0, 50).flatMap((s: Record<string, unknown>) => {
    const n = name(s?.name), t = text(s?.text, 8000).trim();
    if (!n || !t || seen.has(n)) return [];
    seen.add(n); return [{ name: n, text: t }];
  });
  const ids = new Set<string>();
  const presets = (Array.isArray(v.presets) ? v.presets : []).slice(0, 12).flatMap((p: Record<string, unknown>) => {
    const pid = id(p?.id), label = text(p?.label, 32).trim();
    if (!pid || !label || ids.has(pid)) return [];
    ids.add(pid);
    const effort = (["", "low", "medium", "high", "max"] as const).includes(p.effort as never) ? p.effort as Preset["effort"] : "";
    return [{ id: pid, label, runtime: id(p.runtime), model: id(p.model), effort, autopilot: p.autopilot === true, task: p.task === true, prefix: text(p.prefix, 2000) }];
  });
  return { version: 1, snippets, presets, flow: v.flow === true, wins: (["off", "subtle", "party"] as const).includes(v.wins as never) ? v.wins as PowerPrefs["wins"] : "off", winSound: v.winSound === true };
}

function load() { try { const raw = localStorage.getItem(KEY); return raw === null ? structuredClone(DEFAULT_POWER) : parsePower(JSON.parse(raw)); } catch { return structuredClone(DEFAULT_POWER); } }
let current = load();
const listeners = new Set<() => void>();
export function getPower() { return current; }
export function savePower(patch: Partial<PowerPrefs>): boolean {
  current = parsePower({ ...current, ...patch });
  let saved = true;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { saved = false; }
  listeners.forEach((l) => l());
  return saved;
}
export function usePower() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => current); }
export function isSnippetName(x: string) { return name(x) !== null; }
