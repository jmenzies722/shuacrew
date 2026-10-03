import { useEffect, useRef, useState } from "react";
import { CloudRain, Coffee, FolderOpen, Pause, Play, Plus, Radio as RadioIcon, SkipBack, SkipForward, Sparkles, Timer, Trash2, Tv, Volume1, Volume2, VolumeX, Waves } from "lucide-react";
import { formatFocusRemaining, remainingFocusMs, setFocus, startFocus, useFocusTimer } from "../lib/focus-timer";
import { focusMinutes } from "../lib/focus-stats";
import { savePower } from "../lib/power";
import { PaneLayout } from "../components/Pane";
import { addYoutube, clock, levels, loadRadio, next, playStation, previous, removeYoutube, revealRadio, seek, setupRadio, setVolume, toggle, useRadio, type RadioTrack, type YouTubeStation } from "../lib/radio";
import { playScape, stopScape, useScape, type Scape } from "../lib/soundscape";
import "./studio.css";
import { AppleMusic } from "../components/AppleMusic";

/** Studio is ShuaCrew Radio: your own lofi jazz and lofi hip-hop, as stations, with ambience you can layer on top. */
export function Studio() {
  const r = useRadio();
  useEffect(() => { void loadRadio(); }, []);
  const station = r.stations.find((s) => s.id === r.station) ?? null;
  const total = r.stations.reduce((n, s) => n + s.tracks.length, 0);
  return <PaneLayout wide>
    <div className="radio">
      <header className="radio-head">
        <span className="radio-mark"><RadioIcon size={16} /></span>
        <div><h1>ShuaCrew Radio</h1><p>Your own lofi, as stations. Keeps playing wherever you go in the app.</p></div>
        <span className="radio-skill" title="Crew sessions and Spark can control the radio through the shuacrew-radio skill"><Sparkles size={12} /> Ask Spark or any agent: “put on lofi jazz”</span>
      </header>

      <AppleMusic />
      {!r.loaded ? <div className="radio-empty"><p>Tuning in…</p></div> : <>
        <section className="radio-deck" aria-label="Now playing">
          <Record spinning={r.playing} label={r.live?.name ?? station?.name ?? "ShuaCrew Radio"} art={r.live ? `/api/radio/youtube/${r.live.videoId}/art` : undefined} />
          <div className="radio-now">
            <nav className="radio-stations" aria-label="Stations">
              {r.stations.map((s) => <button key={s.id} type="button" className={!r.live && s.id === r.station ? "is-on" : ""} onClick={() => void playStation(s.id)}>
                <FolderOpen size={12} /><span>{s.name}</span><small>{s.tracks.length}</small>
              </button>)}
              {r.youtube.map((s) => <button key={s.id} type="button" className={r.live?.id === s.id ? "is-on" : ""} onClick={() => void playStation(s.id)} title={`${s.channel} · live on YouTube`}>
                <Tv size={12} /><span>{s.name}</span>
              </button>)}
            </nav>
            <div className="radio-title">
              <small>{r.live ? (r.playing ? "● Live on YouTube" : "Live · paused") : r.track ? (r.playing ? "On air" : "Paused") : "Pick a station"}</small>
              <h2>{r.live?.name ?? r.track?.title ?? (station?.tracks.length ? station.name : "Lofi, whenever you want it")}</h2>
              <p>{r.live ? `${r.live.channel} · ${r.live.genre}` : r.track ? r.track.artist || station?.name : station?.tracks.length ? `${station.tracks.length} tracks · shuffled, loops forever` : "Your own files, or a live station from YouTube — pick one above."}</p>
            </div>
            <Visualizer on={r.playing} />
            {r.live ? <div className="radio-live-row"><span className="radio-live-dot" /> 24/7 live stream</div> : <Progress position={r.position} duration={r.duration || r.track?.duration || 0} disabled={!r.track} />}
            <div className="radio-controls">
              <button type="button" aria-label="Previous" onClick={() => void previous()} disabled={!r.track && !r.live}><SkipBack size={18} /></button>
              <button type="button" className="radio-play" aria-label={r.playing ? "Pause" : "Play"}
                onClick={() => (r.track || r.live ? toggle() : void playStation(station?.tracks.length ? station.id : r.youtube[0]?.id ?? ""))}>{r.playing ? <Pause size={22} /> : <Play size={22} />}</button>
              <button type="button" aria-label="Next" onClick={() => void next()} disabled={!r.track && !r.live}><SkipForward size={18} /></button>
              <Volume value={r.volume} />
            </div>
            {r.error && <p className="radio-error" role="status">{r.error}</p>}
          </div>
        </section>

        <div className="radio-cols">
          <section className="radio-panel" aria-label="Your music">
            <header><strong>Your music{station && !r.live ? ` · ${station.name}` : ""}</strong>{r.exists && <button type="button" onClick={() => void revealRadio()}><FolderOpen size={13} /> Open folder</button>}</header>
            {!r.exists ? <div className="radio-setup">
              <p className="radio-hint">Play your own lofi: this makes <b>Lofi Jazz</b> and <b>Lofi Hip-Hop</b> folders in <code>{r.root}</code>. Drop tracks in and they're on air.</p>
              <button type="button" className="radio-cta" onClick={() => void setupRadio()}>Create my stations</button>
            </div>
              : station?.tracks.length ? <ol className="radio-list">{station.tracks.map((t) => <TrackRow key={t.id} t={t} on={!r.live && r.track?.id === t.id} playing={r.playing && r.track?.id === t.id} onPlay={() => void playStation(station.id, t.id)} />)}</ol>
              : <p className="radio-hint">No tracks here yet. Drop mp3, m4a, wav or flac files into <code>{r.root}/{station?.name ?? "Lofi Jazz"}</code> — name them “Artist - Title” if they have no tags. Every folder there becomes a station.</p>}
          </section>
          <div className="radio-side">
            <FocusRoom />
            <LiveStations list={r.youtube} on={r.live?.id ?? null} />
            <Ambience />
          </div>
        </div>
      </>}
    </div>
  </PaneLayout>;
}

