import { useEffect, useRef } from "react";
import { ArrowUp, AtSign, CornerUpLeft, ShieldCheck, X } from "lucide-react";
import type { RoomView } from "@shuacrew/core/rooms";
import { shouldSend } from "../lib/composer-keys";
import { useLive } from "../lib/live";

export function RoomComposer({ room, draft, recipient, busy, online, active, uncertain, replyTo, onClearReply, onDraft, onRecipient, onSend, onCancel }: {
  room: RoomView; draft: string; recipient: string; busy: boolean; online: boolean; active: boolean; uncertain: boolean;
  onDraft: (text: string) => void; onRecipient: (id: string) => void; onSend: () => void; onCancel: (id: string) => void;
  replyTo?: string; onClearReply: () => void;
}) {
  const members = useLive(s => s.crew.members), shortcut = useLive(s => s.appearance.sendShortcut);
  const queued = Object.values(room.queue ?? {}).filter(entry => entry.state !== "started").slice(-20);
  const disabled = busy || !online || (!uncertain && !draft.trim());
  const reply = room.messages.find(message => message.id === replyTo);
  const field = useRef<HTMLTextAreaElement>(null);
  // Grow with the text, up to a comfortable cap.
  useEffect(() => { const el = field.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 240)}px`; }, [draft]);
  useEffect(() => { if (reply) field.current?.focus(); }, [reply]);
  const to = recipient || room.coordinator;
  return <div className="rx-compose">
    {queued.length > 0 && <details className="rx-queue" open><summary>Up next · {queued.filter(entry => entry.state === "pending").length} queued{room.paused ? " · held" : ""}</summary>
      <ol>{queued.map(entry => <li key={entry.requestId}><div><strong>@{members[entry.recipient ?? room.coordinator]?.name ?? entry.recipient ?? room.coordinator}</strong><p>{entry.text}</p><small>{entry.state === "pending" ? (room.paused ? "Held until you resume" : "Starts when current work settles") : entry.state}{entry.reason ? ` · ${entry.reason}` : ""}</small></div>{entry.state === "pending" && <button type="button" disabled={busy} onClick={() => onCancel(entry.requestId)}>Withdraw</button>}</li>)}</ol>
    </details>}
    <form className="rx-composer" onSubmit={event => { event.preventDefault(); if (!disabled) onSend(); }}>
      {reply && <div className="rx-reply"><CornerUpLeft size={12} /><span>Replying to <strong>{reply.author === "you" ? "you" : members[reply.author]?.name ?? reply.author}</strong> — {reply.text.slice(0, 120)}</span><button type="button" disabled={uncertain || busy} onClick={onClearReply} aria-label="Remove reply context"><X size={13} /></button></div>}
      <textarea ref={field} rows={1} aria-label="Message your crew" placeholder={room.paused ? "Queue an outcome for when you resume…" : `Ask ${members[to]?.name ?? "your crew"} for an outcome…`} value={draft} disabled={uncertain} onChange={event => onDraft(event.target.value)} onKeyDown={event => { if (shouldSend(event.nativeEvent, shortcut) && !disabled) { event.preventDefault(); onSend(); } }} />
      <footer>
        <label className="rx-pill" title="Who receives this"><AtSign size={12} /><select aria-label="Recipient" value={recipient} disabled={uncertain || busy} onChange={event => onRecipient(event.target.value)}><option value="">{members[room.coordinator]?.name ?? room.coordinator}</option>{room.members.filter(id => id !== room.coordinator).map(id => <option key={id} value={id}>{members[id]?.name ?? id}</option>)}</select></label>
        <span className="rx-pill is-static" title="Risky actions ask you first"><ShieldCheck size={12} />Supervised</span>
        <span className="rx-hint">{uncertain ? "Delivery uncertain — Recover resends the same request" : room.paused ? "Paused · queued until you resume" : active ? "Queued after current work" : shortcut === "button-only" ? "" : "↵ send · ⇧↵ new line"}</span>
        <button className="rx-send" disabled={disabled} aria-label={uncertain ? "Recover original request" : active || room.paused ? "Queue next" : "Send to crew"} title={uncertain ? "Recover original request" : active || room.paused ? "Queue next" : "Send to crew"}><ArrowUp size={17} /></button>
      </footer>
    </form>
  </div>;
}
