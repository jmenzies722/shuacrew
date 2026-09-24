import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Keyboard, Monitor, Palette, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { DEFAULT_APPEARANCE, type Appearance as Preferences } from "../lib/appearance";
import { useLive } from "../lib/live";
import { AlwaysOn, Appearance, BackupsPanel, RuntimeSettings } from "./Pages";
import "./settings.css";

const SECTIONS = [
  { id: "appearance", title: "Appearance", description: "A workspace that feels like yours.", icon: Palette },
  { id: "workspace", title: "Workspace", description: "Shape the way you move through your day.", icon: Monitor },
  { id: "agents", title: "Agents", description: "Your crew, models, and connected capabilities.", icon: Sparkles },
  { id: "data", title: "Data & service", description: "Keep your workspace available and backed up.", icon: ShieldCheck },
] as const;
type Section = typeof SECTIONS[number]["id"];

function Choice<K extends keyof Preferences>({ name, detail, field, options }: {
  name: string; detail: string; field: K; options: Array<[Preferences[K], string]>;
}) {
  const value = useLive((s) => s.appearance[field]);
  const set = useLive((s) => s.setAppearance);
  return <label className="preference-row"><span><strong>{name}</strong><small>{detail}</small></span>
    <select aria-label={name} value={value} onChange={(e) => set({ [field]: e.target.value })}>
      {options.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
    </select>
  </label>;
}

export function Settings() {
  const [section, setSection] = useState<Section>("appearance");
  const [query, setQuery] = useState("");
  const saved = useLive((s) => s.preferenceSaved);
  const set = useLive((s) => s.setAppearance);
  const keymap = useLive((s) => s.setKeymap);
  const [notice, setNotice] = useState("");
  const groups: Array<{ id: string; section: Section; title: string; terms: string; body: ReactNode }> = [
    { id: "themes", section: "appearance", title: "Palette & accent", terms: "theme dark light system frost night graphite carbon midnight daylight paper sand blue green coral amber mono", body: <Appearance /> },
    { id: "reading", section: "appearance", title: "Reading & motion", terms: "font size small large text accessibility animations reduced motion", body: <div className="settings-card">
      <Choice name="Reading size" detail="Agent responses and documents. Code scales with the text." field="reading" options={[["small", "Small"], ["default", "Default"], ["large", "Large"]]} />
      <Choice name="Motion" detail="Control transitions, animated counters, and decorative effects." field="motion" options={[["system", "Follow system"], ["reduced", "Reduced"], ["full", "Full"]]} />
      <div className="reading-preview"><span className="settings-kicker">READING PREVIEW</span><div className="prose-agent"><p>Your crew is ready for the next idea.</p><p>Clear context, useful tools, and room to focus. Start with a question and build from there.</p></div></div>
    </div> },
    { id: "layout", section: "workspace", title: "Layout & navigation", terms: "density comfortable compact labels icons rail sidebar start page home screen floor board today ventures", body: <div className="settings-card">
      <Choice name="Density" detail="Spacing in navigation, settings, and workspace cards." field="density" options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} />
      <Choice name="Navigation" detail="Keep screen names visible, or leave more room for your work." field="navigation" options={[["icons", "Icons"], ["labels", "Icons & labels"]]} />
      <Choice name="Start screen" detail="Where a fresh launch opens. Direct links keep their destination." field="startPage" options={[["/", "Sessions"], ["/floor", "Crew floor"], ["/activity", "Today"], ["/ventures", "Ventures"], ["/board", "Board"]]} />
    </div> },
    { id: "keys", section: "workspace", title: "Keyboard shortcuts", terms: "commands keyboard shortcuts hotkeys search", body: <button className="settings-link-card" onClick={() => keymap(true)}><Keyboard size={22} /><span><strong>Stay in the flow</strong><small>Explore shortcuts for sessions, search, navigation, and more.</small></span><kbd>?</kbd></button> },
    { id: "runtimes", section: "agents", title: "Runtime connections", terms: "claude codex acp subscription auth model provider connection", body: <RuntimeSettings /> },
    { id: "crew", section: "agents", title: "Build your crew", terms: "persona role member model prompts skills tools mcp policy approvals", body: <div className="settings-card settings-destinations">
      <Link to="/crew"><strong>Crew members <span>↗</span></strong><small>Choose roles, instructions, models, and which Claude specialists are available for delegation.</small></Link>
      <Link to="/integrations"><strong>Tools & skills <span>↗</span></strong><small>Give agents the capabilities your projects need.</small></Link>
      <Link to="/policy"><strong>Policy & approvals <span>↗</span></strong><small>Inspect how tool decisions are made.</small></Link>
    </div> },
    { id: "service", section: "data", title: "Always on", terms: "background service login gateway uptime", body: <AlwaysOn /> },
    { id: "backups", section: "data", title: "Backups & recovery", terms: "data backup restore encryption history", body: <BackupsPanel /> },
  ];
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = groups.filter((g) => words.length ? words.every((w) => `${g.title} ${g.terms} ${g.section}`.toLowerCase().includes(w)) : g.section === section);
  const selected = SECTIONS.find((s) => s.id === section)!;
  const reset = () => {
    const d = DEFAULT_APPEARANCE;
    set(section === "appearance" ? { palette: d.palette, dark: d.dark, light: d.light, accent: d.accent, reading: d.reading, motion: d.motion } : { density: d.density, navigation: d.navigation, startPage: d.startPage });
    setNotice(`${selected.title} restored to defaults.`);
  };
  return <div className="settings-page">
    <header className="settings-hero"><div><span className="settings-kicker"><SlidersHorizontal size={12} /> YOUR WORKSPACE</span><h1>Make room for your best work.</h1><p>The look, the flow, the intelligence. Make ShuaCrew yours.</p></div><span className="settings-save" role="status">{saved ? <><Check size={13} /> Preferences save on this device</> : "Storage unavailable · changes last this session"}</span></header>
    <div className="settings-layout"><aside className="settings-sidebar">
      <label className="settings-search"><Search size={15} /><input aria-label="Search settings" placeholder="Find a setting…" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery("")}>×</button>}</label>
      <nav aria-label="Settings sections">{SECTIONS.map(({ id, title, icon: Icon }) => <button key={id} aria-current={!words.length && section === id ? "page" : undefined} onClick={() => { setSection(id); setQuery(""); setNotice(""); }}><Icon size={17} /><span>{title}</span></button>)}</nav>
      <div className="settings-sidebar-note"><span className="settings-kicker">BUILT AROUND YOU</span><p>One workspace.<br />Your entire crew.</p><Link to="/crew">Meet your agents ↗</Link></div>
    </aside><div className="settings-content"><div className="settings-section-heading"><div><h2>{words.length ? "Search results" : selected.title}</h2><p>{words.length ? `${visible.length} matching groups for “${query}”` : selected.description}</p></div>{!words.length && (section === "appearance" || section === "workspace") && <button className="settings-reset" onClick={reset}><RotateCcw size={13} /> Reset section</button>}</div>
      {notice && <p role="status" className="settings-notice">{notice}</p>}
      {!visible.length && <div className="settings-empty"><Search size={28} /><h3>No settings found</h3><p>Try “motion”, “model”, “navigation”, or “backup”.</p></div>}
      {visible.map((g) => <section key={g.id} aria-label={g.title} className="settings-group"><h3>{words.length > 0 && <span>{SECTIONS.find((s) => s.id === g.section)!.title} / </span>}{g.title}</h3>{g.body}</section>)}
    </div></div>
  </div>;
}
