import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { saveBuddyVoice, useBuddyVoice } from "../lib/buddy-voice";
import { Copy, Moon, PiggyBank, Plus, Target, Trash2, Wand2 } from "lucide-react";
import { saveSchedule, useSchedule, type Mode, type ModeRule } from "../lib/modes";
import { encodeTheme, decodeTheme } from "../lib/theme-code";
import { getLook, saveLook, useLook } from "../lib/look";
import { useLive } from "../lib/live";
import { Segmented, SettingRow, Switch } from "./SettingControls";
import { saveWeatherPrefs, useWeatherPrefs } from "../lib/weather";

const NAMES: Record<Mode, { name: string; icon: typeof Target }> = { deep: { name: "Deep work", icon: Target }, saver: { name: "Cost saver", icon: PiggyBank }, wind: { name: "Wind down", icon: Moon } };
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };

/** Modes that switch themselves on and off. A mode you turned on by hand is never switched off by a schedule. */
export function ScheduleSettings() {
  const rules = useSchedule();
  const update = (i: number, patch: Partial<ModeRule>) => saveSchedule(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return <div className="settings-card batch-pad">
    <p className="power-hint" style={{ padding: 0 }}>Checked every 30 seconds while ShuaCrew is open. When the window ends, a scheduled mode restores exactly what it changed.</p>
    {rules.map((r, i) => { const N = NAMES[r.mode]; return <div className="sched-rule" key={i}>
      <select className="setting-input" value={r.mode} aria-label="Mode" onChange={(e) => update(i, { mode: e.target.value as Mode })}>{(Object.keys(NAMES) as Mode[]).map((m) => <option key={m} value={m}>{NAMES[m].name}</option>)}</select>
      <span className="sched-days" role="group" aria-label="Days">{DAYS.map((d, k) => <button key={k} type="button" aria-pressed={r.days.includes(k)} className={r.days.includes(k) ? "is-on" : ""} onClick={() => update(i, { days: r.days.includes(k) ? r.days.filter((x) => x !== k) : [...r.days, k].sort() })}>{d}</button>)}</span>
      <input type="time" className="setting-input" aria-label="From" value={hhmm(r.start)} onChange={(e) => update(i, { start: mins(e.target.value) })} />
      <span className="sched-to">to</span>
      <input type="time" className="setting-input" aria-label="Until" value={hhmm(r.end)} onChange={(e) => update(i, { end: mins(e.target.value) })} />
      <N.icon size={14} className="sched-icon" />
      <button type="button" className="power-icon" aria-label="Remove schedule" onClick={() => saveSchedule(rules.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
    </div>; })}
    <button type="button" className="settings-reset" style={{ alignSelf: "flex-start" }} onClick={() => saveSchedule([...rules, { mode: "deep", days: [1, 2, 3, 4, 5], start: 9 * 60, end: 12 * 60 }])}><Plus size={13} /> Add a schedule</button>
  </div>;
}

/** Share your look as a code; paste someone's code to try theirs (only valid values can be applied). */
export function ThemeShareSettings() {
  const appearance = useLive((s) => s.appearance), setAppearance = useLive((s) => s.setAppearance);
  const look = useLook();
  const [code, setCode] = useState(""), [notice, setNotice] = useState("");
  const mine = encodeTheme(appearance, look);
  return <div className="settings-card">
    <SettingRow name="Your look as a code" detail="Palette, accent, fonts and conversation style. Nothing private.">
      <code className="theme-code">{mine.slice(0, 22)}…</code>
      <button type="button" className="settings-reset" onClick={() => { void navigator.clipboard?.writeText(mine); setNotice("Copied — paste it anywhere."); }}><Copy size={12} /> Copy</button>
    </SettingRow>
    <SettingRow name="Try a code" detail="Applies instantly. Your previous look is in the time machine for app-side settings — or just paste your own code back.">
      <input className="setting-input" style={{ width: 200 }} placeholder="SHUA1-…" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Theme code" />
      <button type="button" className="settings-reset" disabled={!code.trim()} onClick={() => {
        try { const t = decodeTheme(code, { appearance, look: getLook() }); setAppearance(t.appearance); saveLook(t.look); setNotice(`Applied. Your old code: ${mine.slice(0, 18)}… (copied)`); void navigator.clipboard?.writeText(mine); setCode(""); }
        catch (e) { setNotice((e as Error).message); }
      }}><Wand2 size={12} /> Apply</button>
    </SettingRow>
    {notice && <p role="status" className="power-hint">{notice}</p>}
  </div>;
}

/** Top bar: live weather (Open-Meteo) from your Mac's location or a city you type. */
const BUDDY_KEY = "shuacrew.buddy.desktop";
const readBuddy = () => { try { return localStorage.getItem(BUDDY_KEY) !== "0"; } catch { return true; } };
const inMac = () => !!(window as unknown as { webkit?: { messageHandlers?: { shuacrew?: unknown } } }).webkit?.messageHandlers?.shuacrew;

/** Spark on the Mac desktop: a floating buddy the Mac app keeps over every app. */
export function DesktopBuddySettings() {
  const [on, setOn] = useState(readBuddy), voice = useBuddyVoice();
  const [voices, setVoices] = useState<Array<{ id: string; name: string; description?: string }>>([]);
  useEffect(() => { void api<{ voices?: Array<{ id: string; name: string; description?: string }> }>("/api/speech/status").then((s) => setVoices(s.voices ?? [])).catch(() => {}); }, []);
  const set = (next: boolean) => {
    setOn(next); try { localStorage.setItem(BUDDY_KEY, next ? "1" : "0"); } catch { /* ignore */ }
    (window as unknown as { webkit?: { messageHandlers?: { shuacrew?: { postMessage(m: unknown): void } } } }).webkit?.messageHandlers?.shuacrew?.postMessage({ type: "buddyEnabled", on: next });
  };
  return <div className="settings-card">
    <SettingRow name="Spark on your desktop" detail={inMac() ? "Floats over every app and Space, even with this window closed. Click Spark or press ⌃⌥Space to ask; drag to move." : "Available in the ShuaCrew Mac app."} modified={!on}>
      <Switch label="Desktop buddy" on={on} onChange={set} />
    </SettingRow>
    <SettingRow name="Spark talks" detail="Answers are spoken as they stream in, with a local neural voice (nothing leaves this Mac). Crew news too: “Aria finished…”." modified={!voice.on}>
      <Switch label="Spark talks" on={voice.on} onChange={(on) => saveBuddyVoice({ on })} />
    </SettingRow>
    {voice.on && <SettingRow name="Spark's voice" detail={voices.length ? "Local voices from Shua voice." : "Install local speech in Settings → Shua voice."}>
      <select className="setting-input" value={voice.id} onChange={(e) => saveBuddyVoice({ id: e.target.value })} aria-label="Spark's voice">{(voices.length ? voices : [{ id: voice.id, name: voice.id }]).map((v) => <option key={v.id} value={v.id}>{v.name}{"description" in v ? ` — ${(v as { description: string }).description}` : ""}</option>)}</select>
      <Segmented label="Speed" value={String(voice.speed) as "0.9" | "1" | "1.15"} onChange={(v) => saveBuddyVoice({ speed: Number(v) })} options={[["0.9", "Calm"], ["1", "Normal"], ["1.15", "Quick"]]} />
    </SettingRow>}
    <SettingRow name="Does things on your Mac" detail="Ask “open Xcode”, “open my projects folder”, “search the web for…”, “start a 25 minute focus”, or “have the crew fix the failing test”. Apps, web links and files in your home folder only; the Mac app checks every action." />
    <SettingRow name="Looking at your screen" detail="Only when you ask with the eye on: one screenshot of the display Spark is on (Spark itself left out), attached to that question and nothing else. macOS asks for Screen Recording once." />
    <SettingRow name="Pointing" detail="When it helps, Spark rings the exact button or field it means, right on your screen, for a few seconds. Click-through; it never clicks for you." />
    <SettingRow name="Hand to the crew" detail="⤢ in the card opens the conversation as a full session here, where your crew can take it further." />
  </div>;
}

export function TopBarSettings() {
  const w = useWeatherPrefs();
  const [city, setCity] = useState(w.city);
  return <div className="settings-card">
    <p className="power-hint" style={{ padding: "0 0 6px" }}>Free, no account; only rounded coordinates or your city are sent to Open-Meteo. Place the Weather widget above.</p>
    {<>
      <SettingRow name="Units"><Segmented label="Units" value={w.unit} onChange={(unit) => saveWeatherPrefs({ unit })} options={[["c", "°C · km/h"], ["f", "°F · mph"]]} /></SettingRow>
      <SettingRow name="Location" detail={w.source === "mac" ? "macOS asks once. Rounded to about a kilometre." : w.place ? `Using ${w.place.name}` : "Type a city and press Enter."}>
        <Segmented label="Location source" value={w.source} onChange={(source) => saveWeatherPrefs({ source })} options={[["mac", "This Mac"], ["city", "A city"]]} />
        {w.source === "city" && <input className="setting-input" style={{ width: 160 }} placeholder="Brooklyn" value={city} onChange={(e) => setCity(e.target.value)} onBlur={() => city !== w.city && saveWeatherPrefs({ city, place: undefined })} onKeyDown={(e) => { if (e.key === "Enter") saveWeatherPrefs({ city, place: undefined }); }} aria-label="City" />}
      </SettingRow>
    </>}
  </div>;
}
