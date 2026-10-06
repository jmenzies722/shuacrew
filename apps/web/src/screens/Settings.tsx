import { useEffect, useRef, useState, type ReactNode, Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Bot, Fingerprint, HeartPulse, Bell, LayoutGrid, Check, Keyboard, Link2, MessageSquare, Monitor, Palette, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Zap, Lock, Timer } from "lucide-react";
import { DEFAULT_APPEARANCE, type Appearance as Preferences } from "../lib/appearance";
import { useLive } from "../lib/live";
import { AlwaysOn, Appearance, BackupsPanel, RuntimeSettings } from "./Pages";
import { NotificationSettings } from "../components/NotificationSettings";
import { VoiceSettings } from "../components/VoiceSettings";
import { DeveloperSettings } from "../components/DeveloperSettings";
import { openMobileSettings } from "../lib/native";
import { ToolCardSettings } from "../components/ToolCardSettings";
import { Segmented, SettingRow } from "../components/SettingControls";
import { BudgetSettings, PreferencesTransfer, SessionDefaults } from "../components/WorkspaceSettings";
import { DiagnosticsSettings, FailoverSettings, FlagSettings, GitSettings, InstructionsSettings, LookSettings, MenuBarSettings, QuietHoursSettings, SafetySettings, SoundSettings, SpeechStorageSettings } from "../components/BatchSettings";
import { MotionSettings } from "../components/MotionSettings";
import { OnThisPage, SystemPulse, UpdatesPanel, sectionSummary, usePulse } from "../components/SettingsPulse";
import { ControlHeader } from "../components/ControlRoom";
import { companionName, useCompanion } from "../lib/companion";
import { useWorkspace } from "../lib/workspace-prefs";
import { SettingsCommand } from "../components/SettingsCommand";
import { ShortcutSettings } from "../components/ShortcutSettings";
import { WidgetSettings } from "../components/WidgetSettings";
import { SparkSettings } from "../components/SparkSettings";
import { ScheduleSettings, ThemeShareSettings, TopBarSettings } from "../components/MoreSettings";
import { CapsSettings, HooksSettings, PromptInspector, RouterSettings } from "../components/BatchSettings2";
import { FlowAndWins, PresetSettings, SnippetSettings } from "../components/PowerSettings";
import { EventInspector, GatewayLog, HudToggle, StorageUsage } from "../components/DevTools";
import "./settings.css";
import { HealthCheck } from "../components/HealthCheck";
import { AccessCenter } from "../components/AccessCenter";
import { AtmosphereSettings } from "../components/AtmosphereSettings";

