import { useSyncExternalStore } from "react";

/**
 * ShuaCrew Radio's player: one <audio> for the whole app, so music keeps going as you move between screens. Stations
 * are folders of your own files (the gateway lists and streams them). Spark, agents via the radio skill, and the
 * terminal steer it through /api/radio/command, which arrives here over /api/radio/events.
 */
export interface RadioTrack { id: string; station: string; title: string; artist: string; duration: number | null }
export interface RadioStation { id: string; name: string; tracks: RadioTrack[] }
export interface RadioState {
  loaded: boolean; root: string; exists: boolean; stations: RadioStation[];
  station: string | null; track: RadioTrack | null; playing: boolean; volume: number;
  position: number; duration: number; queue: RadioTrack[]; history: RadioTrack[]; error: string;
}

const KEY = "shuacrew.radio";
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as { station?: string; volume?: number }; } catch { return {}; } })();
let state: RadioState = { loaded: false, root: "", exists: false, stations: [], station: saved.station ?? null, track: null, playing: false, volume: typeof saved.volume === "number" ? saved.volume : 0.6, position: 0, duration: 0, queue: [], history: [], error: "" };
const listeners = new Set<() => void>();
const set = (patch: Partial<RadioState>) => {
  state = { ...state, ...patch }; listeners.forEach((l) => l());
  try { localStorage.setItem(KEY, JSON.stringify({ station: state.station, volume: state.volume })); } catch { /* ignore */ }
};
export const getRadio = () => state;
export function useRadio() { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, getRadio, getRadio); }

let audio: HTMLAudioElement | null = null;
let analyser: AnalyserNode | null = null;
function el() {
  if (audio) return audio;
  audio = new Audio(); audio.preload = "auto"; audio.volume = state.volume;
  audio.addEventListener("timeupdate", () => set({ position: audio!.currentTime, duration: Number.isFinite(audio!.duration) ? audio!.duration : state.track?.duration ?? 0 }));
  audio.addEventListener("play", () => set({ playing: true, error: "" }));
  audio.addEventListener("pause", () => set({ playing: false }));
  audio.addEventListener("ended", () => void next());
  audio.addEventListener("error", () => { set({ error: "That track wouldn't play — skipping it." }); setTimeout(() => void next(), 800); });
  return audio;
}

/** Levels for the visualizer; created on first play (browsers need a click before audio graphs start). */
export function levels(out: Uint8Array): boolean {
  if (!analyser) return false;
  analyser.getByteFrequencyData(out as Uint8Array<ArrayBuffer>); return true;
}
function wireAnalyser() {
  if (analyser || !audio) return;
  try {
    const ctx = new AudioContext(), src = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.82;
    src.connect(analyser); analyser.connect(ctx.destination); void ctx.resume();
  } catch { /* visualizer is decoration; playback never depends on it */ }
}

export async function loadRadio() {
  try {
    const r = await fetch("/api/radio"); const body = await r.json() as { root: string; exists: boolean; stations: RadioStation[] };
    const station = body.stations.find((s) => s.id === state.station) ? state.station : body.stations.find((s) => s.tracks.length)?.id ?? body.stations[0]?.id ?? null;
    set({ loaded: true, root: body.root, exists: body.exists, stations: body.stations, station });
  } catch { set({ loaded: true, error: "Couldn't reach the gateway for your stations." }); }
}
const post = (url: string, body?: unknown) => fetch(url, { method: "POST", headers: { "X-ShuaCrew": "1", "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
/** Steer the radio from anywhere (Spark's desktop panel included): the gateway relays it to the player in the app. */
export async function radioCommand(c: { cmd: string; station?: string; value?: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await post("/api/radio/command", c);
    if (r.ok) return { ok: true };
    const body = await r.json().catch(() => ({})) as { error?: string };
    return { ok: false, error: body.error ?? "The radio didn't answer." };
  } catch { return { ok: false, error: "Couldn't reach the radio." }; }
}
export async function setupRadio() { await post("/api/radio/setup"); await loadRadio(); }
export async function revealRadio() { await post("/api/radio/reveal"); }

const shuffle = <T,>(xs: T[]) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };

function start(track: RadioTrack) {
  const a = el();
  a.src = `/api/radio/tracks/${track.id}/audio`;
  wireAnalyser();
  set({ track, position: 0, duration: track.duration ?? 0, history: state.track && state.track.id !== track.id ? [...state.history.slice(-30), state.track] : state.history });
  void a.play().catch(() => set({ playing: false, error: "Press play to start — macOS needs one click before audio." }));
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist || "ShuaCrew Radio", album: state.stations.find((s) => s.id === track.station)?.name ?? "ShuaCrew Radio" });
    navigator.mediaSession.setActionHandler("nexttrack", () => void next());
    navigator.mediaSession.setActionHandler("previoustrack", () => void previous());
    navigator.mediaSession.setActionHandler("play", () => resume());
    navigator.mediaSession.setActionHandler("pause", () => pause());
  }
}

