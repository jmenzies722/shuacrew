import { useEffect, useMemo, useState } from "react";
import { Disc3, Heart, ListPlus, Pause, Play, Repeat, RotateCw, Search, Shuffle, SkipBack, SkipForward, Sparkles, X } from "lucide-react";
import { PaneLayout } from "../components/Pane";
import { perform } from "./spark/actions";
import { post } from "./spark/bridge";
import { clock, loadSongs, playAlbum, reloadLibrary, searchAlbums, shelves, topArtists, useAppleMusic, useMusicState, wantArt, type Album } from "../lib/apple-music";
import "./studio-music.css";

type MediaCommand = "play" | "pause" | "next" | "previous" | "shuffle" | "repeat" | "love" | "add_to_library" | "seek";
const media = (command: MediaCommand, extra: Record<string, unknown> = {}) => void perform({ type: "media", app: "Music", command, ...extra } as Parameters<typeof perform>[0]).then(() => post({ type: "buddyNowPlaying" }));
const askShua = (text: string) => post({ type: "shuaAsk", text });

/** Studio is your Apple Music, album first: what's playing, big; your albums on shelves; one tap plays a whole record. */
export function Studio() {
  const m = useAppleMusic();
  const [query, setQuery] = useState(""), [open, setOpen] = useState<Album | null>(null);
  const rows = useMemo(() => shelves(m.albums), [m.albums]);
  const found = useMemo(() => searchAlbums(m.albums, query), [m.albums, query]);
  const artists = useMemo(() => topArtists(m.albums), [m.albums]);
  const visible = query ? found : rows.flatMap((r) => r.albums);
  useEffect(() => { wantArt(visible.map((a) => a.id)); }, [visible]);
  const p = m.playing, nowAlbum = p?.album ? m.albums.find((a) => a.title === p.album) : undefined;

  if (!m.available) return <PaneLayout wide><div className="st"><div className="st-empty"><Disc3 size={28} /><h1>Studio</h1><p>Open ShuaCrew for Mac to play your Apple Music here.</p></div></div></PaneLayout>;

  return <PaneLayout wide>
    <div className="st">
      <section className={`st-hero${p?.playing ? " is-playing" : ""}`} style={p?.art ? { "--st-art": `url("${p.art}")` } as React.CSSProperties : undefined} aria-label="Now playing">
        <div className="st-hero-glow" aria-hidden />
        <button type="button" className="st-cover is-big" onClick={() => nowAlbum && setOpen(nowAlbum)} aria-label={nowAlbum ? `Open ${nowAlbum.title}` : "Now playing"}>
          {p?.art ? <img src={p.art} alt="" /> : <Disc3 size={46} />}
        </button>
        <div className="st-now">
          <small>{p?.title ? (p.playing ? "Now playing · Apple Music" : "Paused · Apple Music") : "Apple Music"}</small>
          <h1>{p?.title || "Pick an album"}</h1>
          <p>{p?.title ? [p.artist, p.album].filter(Boolean).join(" · ") : `${m.albums.length.toLocaleString()} albums in your library`}</p>
          {p?.title && <div className="st-progress">
            <span>{clock(p.position)}</span>
            <button type="button" className="st-bar" aria-label="Seek" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); media("seek", { seconds: ((e.clientX - r.left) / r.width) * (p.duration ?? 0) }); }}>
              <i style={{ width: `${p.duration ? Math.min(100, ((p.position ?? 0) / p.duration) * 100) : 0}%` }} />
            </button>
            <span>{clock(p.duration)}</span>
          </div>}
          <div className="st-controls">
            <button type="button" title="Shuffle" onClick={() => media("shuffle", { on: true })}><Shuffle size={16} /></button>
            <button type="button" title="Previous" onClick={() => media("previous")}><SkipBack size={20} /></button>
            <button type="button" className="st-play" title={p?.playing ? "Pause" : "Play"} onClick={() => media(p?.playing ? "pause" : "play")}>{p?.playing ? <Pause size={24} /> : <Play size={24} />}</button>
            <button type="button" title="Next" onClick={() => media("next")}><SkipForward size={20} /></button>
            <button type="button" title="Repeat" onClick={() => media("repeat", { mode: "all" })}><Repeat size={16} /></button>
            <span className="st-sep" />
            <button type="button" title="Love this song" onClick={() => media("love")}><Heart size={16} /></button>
            <button type="button" title="Add to your library" onClick={() => media("add_to_library")}><ListPlus size={16} /></button>
          </div>
          <div className="st-asks">
            <button type="button" onClick={() => askShua(`Pick one album from my Apple Music library for right now (it's ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}), say why in one line, then play it.`)}><Sparkles size={13} />Pick an album for right now</button>
            {p?.title && <button type="button" onClick={() => askShua(`Tell me the story behind "${p.album || p.title}" by ${p.artist} in three short lines.`)}><Sparkles size={13} />The story behind this</button>}
            {p?.title && <button type="button" onClick={() => askShua(`Play something from my library that sounds like "${p.title}" by ${p.artist}.`)}><Sparkles size={13} />More like this</button>}
          </div>
          {m.message && <p className="st-status" role="status">{m.message}</p>}
        </div>
      </section>

      <div className="st-search">
        <Search size={15} />
        <input placeholder={`Search ${m.albums.length.toLocaleString()} albums and artists`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search your albums" />
        {query ? <button type="button" aria-label="Clear" onClick={() => setQuery("")}><X size={14} /></button>
          : <button type="button" title="Re-read your Music library" aria-label="Refresh library" onClick={reloadLibrary}><RotateCw size={14} /></button>}
      </div>
      {!query && artists.length > 0 && <div className="st-artists" aria-label="Your top artists">{artists.map((a) => <button key={a.name} type="button" onClick={() => setQuery(a.name)}>{a.name}<small>{a.albums}</small></button>)}</div>}

      {m.error ? <p className="st-status is-error">{m.error}</p> : !m.loaded ? <p className="st-status">Reading your library…</p>
        : query ? <Shelf title={found.length ? `${found.length} result${found.length === 1 ? "" : "s"}` : "Nothing in your library matches"} albums={found} art={m.art} onOpen={setOpen} grid />
        : rows.map((r) => <Shelf key={r.id} title={r.title} hint={r.hint} albums={r.albums} art={m.art} onOpen={setOpen} />)}

      {open && <AlbumSheet album={open} art={m.art[open.id]} onClose={() => setOpen(null)} />}
    </div>
  </PaneLayout>;
}

