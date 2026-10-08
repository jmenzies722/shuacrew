import { companionName } from "../lib/companion";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { RunView } from "@shuacrew/core/projections";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { since } from "@shuacrew/ui";
import { Activity, BookMarked, ChevronRight, BookOpen, BookOpenText, Brain, CalendarClock, CalendarDays, Circle, Clapperboard, Cpu, DoorOpen, FileText, GraduationCap, Hammer, House, Layers3, Library, MessageSquare, PanelLeftClose, PanelLeftOpen, Plug, Plus, Presentation, Rocket, Search, Settings, ShieldCheck, SquareKanban, SquarePen, SquareTerminal, Trash2, Users } from "lucide-react";
import { useLive } from "../lib/live";
import { HUBS, PRIMARY_HUBS, hubEntry, locate, type Hub } from "../lib/hubs";
import { isTopLevelWork, scopeRuns } from "../lib/crew";
import { groupSessions } from "../lib/session-list";
import { canRemoveSession, removeSession } from "../lib/session-removal";
import { SessionRemovalConfirmation } from "../components/SessionRemoval";
import { plain } from "../lib/plain";
import { useCompanion } from "../lib/companion";
import { sparkVars } from "../lib/spark-color";
import { toggleSparkPanel, useSparkPanel } from "../lib/spark-panel";
import { SparkCharacter } from "../components/SparkCharacter";
import "./hub-nav.css";

const PAGE_ICON: Record<string, typeof House> = {
  "/": MessageSquare, "/activity": CalendarDays, "/crew": Users, "/rooms": DoorOpen, "/floor": Layers3, "/studio": Clapperboard,
  "/ventures": Rocket, "/playbooks": BookMarked, "/specs": FileText, "/board": SquareKanban, "/schedules": CalendarClock,
  "/library": Library, "/memory": Brain, "/integrations": Plug, "/policy": ShieldCheck, "/observability": Activity, "/terminal": SquareTerminal,
};
const ICON = { home: House, crew: Users, build: Hammer, know: BookOpen, automations: CalendarClock, library: Library, system: Cpu } as const;
const LAST = "shuacrew.hubs.last";
const readLast = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(LAST) ?? "{}"); } catch { return {}; } };

/** Remember the last tab per hub, so a hub reopens where you left it. */
function useRemember(path: string) {
  useEffect(() => {
    const at = locate(path); if (!at) return;
    try { localStorage.setItem(LAST, JSON.stringify({ ...readLast(), [at.hub.id]: path })); } catch { /* ignore */ }
  }, [path]);
}

