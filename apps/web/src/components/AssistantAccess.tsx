import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { X, Plug, ShieldCheck } from "lucide-react";
type Connector = { id: string; name: string; signedIn: boolean; spark?: boolean };
export function AssistantAccess({ screenEnabled, trusted, control, onScreen, onAccessibility, onControl, onClose, onManage }: {
  screenEnabled: boolean; trusted: boolean; control: "off" | "ask" | "auto"; onScreen: () => void; onAccessibility: () => void;
  onControl: (mode: "off" | "ask" | "auto") => void; onClose: () => void; onManage: () => void;
}) {
  const [connectors, setConnectors] = useState<Connector[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(true), [saving, setSaving] = useState<string | null>(null);
  useEffect(() => { let active = true; void api<Connector[]>("/api/mcp").then(value => { if (active) setConnectors(value); }, () => { if (active) setError("Could not load connected tools."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const toggle = async (connector: Connector) => {
    if (saving) return; setSaving(connector.id); setError("");
    try { const updated = await api<Connector>(`/api/mcp/${encodeURIComponent(connector.id)}/spark`, { body: { on: !connector.spark } }); setConnectors(items => items.map(item => item.id === updated.id ? updated : item)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not change tool access."); }
    finally { setSaving(null); }
  };
  return <section className="assistant-deck assistant-permissions" aria-label="Assistant permissions">
    <header className="assistant-deck-heading"><span><ShieldCheck size={13} /> ACCESS & TOOLS</span><button type="button" onClick={onClose} aria-label="Close access"><X size={14} /></button></header>
    <p>You choose the access. Shua chooses tools within it. macOS may ask separately for each app.</p>
    <div className="assistant-permission-row"><span>Screen<small>Capture when you ask; watch is a separate switch</small></span><button type="button" onClick={onScreen}>{screenEnabled ? "Turn off" : "Enable"}</button></div>
    <div className="assistant-permission-row"><span>Mouse & keyboard<small>{trusted ? "Accessibility granted" : "Accessibility permission required"}</small></span>{!trusted && <button type="button" onClick={onAccessibility}>Open permission</button>}</div>
    <label className="assistant-permission-row"><span>Action approval<small>Routine clicks and typing · Esc stops actions</small></span><select aria-label="Mac action approval" value={control} onChange={e => onControl(e.target.value as typeof control)}><option value="off">Control off</option><option value="ask">Ask each step</option><option value="auto">Autopilot</option></select></label>
    <div className="assistant-permission-row"><span>Music & apps<small>App-specific Automation access is requested when used</small></span></div>
    <div className="assistant-permission-title"><Plug size={12} /> Connected MCP tools <button type="button" onClick={onManage}>Manage</button></div>
    <p className="assistant-permission-note">Allow a connector below to let the companion choose its tools. Changes apply to new turns; stop active work before revoking access.</p>
    {loading ? <p>Checking connections…</p> : connectors.length === 0 ? <p>No MCP servers connected yet.</p> : connectors.map(c => <div className="assistant-permission-row" key={c.id}><span>{c.name}<small>{!c.signedIn ? "Sign-in required" : c.spark ? "Available to the companion" : "Not shared with the companion"}</small></span><button type="button" aria-pressed={!!c.spark} disabled={saving !== null || (!c.signedIn && !c.spark)} onClick={() => void toggle(c)}>{saving === c.id ? "Saving…" : c.spark ? "Revoke" : "Allow"}</button></div>)}
    {error && <p role="alert">{error}</p>}
    <footer>Protected work folders remain excluded.</footer>
  </section>;
}
