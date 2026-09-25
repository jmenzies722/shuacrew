import type { AnyEvent } from "@shuacrew/core/events";
import { ChevronLeft, ChevronRight, Copy, Pause, Play, Radio, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cinemaCuts, runRecap, skipToFight } from "../lib/studio";

const SPEEDS = [1, 4, 12];

/** What an event was, in a few words — the replay's caption. */
function caption(e?: AnyEvent): string {
  if (!e) return "";
  const b = e.body as Record<string, unknown>;
  switch (e.kind) {
    case "run.created":
      return "Session started";
    case "turn.started":
      return `Turn ${b.turn}: ${String(b.text ?? "").slice(0, 60)}`;
    case "tool.called":
      return `Called ${b.tool}`;
    case "tool.returned":
      return b.ok ? "Tool finished" : "Tool failed";
    case "file.changed":
      return `Changed ${String(b.path ?? "").split("/").pop()}`;
    case "check.ran":
      return `Ran ${b.command}`;
    case "approval.requested":
      return `Asked to use ${b.tool}`;
    case "approval.decided":
      return b.allow ? "Allowed" : "Denied";
    case "agent.message":
      return b.final ? "Answered" : "Wrote";
    case "agent.delta":
      return "Writing…";
    case "agent.thinking":
      return "Thinking";
    case "subagent.started":
      return `Delegated to ${b.name}`;
    case "turn.completed":
      return "Turn finished";
    case "run.status":
      return `Now ${b.status}`;
    default:
      return e.kind.replace(/\./g, " ");
  }
}

/**
 * Time travel through a session: the thread above shows it as it was at the step you're on.
 * ←/→ step, space plays, Esc returns to live. Nothing about the session changes.
 */
export function ReplayBar({ events, at, onChange, onClose, title = "" }: { events: AnyEvent[]; at: number | null; onChange: (seq: number | null) => void; onClose: () => void; title?: string }) {
  const seqs = useMemo(() => events.map((e) => e.seq), [events]);
  const turns = useMemo(() => events.flatMap((e, i) => (e.kind === "turn.started" ? [i] : [])), [events]);
  const cuts = useMemo(() => cinemaCuts(events), [events]);
  const fight = useMemo(() => skipToFight(events), [events]);
  const index = at === null ? seqs.length - 1 : Math.max(0, seqs.indexOf(at));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const indexRef = useRef(index);
  indexRef.current = index;
  const go = (i: number) => {
    const clamped = Math.max(0, Math.min(seqs.length - 1, i));
    onChange(clamped >= seqs.length - 1 ? null : seqs[clamped]!);
  };

  // Start from the beginning if you press play at the live edge.
  useEffect(() => {
    if (!playing) return;
    if (indexRef.current >= seqs.length - 1) go(0);
    const timer = setInterval(() => {
      if (indexRef.current >= seqs.length - 1) {
        setPlaying(false);
        return;
      }
      go(indexRef.current + 1);
    }, 1000 / (3 * speed));
    return () => clearInterval(timer);
  }, [playing, speed, seqs.length]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName) && target.getAttribute("type") !== "range") return;
      if (e.key === "Escape") (e.preventDefault(), onClose());
      if (e.key === "ArrowLeft") (e.preventDefault(), setPlaying(false), go(indexRef.current - 1));
      if (e.key === "ArrowRight") (e.preventDefault(), setPlaying(false), go(indexRef.current + 1));
      if (e.key === " ") (e.preventDefault(), setPlaying((p) => !p));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [seqs.length]);

  const event = events[index];
  const pct = seqs.length > 1 ? (index / (seqs.length - 1)) * 100 : 100;
  const live = at === null;
  return (
    <motion.div className="replay" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 36 }} role="region" aria-label="Replay">
      <div className="flex items-center gap-1.5">
        <button className="replay-btn" onClick={() => (setPlaying(false), go(index - 1))} aria-label="Step back" title="Step back (←)">
          <ChevronLeft size={15} />
        </button>
        <button className="replay-btn is-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"} title="Play / pause (space)">
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        </button>
        <button className="replay-btn" onClick={() => (setPlaying(false), go(index + 1))} aria-label="Step forward" title="Step forward (→)">
          <ChevronRight size={15} />
        </button>
        <button className="replay-speed" onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]!)} title="Speed">
          {speed}×
        </button>
        <div className="replay-track">
          <div className="replay-fill" style={{ width: `${pct}%` }} />
          {turns.map((i) => (
            <span key={i} className="replay-tick" style={{ left: `${seqs.length > 1 ? (i / (seqs.length - 1)) * 100 : 0}%` }} />
          ))}
          {cuts.map((c) => {
            const i = seqs.indexOf(c.seq);
            if (i < 0) return null;
            return <i key={c.seq} className={`replay-cut is-${c.kind}`} title={c.label} style={{ left: `${seqs.length > 1 ? (i / (seqs.length - 1)) * 100 : 0}%` }} />;
          })}
          <input type="range" min={0} max={Math.max(0, seqs.length - 1)} value={index} onChange={(e) => (setPlaying(false), go(Number(e.target.value)))} aria-label="Scrub through this session" />
        </div>
        <span className="mono w-[74px] shrink-0 text-right text-[11px] tabular-nums text-fg-3">
          {index + 1} / {seqs.length}
        </span>
        <button className="replay-btn" onClick={onClose} aria-label="Close replay" title="Close (Esc)">
          <X size={14} />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2 px-1 text-[12px]">
        {live ? (
          <span className="flex items-center gap-1.5 text-ok">
            <Radio size={12} /> Live
          </span>
        ) : (
          <span className="mono text-[11px] text-fg-3">{event ? new Date(event.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : ""}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-fg-2">{caption(event)}</span>
        {fight != null && <button className="replay-fight" type="button" onClick={() => (setPlaying(false), onChange(fight))} title="Skip to the first failure or deny">Skip to the fight</button>}
        <RecapButton events={events} title={title} />
        {!live && (
          <button className="text-[12px] font-medium text-fg hover:underline" onClick={() => (setPlaying(false), onChange(null))}>
            Back to live
          </button>
        )}
      </div>
    </motion.div>
  );
}

function RecapButton({ events, title }: { events: AnyEvent[]; title: string }) {
  const [copied, setCopied] = useState(false);
  return <button className="replay-fight" type="button" title="Copy a 30-second recap" onClick={() => {
    void navigator.clipboard.writeText(runRecap(events, title)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  }}><Copy size={11} /> {copied ? "Copied" : "Recap"}</button>;
}