/** The rail: five hubs and Settings, labelled, with what's live on each. ⌘1–⌘5 jump between them. */
export function HubRail() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const here = locate(path)?.hub.id ?? (path.startsWith("/settings") ? "settings" : path.startsWith("/guide") ? "guide" : "");
  const waiting = useLive((s) => Object.keys(s.crew.approvals).length);
  const working = useLive((s) => Object.values(s.crew.runs).filter((r) => r.status === "running" || r.status === "planning").length);
  const prefs = useCompanion(), sparkOpen = useSparkPanel(), name = companionName(prefs);
  useRemember(path);
  const go = (hub: Hub) => void navigate({ to: hub.id === here ? hub.tabs[0]!.to : hubEntry(hub, readLast()) });
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const n = Number(e.key); if (!(n >= 1 && n <= PRIMARY_HUBS.length)) return;
      const t = e.target as HTMLElement | null; if (t?.closest("input,textarea,[contenteditable=true],.xterm")) return;
      e.preventDefault(); go(PRIMARY_HUBS[n - 1]!);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });
  const badge = (id: Hub["id"]) => (id === "home" && waiting ? { tone: "wait", n: waiting } : id === "crew" && working ? { tone: "live", n: working } : null);
  const item = (id: string, label: string, Icon: typeof House, onClick: () => void, title: string, b: { tone: string; n: number } | null = null) => {
    const on = here === id;
    return <button key={id} type="button" className={`hub ${on ? "is-on" : ""}`} aria-current={on ? "page" : undefined} onClick={onClick} aria-label={title}>
      {on && <motion.span layoutId="hub-on" className="hub-on" transition={{ type: "spring", stiffness: 560, damping: 40 }} />}
      {on && <motion.span layoutId="hub-bar" className="hub-bar" aria-hidden transition={{ type: "spring", stiffness: 520, damping: 36 }} />}
      <span className="hub-icon"><Icon size={19} strokeWidth={1.75} />{b && <em className={`hub-badge is-${b.tone}`}>{b.n}</em>}</span>
      {/* Icons only on the rail; the name slides out as a tooltip on hover or keyboard focus. */}
      <span className="hub-label" aria-hidden>{label}{title.includes("⌘") && <kbd>{title.slice(title.lastIndexOf("⌘"))}</kbd>}</span>
    </button>;
  };
  return <nav className="hub-rail" aria-label="Hubs">
    {/* Everything starts with Shua: the orb opens it (⌘J); the pen starts a fresh session (⌘N). */}
    <button type="button" className={`rail-shua${sparkOpen ? " is-on" : ""}${waiting ? " is-wait" : working ? " is-live" : ""}`} style={sparkVars(prefs.color)} onClick={toggleSparkPanel} title={`Ask ${name} anything  ⌘J`} aria-label={`Ask ${name}`} aria-pressed={sparkOpen}>
      <SparkCharacter preferences={prefs} size={30} crop="portrait" />
    </button>
    <button type="button" className="rail-new" onClick={() => void navigate({ to: "/" }).then(() => window.dispatchEvent(new Event("shuacrew:compose")))} title="New session  ⌘N" aria-label="New session"><SquarePen size={16} strokeWidth={1.8} /></button>
    <span className="rail-sep" aria-hidden />
    {PRIMARY_HUBS.map((hub, i) => item(hub.id, hub.label, ICON[hub.id], () => go(hub), `${hub.label} — ${hub.hint}  ⌘${i + 1}`, badge(hub.id)))}
    {item("system", "Tools", Cpu, () => go(HUBS.find(h => h.id === "system")!), "All tools")}
    <span className="hub-spacer" />
    {item("guide", "Guide", BookOpenText, () => void navigate({ to: "/guide" }), "Guide — everything ShuaCrew can do")}
    {item("settings", "Settings", Settings, () => void navigate({ to: "/settings" }), "Settings  ⌘,")}
  </nav>;
}

/** The hub's tabs, across the top of the page. The pill slides to the tab you pick. */
export function HubTabs() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const at = locate(path), sidebarWide = useSidebarWide();
  const strip = useRef<HTMLDivElement>(null), [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  // One tab is just the rail repeated ("Learn | Learn"): the page's own heading says where you are.
  if (!at || sidebarWide || at.hub.tabs.length < 2) return null;
  return <div className="hub-tabs" aria-label={at.hub.label} ref={strip}>
    <span className="hub-title">{at.hub.label}</span>
    <span className="hub-sep" aria-hidden="true" />
    {at.hub.tabs.map((tab) => {
      const on = tab === at.tab;
      return <Link key={tab.to} to={tab.to} aria-current={on ? "page" : undefined} className={`hub-tab ${on ? "is-on" : ""}`}>
        {on && <motion.span layoutId={`hub-tab-${at.hub.id}`} className="hub-tab-on" initial={false} transition={ready ? { type: "spring", stiffness: 520, damping: 38 } : { duration: 0 }} />}
        <span className="hub-tab-label">{tab.label}</span>
      </Link>;
    })}
  </div>;
}

// ── The sidebar: the whole platform in one column ─────────────────────────────────────────────
const WIDE = "shuacrew.sidebar";
// The rail is the sidebar now (the full column stays in code, unused): every screen gets its tabs across the top.
let wide = false;
void WIDE;
const wideListeners = new Set<() => void>();
export function setSidebarWide(_next: boolean) { wide = false; wideListeners.forEach((l) => l()); }
export function useSidebarWide() { const [, force] = useState(0); useEffect(() => { const l = () => force((n) => n + 1); wideListeners.add(l); return () => { wideListeners.delete(l); }; }, []); return wide; }

