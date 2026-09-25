import { ArrowUp } from "lucide-react";
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
  return <div className="room-compose">
    {queued.length > 0 && <details className="room-queue" open><summary>Queue · {queued.filter(entry => entry.state === "pending").length} pending{room.paused ? " · Held" : ""}</summary>
      <ol>{queued.map(entry => <li key={entry.requestId}><div><strong>{members[entry.recipient ?? room.coordinator]?.name ?? entry.recipient ?? room.coordinator}</strong><p>{entry.text}</p><small>{entry.state === "pending" ? (room.paused ? "Held until you resume" : "Waiting for prior work to settle") : entry.state}{entry.reason ? ` · ${entry.reason}` : ""}</small></div>{entry.state === "pending" && <button type="button" disabled={busy || !online} onClick={() => onCancel(entry.requestId)}>Cancel pending</button>}</li>)}</ol>
    </details>}
    <form onSubmit={event => { event.preventDefault(); if (!disabled) onSend(); }}><div className="composer-box">
      {reply && <div className="room-reply-context"><span>Replying to {reply.author === "you" ? "you" : members[reply.author]?.name ?? reply.author}<small>{reply.text.slice(0, 160)}</small></span><button type="button" disabled={uncertain || busy} onClick={onClearReply} aria-label="Remove reply context">Remove</button></div>}
      <textarea aria-label="Message your crew" placeholder={room.paused ? "Queue an outcome for when you resume…" : "Give your crew an outcome…"} value={draft} disabled={uncertain} onChange={event => onDraft(event.target.value)} onKeyDown={event => { if (shouldSend(event.nativeEvent, shortcut) && !disabled) { event.preventDefault(); onSend(); } }} />
      <footer><select aria-label="Recipient" value={recipient} disabled={uncertain || busy} onChange={event => onRecipient(event.target.value)}><option value="">@{members[room.coordinator]?.name ?? room.coordinator}</option>{room.members.filter(id => id !== room.coordinator).map(id => <option key={id} value={id}>@{members[id]?.name ?? id}</option>)}</select>
      <button className="room-primary" disabled={disabled}>{uncertain ? "Recover original request" : active || room.paused ? "Queue next" : "Send to crew"}<ArrowUp size={14} /></button></footer>
    </div></form>
    <p className="room-note">{uncertain ? "Delivery uncertain. Recover uses the same request; it does not repeat work." : room.paused ? "Paused · queued instructions wait for Resume. Running tasks may finish." : active ? "New instructions wait until the crew and its summary finish." : "Supervised work · queued durably · Shift + Enter adds a line"}</p>
  </div>;
}
