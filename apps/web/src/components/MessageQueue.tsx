import { useState } from "react";
import { ArrowDown, ArrowUp, ListOrdered, X } from "lucide-react";
import type { AnyEvent } from "@shuacrew/core/events";
import { queuedMessages } from "@shuacrew/core/queue";
import { api } from "../lib/api";

/** Pending messages remain on the record while edited; the main composer is never replaced. */
export function MessageQueue({ run, events }: { run: string; events: AnyEvent[] }) {
  const waiting = queuedMessages(events);
  const [edit, setEdit] = useState<{ id: string; original: string; text: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const consumed = edit && !waiting.some((q) => q.id === edit.id);
  const change = async (suffix: string, body: object, saved?: () => void) => {
    setBusy(true);
    setError("");
    try { await api(`/api/runs/${run}/followups/${suffix}`, { body }); saved?.(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const move = (index: number, delta: number) => {
    const ids = waiting.map((q) => q.id!);
    [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
    void change("reorder", { ids });
  };
  if (!waiting.length && !edit && !error) return null;
  return <div className="mx-auto w-full max-w-[820px] px-4">
    <div className="queue" aria-label="Queued messages">
      <div className="queue-head"><ListOrdered size={13} /> {waiting.length} queued · sent together in this order</div>
      <div className="queue-list">{waiting.map((q, i) => <div key={q.id ?? i} className="queue-item">
        <span className="mono text-fg-3">{i + 1}</span><span className="min-w-0 flex-1 truncate" title={q.text}>{q.text}</span>
        {q.id && <>
          <button disabled={busy || !!edit || i === 0 || waiting.some((m) => !m.id)} onClick={() => move(i, -1)} aria-label={`Move queued message ${i + 1} up`}><ArrowUp size={13} /></button>
          <button disabled={busy || !!edit || i === waiting.length - 1 || waiting.some((m) => !m.id)} onClick={() => move(i, 1)} aria-label={`Move queued message ${i + 1} down`}><ArrowDown size={13} /></button>
          <button disabled={busy || !!edit} onClick={() => { setError(""); setEdit({ id: q.id!, original: q.text, text: q.text }); }} aria-label={`Edit queued message ${i + 1}`}>Edit</button>
          <button disabled={busy || !!edit} onClick={() => void change(`${q.id}/withdraw`, {})} aria-label={`Withdraw queued message ${i + 1}`}><X size={13} /></button>
        </>}
      </div>)}</div>
      {edit && <form className="queue-editor" onSubmit={(e) => { e.preventDefault(); void change(`${edit.id}/edit`, { text: edit.text, expectedText: edit.original }, () => setEdit(null)); }}>
        <label htmlFor="queue-edit">Edit queued message</label>
        <textarea id="queue-edit" autoFocus value={edit.text} disabled={busy} onChange={(e) => setEdit({ ...edit, text: e.target.value })} rows={3} />
        <p>{consumed ? "This message has already started or was withdrawn. Your edit is still here; it has not been sent." : "The current queued text can be sent until you save. Your composer draft stays untouched."}</p>
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={() => { setEdit(null); setError(""); }}>Cancel edit</button>
          {consumed ? <button type="button" onClick={() => { window.dispatchEvent(new CustomEvent("shuacrew:insert", { detail: edit.text })); setEdit(null); setError(""); }}>Add edit to composer</button> :
            <button type="submit" disabled={busy || !edit.text.trim()}>{busy ? "Saving…" : "Save message"}</button>}
        </div>
      </form>}
      {error && <div className="queue-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss queue error"><X size={13} /></button></div>}
    </div>
  </div>;
}