/** Tune in: shuffle the station and start its first track (or a chosen one). */
export async function playStation(stationId: string, trackId?: string) {
  if (!state.loaded) await loadRadio();
  const s = state.stations.find((x) => x.id === stationId);
  if (!s || !s.tracks.length) { set({ station: stationId, error: s ? `${s.name} is empty — drop some tracks in its folder.` : "No such station." }); return; }
  const order = shuffle(s.tracks);
  const first = trackId ? s.tracks.find((t) => t.id === trackId) ?? order[0]! : order[0]!;
  set({ station: s.id, queue: order.filter((t) => t.id !== first.id), error: "" });
  start(first);
}
export async function next() {
  if (!state.station) return;
  let queue = state.queue;
  if (!queue.length) { const s = state.stations.find((x) => x.id === state.station); queue = s ? shuffle(s.tracks) : []; } // loops forever, reshuffled
  const [n, ...rest] = queue; if (!n) return;
  set({ queue: rest }); start(n);
}
export async function previous() {
  const a = el();
  if (a.currentTime > 4 || !state.history.length) { a.currentTime = 0; return; }
  const prev = state.history[state.history.length - 1]!;
  set({ history: state.history.slice(0, -1), queue: state.track ? [state.track, ...state.queue] : state.queue });
  start(prev);
}
export function pause() { audio?.pause(); }
export function resume() { if (audio?.src) void audio.play().catch(() => {}); else if (state.station) void playStation(state.station); }
export function toggle() { if (state.playing) pause(); else resume(); }
export function stop() { if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); } set({ track: null, playing: false, position: 0, queue: [] }); }
export function seek(seconds: number) { if (audio && Number.isFinite(seconds)) audio.currentTime = seconds; }
export function setVolume(v: number) { const x = Math.min(1, Math.max(0, v)); if (audio) audio.volume = x; set({ volume: x }); }

/** Commands from Spark, agents and the terminal. One subscription per window. */
let events: EventSource | null = null;
export function listenForCommands() {
  if (events || typeof EventSource === "undefined") return;
  events = new EventSource("/api/radio/events");
  events.onmessage = (e) => {
    let c: { cmd: string; station?: string; track?: string; value?: number };
    try { c = JSON.parse(e.data); } catch { return; }
    if (c.cmd === "play") void loadRadio().then(() => playStation(c.station ?? state.station ?? state.stations.find((s) => s.tracks.length)?.id ?? "", c.track));
    else if (c.cmd === "pause") pause(); else if (c.cmd === "resume") resume(); else if (c.cmd === "next") void next();
    else if (c.cmd === "previous") void previous(); else if (c.cmd === "stop") stop(); else if (c.cmd === "volume" && typeof c.value === "number") setVolume(c.value);
  };
}

export const clock = (s: number) => { if (!Number.isFinite(s) || s < 0) return "0:00"; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