const LIVE = new Set(["running", "planning", "queued", "awaiting_approval"]);
/** How many sessions show before "Show more", and whether the Sessions / Tools sections are folded (remembered). */
const SESSIONS_SHORT = 8, SESSIONS_LONG = 40;
const ORDER = "shuacrew.side.order";
const FOLD = "shuacrew.side.folded";
const readFolded = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(FOLD) ?? "{}"); } catch { return {}; } };
/** The sidebar's width: drag its edge (Notion-style), double-click the edge to reset. */
const WIDTH = "shuacrew.side.width", WIDTH_DEFAULT = 248, WIDTH_MIN = 200, WIDTH_MAX = 380;
const readWidth = () => { try { const n = Number(localStorage.getItem(WIDTH)); return n >= WIDTH_MIN && n <= WIDTH_MAX ? n : WIDTH_DEFAULT; } catch { return WIDTH_DEFAULT; } };

type SideRun = RunView;
/**
 * The sidebar's session list: which groups, in what order. Gets every visible top-level session (already filtered to
 * the current scope) and returns titled groups, top to bottom.
 */
export function sidebarGroups(runs: SideRun[], now = Date.now()): Array<{ title: string; runs: SideRun[] }> {
  // Live work is pinned in "Now" (newest first) so it never scrolls under older days; the rest group by day as usual.
  const live = runs.filter((r) => LIVE.has(r.status) || r.pendingApprovals.length).sort((a, b) => b.updatedAt - a.updatedAt);
  const rest = groupSessions(runs.filter((r) => !live.includes(r)), "", now);
  return live.length ? [{ title: "Now", runs: live }, ...rest] : rest;
}

/**
 * Notion/Cursor-style sidebar: quiet actions up top (Search, Ask, New), the hubs as a flat page list, then every
 * session grouped by day, Guide and Settings at the foot. It sits on the window, not in a card. ⌘\ folds it to the rail.
 */
