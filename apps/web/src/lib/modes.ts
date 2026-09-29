import { useSyncExternalStore } from "react";
import { api } from "./api";
import { getLook, saveLook } from "./look";
import { getPower, savePower } from "./power";
import { getWorkspace, saveWorkspace } from "./workspace-prefs";
import { playScape, stopScape } from "./soundscape";

/** Modes change many real settings at once and put back exactly what they changed. */
export type Mode = "deep" | "saver" | "wind";
export interface ActiveMode { mode: Mode; auto: boolean; before: { workspace: unknown; power: unknown; look: unknown; gateway: Record<string, unknown> } }
const KEY = "shuacrew.mode", SCHEDULE = "shuacrew.modeSchedule";
const listeners = new Set<() => void>();
function read<T>(key: string, fallback: T): T { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } }
function write(key: string, v: unknown) { try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* this session only */ } }
let active = read<ActiveMode | null>(KEY, null);
let schedule = read<ModeRule[]>(SCHEDULE, []);
const emit = () => listeners.forEach((l) => l());
const gatewayChanged = () => window.dispatchEvent(new Event("shuacrew:settings"));

async function patchGateway(patch: Record<string, unknown>) { await api("/api/settings", { body: patch }); gatewayChanged(); }

export async function enterMode(mode: Mode, auto = false) {
  const g = await api<Record<string, unknown>>("/api/settings");
  if (active) await leaveMode();
  const before = { workspace: getWorkspace(), power: getPower(), look: getLook(), gateway: { caps: g.caps, quietHours: g.quietHours } };
  if (mode === "deep") { savePower({ flow: true, wins: "off" }); saveLook({ sounds: { ...getLook().sounds, approval: true, done: false, failed: false } }); playScape("brown", 0.45); }
  if (mode === "saver") { saveWorkspace({ runtime: "claude", model: "claude-haiku-4-5", effort: "low", dailyTokenBudget: 500_000 }); await patchGateway({ caps: { maxTokens: 250_000 } }); }
  if (mode === "wind") { savePower({ wins: "off" }); saveLook({ sounds: { ...getLook().sounds, approval: false, done: false, failed: false } }); await patchGateway({ quietHours: { enabled: true, start: 22 * 60, end: 7 * 60 } }); stopScape(); }
  active = { mode, auto, before }; write(KEY, active); emit();
}
export async function leaveMode() {
  const s = active; if (!s) return;
  saveWorkspace(s.before.workspace as never); savePower(s.before.power as never); saveLook(s.before.look as never);
  await patchGateway(s.before.gateway); stopScape();
  active = null; write(KEY, null); emit();
}
export function useActiveMode() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => active, () => active); }

/** "Deep work, weekdays 9–12": a mode that switches itself on and off. Manual modes are never touched. */
export interface ModeRule { mode: Mode; days: number[]; start: number; end: number }
export function getSchedule() { return schedule; }
export function saveSchedule(next: ModeRule[]) { schedule = next.filter((r) => r.days.length && r.start !== r.end).slice(0, 8); write(SCHEDULE, schedule); emit(); }
export function useSchedule() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => schedule, () => schedule); }
export function ruleActive(r: ModeRule, now = new Date()) {
  const m = now.getHours() * 60 + now.getMinutes(), day = now.getDay();
  return r.days.includes(day) && (r.start < r.end ? m >= r.start && m < r.end : m >= r.start || m < r.end);
}
/** One tick of the scheduler: enter a due mode, or leave a mode it entered itself once its window ends. */
export async function tickSchedule(now = new Date()) {
  const due = schedule.find((r) => ruleActive(r, now));
  if (due && !active) await enterMode(due.mode, true);
  else if (!due && active?.auto) await leaveMode();
}
