import { Kbd, StatusGlyph, formatTokens } from "@shuacrew/ui";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Rocket, ListChecks, LibraryBig, SquareTerminal, Waypoints, Users, Activity, BarChart3, GraduationCap, Disc3 } from "lucide-react";
import { Bell, BookOpen, Cable, CalendarClock, FileText, Folder, House, KanbanSquare, MessagesSquare, Radar, Search, Settings, ShieldCheck } from "lucide-react";
import { MotionConfig, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Milestones, useSpotlight } from "../lib/motion";
import { repoName } from "../lib/crew";
import { api } from "../lib/api";
import { watchTitleBar } from "../lib/native";
import { selectLiveRuns, useLive } from "../lib/live";
import { ApprovalToasts } from "./ApprovalToasts";
import { CommandPalette } from "./CommandPalette";
import { KeymapOverlay } from "./KeymapOverlay";
import { LaunchSheet } from "./LaunchSheet";
import { VoiceConversationHost } from "../components/VoiceConversation";
import { CompanionHost } from "../components/Companion";
import { DevHud } from "../components/DevHud";
import { budgetUse, useWorkspace } from "../lib/workspace-prefs";
import { getPower, savePower, usePower } from "../lib/power";
import { navKey } from "../lib/keys";
import { WinsHost } from "../components/Wins";
import { SoundsHost } from "../components/Sounds";
import { StatusIsland } from "../components/TopBarWidgets";
import { HubRail, HubTabs } from "./HubNav";
import { RadioHost } from "../components/NowPlaying";
import { AutomationsHost } from "../components/Automations";
import "../components/settings-command.css";
import "../components/surfaces.css";
import "../lib/look";

export const NAV = [
  { to: "/", label: "Sessions", hint: "Talk to the crew", icon: MessagesSquare, key: "s", group: "Work" },
  { to: "/studio", label: "Studio", hint: "Now playing, mix, tonight's set", icon: Disc3, key: "j", group: "Work" },
  { to: "/ventures", label: "Ventures", hint: "Your startups, idea → revenue", icon: Rocket, key: "v", group: "Work" },
  { to: "/crew", label: "Crew", hint: "Your standing team", icon: Users, key: "r", group: "Work" },
  { to: "/rooms", label: "Crew rooms", hint: "Shared conversation and real delegation", icon: MessagesSquare, key: "g", group: "Work" },
  { to: "/floor", label: "Crew floor", hint: "Every agent, live", icon: Waypoints, key: "f", group: "Work" },
  { to: "/terminal", label: "Terminal", hint: "Your shells + ask the crew", icon: SquareTerminal, key: "t", group: "Work" },
  { to: "/playbooks", label: "Playbooks", hint: "Idea → shipped, in phases", icon: ListChecks, key: "w", group: "Plan" },
  { to: "/specs", label: "Specs", hint: "Requirements → tasks", icon: FileText, key: "p", group: "Plan" },
  { to: "/board", label: "Board", hint: "Every session by stage", icon: KanbanSquare, key: "b", group: "Plan" },
  { to: "/activity", label: "Today", hint: "Everything at a glance", icon: Radar, key: "m", group: "Plan" },
  { to: "/library", label: "Library", hint: "What the crew made + knows", icon: LibraryBig, key: "l", group: "Brain" },
  { to: "/learn", label: "Learning", hint: "Skill up from your own work", icon: GraduationCap, key: "e", group: "Brain" },
  { to: "/memory", label: "Memory", hint: "Lessons and skills", icon: BookOpen, key: "y", group: "Brain" },
  { to: "/schedules", label: "Schedules", hint: "Runs while you're away", icon: CalendarClock, key: "c", group: "Brain" },
  { to: "/integrations", label: "Tools & Skills", hint: "MCP servers and skills", icon: Cable, key: "i", group: "Brain" },
  { to: "/policy", label: "Policy & Audit", hint: "What agents may do", icon: ShieldCheck, key: "a", group: "System" },
  { to: "/observability", label: "Observability", hint: "Health, latency and recorded activity", icon: Activity, key: "o", group: "System" },
  { to: "/usage", label: "Usage", hint: "Recorded tokens and honest coverage", icon: BarChart3, key: "u", group: "System" },
  { to: "/developer", label: "Developer", hint: "Gateway diagnostics and audit integrity", icon: SquareTerminal, key: "d", group: "System" },
  { to: "/settings", label: "Settings", hint: "Agents, look, data", icon: Settings, key: ",", group: "System" },
] as const;

/** A fresh session: the Sessions page with the composer focused. ⌘N, the menu and the tray all land here. */
export function newSession(navigate: ReturnType<typeof useNavigate>) {
  void navigate({ to: "/" }).then(() => window.dispatchEvent(new Event("shuacrew:compose")));
}

