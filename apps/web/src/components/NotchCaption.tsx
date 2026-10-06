import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CaptionLine } from "../lib/buddy-voice";
import { prose } from "../lib/plain";

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
/**
 * Text in the notch, a few whole lines tall: anchored to the newest words, so when a new line starts the others glide
 * up rather than jump, and the oldest line fades out (only once there's more above it). Never a line cut in half.
 */
export function Rolling({ className = "", lines = 3, children }: { className?: string; lines?: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null), text = useRef<HTMLParagraphElement>(null), height = useRef(0);
  const [full, setFull] = useState(false);
  useLayoutEffect(() => {
    const b = box.current, t = text.current; if (!b || !t) return;
    const h = t.offsetHeight, grew = height.current && h > height.current ? h - height.current : 0; height.current = h;
    const over = h > b.clientHeight + 1; if (over !== full) setFull(over);
    if (grew && over && !calm()) { // FLIP: start where the lines were, then glide up into place
      t.style.transition = "none"; t.style.transform = `translateY(${grew}px)`; void t.offsetHeight;
      t.style.transition = "transform .3s cubic-bezier(.3, .7, .3, 1)"; t.style.transform = "";
    }
  });
  return <div ref={box} className={`notch-roll ${full ? "is-full" : ""} ${className}`} style={{ "--lines": lines } as CSSProperties} aria-live="polite"><p ref={text}>{children}</p></div>;
}

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
export function NotchCaption({ line, lines = 3 }: { line: CaptionLine | null; lines?: number }) {
  const [chain, setChain] = useState<Said[]>([]), [shown, setShown] = useState(0);
  const chainRef = useRef<Said[]>([]), timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!line) { const t = setTimeout(() => { chainRef.current = []; setChain([]); setShown(0); }, 1100); return () => clearTimeout(t); } // after the island tucks away (it lingers 0.9 s)
    const c = chainRef.current, last = c.at(-1), same = last?.key === line.key;
    const start = same ? last.start : performance.now();
    // The same sentence again means its real length just arrived: re-time the words still to come, not start over.
    const next = same ? [...c.slice(0, -1), { ...line, start }] : [...c, { ...line, start }].slice(-8);
    chainRef.current = next; setChain(next);
    if (!same) setShown(0);
    timers.current.forEach(clearTimeout);
    const elapsed = performance.now() - start;
    const said = prose(line.text); // timed on the words actually shown
    timers.current = fitTimes(revealTimes(said, line.speed), said, line.speed, line.durationMs)
      .map((at, i) => setTimeout(() => setShown((s) => Math.max(s, i + 1)), Math.max(0, at - elapsed)));
  }, [line]);
  if (!chain.length) return null;
  const current = chain.at(-1)!, words = prose(current.text).split(/\s+/).filter(Boolean);
  return <Rolling className="notch-caption" lines={lines}>
    {chain.slice(0, -1).map((s) => <span key={s.key} className="is-past">{prose(s.text)} </span>)}
    <span key={current.key}>{words.map((w, i) => <span key={i} className={i < shown ? "is-said" : "is-next"}>{w} </span>)}</span>
  </Rolling>;
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
/** Where a spoken sentence starts among the reply's words, at or after `from` (first two words must match). */
export function sentenceStart(words: string[], sentence: string[], from: number): number {
  const a = norm(sentence[0] ?? ""), b = norm(sentence[1] ?? "");
  if (!a) return -1;
  for (let i = Math.max(0, from); i < words.length; i++) {
    if (norm(words[i]!) === a && (!b || i + 1 >= words.length || norm(words[i + 1]!) === b)) return i;
  }
  return -1;
}

/**
 * The reply in the notch as ONE continuous surface. It streams in as it's written; when Shua starts speaking, nothing
 * is swapped out — the words already said brighten in place and the rest wait, softly, a few words ahead. (It used
 * to replace the streamed paragraph with a fresh word-by-word caption of sentence one: the text you were reading
 * vanished and started over.) A spoken line that isn't part of this reply falls back to the plain caption.
 */
export function SpokenReply({ text, line, streaming = false, lines = 3 }: { text: string; line: CaptionLine | null; streaming?: boolean; lines?: number }) {
  const words = prose(text).split(/\s+/).filter(Boolean);
  const [said, setSaid] = useState(0);
  const starts = useRef(new Map<number, { word: number; at: number }>()), timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const [lost, setLost] = useState(false);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    timers.current.forEach(clearTimeout); timers.current = [];
    if (!line) return;
    const spoken = prose(line.text), sentence = spoken.split(/\s+/).filter(Boolean);
    // The same sentence again means its real length just arrived: keep its place and its start, re-time what's left.
    let mark = starts.current.get(line.key);
    if (!mark) { mark = { word: sentenceStart(words, sentence, Math.max(0, said - 3)), at: performance.now() }; starts.current.set(line.key, mark); }
    const { word: start, at: began } = mark;
    if (start < 0) { setLost(true); return; }
    setLost(false);
    setSaid((s) => Math.max(s, start));
    timers.current = fitTimes(revealTimes(spoken, line.speed), spoken, line.speed, line.durationMs)
      .map((at, i) => setTimeout(() => setSaid((s) => Math.max(s, start + i + 1)), Math.max(0, at - (performance.now() - began))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);
  if (line && lost) return <NotchCaption line={line} lines={lines} />;
  const speaking = !!line;
  // Speaking: the view follows the voice (what's been said, and a dozen words ahead). Otherwise: everything so far.
  const shown = speaking ? words.slice(0, Math.min(words.length, said + 12)) : words;
  return <Rolling className="notch-caption is-reply" lines={lines}>
    {shown.map((w, i) => <span key={i} className={!speaking || i < said ? "is-said" : "is-next"}>{w} </span>)}
    {streaming && <i className="notch-caret" />}
  </Rolling>;
}
