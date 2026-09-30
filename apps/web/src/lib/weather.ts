import { useSyncExternalStore } from "react";
import { requestLocation } from "./native";
import { api } from "./api";

/** Top-bar weather from Open-Meteo (free, no account). Only rounded coordinates or your city leave the Mac. */
export interface WeatherPrefs { enabled: boolean; unit: "c" | "f"; source: "mac" | "city"; city: string; place?: { name: string; lat: number; lon: number } }
export interface Weather { at: number; place: string; temp: number; code: number; day: boolean; hi: number; lo: number; wind: number; hours: Array<{ time: string; temp: number; code: number; rain: number }> }
const PREFS = "shuacrew.weather", CACHE = "shuacrew.weatherCache";
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
/** °F where the region uses it (US, Liberia, Myanmar), else °C — until you pick one in Settings. */
export const localUnit = (locale = Intl.DateTimeFormat().resolvedOptions().locale): "c" | "f" => (/-(US|LR|MM)\b/i.test(locale) ? "f" : "c");
let prefs: WeatherPrefs = { enabled: false, unit: localUnit(), source: "mac", city: "", ...read<Partial<WeatherPrefs>>(PREFS, {}) };
const listeners = new Set<() => void>();
export function getWeatherPrefs() { return prefs; }
export function saveWeatherPrefs(patch: Partial<WeatherPrefs>) { prefs = { ...prefs, ...patch }; try { localStorage.setItem(PREFS, JSON.stringify(prefs)); localStorage.removeItem(CACHE); } catch { /* ignore */ } listeners.forEach((l) => l()); }
export function useWeatherPrefs() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => prefs, () => prefs); }

/** WMO weather codes → a short label and an icon name. */
export function describe(code: number, day = true): { label: string; icon: "sun" | "moon" | "cloud-sun" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm" } {
  if (code === 0) return { label: "Clear", icon: day ? "sun" : "moon" };
  if (code <= 2) return { label: "Partly cloudy", icon: "cloud-sun" };
  if (code === 3) return { label: "Overcast", icon: "cloud" };
  if (code <= 48) return { label: "Fog", icon: "fog" };
  if (code <= 57) return { label: "Drizzle", icon: "drizzle" };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: "Rain", icon: "rain" };
  if (code <= 77 || code === 85 || code === 86) return { label: "Snow", icon: "snow" };
  return { label: "Thunderstorm", icon: "storm" };
}

async function where(): Promise<{ name: string; lat: number; lon: number }> {
  if (prefs.source === "city") {
    if (prefs.place && prefs.place.name.toLowerCase().startsWith(prefs.city.trim().toLowerCase())) return prefs.place;
    const q = prefs.city.trim(); if (!q) throw new Error("Type a city in Settings → Workspace → Top bar.");
    const r = await api(`/api/weather/geocode?q=${encodeURIComponent(q)}`) as { results?: Array<{ name: string; admin1?: string; latitude: number; longitude: number }> };
    const hit = r.results?.[0]; if (!hit) throw new Error(`Couldn't find “${q}”.`);
    const place = { name: [hit.name, hit.admin1].filter(Boolean).join(", "), lat: Math.round(hit.latitude * 100) / 100, lon: Math.round(hit.longitude * 100) / 100 };
    saveWeatherPrefs({ place }); return place;
  }
  const c = await requestLocation(); return { name: "Your location", ...c };
}

/** Current weather, cached for 15 minutes. */
export async function loadWeather(force = false): Promise<Weather> {
  const cached = read<Weather | null>(CACHE, null);
  if (!force && cached && Date.now() - cached.at < 15 * 60_000) return cached;
  const p = await where();
  const r = await api(`/api/weather/forecast?lat=${p.lat}&lon=${p.lon}&unit=${prefs.unit}`) as {
    current: { temperature_2m: number; weather_code: number; is_day: number; wind_speed_10m: number; time: string };
    hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[] };
    daily: { temperature_2m_max: number[]; temperature_2m_min: number[] };
  };
  const start = Math.max(0, r.hourly.time.findIndex((t) => t >= r.current.time.slice(0, 13)));
  const w: Weather = { at: Date.now(), place: p.name, temp: Math.round(r.current.temperature_2m), code: r.current.weather_code, day: r.current.is_day === 1,
    hi: Math.round(r.daily.temperature_2m_max[0]!), lo: Math.round(r.daily.temperature_2m_min[0]!), wind: Math.round(r.current.wind_speed_10m),
    hours: r.hourly.time.slice(start + 1, start + 7).map((t, i) => ({ time: t.slice(11, 16), temp: Math.round(r.hourly.temperature_2m[start + 1 + i]!), code: r.hourly.weather_code[start + 1 + i]!, rain: r.hourly.precipitation_probability[start + 1 + i] ?? 0 })) };
  try { localStorage.setItem(CACHE, JSON.stringify(w)); } catch { /* ignore */ }
  return w;
}

