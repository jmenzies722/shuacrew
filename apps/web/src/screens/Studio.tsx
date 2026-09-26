import { useEffect, useRef } from "react";
import { CloudRain, Coffee, FolderOpen, Pause, Play, Radio as RadioIcon, SkipBack, SkipForward, Sparkles, Volume1, Volume2, VolumeX, Waves } from "lucide-react";
import { PaneLayout } from "../components/Pane";
import { clock, levels, loadRadio, next, playStation, previous, revealRadio, seek, setupRadio, setVolume, toggle, useRadio, type RadioTrack } from "../lib/radio";
import { playScape, stopScape, useScape, type Scape } from "../lib/soundscape";
import "./studio.css";

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

      {!r.loaded ? <div className="radio-empty"><p>Tuning in…</p></div>
        : !r.exists ? <div className="radio-empty">
          <RadioIcon size={28} />
          <h2>Set up your stations</h2>
          <p>ShuaCrew Radio plays your own music files. This makes <b>Lofi Jazz</b> and <b>Lofi Hip-Hop</b> folders in <code>{r.root}</code>. Drop tracks in and they're on air.</p>
          <button type="button" className="radio-cta" onClick={() => void setupRadio()}>Create my stations</button>
        </div>
        : <>
          <section className="radio-deck" aria-label="Now playing">
            <Record spinning={r.playing} label={station?.name ?? "ShuaCrew Radio"} />
            <div className="radio-now">
              <nav className="radio-stations" aria-label="Stations">
                {r.stations.map((s) => <button key={s.id} type="button" className={s.id === r.station ? "is-on" : ""} onClick={() => void playStation(s.id)}>
                  <span>{s.name}</span><small>{s.tracks.length}</small>
                </button>)}
              </nav>
              <div className="radio-title">
                <small>{r.track ? (r.playing ? "On air" : "Paused") : station?.tracks.length ? "Ready" : "Off air"}</small>
                <h2>{r.track?.title ?? (station?.tracks.length ? `${station.name}` : "Nothing to play yet")}</h2>
                <p>{r.track ? r.track.artist || station?.name : station?.tracks.length ? `${station.tracks.length} tracks · shuffled, loops forever` : `Add audio files to the ${station?.name ?? "station"} folder to put it on air.`}</p>
              </div>
              <Visualizer on={r.playing} />
              <Progress position={r.position} duration={r.duration || r.track?.duration || 0} disabled={!r.track} />
              <div className="radio-controls">
                <button type="button" aria-label="Previous" onClick={() => void previous()} disabled={!r.track}><SkipBack size={18} /></button>
                <button type="button" className="radio-play" aria-label={r.playing ? "Pause" : "Play"} disabled={!station?.tracks.length}
                  onClick={() => (r.track ? toggle() : station && void playStation(station.id))}>{r.playing ? <Pause size={22} /> : <Play size={22} />}</button>
                <button type="button" aria-label="Next" onClick={() => void next()} disabled={!r.track}><SkipForward size={18} /></button>
                <Volume value={r.volume} />
              </div>
              {r.error && <p className="radio-error" role="status">{r.error}</p>}
            </div>
          </section>

          <div className="radio-cols">
            <section className="radio-panel" aria-label="Tracks">
              <header><strong>{station?.name ?? "Tracks"}</strong><button type="button" onClick={() => void revealRadio()}><FolderOpen size={13} /> Open folder</button></header>
              {station?.tracks.length ? <ol className="radio-list">{station.tracks.map((t) => <TrackRow key={t.id} t={t} on={r.track?.id === t.id} playing={r.playing && r.track?.id === t.id} onPlay={() => void playStation(station.id, t.id)} />)}</ol>
                : <p className="radio-hint">Empty. Drop mp3, m4a, wav or flac files into <code>{r.root}/{station?.name}</code>. Name them “Artist - Title” if they have no tags. {total ? "" : "Every folder you add there becomes a new station."}</p>}
            </section>
            <div className="radio-side">
              <section className="radio-panel" aria-label="Up next">
                <header><strong>Up next</strong><span>{r.queue.length ? `${r.queue.length} in the shuffle` : "—"}</span></header>
                {r.queue.length ? <ol className="radio-list is-compact">{r.queue.slice(0, 6).map((t) => <TrackRow key={t.id} t={t} on={false} playing={false} onPlay={() => station && void playStation(station.id, t.id)} />)}</ol>
                  : <p className="radio-hint">Start a station and the shuffle shows here.</p>}
              </section>
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

function Record({ spinning, label }: { spinning: boolean; label: string }) {
  return <div className={`radio-record ${spinning ? "is-spinning" : ""}`} aria-hidden="true">
    <div className="radio-vinyl"><div className="radio-label"><span>{label}</span></div></div>
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
    const draw = () => {
      const w = (c.width = c.clientWidth * devicePixelRatio), h = (c.height = c.clientHeight * devicePixelRatio);
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
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
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
