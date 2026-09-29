import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FileDown, Lock, Plus, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { saveTextFile } from "../lib/native";
import { contrast, saveLook, useLook } from "../lib/look";
import { playSound } from "./Sounds";
import { bytes } from "./DevTools";
import { Segmented, SettingRow, Switch } from "./SettingControls";

export interface GatewaySettingsView {
  failoverOrder: string[];
  instructions: { global: string; projects: Record<string, string> };
  protectedPaths: string[]; builtinProtected: string[];
  git: { branchPrefix: string; author: "shuacrew" | "me"; squash: boolean; protectedBranches: string[] };
  quietHours: { enabled: boolean; start: number; end: number };
  menuBar: "attention" | "running" | "tokens" | "off";
  flags: Record<string, boolean>;
}

let cache: GatewaySettingsView | null = null;
const listeners = new Set<(s: GatewaySettingsView) => void>();
/** Settings the gateway enforces. One shared copy; saving returns the validated result or an error. */
export function useGatewaySettings() {
  const [value, setValue] = useState<GatewaySettingsView | null>(cache);
  const [error, setError] = useState("");
  useEffect(() => {
    listeners.add(setValue);
    const fetchNow = () => void api<GatewaySettingsView>("/api/settings").then((s) => { cache = s; listeners.forEach((l) => l(s)); }).catch((e: Error) => setError(e.message));
    if (!cache) fetchNow();
    // Modes and other features change gateway settings too; stay in step.
    window.addEventListener("shuacrew:settings", fetchNow);
    return () => { listeners.delete(setValue); window.removeEventListener("shuacrew:settings", fetchNow); };
  }, []);
  const save = useCallback(async (patch: Partial<Omit<GatewaySettingsView, "builtinProtected">> | Record<string, unknown>) => {
    setError("");
    try {
      const next = await api<GatewaySettingsView>("/api/settings", { body: patch });
      cache = { ...next, builtinProtected: cache?.builtinProtected ?? [] };
      listeners.forEach((l) => l(cache!));
      return true;
    } catch (e) { setError((e as Error).message.replace(/^\d+\s*/, "")); return false; }
  }, []);
  return { value, save, error };
}
export function useFlag(name: string) { const { value } = useGatewaySettings(); return value?.flags[name] === true; }

const Err = ({ text }: { text: string }) => (text ? <p role="alert" className="power-hint" style={{ color: "var(--bad)" }}>{text}</p> : null);
const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minutes = (t: string) => { const [h, m] = t.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };

export function FailoverSettings() {
  const { value, save, error } = useGatewaySettings();
  const [runtimes, setRuntimes] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => { void api<Array<{ id: string; label: string }>>("/api/runtimes").then(setRuntimes).catch(() => undefined); }, []);
  if (!value) return null;
  const order = [...value.failoverOrder.filter((id) => runtimes.some((r) => r.id === id)), ...runtimes.map((r) => r.id).filter((id) => !value.failoverOrder.includes(id))];
  const move = (i: number, d: number) => { const next = [...order]; [next[i], next[i + d]] = [next[i + d]!, next[i]!]; void save({ failoverOrder: next }); };
  return <div className="settings-card">
    <p className="power-hint" style={{ paddingTop: 14 }}>When an agent hits its usage limit, a waiting session moves to the next one down. Another model on the same agent is tried first.</p>
    <ol className="batch-order">{order.map((id, i) => <li key={id}><span className="batch-rank">{i + 1}</span><strong>{runtimes.find((r) => r.id === id)?.label ?? id}</strong>
      <button type="button" aria-label={`Move ${id} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
      <button type="button" aria-label={`Move ${id} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button></li>)}</ol>
    <Err text={error} />
  </div>;
}

