/**
 * The notch island's live activities: only what's happening right now, each gone the moment it ends — the song
 * playing (with artwork and transport), a mission, a task Spark is doing for you (approve, let it run, stop), a guided
 * step, the radio, a focus block, and crew at work or decisions waiting.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AudioLines, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { radioCommand, radioNow, type RadioNow } from "../../lib/radio";
import { remainingFocusMs, setFocus } from "../../lib/focus-timer";
import { describeAct, type Act, type GuideStep } from "../../lib/buddy";
import type { Mission } from "../../lib/missions";
import { post } from "./bridge";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
/**
 * Scrub the song: drag (or tap, or ←/→ for 10 s) anywhere on the line. Between the Mac's position checks the time runs
 * on locally, so the line moves smoothly; right after a seek, stale positions from the Mac are ignored so it never
 * jumps back.
 */
function Scrubber({ tab, position, duration, playing, onSeek, onHold }: { tab: 0 | -1; position: number; duration: number; playing: boolean; onSeek: (s: number) => void; onHold: (dragging: boolean) => void }) {
  const [drag, setDrag] = useState<number | null>(null), [base, setBase] = useState({ pos: position, at: performance.now() }), [, tick] = useState(0);
  const track = useRef<HTMLDivElement>(null), seekedAt = useRef(0);
  useEffect(() => { if (performance.now() - seekedAt.current > 2500) setBase({ pos: position, at: performance.now() }); }, [position]);
  // Only ticks while you can see it (the island is open): tucked in, the time isn't shown, so it costs nothing.
  const visible = tab === 0;
  useEffect(() => { if (!playing || drag !== null || !visible) return; const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, [playing, drag, visible]);
  // Mid-drag the island stays open even if the pointer wanders out of it; let go and it tucks in as usual.
  const dragging = drag !== null;
  useEffect(() => { onHold(dragging); }, [dragging, onHold]);
  useEffect(() => () => onHold(false), [onHold]);
  const live = drag ?? Math.min(duration, base.pos + (playing ? (performance.now() - base.at) / 1000 : 0));
  const pct = Math.min(100, (live / duration) * 100);
  const at = (x: number) => { const r = track.current!.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)) * duration; };
  const seek = (s: number) => { seekedAt.current = performance.now(); setBase({ pos: s, at: performance.now() }); onSeek(s); };
  return <div className="nook-scrub">
    <div ref={track} className={`nook-scrub-track ${drag !== null ? "is-drag" : ""}`} role="slider" tabIndex={tab} aria-label="Song position"
      aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(live)} aria-valuetext={`${clock(live)} of ${clock(duration)}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag(at(e.clientX)); }}
      onPointerMove={(e) => { if (drag !== null) setDrag(at(e.clientX)); }}
      onPointerUp={(e) => { if (drag === null) return; setDrag(null); seek(at(e.clientX)); }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => { const d = e.key === "ArrowRight" ? 10 : e.key === "ArrowLeft" ? -10 : 0; if (d) { e.preventDefault(); seek(Math.max(0, Math.min(duration - 1, live + d))); } }}>
      <span><i style={{ width: `${pct}%` }} /></span><b style={{ left: `${pct}%` }} />
    </div>
    <small>{clock(live)}</small><small>-{clock(Math.max(0, duration - live))}</small>
  </div>;
}

export interface Media { app: string; playing: boolean; title: string; artist: string; position: number; duration: number; art: string }
export interface LiveActivitiesProps {
  tab: 0 | -1;
  showMedia: boolean; media: Media | null; mediaCmd: (c: "toggle" | "next" | "previous") => void; mediaSeek: (seconds: number) => void; scrubHold: (dragging: boolean) => void;
  activeMissions: Mission[]; runs: Record<string, { title?: string; status: string } | undefined>;
  task: { step: number } | null; pending: Act | null; guide: GuideStep | null; busy: boolean; working: boolean;
  runAct: (a: Act, step: number) => void; doAll: () => void; stopTask: (why?: string) => void; advance: () => void; stopGuide: () => void;
  radio: RadioNow; setRadio: (r: RadioNow) => void;
  timer: Parameters<typeof remainingFocusMs>[0] | null; now: number; focusPct: number;
  workingRuns: Array<{ id: string; title?: string }>; approvals: number;
}

export function LiveActivities(p: LiveActivitiesProps) {
  const { tab, showMedia, media, mediaCmd, mediaSeek, scrubHold, activeMissions, runs, task, pending, guide, busy, working, runAct, stopTask, advance, stopGuide, radio, setRadio, timer, now, focusPct, workingRuns, approvals } = p;
  return <>
          {showMedia && media && <div className="spark-nook-media" style={media.art ? { "--art": `url("${media.art.replace(/"/g, "%22")}")` } as CSSProperties : undefined}>
            {media.art ? <img src={media.art} alt="" /> : <i><AudioLines size={16} /></i>}
            <div className="spark-nook-media-text"><b>{media.title}</b><small>{[media.artist, media.app].filter(Boolean).join(" · ")}</small></div>
            <div className="spark-nook-ctl is-media">
              <button type="button" tabIndex={tab} onClick={() => mediaCmd("previous")} aria-label="Previous"><SkipBack size={12} /></button>
              <button type="button" tabIndex={tab} className="is-main" onClick={() => mediaCmd("toggle")} aria-label={media.playing ? "Pause" : "Play"}>{media.playing ? <Pause size={13} /> : <Play size={13} />}</button>
              <button type="button" tabIndex={tab} onClick={() => mediaCmd("next")} aria-label="Next"><SkipForward size={12} /></button>
            </div>
            {media.duration > 0 && <Scrubber key={`${media.app}:${media.title}`} tab={tab} position={media.position} duration={media.duration} playing={media.playing} onSeek={mediaSeek} onHold={scrubHold} />}
          </div>}
          {activeMissions.length > 0 && <button type="button" className="spark-nook-mission" tabIndex={tab} onClick={() => post({ type: "buddyOpen", path: `/sessions/${activeMissions.at(-1)!.run}` })}>
            <i className="is-live" /><span><small>Mission</small><b>{runs[activeMissions.at(-1)!.run]?.title ?? activeMissions.at(-1)!.task}</b></span><em>{runs[activeMissions.at(-1)!.run]?.status.replace("_", " ")}</em></button>}
          {/* What Spark is doing for you, driven from here: approve, let it run, or stop. */}
          {task && <div className="spark-nook-live is-task"><i className="is-crew">{task.step}</i><span><small>{pending ? "Can I?" : "Doing it"}</small><b>{pending ? describeAct(pending) : `Step ${task.step}`}</b></span>
            <div className="spark-nook-ctl">{pending && <><button type="button" className="is-go" tabIndex={tab} onClick={() => runAct(pending, task.step)}>Do it</button><button type="button" tabIndex={tab} title="Do the rest without asking" onClick={p.doAll}>All</button></>}
              <button type="button" tabIndex={tab} onClick={() => stopTask("Stopped.")}>Stop</button></div></div>}
          {guide && !task && <div className="spark-nook-live is-task"><i className="is-focus">{guide.step}</i><span><small>Step {guide.step}</small><b>{guide.label}</b></span>
            <div className="spark-nook-ctl"><button type="button" tabIndex={tab} disabled={busy || working} onClick={() => advance()}>Next</button><button type="button" tabIndex={tab} onClick={stopGuide}>Stop</button></div></div>}
          {/* Live activities: only what's happening right now; each one leaves when it ends. */}
          {radio.playing && !(showMedia && media?.playing) && <div className="spark-nook-live">
            <i className="is-radio"><AudioLines size={14} /></i><span><small>Radio</small><b>{radio.title ?? radio.station ?? "ShuaCrew Radio"}</b></span>
            <div className="spark-nook-ctl is-media"><button type="button" tabIndex={tab} className="is-main" onClick={() => void radioCommand({ cmd: "pause" }).then(() => radioNow().then(setRadio))} aria-label="Pause radio"><Pause size={13} /></button>
              <button type="button" tabIndex={tab} onClick={() => void radioCommand({ cmd: "next" })} aria-label="Next station track"><SkipForward size={12} /></button></div></div>}
          {timer && <div className="spark-nook-live">
            <i className="is-focus">{Math.ceil(remainingFocusMs(timer, now) / 60000)}</i><span><small>Focus</small><b>{Math.ceil(remainingFocusMs(timer, now) / 60000)} min left</b><span className="spark-nook-bar"><i style={{ width: `${focusPct * 100}%` }} /></span></span>
            <div className="spark-nook-ctl"><button type="button" tabIndex={tab} onClick={() => setFocus(null)}>End</button></div></div>}
          {(workingRuns.length > 0 || approvals > 0) && <div className="spark-nook-live">
            <i className={approvals ? "is-wait" : "is-crew"}>{approvals || workingRuns.length}</i><span><small>{approvals ? "Needs you" : "Crew working"}</small><b>{approvals ? `${approvals} decision${approvals === 1 ? "" : "s"} waiting` : workingRuns.at(-1)!.title || `${workingRuns.length} sessions`}</b></span>
            <div className="spark-nook-ctl">{approvals ? <button type="button" className="is-wait" tabIndex={tab} onClick={() => post({ type: "buddyOpen", path: "/activity" })}>Review</button>
              : <button type="button" tabIndex={tab} onClick={() => post({ type: "buddyOpen", path: `/sessions/${workingRuns.at(-1)!.id}` })}>Open</button>}</div></div>}
  </>;
}
