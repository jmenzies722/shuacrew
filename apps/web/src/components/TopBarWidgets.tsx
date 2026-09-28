import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Bot, CalendarClock, Check, Clock, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Cpu, GraduationCap, Moon, Pause, Play, Plus, RefreshCw, Send, ShieldQuestion, Square, StickyNote, Sun, Timer, Wallet, Wind, X } from "lucide-react";
import { describe, loadWeather, useWeatherPrefs, type Weather } from "../lib/weather";
import { FOCUS_MINUTES, formatFocusRemaining, pauseFocus, remainingFocusMs, resumeFocus, setFocus, startFocus, useFocusTimer } from "../lib/focus-timer";
import { notifyNative } from "../lib/native";
import { api, decideApproval, launchRun } from "../lib/api";
import { useLive } from "../lib/live";
import { isTopLevelWork } from "../lib/crew";
import { daysUntil, placed, saveNote, saveWidgets, streak, useNote, useWidgets, WIDGET_INFO, type WidgetId } from "../lib/widgets";
import { useRadio } from "../lib/radio";
import { RadioChip, RadioTile } from "./RadioWidget";
import "../screens/studio.css";
import { playSound } from "./Sounds";
import { useLook } from "../lib/look";
import "./topbar-widgets.css";

/** Where a widget sends you: the app navigates; Spark asks the Mac app to open the window there. */
export interface WidgetCtx { go(path: string): void }

export const WEATHER_ICONS = { sun: Sun, moon: Moon, "cloud-sun": CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning } as const;
const ACTIVE = new Set(["queued", "planning", "running", "awaiting_approval", "reviewing", "paused"]);
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const bytes = (n: number) => `${compact.format(n / 1e9)} GB`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** A chip in the top bar that opens a small popover; Esc or a click outside closes it. */
function Pop({ chip, label, children, active }: { chip: ReactNode; label: string; children: (close: () => void) => ReactNode; active?: boolean }) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return <div className="tb-pop" ref={root} data-no-drag>
    <button type="button" className={`tb-chip ${active ? "is-active" : ""} ${open ? "is-open" : ""}`} aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{chip}</button>
    {open && <div className="tb-panel" role="dialog" aria-label={label}>{children(() => setOpen(false))}</div>}
  </div>;
}

// ── shared live data: one fetch loop per source, however many views show it ──────────────────
function source<T>(fetcher: () => Promise<T>, everyMs: number) {
  let value = null as T | null, error = "", timer: ReturnType<typeof setInterval> | null = null, busy = false;
  const listeners = new Set<() => void>();
  let snap: { value: T | null; error: string; busy: boolean } = { value, error, busy };
  const emit = () => { snap = { value, error, busy }; listeners.forEach((l) => l()); };
  const refresh = async () => { busy = true; emit(); try { value = await fetcher(); error = ""; } catch (e) { error = (e as Error).message; } busy = false; emit(); };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    if (listeners.size === 1) { void refresh(); timer = setInterval(() => void refresh(), everyMs); }
    return () => { listeners.delete(l); if (!listeners.size && timer) { clearInterval(timer); timer = null; } };
  };
  return { use: () => useSyncExternalStore(subscribe, () => snap, () => snap), refresh };
}
interface SystemInfo { cpu: number; load: number[]; cores: number; memory: { used: number; total: number }; disk: { free: number; total: number } | null; battery: { pct: number; charging: boolean; source: string; remaining: string | null } | null; uptime: number; host: string }
interface LearningInfo { due: number; days: Array<{ day: string; reviews: number }>; profile?: { goal?: string } }
let forceWeather = false;
const weather = source<Weather>(() => { const f = forceWeather; forceWeather = false; return loadWeather(f); }, 15 * 60_000);
const system = source<SystemInfo>(() => api<SystemInfo>("/api/system"), 10_000);
const learning = source<LearningInfo>(() => api<LearningInfo>("/api/learning"), 5 * 60_000);
/** The same live feeds the widgets use, for the Today view. */
export const useWeatherNow = () => weather.use();
export const useLearningNow = () => learning.use();
function useNow(everyMs: number) { const [now, setNow] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(t); }, [everyMs]); return now; }