const SECTIONS = [
  { id: "appearance", title: "Appearance", description: "A workspace that feels like yours.", icon: Palette, group: "You" },
  { id: "shua", title: "Shua", description: "One companion everywhere: the notch, your cursor, its voice, and the live widgets it keeps for you.", icon: Sparkles, group: "You" },
  { id: "workspace", title: "Workspace", description: "How you move, type and talk to your crew.", icon: Monitor, group: "You" },
  { id: "access", title: "Access", description: "Everything Shua can reach on this Mac, and the switch for each.", icon: Fingerprint, group: "You" },
  { id: "agents", title: "Agents", description: "Your crew, models, and connected capabilities.", icon: Bot, group: "Crew" },
  { id: "automation", title: "Automation", description: "What runs on its own, your shortcuts and presets, and when it all waits.", icon: Zap, group: "Crew" },
  { id: "safety", title: "Safety & git", description: "What agents may never touch, and how their work lands.", icon: Lock, group: "Crew" },
  { id: "notifications", title: "Notifications", description: "Let the right things interrupt you.", icon: Bell, group: "System" },
  { id: "mobile", title: "Mobile", description: "Your crew, within reach. Your Mac stays in control.", icon: Smartphone, group: "System" },
  { id: "system", title: "System", description: "Always on, backups, and the real machinery underneath.", icon: ShieldCheck, group: "System" },
] as const;
type Section = typeof SECTIONS[number]["id"];
/** `#developer` opens a section; `#budget` opens the section holding that group. */
const GROUP_SECTION: Record<string, Section> = { voice: "shua", "shua-voice": "shua", topbar: "shua", "widget-board": "shua", shortcuts: "workspace", schedule: "automation", "share-look": "appearance", router: "agents", caps: "agents", hooks: "automation", prompts: "system", failover: "agents", instructions: "agents", protected: "safety", git: "safety", quiet: "automation", menubar: "notifications", sounds: "notifications", look: "appearance", "speech-storage": "shua", flags: "system", "diagnostics-report": "system", snippets: "automation", presets: "automation", flow: "automation", "session-defaults": "agents", budget: "workspace", transfer: "system", events: "system", hud: "system", "gateway-log": "system", storage: "system", companion: "shua", "desktop-buddy": "shua", spark: "shua", "tool-cards": "workspace", play: "shua", widgets: "shua", chat: "workspace", health: "access", power: "automation", data: "system", developer: "system" };
function sectionFromHash(hash: string): Section {
  const id = hash.replace(/^#/, "");
  return (SECTIONS.find((s) => s.id === id)?.id ?? GROUP_SECTION[id] ?? "appearance") as Section;
}

function Choice<K extends keyof Preferences>({ name, detail, field, options }: {
  name: string; detail: string; field: K; options: Array<[Preferences[K], string]>;
}) {
  const value = useLive((s) => s.appearance[field]);
  const set = useLive((s) => s.setAppearance);
  const modified = value !== DEFAULT_APPEARANCE[field];
  // Few options read best side by side; long lists stay a menu.
  return <SettingRow name={name} detail={detail} modified={modified}>
    {options.length <= 4
      ? <Segmented label={name} value={value as string} options={options as Array<[string, string]>} onChange={(v) => set({ [field]: v })} />
      : <select className="setting-input" style={{ width: 160 }} aria-label={name} value={value} onChange={(e) => set({ [field]: e.target.value })}>
          {options.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>}
  </SettingRow>;
}

export function Settings() {
  const [section, setSection] = useState<Section>(() => sectionFromHash(window.location.hash));
  // The workspace dashboard greets you on plain Settings; a deep link or a section click goes straight to the settings.
  const [overview, setOverview] = useState(() => !window.location.hash);
  useEffect(() => { const on = () => { setSection(sectionFromHash(window.location.hash)); setOverview(!window.location.hash); setQuery(""); }; window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  const [query, setQuery] = useState("");
  const saved = useLive((s) => s.preferenceSaved);
  const set = useLive((s) => s.setAppearance);
  const keymap = useLive((s) => s.setKeymap);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const pulse = usePulse(), appearanceNow = useLive((s) => s.appearance), companion = useCompanion(), budget = useWorkspace().dailyTokenBudget;
  const scroller = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  // "/" or ⌘F finds a setting from anywhere on the page; Escape clears it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]"); if ((e.key === "/" && !typing) || (e.key === "f" && e.metaKey)) { e.preventDefault(); search.current?.focus(); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  const groups: Array<{ id: string; section: Section; title: string; terms: string; body: ReactNode }> = [
    { id: "failover", section: "agents", title: "When an agent hits its limit", terms: "failover fallback order limit usage window claude codex backup chain", body: <FailoverSettings /> },
    { id: "instructions", section: "agents", title: "Your instructions", terms: "custom instructions system prompt rules always every agent project global preview", body: <InstructionsSettings /> },
    { id: "protected", section: "safety", title: "Protected folders & branches", terms: "protected folders paths never touch deny branches main push safety security", body: <SafetySettings /> },
    { id: "git", section: "safety", title: "Git", terms: "git branch prefix commit author squash merge identity", body: <GitSettings /> },
    { id: "router", section: "agents", title: "Model router rules", terms: "router routing rules keywords model effort auto choose which model cheap haiku opus", body: <RouterSettings /> },
    { id: "caps", section: "agents", title: "Session caps", terms: "cap limit max minutes tokens stop runaway session budget", body: <CapsSettings /> },
    { id: "hooks", section: "automation", title: "Hooks", terms: "hooks script shell command on done on failed notify automation webhook", body: <HooksSettings /> },
    { id: "prompts", section: "system", title: "Prompt inspector", terms: "prompt inspector system instructions what was sent debug context", body: <PromptInspector /> },
    { id: "quiet", section: "automation", title: "Quiet hours for automation", terms: "quiet hours night schedule cron webhook heartbeat pause wait", body: <QuietHoursSettings /> },
    { id: "menubar", section: "notifications", title: "Menu bar", terms: "menu bar status icon badge tokens running", body: <MenuBarSettings /> },
    { id: "sounds", section: "notifications", title: "Sounds", terms: "sounds audio chime approval done failed volume", body: <SoundSettings /> },
    { id: "look", section: "appearance", title: "Fonts & conversation", terms: "font fonts typeface serif mono code ligatures bubbles document width timestamps chat layout", body: <LookSettings /> },
    { id: "speech-storage", section: "shua", title: "Speech models on this Mac", terms: "speech models storage disk delete whisper qwen voice space gb", body: <SpeechStorageSettings /> },
    { id: "flags", section: "system", title: "Experimental features", terms: "feature flags experimental beta labs", body: <FlagSettings /> },
    { id: "diagnostics-report", section: "system", title: "Debug report", terms: "diagnostics debug report bundle export support logs", body: <DiagnosticsSettings /> },
    { id: "widget-board", section: "shua", title: "Your widgets", terms: "widgets top bar spark weather focus timer crew clock world time zone spend cost tokens system cpu memory battery disk learning cards streak note scratch countdown order", body: <WidgetSettings /> },
    { id: "topbar", section: "shua", title: "Weather", terms: "top bar weather temperature forecast location city units fahrenheit celsius", body: <TopBarSettings /> },
    { id: "shortcuts", section: "workspace", title: "Keyboard shortcuts", terms: "keyboard shortcuts keys rebind hotkeys g navigation custom", body: <ShortcutSettings /> },
    { id: "schedule", section: "automation", title: "Scheduled modes", terms: "schedule modes automatic deep work cost saver wind down time days", body: <ScheduleSettings /> },
    { id: "share-look", section: "appearance", title: "Share your look", terms: "theme code share export import look copy paste", body: <ThemeShareSettings /> },
    { id: "snippets", section: "automation", title: "Snippets · your own /commands", terms: "snippets slash commands templates prompts shortcuts macros text expansion", body: <SnippetSettings /> },
    { id: "presets", section: "automation", title: "Launch presets", terms: "presets launch one click modes effort autopilot task quick ship research templates", body: <PresetSettings /> },
    { id: "flow", section: "automation", title: "Flow & wins", terms: "flow focus zen distraction free fullscreen celebrate confetti wins sound chime fun party", body: <FlowAndWins /> },
    { id: "session-defaults", section: "agents", title: "New session defaults", terms: "default agent model effort autopilot supervised permission task plan runtime claude codex start new session", body: <SessionDefaults /> },
    { id: "budget", section: "workspace", title: "Daily budget", terms: "budget tokens limit spend cost usage warning quota daily", body: <BudgetSettings /> },
    { id: "transfer", section: "system", title: "Export & import settings", terms: "export import backup move sync settings preferences json file another mac", body: <PreferencesTransfer /> },
    { id: "events", section: "system", title: "Event inspector", terms: "event log events stream inspector debug audit seq kind run json tail live", body: <EventInspector /> },
    { id: "hud", section: "system", title: "Live HUD", terms: "hud overlay fps events per second stream lag connection debug floating", body: <HudToggle /> },
    { id: "gateway-log", section: "system", title: "Gateway log", terms: "log logs gateway errors crash stderr tail search", body: <GatewayLog /> },
    { id: "storage", section: "system", title: "Storage", terms: "disk storage size space database library models snapshots usage bytes", body: <StorageUsage /> },
    { id: "spark", section: "shua", title: "Make it yours", terms: "shua companion speech male female accent audition preview voice engine spark notch presence brain intelligence desktop buddy companion character orb byte kit blob robot name nickname colour color size personality tone voice talk speak hotkey shortcut guide show me steps spotlight clicky screen screenshot point open apps actions", body: <SparkSettings searching={!!query.trim()} /> },
    { id: "tool-cards", section: "workspace", title: "Tools & connector cards", terms: "mcp icons brands logo cards density errors inspect output", body: <ToolCardSettings /> },
    { id: "mobile-sync", section: "mobile", title: "iPhone & Apple Watch", terms: "phone iphone watch mobile cloudkit icloud pairing remote approval sync", body: <div className="settings-card">
      <p>Choose which crew rooms leave this Mac, compare pairing fingerprints, and revoke devices in the native setup window. Mobile sync is off by default.</p>
      <button className="settings-link-card" onClick={() => { if (!openMobileSettings()) setNotice("Open ShuaCrew for Mac to configure mobile sync. No browser credentials or cloud connection were created."); }}><Smartphone size={22} /><span><strong>Open native Mobile settings <span>↗</span></strong><small>Checks this build’s signing and CloudKit setup. Opening settings never enables sync.</small></span></button>
      <p className="dim">Delivery is not execution. Decisions require a signed Mac acknowledgment; a sleeping Mac may not respond until it wakes.</p>
    </div> },
    { id: "diagnostics", section: "system", title: "Diagnostics & observability", terms: "developer diagnostics logs metrics usage cost tokens latency audit verify refresh gateway version memory", body: <DeveloperSettings /> },
    { id: "atmosphere", section: "appearance", title: "Atmosphere", terms: "atmosphere ambient light glow vivid subtle off aurora living background corners round crisp soft radius", body: <AtmosphereSettings /> },
    { id: "themes", section: "appearance", title: "Palette & accent", terms: "theme dark light system frost night graphite carbon midnight daylight paper sand blue green coral amber mono", body: <Appearance /> },
    { id: "reading", section: "appearance", title: "Reading & motion", terms: "font size small large text accessibility animations reduced motion", body: <div className="settings-card">
      <Choice name="Reading size" detail="Agent responses and documents. Code scales with the text." field="reading" options={[["small", "Small"], ["default", "Default"], ["large", "Large"]]} />
      <Choice name="Motion" detail="Control transitions, animated counters, and decorative effects." field="motion" options={[["system", "Follow system"], ["reduced", "Reduced"], ["full", "Full"]]} />
      <MotionSettings />
      <div className="reading-preview"><span className="settings-kicker">READING PREVIEW</span><div className="prose-agent"><p>Your crew is ready for the next idea.</p><p>Clear context, useful tools, and room to focus. Start with a question and build from there.</p></div></div>
    </div> },
    { id: "layout", section: "workspace", title: "Layout & navigation", terms: "density comfortable compact labels icons rail sidebar start page home screen floor board today ventures", body: <div className="settings-card">
      <Choice name="Density" detail="Spacing in navigation, settings, and workspace cards." field="density" options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} />
      <Choice name="Navigation" detail="Keep screen names visible, or leave more room for your work." field="navigation" options={[["icons", "Icons"], ["labels", "Icons & labels"]]} />
      <Choice name="Start screen" detail="Where a fresh launch opens. Direct links keep their destination." field="startPage" options={[["/", "Sessions"], ["/floor", "Crew HQ"], ["/activity", "Today"], ["/ventures", "Ventures"], ["/board", "Board"]]} />
    </div> },
    { id: "composer", section: "workspace", title: "Composer & conversation", terms: "send enter command control shortcut spell check spelling minimap map turn navigator queue messages", body: <div className="settings-card">
      <Choice name="Send shortcut" detail="Shift + Enter always inserts a new line. Arrow only also makes Enter a new line; click the send arrow when ready. While an agent works, messages join the queue." field="sendShortcut" options={[["enter", "Enter"], ["modifier-enter", "⌘ / Ctrl + Enter"], ["button-only", "Arrow only"]]} />
      <Choice name="Spell check" detail="Use the system's spelling suggestions in the message composer." field="spellcheck" options={[["on", "On"], ["off", "Off"]]} />
      <Choice name="Turn navigator" detail="Jump between prompts using the markers beside a desktop conversation." field="turnMap" options={[["show", "Show"], ["hide", "Hide"]]} />
    </div> },
    { id: "permissions", section: "access", title: "What Shua can reach", terms: "permissions access privacy screen recording accessibility microphone camera contacts calendar reminders photos full disk files automation apple events system settings prompt allow", body: <AccessCenter /> },
    { id: "health-check", section: "access", title: "Health check", terms: "health check status broken not working diagnose troubleshoot problem permissions voice chrome claude codex disk fix doctor", body: <HealthCheck /> },
    { id: "runtimes", section: "agents", title: "Runtime connections", terms: "claude codex acp subscription auth model provider connection", body: <RuntimeSettings /> },
    { id: "desktop-alerts", section: "notifications", title: "Mac desktop alerts", terms: "notifications permission desktop alerts background finish complete failure approval reviews quiet hours sounds morning briefing mute", body: <NotificationSettings /> },
    { id: "crew", section: "agents", title: "Build your crew", terms: "persona role member model prompts skills tools mcp policy approvals", body: <div className="settings-card settings-destinations">
      <Link to="/crew"><strong>Crew members <span>↗</span></strong><small>Choose roles, instructions, models, and which Claude specialists are available for delegation.</small></Link>
      <Link to="/integrations"><strong>Tools & skills <span>↗</span></strong><small>Give agents the capabilities your projects need.</small></Link>
      <Link to="/policy"><strong>Policy & approvals <span>↗</span></strong><small>Inspect how tool decisions are made.</small></Link>
    </div> },
    { id: "service", section: "system", title: "Always on", terms: "background service login gateway uptime", body: <AlwaysOn /> },
    { id: "backups", section: "system", title: "Backups & recovery", terms: "data backup restore encryption history", body: <BackupsPanel /> },
    { id: "updates", section: "system", title: "Updates & what's new", terms: "update updates version build commit changes what's new release reload latest", body: <UpdatesPanel pulse={pulse} onRefresh={pulse.refresh} /> },
  ];
  useEffect(() => {
    const follow = () => { const id = window.location.hash.slice(1), g = groups.find((x) => x.id === id); if (!g) return; setSection(g.section); setOverview(false); setQuery(""); setTimeout(() => document.getElementById(`g-${id}`)?.scrollIntoView({ block: "start" }), 60); };
    follow(); window.addEventListener("hashchange", follow); return () => window.removeEventListener("hashchange", follow);
  }, []);
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    // Every section leads with the choices you'll actually make; the machinery (logs, inspectors, storage) sits last.
  const FIRST: Record<string, number> = { themes: 0, atmosphere: 1, look: 2, reading: 3, "share-look": 4, spark: 0, "widget-board": 1, topbar: 2, "speech-storage": 9, layout: 0, composer: 1, shortcuts: 2, budget: 3, "tool-cards": 4, permissions: 0, "health-check": 1, crew: 0, "session-defaults": 1, runtimes: 2, instructions: 3, failover: 4, router: 5, caps: 6, presets: 0, snippets: 1, schedule: 2, flow: 3, quiet: 4, hooks: 5, protected: 0, git: 1, "desktop-alerts": 0, sounds: 1, menubar: 2, service: 0, backups: 1, transfer: 2, storage: 3, diagnostics: 4, "diagnostics-report": 5, updates: 1.5, flags: 6, prompts: 7, events: 8, "gateway-log": 9, hud: 10 };
  const visible = groups.filter((g) => words.length ? words.every((w) => `${g.title} ${g.terms} ${g.section}`.toLowerCase().includes(w)) : g.section === section)
    .sort((a, b) => (FIRST[a.id] ?? 9) - (FIRST[b.id] ?? 9));
  const selected = SECTIONS.find((s) => s.id === section)!;
  const reset = () => {
    const d = DEFAULT_APPEARANCE;
    set(section === "appearance" ? { palette: d.palette, dark: d.dark, light: d.light, accent: d.accent, reading: d.reading, motion: d.motion } : { density: d.density, navigation: d.navigation, startPage: d.startPage, sendShortcut: d.sendShortcut, spellcheck: d.spellcheck, turnMap: d.turnMap });
    setNotice(`${selected.title} restored to defaults.`);
  };
  const summary = (id: string) => sectionSummary(id, { pulse, appearance: appearanceNow, companion: { name: companionName(companion), placement: companion.desktopPlacement, control: companion.control }, budget });
  const open = (id: Section) => { setSection(id); setQuery(""); setNotice(""); setOverview(false); window.location.hash = id; scroller.current?.scrollTo({ top: 0 }); };
  const copyLink = (id: string) => { void navigator.clipboard?.writeText(`${location.origin}/settings#${id}`); setCopied(id); setTimeout(() => setCopied(""), 1400); };
  const searching = words.length > 0, here = searching ? null : summary(section);
  return <div className="settings-page" ref={scroller}>
    <div className={`settings-layout${!overview && !searching ? " has-toc" : ""}`}><aside className="settings-sidebar">
      <label className="settings-search"><Search size={15} /><input ref={search} aria-label="Search settings" placeholder="Find a setting…" value={query} onChange={(e) => { setQuery(e.target.value); if (e.target.value) setOverview(false); }}
        onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); } }} />{query ? <button aria-label="Clear search" onClick={() => setQuery("")}>×</button> : <kbd aria-hidden="true">/</kbd>}</label>
      <nav aria-label="Settings sections">
        <button type="button" className="settings-nav-home" aria-current={overview && !searching ? "page" : undefined} onClick={() => { setOverview(true); setQuery(""); history.replaceState(null, "", "/settings"); scroller.current?.scrollTo({ top: 0 }); }}><i className="settings-ico"><LayoutGrid size={14} strokeWidth={2} /></i><span>Overview</span></button>
        {SECTIONS.map(({ id, title, group, icon: Icon }, i) => { const t = summary(id).tone; return <Fragment key={id}>
          {SECTIONS[i - 1]?.group !== group && <span className="settings-nav-label">{group}</span>}
          <button type="button" aria-current={!overview && !searching && section === id ? "page" : undefined} onClick={() => open(id)}><i className="settings-ico" data-group={group}><Icon size={14} strokeWidth={2} /></i><span>{title}</span>{(t === "wait" || t === "bad") && <em className={`settings-nav-dot is-${t}`} aria-label="Needs attention" />}</button>
        </Fragment>; })}
      </nav>
      <SystemPulse pulse={pulse} go={(hash) => { window.location.hash = hash; }} />
    </aside><div className="settings-content">{overview && !searching ? <>
      <ControlHeader title="Settings" kicker={<><SlidersHorizontal size={13} /> Your workspace</>} status={`Saved on this Mac · ${summary("system").text}`} tone={summary("system").tone} />
      <div className="settings-tiles">{SECTIONS.map(({ id, title, icon: Icon, group }) => { const sum = summary(id); return <button key={id} type="button" className={`settings-tile is-${sum.tone}`} data-section={id} onClick={() => open(id)}>
        <i className="settings-ico" data-group={group}><Icon size={16} strokeWidth={2} /></i><b>{title}</b><small>{sum.text}</small><ArrowUpRight size={13} className="settings-tile-go" /></button>; })}</div>
      <details className="settings-advanced-overview"><summary>Modes, settings history & workspace setup</summary><SettingsCommand go={hash => { window.location.hash = hash; setOverview(false); }} /></details>
    </> : <>
      <ControlHeader title={searching ? "Search results" : selected.title} kicker={searching ? <><Search size={13} /> Settings</> : <><selected.icon size={13} /> {selected.group}</>}
        status={searching ? `${visible.length} matching group${visible.length === 1 ? "" : "s"} for “${query}”` : here!.text} tone={searching ? "idle" : here!.tone}>
        {!searching && ["appearance", "workspace"].includes(section) && <button type="button" className="cr-btn" onClick={reset}><RotateCcw size={13} /> Reset section</button>}
      </ControlHeader>
      {!searching && <p className="settings-lede">{selected.description}</p>}
      {notice && <p role="status" className="settings-notice">{notice}</p>}
      {!visible.length && <div className="settings-empty"><Search size={28} /><h3>No settings found</h3><p>Try “motion”, “model”, “navigation”, or “backup”.</p></div>}
      {visible.map((g) => <section key={g.id} id={`g-${g.id}`} aria-label={g.title} className="settings-group"><h3>{searching && <span>{SECTIONS.find((s) => s.id === g.section)!.title} / </span>}{g.title}
        <button type="button" className="settings-link" onClick={() => copyLink(g.id)} aria-label={`Copy a link to ${g.title}`} title="Copy a link to this setting">{copied === g.id ? <Check size={12} /> : <Link2 size={12} />}</button></h3>{g.body}</section>)}
    </>}</div>
    {!overview && !searching && <OnThisPage groups={visible.map((g) => ({ id: g.id, title: g.title }))} root={() => scroller.current} />}
    </div>
  </div>;
}
