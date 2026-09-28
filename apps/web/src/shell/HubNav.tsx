import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Activity, BookMarked, BookOpen, BookOpenText, Brain, CalendarClock, CalendarDays, Circle, Clapperboard, Cpu, DoorOpen, FileText, GraduationCap, Hammer, House, LayoutDashboard, Library, MessageSquare, PanelLeftClose, PanelLeftOpen, Plug, Plus, Rocket, Settings, ShieldCheck, SquareKanban, SquareTerminal, Users } from "lucide-react";
import { useLive } from "../lib/live";
import { HUBS, hubEntry, locate, type Hub } from "../lib/hubs";
import { isTopLevelWork } from "../lib/crew";
import { plain } from "../lib/plain";
import { useCompanion } from "../lib/companion";
import { sparkVars } from "../lib/spark-color";
import { toggleSparkPanel, useSparkPanel } from "../lib/spark-panel";
import { SparkCharacter } from "../components/SparkCharacter";
import "./hub-nav.css";

const PAGE_ICON: Record<string, typeof House> = {
  "/": MessageSquare, "/activity": CalendarDays, "/crew": Users, "/rooms": DoorOpen, "/floor": LayoutDashboard, "/studio": Clapperboard,
  "/ventures": Rocket, "/playbooks": BookMarked, "/specs": FileText, "/board": SquareKanban, "/schedules": CalendarClock,
  "/library": Library, "/memory": Brain, "/learn": GraduationCap, "/integrations": Plug, "/policy": ShieldCheck, "/observability": Activity, "/terminal": SquareTerminal,
};
const ICON = { home: House, crew: Users, build: Hammer, know: BookOpen, system: Cpu } as const;
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
      const n = Number(e.key); if (!(n >= 1 && n <= HUBS.length)) return;
      const t = e.target as HTMLElement | null; if (t?.closest("input,textarea,[contenteditable=true],.xterm")) return;
      e.preventDefault(); go(HUBS[n - 1]!);
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
    {HUBS.map((hub, i) => item(hub.id, hub.label, ICON[hub.id], () => go(hub), `${hub.label} — ${hub.hint}  ⌘${i + 1}`, badge(hub.id)))}
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
  return <div className="hub-tabs" role="tablist" aria-label={at.hub.label} ref={strip}>
    <span className="hub-title">{at.hub.label}</span>
    <span className="hub-sep" aria-hidden="true" />
    {at.hub.tabs.map((tab) => {
      const on = tab === at.tab;
      return <Link key={tab.to} to={tab.to} role="tab" aria-selected={on} className={`hub-tab ${on ? "is-on" : ""}`}>
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

/**
 * Linear-style sidebar: Ask Spark and New session up top, the five hubs with the active one unfolded into its pages,
 * your recent sessions live, Settings at the bottom. ⌘\ folds it back to the slim rail.
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
      const n = Number(e.key); if (!(n >= 1 && n <= HUBS.length)) return;
      e.preventDefault(); go(HUBS[n - 1]!);
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  });
  const all = Object.values(runs);
  const working = all.filter((r) => r.status === "running" || r.status === "planning").length;
  const recent = all.filter((r) => isTopLevelWork(r, runs)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const count = (id: Hub["id"]) => (id === "home" ? waiting : id === "crew" ? working : 0);
  const name = prefs.nickname || "Spark";
  return <nav className="side" aria-label="Sidebar">
    <div className="side-brand">
      <span className="side-logo" aria-hidden><svg viewBox="0 0 32 32" width="22" height="22" fill="none"><circle cx="16" cy="16" r="10" stroke="currentColor" strokeOpacity=".35" strokeWidth=".9"/><circle className="side-logo-core" cx="16" cy="16" r="4.8" strokeWidth="2.4"/><g className="side-logo-crew"><circle cx="16" cy="6" r="2.3"/><circle cx="24.7" cy="21" r="2.3"/><circle cx="7.3" cy="21" r="2.3"/></g></svg></span>
      <span className="side-brand-text"><b>Shua <em>Crew</em></b><small className={`is-${connection}`}><i />{connection === "live" ? "Gateway live" : connection === "connecting" ? "Connecting" : "Gateway offline"}</small></span>
      <button type="button" className="side-fold" onClick={() => setSidebarWide(false)} title="Collapse sidebar  ⌘\\" aria-label="Collapse sidebar"><PanelLeftClose size={15} /></button>
    </div>
    <button type="button" className={`side-spark ${sparkOpen ? "is-on" : ""}`} style={sparkVars(prefs.color)} onClick={toggleSparkPanel} title={`${name}  ⌘J`}>
      <span className="side-spark-av"><SparkCharacter preferences={prefs} size={32} crop="portrait" /></span>
      <span className="side-spark-text"><b>Ask {name}</b><small>anything, anywhere</small></span><kbd>⌘J</kbd>
    </button>
    <button type="button" className="side-new" onClick={() => void navigate({ to: "/" }).then(() => window.dispatchEvent(new Event("shuacrew:compose")))}><Plus size={15} /> New session<kbd>⌘N</kbd></button>
    <div className="side-scroll">
    {HUBS.map((hub) => <div key={hub.id} className="side-group">
      {hub.id !== "home" && <div className="side-label">{hub.label}</div>}
      {hub.tabs.map((tab) => { const on = at?.tab === tab, Icon = PAGE_ICON[tab.to] ?? Circle, n = tab.to === "/" ? waiting : tab.to === "/crew" ? working : 0;
        return <Link key={tab.to} to={tab.to} className={`side-row ${on ? "is-on" : ""}`} aria-current={on ? "page" : undefined} title={`${tab.label} — ${hub.hint}`}>
          {on && <motion.span layoutId="side-hub-on" className="side-hub-on" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}
          <i className="side-ico"><Icon size={16} strokeWidth={1.8} /></i><span>{tab.label}</span>{n > 0 && <em className={tab.to === "/" ? "is-wait" : "is-live"}>{n}</em>}
        </Link>; })}
    </div>)}
    {recent.length > 0 && <div className="side-group side-recent">
      <div className="side-label">Recent</div>
      {recent.map((r) => { const on = path === `/sessions/${r.id}`; return <Link key={r.id} to="/sessions/$id" params={{ id: r.id }} className={`side-run ${on ? "is-on" : ""}`} title={plain(r.ticker) || r.title}>
        <i className={`side-dot is-${LIVE.has(r.status) ? (r.status === "awaiting_approval" ? "wait" : "live") : r.status === "failed" ? "bad" : "done"}`} /><span>{r.title}</span>
      </Link>; })}
    </div>}
    </div>
    <div className="side-foot">
      <button type="button" className={`side-row ${here === "guide" ? "is-on" : ""}`} onClick={() => void navigate({ to: "/guide" })}><i className="side-ico" data-hub="guide"><BookOpenText size={14} strokeWidth={2} /></i><span>Guide</span></button>
      <button type="button" className={`side-row ${here === "settings" ? "is-on" : ""}`} onClick={() => void navigate({ to: "/settings" })}><i className="side-ico" data-hub="settings"><Settings size={14} strokeWidth={2} /></i><span>Settings</span><kbd>⌘,</kbd></button>
    </div>
  </nav>;
}

/** The slim rail, with a way back to the full sidebar. */
export function CompactRail() {
  return <div className="rail-wrap"><HubRail /><button type="button" className="rail-unfold" onClick={() => setSidebarWide(true)} title="Expand sidebar  ⌘\\" aria-label="Expand sidebar"><PanelLeftOpen size={15} /></button></div>;
}
