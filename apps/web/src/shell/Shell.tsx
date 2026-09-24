import { Kbd, StatusGlyph, formatTokens } from "@shuacrew/ui";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { SquareTerminal, Waypoints } from "lucide-react";
import { Bell, BookOpen, Cable, CalendarClock, FileText, Folder, House, KanbanSquare, MessagesSquare, Radar, Search, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { repoName } from "../lib/crew";
import { api } from "../lib/api";
import { watchTitleBar } from "../lib/native";
import { selectLiveRuns, useLive } from "../lib/live";
import { ApprovalToasts } from "./ApprovalToasts";
import { CommandPalette } from "./CommandPalette";
import { KeymapOverlay } from "./KeymapOverlay";
import { LaunchSheet } from "./LaunchSheet";

export const NAV = [
  { to: "/", label: "Sessions", hint: "Talk to the crew", icon: MessagesSquare, key: "s", group: "Work" },
  { to: "/floor", label: "Crew floor", hint: "Every agent, live", icon: Waypoints, key: "f", group: "Work" },
  { to: "/terminal", label: "Terminal", hint: "Your shells + ask the crew", icon: SquareTerminal, key: "t", group: "Work" },
  { to: "/specs", label: "Specs", hint: "Requirements → tasks", icon: FileText, key: "p", group: "Plan" },
  { to: "/board", label: "Board", hint: "Every session by stage", icon: KanbanSquare, key: "b", group: "Plan" },
  { to: "/activity", label: "Activity", hint: "Today at a glance", icon: Radar, key: "m", group: "Plan" },
  { to: "/memory", label: "Memory", hint: "Lessons and skills", icon: BookOpen, key: "y", group: "Brain" },
  { to: "/schedules", label: "Schedules", hint: "Runs while you're away", icon: CalendarClock, key: "c", group: "Brain" },
  { to: "/integrations", label: "Integrations", hint: "MCP servers and skills", icon: Cable, key: "i", group: "Brain" },
  { to: "/policy", label: "Policy & Audit", hint: "What agents may do", icon: ShieldCheck, key: "a", group: "System" },
  { to: "/settings", label: "Settings", hint: "Agents, look, data", icon: Settings, key: ",", group: "System" },
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
  const limited = Object.entries(crew.limited).filter(([, l]) => !l.credits); // "needs credits" isn't a window; the model picker says it
  useEffect(() => (bar.current ? watchTitleBar(bar.current) : undefined), []);

  return (
    <header ref={bar} className="col-span-2 flex items-center gap-3 px-3 [[data-shell=mac]_&]:pl-[84px]" aria-label="Top bar">
      <img src="/icon.svg" alt="ShuaCrew" className="h-6 w-6 [[data-shell=mac]_&]:hidden" />
      <span className="flex h-7 items-center gap-1.5 rounded-[8px] bg-[var(--amber-soft)] px-2.5 text-[12px] font-medium text-fg" data-no-drag>
        <House size={13} className="text-amber" /> Local
      </span>
      <RepoChip />
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

/** Same chip as Local. Narrows the floor, board, sessions and activity to one repo. */
function RepoChip() {
  const runs = useLive((s) => s.crew.runs);
  const scope = useLive((s) => s.scope);
  const setScope = useLive((s) => s.setScope);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const repos = useMemo(() => {
    const seen = new Set<string>();
    for (const run of Object.values(runs)) if (run.repo) seen.add(run.repo);
    return [...seen].sort((a, b) => repoName(a).localeCompare(repoName(b)));
  }, [runs]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  if (repos.length === 0) return null;
  return (
    <div ref={root} className="relative" data-no-drag>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 max-w-[180px] items-center gap-1.5 rounded-[8px] border px-2.5 text-[12px] font-medium ${scope ? "border-amber text-fg" : "border-line text-fg-2 hover:border-line-strong hover:text-fg"}`}
        title={scope ?? "Every repo"}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Folder size={13} className={scope ? "text-amber" : "text-fg-3"} />
        <span className="truncate">{scope ? repoName(scope) : "All repos"}</span>
      </button>
      {open && (
        <ul role="listbox" aria-label="Repo" className="absolute left-0 top-9 z-30 w-56 rounded-[var(--radius-l)] border border-line-strong bg-panel py-1" style={{ boxShadow: "var(--shadow)" }}>
          <li>
            <button role="option" aria-selected={scope === null} onClick={() => (setScope(null), setOpen(false))} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-raised">
              <span className={`h-1.5 w-1.5 rounded-full ${scope === null ? "bg-amber" : "bg-transparent"}`} />
              All repos
            </button>
          </li>
          {repos.map((repo) => (
            <li key={repo}>
              <button role="option" aria-selected={scope === repo} title={repo} onClick={() => (setScope(repo), setOpen(false))} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-raised">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${scope === repo ? "bg-amber" : "bg-transparent"}`} />
                <span className="truncate">{repoName(repo)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The rail: icons grouped by purpose. Hover (or focus) opens it into a labelled panel over the
 * page — every icon explains itself, and the page never reflows.
 */
function IconRail() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const awaiting = useLive((s) => Object.keys(s.crew.approvals).length);
  const working = useLive((s) => Object.values(s.crew.runs).filter((r) => r.status === "running" || r.status === "planning").length);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hover = (on: boolean) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(on), on ? 280 : 120);
  };
  const groups = ["Work", "Plan", "Brain", "System"] as const;
  const badge = (to: string) => (to === "/" && awaiting > 0 ? { tone: "wait", n: awaiting } : to === "/floor" && working > 0 ? { tone: "live", n: working } : null);
  return (
    <nav aria-label="Primary" className={`rail ${open ? "is-open" : ""}`} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)} onFocus={() => hover(true)} onBlur={() => hover(false)}>
      {groups.map((group) => (
        <div key={group} className={`rail-group ${group === "System" ? "mt-auto" : ""}`}>
          <div className="rail-label">{group}</div>
          {NAV.filter((n) => n.group === group).map(({ to, label, hint, icon: Icon }) => {
            const active = to === "/" ? path === "/" || path.startsWith("/sessions") : path.startsWith(to);
            const b = badge(to);
            return (
              <Link key={to} to={to} aria-label={label} aria-current={active ? "page" : undefined} className={`rail-item ${active ? "is-active" : ""}`} onClick={() => setOpen(false)}>
                <span className="rail-icon">
                  <Icon size={18} strokeWidth={1.75} />
                  {b && <span className={`rail-dot is-${b.tone}`} />}
                </span>
                <span className="rail-text">
                  <span className="rail-name">{label}</span>
                  <span className="rail-hint">{hint}</span>
                </span>
                {b && <span className={`rail-count is-${b.tone}`}>{b.n}</span>}
              </Link>
            );
          })}
        </div>
      ))}
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