function TrackRow({ t, on, playing, onPlay }: { t: RadioTrack; on: boolean; playing: boolean; onPlay: () => void }) {
  return <li className={on ? "is-on" : ""}><button type="button" onClick={onPlay}>
    <span className="radio-row-icon">{playing ? <EqIcon /> : <Play size={12} />}</span>
    <span className="radio-row-text"><b>{t.title}</b>{t.artist && <small>{t.artist}</small>}</span>
    <time>{t.duration ? clock(t.duration) : ""}</time>
  </button></li>;
}

function Record({ spinning, label, art }: { spinning: boolean; label: string; art?: string }) {
  return <div className={`radio-record ${spinning ? "is-spinning" : ""}`} aria-hidden="true">
    <div className="radio-vinyl"><div className={`radio-label ${art ? "has-art" : ""}`} style={art ? { backgroundImage: `url(${art})` } : undefined}>{!art && <span>{label}</span>}</div></div>
    <div className={`radio-arm ${spinning ? "is-down" : ""}`} />
  </div>;
}

function Visualizer({ on }: { on: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const g = c.getContext("2d"); if (!g) return;
    const bins = new Uint8Array(64); let raf = 0, t = 0;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--amber").trim() || "#8e48ff";
    // Size the canvas only when it changes (resetting width every frame re-laid-out the page and cleared the buffer
    // 60 times a second), draw once and stop when nothing's playing, and rest while ShuaCrew isn't in front.
    let w = 0, h = 0;
    const fit = () => { const nw = Math.round(c.clientWidth * devicePixelRatio), nh = Math.round(c.clientHeight * devicePixelRatio); if (nw !== w || nh !== h) { w = c.width = nw; h = c.height = nh; } };
    const ro = new ResizeObserver(() => { fit(); if (!on) draw(); }); ro.observe(c); fit();
    const draw = () => {
      g.clearRect(0, 0, w, h);
      const live = on && levels(bins); t += 0.04;
      const n = 40, gap = 3 * devicePixelRatio, bw = (w - gap * (n - 1)) / n;
      g.fillStyle = accent;
      for (let i = 0; i < n; i++) {
        const v = live ? bins[Math.floor(i * 48 / n)]! / 255 : on ? 0.15 + 0.1 * Math.sin(t * 2 + i * 0.5) : 0.04;
        const bh = Math.max(2 * devicePixelRatio, v * h);
        g.globalAlpha = 0.35 + v * 0.65;
        g.fillRect(i * (bw + gap), (h - bh) / 2, bw, bh);
      }
      if (on && !("idle" in document.documentElement.dataset)) raf = requestAnimationFrame(draw);
      else if (on) raf = window.setTimeout(draw, 500) as unknown as number; // resting: check back, don't spin
    };
    draw();
    return () => { cancelAnimationFrame(raf); clearTimeout(raf); ro.disconnect(); };
  }, [on]);
  return <canvas ref={canvas} className="radio-viz" aria-hidden="true" />;
}

