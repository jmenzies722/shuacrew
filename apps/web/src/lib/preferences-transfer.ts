import { normalizeAppearance } from "./appearance";
import { parseCompanion } from "./companion";
import { parseToolPreferences } from "./tool-preferences";
import { normalizeVoicePreferences } from "./voice-preferences";
import { parseWorkspace } from "./workspace-prefs";

/** Each exportable group: its storage key, and the validator every imported value must pass through. */
const GROUPS: Record<string, { key: string; clean: (value: unknown) => unknown }> = {
  appearance: { key: "shuacrew.appearance", clean: normalizeAppearance },
  companion: { key: "shuacrew.companion", clean: parseCompanion },
  workspace: { key: "shuacrew.workspace", clean: parseWorkspace },
  toolCards: { key: "shuacrew.toolCards", clean: parseToolPreferences },
  voice: { key: "shuacrew.voiceConversation", clean: (v) => ({ ...normalizeVoicePreferences(v), version: 1 }) },
  diffSplit: { key: "shuacrew.diffSplit", clean: (v) => (v === "1" || v === "0" ? v : undefined) },
  terminalFont: { key: "shuacrew.terminalFont", clean: (v) => (typeof v === "string" && /^\d{1,2}$/.test(v) && +v >= 9 && +v <= 28 ? v : undefined) },
};
const RAW = new Set(["diffSplit", "terminalFont"]);

export interface PreferencesFile { app: "shuacrew"; kind: "preferences"; version: 1; exportedAt: string; groups: Record<string, unknown> }

export function exportPreferences(storage: Pick<Storage, "getItem"> = localStorage): PreferencesFile {
  const groups: Record<string, unknown> = {};
  for (const [name, { key }] of Object.entries(GROUPS)) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try { groups[name] = RAW.has(name) ? raw : JSON.parse(raw); } catch { /* unreadable local value: skip it */ }
  }
  return { app: "shuacrew", kind: "preferences", version: 1, exportedAt: new Date().toISOString(), groups };
}

/** Writes only known groups, each through its validator. Returns the names applied; throws if the file isn't ours. */
export function importPreferences(file: unknown, storage: Pick<Storage, "setItem"> = localStorage): string[] {
  const f = file as Partial<PreferencesFile> | null;
  if (!f || f.app !== "shuacrew" || f.kind !== "preferences" || f.version !== 1 || !f.groups || typeof f.groups !== "object") throw new Error("not a ShuaCrew settings file");
  const applied: string[] = [];
  for (const [name, value] of Object.entries(f.groups)) {
    const group = GROUPS[name]; if (!group) continue;
    const clean = group.clean(value); if (clean === undefined) continue;
    storage.setItem(group.key, RAW.has(name) ? String(clean) : JSON.stringify(clean));
    applied.push(name);
  }
  return applied;
}
