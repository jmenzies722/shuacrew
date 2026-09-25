import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { BookOpen, Cpu, Hammer, House, Settings, Users } from "lucide-react";
import { useLive } from "../lib/live";
import { HUBS, hubEntry, locate, type Hub } from "../lib/hubs";
import "./hub-nav.css";

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
  const here = locate(path)?.hub.id ?? (path.startsWith("/settings") ? "settings" : "");
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
    {item("settings", "Settings", Settings, () => void navigate({ to: "/settings" }), "Settings  ⌘,")}
  </nav>;
}

/** The hub's tabs, across the top of the page. The pill slides to the tab you pick. */
export function HubTabs() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const at = locate(path);
  const strip = useRef<HTMLDivElement>(null), [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (!at) return null;
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
