import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { since } from "@shuacrew/ui";
import { Activity, BookMarked, ChevronRight, BookOpen, BookOpenText, Brain, CalendarClock, CalendarDays, Circle, Clapperboard, Cpu, DoorOpen, FileText, GraduationCap, Hammer, House, Layers3, Library, MessageSquare, PanelLeftClose, PanelLeftOpen, Plug, Plus, Presentation, Rocket, Settings, ShieldCheck, SquareKanban, SquareTerminal, Users } from "lucide-react";
import { useLive } from "../lib/live";
import { HUBS, PRIMARY_HUBS, hubEntry, locate, type Hub } from "../lib/hubs";
import { isTopLevelWork } from "../lib/crew";
import { plain } from "../lib/plain";
import { useCompanion } from "../lib/companion";
import { sparkVars } from "../lib/spark-color";
import { toggleSparkPanel, useSparkPanel } from "../lib/spark-panel";
import { SparkCharacter } from "../components/SparkCharacter";
import { LogoMark } from "../lib/motion";
import "./hub-nav.css";

const PAGE_ICON: Record<string, typeof House> = {
  "/": MessageSquare, "/activity": CalendarDays, "/crew": Users, "/rooms": DoorOpen, "/floor": Layers3, "/studio": Clapperboard,
  "/ventures": Rocket, "/playbooks": BookMarked, "/specs": FileText, "/board": SquareKanban, "/schedules": CalendarClock,
  "/library": Library, "/memory": Brain, "/learn": GraduationCap, "/teach": Presentation, "/integrations": Plug, "/policy": ShieldCheck, "/observability": Activity, "/terminal": SquareTerminal,
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
    return <button key={id} type="button" className={`hub ${on ? "is-on" : ""}`} aria-current={on ? "page" : undefined} onClick={onClick} title={title}>
      {on && <motion.span layoutId="hub-on" className="hub-on" transition={{ type: "spring", stiffness: 560, damping: 40 }} />}
      <span className="hub-icon"><Icon size={19} strokeWidth={1.75} />{b && <em className={`hub-badge is-${b.tone}`}>{b.n}</em>}</span>
      <span className="hub-label">{label}</span>
    </button>;
  };
  return <nav className="hub-rail" aria-label="Hubs">
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
  if (!at || sidebarWide) return null;
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
let wide = (() => { try { return localStorage.getItem(WIDE) !== "0"; } catch { return true; } })();
const wideListeners = new Set<() => void>();
export function setSidebarWide(next: boolean) { wide = next; try { localStorage.setItem(WIDE, next ? "1" : "0"); } catch { /* ignore */ } wideListeners.forEach((l) => l()); }
export function useSidebarWide() { const [, force] = useState(0); useEffect(() => { const l = () => force((n) => n + 1); wideListeners.add(l); return () => { wideListeners.delete(l); }; }, []); return wide; }

const LIVE = new Set(["running", "planning", "queued", "awaiting_approval"]);
/** Recent sessions in the sidebar: folded or open (remembered), and how many show before "Show more". */
const RECENT_OPEN = "shuacrew.side.recentOpen", RECENT_SHORT = 5, RECENT_LONG = 12;
const readRecentOpen = () => { try { return localStorage.getItem(RECENT_OPEN) !== "0"; } catch { return true; } };

/**
 * Linear-style sidebar: Ask Spark and New session up top, then your sessions (live ones first) so they're always in
 * view, then the five hubs' pages, Settings at the bottom. ⌘\ folds it back to the slim rail.
 */
