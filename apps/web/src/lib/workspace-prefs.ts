import { useSyncExternalStore } from "react";

/** How new sessions start, when to warn about spend, and developer overlays. Presentation and defaults only:
 * nothing here grants an agent more authority than the composer's own controls already allow. */
export interface WorkspacePrefs {
  version: 1;
  /** "" means Auto (let the crew pick). */
  runtime: string; model: string; effort: "" | "low" | "medium" | "high" | "max";
  /** Start new sessions on Autopilot instead of Supervised. Deny rules always apply. */
  autopilot: boolean;
  /** Start new sessions as a planned Task. */
  task: boolean;
  /** Warn in the top bar once today's recorded tokens pass this. null = no budget. */
  dailyTokenBudget: number | null;
  /** Floating developer HUD with live event stream health. */
  hud: boolean;
}
const KEY = "shuacrew.workspace";
export const DEFAULT_WORKSPACE: WorkspacePrefs = { version: 1, runtime: "", model: "", effort: "", autopilot: false, task: false, dailyTokenBudget: null, hud: false };

export function parseWorkspace(value: unknown): WorkspacePrefs {
  const v = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = (x: unknown) => typeof x === "string" && /^[A-Za-z0-9._:-]{0,64}$/.test(x) ? x : "";
  const budget = typeof v.dailyTokenBudget === "number" && Number.isFinite(v.dailyTokenBudget) && v.dailyTokenBudget >= 1000 && v.dailyTokenBudget <= 1e10 ? Math.round(v.dailyTokenBudget) : null;
  return {
    version: 1, runtime: id(v.runtime), model: id(v.model),
    effort: (["", "low", "medium", "high", "max"] as const).includes(v.effort as never) ? v.effort as WorkspacePrefs["effort"] : "",
    autopilot: v.autopilot === true, task: v.task === true, dailyTokenBudget: budget, hud: v.hud === true,
  };
}

function load() { try { return parseWorkspace(JSON.parse(localStorage.getItem(KEY) ?? "null")); } catch { return parseWorkspace(null); } }
let current = load();
const listeners = new Set<() => void>();
export function getWorkspace() { return current; }
export function saveWorkspace(patch: Partial<WorkspacePrefs>): boolean {
  current = parseWorkspace({ ...current, ...patch });
  let saved = true;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { saved = false; }
  listeners.forEach((l) => l());
  return saved;
}
export function useWorkspace() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => current);
}

/** 0 = under budget or no budget; otherwise the fraction used (1 = exactly at budget). */
export function budgetUse(tokensToday: number, budget: number | null): number {
  return budget ? tokensToday / budget : 0;
}
