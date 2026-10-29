import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Briefcase, MessageCircle, Plug, Settings as Gear } from "lucide-react";
import { useLive } from "../lib/live";
import { groupWork, hrefOf, parseRoute, routeForPath, type Route, type Tab } from "./model";
import { Work } from "./Work";
import { Tools } from "./Tools";
import { Settings } from "./Settings";

// Shua's brain is the proven one (the same conversation as the notch) — and the heaviest part, so it loads on its own.
const Chat = lazy(() => import("./Chat").then((m) => ({ default: m.Chat })));

export const CLASSIC_KEY = "shuacrew.app";
/** Back to the full classic app (it stays until this one has proven itself). */
export function openClassic(path = "/") {
  try { localStorage.setItem(CLASSIC_KEY, "classic"); } catch { /* private mode: the link still works once */ }
  location.href = path;
}

function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route, (r) => { location.hash = hrefOf(r); }];
}

const NAV: Array<{ tab: Tab; label: string; icon: typeof MessageCircle }> = [
  { tab: "chat", label: "Chat", icon: MessageCircle },
  { tab: "work", label: "Work", icon: Briefcase },
  { tab: "tools", label: "Tools", icon: Plug },
  { tab: "settings", label: "Settings", icon: Gear },
];
const TITLES: Record<Tab, string> = { chat: "Shua", work: "Work", tools: "Tools", settings: "Settings" };

export function App() {
  const [route, go] = useRoute();
  const connection = useLive((s) => s.connection);
  const runs = useLive((s) => s.crew.runs);
  const work = useMemo(() => groupWork(runs), [runs]);

  // The Mac app drives the page from its menus (⌘N, ⌘1…) and Shua's `go` through this bridge: the lean app answers
  // what it has, and hands anything else to the classic app.
  useEffect(() => {
    window.shuacrew = {
      navigate: (to) => { const r = routeForPath(to); if (r) go(r); else openClassic(to); },
      launch: () => { go({ tab: "work" }); setTimeout(() => window.dispatchEvent(new Event("shua:new-work")), 0); },
      compose: () => go({ tab: "chat" }),
      shortcuts: () => {}, fullscreen: () => {}, palette: () => {}, terminal: () => openClassic("/terminal"), folderPicked: () => {},
    };
    (window as unknown as { __appActive?: (on: boolean) => void }).__appActive ??= () => {};
  }, []);

  const running = work.running.length, waiting = work.needsYou.length;
  return (
    <div className="app">
      <header className="bar">
        <span className="bar-title">{TITLES[route.tab]}</span>
        <span className="bar-status">
          {running > 0 && <span><span className="dot is-run" style={{ display: "inline-block", marginRight: 6 }} />{running} working</span>}
          <span title={connection === "live" ? "Connected to your gateway" : connection === "offline" ? "Gateway unreachable — retrying" : "Connecting…"}>
            <span className={`dot ${connection === "live" ? "is-live" : connection === "offline" ? "is-off" : "is-wait"}`} style={{ display: "inline-block", marginRight: 6 }} />
            {connection === "live" ? "Live" : connection === "offline" ? "Offline" : "Connecting"}
          </span>
        </span>
      </header>
      <nav className="side" aria-label="Sections">
        {NAV.map(({ tab, label, icon: Icon }) => (
          <a key={tab} className="nav" href={hrefOf({ tab })} aria-current={route.tab === tab ? "page" : undefined}>
            <Icon size={16} strokeWidth={1.8} /> {label}
            {tab === "work" && waiting > 0 && <span className="count" aria-label={`${waiting} need you`}>{waiting}</span>}
          </a>
        ))}
        <div className="side-foot">
          <button type="button" className="nav btn is-quiet" style={{ justifyContent: "flex-start", border: 0 }} onClick={() => openClassic()}>
            <ArrowLeftRight size={14} /> Classic app
          </button>
        </div>
      </nav>
      <main className="main">
        {route.tab === "chat" && <Suspense fallback={<div className="skeleton">Waking Shua…</div>}><Chat /></Suspense>}
        {route.tab === "work" && <Work selected={route.id} onSelect={(id) => go({ tab: "work", ...(id ? { id } : {}) })} groups={work} />}
        {route.tab === "tools" && <Tools />}
        {route.tab === "settings" && <Settings />}
      </main>
    </div>
  );
}
