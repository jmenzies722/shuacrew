/**
 * Studio's data: your Apple Music library (albums, read natively by the Mac app), their covers, what's playing, and
 * the shelves Studio shows. The shelf logic is pure so it can be tested; the rest is a small store over the bridge.
 */
import { useEffect, useSyncExternalStore } from "react";
import { native, post } from "../screens/spark/bridge";

export interface Album { id: string; title: string; artist: string; year: number; tracks: number; added: number; plays: number; lastPlayed: number; genre: string }
export interface Song { id: string; title: string; artist: string; n: number; ms: number; plays: number }
export interface Playing { app?: string; title: string; artist?: string; album?: string; playing?: boolean; position?: number; duration?: number; art?: string }

const DAY = 86_400_000;

/** The shelves, best first. Each is short enough to scan; an album appears on the first shelf that wants it. */
export function shelves(albums: Album[], now = Date.now()): Array<{ id: string; title: string; hint: string; albums: Album[] }> {
  const used = new Set<string>();
  const take = (list: Album[], n: number) => { const out = list.filter((a) => !used.has(a.id)).slice(0, n); out.forEach((a) => used.add(a.id)); return out; };
  const byPlays = [...albums].sort((a, b) => b.plays - a.plays);
  const rows = [
    { id: "full", title: "Full albums", hint: "Front to back, the way they were made", albums: take(byPlays.filter((a) => a.tracks >= 6), 12) },
    { id: "recent", title: "Recently added", hint: "New in your library", albums: take([...albums].sort((a, b) => b.added - a.added), 12) },
    { id: "heavy", title: "On repeat", hint: "What you play most lately", albums: take(byPlays.filter((a) => a.plays > 0 && now - a.lastPlayed <= 60 * DAY), 12) },
    { id: "rediscover", title: "Rediscover", hint: "Loved once, quiet for a while", albums: take(byPlays.filter((a) => a.plays >= 8 && a.lastPlayed > 0 && now - a.lastPlayed > 90 * DAY), 12) },
  ];
  return rows.filter((r) => r.albums.length > 0);
}

/** Instant search over albums and artists: every word must match. */
export function searchAlbums(albums: Album[], query: string, n = 24): Album[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return albums.filter((a) => { const hay = `${a.title} ${a.artist} ${a.genre} ${a.year || ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => b.plays - a.plays).slice(0, n);
}

/** Your top artists by plays across the library. */
export function topArtists(albums: Album[], n = 6): Array<{ name: string; plays: number; albums: number }> {
  const m = new Map<string, { plays: number; albums: number }>();
  for (const a of albums) { const v = m.get(a.artist) ?? { plays: 0, albums: 0 }; v.plays += a.plays; v.albums += 1; m.set(a.artist, v); }
  return [...m].map(([name, v]) => ({ name, ...v })).filter((a) => a.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, n);
}

export const clock = (s = 0) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ── The store ──────────────────────────────────────────────────────────────────────────────────
type State = { albums: Album[]; loaded: boolean; error: string; art: Record<string, string>; playing: Playing | null; songs: Record<string, Song[]>; message: string };
let state: State = { albums: [], loaded: false, error: "", art: {}, playing: null, songs: {}, message: "" };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
let wired = false, artAsked = new Set<string>();

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("shuacrew:musicLibrary", (e) => { const d = (e as CustomEvent<{ albums: Album[]; error?: string }>).detail; set({ albums: d.albums ?? [], loaded: true, error: d.error ?? "" }); });
  window.addEventListener("shuacrew:musicArt", (e) => { const d = (e as CustomEvent<{ art: Record<string, string> }>).detail; set({ art: { ...state.art, ...d.art } }); });
  window.addEventListener("shuacrew:musicAlbum", (e) => { const d = (e as CustomEvent<{ id: string; tracks: Song[] }>).detail; set({ songs: { ...state.songs, [d.id]: d.tracks } }); });
  window.addEventListener("shuacrew:musicResult", (e) => { const d = (e as CustomEvent<{ ok: boolean; message: string }>).detail; set({ message: d.message }); });
  window.addEventListener("shuacrew:media", (e) => {
    const d = (e as CustomEvent<Playing>).detail;
    set({ playing: d?.app === "Music" && d.title ? d : d?.title ? state.playing : null });
  });
}

/** The music state without polling: for parts of Studio that only read it (the album sheet). */
export function useMusicState(): State {
  wire();
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);
}

/** The music state, plus loading the library and following what's playing while Studio is open. */
export function useAppleMusic(): State & { available: boolean } {
  const s = useMusicState();
  const available = !!native();
  useEffect(() => {
    if (!available) return;
    if (!state.loaded) post({ type: "buddyMusicLibrary" });
    const refresh = () => { if (document.visibilityState === "visible") post({ type: "buddyNowPlaying" }); };
    refresh();
    const t = setInterval(refresh, 1500); // the progress bar moves; Music answers in a few ms
    window.addEventListener("focus", refresh);
    return () => { clearInterval(t); window.removeEventListener("focus", refresh); };
  }, [available]);
  return { ...s, available };
}

/** Ask for covers we haven't asked for yet (batched by the caller as albums scroll into view). */
export function wantArt(ids: string[]) {
  const fresh = ids.filter((id) => !artAsked.has(id));
  if (!fresh.length || !native()) return;
  fresh.forEach((id) => artAsked.add(id));
  for (let i = 0; i < fresh.length; i += 30) post({ type: "buddyMusicArt", ids: fresh.slice(i, i + 30) });
}
export const loadSongs = (id: string) => { if (!state.songs[id]) post({ type: "buddyMusicAlbum", id }); };
export const playAlbum = (album: string, opts: { track?: string; shuffle?: boolean } = {}) => { set({ message: "Starting…" }); post({ type: "buddyMusicPlay", album, ...opts }); };
export const reloadLibrary = () => { artAsked = new Set(); post({ type: "buddyMusicLibrary", force: true }); };
