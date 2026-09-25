import { useState } from "react";
import { Copy, Moon, PiggyBank, Plus, Target, Trash2, Wand2 } from "lucide-react";
import { saveSchedule, useSchedule, type Mode, type ModeRule } from "../lib/modes";
import { encodeTheme, decodeTheme } from "../lib/theme-code";
import { getLook, saveLook, useLook } from "../lib/look";
import { useLive } from "../lib/live";
import { SettingRow } from "./SettingControls";

const NAMES: Record<Mode, { name: string; icon: typeof Target }> = { deep: { name: "Deep work", icon: Target }, saver: { name: "Cost saver", icon: PiggyBank }, wind: { name: "Wind down", icon: Moon } };
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };

/** Modes that switch themselves on and off. A mode you turned on by hand is never switched off by a schedule. */
export function ScheduleSettings() {
  const rules = useSchedule();
  const update = (i: number, patch: Partial<ModeRule>) => saveSchedule(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return <div className="settings-card batch-pad">
    <p className="power-hint" style={{ padding: 0 }}>Checked every 30 seconds while ShuaCrew is open. When the window ends, a scheduled mode restores exactly what it changed.</p>
    {rules.map((r, i) => { const N = NAMES[r.mode]; return <div className="sched-rule" key={i}>
      <select className="setting-input" value={r.mode} aria-label="Mode" onChange={(e) => update(i, { mode: e.target.value as Mode })}>{(Object.keys(NAMES) as Mode[]).map((m) => <option key={m} value={m}>{NAMES[m].name}</option>)}</select>
      <span className="sched-days" role="group" aria-label="Days">{DAYS.map((d, k) => <button key={k} type="button" aria-pressed={r.days.includes(k)} className={r.days.includes(k) ? "is-on" : ""} onClick={() => update(i, { days: r.days.includes(k) ? r.days.filter((x) => x !== k) : [...r.days, k].sort() })}>{d}</button>)}</span>
      <input type="time" className="setting-input" aria-label="From" value={hhmm(r.start)} onChange={(e) => update(i, { start: mins(e.target.value) })} />
      <span className="sched-to">to</span>
      <input type="time" className="setting-input" aria-label="Until" value={hhmm(r.end)} onChange={(e) => update(i, { end: mins(e.target.value) })} />
      <N.icon size={14} className="sched-icon" />
      <button type="button" className="power-icon" aria-label="Remove schedule" onClick={() => saveSchedule(rules.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
    </div>; })}
    <button type="button" className="settings-reset" style={{ alignSelf: "flex-start" }} onClick={() => saveSchedule([...rules, { mode: "deep", days: [1, 2, 3, 4, 5], start: 9 * 60, end: 12 * 60 }])}><Plus size={13} /> Add a schedule</button>
  </div>;
}

/** Share your look as a code; paste someone's code to try theirs (only valid values can be applied). */
export function ThemeShareSettings() {
  const appearance = useLive((s) => s.appearance), setAppearance = useLive((s) => s.setAppearance);
  const look = useLook();
  const [code, setCode] = useState(""), [notice, setNotice] = useState("");
  const mine = encodeTheme(appearance, look);
  return <div className="settings-card">
    <SettingRow name="Your look as a code" detail="Palette, accent, fonts and conversation style. Nothing private.">
      <code className="theme-code">{mine.slice(0, 22)}…</code>
      <button type="button" className="settings-reset" onClick={() => { void navigator.clipboard?.writeText(mine); setNotice("Copied — paste it anywhere."); }}><Copy size={12} /> Copy</button>
    </SettingRow>
    <SettingRow name="Try a code" detail="Applies instantly. Your previous look is in the time machine for app-side settings — or just paste your own code back.">
      <input className="setting-input" style={{ width: 200 }} placeholder="SHUA1-…" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Theme code" />
      <button type="button" className="settings-reset" disabled={!code.trim()} onClick={() => {
        try { const t = decodeTheme(code, { appearance, look: getLook() }); setAppearance(t.appearance); saveLook(t.look); setNotice(`Applied. Your old code: ${mine.slice(0, 18)}… (copied)`); void navigator.clipboard?.writeText(mine); setCode(""); }
        catch (e) { setNotice((e as Error).message); }
      }}><Wand2 size={12} /> Apply</button>
    </SettingRow>
    {notice && <p role="status" className="power-hint">{notice}</p>}
  </div>;
}