export function HubSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const at = locate(path), here = at?.hub.id ?? (path.startsWith("/settings") ? "settings" : path.startsWith("/guide") ? "guide" : "");
  const waiting = useLive((s) => Object.keys(s.crew.approvals).length);
  const runs = useLive((s) => s.crew.runs), scope = useLive((s) => s.scope);
  const connection = useLive((s) => s.connection);
  const setPalette = useLive((s) => s.setPalette);
  const prefs = useCompanion(), sparkOpen = useSparkPanel();
  useRemember(path);
  const go = (hub: Hub) => void navigate({ to: hub.id === here ? hub.tabs[0]!.to : hubEntry(hub, readLast()) });
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (t?.closest("input,textarea,[contenteditable=true],.xterm")) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const n = Number(e.key); if (!(n >= 1 && n <= PRIMARY_HUBS.length)) return;
      e.preventDefault(); go(ordered[n - 1]!);
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  });
  const working = Object.values(runs).filter((r) => r.status === "running" || r.status === "planning").length;
  const count = (id: Hub["id"]) => (id === "home" ? waiting : id === "crew" ? working : 0);
  const [folded, setFolded] = useState(readFolded), [more, setMore] = useState(false);
  // Your order: drag a section to move it. ⌘1…⌘6 follow what you see.
  const [order, setOrder] = useState<string[]>(() => { try { const v = JSON.parse(localStorage.getItem(ORDER) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } });
  const ordered = useMemo(() => [...PRIMARY_HUBS].sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99)), [order]);
  const [dragging, setDragging] = useState<string | null>(null), [over, setOver] = useState<string | null>(null);
  const drop = (target: string) => {
    if (!dragging || dragging === target) return;
    const ids = ordered.map((h) => h.id as string).filter((id) => id !== dragging);
    ids.splice(ids.indexOf(target), 0, dragging);
    setOrder(ids); try { localStorage.setItem(ORDER, JSON.stringify(ids)); } catch { /* ignore */ }
  };
  const fold = (key: string) => setFolded((f) => { const next = { ...f, [key]: !f[key] }; try { localStorage.setItem(FOLD, JSON.stringify(next)); } catch { /* ignore */ } return next; });
  const visible = useMemo(() => Object.values(scopeRuns(runs, scope)).filter((r) => isTopLevelWork(r, runs) && !r.labels?.some((l) => l === "buddy" || l === "learning")), [runs, scope]);
  const groups = useMemo(() => {
    let left = more ? SESSIONS_LONG : SESSIONS_SHORT;
    return sidebarGroups(visible).map((g) => { const shown = g.runs.slice(0, Math.max(0, left)); left -= shown.length; return { ...g, runs: shown }; }).filter((g) => g.runs.length);
  }, [visible, more]);
  const liveCount = visible.filter((r) => LIVE.has(r.status)).length;
  const [width, setWidth] = useState(readWidth);
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = width; let last = startW;
    document.documentElement.dataset.sideResizing = "";
    const move = (m: PointerEvent) => { last = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, startW + m.clientX - startX)); setWidth(last); };
    const up = () => { window.removeEventListener("pointermove", move); delete document.documentElement.dataset.sideResizing; try { localStorage.setItem(WIDTH, String(last)); } catch { /* ignore */ } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, { once: true });
  };
  const resetWidth = () => { setWidth(WIDTH_DEFAULT); try { localStorage.removeItem(WIDTH); } catch { /* ignore */ } };
  const name = companionName(prefs);
  const tools = HUBS.find((h) => h.id === "system")!;
  return <nav className="side" aria-label="Sidebar" style={{ "--side-w": `${width}px` } as React.CSSProperties}>
    <div className="side-actions">
      <div className="side-top">
        <button type="button" className="side-row side-search" onClick={() => setPalette(true)} title="Search sessions, screens, actions  ⌘K"><i className="side-ico"><Search size={15} strokeWidth={1.8} /></i><span>Search</span><kbd>⌘K</kbd></button>
        <button type="button" className="side-fold" onClick={() => setSidebarWide(false)} title="Collapse sidebar  ⌘\\" aria-label="Collapse sidebar"><PanelLeftClose size={15} /></button>
      </div>
      <button type="button" className={`side-row side-spark ${sparkOpen ? "is-on" : ""}`} style={sparkVars(prefs.color)} onClick={toggleSparkPanel} title={`Ask ${name} anything  ⌘J`}>
        <i className="side-ico side-spark-av"><SparkCharacter preferences={prefs} size={18} crop="portrait" /></i><span>Ask {name}</span><kbd>⌘J</kbd>
      </button>
      <button type="button" className="side-row side-new" onClick={() => void navigate({ to: "/" }).then(() => window.dispatchEvent(new Event("shuacrew:compose")))}><i className="side-ico"><SquarePen size={15} strokeWidth={1.8} /></i><span>New session</span><kbd>⌘N</kbd></button>
    </div>
    <div className="side-scroll">
      <div className="side-group">
        {ordered.map((hub) => { const Icon = ICON[hub.id], selected = here === hub.id; return <div key={hub.id} className={`side-page${dragging === hub.id ? " is-dragging" : ""}${over === hub.id && dragging !== hub.id ? " is-over" : ""}`} data-hub={hub.id}
          draggable onDragStart={(e) => { setDragging(hub.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", hub.id); }}
          onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(hub.id); } }} onDragLeave={() => setOver((o) => (o === hub.id ? null : o))}
          onDrop={(e) => { e.preventDefault(); drop(hub.id); setOver(null); }} onDragEnd={() => { setDragging(null); setOver(null); }}>
          <Link to={hub.tabs[0]!.to} className={`side-row ${selected && hub.tabs.length <= 1 ? "is-on" : selected ? "is-open" : ""}`} aria-current={selected ? "page" : undefined} title={hub.hint}><i className="side-ico"><Icon size={16} strokeWidth={1.7} /></i><span>{hub.label}</span>{count(hub.id) > 0 && <em className={hub.id === "home" ? "is-wait" : "is-live"}>{count(hub.id)}</em>}</Link>
          {selected && hub.tabs.length > 1 && <div className="side-children">{hub.tabs.map((tab) => <Link key={tab.to} to={tab.to} className={`side-row side-child ${at?.tab === tab && !path.startsWith("/sessions/") ? "is-on" : ""}`} aria-current={at?.tab === tab ? "page" : undefined}><span>{tab.label}</span></Link>)}</div>}
        </div>; })}
      </div>
      <Section id="tools" label="Tools" folded={folded.tools ?? here !== "system"} onFold={fold}>
        {tools.tabs.map((tab) => <Link key={tab.to} to={tab.to} className={`side-row ${at?.tab === tab ? "is-on" : ""}`}><span>{tab.label}</span></Link>)}
      </Section>
      <Section id="sessions" label="Sessions" folded={!!folded.sessions} onFold={fold} badge={folded.sessions && liveCount ? `${liveCount} live` : undefined}
        action={<button type="button" className="side-section-act" onClick={() => void navigate({ to: "/" }).then(() => window.dispatchEvent(new Event("shuacrew:compose")))} title="New session  ⌘N" aria-label="New session"><Plus size={13} /></button>}>
        {!groups.length && <p className="side-empty">Your sessions will appear here.</p>}
        {groups.map((g) => <div key={g.title} className="side-day"><h4>{g.title}</h4>{g.runs.map((r) => <SessionRow key={r.id} run={r} on={path === `/sessions/${r.id}`} />)}</div>)}
        {visible.length > SESSIONS_SHORT && <button type="button" className="side-more" onClick={() => setMore((v) => !v)}>{more ? "Show less" : "Show more"}</button>}
      </Section>
    </div>
    <div className="side-foot">
      <span className={`side-conn is-${connection}`} title={connection === "live" ? "Gateway live" : connection === "connecting" ? "Connecting to the gateway" : "Gateway offline"}><i />{connection === "live" ? "Live" : connection === "connecting" ? "Connecting" : "Offline"}</span>
      <button type="button" className={`side-foot-btn ${here === "guide" ? "is-on" : ""}`} onClick={() => void navigate({ to: "/guide" })} title="Guide — everything ShuaCrew can do" aria-label="Guide"><BookOpenText size={15} strokeWidth={1.8} /></button>
      <button type="button" className={`side-foot-btn ${here === "settings" ? "is-on" : ""}`} onClick={() => void navigate({ to: "/settings" })} title="Settings  ⌘," aria-label="Settings"><Settings size={15} strokeWidth={1.8} /></button>
    </div>
    <div className="side-resize" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onPointerDown={drag} onDoubleClick={resetWidth} title="Drag to resize · double-click to reset" />
  </nav>;
}