function Shelf({ title, hint, albums, art, onOpen, grid }: { title: string; hint?: string; albums: Album[]; art: Record<string, string>; onOpen: (a: Album) => void; grid?: boolean }) {
  return <section className="st-shelf">
    <header><h2>{title}</h2>{hint && <small>{hint}</small>}</header>
    <div className={grid ? "st-grid" : "st-row"}>{albums.map((a) => <AlbumCard key={a.id} album={a} art={art[a.id]} onOpen={() => onOpen(a)} />)}</div>
  </section>;
}

function AlbumCard({ album, art, onOpen }: { album: Album; art?: string; onOpen: () => void }) {
  return <div className="st-card">
    <button type="button" className="st-cover" onClick={onOpen} aria-label={`Open ${album.title}`}>
      {art ? <img src={art} alt="" loading="lazy" /> : <span className="st-ph">{album.title.slice(0, 1)}</span>}
    </button>
    <button type="button" className="st-card-play" aria-label={`Play ${album.title}`} onClick={() => playAlbum(album.id)}><Play size={16} /></button>
    <strong title={album.title}>{album.title}</strong>
    <span>{album.artist}</span>
  </div>;
}

function AlbumSheet({ album, art, onClose }: { album: Album; art?: string; onClose: () => void }) {
  const m = useMusicState();
  useEffect(() => { loadSongs(album.id); }, [album.id]);
  useEffect(() => { const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on); }, [onClose]);
  const songs = m.songs[album.id];
  const total = songs?.reduce((n, s) => n + s.ms, 0) ?? 0;
  return <div className="st-sheet-wrap" onClick={onClose}>
    <div className="st-sheet" role="dialog" aria-label={album.title} onClick={(e) => e.stopPropagation()} style={art ? { "--st-art": `url("${art}")` } as React.CSSProperties : undefined}>
      <button type="button" className="st-sheet-close" aria-label="Close" onClick={onClose}><X size={16} /></button>
      <div className="st-sheet-head">
        <div className="st-cover is-big">{art ? <img src={art} alt="" /> : <Disc3 size={40} />}</div>
        <div>
          <small>Album{album.year ? ` · ${album.year}` : ""}{album.genre ? ` · ${album.genre}` : ""}</small>
          <h2>{album.title}</h2>
          <p>{album.artist}</p>
          <p className="st-meta">{album.tracks} song{album.tracks === 1 ? "" : "s"} in your library{total ? ` · ${Math.round(total / 60000)} min` : ""}{album.plays ? ` · played ${album.plays}×` : ""}</p>
          <div className="st-sheet-actions">
            <button type="button" className="st-primary" onClick={() => playAlbum(album.id)}><Play size={15} />Play</button>
            <button type="button" onClick={() => playAlbum(album.id, { shuffle: true })}><Shuffle size={15} />Shuffle</button>
            <button type="button" onClick={() => askShua(`Tell me about the album "${album.title}" by ${album.artist}: when it came out, what it's about, and the two songs to start with. Three short lines.`)}><Sparkles size={15} />About this album</button>
          </div>
        </div>
      </div>
      <ol className="st-songs">{!songs ? <li className="st-status">Loading songs…</li> : songs.map((s, i) => <li key={s.id}>
        <button type="button" onClick={() => playAlbum(album.id, { track: s.id })}>
          <span className="st-n">{s.n || i + 1}</span><span className="st-t">{s.title}{s.artist && s.artist !== album.artist && <small> · {s.artist}</small>}</span>
          {s.plays > 0 && <span className="st-plays">{s.plays}</span>}<span className="st-d">{clock(s.ms / 1000)}</span>
        </button>
      </li>)}</ol>
      <p className="st-note">Plays through the Music app, via one playlist of ours, “ShuaCrew · Now Playing”, refilled each time.</p>
    </div>
  </div>;
}