function Progress({ position, duration, disabled }: { position: number; duration: number; disabled: boolean }) {
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;
  return <div className="radio-progress">
    <time>{clock(position)}</time>
    <input type="range" min={0} max={duration || 1} step={1} value={Math.min(position, duration || 1)} disabled={disabled} aria-label="Seek"
      style={{ "--pct": `${pct}%` } as React.CSSProperties} onChange={(e) => seek(Number(e.target.value))} />
    <time>{clock(duration)}</time>
  </div>;
}

function Volume({ value }: { value: number }) {
  const Icon = value === 0 ? VolumeX : value < 0.5 ? Volume1 : Volume2;
  return <label className="radio-volume"><button type="button" aria-label={value ? "Mute" : "Unmute"} onClick={() => setVolume(value ? 0 : 0.6)}><Icon size={16} /></button>
    <input type="range" min={0} max={1} step={0.01} value={value} aria-label="Volume" style={{ "--pct": `${value * 100}%` } as React.CSSProperties} onChange={(e) => setVolume(Number(e.target.value))} />
  </label>;
}

function LiveStations({ list, on }: { list: YouTubeStation[]; on: string | null }) {
  const [url, setUrl] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const add = async () => { if (!url.trim()) return; setBusy(true); setMsg(""); const err = await addYoutube(url); setBusy(false); if (err) setMsg(err); else setUrl(""); };
  return <section className="radio-panel" aria-label="Live on YouTube">
    <header><strong>Live on YouTube</strong><span>24/7 streams</span></header>
    <ol className="radio-list is-compact">{list.map((s) => <li key={s.id} className={on === s.id ? "is-on" : ""}>
      <button type="button" onClick={() => void playStation(s.id)}>
        <span className="radio-row-icon radio-row-art" style={{ backgroundImage: `url(/api/radio/youtube/${s.videoId}/art)` }} />
        <span className="radio-row-text"><b>{s.name}</b><small>{s.channel} · {s.genre}</small></span>
        <span className="radio-row-x" role="button" tabIndex={0} aria-label={`Remove ${s.name}`} onClick={(e) => { e.stopPropagation(); void removeYoutube(s.id); }}><Trash2 size={12} /></span>
      </button>
    </li>)}</ol>
    <form className="radio-add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a YouTube link to add a station" aria-label="YouTube link" />
      <button type="submit" disabled={busy || !url.trim()} aria-label="Add station"><Plus size={14} /></button>
    </form>
    {msg && <p className="radio-hint" role="status">{msg}</p>}
  </section>;
}

/** Focus room: one click for deep work — timer, Flow mode, your radio and rain. Minutes are the real focus log. */
function FocusRoom() {
  const timer = useFocusTimer(), r = useRadio(), scape = useScape();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = timer ? remainingFocusMs(timer, now) : 0;
  const week = focusMinutes(7), today = week.at(-1)?.minutes ?? 0;
  const enter = async (minutes: number) => {
    setFocus(startFocus(minutes)); savePower({ flow: true });
    if (!r.playing) { const pick = r.stations.find((s) => s.tracks.length)?.id ?? r.youtube.find((s) => s.genre === "Lofi Jazz")?.id ?? r.youtube[0]?.id; if (pick) await playStation(pick); }
    if (scape === "off") playScape("rain", 0.25);
  };
  return <section className="radio-panel" aria-label="Focus room">
    <header><strong>Focus room</strong><span>{today ? `${today} min focused today` : "timer · Flow mode · radio · rain"}</span></header>
    {timer && left > 0
      ? <div className="focus-live"><b>{formatFocusRemaining(left)}</b><span>left in this focus session</span><button type="button" onClick={() => { setFocus(null); savePower({ flow: false }); }}>End</button></div>
      : <div className="focus-start">{[25, 50].map((m) => <button key={m} type="button" onClick={() => void enter(m)}><Timer size={14} /> {m} min</button>)}</div>}
  </section>;
}

const SCAPES: Array<{ id: Exclude<Scape, "off">; label: string; icon: typeof CloudRain }> = [
  { id: "rain", label: "Rain", icon: CloudRain }, { id: "cafe", label: "Café", icon: Coffee }, { id: "brown", label: "Brown noise", icon: Waves },
];
function Ambience() {
  const scape = useScape();
  return <section className="radio-panel" aria-label="Ambience">
    <header><strong>Ambience</strong><span>layers under the music</span></header>
    <div className="radio-scapes">{SCAPES.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={scape === id ? "is-on" : ""} aria-pressed={scape === id}
      onClick={() => (scape === id ? stopScape() : playScape(id, 0.35))}><Icon size={16} /><span>{label}</span></button>)}</div>
  </section>;
}

function EqIcon() { return <span className="radio-eq" aria-hidden="true"><i /><i /><i /></span>; }
