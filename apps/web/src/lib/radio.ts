import { useSyncExternalStore } from "react";

/**
 * ShuaCrew Radio's player: one <audio> for the whole app, so music keeps going as you move between screens. Stations
 * are folders of your own files (the gateway lists and streams them). Spark, agents via the radio skill, and the
 * terminal steer it through /api/radio/command, which arrives here over /api/radio/events.
 */
export interface YouTubeStation { id: string; name: string; genre: "Lofi Jazz" | "Lofi Hip-Hop" | "Other"; videoId: string; channel: string }
export interface RadioTrack { id: string; station: string; title: string; artist: string; duration: number | null }
export interface RadioStation { id: string; name: string; tracks: RadioTrack[] }
export interface RadioState {
  loaded: boolean; root: string; exists: boolean; stations: RadioStation[];
  station: string | null; track: RadioTrack | null; playing: boolean; volume: number;
  position: number; duration: number; queue: RadioTrack[]; history: RadioTrack[]; error: string;
  /** Live YouTube stations, and the one on air (when a YouTube station plays, `track` is null). */
  youtube: YouTubeStation[]; live: YouTubeStation | null;
}

const KEY = "shuacrew.radio";
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as { station?: string; volume?: number }; } catch { return {}; } })();
let state: RadioState = { loaded: false, root: "", exists: false, stations: [], station: saved.station ?? null, track: null, playing: false, volume: typeof saved.volume === "number" ? saved.volume : 0.6, position: 0, duration: 0, queue: [], history: [], error: "", youtube: [], live: null };
const listeners = new Set<() => void>();
/** Something new came on: a local track (with what played before it) or a live station. The DJ listens to this. */
export type OnAir = { kind: "track"; track: RadioTrack; previous: RadioTrack | null; station: string } | { kind: "live"; station: YouTubeStation };
const onAirListeners = new Set<(e: OnAir) => void>();
export function onAir(l: (e: OnAir) => void) { onAirListeners.add(l); return () => { onAirListeners.delete(l); }; }
/** Dip the music under a voice (0–1 of your volume), without pausing it. */
export function dip(level: number) { const v = state.volume * level; if (audio) audio.volume = v; ytSend("setVolume", [Math.round(v * 100)]); }
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
    const r = await fetch("/api/radio"); const body = await r.json() as { root: string; exists: boolean; stations: RadioStation[]; youtube: YouTubeStation[] };
    const known = body.stations.some((s) => s.id === state.station) || body.youtube.some((s) => s.id === state.station);
    const station = known ? state.station : body.stations.find((s) => s.tracks.length)?.id ?? body.youtube[0]?.id ?? body.stations[0]?.id ?? null;
    set({ loaded: true, root: body.root, exists: body.exists, stations: body.stations, youtube: body.youtube ?? [], station });
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
  const before = state.track;
  queueMicrotask(() => onAirListeners.forEach((l) => l({ kind: "track", track, previous: before, station: state.stations.find((x) => x.id === track.station)?.name ?? "" })));
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

