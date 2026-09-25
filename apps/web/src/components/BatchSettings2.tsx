import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { playScape, scapePlaying, setScapeVolume, stopScape, type Scape } from "../lib/soundscape";
import { usePower } from "../lib/power";
import { useGatewaySettings } from "./BatchSettings";
import { Segmented, SettingRow, Switch } from "./SettingControls";

type Rule = { name: string; match: string; runtime: string; model: string; effort: "" | "low" | "medium" | "high" | "max" };
interface RuntimeInfo { id: string; label: string; models: Array<{ id: string; label: string; unavailable?: string }> }
const Err = ({ text }: { text: string }) => (text ? <p role="alert" className="power-hint" style={{ color: "var(--bad)" }}>{text}</p> : null);

/** "If the prompt mentions …, use …" — only when agent and model were left on Auto. */
export function RouterSettings() {
  const { value, save, error } = useGatewaySettings();
  const [runtimes, setRuntimes] = useState<RuntimeInfo[]>([]);
  const [draft, setDraft] = useState<Rule>({ name: "", match: "", runtime: "", model: "", effort: "" });
  const [probe, setProbe] = useState("");
  useEffect(() => { void api<RuntimeInfo[]>("/api/runtimes").then(setRuntimes).catch(() => undefined); }, []);
  if (!value) return null;
  const rules = (value as unknown as { router: Rule[] }).router ?? [];
  const models = (rt: string) => (runtimes.find((r) => r.id === rt) ?? { models: runtimes.flatMap((r) => r.models) }).models;
  const hit = probe.trim() ? rules.find((r) => r.match.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean).some((k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(probe.toLowerCase()))) : undefined;
  return <div className="settings-card batch-pad">
    <p className="power-hint" style={{ padding: 0 }}>Applied only when a new session is left on Auto agent and Auto model. First match wins; a crew member or your explicit choice always wins.</p>
    {rules.map((r, i) => <div className="router-rule" key={`${r.name}-${i}`}>
      <strong>{r.name}</strong><span>mentions <code>{r.match}</code></span><span>→ {[r.runtime || "auto agent", r.model || "auto model", r.effort || "auto effort"].join(" · ")}</span>
      <button type="button" className="power-icon" aria-label={`Delete rule ${r.name}`} onClick={() => void save({ router: rules.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
    </div>)}
    <form className="router-new" onSubmit={(e) => { e.preventDefault(); void save({ router: [...rules, draft] }).then((ok) => ok && setDraft({ name: "", match: "", runtime: "", model: "", effort: "" })); }}>
      <input className="setting-input" placeholder="Rule name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Rule name" />
      <input className="setting-input" placeholder="test, flaky, lint" value={draft.match} onChange={(e) => setDraft({ ...draft, match: e.target.value })} aria-label="Keywords" />
      <select className="setting-input" value={draft.runtime} onChange={(e) => setDraft({ ...draft, runtime: e.target.value, model: "" })} aria-label="Agent"><option value="">Auto agent</option>{runtimes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      <select className="setting-input" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} aria-label="Model"><option value="">Auto model</option>{models(draft.runtime).filter((m) => !m.unavailable).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
      <select className="setting-input" value={draft.effort} onChange={(e) => setDraft({ ...draft, effort: e.target.value as Rule["effort"] })} aria-label="Effort"><option value="">Auto effort</option>{["low", "medium", "high", "max"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
      <button className="settings-reset" disabled={!draft.name.trim() || !draft.match.trim()}><Plus size={13} /> Add rule</button>
    </form>
    <label className="router-probe"><span>Try a prompt</span><input className="setting-input" placeholder="Fix the flaky upload test" value={probe} onChange={(e) => setProbe(e.target.value)} />
      <small>{probe.trim() ? (hit ? `→ rule “${hit.name}”: ${[hit.runtime || "auto agent", hit.model || "auto model", hit.effort || "auto effort"].join(" · ")}` : "→ no rule matches; Auto decides") : ""}</small></label>
    <Err text={error} />
  </div>;
}

const MINUTES: Array<[string, number | null]> = [["Off", null], ["15m", 15], ["30m", 30], ["1h", 60], ["2h", 120]];
const TOKENS: Array<[string, number | null]> = [["Off", null], ["100k", 100_000], ["250k", 250_000], ["500k", 500_000], ["1M", 1_000_000]];
export function CapsSettings() {
  const { value, save, error } = useGatewaySettings();
  if (!value) return null;
  const caps = (value as unknown as { caps: { maxMinutes: number | null; maxTokens: number | null } }).caps;
  return <div className="settings-card">
    <SettingRow name="Stop a session after" detail="Stops that stretch of work cleanly with a note. Send a follow-up to continue — the conversation is kept." modified={caps.maxMinutes !== null}>
      <Segmented label="Time cap" value={MINUTES.find(([, n]) => n === caps.maxMinutes)?.[0] ?? "Off"} onChange={(k) => void save({ caps: { maxMinutes: MINUTES.find(([id]) => id === k)![1] } })} options={MINUTES.map(([id]) => [id, id])} />
    </SettingRow>
    <SettingRow name="…or after this many tokens" detail="Recorded input + output for that session." modified={caps.maxTokens !== null}>
      <Segmented label="Token cap" value={TOKENS.find(([, n]) => n === caps.maxTokens)?.[0] ?? "Off"} onChange={(k) => void save({ caps: { maxTokens: TOKENS.find(([id]) => id === k)![1] } })} options={TOKENS.map(([id]) => [id, id])} />
    </SettingRow>
    <Err text={error} />
  </div>;
}

export function HooksSettings() {
  const { value, save, error } = useGatewaySettings();
  const [drafts, setDrafts] = useState<{ onDone?: string; onFailed?: string }>({});
  if (!value) return null;
  const hooks = (value as unknown as { hooks: { onDone: string; onFailed: string } }).hooks;
  const field = (key: "onDone" | "onFailed", label: string, example: string) => <label className="power-prefix" style={{ padding: 0 }}><span>{label}</span>
    <textarea rows={2} spellCheck={false} style={{ fontFamily: "var(--font-mono)" }} placeholder={example} value={drafts[key] ?? hooks[key]} onChange={(e) => setDrafts({ ...drafts, [key]: e.target.value })} onBlur={() => drafts[key] !== undefined && drafts[key] !== hooks[key] && void save({ hooks: { [key]: drafts[key] } })} /></label>;
  return <div className="settings-card batch-pad">
    <p className="power-hint" style={{ padding: 0 }}>Your own shell command, run on this Mac when a session you started ends (not for delegated steps). 60-second limit. Available: <code>$SHUA_RUN_ID</code> <code>$SHUA_STATUS</code> <code>$SHUA_TITLE</code> <code>$SHUA_REPO</code>.</p>
    {field("onDone", "When a session finishes", `osascript -e 'display notification "$SHUA_TITLE" with title "Done"'`)}
    {field("onFailed", "When a session fails", `echo "$(date) $SHUA_RUN_ID $SHUA_TITLE" >> ~/shua-failures.log`)}
    <Err text={error} />
  </div>;
}

export function SoundscapeSettings() {
  const [scape, setScape] = useState<Scape>(scapePlaying());
  const [volume, setVolume] = useState(0.5);
  const { flow } = usePower();
  useEffect(() => () => { /* keep playing across navigation; stop explicitly */ }, []);
  return <div className="settings-card">
    <SettingRow name="Focus soundscape" detail={`Generated live on this Mac — nothing downloaded. Plays until you stop it${flow ? " · Flow mode is on" : ""}.`} modified={scape !== "off"}>
      <Segmented label="Soundscape" value={scape} onChange={(s) => { playScape(s, volume); setScape(s); }} options={[["off", "Off"], ["brown", "Brown noise"], ["rain", "Rain"], ["cafe", "Café"]]} />
    </SettingRow>
    <SettingRow name="Soundscape volume">
      <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Soundscape volume" onChange={(e) => { const v = Number(e.target.value); setVolume(v); setScapeVolume(v); }} />
      {scape !== "off" && <Switch label="Stop soundscape" on onChange={() => { stopScape(); setScape("off"); }} />}
    </SettingRow>
  </div>;
}

/** Developer → exactly what recent turns were sent. */
export function PromptInspector() {
  const [data, setData] = useState<{ runs: string[]; run: string | null; prompts: Array<{ at: number; turn: number; runtime: string; model?: string; effort?: string; resumed: boolean; system: string; ask: string; tools: string[] }> } | null>(null);
  const [run, setRun] = useState("");
  useEffect(() => { void api<NonNullable<typeof data>>(`/api/dev/prompts${run ? `?run=${encodeURIComponent(run)}` : ""}`).then(setData).catch(() => setData({ runs: [], run: null, prompts: [] })); }, [run]);
  if (!data) return <p className="dc-muted">Loading…</p>;
  if (!data.runs.length) return <p className="dc-muted">No prompts yet. Kept in memory for sessions that ran since the gateway last started (redacted, never saved to disk).</p>;
  return <div className="prompt-inspector">
    <select className="setting-input" style={{ width: "100%" }} aria-label="Session" value={data.run ?? ""} onChange={(e) => setRun(e.target.value)}>{data.runs.map((r) => <option key={r} value={r}>{r}</option>)}</select>
    {data.prompts.slice().reverse().map((p) => <details key={p.at} open>
      <summary>Turn {p.turn} · {p.runtime}{p.model ? ` · ${p.model}` : ""}{p.effort ? ` · ${p.effort}` : ""}{p.resumed ? " · resumed (instructions already in the conversation)" : ""} · {new Date(p.at).toLocaleTimeString()}</summary>
      {p.system && <><h4>Instructions ({p.system.length.toLocaleString()} chars)</h4><pre>{p.system}</pre></>}
      <h4>Message</h4><pre>{p.ask}</pre>
      {p.tools.length > 0 && <p className="dc-muted">MCP servers: {p.tools.join(", ")}</p>}
    </details>)}
  </div>;
}
