import { useEffect, useState } from "react";

/** Whole seconds since this component mounted, ticking once a second. */
export function useElapsed(): number {
  const [started] = useState(Date.now);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [started]);
  return elapsed;
}

export const formatElapsed = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

/** Past this, a plain "Thinking…" says it's still at it, so a long turn never reads as stuck. */
export const STILL_WORKING_AFTER = 20;

/** What the line says after `s` seconds: a specific label ("Reading your screen…") stays; plain thinking moves on. */
export const workingLabel = (label: string, s: number) => (s >= STILL_WORKING_AFTER && /^thinking/i.test(label) ? "Still working…" : label);

/**
 * Shua or an agent at work, said so it can't look stuck: the label, then how long it's been (from 2 s; the slot is
 * reserved from the first frame so nothing shifts), and past 20 s a plain "Thinking…" becomes "Still working…".
 */
export function WorkingFor({ label = "Thinking…" }: { label?: string }) {
  const s = useElapsed();
  return <>
    <span className="shimmer-text">{workingLabel(label, s)}</span>
    <time className="working-for" aria-hidden="true" style={{ visibility: s >= 2 ? "visible" : "hidden" }}>{formatElapsed(s)}</time>
  </>;
}
