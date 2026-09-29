import { useState } from "react";
import { Companion, FocusTimerControl } from "./Companion";
import { parseCompanion, saveCompanion, useCompanion, type CompanionPreferences } from "../lib/companion";

export function CompanionSettings() {
  const preferences = useCompanion();
  const [notice, setNotice] = useState("");
  const set = (patch: Partial<CompanionPreferences>) => { setNotice(saveCompanion({ ...preferences, ...patch }) ? "Saved on this Mac. Agent permissions are unchanged." : "Storage unavailable. This change lasts only in this app session."); };
  const choices = <K extends keyof CompanionPreferences>(field: K, label: string, values: readonly string[]) => <label className="preference-row"><span><strong>{label}</strong></span><select value={String(preferences[field])} onChange={e => set({ [field]: e.target.value })}>{values.map(value => <option key={value} value={value}>{value.replaceAll("-", " ")}</option>)}</select></label>;
  return <div className="settings-card">
    <label className="preference-row"><span><strong>Enable your companion</strong><small>Original Spark artwork, real crew state. No extra AI calls, permissions or desktop overlay.</small></span><input type="checkbox" checked={preferences.enabled} onChange={e => set({ enabled: e.target.checked })} /></label>
    <div className="px-5 pb-5">
      <div className="companion-preview"><small>ISOLATED PREVIEW · NOT LIVE WORK</small><Companion preferences={{ ...preferences, enabled: true }} pose="idle" decisions={0} openDecisions={() => setNotice("Preview only. The workspace control opens Today.")} openCrew={() => setNotice("Preview only. The workspace control opens your crew.")} startFocus={() => setNotice("Preview only. Choose a real focus duration below to start a timer.")} /></div>
      <div className="companion-controls" aria-label="Presentation presets"><button onClick={() => set({ presence: "interaction", celebration: "off", sound: false })}>Quiet</button><button onClick={() => set({ presence: "subtle", celebration: "subtle", sound: false })}>Balanced</button><button onClick={() => set({ presence: "playful", celebration: "expressive", sound: false })}>Playful</button></div>
      <label className="preference-row"><span><strong>Nickname</strong><small>Local decoration only, never an agent instruction.</small></span><input aria-label="Companion nickname" value={preferences.nickname} maxLength={40} onChange={e => set({ nickname: e.target.value })} /></label>
      {choices("kind", "Companion", ["spark", "crew"])}
      {choices("face", "Expression", ["calm", "curious", "bright"])}
      {choices("accessory", "Accessory", ["none", "cap", "headphones", "scarf", "glasses", "antenna", "badge"])}
      {choices("presence", "Presence", ["interaction", "subtle", "playful"])}
      {choices("placement", "Show companion", ["corner", "room-header"])}
      <p className="text-[12px] text-fg-3">The companion uses reserved space, never covers your composer or approval controls. Room placement limits it to Crew Rooms.</p>
      {choices("celebration", "New-completion response", ["off", "subtle", "expressive"])}
      <button className="settings-reset" onClick={() => { saveCompanion(parseCompanion(null)); setNotice("Companion section reset. Other settings are unchanged."); }}>Reset companion section</button>
      <p role="status" className="my-3 text-[12px] text-fg-3">{notice}</p>
      <h3 className="mb-3 text-[15px] font-semibold">Focus, at your pace</h3><FocusTimerControl />
    </div>
  </div>;
}
