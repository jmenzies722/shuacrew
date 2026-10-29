import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../lib/api";

interface Server { id: string; name: string; url?: string; command?: string; args: string[]; auth: "none" | "oauth" | "gh"; signedIn: boolean; spark?: boolean; brand?: { assetId: string | null } }
interface Featured { id: string; name: string; title: string; category: string; blurb: string; auth: "none" | "oauth" | "gh"; added: string | null; brand?: { assetId: string | null } }
interface Conn { ok: boolean; tools: unknown[]; error?: string }
/** More tools than this, and switching a server on for Shua asks first: Shua's voice access skips approvals. */
const MANY_TOOLS = 40;

function Icon({ assetId, name }: { assetId?: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  return <span className="conn-icon">{assetId && !broken ? <img src={`/brands/${assetId}-dark.svg`} alt="" onError={() => setBroken(true)} /> : name.slice(0, 2).toUpperCase()}</span>;
}

export function Tools() {
  const [servers, setServers] = useState<Server[]>([]), [featured, setFeatured] = useState<Featured[]>([]), [known, setKnown] = useState<Record<string, Conn>>({});
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState(""), [q, setQ] = useState(""), [confirm, setConfirm] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [s, f, k] = await Promise.all([api<Server[]>("/api/mcp"), api<Featured[]>("/api/mcp/featured"), api<Record<string, Conn>>("/api/mcp/tools")]);
    setServers(s); setFeatured(f); setKnown(k);
  }, []);
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, [load]);
  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id); setError("");
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const check = (s: Server) => act(s.id, async () => { const c = await api<Conn>(`/api/mcp/${s.id}/tools?fresh=1`); setKnown((k) => ({ ...k, [s.id]: c })); });
  const setShua = (s: Server, on: boolean) => act(s.id, () => api(`/api/mcp/${s.id}/spark`, { body: { on } })).then(() => setConfirm(null));
  const add = (f: Featured) => act(f.id, async () => {
    const s = await api<Server>(`/api/mcp/featured/${f.id}`, { body: {} });
    if (f.auth === "oauth" && !s.signedIn) await api(`/api/mcp/${s.id}/signin`, { body: {} });
    if (f.auth === "gh" && !s.signedIn) throw new Error("Added. It uses your GitHub CLI login: run `gh auth login` in Terminal, then press Check.");
  });
  const shuaOn = servers.filter((s) => s.spark).length;
  const catalog = useMemo(() => featured.filter((f) => !f.added && (!q || `${f.title} ${f.blurb} ${f.category}`.toLowerCase().includes(q.toLowerCase()))), [featured, q]);

  return (
    <div className="page">
      <div className="page-head"><h1>Tools</h1><p>{servers.length} connected · Shua uses {shuaOn}</p></div>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="conns">
        {servers.map((s) => {
          const c = known[s.id], count = c?.ok ? c.tools.length : undefined, signIn = !s.signedIn && s.auth === "oauth";
          return (
            <article key={s.id} className="conn">
              <Icon assetId={s.brand?.assetId} name={s.name} />
              <div style={{ minWidth: 0 }}>
                <div className="conn-name">{s.name}</div>
                <div className="conn-sub">
                  {signIn ? "Needs sign-in" : !s.signedIn && s.auth === "gh" ? "Run gh auth login" : c ? (c.ok ? `${count} tools` : c.error ?? "Can't connect") : "Not checked"}
                  {" · "}{s.url ?? [s.command, ...s.args].join(" ")}
                </div>
                {confirm === s.id && (
                  <div className="ask-card" style={{ marginTop: 8 }}>
                    <span>{count} tools — Shua would use all of them by voice <b>without asking</b>. Your crew still asks first.</span>
                    <div className="ask-card-actions"><button type="button" className="btn is-primary" onClick={() => void setShua(s, true)}>Let Shua use it</button><button type="button" className="btn" onClick={() => setConfirm(null)}>Cancel</button></div>
                  </div>
                )}
              </div>
              <div className="conn-actions">
                {signIn ? <button type="button" className="btn is-primary" disabled={busy === s.id} onClick={() => void act(s.id, () => api(`/api/mcp/${s.id}/signin`, { body: {} }))}>{busy === s.id ? "Signing in…" : "Sign in"}</button>
                  : <button type="button" className="btn is-quiet" disabled={busy === s.id} onClick={() => void check(s)} aria-label={`Check ${s.name}`}><RefreshCw size={13} className={busy === s.id ? "spin" : ""} /></button>}
                <span className="toggle-label">Shua</span>
                <button type="button" className="toggle" role="switch" aria-checked={!!s.spark} aria-label={`Let Shua use ${s.name}`} disabled={busy === s.id}
                  onClick={() => s.spark ? void setShua(s, false) : (count ?? 0) > MANY_TOOLS ? setConfirm(s.id) : void setShua(s, true)} />
                <button type="button" className="btn is-quiet" aria-label={`Remove ${s.name}`} disabled={busy === s.id} onClick={() => { if (window.confirm(`Remove ${s.name}?`)) void act(s.id, () => api(`/api/mcp/${s.id}`, { method: "DELETE" })); }}><Trash2 size={13} /></button>
              </div>
            </article>
          );
        })}
        {!servers.length && <p className="empty">No connections yet. Add one below.</p>}
      </div>
      <h2 className="section-title">Add a tool</h2>
      <input className="field search" placeholder="Find a tool" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a tool" />
      <div className="catalog">
        {catalog.map((f) => (
          <article key={f.id} className="card">
            <div className="card-top"><Icon assetId={f.brand?.assetId} name={f.title} /><b>{f.title}</b></div>
            <p>{f.blurb}</p>
            <footer>
              <span className="pill">{f.auth === "oauth" ? "Sign in" : f.auth === "gh" ? "Your gh login" : "No sign-in"}</span>
              <button type="button" className="btn" disabled={busy === f.id} onClick={() => void add(f)}><Plus size={13} /> {busy === f.id ? (f.auth === "oauth" ? "Signing in…" : "Adding…") : "Add"}</button>
            </footer>
          </article>
        ))}
        {!catalog.length && <p className="empty">{q ? "Nothing matches." : "Everything in the catalog is added."}</p>}
      </div>
    </div>
  );
}
