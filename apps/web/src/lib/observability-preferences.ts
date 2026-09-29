export type ObservabilityPreferences = { refreshSeconds: 0 | 5 | 15 | 30; days: 7 | 30 | 0 };
type StorageLike = Pick<Storage, "getItem" | "setItem">;
const KEY = "shuacrew.observability.v1";
export function parseObservabilityPreferences(value: unknown): ObservabilityPreferences {
  const v = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { refreshSeconds: [0, 5, 15, 30].includes(v.refreshSeconds as number) ? v.refreshSeconds as ObservabilityPreferences["refreshSeconds"] : 15, days: [0, 7, 30].includes(v.days as number) ? v.days as ObservabilityPreferences["days"] : 7 };
}
export function readObservabilityPreferences(storage?: StorageLike): ObservabilityPreferences {
  try { return parseObservabilityPreferences(JSON.parse((storage ?? localStorage).getItem(KEY) ?? "null")); } catch { return parseObservabilityPreferences(null); }
}
export function saveObservabilityPreferences(value: ObservabilityPreferences, storage?: StorageLike) {
  try { (storage ?? localStorage).setItem(KEY, JSON.stringify(parseObservabilityPreferences(value))); return true; } catch { return false; }
}
