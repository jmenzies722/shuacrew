import { Kbd, StatusGlyph, formatTokens } from "@shuacrew/ui";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { SquareTerminal, Waypoints } from "lucide-react";
import { Bell, BookOpen, Cable, CalendarClock, FileText, House, KanbanSquare, MessagesSquare, Radar, Search, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { watchTitleBar } from "../lib/native";
import { selectLiveRuns, useLive } from "../lib/live";
import { ApprovalToasts } from "./ApprovalToasts";
import { CommandPalette } from "./CommandPalette";
import { KeymapOverlay } from "./KeymapOverlay";
import { LaunchSheet } from "./LaunchSheet";

export const NAV = [
  { to: "/", label: "Sessions", icon: MessagesSquare, key: "s" },
  { to: "/floor", label: "Crew floor — agents working, live", icon: Waypoints, key: "f" },
  { to: "/terminal", label: "Terminal", icon: SquareTerminal, key: "t" },
  { to: "/activity", label: "Activity", icon: Radar, key: "m" },
  { to: "/board", label: "Board", icon: KanbanSquare, key: "b" },
  { to: "/specs", label: "Specs", icon: FileText, key: "p" },
  { to: "/schedules", label: "Schedules", icon: CalendarClock, key: "c" },
  { to: "/memory", label: "Memory", icon: BookOpen, key: "y" },
  { to: "/integrations", label: "Integrations", icon: Cable, key: "i" },
  { to: "/policy", label: "Policy & Audit", icon: ShieldCheck, key: "a" },
  { to: "/settings", label: "Settings", icon: Settings, key: "," },
] as const;

/** A fresh session: the Sessions page with the composer focused. ⌘N, the menu and the tray all land here. */
export function newSession(navigate: ReturnType<typeof useNavigate>) {
  void navigate({ to: "/" }).then(() => window.dispatchEvent(new Event("shuacrew:compose")));
}

export function Shell() {
  useGlobalKeys();
  return (
    <div className="grid h-full grid-cols-[56px_1fr] grid-rows-[38px_1fr] bg-ink" data-frame>
      <TopBar />
      <IconRail />
      <main className="min-h-0 min-w-0 overflow-hidden" id="main">
        <Outlet />
      </main>
      <CommandPalette />
      <LaunchSheet />
      <ApprovalToasts />
      <KeymapOverlay />
    </div>
  );
}

/** Kiro Crew's top bar: where you are, search for anything, and what needs you. */
function TopBar() {
  const bar = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const connection = useLive((s) => s.connection);
  const crew = useLive((s) => s.crew);
  const setPalette = useLive((s) => s.setPalette);
  const approvals = Object.values(crew.approvals).sort((a, b) => a.seq - b.seq);
  const running = selectLiveRuns(crew).filter((r) => r.status === "running" || r.status === "planning").length;
  const limited = Object.entries(crew.limited);
  useEffect(() => (bar.current ? watchTitleBar(bar.current) : undefined), []);

  return (
    <header ref={bar} className="col-span-2 flex items-center gap-3 px-3 [[data-shell=mac]_&]:pl-[84px]" aria-label="Top bar">
      <img src="/icon.svg" alt="ShuaCrew" className="h-6 w-6 [[data-shell=mac]_&]:hidden" />
      <span className="flex h-7 items-center gap-1.5 rounded-[8px] bg-[var(--amber-soft)] px-2.5 text-[12px] font-medium text-fg" data-no-drag>
        <House size={13} className="text-amber" /> Local
      </span>
      <div className="flex flex-1 justify-center">
        <button
          onClick={() => setPalette(true)}
          className="flex h-8 w-full max-w-[460px] items-center gap-2 rounded-[9px] border border-line bg-panel px-3 text-[12.5px] text-fg-3 transition hover:border-line-strong hover:text-fg-2"
        >
          <Search size={13} />
          <span className="flex-1 text-left">Search sessions, screens, actions…</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>
      {limited.map(([key, info]) => {
        const [runtime, model] = key.split(" · ");
        const soon = info.until - Date.now() < 86_400_000;
        const until = new Date(info.until).toLocaleString([], soon ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", hour: "numeric", minute: "2-digit" });
        return (
          <button
            key={key}
            className="limit-chip hidden min-[1000px]:flex"
            title={`${info.message}\nClick to try again now — if it's still limited, the next message will say so.`}
            onClick={() => void api(`/api/runtimes/${runtime}/restore`, { body: { model } })}
          >
            <StatusGlyph tone="live" size={7} /> {model ?? runtime} out until {until}
            <span className="limit-try">Try now</span>
          </button>
        );
      })}
      <span className="hidden items-center gap-3 text-[12px] text-fg-3 min-[900px]:flex" data-no-drag>
        <span className="flex items-center gap-1.5" title="Agents working now">
          <StatusGlyph tone={running ? "live" : "idle"} size={7} />
          <span className="tabular-nums text-fg-2">{running}</span> running
        </span>
        <span className="mono tabular-nums" title="Tokens used today across every runtime">
          {formatTokens(crew.today.tokens)} today
        </span>
      </span>
      <span
        className={`h-2 w-2 rounded-full ${connection === "live" ? "bg-ok" : connection === "connecting" ? "bg-amber" : "bg-bad"}`}
        title={connection === "live" ? "Gateway online" : connection === "connecting" ? "Connecting to the gateway" : "Reconnecting to the gateway"}
        role="status"
        data-no-drag
      />
      <button
        onClick={() => approvals[0]?.run && navigate({ to: "/sessions/$id", params: { id: approvals[0].run } })}
        className="relative grid h-8 w-8 place-items-center rounded-[8px] text-fg-3 hover:bg-panel hover:text-fg"
        title={approvals.length ? `${approvals.length} waiting on you` : "Nothing needs you"}
        aria-label={approvals.length ? `${approvals.length} approvals waiting` : "No approvals waiting"}
      >
        <Bell size={16} />
        {approvals.length > 0 && <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-amber px-1 text-center text-[10px] font-bold leading-4 text-[var(--on-accent)]">{approvals.length}</span>}
      </button>
    </header>
  );
}

function IconRail() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const awaiting = useLive((s) => Object.keys(s.crew.approvals).length);
  const main = NAV.filter((n) => n.to !== "/settings");
  const settings = NAV.find((n) => n.to === "/settings")!;
  const item = ({ to, label, icon: Icon }: (typeof NAV)[number]) => {
    const active = to === "/" ? path === "/" || path.startsWith("/sessions") : path.startsWith(to);
    return (
      <Link
        key={to}
        to={to}
        title={label}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={`relative grid h-10 w-10 place-items-center rounded-[10px] transition-colors ${active ? "bg-panel text-amber" : "text-fg-3 hover:bg-panel hover:text-fg"}`}
      >
        <Icon size={18} strokeWidth={1.75} />
        {to === "/" && awaiting > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-wait ring-2 ring-ink" />}
      </Link>
    );
  };
  return (
    <nav aria-label="Primary" className="flex flex-col items-center gap-1 pb-2">
      {main.map(item)}
      <div className="mt-auto">{item(settings)}</div>
    </nav>
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
        newSession(navigate);
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