export function Shell() {
  const motionPreference = useLive((s) => s.appearance.motion);
  const { flow } = usePower();
  useGlobalKeys();
  useSpotlight();
  // One section, one entrance: switching sessions inside the chat doesn't re-animate the page.
  const section = useRouterState({ select: (s) => (s.location.pathname.startsWith("/sessions") ? "/" : `/${s.location.pathname.split("/")[1] ?? ""}`) });
  return (
    <MotionConfig reducedMotion={motionPreference === "reduced" ? "always" : motionPreference === "full" ? "never" : "user"}>
    <div className="workspace-frame grid h-full grid-cols-[76px_1fr] grid-rows-[38px_1fr] bg-ink" data-frame data-flow={flow ? "on" : undefined}>
      <div className="living-bg" aria-hidden="true"><i /><i /><i /></div>
      {flow && <button type="button" className="flow-exit" onClick={() => savePower({ flow: false })} title="Leave Flow mode (⌘⇧F)">Flow · ⌘⇧F</button>}
      <TopBar />
      <HubRail />
      <main className="min-h-0 min-w-0 overflow-hidden flex flex-col" id="main">
        {/* WebKit may suspend animations while the native window is occluded. Core content
            must be visible on its first frame, independent of animation scheduling. */}
        <HubTabs />
        <motion.div key={section} className="min-h-0 flex-1" initial={false} animate={{ opacity: 1, y: 0 }}>
          <Outlet />
        </motion.div>
        {/* In the Mac app Spark lives on the desktop (over every app), so the in-window one steps aside. */}
        {document.documentElement.dataset.shell !== "mac" && <CompanionHost />}
      </main>
      <Milestones />
      <CommandPalette />
      <LaunchSheet />
      <ApprovalToasts />
      <KeymapOverlay />
      <VoiceConversationHost />
      <WinsHost />
      <SoundsHost />
      <RadioHost />
      <AutomationsHost />
      <DevHud />
    </div>
    </MotionConfig>
  );
}

/** Kiro Crew's top bar: where you are, search for anything, and what needs you. */
function TopBar() {
  const bar = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const connection = useLive((s) => s.connection);
  // Narrow selectors: a streamed token must not re-render the top bar.
  const crewApprovals = useLive((s) => s.crew.approvals), crewLimited = useLive((s) => s.crew.limited), crewToday = useLive((s) => s.crew.today);
  const runningCount = useLive((s) => selectLiveRuns(s.crew).filter((r) => r.status === "running" || r.status === "planning").length);
  const setPalette = useLive((s) => s.setPalette);
  const approvals = Object.values(crewApprovals).sort((a, b) => a.seq - b.seq);
  const running = runningCount;
  const limited = Object.entries(crewLimited).filter(([, l]) => !l.credits); // "needs credits" isn't a window; the model picker says it
  useEffect(() => (bar.current ? watchTitleBar(bar.current) : undefined), []);

  return (
    <header ref={bar} className="relative col-span-2 flex items-center gap-3 px-3 [[data-shell=mac]_&]:pl-[84px]" aria-label="Top bar">
      <img src="/icon.svg" alt="ShuaCrew" className="h-6 w-6 [[data-shell=mac]_&]:hidden" />
      <span className="flex h-7 items-center gap-1.5 rounded-[8px] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] px-2.5 text-[12px] font-medium text-fg-2" data-no-drag>
        <House size={13} className="text-fg-3" /> Local
      </span>
      <RepoChip />
      <div className="tb-center" data-no-drag>
        <button
          onClick={() => setPalette(true)}
          className="flex h-8 w-full max-w-[460px] items-center gap-2 rounded-[9px] border border-line bg-panel px-3 text-[12.5px] text-fg-3 transition hover:border-line-strong hover:text-fg-2"
        >
          <Search size={13} />
          <span className="flex-1 text-left">Search sessions, screens, actions…</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>
      <span className="flex-1" />
      <StatusIsland ctx={{ go: (path) => void navigate({ to: path }) }} running={running} connection={connection}
        limits={limited.map(([key, info]) => {
          const [runtime, model] = key.split(" · "), soon = info.until - Date.now() < 86_400_000;
          return { key, label: model ?? runtime ?? key, message: info.message, until: new Date(info.until).toLocaleString([], soon ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", hour: "numeric", minute: "2-digit" }), retry: () => void api(`/api/runtimes/${runtime}/restore`, { body: { model } }) };
        })}
        tokens={formatTokens(crewToday.day === new Date().toISOString().slice(0, 10) ? crewToday.tokens : 0)} />
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
 * Collapsed navigation stays fixed; only the hovered/focused item's label appears.
 */
function useGlobalKeys() {
  const navigate = useNavigate();
  useEffect(() => {
    let pendingG = 0;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      const s = useLive.getState();
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === "KeyF") {
        event.preventDefault();
        savePower({ flow: !getPower().flow });
        return;
      }
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
        const item = NAV.find((n) => navKey(n) === event.key);
        if (item) navigate({ to: item.to });
        pendingG = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}

/** Today's recorded tokens; turns amber past your daily budget and red at twice it (Settings → Workspace). */
function TokensToday({ tokens }: { tokens: number }) {
  const { dailyTokenBudget } = useWorkspace();
  const used = budgetUse(tokens, dailyTokenBudget);
  const tone = used >= 2 ? "text-bad" : used >= 1 ? "text-amber" : "";
  return <Link to="/settings" hash="budget" className={`mono tabular-nums ${tone}`} title={`Recorded input and output tokens today (UTC); excludes demo usage. Not remaining subscription quota.${dailyTokenBudget ? ` Budget: ${formatTokens(dailyTokenBudget)} (${Math.round(used * 100)}%).` : ""}`}>
    {formatTokens(tokens)}{dailyTokenBudget ? ` / ${formatTokens(dailyTokenBudget)}` : ""} today
  </Link>;
}