function useCrew() {
  const crew = useLive((s) => s.crew);
  const runs = Object.values(crew.runs).filter((r) => isTopLevelWork(r, crew.runs) && ACTIVE.has(r.status)).sort((a, b) => b.updatedAt - a.updatedAt);
  return { runs, approvals: Object.values(crew.approvals).sort((a, b) => a.at - b.at), today: crew.today, members: crew.members, limited: Object.values(crew.limited) };
}

/** Finish a focus block once, wherever it's showing: native banner and chime. */
function useFocusDone() {
  const timer = useFocusTimer(), { sounds } = useLook(), now = useNow(1000);
  const remaining = timer ? remainingFocusMs(timer, now) : 0;
  useEffect(() => {
    if (!timer || remaining > 0) return;
    const key = `shuacrew.focusDone:${timer.startedAt}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch { /* ignore */ }
    notifyNative("Focus block done", `${Math.round(timer.durationMs / 60000)} minutes — nice work. Take a short break.`);
    playSound("done", Math.max(0.3, sounds.volume));
    setTimeout(() => setFocus(null), 4000);
  }, [timer, remaining, sounds.volume]);
  return { timer, remaining };
}

function Ring({ value }: { value: number }) {
  return <svg viewBox="0 0 20 20" className="tb-ring" aria-hidden="true"><circle cx="10" cy="10" r="8" /><circle cx="10" cy="10" r="8" className="tb-ring-fill" style={{ strokeDashoffset: `${50.27 * (1 - value)}` }} /></svg>;
}
function Bar({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="wg-bar"><span>{label}</span><i><b style={{ width: `${Math.min(100, value)}%` }} data-hot={value > 85 || undefined} /></i><small>{detail}</small></div>;
}

// ── chips (top bar) ──────────────────────────────────────────────────────────────────────────
/** Each chip subscribes only to its own source, so widgets you haven't placed never poll. */
function WeatherChipBody() { const w = weather.use(), d = w.value ? describe(w.value.code, w.value.day) : null, I = d ? WEATHER_ICONS[d.icon] : Cloud; return <><I size={14} className="tb-wx-icon" />{w.value ? <span className="tabular-nums">{w.value.temp}°</span> : <span className="tb-dim">{w.error ? "—" : "…"}</span>}</>; }
function FocusChipBody() { const { timer, remaining } = useFocusDone(); return timer ? <><Ring value={1 - remaining / timer.durationMs} /><span className="tabular-nums">{remaining > 0 ? formatFocusRemaining(remaining) : "Done"}</span></> : <Timer size={14} />; }
function CrewChipBody() { const crew = useCrew(); return <><Bot size={14} className={crew.runs.length ? "wg-live" : ""} /><span className="tabular-nums">{crew.runs.length}</span>{crew.approvals.length > 0 && <em className="wg-badge">{crew.approvals.length}</em>}</>; }
function ClockChipBody() { const prefs = useWidgets(), now = useNow(15_000); return <><Clock size={13} /><span className="tabular-nums">{new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>{prefs.zones[0] && <span className="tb-dim tabular-nums">{new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: prefs.zones[0] })}</span>}</>; }
function SpendChipBody() { const { today } = useCrew(); return <><Wallet size={13} /><span className="tabular-nums">{today.costUsd != null ? `$${today.costUsd.toFixed(2)}` : compact.format(today.tokens)}</span></>; }
function SystemChipBody() { const sys = system.use(); return <><Cpu size={13} /><span className="tabular-nums">{sys.value ? `${sys.value.cpu}%` : "…"}</span>{sys.value?.battery && <span className="tb-dim tabular-nums">{sys.value.battery.pct}%</span>}</>; }
function LearningChipBody() { const learn = learning.use(); return <><GraduationCap size={14} /><span className="tabular-nums">{learn.value ? learn.value.due : "…"}</span></>; }
function CountdownChipBody() { const c = useWidgets().countdown; return c ? <><CalendarClock size={13} /><span className="tabular-nums">{Math.max(0, daysUntil(c.date))}d</span><span className="tb-dim wg-trunc">{c.label}</span></> : <CalendarClock size={14} />; }
function Chip({ id }: { id: WidgetId }) {
  switch (id) {
    case "playing": return <RadioChip />;
    case "weather": return <WeatherChipBody />;
    case "focus": return <FocusChipBody />;
    case "crew": return <CrewChipBody />;
    case "clock": return <ClockChipBody />;
    case "spend": return <SpendChipBody />;
    case "system": return <SystemChipBody />;
    case "learning": return <LearningChipBody />;
    case "note": return <StickyNote size={14} />;
    case "countdown": return <CountdownChipBody />;
  }
}

// ── tiles (popover bodies and Spark) ─────────────────────────────────────────────────────────
export function WidgetTile({ id, ctx, close }: { id: WidgetId; ctx: WidgetCtx; close?: () => void }) {
  switch (id) {
    case "playing": return <RadioTile ctx={ctx} />;
    case "weather": return <WeatherTile />;
    case "focus": return <FocusTile close={close} />;
    case "crew": return <CrewTile ctx={ctx} />;
    case "clock": return <ClockTile />;
    case "spend": return <SpendTile ctx={ctx} />;
    case "system": return <SystemTile />;
    case "learning": return <LearningTile ctx={ctx} />;
    case "note": return <NoteTile ctx={ctx} />;
    case "countdown": return <CountdownTile />;
  }
}

function WeatherTile() {
  const w = weather.use(), prefs = useWeatherPrefs(), unit = prefs.unit === "f" ? "°F" : "°C";
  const d = w.value ? describe(w.value.code, w.value.day) : null, Icon = d ? WEATHER_ICONS[d.icon] : Cloud;
  return <div className="tb-weather">
    {w.value && d ? <>
      <header><Icon size={30} className="tb-wx-icon" /><div><strong>{w.value.temp}{unit}</strong><span>{d.label} · {w.value.place}</span></div>
        <button type="button" className="tb-icon-btn" aria-label="Refresh weather" disabled={w.busy} onClick={() => { forceWeather = true; void weather.refresh(); }}><RefreshCw size={13} className={w.busy ? "tb-spin" : ""} /></button></header>
      <p className="tb-wx-meta">H {w.value.hi}° · L {w.value.lo}° · <Wind size={11} /> {w.value.wind} {prefs.unit === "f" ? "mph" : "km/h"}</p>
      <ol className="tb-hours">{w.value.hours.map((h) => { const I = WEATHER_ICONS[describe(h.code).icon]; return <li key={h.time}><small>{h.time}</small><I size={15} /><b>{h.temp}°</b>{h.rain > 0 && <em>{h.rain}%</em>}</li>; })}</ol>
      <p className="tb-foot">Open-Meteo · updated {new Date(w.value.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
    </> : <p className="tb-dim">{w.error || "Loading the weather…"}</p>}
  </div>;
}

function FocusTile({ close }: { close?: () => void }) {
  const { timer, remaining } = useFocusDone(), running = !!timer && timer.pausedRemainingMs === null && remaining > 0;
  return <div className="tb-timer">
    {timer ? <>
      <div className="tb-big-ring"><Ring value={1 - remaining / timer.durationMs} /><strong className="tabular-nums">{remaining > 0 ? formatFocusRemaining(remaining) : "Done"}</strong><span>{timer.pausedRemainingMs !== null ? "paused" : running ? "focusing" : "complete"}</span></div>
      <div className="tb-row">
        {remaining > 0 && <button type="button" className="tb-btn" onClick={() => setFocus(timer.pausedRemainingMs === null ? pauseFocus(timer) : resumeFocus(timer))}>{timer.pausedRemainingMs === null ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}</button>}
        <button type="button" className="tb-btn" onClick={() => { setFocus(null); close?.(); }}><Square size={12} /> Stop</button>
      </div>
    </> : <>
      <strong className="tb-title">Focus timer</strong>
      <div className="tb-presets">{FOCUS_MINUTES.map((m) => <button key={m} type="button" onClick={() => { setFocus(startFocus(m)); close?.(); }}>{m}<small>min</small></button>)}</div>
      <p className="tb-foot">A notification and a chime when it ends. Same timer in the app and in Spark.</p>
    </>}
  </div>;
}

function CrewTile({ ctx }: { ctx: WidgetCtx }) {
  const { runs, approvals, members, limited } = useCrew(), [busy, setBusy] = useState("");
  const decide = async (id: string, allow: boolean) => { setBusy(id); try { await decideApproval(id, allow); } finally { setBusy(""); } };
  return <div className="wg-crew">
    <header className="wg-head"><strong>Crew</strong><span>{runs.length ? `${runs.length} working` : "all quiet"}{approvals.length ? ` · ${approvals.length} waiting on you` : ""}</span></header>
    {approvals.slice(0, 4).map((a) => <div key={a.id} className="wg-approval">
      <ShieldQuestion size={14} /><div><b>{a.tool}</b><small>{a.reason || a.rule}</small></div>
      <button type="button" disabled={busy === a.id} aria-label="Allow" className="wg-yes" onClick={() => void decide(a.id, true)}><Check size={13} /></button>
      <button type="button" disabled={busy === a.id} aria-label="Deny" className="wg-no" onClick={() => void decide(a.id, false)}><X size={13} /></button>
    </div>)}
    {runs.slice(0, 5).map((r) => <button type="button" key={r.id} className="wg-run" onClick={() => ctx.go(`/sessions/${r.id}`)}>
      <i data-status={r.status} /><span>{r.title}</span><small>{r.member ? members[r.member]?.name ?? "" : r.runtime}</small>
    </button>)}
    {limited[0] && <p className="tb-foot">Reset estimate {new Date(limited[0].until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}: {limited[0].message}</p>}
    {!runs.length && !approvals.length && <p className="tb-foot">Nothing running. Start a session and it shows up here, live.</p>}
    <button type="button" className="tb-btn wg-more" onClick={() => ctx.go("/activity")}>Mission control</button>
  </div>;
}

function ClockTile() {
  const prefs = useWidgets(), now = useNow(1000), [zone, setZone] = useState("");
  const zones = (() => { try { return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone"); } catch { return []; } })();
  const offset = (tz: string) => { const f = (z?: string) => new Date(new Date(now).toLocaleString("en-US", { timeZone: z })).getTime(); const h = Math.round((f(tz) - f()) / 3_600_000); return h === 0 ? "same time" : `${h > 0 ? "+" : ""}${h}h`; };
  const add = () => { if (zones.includes(zone)) { saveWidgets({ zones: [...prefs.zones, zone] }); setZone(""); } };
  return <div className="wg-clock">
    <strong className="wg-big tabular-nums">{new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</strong>
    <span className="tb-dim">{new Date(now).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
    <ul>{prefs.zones.map((z) => <li key={z}><span>{z.split("/").at(-1)!.replace(/_/g, " ")}</span><b className="tabular-nums">{new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: z })}</b><small>{offset(z)}</small>
      <button type="button" aria-label={`Remove ${z}`} onClick={() => saveWidgets({ zones: prefs.zones.filter((x) => x !== z) })}><X size={11} /></button></li>)}</ul>
    {prefs.zones.length < 4 && <form className="wg-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <input list="wg-zones" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Add a city: Europe/London" aria-label="Add a time zone" />
      <datalist id="wg-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
      <button type="submit" aria-label="Add" disabled={!zones.includes(zone)}><Plus size={13} /></button>
    </form>}
  </div>;
}

function SpendTile({ ctx }: { ctx: WidgetCtx }) {
  const { today } = useCrew();
  return <div className="wg-spend">
    <header className="wg-head"><strong>Today</strong><span>{today.day}</span></header>
    <div className="wg-stats">
      <div><b className="tabular-nums">{today.costUsd != null ? `$${today.costUsd.toFixed(2)}` : "—"}</b><small>cost</small></div>
      <div><b className="tabular-nums">{compact.format(today.tokens)}</b><small>tokens</small></div>
      <div><b className="tabular-nums">{today.runs}</b><small>sessions</small></div>
    </div>
    <p className="tb-foot">{today.costUsd == null ? "On your subscription: tokens count, dollars don't." : "Metered usage, as reported by the runtimes."}</p>
    <button type="button" className="tb-btn wg-more" onClick={() => ctx.go("/usage")}>Usage</button>
  </div>;
}

function SystemTile() {
  const { value: s, error } = system.use();
  if (!s) return <p className="tb-dim">{error || "Reading this Mac…"}</p>;
  const b = s.battery, BatteryIcon = !b ? BatteryFull : b.charging ? BatteryCharging : b.pct < 20 ? BatteryLow : b.pct < 60 ? BatteryMedium : BatteryFull;
  const up = s.uptime > 86400 ? `${Math.floor(s.uptime / 86400)}d` : `${Math.floor(s.uptime / 3600)}h`;
  return <div className="wg-system">
    <header className="wg-head"><strong>{s.host}</strong><span>up {up} · {s.cores} cores</span></header>
    <Bar label="CPU" value={s.cpu} detail={`${s.cpu}% · load ${s.load[0]}`} />
    <Bar label="Memory" value={pct(s.memory.used, s.memory.total)} detail={`${bytes(s.memory.used)} of ${bytes(s.memory.total)}`} />
    {s.disk && <Bar label="Disk" value={pct(s.disk.total - s.disk.free, s.disk.total)} detail={`${bytes(s.disk.free)} free`} />}
    {b && <p className="wg-battery"><BatteryIcon size={16} data-low={b.pct < 20 && !b.charging || undefined} /><b className="tabular-nums">{b.pct}%</b><span className="tb-dim">{b.charging ? "charging" : b.source === "ac" ? "plugged in" : b.remaining && b.remaining !== "0:00" ? `${b.remaining} left` : "on battery"}</span></p>}
  </div>;
}

function LearningTile({ ctx }: { ctx: WidgetCtx }) {
  const { value: l, error } = learning.use();
  if (!l) return <p className="tb-dim">{error || "Loading…"}</p>;
  const days = streak(l.days);
  return <div className="wg-learning">
    <header className="wg-head"><strong>Learning</strong><span>{l.profile?.goal || "Set a goal in Learning"}</span></header>
    <div className="wg-stats"><div><b className="tabular-nums">{l.due}</b><small>cards due</small></div><div><b className="tabular-nums">{days}</b><small>day streak</small></div></div>
    <ol className="wg-days">{l.days.map((d) => <li key={d.day} title={`${d.day}: ${d.reviews} reviews`} data-level={Math.min(3, Math.ceil(d.reviews / 5))} />)}</ol>
    <button type="button" className="tb-btn wg-more" onClick={() => ctx.go("/learn")}>{l.due ? "Review now" : "Open Learning"}</button>
  </div>;
}

function NoteTile({ ctx }: { ctx: WidgetCtx }) {
  const note = useNote(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const send = async () => { setBusy(true); setError(""); try { const r = await launchRun({ ask: note }); ctx.go(`/sessions/${r.id}`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <div className="wg-note">
    <header className="wg-head"><strong>Scratch note</strong><span>syncs with Spark</span></header>
    <textarea value={note} onChange={(e) => saveNote(e.target.value)} placeholder="Jot it down: an idea, a TODO, a bug to chase…" aria-label="Scratch note" rows={5} />
    {error && <p className="tb-foot" style={{ color: "var(--bad)" }}>{error}</p>}
    <div className="tb-row" style={{ justifyContent: "flex-end" }}>
      {note && <button type="button" className="tb-btn" onClick={() => saveNote("")}>Clear</button>}
      <button type="button" className="tb-btn" disabled={!note.trim() || busy} onClick={() => void send()}><Send size={12} /> Ask the crew</button>
    </div>
  </div>;
}

function CountdownTile() {
  const prefs = useWidgets(), c = prefs.countdown, [label, setLabel] = useState(c?.label ?? ""), [date, setDate] = useState(c?.date ?? "");
  if (c) {
    const n = daysUntil(c.date);
    return <div className="wg-countdown">
      <strong className="wg-big tabular-nums">{n > 0 ? n : n === 0 ? "Today" : "Done"}</strong><span>{n > 0 ? `day${n === 1 ? "" : "s"} until ${c.label}` : c.label}</span>
      <small className="tb-dim">{new Date(`${c.date}T12:00`).toLocaleDateString([], { weekday: "short", month: "long", day: "numeric", year: "numeric" })}</small>
      <button type="button" className="tb-btn wg-more" onClick={() => saveWidgets({ countdown: null })}>Change</button>
    </div>;
  }
  return <form className="wg-countdown-form" onSubmit={(e) => { e.preventDefault(); saveWidgets({ countdown: { label, date } }); }}>
    <strong className="tb-title">Count down to…</strong>
    <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Launch, interview, trip" aria-label="What" maxLength={40} />
    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="When" />
    <button type="submit" className="tb-btn" disabled={!label.trim() || !date}>Start countdown</button>
  </form>;
}

// ── placements ───────────────────────────────────────────────────────────────────────────────
/** The top bar's widgets, in your order. */
export function TopBarWidgets({ ctx }: { ctx: WidgetCtx }) {
  const prefs = useWidgets(), crew = useCrew(), timer = useFocusTimer(), radio = useRadio();
  return <>{placed(prefs, "topbar").map((id) => <Pop key={id} label={WIDGET_INFO[id].name} active={id === "playing" && radio.playing || id === "focus" && !!timer || id === "crew" && crew.approvals.length > 0} chip={<Chip id={id} />}>
    {(close) => <WidgetTile id={id} ctx={ctx} close={close} />}
  </Pop>)}</>;
}

/** Spark's widget board: the same widgets as tiles. */
export function SparkWidgets({ ctx }: { ctx: WidgetCtx }) {
  const prefs = useWidgets(), list = placed(prefs, "spark");
  if (!list.length) return <p className="buddy-hint">No widgets here yet. Pick some in ShuaCrew → Settings → Widgets.</p>;
  return <div className="wg-board">{list.map((id) => <section key={id} className="wg-tile" aria-label={WIDGET_INFO[id].name}><WidgetTile id={id} ctx={ctx} /></section>)}</div>;
}

/** Live activities in the notch: the widgets you put there, as a swipeable row of dark tiles. */
export function NotchWidgets({ ctx, tab = 0 }: { ctx: WidgetCtx; tab?: number }) {
  const list = placed(useWidgets(), "notch");
  if (!list.length) return null;
  return <div className="notch-widgets" aria-label="Live activities">{list.map((id) => <section key={id} className="wg-tile" aria-label={WIDGET_INFO[id].name} tabIndex={tab}><WidgetTile id={id} ctx={ctx} /></section>)}</div>;
}

/**
 * The top bar's one status island: at a glance, just what's live (crew working, the weather, a running focus
 * block, tokens today, gateway health). Click it for everything else as tiles, like Control Center.
 */
export interface IslandLimit { key: string; label: string; until: string; message: string; retrying?: boolean; retry(): void }
export function StatusIsland({ ctx, running, tokens, connection, limits = [] }: { ctx: WidgetCtx; running: number; tokens: string; connection: "live" | "connecting" | "offline" | string; limits?: IslandLimit[] }) {
  const prefs = useWidgets(), tiles = placed(prefs, "topbar"), timer = useFocusTimer(), crew = useCrew();
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const go: WidgetCtx = { go: (p) => { setOpen(false); ctx.go(p); } };
  const health = connection === "live" ? "ok" : connection === "connecting" ? "wait" : "bad";
  return <div className="island" ref={root} data-no-drag>
    <button type="button" className={`island-pill ${open ? "is-open" : ""}`} aria-expanded={open} aria-label="Status and widgets" onClick={() => setOpen((o) => !o)}>
      <span className="island-seg"><i className={`island-dot is-${health} ${running ? "is-live" : ""}`} /><b className="tabular-nums">{running}</b><span className="island-dim">working</span></span>
      {limits[0] && <span className="island-seg island-limit" title={limits[0].message}><Timer size={12} />{limits[0].label} {limits[0].retrying ? "retrying" : "limited"}</span>}
      {crew.approvals.length > 0 && <span className="island-seg island-wait"><ShieldQuestion size={12} /><b className="tabular-nums">{crew.approvals.length}</b></span>}
      {tiles.includes("weather") && <span className="island-seg"><WeatherChipBody /></span>}
      {timer && <span className="island-seg island-focus"><FocusChipBody /></span>}
      <span className="island-seg island-dim tabular-nums">{tokens}</span>
    </button>
    {open && <div className="island-panel" role="dialog" aria-label="Status and widgets">
      <header><strong>Now</strong><span>{connection === "live" ? "Gateway online" : connection === "connecting" ? "Connecting…" : "Reconnecting…"} · {tokens} tokens today</span></header>
      {limits.map((l) => <p key={l.key} className="island-notice"><Timer size={14} /><span><b>{l.label}</b> {l.retrying ? "Retry eligible; awaiting a successful response." : `Reset estimate: ${l.until}. Availability is unconfirmed.`}</span><button type="button" onClick={l.retry}>Try now</button></p>)}
      <div className="island-grid">{tiles.map((id) => <section key={id} className={`island-tile tile-${id}`} aria-label={WIDGET_INFO[id].name}><WidgetTile id={id} ctx={go} /></section>)}</div>
      <footer><button type="button" onClick={() => go.go("/settings#widgets")}>Customize widgets</button></footer>
    </div>}
  </div>;
}
