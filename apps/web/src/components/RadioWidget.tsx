import { useEffect } from "react";
import { Pause, Play, Radio as RadioIcon, SkipForward, Tv, FolderOpen } from "lucide-react";
import { loadRadio, next, playStation, toggle, useRadio } from "../lib/radio";
import type { WidgetCtx } from "./TopBarWidgets";

/** ShuaCrew Radio, small: what's on and the controls, for the top bar and Spark's widgets. */
export function RadioChip() {
  const r = useRadio();
  useEffect(() => { if (!r.loaded) void loadRadio(); }, [r.loaded]);
  const title = r.live?.name ?? r.track?.title;
  return <>
    {r.playing ? <span className="radio-eq" aria-hidden="true"><i /><i /><i /></span> : <RadioIcon size={14} />}
    <span className="rw-chip-text">{title ?? "Radio"}</span>
  </>;
}

export function RadioTile({ ctx }: { ctx: WidgetCtx }) {
  const r = useRadio();
  useEffect(() => { if (!r.loaded) void loadRadio(); }, [r.loaded]);
  const station = r.stations.find((s) => s.id === r.station);
  const title = r.live?.name ?? r.track?.title ?? "Nothing on yet";
  const sub = r.live ? `${r.live.channel} · live` : r.track ? r.track.artist || station?.name || "" : "Pick a station";
  const art = r.live ? `/api/radio/youtube/${r.live.videoId}/art` : undefined;
  const choices = [...r.stations.filter((s) => s.tracks.length).map((s) => ({ id: s.id, name: s.name, live: false })), ...r.youtube.map((s) => ({ id: s.id, name: s.name, live: true }))].slice(0, 5);
  return <div className="rw-tile">
    <div className="rw-now">
      <span className={`rw-art ${r.playing ? "is-on" : ""}`} style={art ? { backgroundImage: `url(${art})` } : undefined}>{!art && <RadioIcon size={18} />}</span>
      <button type="button" className="rw-text" onClick={() => ctx.go("/studio")} title="Open ShuaCrew Radio"><b>{title}</b><small>{r.playing ? "On air · " : ""}{sub}</small></button>
      <button type="button" className="rw-btn is-main" aria-label={r.playing ? "Pause" : "Play"} onClick={() => (r.track || r.live ? toggle() : void playStation(choices[0]?.id ?? ""))} disabled={!choices.length && !r.track && !r.live}>{r.playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <button type="button" className="rw-btn" aria-label="Next" onClick={() => void next()} disabled={!r.track && !r.live}><SkipForward size={14} /></button>
    </div>
    <div className="rw-stations">{choices.map((c) => <button key={c.id} type="button" className={(r.live?.id ?? (r.track ? r.station : null)) === c.id ? "is-on" : ""} onClick={() => void playStation(c.id)}>
      {c.live ? <Tv size={11} /> : <FolderOpen size={11} />}<span>{c.name}</span></button>)}</div>
  </div>;
}
