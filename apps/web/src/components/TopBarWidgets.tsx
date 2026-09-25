import { useEffect, useRef, useState, type ReactNode } from "react";
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Pause, Play, RefreshCw, Square, Sun, Timer, Wind } from "lucide-react";
import { describe, loadWeather, useWeatherPrefs, type Weather } from "../lib/weather";
import { FOCUS_MINUTES, formatFocusRemaining, pauseFocus, remainingFocusMs, resumeFocus, setFocus, startFocus, useFocusTimer } from "../lib/focus-timer";
import { notifyNative } from "../lib/native";
import { playSound } from "./Sounds";
import { useLook } from "../lib/look";
import "./topbar-widgets.css";

const ICONS = { sun: Sun, moon: Moon, "cloud-sun": CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning } as const;

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

export function WeatherChip() {
  const prefs = useWeatherPrefs();
  const [w, setW] = useState<Weather | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const refresh = async (force = false) => { setBusy(true); try { setW(await loadWeather(force)); setError(""); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  useEffect(() => { if (!prefs.enabled) return; void refresh(); const t = setInterval(() => void refresh(), 15 * 60_000); return () => clearInterval(t); }, [prefs.enabled, prefs.unit, prefs.source, prefs.city]);
  if (!prefs.enabled) return null;
  const d = w ? describe(w.code, w.day) : null, Icon = d ? ICONS[d.icon] : Cloud, unit = prefs.unit === "f" ? "°F" : "°C";
  return <Pop label="Weather" chip={<><Icon size={14} className="tb-wx-icon" />{w ? <span className="tabular-nums">{w.temp}°</span> : <span className="tb-dim">{error ? "—" : "…"}</span>}</>}>
    {() => <div className="tb-weather">
      {w && d ? <>
        <header><Icon size={30} className="tb-wx-icon" /><div><strong>{w.temp}{unit}</strong><span>{d.label} · {w.place}</span></div>
          <button type="button" className="tb-icon-btn" aria-label="Refresh weather" disabled={busy} onClick={() => void refresh(true)}><RefreshCw size={13} className={busy ? "tb-spin" : ""} /></button></header>
        <p className="tb-wx-meta">H {w.hi}° · L {w.lo}° · <Wind size={11} /> {w.wind} {prefs.unit === "f" ? "mph" : "km/h"}</p>
        <ol className="tb-hours">{w.hours.map((h) => { const I = ICONS[describe(h.code).icon]; return <li key={h.time}><small>{h.time}</small><I size={15} /><b>{h.temp}°</b>{h.rain > 0 && <em>{h.rain}%</em>}</li>; })}</ol>
        <p className="tb-foot">Open-Meteo · updated {new Date(w.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
      </> : <p className="tb-dim">{error || "Loading the weather…"}</p>}
    </div>}
  </Pop>;
}

export function TimerChip() {
  const timer = useFocusTimer();
  const { sounds } = useLook();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!timer) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [timer]);
  const remaining = timer ? remainingFocusMs(timer, now) : 0, running = !!timer && timer.pausedRemainingMs === null && remaining > 0;
  // Finish once per timer: native banner + chime; then clear it.
  useEffect(() => {
    if (!timer || remaining > 0) return;
    const key = `shuacrew.focusDone:${timer.startedAt}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
    notifyNative("Focus block done", `${Math.round(timer.durationMs / 60000)} minutes — nice work. Take a short break.`);
    playSound("done", Math.max(0.3, sounds.volume));
    setTimeout(() => setFocus(null), 4000);
  }, [timer, remaining, sounds.volume]);
  const pct = timer ? 1 - remaining / timer.durationMs : 0;
  const ring = <svg viewBox="0 0 20 20" className="tb-ring" aria-hidden="true"><circle cx="10" cy="10" r="8" /><circle cx="10" cy="10" r="8" className="tb-ring-fill" style={{ strokeDashoffset: `${50.27 * (1 - pct)}` }} /></svg>;
  return <Pop label="Focus timer" active={!!timer} chip={timer ? <>{ring}<span className="tabular-nums">{remaining > 0 ? formatFocusRemaining(remaining) : "Done"}</span></> : <Timer size={14} />}>
    {(close) => <div className="tb-timer">
      {timer ? <>
        <div className="tb-big-ring">{ring}<strong className="tabular-nums">{remaining > 0 ? formatFocusRemaining(remaining) : "Done"}</strong><span>{timer.pausedRemainingMs !== null ? "paused" : running ? "focusing" : "complete"}</span></div>
        <div className="tb-row">
          {remaining > 0 && <button type="button" className="tb-btn" onClick={() => setFocus(timer.pausedRemainingMs === null ? pauseFocus(timer) : resumeFocus(timer))}>{timer.pausedRemainingMs === null ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}</button>}
          <button type="button" className="tb-btn" onClick={() => { setFocus(null); close(); }}><Square size={12} /> Stop</button>
        </div>
      </> : <>
        <strong className="tb-title">Focus timer</strong>
        <div className="tb-presets">{FOCUS_MINUTES.map((m) => <button key={m} type="button" onClick={() => { setFocus(startFocus(m)); close(); }}>{m}<small>min</small></button>)}</div>
        <p className="tb-foot">A native notification and a chime when it ends. Runs even if you switch screens.</p>
      </>}
    </div>}
  </Pop>;
}
