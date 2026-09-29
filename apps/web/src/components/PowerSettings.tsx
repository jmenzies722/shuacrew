import { useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { isSnippetName, savePower, usePower, type Preset, type Snippet } from "../lib/power";
import { Segmented, SettingRow, Switch } from "./SettingControls";

/** Your own /commands. */
export function SnippetSettings() {
  const { snippets } = usePower();
  const [name, setName] = useState(""), [text, setText] = useState("");
  const taken = snippets.some((s) => s.name === name);
  const valid = isSnippetName(name) && !taken && text.trim().length > 0;
  const update = (i: number, patch: Partial<Snippet>) => savePower({ snippets: snippets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return <div className="settings-card power-list">
    {snippets.map((s, i) => <div className="power-item" key={s.name}>
      <code className="power-slash">/{s.name}</code>
      <textarea aria-label={`Text for /${s.name}`} rows={2} defaultValue={s.text} onBlur={(e) => e.target.value.trim() && e.target.value !== s.text && update(i, { text: e.target.value })} />
      <button type="button" className="power-icon" aria-label={`Delete /${s.name}`} onClick={() => savePower({ snippets: snippets.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
    </div>)}
    <form className="power-item power-new" onSubmit={(e) => { e.preventDefault(); if (!valid) return; savePower({ snippets: [...snippets, { name, text: text.trim() }] }); setName(""); setText(""); }}>
      <label className="power-slash-input"><span>/</span><input aria-label="New snippet name" placeholder="name" value={name} maxLength={24} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} /></label>
      <textarea aria-label="New snippet text" rows={2} placeholder="What typing /name should insert…" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="power-icon is-add" disabled={!valid} aria-label="Add snippet"><Plus size={15} /></button>
    </form>
    <p className="power-hint">{name && !isSnippetName(name) ? "Use lowercase letters, numbers and dashes; built-in commands like /skill and /task are reserved." : taken ? `/${name} already exists.` : "Type / in any new session to use them."}</p>
  </div>;
}

/** One-click launch setups shown above a new session's composer. */
export function PresetSettings() {
  const { presets } = usePower();
  const update = (id: string, patch: Partial<Preset>) => savePower({ presets: presets.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const add = () => savePower({ presets: [...presets, { id: `p${Date.now().toString(36)}`, label: "New preset", runtime: "", model: "", effort: "", autopilot: false, task: false, prefix: "" }] });
  return <div className="power-presets">
    {presets.map((p) => <div className="settings-card power-preset" key={p.id}>
      <header><Zap size={14} /><input aria-label="Preset name" defaultValue={p.label} maxLength={32} onBlur={(e) => e.target.value.trim() && update(p.id, { label: e.target.value.trim() })} />
        <button type="button" className="power-icon" aria-label={`Delete ${p.label}`} onClick={() => savePower({ presets: presets.filter((x) => x.id !== p.id) })}><Trash2 size={14} /></button></header>
      <SettingRow name="Effort"><Segmented label={`${p.label} effort`} value={p.effort} onChange={(effort) => update(p.id, { effort })} options={[["", "Auto"], ["low", "Low"], ["medium", "Med"], ["high", "High"], ["max", "Max"]]} /></SettingRow>
      <SettingRow name="Mode"><Segmented label={`${p.label} mode`} value={p.autopilot ? "auto" : "ask"} onChange={(v) => update(p.id, { autopilot: v === "auto" })} options={[["ask", "Supervised"], ["auto", "Autopilot"]]} /></SettingRow>
      <SettingRow name="Plan as a task"><Switch label={`${p.label} as task`} on={p.task} onChange={(task) => update(p.id, { task })} /></SettingRow>
      <label className="power-prefix"><span>Starts the prompt with</span><textarea rows={2} defaultValue={p.prefix} placeholder="Optional — e.g. “Research this and cite every claim: ”" onBlur={(e) => e.target.value !== p.prefix && update(p.id, { prefix: e.target.value })} /></label>
    </div>)}
    {presets.length < 12 && <button type="button" className="power-add-preset" onClick={add}><Plus size={14} /> Add a preset</button>}
  </div>;
}

export function FlowAndWins() {
  const { flow, wins, winSound } = usePower();
  return <div className="settings-card">
    <SettingRow name="Flow mode" detail="Just the work: hides the rail, top bar and side panels. ⌘⇧F toggles it from anywhere." modified={flow}>
      <Switch label="Flow mode" on={flow} onChange={(v) => savePower({ flow: v })} />
    </SettingRow>
    <SettingRow name="Celebrate wins" detail="When a session you started finishes or merges while you're here. History never celebrates." modified={wins !== "off"}>
      <Segmented label="Celebrate wins" value={wins} onChange={(v) => savePower({ wins: v })} options={[["off", "Off"], ["subtle", "Subtle"], ["party", "Party"]]} />
    </SettingRow>
    <SettingRow name="Win chime" detail="A short two-note chime with the celebration." modified={winSound}>
      <Switch label="Win chime" on={winSound} onChange={(v) => savePower({ winSound: v })} />
    </SettingRow>
  </div>;
}