/** Open-Meteo's week, as the gateway returns it with `days=7`. */
export interface WeekForecast {
  current: { temperature_2m: number; weather_code: number; time: string };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[] };
  daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[]; precipitation_probability_max: number[] };
}
/** Does a question ask about the weather? ("do I need an umbrella", "how hot is it tomorrow", "weekend forecast") */
export const asksWeather = (q: string) => /\b(weather|forecast|rain(ing|y)?|umbrella|snow(ing)?|temperature|degrees|how (hot|cold|warm)|sunny|cloudy|storm|jacket|coat|humid|wind(y)?)\b/i.test(q);
/**
 * The forecast as a few compact lines for Spark: now, the next 12 hours, and the week — so a weather question is
 * answered at once from real data (Open-Meteo), not after a 15–20 s web search and page read.
 */
export function weatherBrief(r: WeekForecast, place: string, unit: "c" | "f"): string {
  // Days say which are today, tomorrow and the weekend, so "this weekend" isn't left to date arithmetic (it once led with Friday).
  const today = r.current.time.slice(0, 10), tomorrow = new Date(new Date(`${today}T12:00:00`).getTime() + 86_400_000).toLocaleDateString("en-CA");
  const deg = unit === "f" ? "°F" : "°C", day = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`), tag = iso === today ? " (today)" : iso === tomorrow ? " (tomorrow)" : d.getDay() === 0 || d.getDay() === 6 ? " (weekend)" : "";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + tag;
  };
  const start = Math.max(0, r.hourly.time.findIndex((t) => t >= r.current.time.slice(0, 13)));
  const hours = r.hourly.time.slice(start, start + 12).map((t, i) => `${t.slice(11, 16)} ${Math.round(r.hourly.temperature_2m[start + i]!)}° ${describe(r.hourly.weather_code[start + i]!).label.toLowerCase()} ${r.hourly.precipitation_probability[start + i] ?? 0}%`);
  const week = r.daily.time.map((t, i) => `${day(t)}: ${Math.round(r.daily.temperature_2m_max[i]!)}/${Math.round(r.daily.temperature_2m_min[i]!)}${deg} ${describe(r.daily.weather_code[i]!).label.toLowerCase()}, rain ${r.daily.precipitation_probability_max[i] ?? 0}%`);
  return [
    `WEATHER for ${place} (live from Open-Meteo, ${deg}; rain = chance of rain) — answer weather questions from this at once, no web search, and show a forecast card when it helps:`,
    `Now: ${Math.round(r.current.temperature_2m)}${deg}, ${describe(r.current.weather_code).label.toLowerCase()}.`,
    `Next 12 hours: ${hours.join(" · ")}`,
    `This week: ${week.join(" · ")}`,
  ].join("\n");
}
/**
 * Fetch the week and brief it for Spark. Asking about the weather is the go-ahead — it doesn't wait for the top-bar
 * widget to be switched on (that setting is about showing it). The place is kept for 30 minutes so a follow-up
 * question skips the location lookup.
 */
let spot: { at: number; place: { name: string; lat: number; lon: number } } | null = null;
export async function weatherForSpark(): Promise<string> {
  if (!spot || Date.now() - spot.at > 30 * 60_000) spot = { at: Date.now(), place: await where() };
  const p = spot.place;
  const r = await api(`/api/weather/forecast?lat=${p.lat}&lon=${p.lon}&unit=${prefs.unit}&days=7`) as WeekForecast;
  return weatherBrief(r, p.name, prefs.unit);
}
