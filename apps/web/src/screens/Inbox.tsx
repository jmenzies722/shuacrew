import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { since } from "@shuacrew/ui";
import type { InboxItem, InboxKind } from "@shuacrew/core/inbox";
import { api } from "../lib/api";
import { useInbox } from "../lib/inbox";
import { PaneHeader, PaneLayout } from "../components/Pane";
import "./inbox.css";

/** The list in sections, in the order core/inbox.ts sorts it: what blocks most comes first. */
const SECTIONS: Array<{ title: string; hint: string; kinds: InboxKind[] }> = [
  { title: "Waiting for your answer", hint: "An agent stopped to ask before doing something.", kinds: ["approval"] },
  { title: "Broken", hint: "Stopped with an error, or its last check fails.", kinds: ["failed", "failing"] },
  { title: "Not proven", hint: "Code changed and nothing checked it afterwards.", kinds: ["unverified"] },
  { title: "Your call", hint: "Nothing here could be decided for you.", kinds: ["race", "review"] },
  { title: "Suggested notes", hint: "Things Shua thinks are worth remembering about you. Nothing is added until you say so.", kinds: ["note"] },
  { title: "Ready to merge", hint: "Verified work, waiting for you.", kinds: ["ready"] },
];
const ACTION: Record<InboxKind, string> = { approval: "Answer", failed: "Open", failing: "Open", unverified: "Open", race: "Compare", review: "Read", note: "", ready: "Review" };
const FILE: Record<string, string> = { me: "About me", projects: "Projects", commitments: "Commitments", people: "People", style: "How I write" };

/**
 * Inbox: everything that is waiting on you, in one list. It is worked out from the sessions themselves, so there is
 * nothing to mark as read: an item leaves when the thing it is about changes.
 */
export function Inbox() {
  const items = useInbox();
  const owed = items.filter((i) => i.kind !== "ready").length;
  return <PaneLayout>
    <PaneHeader title="Inbox" tone={owed ? "wait" : "ok"}
      status={owed ? `${owed} ${owed === 1 ? "thing needs" : "things need"} you` : items.length ? "Nothing needs a decision" : "Nothing is waiting on you"}
      description="Approvals, failures, unproven work, calls only you can make, and notes Shua suggests keeping. Items leave on their own when you deal with them." />
    {items.length === 0
      ? <p className="inbox-empty">All clear. When a session needs you, it shows up here.</p>
      : <div className="inbox">
        {SECTIONS.map((section) => {
          const rows = items.filter((i) => section.kinds.includes(i.kind));
          if (!rows.length) return null;
          return <section key={section.title} aria-label={section.title}>
            <header><h2>{section.title}</h2><span>{rows.length}</span><p>{section.hint}</p></header>
            <ul>{rows.map((item) => <li key={item.id}>{item.kind === "note" ? <NoteRow item={item} /> : <Row item={item} />}</li>)}</ul>
          </section>;
        })}
      </div>}
  </PaneLayout>;
}

function Row({ item }: { item: InboxItem }) {
  const body = <>
    <i className={`inbox-dot is-${item.tone}`} aria-hidden />
    <span className="inbox-main"><b>{item.title}</b><small>{item.detail}</small></span>
    <time>{since(item.at)}</time>
    {item.run && <em>{ACTION[item.kind]}</em>}
  </>;
  return item.run
    ? <Link to="/sessions/$id" params={{ id: item.run }} className="inbox-row">{body}</Link>
    : <div className="inbox-row">{body}</div>;
}

/** A suggested note: the line itself (reword it if you like), why it was suggested, and your answer. */
function NoteRow({ item }: { item: InboxItem }) {
  const note = item.note!;
  const [text, setText] = useState(note.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const answer = async (accept: boolean) => {
    setBusy(true); setError("");
    // On success the row leaves with the event that resolves it; there is nothing to reset.
    try { await api(`/api/notes/${note.id}`, { body: accept ? { accept, text } : { accept } }); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  const where = FILE[note.file] ?? note.file;
  return <div className="inbox-note">
    <i className="inbox-dot is-idle" aria-hidden />
    <div className="inbox-main">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(4, Math.max(1, Math.ceil(text.length / 80)))} maxLength={400} aria-label={`Note to add to ${where}`} />
      <small>
        {item.detail && item.detail !== note.text ? `${item.detail} ` : ""}
        {item.run && <Link to="/sessions/$id" params={{ id: item.run }}>See the session</Link>}
        {error && <span className="is-bad" role="alert"> {error}</span>}
      </small>
    </div>
    <time>{since(item.at)}</time>
    <span className="inbox-answer">
      <button type="button" onClick={() => void answer(false)} disabled={busy}>Dismiss</button>
      <button type="button" className="is-primary" onClick={() => void answer(true)} disabled={busy || !text.trim()}>Add to {where}</button>
    </span>
  </div>;
}
