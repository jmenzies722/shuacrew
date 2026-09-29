import { useEffect, useRef, useState } from "react";
import type { CaptionLine } from "../lib/buddy-voice";

/**
 * Live captions in the notch: the whole reply as a rolling transcript, word by word as Spark says it. Each sentence
 * arrives the moment its sound starts (SpeechQueue.onCaption) and joins the ones before it, so nothing is cut off; the
 * newest words stay in view and older lines fade out above. Words light up at an estimated pace, then re-time to the
 * sentence's real length as soon as the voice engine knows it.
 */
const CHARS_PER_SEC = 14.5; // a first guess at the voice's pace at speed 1, until the real length arrives
/** When each word should appear (ms from the sentence's first sound), with a beat after commas and full stops. */
export function revealTimes(text: string, speed = 1): number[] {
  const words = text.split(/\s+/).filter(Boolean), out: number[] = [];
  let t = 0;
  for (const w of words) {
    out.push(Math.round(t));
    t += ((w.length + 1) / (CHARS_PER_SEC * speed)) * 1000 + (/[.!?]$/.test(w) ? 260 : /[,;:]$/.test(w) ? 120 : 0);
  }
  return out;
}

/** Stretch or squeeze the estimate to the sentence's real length, so the last word lights just before it ends. */
export function fitTimes(times: number[], text: string, speed: number, durationMs?: number): number[] {
  const last = text.split(/\s+/).filter(Boolean).at(-1);
  if (!durationMs || !last || !times.length) return times;
  const estimate = times.at(-1)! + ((last.length + 1) / (CHARS_PER_SEC * speed)) * 1000;
  return times.map((t) => Math.round(t * (durationMs * 0.96) / estimate));
}

interface Said extends CaptionLine { start: number }
export function NotchCaption({ line }: { line: CaptionLine | null }) {
  const [chain, setChain] = useState<Said[]>([]), [shown, setShown] = useState(0);
  const chainRef = useRef<Said[]>([]), timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!line) { const t = setTimeout(() => { chainRef.current = []; setChain([]); setShown(0); }, 700); return () => clearTimeout(t); } // after the island tucks away
    const c = chainRef.current, last = c.at(-1), same = last?.key === line.key;
    const start = same ? last.start : performance.now();
    // The same sentence again means its real length just arrived: re-time the words still to come, not start over.
    const next = same ? [...c.slice(0, -1), { ...line, start }] : [...c, { ...line, start }].slice(-8);
    chainRef.current = next; setChain(next);
    if (!same) setShown(0);
    timers.current.forEach(clearTimeout);
    const elapsed = performance.now() - start;
    timers.current = fitTimes(revealTimes(line.text, line.speed), line.text, line.speed, line.durationMs)
      .map((at, i) => setTimeout(() => setShown((s) => Math.max(s, i + 1)), Math.max(0, at - elapsed)));
  }, [line]);
  if (!chain.length) return null;
  const current = chain.at(-1)!, words = current.text.split(/\s+/).filter(Boolean);
  return <div className="notch-caption" aria-live="polite">
    <p>{chain.slice(0, -1).map((s) => <span key={s.key} className="is-past">{s.text} </span>)}
      <span key={current.key}>{words.map((w, i) => <span key={i} className={i < shown ? "is-said" : "is-next"}>{w} </span>)}</span></p>
  </div>;
}
