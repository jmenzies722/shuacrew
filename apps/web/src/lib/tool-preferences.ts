import { useSyncExternalStore } from "react";
export interface ToolPreferences { density: "inherit" | "compact" | "comfortable"; showIcons: boolean; expandErrors: boolean }
export function parseToolPreferences(value: unknown): ToolPreferences {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { density: input.density === "compact" || input.density === "comfortable" ? input.density : "inherit", showIcons: input.showIcons !== false, expandErrors: input.expandErrors !== false };
}
function load() { try { return parseToolPreferences(JSON.parse(localStorage.getItem("shuacrew.toolCards") ?? "null")); } catch { return parseToolPreferences(null); } }
let value = load(); const listeners = new Set<() => void>();
export function saveToolPreferences(next: ToolPreferences) {
  value = parseToolPreferences(next); let saved = true;
  try { localStorage.setItem("shuacrew.toolCards", JSON.stringify(value)); } catch { saved = false; }
  listeners.forEach(listener => listener()); return saved;
}
export function useToolPreferences() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => value, () => value); }