export function InstructionsSettings() {
  const { value, save, error } = useGatewaySettings();
  const [global, setGlobal] = useState<string | null>(null);
  const [repo, setRepo] = useState(""), [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  if (!value) return null;
  const projects = Object.entries(value.instructions.projects);
  return <div className="settings-card batch-pad">
    <label className="power-prefix" style={{ padding: 0 }}><span>Every agent, every session</span>
      <textarea rows={4} maxLength={8000} value={global ?? value.instructions.global} placeholder="e.g. Keep answers short. Run the tests before saying something works. Never commit without asking." onChange={(e) => setGlobal(e.target.value)} onBlur={() => global !== null && global !== value.instructions.global && void save({ instructions: { global } })} /></label>
    <div className="batch-sub">Per project</div>
    {projects.map(([p, t]) => <div className="batch-project" key={p}><code>{p}</code><p>{t}</p><button type="button" className="power-icon" aria-label={`Remove instructions for ${p}`} onClick={() => { const next = { ...value.instructions.projects }; delete next[p]; void save({ instructions: { projects: next } }); }}><Trash2 size={14} /></button></div>)}
    <form className="batch-project-new" onSubmit={(e) => { e.preventDefault(); if (!repo.trim().startsWith("/") || !text.trim()) return; void save({ instructions: { projects: { ...value.instructions.projects, [repo.trim()]: text.trim() } } }).then((ok) => ok && (setRepo(""), setText(""))); }}>
      <input className="setting-input" style={{ width: "100%" }} placeholder="/Users/you/Developer/projects/app" value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="Project folder" />
      <textarea rows={2} placeholder="e.g. Use pnpm. SwiftUI only. Tests live in Tests/." value={text} onChange={(e) => setText(e.target.value)} aria-label="Project instructions" />
      <button className="settings-reset" disabled={!repo.trim().startsWith("/") || !text.trim()}><Plus size={13} /> Add project</button>
    </form>
    <button type="button" className="settings-reset" onClick={() => void api<{ text: string }>(`/api/settings/instructions-preview${projects[0] ? `?repo=${encodeURIComponent(projects[0][0])}` : ""}`).then((r) => setPreview(r.text))}>Preview what an agent receives</button>
    {preview !== null && <pre className="batch-preview">{preview || "Nothing yet — add instructions above."}<button type="button" aria-label="Close preview" onClick={() => setPreview(null)}><X size={13} /></button></pre>}
    <Err text={error} />
  </div>;
}

export function SafetySettings() {
  const { value, save, error } = useGatewaySettings();
  const [path, setPath] = useState(""), [branch, setBranch] = useState("");
  if (!value) return null;
  return <div className="settings-card batch-pad">
    <div className="batch-sub">Folders agents can never read or change</div>
    <ul className="batch-chips">
      {value.builtinProtected.map((p) => <li key={p} className="is-locked" title="Built in — always protected"><Lock size={11} />{p.replace(/^\/Users\/[^/]+/, "~")}</li>)}
      {value.protectedPaths.map((p) => <li key={p}>{p}<button type="button" aria-label={`Unprotect ${p}`} onClick={() => void save({ protectedPaths: value.protectedPaths.filter((x) => x !== p) })}><X size={11} /></button></li>)}
    </ul>
    <form className="batch-inline" onSubmit={(e) => { e.preventDefault(); void save({ protectedPaths: [...value.protectedPaths, path.trim()] }).then((ok) => ok && setPath("")); }}>
      <input className="setting-input" style={{ flex: 1, width: "auto" }} placeholder="~/Documents/private or /absolute/path" value={path} onChange={(e) => setPath(e.target.value)} aria-label="Folder to protect" />
      <button className="settings-reset" disabled={!path.trim()}><Plus size={13} /> Protect</button>
    </form>
    <div className="batch-sub">Branches agents must never push to directly</div>
    <ul className="batch-chips">{value.git.protectedBranches.map((b) => <li key={b}>{b}{!["main", "master"].includes(b) && <button type="button" aria-label={`Unprotect ${b}`} onClick={() => void save({ git: { protectedBranches: value.git.protectedBranches.filter((x) => x !== b) } })}><X size={11} /></button>}</li>)}</ul>
    <form className="batch-inline" onSubmit={(e) => { e.preventDefault(); void save({ git: { protectedBranches: [...value.git.protectedBranches, branch.trim()] } }).then((ok) => ok && setBranch("")); }}>
      <input className="setting-input" style={{ flex: 1, width: "auto" }} placeholder="staging" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch to protect" />
      <button className="settings-reset" disabled={!branch.trim()}><Plus size={13} /> Protect</button>
    </form>
    <Err text={error} />
  </div>;
}

export function GitSettings() {
  const { value, save, error } = useGatewaySettings();
  const [prefix, setPrefix] = useState<string | null>(null);
  if (!value) return null;
  return <div className="settings-card">
    <SettingRow name="Branch prefix" detail={`New session branches look like ${(prefix ?? value.git.branchPrefix)}r_1a2b3c4d.`} modified={value.git.branchPrefix !== "shua/"}>
      <input className="setting-input" aria-label="Branch prefix" value={prefix ?? value.git.branchPrefix} onChange={(e) => setPrefix(e.target.value)} onBlur={() => prefix !== null && prefix !== value.git.branchPrefix && void save({ git: { branchPrefix: prefix } }).then((ok) => !ok && setPrefix(null))} />
    </SettingRow>
    <SettingRow name="Commit as" detail="“Me” uses your own git name and email (falls back to ShuaCrew if you have none set)." modified={value.git.author !== "shuacrew"}>
      <Segmented label="Commit author" value={value.git.author} onChange={(author) => void save({ git: { author } })} options={[["shuacrew", "ShuaCrew"], ["me", "Me"]]} />
    </SettingRow>
    <SettingRow name="Squash on merge" detail="Land a session as one commit named after it, instead of every checkpoint." modified={value.git.squash}>
      <Switch label="Squash on merge" on={value.git.squash} onChange={(squash) => void save({ git: { squash } })} />
    </SettingRow>
    <Err text={error} />
  </div>;
}

export function QuietHoursSettings() {
  const { value, save, error } = useGatewaySettings();
  if (!value) return null;
  const q = value.quietHours;
  return <div className="settings-card">
    <SettingRow name="Quiet hours for automation" detail="Schedules, webhooks and heartbeats wait in the queue and start when quiet hours end. Nothing is skipped; your own sessions always run." modified={q.enabled}>
      <Switch label="Quiet hours" on={q.enabled} onChange={(enabled) => void save({ quietHours: { enabled } })} />
    </SettingRow>
    {q.enabled && <SettingRow name="From – to" detail="Local time. Can cross midnight.">
      <input type="time" className="setting-input" aria-label="Quiet from" value={time(q.start)} onChange={(e) => void save({ quietHours: { start: minutes(e.target.value) } })} />
      <input type="time" className="setting-input" aria-label="Quiet until" value={time(q.end)} onChange={(e) => void save({ quietHours: { end: minutes(e.target.value) } })} />
    </SettingRow>}
    <Err text={error} />
  </div>;
}

export function MenuBarSettings() {
  const { value, save, error } = useGatewaySettings();
  if (!value) return null;
  return <div className="settings-card">
    <SettingRow name="Beside the menu-bar icon" detail="What needs you always shows first — except when set to Off." modified={value.menuBar !== "attention"}>
      <Segmented label="Menu bar shows" value={value.menuBar} onChange={(menuBar) => void save({ menuBar })} options={[["attention", "Needs you"], ["running", "Running"], ["tokens", "Tokens"], ["off", "Off"]]} />
    </SettingRow>
    <Err text={error} />
  </div>;
}

export function LookSettings() {
  const look = useLook();
  return <div className="settings-card">
    <SettingRow name="Living background" detail="A slow aurora behind everything. GPU-only; stops for reduced motion." modified={look.livingBackground}><Switch label="Living background" on={look.livingBackground} onChange={(livingBackground) => saveLook({ livingBackground })} /></SettingRow>
    <SettingRow name="Interface font" modified={look.uiFont !== "geist"}><Segmented label="Interface font" value={look.uiFont} onChange={(uiFont) => saveLook({ uiFont })} options={[["geist", "Space Grotesk"], ["system", "SF Pro"]]} /></SettingRow>
    <SettingRow name="Reading font" detail="For agent replies and documents." modified={look.readingFont !== "sans"}><Segmented label="Reading font" value={look.readingFont} onChange={(readingFont) => saveLook({ readingFont })} options={[["sans", "Sans"], ["serif", "New York"]]} /></SettingRow>
    <SettingRow name="Code font" modified={look.monoFont !== "jetbrains"}><Segmented label="Code font" value={look.monoFont} onChange={(monoFont) => saveLook({ monoFont })} options={[["jetbrains", "JetBrains"], ["sf-mono", "SF Mono"], ["menlo", "Menlo"]]} /></SettingRow>
    <SettingRow name="Ligatures" detail="Join => and != into single glyphs in code." modified={!look.ligatures}><Switch label="Ligatures" on={look.ligatures} onChange={(ligatures) => saveLook({ ligatures })} /></SettingRow>
    <SettingRow name="Your messages" modified={look.chatStyle !== "bubbles"}><Segmented label="Message style" value={look.chatStyle} onChange={(chatStyle) => saveLook({ chatStyle })} options={[["bubbles", "Bubbles"], ["document", "Document"]]} /></SettingRow>
    <SettingRow name="Conversation width" modified={look.chatWidth !== "default"}><Segmented label="Conversation width" value={look.chatWidth} onChange={(chatWidth) => saveLook({ chatWidth })} options={[["narrow", "Narrow"], ["default", "Default"], ["wide", "Wide"]]} /></SettingRow>
    <SettingRow name="Timestamps & actions" detail="In crew rooms." modified={look.timestamps !== "hover"}><Segmented label="Timestamps" value={look.timestamps} onChange={(timestamps) => saveLook({ timestamps })} options={[["hover", "On hover"], ["always", "Always"]]} /></SettingRow>
  </div>;
}

export function SoundSettings() {
  const { sounds } = useLook();
  const row = (kind: "approval" | "done" | "failed", name: string, detail: string) => <SettingRow name={name} detail={detail} modified={sounds[kind]}>
    <button type="button" className="settings-reset" onClick={() => playSound(kind, sounds.volume)}>Play</button>
    <Switch label={name} on={sounds[kind]} onChange={(on) => saveLook({ sounds: { ...sounds, [kind]: on } })} />
  </SettingRow>;
  return <div className="settings-card">
    {row("approval", "Needs your approval", "A double tap when an agent asks before a risky action.")}
    {row("done", "Session finished", "A rising chime.")}
    {row("failed", "Session failed", "A low two-note cue.")}
    <SettingRow name="Volume"><input type="range" min={0} max={1} step={0.05} value={sounds.volume} aria-label="Sound volume" onChange={(e) => saveLook({ sounds: { ...sounds, volume: Number(e.target.value) } })} /></SettingRow>
  </div>;
}

export function SpeechStorageSettings() {
  const [data, setData] = useState<Array<{ id: string; label: string; detail: string; bytes: number; inUse: boolean; removable: boolean }> | null>(null);
  const [notice, setNotice] = useState(""), [confirm, setConfirm] = useState("");
  useEffect(() => { void api<{ components: NonNullable<typeof data> }>("/api/speech/storage").then((r) => setData(r.components)).catch(() => setData([])); }, []);
  const clean = async (id: string) => {
    const r = await api<{ freed: number; components: NonNullable<typeof data> }>("/api/speech/storage/clean", { body: { id } });
    setData(r.components); setConfirm(""); setNotice(`Freed ${bytes(r.freed)}.`);
  };
  return <div className="settings-card">
    {data?.map((c) => <SettingRow key={c.id} name={`${c.label} · ${bytes(c.bytes)}`} detail={c.detail}>
      {c.inUse ? <span className="batch-tag">In use</span> : c.removable ? (confirm === c.id
        ? <><button type="button" className="settings-reset" onClick={() => setConfirm("")}>Keep</button><button type="button" className="settings-reset batch-danger" onClick={() => void clean(c.id)}>Delete {bytes(c.bytes)}</button></>
        : <button type="button" className="settings-reset" onClick={() => setConfirm(c.id)}><Trash2 size={13} /> Remove</button>) : null}
    </SettingRow>)}
    {data && !data.length && <p className="power-hint" style={{ paddingTop: 14 }}>No local speech components installed.</p>}
    {notice && <p role="status" className="power-hint">{notice}</p>}
  </div>;
}

const FLAGS: Array<[string, string, string]> = [
  ["room-reply-timing", "Reply timing in rooms", "Show how long each crew reply took, from the recorded timestamps."],
  ["rooms-no-autoscroll", "Don't auto-scroll rooms", "Stay where you are when new messages arrive."],
];
export function FlagSettings() {
  const { value, save, error } = useGatewaySettings();
  if (!value) return null;
  return <div className="settings-card">
    {FLAGS.map(([id, name, detail]) => <SettingRow key={id} name={name} detail={detail} modified={value.flags[id] === true}><span className="batch-tag">Experimental</span><Switch label={name} on={value.flags[id] === true} onChange={(on) => void save({ flags: { ...value.flags, [id]: on } })} /></SettingRow>)}
    <Err text={error} />
  </div>;
}

export function DiagnosticsSettings() {
  const [notice, setNotice] = useState("");
  return <div className="settings-card">
    <SettingRow name="Debug report" detail="Versions, health, audit check, settings shape and the last 200 log lines — redacted. No prompts, no instructions text, no keys.">
      <button type="button" className="settings-reset" onClick={() => void api<unknown>("/api/dev/diagnostics").then((r) => { saveTextFile(`shuacrew-diagnostics-${new Date().toISOString().slice(0, 16).replace(":", "")}.json`, JSON.stringify(r, null, 2)); setNotice("Report ready — choose where to save it."); }).catch((e: Error) => setNotice(e.message))}><FileDown size={13} /> Save report</button>
    </SettingRow>
    {notice && <p role="status" className="power-hint">{notice}</p>}
  </div>;
}