/** A Notion-style section: a quiet label that folds what's under it, with an action on hover. */
function Section({ id, label, folded, onFold, action, badge, children }: { id: string; label: string; folded: boolean; onFold: (id: string) => void; action?: React.ReactNode; badge?: string; children: React.ReactNode }) {
  return <div className={`side-section ${folded ? "" : "is-open"}`}>
    <div className="side-section-head">
      <button type="button" className="side-section-label" aria-expanded={!folded} onClick={() => onFold(id)}>{label}<ChevronRight size={12} className="side-chev" />{badge && <em>{badge}</em>}</button>
      {action}
    </div>
    <AnimatePresence initial={false}>{!folded && <motion.div key="body" className="side-section-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}>{children}</motion.div>}</AnimatePresence>
  </div>;
}

/** One session: a status dot, its title on one line, and when it last moved — or a delete button on hover. */
function SessionRow({ run, on }: { run: SideRun; on: boolean }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false), [removing, setRemoving] = useState(false), [error, setError] = useState("");
  const live = LIVE.has(run.status), allowed = canRemoveSession(run.status);
  const remove = async () => {
    setRemoving(true); setError("");
    try { await removeSession(run.id, run.status); setConfirm(false); if (on) await navigate({ to: "/" }); }
    catch (e) { setError((e as Error).message); } finally { setRemoving(false); }
  };
  const tone = run.status === "awaiting_approval" || run.pendingApprovals.length ? "wait" : live ? "live" : run.status === "failed" ? "bad" : "done";
  return <Dialog.Root open={confirm} onOpenChange={(o) => { if (!removing) { setConfirm(o); setError(""); } }}>
    <div className={`side-run ${on ? "is-on" : ""}`}>
      <Link to="/sessions/$id" params={{ id: run.id }} aria-current={on ? "page" : undefined} title={plain(run.ticker) || run.title}>
        <i className={`side-dot is-${tone}`} /><span>{run.title || run.ask || "Untitled session"}</span><small>{live ? "now" : since(run.updatedAt).replace(/ ago$/, "").replace("just now", "now")}</small>
      </Link>
      {allowed && <Dialog.Trigger asChild><button type="button" className="side-run-del" aria-label={`Delete session: ${run.title}`} title="Delete session"><Trash2 size={13} /></button></Dialog.Trigger>}
    </div>
    <SessionRemovalConfirmation title={run.title} error={error} removing={removing} allowed={allowed} onConfirm={() => void remove()} />
  </Dialog.Root>;
}

/** The sidebar: one slim rail. */
export function CompactRail() {
  return <div className="rail-wrap"><HubRail /></div>;
}
