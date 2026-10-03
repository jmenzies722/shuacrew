import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { native, post } from "../screens/spark/bridge";
import { perform } from "../screens/spark/actions";
import type { Action } from "../lib/buddy";

type Media = { app: string; title: string; artist: string; playing: boolean };
type MusicAction = Extract<Action, { type: "media" }>;

export function AppleMusic() {
  const available = !!native();
  const [media, setMedia] = useState<Media | null>(null), [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const mounted = useRef(false), locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<Media>).detail;
      const next = detail?.app === "Music" && detail.title ? detail : null;
      setMedia(current => current?.title === next?.title && current?.artist === next?.artist && current?.playing === next?.playing ? current : next);
    };
    const refresh = () => { if (available && document.visibilityState === "visible") post({ type: "buddyNowPlaying" }); };
    window.addEventListener("shuacrew:media", receive);
    window.addEventListener("focus", refresh);
    refresh();
    const timer = available ? setInterval(refresh, 5000) : undefined;
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener("shuacrew:media", receive); window.removeEventListener("focus", refresh); };
  }, [available]);
  const command = async (action: Omit<MusicAction, "type" | "app">) => {
    if (locked.current || !available) return;
    locked.current = true; setBusy(true); setMessage("");
    try {
      const result = await perform({ type: "media", app: "Music", ...action });
      if (mounted.current) { setMessage(result.message); post({ type: "buddyNowPlaying" }); }
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "Music did not respond."); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  return <section className="radio-panel apple-music" aria-label="Apple Music">
    <header><strong><Music2 size={15} /> Apple Music</strong><span>Your Mac library</span></header>
    <p className="radio-hint">{available ? "Play your songs and playlists through the Music app. Allow ShuaCrew in macOS Automation when prompted. Streaming availability depends on your Apple Music account." : "Open Studio in the ShuaCrew Mac app to control your Apple Music library."}</p>
    <div className="apple-music-now"><strong>{media?.title || "Choose music from your library"}</strong><span>{media ? `${media.artist} · ${media.playing ? "Playing" : "Paused"}` : "No Apple Music track reported"}</span></div>
    <div className="radio-controls">
      <button type="button" disabled={!available || busy} aria-label="Previous Apple Music track" onClick={() => void command({ command: "previous" })}><SkipBack size={18} /></button>
      <button type="button" disabled={!available || busy} aria-label={media?.playing ? "Pause Apple Music" : "Play Apple Music"} onClick={() => void command({ command: media?.playing ? "pause" : "play" })}>{media?.playing ? <Pause size={20} /> : <Play size={20} />}</button>
      <button type="button" disabled={!available || busy} aria-label="Next Apple Music track" onClick={() => void command({ command: "next" })}><SkipForward size={18} /></button>
    </div>
    <form className="apple-music-search" onSubmit={event => { event.preventDefault(); if (query.trim()) void command({ command: "play_query", query: query.trim() }); }}>
      <input aria-label="Song, artist or playlist in Apple Music" placeholder="Song, artist or playlist…" value={query} onChange={event => setQuery(event.target.value)} disabled={!available} maxLength={200} />
      <button type="submit" disabled={!available || busy || !query.trim()}>Play song</button>
      <button type="button" disabled={!available || busy || !query.trim()} onClick={() => void command({ command: "playlist", query: query.trim() })}>Play playlist</button>
      <button type="button" disabled={!available || busy || !query.trim()} onClick={() => void command({ command: "open_query", query: query.trim() })}>Browse in Music</button>
    </form>
    <p className="radio-hint" role="status">{busy ? "Waiting for Music…" : message || "Your music stays in Music; nothing is uploaded or copied into ShuaCrew."}</p>
  </section>;
}