/* ── YouTube stations: YouTube's own embedded player, kept alive for the whole app (never downloaded). ─────────── */
let yt: HTMLIFrameElement | null = null;
const ytSend = (func: string, args: unknown[] = []) => yt?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
if (typeof window !== "undefined") window.addEventListener("message", (e) => {
  if (!yt || e.source !== yt.contentWindow) return;
  let d: { event?: string; info?: { playerState?: number; currentTime?: number } };
  try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
  const ps = d.info?.playerState;
  if (d.event === "onReady") ytSend("setVolume", [Math.round(state.volume * 100)]);
  if (ps === 1) set({ playing: true, error: "" }); else if (ps === 2 || ps === 0) set({ playing: false });
  if (d.event === "onError") set({ playing: false, error: (d.info as unknown) === 150 || (d.info as unknown) === 101 ? "That stream doesn't allow playing outside YouTube — try another station." : "YouTube couldn't play that station right now — skipping to the next one." });
  if (d.event === "onError" && state.live) { const list = state.youtube, i = list.findIndex((x) => x.id === state.live!.id), n = list[(i + 1) % list.length]; if (n && n.id !== state.live.id) setTimeout(() => playYoutube(n), 1200); }
});
function playYoutube(station: YouTubeStation) {
  if (audio) audio.pause();
  // A fresh frame per station, with its address set BEFORE it joins the page: YouTube refuses to play (error 153)
  // when the request comes from a blank frame that was navigated later, because then no site is named as the embedder.
  yt?.remove();
  const f = document.createElement("iframe");
  f.title = "ShuaCrew Radio (YouTube)"; f.allow = "autoplay; encrypted-media";
  f.referrerPolicy = "strict-origin-when-cross-origin"; // the rest of ShuaCrew sends no referrer; YouTube needs one
  f.src = `https://www.youtube-nocookie.com/embed/${station.videoId}?autoplay=1&enablejsapi=1&playsinline=1&controls=0&rel=0&origin=${encodeURIComponent(location.origin)}`;
  Object.assign(f.style, { position: "fixed", left: "0", bottom: "0", width: "200px", height: "113px", opacity: "0.01", pointerEvents: "none", border: "0", zIndex: "-1" });
  // Ask the player to report its state until it answers (it can load before it's ready to listen).
  f.addEventListener("load", () => {
    let n = 0;
    const hello = setInterval(() => { if (yt !== f || ++n > 40) return clearInterval(hello); f.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*"); }, 250);
    ytSend("setVolume", [Math.round(state.volume * 100)]);
  });
  yt = f; document.body.appendChild(f);
  setTimeout(() => onAirListeners.forEach((l) => l({ kind: "live", station })), 2500); // once the stream has had a moment to start
  set({ station: station.id, live: station, track: null, queue: [], position: 0, duration: 0, error: "", playing: false });
}
function stopYoutube() { yt?.remove(); yt = null; }

/** Tune in: shuffle the station and start its first track (or a chosen one). */
export async function playStation(stationId: string, trackId?: string) {
  if (!state.loaded) await loadRadio();
  const live = state.youtube.find((x) => x.id === stationId);
  if (live) { playYoutube(live); return; }
  if (state.live) { stopYoutube(); set({ live: null }); }
  const s = state.stations.find((x) => x.id === stationId);
  if (!s || !s.tracks.length) { set({ station: stationId, error: s ? `${s.name} is empty — drop some tracks in its folder.` : "No such station." }); return; }
  const order = shuffle(s.tracks);
  const first = trackId ? s.tracks.find((t) => t.id === trackId) ?? order[0]! : order[0]!;
  set({ station: s.id, queue: order.filter((t) => t.id !== first.id), error: "" });
  start(first);
}
export async function next() {
  if (state.live) { const list = state.youtube, i = list.findIndex((x) => x.id === state.live!.id); const n = list[(i + 1) % list.length]; if (n) playYoutube(n); return; }
  if (!state.station) return;
  let queue = state.queue;
  if (!queue.length) { const s = state.stations.find((x) => x.id === state.station); queue = s ? shuffle(s.tracks) : []; } // loops forever, reshuffled
  const [n, ...rest] = queue; if (!n) return;
  set({ queue: rest }); start(n);
}
export async function previous() {
  if (state.live) { const list = state.youtube, i = list.findIndex((x) => x.id === state.live!.id); const n = list[(i - 1 + list.length) % list.length]; if (n) playYoutube(n); return; }
  const a = el();
  if (a.currentTime > 4 || !state.history.length) { a.currentTime = 0; return; }
  const prev = state.history[state.history.length - 1]!;
  set({ history: state.history.slice(0, -1), queue: state.track ? [state.track, ...state.queue] : state.queue });
  start(prev);
}
export function pause() { if (state.live) { ytSend("pauseVideo"); set({ playing: false }); return; } audio?.pause(); }
export function resume() {
  if (state.live) { ytSend("playVideo"); set({ playing: true }); return; }
  if (audio?.src) void audio.play().catch(() => {}); else if (state.station) void playStation(state.station);
}
export function toggle() { if (state.playing) pause(); else resume(); }
export function stop() { stopYoutube(); if (state.live) set({ live: null }); if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); } set({ track: null, playing: false, position: 0, queue: [] }); }
/** Step aside while you talk with Spark, then come back — but only if we were the ones who paused it. */
let ducked = false;
export function duck(on: boolean) {
  if (on) { if (state.playing && !ducked) { ducked = true; pause(); } }
  else if (ducked) { ducked = false; resume(); }
}
export function seek(seconds: number) { if (audio && Number.isFinite(seconds)) audio.currentTime = seconds; }
export function setVolume(v: number) { const x = Math.min(1, Math.max(0, v)); if (audio) audio.volume = x; ytSend("setVolume", [Math.round(x * 100)]); set({ volume: x }); }
export async function addYoutube(url: string): Promise<string> {
  const r = await post("/api/radio/youtube", { url });
  const body = await r.json().catch(() => ({})) as { error?: string };
  if (!r.ok) return body.error ?? "Couldn't add that station.";
  await loadRadio(); return "";
}
export async function removeYoutube(id: string) { await fetch(`/api/radio/youtube/${id}`, { method: "DELETE", headers: { "X-ShuaCrew": "1" } }); if (state.live?.id === id) stop(); await loadRadio(); }

/** Commands from Spark, agents and the terminal. One subscription per window. */
let events: EventSource | null = null;
export function listenForCommands() {
  if (events || typeof EventSource === "undefined") return;
  events = new EventSource("/api/radio/events");
  events.onmessage = (e) => {
    let c: { cmd: string; station?: string; track?: string; value?: number };
    try { c = JSON.parse(e.data); } catch { return; }
    if (c.cmd === "play") void loadRadio().then(() => playStation(c.station ?? state.station ?? state.stations.find((s) => s.tracks.length)?.id ?? state.youtube[0]?.id ?? "", c.track));
    else if (c.cmd === "pause") pause(); else if (c.cmd === "resume") resume(); else if (c.cmd === "next") void next();
    else if (c.cmd === "previous") void previous(); else if (c.cmd === "stop") stop();
    else if (c.cmd === "duck") duck(true); else if (c.cmd === "unduck") duck(false); else if (c.cmd === "volume" && typeof c.value === "number") setVolume(c.value);
  };
}

export const clock = (s: number) => { if (!Number.isFinite(s) || s < 0) return "0:00"; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
