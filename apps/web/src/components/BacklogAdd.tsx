/** The backlog on the Board: line work up now, start it when you're ready. Parked items never start on their own. */
import { useState } from "react";
import { Play, Plus } from "lucide-react";
import { api } from "../lib/api";

export function BacklogAdd() {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError("");
    try { await api("/api/runs", { body: { ask: text.trim(), later: true } }); setText(""); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <form className="bl-add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
    <Plus size={14} />
    <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add to backlog…" title="Parked until you press Start" aria-label="Add to backlog" maxLength={4000} />
    {error && <small>{error}</small>}
  </form>;
}

export function StartBacklog({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  return <button type="button" className="bl-start" disabled={busy} onClick={(e) => { e.stopPropagation(); setBusy(true); void api(`/api/runs/${id}/start`, { body: {} }).finally(() => setBusy(false)); }}>
    <Play size={12} />{busy ? "Starting…" : "Start"}
  </button>;
}