export function HubSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const at = locate(path), here = at?.hub.id ?? (path.startsWith("/settings") ? "settings" : path.startsWith("/guide") ? "guide" : "");
  const waiting = useLive((s) => Object.keys(s.crew.approvals).length);
  const runs = useLive((s) => s.crew.runs);
  const connection = useLive((s) => s.connection);
  const prefs = useCompanion(), sparkOpen = useSparkPanel();
  useRemember(path);
  const go = (hub: Hub) => void navigate({ to: hub.id === here ? hub.tabs[0]!.to : hubEntry(hub, readLast()) });
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (t?.closest("input,textarea,[contenteditable=true],.xterm")) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const n = Number(e.key); if (!(n >= 1 && n <= PRIMARY_HUBS.length)) return;
      e.preventDefault(); go(PRIMARY_HUBS[n - 1]!);
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  });
  const all = Object.values(runs);
  const working = all.filter((r) => r.status === "running" || r.status === "planning").length;
  const [recentOpen, setRecentOpen] = useState(readRecentOpen), [recentMore, setRecentMore] = useState(false);
  const toggleRecent = () => setRecentOpen((v) => { try { localStorage.setItem(RECENT_OPEN, v ? "0" : "1"); } catch { /* ignore */ } return !v; });
  const recentAll = all.filter((r) => isTopLevelWork(r, runs)).sort((a, b) => Number(LIVE.has(b.status)) - Number(LIVE.has(a.status)) || b.updatedAt - a.updatedAt);
  const recent = recentAll.slice(0, recentMore ? RECENT_LONG : RECENT_SHORT);
  const liveCount = recentAll.filter((r) => LIVE.has(r.status)).length;
  const count = (id: Hub["id"]) => (id === "home" ? waiting : id === "crew" ? working : 0);
  const name = prefs.nickname || "Spark";
  return <nav className="side" aria-label="Sidebar">
    <div className="side-brand">
      <span className="side-logo" aria-hidden><LogoMark size={24} bare /></span>
      <span className="side-brand-text"><b>Shua <em>Crew</em></b><small className={`is-${connection}`}><i />{connection === "live" ? "Gateway live" : connection === "connecting" ? "Connecting" : "Gateway offline"}</small></span>
      <button type="button" className="side-fold" onClick={() => setSidebarWide(false)} title="Collapse sidebar  ⌘\\" aria-label="Collapse sidebar"><PanelLeftClose size={15} /></button>
    </div>
    <button type="button" className={`side-spark ${sparkOpen ? "is-on" : ""}`} style={sparkVars(prefs.color)} onClick={toggleSparkPanel} title={`${name}  ⌘J`}>
      <span className="side-spark-av"><SparkCharacter preferences={prefs} size={32} crop="portrait" /></span>
      <span className="side-spark-text"><b>Ask {name}</b><small>anything, anywhere</small></span><kbd>⌘J</kbd>
    </button>
    <button type="button" className="side-new" onClick={() => void navigate({ to: "/" }).then(() => window.dispatchEvent(new Event("shuacrew:compose")))}><Plus size={15} /> New session<kbd>⌘N</kbd></button>
    <div className="side-scroll">
    {recent.length > 0 && <div className={`side-group side-recent ${recentOpen ? "is-open" : ""}`}>
      <div className="side-recent-head">
        <button type="button" className="side-label side-recent-toggle" aria-expanded={recentOpen} onClick={toggleRecent}>
          <ChevronRight size={12} className="side-recent-chev" />Recent sessions{!recentOpen && liveCount > 0 && <em className="side-recent-live">{liveCount} live</em>}
        </button>
        <Link to="/" className="side-recent-all" title="All sessions">All</Link>
      </div>
      <AnimatePresence initial={false}>{recentOpen && <motion.div key="recent" className="side-recent-list" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}>
        {recent.map((r) => { const on = path === `/sessions/${r.id}`, live = LIVE.has(r.status); return <Link key={r.id} to="/sessions/$id" params={{ id: r.id }} className={`side-run ${on ? "is-on" : ""}`} title={plain(r.ticker) || r.title}>
          <i className={`side-dot is-${live ? (r.status === "awaiting_approval" ? "wait" : "live") : r.status === "failed" ? "bad" : "done"}`} /><span>{r.title}</span><small>{live ? "now" : since(r.updatedAt).replace(/ ago$/, "").replace("just now", "now")}</small>
        </Link>; })}
        {recentAll.length > RECENT_SHORT && <button type="button" className="side-recent-more" onClick={() => setRecentMore((v) => !v)}>{recentMore ? "Show less" : `Show ${Math.min(RECENT_LONG, recentAll.length) - RECENT_SHORT} more`}</button>}
      </motion.div>}</AnimatePresence>
    </div>}
    {PRIMARY_HUBS.map(hub => { const Icon = ICON[hub.id], selected = here === hub.id; return <div key={hub.id} className="side-group workspace-section">
      <Link to={hub.tabs[0]!.to} className={`side-row workspace-primary ${selected ? "is-on" : ""}`} aria-current={selected ? "page" : undefined} title={hub.hint}><i className="side-ico"><Icon size={17} strokeWidth={1.6} /></i><span>{hub.label}</span>{count(hub.id) > 0 && <em>{count(hub.id)}</em>}</Link>
      {selected && <div className="workspace-children">{hub.tabs.map(tab => <Link key={tab.to} to={tab.to} className={`side-row ${at?.tab === tab ? "is-current" : ""}`} aria-current={at?.tab === tab ? "page" : undefined}><span>{tab.label}</span></Link>)}</div>}
    </div>; })}
    <details className="workspace-tools" open={here === "system" || undefined}><summary>All tools <ChevronRight size={12} /></summary>{HUBS.find(h => h.id === "system")!.tabs.map(tab => <Link key={tab.to} to={tab.to} className="side-row">{tab.label}</Link>)}</details>
    </div>
    <div className="side-foot">
      <button type="button" className={`side-row side-guide ${here === "guide" ? "is-on" : ""}`} onClick={() => void navigate({ to: "/guide" })}><i className="side-ico" data-hub="guide"><BookOpenText size={14} strokeWidth={2} /></i><span>Guide</span></button>
      <button type="button" className={`side-row ${here === "settings" ? "is-on" : ""}`} onClick={() => void navigate({ to: "/settings" })}><i className="side-ico" data-hub="settings"><Settings size={14} strokeWidth={2} /></i><span>Settings</span><kbd>⌘,</kbd></button>
    </div>
  </nav>;
}

/** The slim rail, with a way back to the full sidebar. */
export function CompactRail() {
  return <div className="rail-wrap"><HubRail /><button type="button" className="rail-unfold" onClick={() => setSidebarWide(true)} title="Expand sidebar  ⌘\\" aria-label="Expand sidebar"><PanelLeftOpen size={15} /></button></div>;
}
