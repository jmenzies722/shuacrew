import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowUp, Check, ChevronRight, Settings2, Copy, CornerUpLeft, ExternalLink, MessageSquare, PanelRightClose, PanelRightOpen, Pause, Play, Plus, Search, ShieldCheck, Square, Users } from "lucide-react";
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
import { Markdown } from "../components/Markdown";
import "./rooms.css";
import { useFlag } from "../components/BatchSettings";
import { shouldSend } from "../lib/composer-keys";

const LIVE = ["running", "planning", "awaiting_approval", "queued"];
const STARTERS = [
  "Plan this week's work on my side project and hand each piece to the right member",
  "Research three competitors and summarise what we should copy and avoid",
  "Review what changed in my repo today and list the riskiest parts",
];

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
  const [copied, setCopied] = useState("");
  const eligible = Object.values(members).filter(m => m.delegatable && ["claude", "codex"].includes(m.runtime ?? ""));
  const runIds = room ? [...room.turns.map(t => t.runId), ...Object.values(room.assignments).map(a => a.runId)] : [];
  const pending = Object.values(approvals).filter(a => a.run && runIds.includes(a.run));
  const active = runIds.some(r => runs[r] && !["done", "failed", "cancelled", "merged", "reviewing"].includes(runs[r]!.status)) || Object.values(room?.assignments ?? {}).some(a => ["queued", "running"].includes(a.status));
  // Who is actually working right now, from recorded run status — never simulated.
  const working = useMemo(() => new Set(runIds.map(r => runs[r]).filter(r => r && LIVE.includes(r.status)).map(r => r!.member ?? "")), [runIds.join(), runs]);
  const thread = useRef<HTMLDivElement>(null);
  const replyTiming = useFlag("room-reply-timing"), noAutoscroll = useFlag("rooms-no-autoscroll");
  useEffect(() => { if (!noAutoscroll) thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: "smooth" }); }, [room?.messages.length, working.size, pending.length, noAutoscroll]);
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
  const copy = (id: string, text: string) => { void navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied(c => (c === id ? "" : c)), 1400); };
  const online = connection === "live";
  const roomList = Object.values(rooms).filter(r => r.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt);
  const face = (memberId: string, size = 15) => <Glyph name={members[memberId]?.emoji} label={members[memberId]?.name ?? memberId} size={size} />;

  return <div className="rx">
    {!online && <p className="rx-banner" role="status">Disconnected — showing recorded history. Reconnect before sending work.</p>}
    {error && <p className="rx-banner is-error" role="alert">{error}</p>}
    <div className={`rx-grid ${room && activityOpen && !creating ? "has-panel" : ""}`} data-mobile-pane={mobilePane}>
      <nav className="rx-rooms" aria-label="Crew rooms">
        <div className="rx-rooms-head"><span className="rx-kicker"><Users size={12} /> Crew rooms</span><button className="rx-icon-btn" aria-label="New room" title="New room" onClick={() => { setCreating(true); setError(""); }}><Plus size={15} /></button></div>
        <label className="rx-search"><Search size={13} /><input aria-label="Search crew rooms" placeholder="Search rooms" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className="rx-room-list">{roomList.map(r => {
          const live = [...r.turns.map(t => t.runId), ...Object.values(r.assignments).map(a => a.runId)].some(x => runs[x] && LIVE.includes(runs[x]!.status));
          return <Link key={r.id} to="/rooms/$id" params={{ id: r.id }} aria-current={r.id === id && !creating ? "page" : undefined} className="rx-room" onClick={() => { setCreating(false); setError(""); setRecipient(""); setMobilePane("chat"); }}>
            <span className="rx-faces">{r.members.slice(0, 3).map(m => <i key={m} style={{ color: members[m]?.color }}>{face(m, 11)}</i>)}</span>
            <span className="rx-room-text"><strong>{r.title}</strong><small>{r.paused ? "Paused" : live ? <span className="rx-live-text">Working…</span> : r.messages.at(-1)?.text.slice(0, 60) ?? "No messages yet"}</small></span>
            {live && <span className="rx-dot" aria-label="Working" />}
          </Link>;
        })}{!roomList.length && <p className="rx-muted">{search ? "No matching rooms." : "Your rooms appear here."}</p>}</div>
        <p className="rx-foot"><ShieldCheck size={13} /> Your crew works within your permissions.</p>
      </nav>

      {creating ? <CreateRoom {...{ title, setTitle, coordinator, setCoordinator, selected, setSelected, repo, setRepo, concurrency, setConcurrency, eligible, busy, online }} onCancel={() => setCreating(false)} onCreate={() => void action(create)} />
      : room ? <>
        <section className="rx-stage" aria-label="Room conversation">
          <header className="rx-head">
            <div className="rx-title"><h1>{room.title}</h1>
              <div className="rx-members">{room.members.map(m => <span key={m} className={`rx-avatar ${working.has(m) ? "is-working" : ""}`} style={{ "--c": members[m]?.color } as React.CSSProperties} title={`${members[m]?.name ?? m}${m === room.coordinator ? " · coordinator" : ""}${working.has(m) ? " · working" : ""}`}>{face(m, 13)}</span>)}
                <span className="rx-sub">{members[room.coordinator]?.name ?? room.coordinator} coordinates · {room.members.length} member{room.members.length === 1 ? "" : "s"}</span></div>
            </div>
            <div className="rx-seg" role="group" aria-label="Room content">{(["chat", "work", "results"] as const).map(v => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v === "chat" ? "Chat" : v === "work" ? "Work" : "Results"}</button>)}</div>
            <div className="rx-actions">
              <button className="rx-icon-btn" disabled={busy || !online} title={room.paused ? "Resume room" : "Pause new work"} aria-label={room.paused ? "Resume room" : "Pause new work"} onClick={() => void action(() => api(`/api/rooms/${room.id}/pause`, { body: { paused: !room.paused } }))}>{room.paused ? <Play size={15} /> : <Pause size={15} />}</button>
              <button className="rx-icon-btn is-danger" disabled={busy || !online || !active} title="Stop work" aria-label="Stop work" onClick={() => void action(() => api(`/api/rooms/${room.id}/stop`, { body: {} }))}><Square size={13} /></button>
              <button className="rx-icon-btn" aria-label={activityOpen ? "Hide live activity" : "Show live activity"} aria-expanded={activityOpen} aria-controls="rx-panel" onClick={() => setActivityOpen(v => !v)}>{activityOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</button>
            </div>
          </header>
          <div className="rx-mobile-tabs" role="group" aria-label="Room view"><button aria-pressed={mobilePane === "chat"} onClick={() => setMobilePane("chat")}><MessageSquare size={14} />Chat{pending.length > 0 && <span className="rx-badge">{pending.length}</span>}</button><button aria-pressed={mobilePane === "activity"} onClick={() => setMobilePane("activity")}><Activity size={14} />Activity</button></div>

          {view === "results" ? <div className="rx-scroll"><div className="rx-column"><RoomResults room={room} /></div></div>
          : view === "work" ? <div className="rx-scroll"><div className="rx-column"><CrewWorkspace room={room} /></div></div>
          : <div className="rx-scroll" ref={thread}><div className="rx-column">
            {!room.messages.length && <div className="rx-hello">
              <span className="rx-orb" aria-hidden="true" />
              <h2>What should the crew take on?</h2>
              <p>Describe the outcome. {members[room.coordinator]?.name ?? "Your coordinator"} plans it and hands concrete tasks to the others.</p>
              <div className="rx-starters">{STARTERS.map(s => <button key={s} onClick={() => setDrafts(d => ({ ...d, [room.id]: s }))}>{s}<ChevronRight size={13} /></button>)}</div>
            </div>}
            {room.messages.map(m => {
              const mine = m.author === "you", who = members[m.author], reply = m.replyTo ? room.messages.find(s => s.id === m.replyTo) : undefined;
              return <article key={m.id} className={`rx-msg ${mine ? "is-you" : ""}`}>
                {!mine && <span className="rx-avatar is-lg" style={{ "--c": who?.color } as React.CSSProperties}>{face(m.author, 15)}</span>}
                <div className="rx-msg-body">
                  {!mine && <div className="rx-msg-meta"><strong style={{ color: who?.color }}>{who?.name ?? m.author}</strong>{who?.role && <span>{who.role}</span>}{m.assignmentId && <span className="rx-chip">Result</span>}{replyTiming && (() => { const asked = room.messages.slice(0, room.messages.indexOf(m)).reverse().find(x => x.author === "you"); return asked ? <span className="rx-chip">replied in {Math.max(1, Math.round((m.at - asked.at) / 1000))}s</span> : null; })()}<time>{new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>}
                  {reply && <div className="rx-quote"><CornerUpLeft size={11} />{reply.author === "you" ? "You" : members[reply.author]?.name ?? reply.author}: {reply.text.slice(0, 110)}</div>}
                  {m.recipient && <span className="rx-chip">To @{members[m.recipient]?.name ?? m.recipient}</span>}
                  <div className="rx-msg-text">{mine ? <p>{m.text}</p> : <Markdown text={m.text} />}</div>
                  <div className="rx-msg-tools">
                    <button disabled={busy || Boolean(uncertain.current[room.id])} onClick={() => setReplies(v => ({ ...v, [room.id]: m.id }))}><CornerUpLeft size={12} />Reply</button>
                    <button onClick={() => copy(m.id, m.text)}>{copied === m.id ? <Check size={12} /> : <Copy size={12} />}{copied === m.id ? "Copied" : "Copy"}</button>
                    {m.sourceRun && runs[m.sourceRun] && <Link to="/sessions/$id" params={{ id: m.sourceRun }}><ExternalLink size={12} />Inspect</Link>}
                    {mine && <time>{new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>}
                  </div>
                </div>
              </article>;
            })}
            {[...working].filter(Boolean).map(m => <div key={m} className="rx-thinking"><span className="rx-avatar is-lg is-working" style={{ "--c": members[m]?.color } as React.CSSProperties}>{face(m, 15)}</span><span className="rx-shimmer">{members[m]?.name ?? m} is working…</span></div>)}
            {pending.map(a => <article className="rx-card is-wait" key={a.id}><header><ShieldCheck size={14} />Needs your approval · <code>{a.tool}</code></header><p>{a.reason}</p><pre>{JSON.stringify(a.input, null, 2)}</pre><footer><button disabled={busy || !online} onClick={() => void action(() => decideApproval(a.id, false))}>Deny</button><button className="is-primary" disabled={busy || !online} onClick={() => void action(() => decideApproval(a.id, true))}>Allow once</button></footer></article>)}
            {Object.values(room.assignments).filter(a => a.status === "failed").map(a => <article className="rx-card is-bad" key={a.id}><header>{members[a.memberId]?.name ?? a.memberId} · task failed</header><p>{a.task}</p><p className="rx-muted">{a.reason}</p><footer><button disabled={busy || active || room.paused || !online} onClick={() => void action(() => api(`/api/rooms/${room.id}/retry`, { body: { assignmentId: a.id, requestId: crypto.randomUUID() } }))}>Retry as a new supervised request</button></footer></article>)}
          </div></div>}
          {view === "chat" && <RoomComposer room={room} replyTo={replies[room.id]} onClearReply={() => setReplies(v => ({ ...v, [room.id]: undefined }))} draft={drafts[room.id] ?? ""} recipient={recipient} busy={busy} online={online} active={active} uncertain={Boolean(uncertain.current[room.id])} onDraft={text => setDrafts(d => ({ ...d, [room.id]: text }))} onRecipient={setRecipient} onSend={() => void action(send)} onCancel={requestId => void action(async () => { const result = await api<{ outcome: string }>(`/api/rooms/${room.id}/queue-cancel`, { body: { requestId } }); if (result.outcome === "already-started") throw new Error("This instruction already started. Use Stop work to cancel active runs."); })} />}
        </section>
        {activityOpen && <aside id="rx-panel" className="rx-panel"><CrewWorkspace room={room} /></aside>}
      </> : <RoomsHome eligible={eligible} allMembers={Object.values(members)} online={online} busy={busy} hasRooms={Object.keys(rooms).length > 0}
          onCustomize={() => { setCreating(true); setError(""); }}
          onStart={(text) => void action(async () => {
            // Ask first, set up after: the room is named from what you asked, the first opted-in member coordinates and
            // everyone else opted in specialises. Then your message goes in as the room's first request.
            const coordinatorId = (eligible.find((m) => /lead|coordinat|operator|producer/i.test(m.role)) ?? eligible[0])!.id;
            const name = text.length > 60 ? `${text.slice(0, 60).replace(/\s+\S*$/, "")}…` : text;
            const made = await api<RoomView>("/api/rooms", { body: { title: name, coordinator: coordinatorId, members: [...new Set([coordinatorId, ...eligible.map((m) => m.id)])], concurrency: 3 } });
            await navigate({ to: "/rooms/$id", params: { id: made.id } });
            await enqueueRoomMessage(uncertain.current, made.id, text, undefined, undefined);
          })}
          onOptIn={(ids) => void action(async () => { for (const id of ids) { const m = members[id]; if (m) await api("/api/crew", { body: { ...m, delegatable: true } }); } })} />}
    </div>
  </div>;
}

/** No room open: ask, like a chat home. What you type becomes a room with your opted-in crew and its first request. */
function RoomsHome({ eligible, allMembers, online, busy, hasRooms, onStart, onCustomize, onOptIn }: {
  eligible: Array<{ id: string; name: string; role: string; color: string; emoji: string; runtime?: string }>;
  allMembers: Array<{ id: string; name: string; role: string; color: string; emoji: string; runtime?: string; delegatable?: boolean }>;
  online: boolean; busy: boolean; hasRooms: boolean; onStart: (text: string) => void; onCustomize: () => void; onOptIn: (ids: string[]) => void;
}) {
  const [text, setText] = useState(""), [pick, setPick] = useState<string[]>([]), field = useRef<HTMLTextAreaElement>(null);
  const shortcut = useLive((s) => s.appearance.sendShortcut);
  useEffect(() => { const el = field.current; if (!el) return; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 220)}px`; }, [text]);
  const ready = eligible.length > 0, can = ready && online && !busy && text.trim().length > 0;
  const candidates = allMembers.filter((m) => !m.delegatable && ["claude", "codex"].includes(m.runtime ?? ""));
  const send = () => { if (can) { onStart(text.trim()); setText(""); } };
  return <section className="rx-stage rx-home">
    <div className="rx-home-inner">
      <span className="rx-orb is-big" aria-hidden="true" />
      <h1>What should the crew take on?</h1>
      <p>Say the outcome. {ready ? `${eligible[0]!.name} plans it and hands the pieces to ${eligible.length > 1 ? eligible.slice(1).map((m) => m.name).join(", ") : "the room"}.` : "First, choose who can work together in rooms."}</p>
      {ready ? <div className="rx-home-crew" aria-label="In this room">{eligible.map((m) => <span key={m.id} className="rx-avatar" style={{ "--c": m.color } as React.CSSProperties} title={`${m.name} · ${m.role}`}><Glyph name={m.emoji} label={m.name} size={13} /></span>)}<small>{eligible.length} in the room</small></div>
      : <div className="rx-home-optin">
        <div className="rx-pick">{candidates.map((m) => <button type="button" key={m.id} aria-pressed={pick.includes(m.id)} onClick={() => setPick((p) => p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id])}>
          <span className="rx-avatar" style={{ "--c": m.color } as React.CSSProperties}><Glyph name={m.emoji} label={m.name} size={13} /></span><span><strong>{m.name}</strong><small>{m.role}</small></span></button>)}</div>
        <button type="button" className="rx-primary" disabled={!pick.length || busy || !online} onClick={() => onOptIn(pick)}>Let {pick.length ? pick.length : ""} work in rooms</button>
        <small className="rx-muted">They still work within your permissions. You can change this per member on Team.</small>
      </div>}
      <form className="rx-composer rx-home-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea ref={field} rows={2} aria-label="What should the crew take on?" placeholder={ready ? "Launch my side project's landing page by Friday…" : "Choose your crew above to start"} value={text} disabled={!ready} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (shouldSend(e.nativeEvent, shortcut)) { e.preventDefault(); send(); } }} />
        <footer>
          <span className="rx-pill is-static" title="Risky actions ask you first"><ShieldCheck size={12} />Supervised</span>
          <button type="button" className="rx-pill" onClick={onCustomize} title="Name it, pick a coordinator, a repo, how much runs at once"><Settings2 size={12} />Customize the room</button>
          <span className="rx-hint">{ready ? "↵ start · ⇧↵ new line" : ""}</span>
          <button className="rx-send" disabled={!can} aria-label="Start the room"><ArrowUp size={17} /></button>
        </footer>
      </form>
      {ready && <div className="rx-home-starters">{STARTERS.map((s) => <button key={s} type="button" onClick={() => { setText(s); field.current?.focus(); }}>{s}</button>)}</div>}
      {hasRooms && <p className="rx-muted">Or pick up a room on the left.</p>}
    </div>
  </section>;
}

function CreateRoom(p: {
  title: string; setTitle: (v: string) => void; coordinator: string; setCoordinator: (v: string) => void; selected: string[]; setSelected: (f: (s: string[]) => string[]) => void;
  repo: string; setRepo: (v: string) => void; concurrency: number; setConcurrency: (n: number) => void; eligible: Array<{ id: string; name: string; runtime?: string; role: string; color: string; emoji: string }>;
  busy: boolean; online: boolean; onCancel: () => void; onCreate: () => void;
}) {
  return <section className="rx-stage"><div className="rx-scroll"><form className="rx-create" onSubmit={e => { e.preventDefault(); p.onCreate(); }}>
    <h1>New crew room</h1><p className="rx-muted">One shared conversation. The coordinator plans and hands work to the others. Starting a room never grants extra permissions.</p>
    <label><span>Name</span><input required maxLength={160} value={p.title} onChange={e => p.setTitle(e.target.value)} placeholder="Launch the side project" /></label>
    <fieldset><legend>Coordinator</legend><div className="rx-pick">{p.eligible.map(m => <button type="button" key={m.id} aria-pressed={p.coordinator === m.id} onClick={() => { p.setCoordinator(m.id); p.setSelected(s => s.filter(x => x !== m.id)); }}><span className="rx-avatar" style={{ "--c": m.color } as React.CSSProperties}><Glyph name={m.emoji} label={m.name} size={13} /></span><span><strong>{m.name}</strong><small>{m.role} · {m.runtime}</small></span></button>)}</div></fieldset>
    <fieldset><legend>Specialists</legend><div className="rx-pick">{p.eligible.filter(m => m.id !== p.coordinator).map(m => <button type="button" key={m.id} aria-pressed={p.selected.includes(m.id)} onClick={() => p.setSelected(s => s.includes(m.id) ? s.filter(x => x !== m.id) : [...s, m.id])}><span className="rx-avatar" style={{ "--c": m.color } as React.CSSProperties}><Glyph name={m.emoji} label={m.name} size={13} /></span><span><strong>{m.name}</strong><small>{m.role} · {m.runtime}</small></span></button>)}</div>
      {p.eligible.length < 2 && <p className="rx-muted">Only members with “Available for delegation” appear. Turn it on in <Link to="/crew">Crew → edit member</Link>.</p>}</fieldset>
    <label><span>Project repository <small>optional</small></span><input value={p.repo} onChange={e => p.setRepo(e.target.value)} placeholder="/Users/you/Developer/projects/my-app" /><small>Each run gets its own worktree. Leave blank for research or business work.</small></label>
    <label><span>Parallel assignments</span><div className="rx-seg">{[1, 2, 3].map(n => <button type="button" key={n} aria-pressed={p.concurrency === n} onClick={() => p.setConcurrency(n)}>{n}</button>)}</div></label>
    <footer><button type="button" onClick={p.onCancel}>Cancel</button><button className="rx-primary" disabled={p.busy || !p.online || !p.coordinator || !p.title.trim()}>Create room</button></footer>
  </form></div></section>;
}
