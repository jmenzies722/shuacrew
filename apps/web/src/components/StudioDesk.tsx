import { useEffect, useState } from "react";
import { Disc3, Headphones, ListMusic, MicOff, SkipForward, Square, Volume2 } from "lucide-react";
import { cancelRun, launchRun } from "../lib/api";
import { useLive } from "../lib/live";
import { nextTrack, nowPlaying, trackAge } from "../lib/now-playing";
import { playScape, stopScape, useScape } from "../lib/soundscape";
import { useLook } from "../lib/look";
import { Glyph } from "../lib/glyphs";
import {
  albumOf, channelOpen, masterLevel, mixChannels, setHeadline, todaysSet, toggleMute, toggleSolo, useMix,
} from "../lib/studio";
import { budgetUse, getWorkspace, saveWorkspace, useWorkspace } from "../lib/workspace-prefs";
import { radioFollows, setRadioFollows, useNowPlaying } from "./NowPlaying";
import type { WidgetCtx } from "./TopBarWidgets";
import "./studio-desk.css";
import { localDay } from "@shuacrew/core/projections";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function PlayingHero({ ctx }: { ctx: WidgetCtx }) {
  const crew = useLive((s) => s.crew);
  const track = nowPlaying(crew.runs, crew.approvals, crew.members);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!track.id) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [track.id]);
  const run = track.id ? crew.runs[track.id] : undefined;
  const art = albumOf(run, crew.members, crew.ventures);
  const age = trackAge(track.startedAt, now);
  const skip = nextTrack(crew.runs, crew.approvals, track.id);
  const stoppable = track.id && ["running", "planning", "queued"].includes(track.status);
  const cost = track.costUsd != null ? `$${track.costUsd.toFixed(2)}` : track.tokens ? compact.format(track.tokens) : "";
  const stop = async () => {
    if (!track.id || busy) return;
    setBusy(true);
    try { await cancelRun(track.id); } finally { setBusy(false); }
  };
  return <div className={`sd-hero mood-${track.mood}`}>
    <button type="button" className="sd-sleeve" onClick={() => track.id && ctx.go(`/sessions/${track.id}`)} aria-label={track.id ? `Open ${track.title}` : "Nothing on"}>
      {art ? <span className="sd-cover" style={{ "--c": art.color } as React.CSSProperties}><Glyph name={art.emoji} label={art.label} size={28} /></span>
        : <i className={`np-disc mood-${track.mood} is-lg`} />}
    </button>
    <div className="sd-hero-meta">
      <small>{track.label}{age ? ` · ${age}` : ""}{cost ? ` · ${cost}` : ""}{track.tool ? ` · ${track.tool}` : ""}</small>
      <strong>{track.title}</strong>
      <span>{track.who || (track.id ? "the crew" : "nothing on")}{art ? ` · ${art.label}` : ""}</span>
    </div>
    <div className="sd-hero-acts">
      {stoppable && <button type="button" className="tb-btn" disabled={busy} onClick={() => void stop()}><Square size={12} /> Stop</button>}
      {skip && <button type="button" className="tb-btn" onClick={() => ctx.go(crew.runs[skip.id] ? `/sessions/${skip.id}` : "/activity")}><SkipForward size={12} /> Next</button>}
      {track.id && <button type="button" className="tb-btn" onClick={() => ctx.go(`/sessions/${track.id}`)}>Open</button>}
    </div>
  </div>;
}

