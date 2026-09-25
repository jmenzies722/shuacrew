import { useRef, useState } from "react";
import { Activity, ArrowUp, ChevronRight, MessageSquare, PanelRightClose, PanelRightOpen, Plus, Search, ShieldCheck, Users } from "lucide-react";
import { Glyph } from "../lib/glyphs";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import type { RoomView } from "@shuacrew/core/rooms";
import { api, decideApproval } from "../lib/api";
import { useLive } from "../lib/live";
import { CrewWorkspace } from "../components/CrewWorkspace";
import { selectRooms } from "../lib/room-view";
import { enqueueRoomMessage } from "../lib/room-queue-client";
import type { RoomQueueInput } from "@shuacrew/core/room-queue";
import { RoomComposer } from "../components/RoomComposer";
import { RoomResults } from "../components/RoomResults";

export function Rooms() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const rooms = useLive(s => selectRooms(s.crew)), members = useLive(s => s.crew.members), runs = useLive(s => s.crew.runs), approvals = useLive(s => s.crew.approvals), connection = useLive(s => s.connection);
  const navigate = useNavigate(); const [creating, setCreating] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(""), [coordinator, setCoordinator] = useState(""), [selected, setSelected] = useState<string[]>([]), [repo, setRepo] = useState(""), [concurrency, setConcurrency] = useState(3);
  const [drafts, setDrafts] = useState<Record<string, string>>({}), [recipient, setRecipient] = useState("");
  const [search, setSearch] = useState(""), [activityOpen, setActivityOpen] = useState(true), [mobilePane, setMobilePane] = useState<"chat" | "activity">("chat");
  const uncertain = useRef<Record<string, RoomQueueInput>>({});
  const room = id ? rooms[id] : undefined;
  const [view, setView] = useState<"chat" | "work" | "results">("chat");
  const [replies, setReplies] = useState<Record<string, string | undefined>>({});
  const eligible = Object.values(members).filter(m => m.delegatable && ["claude", "codex"].includes(m.runtime ?? ""));
  const runIds = room ? [...room.turns.map(t => t.runId), ...Object.values(room.assignments).map(a => a.runId)] : [];
  const pending = Object.values(approvals).filter(a => a.run && runIds.includes(a.run));
  const active = runIds.some(r => runs[r] && !["done", "failed", "cancelled", "merged", "reviewing"].includes(runs[r]!.status)) || Object.values(room?.assignments ?? {}).some(a => ["queued", "running"].includes(a.status));
  async function action(fn: () => Promise<unknown>) { setBusy(true); setError(""); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function create() {
    const result = await api<RoomView>("/api/rooms", { body: { title, coordinator, members: [...new Set([coordinator, ...selected])], repo: repo.trim() || undefined, concurrency } });
    setCreating(false); await navigate({ to: "/rooms/$id", params: { id: result.id } });
  }
  async function send() {
    if (!room) return;
    const sentDraft = drafts[room.id] ?? "";
    const sentReply = replies[room.id];
    await enqueueRoomMessage(uncertain.current, room.id, sentDraft, recipient || undefined, sentReply);
    setDrafts(d => d[room.id] === sentDraft ? { ...d, [room.id]: "" } : d);
    setReplies(value => value[room.id] === sentReply ? { ...value, [room.id]: undefined } : value);
  }
  const online = connection === "live";
  const roomList = Object.values(rooms).filter(r => r.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="room-page">
    <header className="room-top"><div className="room-title-block"><span className="room-eyebrow"><Users size={12} /> CREW ROOMS</span><h1>{creating ? "Create a crew room" : room?.title ?? "A shared space for your crew."}</h1><p>{room ? `${room.members.length} members · ${room.concurrency} concurrent assignments` : "One conversation. Clear handoffs. Work you can follow."}</p></div><div className="room-top-actions">
      {room && !creating && <><button disabled={busy || !online} onClick={() => void action(() => api(`/api/rooms/${room.id}/pause`, { body: { paused: !room.paused } }))}>{room.paused ? "Resume room" : "Pause new work"}</button><button disabled={busy || !online || !active} onClick={() => void action(() => api(`/api/rooms/${room.id}/stop`, { body: {} }))}>Stop work</button></>}
      <button onClick={() => { setCreating(!creating); setError(""); }}><Plus size={14} />{creating ? "Back to rooms" : "New room"}</button>
      {room && !creating && <button className="room-inspector-toggle" aria-label={activityOpen ? "Hide live activity" : "Show live activity"} aria-expanded={activityOpen} aria-controls="room-live-panel" onClick={() => setActivityOpen(v => !v)}>{activityOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</button>}
    </div></header>
    {!online && <p className="room-error" role="status">Disconnected. Showing recorded history; reconnect before sending work.</p>}
    {error && <p className="room-error" role="alert">{error}</p>}
    {creating ? <form className="room-create" onSubmit={e => { e.preventDefault(); void action(create); }}>
      <label>Room name<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="Launch the side project" /></label>
      <label>Coordinator<select required value={coordinator} onChange={e => setCoordinator(e.target.value)}><option value="">Choose a coordinator</option>{eligible.map(m => <option key={m.id} value={m.id}>{m.name} · {m.runtime}</option>)}</select></label>
      <fieldset><legend className="room-note">Members available for assignments</legend>{eligible.filter(m => m.id !== coordinator).map(m => <label key={m.id}><input type="checkbox" checked={selected.includes(m.id)} onChange={e => setSelected(s => e.target.checked ? [...s, m.id] : s.filter(id => id !== m.id))} />{m.name} · {m.runtime}</label>)}</fieldset>
      <p className="room-note">Only opted-in Claude and Codex members appear. Customize names, roles, models, voices and “Available for delegation” in <Link to="/crew">Crew → edit member</Link>. Starting a room never grants additional permissions.</p>
      <label>Project repository (optional)<input value={repo} onChange={e => setRepo(e.target.value)} placeholder="Absolute path to your personal project" /><small>Each run uses its own worktree. Leave blank for business or research work.</small></label>
      <label>Concurrent assignments<select value={concurrency} onChange={e => setConcurrency(Number(e.target.value))}>{[1, 2, 3].map(n => <option key={n} value={n}>{n} at a time</option>)}</select></label>
      <button className="room-primary" disabled={busy || !online || !coordinator || !title.trim()}>Create room</button>
    </form> : <div className={`room-columns ${activityOpen ? "has-activity" : "activity-collapsed"} ${room ? "has-room" : "room-overview"}`} data-mobile-pane={mobilePane}>
      <nav className="room-sidebar" aria-label="Crew rooms"><div className="room-list-heading"><span className="room-eyebrow">YOUR ROOMS</span><span>{Object.keys(rooms).length}</span></div><label className="room-search"><Search size={14} /><input aria-label="Search crew rooms" placeholder="Find a room…" value={search} onChange={e => setSearch(e.target.value)} /></label><div className="room-list">{roomList.map(r => <Link key={r.id} to="/rooms/$id" params={{ id: r.id }} aria-current={r.id === id ? "page" : undefined} className={`room-list-item ${r.id === id ? "is-selected" : ""}`} onClick={() => { setError(""); setRecipient(""); setMobilePane("chat"); }}><span className="room-list-icon"><MessageSquare size={15} /></span><span><strong>{r.title}</strong><small>{r.paused ? "Paused" : `${r.members.length} members`} · {r.messages.length} messages</small></span><ChevronRight size={12} /></Link>)}</div>{!roomList.length && <p className="room-empty">{search ? "No matching rooms." : "Your rooms will appear here."}</p>}<div className="room-sidebar-note"><ShieldCheck size={15} /><span>Your crew works within your permissions. You stay in control.</span></div></nav>
      {room ? <><div className="room-mobile-tabs" role="group" aria-label="Room view"><button aria-pressed={mobilePane === "chat"} onClick={() => setMobilePane("chat")}><MessageSquare size={14} />Chat{pending.length > 0 && <span className="room-pill">{pending.length} needs you</span>}</button><button aria-pressed={mobilePane === "activity"} onClick={() => setMobilePane("activity")}><Activity size={14} />Activity</button></div><section className="room-conversation" aria-label="Room conversation"><div className="room-conversation-bar"><div className="room-member-stack">{room.members.map(memberId => <span className="room-member-face" key={memberId} title={`${members[memberId]?.name ?? memberId}${memberId === room.coordinator ? " · Coordinator" : ""}`} style={{ color: members[memberId]?.color }}><Glyph name={members[memberId]?.emoji} fallback={memberId} size={14} /></span>)}</div><span><strong>{members[room.coordinator]?.name ?? room.coordinator}</strong> coordinates</span><span className="room-supervised"><ShieldCheck size={12} />Supervised</span></div><div className="room-view-tabs" role="group" aria-label="Room content">{(["chat", "work", "results"] as const).map(value => <button key={value} aria-pressed={view === value} onClick={() => setView(value)}>{value === "chat" ? "Chat" : value === "work" ? "Work" : "Results"}</button>)}</div>{view === "results" ? <RoomResults room={room} /> : view === "work" ? <div className="room-work-view"><CrewWorkspace room={room} /></div> : <><div className="room-messages">
        {!room.messages.length && <p className="room-empty">Start with the outcome you want. Your coordinator can hand concrete tasks to the other members, including across Claude and Codex.</p>}
        {room.messages.map(m => <article key={m.id} className={`room-message ${m.author === "you" ? "is-you" : ""}`}><span className="room-message-avatar" style={{ color: members[m.author]?.color }}><Glyph name={members[m.author]?.emoji} fallback={m.author} size={16} /></span><div className="room-message-content"><div className="room-message-head"><strong>{m.author === "you" ? "You" : members[m.author]?.name ?? m.author}</strong><small>{new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>{m.assignmentId && <span className="room-pill">Result</span>}</div>{m.replyTo && <small className="room-note">Reply to {room.messages.find(source => source.id === m.replyTo)?.text.slice(0, 100) ?? "unavailable message"}</small>}{m.recipient && <small className="room-pill">To {members[m.recipient]?.name ?? m.recipient}</small>}<p>{m.text}</p><button type="button" className="room-message-reply" disabled={busy || Boolean(uncertain.current[room.id])} onClick={() => setReplies(value => ({ ...value, [room.id]: m.id }))}>Reply</button>{m.sourceRun && runs[m.sourceRun] && <Link to="/sessions/$id" params={{ id: m.sourceRun }}>Inspect conversation <ChevronRight size={12} /></Link>}</div></article>)}
        {pending.map(a => <article className="room-approval" key={a.id}><strong>Your approval · {a.tool}</strong><p>{a.reason}</p><pre>{JSON.stringify(a.input, null, 2)}</pre><button disabled={busy || !online} onClick={() => void action(() => decideApproval(a.id, false))}>Deny</button><button disabled={busy || !online} onClick={() => void action(() => decideApproval(a.id, true))}>Allow once</button></article>)}
        {Object.values(room.assignments).filter(a => a.status === "failed").map(a => <article className="room-approval" key={a.id}><strong>{members[a.memberId]?.name ?? a.memberId} · Task failed</strong><p>{a.task}</p><p>{a.reason}</p><button disabled={busy || active || room.paused || !online} onClick={() => void action(() => api(`/api/rooms/${room.id}/retry`, { body: { assignmentId: a.id, requestId: crypto.randomUUID() } }))}>Retry as new supervised request</button></article>)}
      </div><RoomComposer room={room} replyTo={replies[room.id]} onClearReply={() => setReplies(value => ({ ...value, [room.id]: undefined }))} draft={drafts[room.id] ?? ""} recipient={recipient} busy={busy} online={online} active={active} uncertain={Boolean(uncertain.current[room.id])} onDraft={text => setDrafts(d => ({ ...d, [room.id]: text }))} onRecipient={setRecipient} onSend={() => void action(send)} onCancel={requestId => void action(async () => { const result = await api<{ outcome: string }>(`/api/rooms/${room.id}/queue-cancel`, { body: { requestId } }); if (result.outcome === "already-started") throw new Error("This instruction already started. Use Stop work to cancel active runs."); })} /></>}</section><div id="room-live-panel" className="room-live-panel"><CrewWorkspace room={room} /></div></> : <section className="room-welcome"><div className="room-welcome-mark"><Users size={30} /></div><span className="room-eyebrow">BETTER TOGETHER</span><h2>Your people.<br />One shared conversation.</h2><p>Bring a coordinator and specialists together. Follow their handoffs, review the work, and make the decisions that matter.</p>{Object.keys(rooms).length > 0 && <p className="room-note">Choose a room on the left to pick up the conversation.</p>}<button className="room-primary" onClick={() => setCreating(true)}><Plus size={15} />{Object.keys(rooms).length ? "Create another room" : "Create your first room"}</button><div className="room-welcome-details"><span><MessageSquare size={15} />Shared context</span><span><Activity size={15} />Real activity</span><span><ShieldCheck size={15} />Your control</span></div></section>}
    </div>}
  </div>;
}
