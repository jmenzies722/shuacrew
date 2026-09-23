import { Kbd, StatusGlyph, formatTokens } from "@shuacrew/ui";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Cable,
  CalendarClock,
  FileText,
  KanbanSquare,
  Radar,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useEffect } from "react";
import { selectLiveRuns, useLive } from "../lib/live";
import { ApprovalToasts } from "./ApprovalToasts";
import { CommandPalette } from "./CommandPalette";
import { KeymapOverlay } from "./KeymapOverlay";
import { LaunchSheet } from "./LaunchSheet";

export const NAV = [
  { to: "/", label: "Mission Control", icon: Radar, key: "m" },
  { to: "/board", label: "Board", icon: KanbanSquare, key: "b" },
  { to: "/specs", label: "Specs", icon: FileText, key: "p" },
  { to: "/schedules", label: "Schedules", icon: CalendarClock, key: "s" },
  { to: "/memory", label: "Memory", icon: BookOpen, key: "y" },
  { to: "/integrations", label: "Integrations", icon: Cable, key: "i" },
  { to: "/policy", label: "Policy & Audit", icon: ShieldCheck, key: "a" },
  { to: "/settings", label: "Settings", icon: Settings, key: "," },
] as const;

export function Shell() {
  useGlobalKeys();
  return (
    <div className="grid h-full grid-cols-[208px_1fr] grid-rows-[1fr_30px] bg-ink max-[900px]:grid-cols-[56px_1fr]">
      <NavRail />
      <main className="min-w-0 overflow-hidden" id="main">
        <Outlet />
      </main>
      <StatusBar />
      <CommandPalette />
      <LaunchSheet />
      <ApprovalToasts />
      <KeymapOverlay />
    </div>
  );
}

function NavRail() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const awaiting = useLive((s) => Object.keys(s.crew.approvals).length);
  const openLaunch = useLive((s) => s.openLaunch);
  return (
    <nav aria-label="Primary" className="row-span-1 flex flex-col gap-1 border-r border-line bg-panel px-2.5 py-3">
      <div className="mb-3 flex items-center gap-2.5 px-1.5">
        <img src="/icon.svg" alt="" className="h-7 w-7" />
        <span className="text-[15px] font-semibold tracking-[-0.01em] max-[900px]:hidden">ShuaCrew</span>
      </div>
      <button
        onClick={() => openLaunch()}
        className="mb-2 flex h-9 items-center gap-2 rounded-[var(--radius-m)] bg-amber px-3 text-[13px] font-semibold text-[#1a1204] transition hover:brightness-110 max-[900px]:justify-center max-[900px]:px-0"
      >
        <span className="text-[16px] leading-none">+</span>
        <span className="max-[900px]:hidden">Launch</span>
        <span className="ml-auto max-[900px]:hidden">
          <Kbd>⌘N</Kbd>
        </span>
      </button>
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? path === "/" : path.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={`group relative flex h-8.5 items-center gap-2.5 rounded-[var(--radius-m)] px-2.5 text-[13px] transition-colors max-[900px]:justify-center ${
              active ? "bg-raised text-fg" : "text-fg-2 hover:bg-raised hover:text-fg"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-amber" />}
            <Icon size={16} strokeWidth={1.75} />
            <span className="max-[900px]:hidden">{label}</span>
            {to === "/" && awaiting > 0 && (
              <span className="ml-auto rounded-full bg-[color-mix(in_srgb,var(--wait)_18%,transparent)] px-1.5 text-[10.5px] font-semibold text-wait max-[900px]:hidden">
                {awaiting}
              </span>
            )}
          </Link>
        );
      })}
      <div className="mt-auto px-2 text-[11px] text-fg-3 max-[900px]:hidden">
        <Kbd>⌘K</Kbd> anything · <Kbd>?</Kbd> keys
      </div>
    </nav>
  );
}

/** Always visible, always clickable: what's running, what needs you, what it's costing. */
function StatusBar() {
  const connection = useLive((s) => s.connection);
  const crew = useLive((s) => s.crew);
  const navigate = useNavigate();
  const live = selectLiveRuns(crew).filter((r) => r.status === "running" || r.status === "planning").length;
  const awaiting = Object.keys(crew.approvals).length;
  const limited = Object.entries(crew.limited);
  return (
    <footer
      className="col-span-2 flex items-center gap-5 border-t border-line bg-panel px-3 text-[11.5px] text-fg-2"
      aria-label="Status"
    >
      <button onClick={() => navigate({ to: "/" })} className="flex items-center gap-1.5 hover:text-fg">
        <StatusGlyph tone={live ? "live" : "idle"} size={7} />
        <span className="tabular-nums">{live}</span> running
      </button>
      <button onClick={() => navigate({ to: "/board" })} className={`flex items-center gap-1.5 hover:text-fg ${awaiting ? "text-wait" : ""}`}>
        <StatusGlyph tone={awaiting ? "wait" : "idle"} size={7} />
        <span className="tabular-nums">{awaiting}</span> awaiting you
      </button>
      <span className="flex items-center gap-1.5" title="Tokens used today across every runtime">
        <span className="mono tabular-nums text-fg">{formatTokens(crew.today.tokens)}</span> tokens today
        {crew.today.costUsd > 0 && <span className="mono tabular-nums text-fg">· ${crew.today.costUsd.toFixed(2)}</span>}
      </span>
      {limited.map(([runtime, info]) => (
        <span key={runtime} className="flex items-center gap-1.5 text-amber" title={info.message}>
          <StatusGlyph tone="live" size={7} />
          {runtime[0]?.toUpperCase()}
          {runtime.slice(1)}: limited until {new Date(info.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-1.5" role="status" aria-live="polite">
        <StatusGlyph tone={connection === "live" ? "ok" : connection === "connecting" ? "live" : "bad"} size={7} />
        {connection === "live" ? "Gateway" : connection === "connecting" ? "Connecting" : "Reconnecting"}
      </span>
    </footer>
  );
}

function useGlobalKeys() {
  const navigate = useNavigate();
  useEffect(() => {
    let pendingG = 0;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      const s = useLive.getState();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        s.setPalette(!s.paletteOpen);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        s.openLaunch();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "?") {
        s.setKeymap(!s.keymapOpen);
        return;
      }
      if (event.key === "g") {
        pendingG = Date.now();
        return;
      }
      if (Date.now() - pendingG < 1200) {
        const item = NAV.find((n) => n.key === event.key);
        if (item) navigate({ to: item.to });
        pendingG = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}