export function MixDesk({ ctx, compact: slim }: { ctx: WidgetCtx; compact?: boolean }) {
  const crew = useLive((s) => s.crew);
  const prefs = useMix();
  const workspace = useWorkspace();
  const channels = mixChannels(crew.members, crew.runs);
  const today = crew.today.day === localDay() ? crew.today : { tokens: 0, costUsd: null, runs: 0 };
  const master = masterLevel(today.tokens, workspace.dailyTokenBudget);
  const used = budgetUse(today.tokens, workspace.dailyTokenBudget);
  const [cue, setCue] = useState("");
  const [error, setError] = useState("");
  const open = channels.find((c) => channelOpen(c.id, prefs));
  const ask = async (member: string) => {
    const text = cue.trim(); if (!text) return;
    setError("");
    try {
      const ws = getWorkspace();
      const r = await launchRun({ ask: text, member, runtime: ws.runtime || undefined, model: ws.model || undefined, effort: ws.effort || undefined });
      setCue("");
      ctx.go(`/sessions/${r.id}`);
    } catch (e) { setError((e as Error).message); }
  };
  if (!channels.length) return <p className="tb-foot">No crew yet. Add someone on Crew and they get a channel here.</p>;
  return <div className={`sd-mix ${slim ? "is-compact" : ""}`}>
    <header className="wg-head">
      <strong>Mix</strong>
      <span>{channels.filter((c) => c.status !== "idle").length ? `${channels.filter((c) => c.status !== "idle").length} live` : "all quiet"}{master.hot ? " · too hot" : ""}</span>
    </header>
    <div className="sd-master" data-hot={master.hot || undefined}>
      <span>Master</span>
      <i><b style={{ width: `${Math.min(100, used * 100)}%` }} /></i>
      <small>{workspace.dailyTokenBudget ? `${compact.format(today.tokens)} / ${compact.format(workspace.dailyTokenBudget)}` : today.costUsd != null ? `$${today.costUsd.toFixed(2)} today` : today.tokens ? `${compact.format(today.tokens)} today · no budget` : "no spend yet"}</small>
    </div>
    {master.hot && <p className="sd-hot">Past 85% of today's budget. Stop a track or raise the budget — the fader does not lie.</p>}
    <ol className="sd-channels">
      {channels.map((c) => {
        const muted = prefs.muted.includes(c.id);
        const solo = prefs.solo === c.id;
        const open = channelOpen(c.id, prefs);
        return <li key={c.id} className={`sd-ch is-${c.status} ${muted ? "is-muted" : ""} ${solo ? "is-solo" : ""} ${!open ? "is-closed" : ""}`}>
          <button type="button" className="sd-ch-face" onClick={() => c.runId ? ctx.go(`/sessions/${c.runId}`) : ctx.go("/crew")} style={{ "--c": c.color } as React.CSSProperties}>
            <span className="sd-ch-orb"><Glyph name={c.emoji} label={c.name} size={14} /></span>
            <span className="sd-ch-meta"><b>{c.name}</b><small>{c.status === "idle" ? c.role || "standing by" : c.title}</small></span>
          </button>
          <div className="sd-vu" aria-hidden="true"><i style={{ height: `${Math.max(c.status === "idle" ? 4 : 18, c.level * 100)}%` }} /></div>
          <div className="sd-ch-acts">
            <button type="button" className={muted ? "is-on" : ""} title={muted ? "Unmute — they'll take new work again" : "Mute — don't hand them new work"} onClick={() => toggleMute(c.id)}><MicOff size={11} /></button>
            <button type="button" className={solo ? "is-on" : ""} title={solo ? "Clear solo" : "Solo — only they take new work"} onClick={() => toggleSolo(c.id)}><Headphones size={11} /></button>
          </div>
          <small className="sd-ch-spend tabular-nums">{c.costUsd != null ? `$${c.costUsd.toFixed(2)}` : c.tokens ? compact.format(c.tokens) : "—"}</small>
        </li>;
      })}
    </ol>
    {!slim && <>
      <form className="sd-cue" onSubmit={(e) => { e.preventDefault(); if (open) void ask(open.id); }}>
        <input value={cue} onChange={(e) => setCue(e.target.value)} placeholder={open ? `Cue ${open.name}…` : "Every channel is muted"} aria-label="Cue a track" />
        <button type="submit" className="tb-btn" disabled={!cue.trim() || !open}>Cue</button>
      </form>
      {error && <p className="tb-foot" style={{ color: "var(--bad)" }}>{error}</p>}
      <div className="sd-presets">
        <button type="button" className="tb-btn" onClick={() => saveWorkspace({ effort: "high", autopilot: false, task: true })}>Deep work</button>
        <button type="button" className="tb-btn" onClick={() => saveWorkspace({ runtime: "claude", model: "claude-haiku-4-5", effort: "low", autopilot: false })}>Cheap research</button>
        <button type="button" className="tb-btn" onClick={() => saveWorkspace({ effort: "max", autopilot: false, task: true })}>Ship tonight</button>
      </div>
      <p className="tb-foot">Presets set how the next cue starts. Mute blocks a named handoff; solo pins new launches to that member. A run that's already on keeps playing until you stop it.</p>
    </>}
  </div>;
}

export function Setlist({ ctx, compact: slim }: { ctx: WidgetCtx; compact?: boolean }) {
  const crew = useLive((s) => s.crew);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const items = todaysSet(crew.runs, crew.approvals, crew.members, crew.plays, now);
  const waiting = Object.keys(crew.approvals).length;
  const go = (id: string, kind: string) => ctx.go(kind === "play" ? `/plays/${id}` : `/sessions/${id}`);
  return <div className={`sd-set ${slim ? "is-compact" : ""}`}>
    <header className="wg-head"><strong>Tonight's set</strong><span>{setHeadline(items, waiting)}</span></header>
    {!items.length && <p className="tb-foot">House lights down. Start a session and it becomes the first track.</p>}
    <ol>{items.slice(0, slim ? 6 : 12).map((i, n) => <li key={`${i.kind}:${i.id}`}>
      <button type="button" className={`sd-track is-${i.kind}`} onClick={() => go(i.id, i.kind)}>
        <em>{String(n + 1).padStart(2, "0")}</em>
        <span><b>{i.title}</b><small>{i.who}{i.kind === "needs-you" ? " · needs you" : i.kind === "finished" ? ` · ${i.status}` : ""}</small></span>
      </button>
    </li>)}</ol>
    {!slim && <button type="button" className="tb-btn wg-more" onClick={() => ctx.go("/activity")}>The rest of today</button>}
  </div>;
}

export function RadioStrip() {
  const { sounds } = useLook();
  const on = useScape();
  const [follow, setFollow] = useState(radioFollows);
  const put = (scape: typeof on) => { if (scape === "off") stopScape(); else playScape(scape, sounds.volume); };
  return <div className="sd-radio">
    <Volume2 size={13} />
    <span>Radio</span>
    {(["off", "brown", "rain", "cafe"] as const).map((s) => <button key={s} type="button" className={on === s ? "is-on" : ""} onClick={() => put(s)}>{s === "off" ? "quiet" : s}</button>)}
    <button type="button" className={follow ? "is-on" : ""} onClick={() => { const next = !follow; setRadioFollows(next); setFollow(next); }} title="Colour the bed from what's on. Never starts audio.">follow the crew</button>
  </div>;
}

export function MixChip() {
  const crew = useLive((s) => s.crew);
  const n = mixChannels(crew.members, crew.runs).filter((c) => c.status !== "idle").length;
  return <><Disc3 size={14} className={n ? "wg-live" : ""} /><span className="tabular-nums">{n}</span></>;
}

export function SetlistChip() {
  const crew = useLive((s) => s.crew);
  const track = useNowPlaying();
  const n = todaysSet(crew.runs, crew.approvals, crew.members, crew.plays, Date.now()).length;
  return <><ListMusic size={14} /><span className="wg-trunc">{track.id ? track.title : n ? `${n} cued` : "Set"}</span></>;
}
