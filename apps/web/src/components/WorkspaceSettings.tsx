import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { api } from "../lib/api";
import { saveTextFile } from "../lib/native";
import { useLive } from "../lib/live";
import { formatTokens } from "@shuacrew/ui";
import { DEFAULT_WORKSPACE, budgetUse, saveWorkspace, useWorkspace } from "../lib/workspace-prefs";
import { exportPreferences, importPreferences } from "../lib/preferences-transfer";
import { Segmented, SettingRow, Switch } from "./SettingControls";

interface RuntimeInfo { id: string; label: string; models: Array<{ id: string; label: string; unavailable?: string }> }

/** What a brand-new session starts with. The composer can still change any of it per session. */
export function SessionDefaults() {
  const prefs = useWorkspace();
  const [runtimes, setRuntimes] = useState<RuntimeInfo[] | null>(null);
  useEffect(() => { void api<RuntimeInfo[]>("/api/runtimes").then(setRuntimes).catch(() => setRuntimes([])); }, []);
  const runtime = runtimes?.find((r) => r.id === prefs.runtime);
  // A saved agent that no longer exists stays visible as "unavailable" instead of silently switching.
  const missing = prefs.runtime && runtimes && !runtime;
  return <div className="settings-card">
    <SettingRow name="Agent" detail={missing ? `“${prefs.runtime}” isn't available right now — new sessions fall back to Auto.` : "Who picks up a new session. Auto routes to the best available agent."} modified={prefs.runtime !== ""}>
      <select className="setting-input" style={{ width: 170 }} aria-label="Default agent" value={prefs.runtime} onChange={(e) => saveWorkspace({ runtime: e.target.value, model: "" })}>
        <option value="">Auto</option>
        {runtimes?.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        {missing && <option value={prefs.runtime}>{prefs.runtime} (unavailable)</option>}
      </select>
    </SettingRow>
    <SettingRow name="Model" detail={runtime ? "Used when the chosen agent offers it." : "Pick an agent first to choose its model."} modified={prefs.model !== ""}>
      <select className="setting-input" style={{ width: 170 }} aria-label="Default model" disabled={!runtime} value={prefs.model} onChange={(e) => saveWorkspace({ model: e.target.value })}>
        <option value="">Auto</option>
        {runtime?.models.map((m) => <option key={m.id} value={m.id} disabled={!!m.unavailable}>{m.label}{m.unavailable ? " — unavailable" : ""}</option>)}
      </select>
    </SettingRow>
    <SettingRow name="Effort" detail="How hard the agent thinks before answering. Higher is slower and uses more of your plan." modified={prefs.effort !== ""}>
      <Segmented label="Default effort" value={prefs.effort} onChange={(effort) => saveWorkspace({ effort })} options={[["", "Auto"], ["low", "Low"], ["medium", "Med"], ["high", "High"], ["max", "Max"]]} />
    </SettingRow>
    <SettingRow name="Start in" detail="Supervised asks before risky actions; Autopilot lets them through. Deny rules always apply, in both." modified={prefs.autopilot}>
      <Segmented label="Default permission mode" value={prefs.autopilot ? "auto" : "ask"} onChange={(v) => saveWorkspace({ autopilot: v === "auto" })} options={[["ask", "Supervised"], ["auto", "Autopilot"]]} />
    </SettingRow>
    <SettingRow name="Plan as a task" detail="New sessions plan steps, check each one and checkpoint as they go." modified={prefs.task}>
      <Switch label="Plan new sessions as tasks" on={prefs.task} onChange={(task) => saveWorkspace({ task })} />
    </SettingRow>
  </div>;
}

const BUDGETS: Array<[string, number | null]> = [["Off", null], ["250k", 250_000], ["500k", 500_000], ["1M", 1_000_000], ["2M", 2_000_000], ["5M", 5_000_000]];

/** A soft daily limit: warns, never blocks. Uses recorded tokens — not your remaining subscription quota. */
export function BudgetSettings() {
  const prefs = useWorkspace();
  const today = useLive((s) => (s.crew.today.day === new Date().toISOString().slice(0, 10) ? s.crew.today.tokens : 0));
  const used = budgetUse(today, prefs.dailyTokenBudget);
  const key = BUDGETS.find(([, n]) => n === prefs.dailyTokenBudget)?.[0] ?? "custom";
  return <div className="settings-card">
    <SettingRow name="Daily token budget" detail="A soft limit. Past it, the top bar turns amber, then red at 2×. Nothing is blocked." modified={prefs.dailyTokenBudget !== DEFAULT_WORKSPACE.dailyTokenBudget}>
      <Segmented label="Daily token budget" value={key} onChange={(k) => saveWorkspace({ dailyTokenBudget: BUDGETS.find(([id]) => id === k)?.[1] ?? null })} options={BUDGETS.map(([id]) => [id, id])} />
    </SettingRow>
    {prefs.dailyTokenBudget && <>
      <p className="px-5 pb-2 text-[12px] text-fg-3">{formatTokens(today)} of {formatTokens(prefs.dailyTokenBudget)} recorded today (UTC) · {Math.round(used * 100)}%</p>
      <div className={`setting-meter${used >= 1 ? " is-over" : ""}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(used * 100))} aria-label="Budget used today"><span style={{ width: `${Math.min(100, used * 100)}%` }} /></div>
    </>}
  </div>;
}

/** Move your look-and-feel to another Mac. Never includes history, drafts, credentials or keys. */
export function PreferencesTransfer() {
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const download = () => {
    saveTextFile(`shuacrew-settings-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportPreferences(), null, 2));
    setNotice("Settings exported. The file has preferences only — no history, drafts or keys.");
  };
  const load = async (file: File) => {
    try {
      const applied = importPreferences(JSON.parse(await file.text()));
      setNotice(`Imported ${applied.length} group${applied.length === 1 ? "" : "s"} (${applied.join(", ")}). Reloading…`);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) { setNotice(`Couldn't import: ${(e as Error).message}. Nothing was changed.`); }
  };
  return <div className="settings-card">
    <SettingRow name="Export settings" detail="Appearance, companion, session defaults, budget, tool cards, voice and terminal — as one file.">
      <button type="button" className="settings-reset" onClick={download}><Download size={13} /> Export</button>
    </SettingRow>
    <SettingRow name="Import settings" detail="Replaces the groups in the file; anything invalid is ignored and falls back to its default.">
      <button type="button" className="settings-reset" onClick={() => input.current?.click()}><Upload size={13} /> Import…</button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} />
    </SettingRow>
    {notice && <p role="status" className="px-5 pb-4 text-[12px] text-fg-2">{notice}</p>}
  </div>;
}
