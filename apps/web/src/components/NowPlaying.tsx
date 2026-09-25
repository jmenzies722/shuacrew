import { useEffect, useState } from "react";
import { SkipForward, Square } from "lucide-react";
import { cancelRun } from "../lib/api";
import { useLive } from "../lib/live";
import { nextTrack, nowPlaying, trackAge, type Track } from "../lib/now-playing";
import { albumOf } from "../lib/studio";
import { Glyph } from "../lib/glyphs";
import { setScapeMood } from "../lib/soundscape";
import type { WidgetCtx } from "./TopBarWidgets";
import "./now-playing.css";

export function useNowPlaying(): Track {
  const crew = useLive((s) => s.crew);
  return nowPlaying(crew.runs, crew.approvals, crew.members);
}

const REACT = "shuacrew.radio.react";
export function radioFollows(): boolean { try { return localStorage.getItem(REACT) !== "0"; } catch { return true; } }
export function setRadioFollows(on: boolean) {
  try { localStorage.setItem(REACT, on ? "1" : "0"); } catch { /* ignore */ }
  if (!on) setScapeMood("quiet");
}

/** Colours an already-playing soundscape. Never starts audio. */
export function RadioHost() {
  const track = useNowPlaying();
  useEffect(() => { if (radioFollows()) setScapeMood(track.mood); }, [track.mood]);
  return null;
}

export function PlayingChip() {
  const track = useNowPlaying();
  return <>
    <i className={`np-disc mood-${track.mood}`} aria-hidden="true" />
    <span className="wg-trunc">{track.id ? track.title : "Quiet"}</span>
    {track.waiting > 0 && <em className="wg-badge">{track.waiting}</em>}
  </>;
}

export function PlayingTile({ ctx }: { ctx: WidgetCtx }) {
  const crew = useLive((s) => s.crew);
  const track = nowPlaying(crew.runs, crew.approvals, crew.members);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!track.id) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [track.id]);
  const age = trackAge(track.startedAt, now);
  const skip = nextTrack(crew.runs, crew.approvals, track.id);
  const next = skip && (crew.runs[skip.id] ?? null);
  const run = track.id ? crew.runs[track.id] : undefined;
  const art = albumOf(run, crew.members, crew.ventures);
  const stoppable = track.id && ["running", "planning", "queued"].includes(track.status);
  const cost = track.costUsd != null ? `$${track.costUsd.toFixed(2)}` : "";
  const stop = async () => {
    if (!track.id || busy) return;
    setBusy(true);
    try { await cancelRun(track.id); } finally { setBusy(false); }
  };
  return <div className={`np-player mood-${track.mood}`}>
    <button type="button" className="np-art" aria-hidden="true" tabIndex={-1} onClick={() => track.id && ctx.go(`/sessions/${track.id}`)}>
      {art ? <span className="np-cover" style={{ "--c": art.color } as React.CSSProperties}><Glyph name={art.emoji} label={art.label} size={22} /></span>
        : <i className={`np-disc mood-${track.mood} is-lg`} />}
    </button>
    <div className="np-meta">
      <small>{track.id ? track.label : "Now playing"}{age ? ` · ${age}` : ""}{cost ? ` · ${cost}` : ""}{track.waiting ? ` · ${track.waiting} waiting` : ""}</small>
      <strong>{track.title}</strong>
      <span>{track.who || (track.id ? "the crew" : "nothing on")}{next ? ` · next ${next.title || "up"}` : ""}</span>
    </div>
    <div className="np-controls">
      {stoppable && <button type="button" className="tb-btn" disabled={busy} onClick={() => void stop()} title="Stop this session"><Square size={12} /> Stop</button>}
      {skip && <button type="button" className="tb-btn" onClick={() => ctx.go(crew.runs[skip.id] ? `/sessions/${skip.id}` : "/activity")} title="What's next"><SkipForward size={12} /> Next</button>}
      {track.id && <button type="button" className="tb-btn" onClick={() => ctx.go(`/sessions/${track.id}`)}>Open</button>}
      <button type="button" className="tb-btn" onClick={() => ctx.go("/studio")}>Studio</button>
    </div>
  </div>;
}
